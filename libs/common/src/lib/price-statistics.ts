export interface PriceStatistics {
  changeFromLastTroughPercent?: number;
  changeFromMaximumPercent?: number;
  dailyChangePercent?: number;
}

const DEFAULT_ZIG_ZAG_THRESHOLD = 0.05;

/**
 * Calculates the price statistics for every item of a price series.
 *
 * All values are derived from the data available up to the corresponding
 * index, hence hovering a data point never exposes future prices.
 */
export function calculatePriceStatistics({
  values,
  zigZagThreshold = DEFAULT_ZIG_ZAG_THRESHOLD
}: {
  values: number[];
  zigZagThreshold?: number;
}): PriceStatistics[] {
  const troughIndexes = getTroughIndexes({ values, zigZagThreshold });

  let maximum = Number.NEGATIVE_INFINITY;

  return values.map((value, index) => {
    if (value == null || !isFinite(value)) {
      return {};
    }

    maximum = Math.max(maximum, value);

    const previousValue = values[index - 1];
    const troughIndex = troughIndexes[index];
    const troughValue = troughIndex == null ? undefined : values[troughIndex];

    return {
      changeFromLastTroughPercent:
        troughValue != null && troughValue > 0
          ? value / troughValue - 1
          : undefined,
      changeFromMaximumPercent: maximum > 0 ? value / maximum - 1 : undefined,
      dailyChangePercent:
        previousValue > 0 ? value / previousValue - 1 : undefined
    };
  });
}

/**
 * Detects the troughs (swing lows) of a price series with the zig zag
 * algorithm: a reversal is only confirmed once the price moves back by at
 * least the given threshold.
 *
 * Returns for every index the most recent trough which is already confirmed
 * at that index.
 */
function getTroughIndexes({
  values,
  zigZagThreshold
}: {
  values: number[];
  zigZagThreshold: number;
}): (number | undefined)[] {
  const troughIndexes: (number | undefined)[] = new Array(values.length).fill(
    undefined
  );

  let direction: 'down' | 'up' | undefined;
  let lastTroughIndex: number | undefined;
  let pivotIndex = 0;

  for (let index = 0; index < values.length; index++) {
    const value = values[index];

    if (value == null || !isFinite(value)) {
      troughIndexes[index] = lastTroughIndex;

      continue;
    }

    const pivotValue = values[pivotIndex];

    if (direction === 'up') {
      if (value >= pivotValue) {
        pivotIndex = index;
      } else if (value <= pivotValue * (1 - zigZagThreshold)) {
        // The rise has ended, the pivot was a peak
        direction = 'down';
        pivotIndex = index;
      }
    } else if (direction === 'down') {
      if (value <= pivotValue) {
        pivotIndex = index;
      } else if (value >= pivotValue * (1 + zigZagThreshold)) {
        // The decline has ended, the pivot was a trough
        direction = 'up';
        lastTroughIndex = pivotIndex;
        pivotIndex = index;
      }
    } else if (value >= pivotValue * (1 + zigZagThreshold)) {
      direction = 'up';
      lastTroughIndex = pivotIndex;
      pivotIndex = index;
    } else if (value <= pivotValue * (1 - zigZagThreshold)) {
      direction = 'down';
      pivotIndex = index;
    } else if (value < pivotValue) {
      pivotIndex = index;
    }

    troughIndexes[index] = lastTroughIndex;
  }

  return troughIndexes;
}
