import {
  PriceAlertClose,
  describePriceAlertEvaluation,
  describePriceAlertRule,
  evaluatePriceAlert,
  isPriceAlertConditionMet
} from './price-alert-rule';

function closes(prices: number[]): PriceAlertClose[] {
  // The most recent first, one day apart
  return prices.map((marketPrice, index) => {
    return {
      marketPrice,
      date: new Date(Date.UTC(2026, 10, 26 - index))
    };
  });
}

describe('evaluatePriceAlert', () => {
  it('compares the price as it is', () => {
    expect(
      evaluatePriceAlert({ currentPrice: 40, rule: { ruleType: 'PRICE' } })
    ).toEqual({ currentPrice: 40, metric: 40 });
  });

  it('measures the drop from the highest close of the lookback', () => {
    const evaluation = evaluatePriceAlert({
      closes: closes([45, 47.2, 46, 50]),
      currentPrice: 40.12,
      rule: { lookbackDays: 3, ruleType: 'PCT_FROM_HIGH' }
    });

    // 50 is older than the 3 days looked back at
    expect(evaluation).toMatchObject({
      currentPrice: 40.12,
      reference: {
        date: new Date(Date.UTC(2026, 10, 25)),
        kind: 'high',
        value: 47.2
      }
    });
    expect((evaluation as { metric: number }).metric).toBeCloseTo(-15, 5);
  });

  it('does not judge the high without enough closes', () => {
    expect(
      evaluatePriceAlert({
        closes: closes([45, 47]),
        currentPrice: 40,
        rule: { ruleType: 'PCT_FROM_HIGH' }
      })
    ).toEqual({ missing: '2 of 252 trading days of closes' });
  });

  it('compares the price with the average cost', () => {
    expect(
      evaluatePriceAlert({
        averageCost: 78.95,
        currentPrice: 78.95,
        rule: { ruleType: 'PCT_FROM_COST' }
      })
    ).toMatchObject({ metric: 0, reference: { kind: 'averageCost' } });
    expect(
      evaluatePriceAlert({
        currentPrice: 10,
        rule: { ruleType: 'PCT_FROM_COST' }
      })
    ).toEqual({ missing: 'no position with an average cost' });
  });

  it('measures the change since the previous close', () => {
    expect(
      evaluatePriceAlert({
        closes: closes([100, 90]),
        currentPrice: 97,
        rule: { ruleType: 'DAILY_CHANGE' }
      })
    ).toMatchObject({ metric: -3, reference: { kind: 'previousClose' } });
    expect(
      evaluatePriceAlert({
        currentPrice: 97,
        rule: { ruleType: 'DAILY_CHANGE' }
      })
    ).toEqual({ missing: 'no close of a previous trading day' });
  });
});

describe('isPriceAlertConditionMet', () => {
  it.each([
    ['LESS_THAN_OR_EQUAL', -15, -15, true],
    ['LESS_THAN', -15, -15, false],
    ['GREATER_THAN_OR_EQUAL', 8.1, 8, true],
    ['GREATER_THAN', 7.9, 8, false]
  ] as const)('%s %d vs %d is %s', (condition, value, targetValue, isMet) => {
    expect(isPriceAlertConditionMet({ condition, targetValue, value })).toBe(
      isMet
    );
  });
});

describe('describing an alert', () => {
  it('describes the rule in one line', () => {
    expect(
      describePriceAlertRule({
        condition: 'LESS_THAN_OR_EQUAL',
        ruleType: 'PCT_FROM_HIGH',
        targetValue: -15
      })
    ).toBe('≤ -15% from the 252-day high');
    expect(
      describePriceAlertRule({
        condition: 'GREATER_THAN_OR_EQUAL',
        ruleType: 'DAILY_CHANGE',
        targetValue: 8
      })
    ).toBe('Daily change ≥ +8%');
    expect(
      describePriceAlertRule({ condition: 'LESS_THAN', targetValue: 40 })
    ).toBe('Price < 40');
  });

  it('describes the evaluation with its reference', () => {
    expect(
      describePriceAlertEvaluation({
        currentPrice: 39.98,
        metric: -15.29,
        reference: {
          date: new Date(Date.UTC(2026, 8, 18)),
          kind: 'high',
          value: 47.2
        }
      })
    ).toBe('-15.3% from the high of 47.20 (2026-09-18)');
  });
});
