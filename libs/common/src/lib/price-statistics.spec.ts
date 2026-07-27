import { calculatePriceStatistics } from './price-statistics';

describe('calculatePriceStatistics', () => {
  it('calculates the daily change based on the previous data point', () => {
    const statistics = calculatePriceStatistics({ values: [100, 110, 99] });

    expect(statistics[0].dailyChangePercent).toBeUndefined();
    expect(statistics[1].dailyChangePercent).toBeCloseTo(0.1);
    expect(statistics[2].dailyChangePercent).toBeCloseTo(-0.1);
  });

  it('calculates the change from the maximum up to the given index', () => {
    const statistics = calculatePriceStatistics({ values: [100, 200, 150] });

    expect(statistics[0].changeFromMaximumPercent).toBeCloseTo(0);
    expect(statistics[1].changeFromMaximumPercent).toBeCloseTo(0);
    expect(statistics[2].changeFromMaximumPercent).toBeCloseTo(-0.25);
  });

  it('calculates the change from the last confirmed trough', () => {
    // Declines to 80, rebounds above the threshold and continues to rise
    const statistics = calculatePriceStatistics({
      values: [100, 90, 80, 90, 120],
      zigZagThreshold: 0.05
    });

    // The trough is confirmed at index 3 (80 -> 90 is above the threshold)
    expect(statistics[2].changeFromLastTroughPercent).toBeUndefined();
    expect(statistics[3].changeFromLastTroughPercent).toBeCloseTo(0.125);
    expect(statistics[4].changeFromLastTroughPercent).toBeCloseTo(0.5);
  });

  it('ignores movements below the threshold', () => {
    const statistics = calculatePriceStatistics({
      values: [100, 99, 100, 101, 100],
      zigZagThreshold: 0.05
    });

    for (const { changeFromLastTroughPercent } of statistics) {
      expect(changeFromLastTroughPercent).toBeUndefined();
    }
  });

  it('handles an empty series', () => {
    expect(calculatePriceStatistics({ values: [] })).toEqual([]);
  });
});
