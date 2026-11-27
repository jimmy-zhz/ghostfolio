/**
 * The rules of a price alert: how the value that is compared with its target
 * is derived. Shared by the check of the API, its notifications and the list
 * of the client, so that all describe an alert the same way. See
 * docs/dev/requirements/iteration-2026-12.md
 */

export type PriceAlertCondition =
  'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL';

export type PriceAlertRuleType =
  'DAILY_CHANGE' | 'PCT_FROM_COST' | 'PCT_FROM_HIGH' | 'PRICE';

/** About 52 weeks of trading days */
export const PRICE_ALERT_DEFAULT_LOOKBACK_DAYS = 252;

export const PRICE_ALERT_CONDITION_LABELS: Record<PriceAlertCondition, string> =
  {
    GREATER_THAN: '>',
    GREATER_THAN_OR_EQUAL: '≥',
    LESS_THAN: '<',
    LESS_THAN_OR_EQUAL: '≤'
  };

export interface PriceAlertRule {
  condition: PriceAlertCondition;
  lookbackDays?: number | null;
  ruleType?: PriceAlertRuleType | null;
  targetValue: number;
}

export interface PriceAlertEvaluation {
  currentPrice: number;
  /** The price for PRICE, a percentage for the other rules */
  metric: number;
  reference?: {
    date?: Date;
    kind: 'averageCost' | 'high' | 'previousClose';
    value: number;
  };
}

/** Closes before today, the most recent first */
export interface PriceAlertClose {
  date: Date;
  marketPrice: number;
}

export function getLookbackDays({
  lookbackDays
}: Pick<PriceAlertRule, 'lookbackDays'>) {
  return lookbackDays && lookbackDays > 0
    ? lookbackDays
    : PRICE_ALERT_DEFAULT_LOOKBACK_DAYS;
}

/**
 * Derives the value of a rule, or explains why it cannot be derived. Not
 * enough data never triggers an alert.
 */
export function evaluatePriceAlert({
  averageCost,
  closes = [],
  currentPrice,
  rule
}: {
  averageCost?: number;
  closes?: PriceAlertClose[];
  currentPrice: number;
  rule: Pick<PriceAlertRule, 'lookbackDays' | 'ruleType'>;
}): PriceAlertEvaluation | { missing: string } {
  switch (rule.ruleType ?? 'PRICE') {
    case 'DAILY_CHANGE': {
      const [previousClose] = closes;

      if (!previousClose?.marketPrice) {
        return { missing: 'no close of a previous trading day' };
      }

      return {
        currentPrice,
        metric: toPercent(currentPrice, previousClose.marketPrice),
        reference: {
          date: previousClose.date,
          kind: 'previousClose',
          value: previousClose.marketPrice
        }
      };
    }

    case 'PCT_FROM_COST': {
      if (!averageCost || averageCost <= 0) {
        return { missing: 'no position with an average cost' };
      }

      return {
        currentPrice,
        metric: toPercent(currentPrice, averageCost),
        reference: { kind: 'averageCost', value: averageCost }
      };
    }

    case 'PCT_FROM_HIGH': {
      const lookbackDays = getLookbackDays(rule);

      if (closes.length < lookbackDays) {
        return {
          missing: `${closes.length} of ${lookbackDays} trading days of closes`
        };
      }

      const high = closes.slice(0, lookbackDays).reduce((highest, close) => {
        return close.marketPrice > highest.marketPrice ? close : highest;
      });

      return {
        currentPrice,
        metric: toPercent(currentPrice, high.marketPrice),
        reference: { date: high.date, kind: 'high', value: high.marketPrice }
      };
    }

    default:
      return { currentPrice, metric: currentPrice };
  }
}

export function isPriceAlertConditionMet({
  condition,
  targetValue,
  value
}: {
  condition: PriceAlertCondition;
  targetValue: number;
  value: number;
}) {
  switch (condition) {
    case 'GREATER_THAN':
      return value > targetValue;
    case 'GREATER_THAN_OR_EQUAL':
      return value >= targetValue;
    case 'LESS_THAN':
      return value < targetValue;
    case 'LESS_THAN_OR_EQUAL':
      return value <= targetValue;
    default:
      return false;
  }
}

/** One line such as "≤ -15% from the 252-day high" */
export function describePriceAlertRule(rule: PriceAlertRule) {
  const condition =
    PRICE_ALERT_CONDITION_LABELS[rule.condition] ?? rule.condition;
  const percent = `${rule.targetValue > 0 ? '+' : ''}${rule.targetValue}%`;

  switch (rule.ruleType ?? 'PRICE') {
    case 'DAILY_CHANGE':
      return `Daily change ${condition} ${percent}`;
    case 'PCT_FROM_COST':
      return `${condition} ${percent} vs. average cost`;
    case 'PCT_FROM_HIGH':
      return `${condition} ${percent} from the ${getLookbackDays(rule)}-day high`;
    default:
      return `Price ${condition} ${rule.targetValue}`;
  }
}

/** One line such as "-15.3% from the high of 47.20 (2026-09-18)" */
export function describePriceAlertEvaluation(evaluation: PriceAlertEvaluation) {
  const { metric, reference } = evaluation;

  if (!reference) {
    return metric.toFixed(2);
  }

  const percent = `${metric > 0 ? '+' : ''}${metric.toFixed(1)}%`;
  const date = reference.date
    ? ` (${reference.date.toISOString().slice(0, 10)})`
    : '';
  const value = reference.value.toFixed(2);

  switch (reference.kind) {
    case 'averageCost':
      return `${percent} vs. the average cost of ${value}`;
    case 'high':
      return `${percent} from the high of ${value}${date}`;
    default:
      return `${percent} vs. the previous close of ${value}${date}`;
  }
}

function toPercent(value: number, base: number) {
  return ((value - base) / base) * 100;
}
