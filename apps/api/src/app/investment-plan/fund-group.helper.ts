import { BadRequestException } from '@nestjs/common';
import { FundGroupKind, Prisma } from '@prisma/client';
import { differenceInCalendarMonths, isValid, parseISO } from 'date-fns';

/**
 * Fund groups split the portfolio by the tags of its activities, next to the
 * accounts: a source tells whose money it is (every investment activity has
 * exactly one), a purpose what the money is for (none or one). See
 * docs/dev/requirements/iteration-2026-12.md.
 */

/** The activity types a fund group is about */
export const FUND_GROUP_ACTIVITY_TYPES = ['BUY', 'DIVIDEND', 'SELL'] as const;

/** Lists of activities in the checks are cut off after this many entries */
export const FUND_GROUP_CHECK_LIST_LIMIT = 200;

export interface FundGroupCheckActivity {
  accountName?: string;
  date: Date;
  id: string;
  quantity: number;
  symbol: string;
  tagIds: string[];
  type: string;
}

export interface FundGroupCheckList {
  activities: Omit<FundGroupCheckActivity, 'tagIds'>[];
  count: number;
}

export interface FundGroupChecks {
  activitiesWithMultiplePurposes: FundGroupCheckList;
  activitiesWithMultipleSources: FundGroupCheckList;
  activitiesWithoutSource: FundGroupCheckList;
  /** A symbol of which only some activities carry the tag of a purpose */
  partialPurposes: {
    fundGroupId: string;
    symbol: string;
    untaggedCount: number;
  }[];
}

export interface FundGroupFigures {
  accounts: { id: string; name: string; valueInBaseCurrency: number }[];
  holdings: { name: string; symbol: string; valueInBaseCurrency: number }[];
  investment: number;
  netPerformance: number;
  netPerformancePercent: number;
  valueInBaseCurrency: number;
}

/**
 * Takes the editable fields of a fund group only and checks them against its
 * kind, so that the body never reaches Prisma as is
 */
export function toFundGroupData(body: Record<string, unknown>) {
  const kind = body?.kind;

  if (kind !== FundGroupKind.SOURCE && kind !== FundGroupKind.PURPOSE) {
    throw new BadRequestException('kind must be SOURCE or PURPOSE');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!name) {
    throw new BadRequestException('name is required');
  }

  if (typeof body.tagId !== 'string' || !body.tagId) {
    throw new BadRequestException('tagId is required');
  }

  const data: Prisma.FundGroupUncheckedCreateWithoutPlanInput = {
    kind,
    name,
    isRemainder: false,
    note: toOptionalString(body.note, 'note'),
    principal: null,
    sortOrder: toSortOrder(body.sortOrder),
    tagId: body.tagId,
    targetAmount: null,
    targetDate: null
  };

  const fieldsOfOtherKind =
    kind === FundGroupKind.SOURCE
      ? ['targetAmount', 'targetDate']
      : ['isRemainder', 'principal'];

  for (const field of fieldsOfOtherKind) {
    if (body[field] !== undefined && body[field] !== null) {
      throw new BadRequestException(`${field} does not apply to a ${kind}`);
    }
  }

  if (kind === FundGroupKind.SOURCE) {
    data.isRemainder = body.isRemainder === true;
    data.principal = toOptionalNumber(body.principal, 'principal');

    if (data.isRemainder && data.principal !== null) {
      throw new BadRequestException(
        'The remainder source has no principal of its own'
      );
    }
  } else {
    data.targetAmount = toOptionalNumber(body.targetAmount, 'targetAmount');
    data.targetDate = toOptionalDate(body.targetDate, 'targetDate');
  }

  return data;
}

export function getFundGroupChecks({
  activities,
  purposes,
  sourceTagIds
}: {
  activities: FundGroupCheckActivity[];
  purposes: { id: string; tagId: string }[];
  sourceTagIds: string[];
}): FundGroupChecks {
  const purposeTagIds = purposes.map(({ tagId }) => {
    return tagId;
  });

  const countTags = (activity: FundGroupCheckActivity, tagIds: string[]) => {
    return activity.tagIds.filter((tagId) => {
      return tagIds.includes(tagId);
    }).length;
  };

  const partialPurposes: FundGroupChecks['partialPurposes'] = [];

  for (const { id, tagId } of purposes) {
    const countsBySymbol = new Map<
      string,
      { tagged: number; untagged: number }
    >();

    for (const activity of activities) {
      const counts = countsBySymbol.get(activity.symbol) ?? {
        tagged: 0,
        untagged: 0
      };

      if (activity.tagIds.includes(tagId)) {
        counts.tagged += 1;
      } else {
        counts.untagged += 1;
      }

      countsBySymbol.set(activity.symbol, counts);
    }

    for (const [symbol, { tagged, untagged }] of countsBySymbol) {
      if (tagged > 0 && untagged > 0) {
        partialPurposes.push({
          symbol,
          fundGroupId: id,
          untaggedCount: untagged
        });
      }
    }
  }

  return {
    partialPurposes,
    activitiesWithMultiplePurposes: toCheckList(
      activities.filter((activity) => {
        return countTags(activity, purposeTagIds) > 1;
      })
    ),
    activitiesWithMultipleSources: toCheckList(
      activities.filter((activity) => {
        return countTags(activity, sourceTagIds) > 1;
      })
    ),
    // Without any source defined there is nothing to check against
    activitiesWithoutSource: toCheckList(
      sourceTagIds.length > 0
        ? activities.filter((activity) => {
            return countTags(activity, sourceTagIds) === 0;
          })
        : []
    )
  };
}

/**
 * The principal of the remainder source is the total investment minus the
 * principal of the other sources
 */
export function getRemainderPrincipal({
  principals,
  totalInvestment
}: {
  principals: (number | null)[];
  totalInvestment: number;
}) {
  return principals.reduce<number>((remainder, principal) => {
    return remainder - (principal ?? 0);
  }, totalInvestment);
}

/** Share of the target amount reached, 0 without a target */
export function getProgress({
  targetAmount,
  valueInBaseCurrency
}: {
  targetAmount: number | null;
  valueInBaseCurrency: number;
}) {
  return targetAmount ? valueInBaseCurrency / targetAmount : 0;
}

/** Whole months until the target date, never negative */
export function getMonthsLeft({
  now = new Date(),
  targetDate
}: {
  now?: Date;
  targetDate: Date | null;
}) {
  if (!targetDate) {
    return null;
  }

  return Math.max(differenceInCalendarMonths(targetDate, now), 0);
}

function toCheckList(activities: FundGroupCheckActivity[]): FundGroupCheckList {
  return {
    activities: activities
      .slice(0, FUND_GROUP_CHECK_LIST_LIMIT)
      .map(({ tagIds: _tagIds, ...activity }) => {
        return activity;
      }),
    count: activities.length
  };
}

function toOptionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = typeof value === 'string' ? parseISO(value) : undefined;

  if (!date || !isValid(date)) {
    throw new BadRequestException(`${field} must be an ISO date`);
  }

  return date;
}

function toOptionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${field} must be a number of at least 0`);
  }

  return value;
}

function toSortOrder(value: unknown) {
  if (value === undefined || value === null) {
    return 0;
  }

  if (!Number.isInteger(value)) {
    throw new BadRequestException('sortOrder must be a whole number');
  }

  return value as number;
}

function toOptionalString(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a text`);
  }

  return value.trim() || null;
}
