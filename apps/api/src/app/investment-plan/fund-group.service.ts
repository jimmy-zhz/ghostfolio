import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { WHERE_ACCOUNT_NOT_EXCLUDED } from '@ghostfolio/api/helper/account.helper';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  TAG_ID_DRAFT,
  TAG_ID_EXCLUDE_FROM_ANALYSIS
} from '@ghostfolio/common/config';

import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { FundGroup, FundGroupKind, Prisma, Type } from '@prisma/client';

import {
  FUND_GROUP_ACTIVITY_TYPES,
  FundGroupChecks,
  FundGroupFigures,
  getFundGroupChecks,
  getMonthsLeft,
  getProgress,
  getRemainderPrincipal,
  toFundGroupData
} from './fund-group.helper';

type FundGroupWithTag = FundGroup & { tag: { id: string; name: string } };

export interface FundGroupsReport {
  checks: FundGroupChecks & {
    /** Value of all accounts minus the value of all sources */
    unassignedValueInBaseCurrency: number;
  };
  purposes: (FundGroupWithTag &
    FundGroupFigures & { monthsLeft: number | null; progress: number })[];
  sources: (FundGroupWithTag & FundGroupFigures & { gap: number | null })[];
  total: Pick<
    FundGroupFigures,
    'investment' | 'netPerformance' | 'valueInBaseCurrency'
  >;
}

/**
 * Request-scoped through PortfolioService, hence only for the controller and
 * never for a cron job
 */
@Injectable()
export class FundGroupService {
  public constructor(
    private readonly portfolioService: PortfolioService,
    private readonly prismaService: PrismaService
  ) {}

  public async deleteFundGroup({ id, planId }: { id: string; planId: string }) {
    await this.findFundGroupOfPlan({ id, planId });

    await this.prismaService.fundGroup.delete({ where: { id } });
  }

  public async getFundGroups(planId: string): Promise<FundGroupWithTag[]> {
    return this.prismaService.fundGroup.findMany({
      include: { tag: { select: { id: true, name: true } } },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      where: { planId }
    });
  }

  public async getReport({
    planId,
    userId
  }: {
    planId: string;
    userId: string;
  }): Promise<FundGroupsReport> {
    const fundGroups = await this.getFundGroups(planId);

    const [total, ...figuresOfFundGroups] = await Promise.all([
      this.getFigures({ userId }),
      ...fundGroups.map(({ tagId }) => {
        return this.getFigures({ tagId, userId });
      })
    ]);

    const withFigures = fundGroups.map((fundGroup, index) => {
      return { ...fundGroup, ...figuresOfFundGroups[index] };
    });

    const sources = withFigures.filter(({ kind }) => {
      return kind === FundGroupKind.SOURCE;
    });

    const purposes = withFigures.filter(({ kind }) => {
      return kind === FundGroupKind.PURPOSE;
    });

    const remainderPrincipal = getRemainderPrincipal({
      principals: sources
        .filter(({ isRemainder }) => {
          return !isRemainder;
        })
        .map(({ principal }) => {
          return principal;
        }),
      totalInvestment: total.investment
    });

    const checks = getFundGroupChecks({
      activities: await this.getCheckActivities(userId),
      purposes: purposes.map(({ id, tagId }) => {
        return { id, tagId };
      }),
      sourceTagIds: sources.map(({ tagId }) => {
        return tagId;
      })
    });

    return {
      checks: {
        ...checks,
        unassignedValueInBaseCurrency:
          sources.length > 0
            ? total.valueInBaseCurrency -
              sources.reduce((sum, { valueInBaseCurrency }) => {
                return sum + valueInBaseCurrency;
              }, 0)
            : 0
      },
      purposes: purposes.map((purpose) => {
        return {
          ...purpose,
          monthsLeft: getMonthsLeft({ targetDate: purpose.targetDate }),
          progress: getProgress(purpose)
        };
      }),
      sources: sources.map((source) => {
        const principal = source.isRemainder
          ? remainderPrincipal
          : source.principal;

        return {
          ...source,
          principal,
          gap: principal === null ? null : principal - source.investment
        };
      }),
      total: {
        investment: total.investment,
        netPerformance: total.netPerformance,
        valueInBaseCurrency: total.valueInBaseCurrency
      }
    };
  }

  public async upsertFundGroup({
    body,
    planId,
    userId
  }: {
    body: Record<string, unknown>;
    planId: string;
    userId: string;
  }) {
    const data = toFundGroupData(body);
    const id = typeof body.id === 'string' ? body.id : undefined;

    if (id) {
      await this.findFundGroupOfPlan({ id, planId });
    }

    // System tags change how an activity is treated, hence own tags only
    const tag = await this.prismaService.tag.findFirst({
      select: { id: true },
      where: { userId, id: data.tagId }
    });

    if (!tag) {
      throw new BadRequestException('tagId must be one of your own tags');
    }

    const otherFundGroups = await this.prismaService.fundGroup.findMany({
      select: { isRemainder: true, tagId: true },
      where: { planId, ...(id ? { id: { not: id } } : {}) }
    });

    if (
      otherFundGroups.some(({ tagId }) => {
        return tagId === data.tagId;
      })
    ) {
      throw new BadRequestException('The tag belongs to another fund group');
    }

    if (
      data.isRemainder &&
      otherFundGroups.some(({ isRemainder }) => {
        return isRemainder;
      })
    ) {
      throw new BadRequestException('There is already a remainder source');
    }

    return id
      ? this.prismaService.fundGroup.update({ data, where: { id } })
      : this.prismaService.fundGroup.create({ data: { ...data, planId } });
  }

  private async findFundGroupOfPlan({
    id,
    planId
  }: {
    id: string;
    planId: string;
  }) {
    const fundGroup = await this.prismaService.fundGroup.findFirst({
      select: { id: true },
      where: { id, planId }
    });

    if (!fundGroup) {
      throw new NotFoundException(`Fund group ${id} not found`);
    }
  }

  /**
   * The investment activities as the portfolio calculation sees them: no
   * drafts, nothing excluded from the analysis
   */
  private async getCheckActivities(userId: string) {
    const where: Prisma.OrderWhereInput = {
      userId,
      OR: [{ account: null }, { account: WHERE_ACCOUNT_NOT_EXCLUDED }],
      tags: {
        none: { id: { in: [TAG_ID_DRAFT, TAG_ID_EXCLUDE_FROM_ANALYSIS] } }
      },
      type: { in: [...FUND_GROUP_ACTIVITY_TYPES] as Type[] }
    };

    const activities = await this.prismaService.order.findMany({
      orderBy: { date: 'desc' },
      select: {
        account: { select: { name: true } },
        date: true,
        id: true,
        quantity: true,
        SymbolProfile: { select: { symbol: true } },
        tags: { select: { id: true } },
        type: true
      },
      where
    });

    return activities.map(
      ({ account, date, id, quantity, SymbolProfile, tags, type }) => {
        return {
          date,
          id,
          quantity,
          type,
          accountName: account?.name,
          symbol: SymbolProfile.symbol,
          tagIds: tags.map((tag) => {
            return tag.id;
          })
        };
      }
    );
  }

  private async getFigures({
    tagId,
    userId
  }: {
    tagId?: string;
    userId: string;
  }): Promise<FundGroupFigures> {
    const { accounts, holdings, summary } =
      await this.portfolioService.getDetails({
        userId,
        dateRange: 'max',
        filters: tagId ? [{ id: tagId, type: 'TAG' }] : undefined,
        withSummary: true
      });

    return {
      accounts: Object.entries(accounts)
        .map(([id, { name, valueInBaseCurrency }]) => {
          return { id, name, valueInBaseCurrency };
        })
        .filter(({ valueInBaseCurrency }) => {
          return valueInBaseCurrency !== 0;
        }),
      holdings: holdings
        .map(({ assetProfile: { name, symbol }, valueInBaseCurrency }) => {
          return {
            name,
            symbol,
            valueInBaseCurrency: valueInBaseCurrency ?? 0
          };
        })
        .sort((a, b) => {
          return b.valueInBaseCurrency - a.valueInBaseCurrency;
        }),
      investment: summary?.totalInvestment ?? 0,
      netPerformance: summary?.netPerformanceWithCurrencyEffect ?? 0,
      netPerformancePercent:
        summary?.netPerformancePercentageWithCurrencyEffect ?? 0,
      valueInBaseCurrency: summary?.currentValueInBaseCurrency ?? 0
    };
  }
}
