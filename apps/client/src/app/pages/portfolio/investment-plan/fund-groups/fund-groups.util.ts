/**
 * Shape of GET /api/v1/investment-plan/fund-groups, see fund-group.service.ts
 * of the API
 */
export interface FundGroupFiguresResponse {
  accounts: { id: string; name: string; valueInBaseCurrency: number }[];
  holdings: { name: string; symbol: string; valueInBaseCurrency: number }[];
  investment: number;
  netPerformance: number;
  netPerformancePercent: number;
  valueInBaseCurrency: number;
}

export interface FundGroupResponse extends FundGroupFiguresResponse {
  id: string;
  isRemainder: boolean;
  kind: 'PURPOSE' | 'SOURCE';
  name: string;
  note: string | null;
  principal: number | null;
  sortOrder: number;
  tag: { id: string; name: string };
  tagId: string;
  targetAmount: number | null;
  targetDate: string | null;
}

export interface FundGroupCheckListResponse {
  activities: {
    accountName?: string;
    date: string;
    id: string;
    quantity: number;
    symbol: string;
    type: string;
  }[];
  count: number;
}

export interface FundGroupsResponse {
  checks: {
    activitiesWithMultiplePurposes: FundGroupCheckListResponse;
    activitiesWithMultipleSources: FundGroupCheckListResponse;
    activitiesWithoutSource: FundGroupCheckListResponse;
    partialPurposes: {
      fundGroupId: string;
      symbol: string;
      untaggedCount: number;
    }[];
    unassignedValueInBaseCurrency: number;
  };
  purposes: (FundGroupResponse & {
    monthsLeft: number | null;
    progress: number;
  })[];
  sources: (FundGroupResponse & { gap: number | null })[];
  total: {
    investment: number;
    netPerformance: number;
    valueInBaseCurrency: number;
  };
}

export interface DistributionSegment {
  color: string;
  name: string;
  share: number;
  valueInBaseCurrency: number;
}

const ACCOUNT_COLORS = [
  '#36cfcc',
  '#3686cf',
  '#9b36cf',
  '#cf9b36',
  '#cf3667',
  '#4caf50'
];

/**
 * The same account gets the same color in every row, in the order of the
 * accounts holding the most value
 */
export function getAccountColors(
  fundGroups: Pick<FundGroupFiguresResponse, 'accounts'>[]
) {
  const valueByAccountId = new Map<string, number>();

  for (const { accounts } of fundGroups) {
    for (const { id, valueInBaseCurrency } of accounts) {
      valueByAccountId.set(
        id,
        (valueByAccountId.get(id) ?? 0) + Math.max(valueInBaseCurrency, 0)
      );
    }
  }

  return new Map(
    [...valueByAccountId.entries()]
      .sort(([, a], [, b]) => {
        return b - a;
      })
      .map(([id], index) => {
        return [id, ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]];
      })
  );
}

export function getDistribution({
  accounts,
  colors
}: {
  accounts: FundGroupFiguresResponse['accounts'];
  colors: Map<string, string>;
}): DistributionSegment[] {
  const positiveAccounts = accounts.filter(({ valueInBaseCurrency }) => {
    return valueInBaseCurrency > 0;
  });

  const total = positiveAccounts.reduce((sum, { valueInBaseCurrency }) => {
    return sum + valueInBaseCurrency;
  }, 0);

  if (total <= 0) {
    return [];
  }

  return positiveAccounts
    .map(({ id, name, valueInBaseCurrency }) => {
      return {
        name,
        valueInBaseCurrency,
        color: colors.get(id) ?? ACCOUNT_COLORS[0],
        share: valueInBaseCurrency / total
      };
    })
    .sort((a, b) => {
      return b.share - a.share;
    });
}

export function formatAmount(value: number | null, locale?: string) {
  if (value === null) {
    return '';
  }

  return value.toLocaleString(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  });
}

export function formatPercent(value: number, locale?: string) {
  const formatted = (Math.abs(value) * 100).toLocaleString(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  });

  if (Math.abs(value) * 100 < 0.05) {
    return `${formatted}%`;
  }

  return `${value > 0 ? '+' : '-'}${formatted}%`;
}

/** A share without a sign, e.g. the progress towards a target */
export function formatShare(value: number, locale?: string) {
  return `${(value * 100).toLocaleString(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  })}%`;
}

/** A gap below one unit of the currency is rounding, not a hint */
export function hasGap(gap: number | null) {
  return gap !== null && Math.abs(gap) >= 1;
}
