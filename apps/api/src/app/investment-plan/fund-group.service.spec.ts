import type { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import type { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { FundGroupService } from './fund-group.service';

function details({ investment, value }: { investment: number; value: number }) {
  return {
    accounts: {
      tfsa: { name: 'TFSA', valueInBaseCurrency: value },
      unused: { name: 'Unused', valueInBaseCurrency: 0 }
    },
    holdings: [
      {
        assetProfile: { name: 'iShares Core S&P 500', symbol: 'XUS.TO' },
        valueInBaseCurrency: value
      }
    ],
    summary: {
      currentValueInBaseCurrency: value,
      netPerformancePercentageWithCurrencyEffect:
        (value - investment) / investment,
      netPerformanceWithCurrencyEffect: value - investment,
      totalInvestment: investment
    }
  };
}

describe('FundGroupService', () => {
  function setup({
    fundGroups = [],
    fundGroupOfPlan = true,
    otherFundGroups = [],
    ownTag = true
  }: {
    fundGroups?: unknown[];
    fundGroupOfPlan?: boolean;
    otherFundGroups?: unknown[];
    ownTag?: boolean;
  } = {}) {
    const prisma = {
      fundGroup: {
        create: jest.fn().mockResolvedValue({ id: 'new' }),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest
          .fn()
          .mockResolvedValue(fundGroupOfPlan ? { id: 'group-1' } : null),
        findMany: jest
          .fn()
          .mockImplementation(({ include }) =>
            Promise.resolve(include ? fundGroups : otherFundGroups)
          ),
        update: jest.fn().mockResolvedValue({ id: 'group-1' })
      },
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            account: { name: 'TFSA' },
            date: new Date('2026-01-01'),
            id: 'a1',
            quantity: 1,
            SymbolProfile: { symbol: 'XUS.TO' },
            tags: [],
            type: 'BUY'
          }
        ])
      },
      tag: {
        findFirst: jest.fn().mockResolvedValue(ownTag ? { id: 'tag-1' } : null)
      }
    };

    const portfolioService = {
      getDetails: jest.fn().mockImplementation(({ filters }) => {
        const tagId = filters?.[0]?.id;

        return Promise.resolve(
          tagId === 'tag-mother'
            ? details({ investment: 15000, value: 14600 })
            : tagId === 'tag-savings'
              ? details({ investment: 20000, value: 19000 })
              : tagId === 'tag-car'
                ? details({ investment: 10000, value: 12000 })
                : details({ investment: 35000, value: 34000 })
        );
      })
    };

    const service = new FundGroupService(
      portfolioService as unknown as PortfolioService,
      prisma as unknown as PrismaService
    );

    return { portfolioService, prisma, service };
  }

  describe('getReport', () => {
    const fundGroups = [
      {
        id: 'mother',
        isRemainder: false,
        kind: 'SOURCE',
        principal: 15000,
        tag: { id: 'tag-mother', name: 'Source · Mother' },
        tagId: 'tag-mother'
      },
      {
        id: 'savings',
        isRemainder: true,
        kind: 'SOURCE',
        principal: null,
        tag: { id: 'tag-savings', name: 'Source · Savings' },
        tagId: 'tag-savings'
      },
      {
        id: 'car',
        kind: 'PURPOSE',
        tag: { id: 'tag-car', name: 'Purpose · Car' },
        tagId: 'tag-car',
        targetAmount: 30000,
        targetDate: null
      }
    ];

    it('filters each group by its tag and derives the remainder', async () => {
      const { portfolioService, service } = setup({ fundGroups });

      const report = await service.getReport({
        planId: 'plan-1',
        userId: 'user-1'
      });

      expect(portfolioService.getDetails).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: 'max',
          filters: [{ id: 'tag-mother', type: 'TAG' }],
          userId: 'user-1'
        })
      );

      const [mother, savings] = report.sources;

      expect(mother).toMatchObject({
        accounts: [{ id: 'tfsa', name: 'TFSA', valueInBaseCurrency: 14600 }],
        gap: 0,
        investment: 15000,
        principal: 15000,
        valueInBaseCurrency: 14600
      });
      expect(savings).toMatchObject({ gap: 0, principal: 20000 });
      expect(report.purposes[0]).toMatchObject({
        holdings: [{ symbol: 'XUS.TO', valueInBaseCurrency: 12000 }],
        monthsLeft: null,
        progress: 0.4
      });
      expect(report.total).toEqual({
        investment: 35000,
        netPerformance: -1000,
        valueInBaseCurrency: 34000
      });
      // 34,000 in all accounts, 14,600 + 19,000 assigned to a source
      expect(report.checks.unassignedValueInBaseCurrency).toBe(400);
      expect(report.checks.activitiesWithoutSource.count).toBe(1);
    });

    it('reports nothing unassigned without any source', async () => {
      const { service } = setup();

      const report = await service.getReport({
        planId: 'plan-1',
        userId: 'user-1'
      });

      expect(report.sources).toEqual([]);
      expect(report.checks.unassignedValueInBaseCurrency).toBe(0);
    });
  });

  describe('upsertFundGroup', () => {
    const body = {
      kind: 'SOURCE',
      name: 'Mother',
      principal: 15000,
      tagId: 'tag-1'
    };

    it('creates a fund group in the plan', async () => {
      const { prisma, service } = setup();

      await service.upsertFundGroup({
        body,
        planId: 'plan-1',
        userId: 'user-1'
      });

      expect(prisma.tag.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tag-1', userId: 'user-1' } })
      );
      expect(prisma.fundGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ planId: 'plan-1', tagId: 'tag-1' })
      });
    });

    it('rejects a system tag or the tag of someone else', async () => {
      const { prisma, service } = setup({ ownTag: false });

      await expect(
        service.upsertFundGroup({ body, planId: 'plan-1', userId: 'user-1' })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fundGroup.create).not.toHaveBeenCalled();
    });

    it('rejects a tag of another fund group and a second remainder', async () => {
      const { service } = setup({
        otherFundGroups: [{ isRemainder: true, tagId: 'tag-1' }]
      });

      await expect(
        service.upsertFundGroup({ body, planId: 'plan-1', userId: 'user-1' })
      ).rejects.toThrow('The tag belongs to another fund group');

      const { service: service2 } = setup({
        otherFundGroups: [{ isRemainder: true, tagId: 'tag-other' }]
      });

      await expect(
        service2.upsertFundGroup({
          body: { ...body, isRemainder: true, principal: null },
          planId: 'plan-1',
          userId: 'user-1'
        })
      ).rejects.toThrow('There is already a remainder source');
    });

    it('updates only a fund group of the plan', async () => {
      const { prisma, service } = setup({ fundGroupOfPlan: false });

      await expect(
        service.upsertFundGroup({
          body: { ...body, id: 'group-of-someone-else' },
          planId: 'plan-1',
          userId: 'user-1'
        })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.fundGroup.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteFundGroup', () => {
    it('deletes only a fund group of the plan', async () => {
      const { prisma, service } = setup({ fundGroupOfPlan: false });

      await expect(
        service.deleteFundGroup({ id: 'group-1', planId: 'plan-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.fundGroup.delete).not.toHaveBeenCalled();
    });
  });
});
