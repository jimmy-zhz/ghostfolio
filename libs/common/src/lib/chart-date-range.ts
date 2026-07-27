import { isAfter, isBefore, parseISO } from 'date-fns';

import { getIntervalFromDateRange } from './calculation-helper';
import { resetHours } from './helper';
import { DateRange } from './types';

/**
 * The date ranges of the chart selector, ordered by ascending duration.
 * '1d' is omitted as the market data has a daily granularity.
 */
export const CHART_DATE_RANGES: DateRange[] = [
  '1w',
  '1m',
  '3m',
  '6m',
  'ytd',
  '1y',
  '2y',
  '5y',
  '10y',
  'max'
];

export const DEFAULT_CHART_DATE_RANGE: DateRange = '1m';

export interface DateRangeSlice {
  // Exclusive
  endIndex: number;
  startIndex: number;
}

/**
 * Determines the boundaries of the given date range within a chronologically
 * ordered list of dates. Index based, so that parallel series (for example the
 * average price or the price statistics) can be sliced accordingly.
 */
export function getDateRangeSlice({
  dateRange,
  dates
}: {
  dateRange: DateRange;
  dates: string[];
}): DateRangeSlice {
  const { endDate, startDate } = getIntervalFromDateRange({ dateRange });

  let endIndex = 0;
  let startIndex = dates.length;

  dates.forEach((date, index) => {
    if (isWithinInterval({ date, endDate, startDate })) {
      startIndex = Math.min(startIndex, index);
      endIndex = index + 1;
    }
  });

  return endIndex === 0
    ? { endIndex: 0, startIndex: 0 }
    : { endIndex, startIndex };
}

export function filterByDateRange<T extends { date: string }>({
  dateRange,
  items
}: {
  dateRange: DateRange;
  items: T[];
}): T[] {
  const { endDate, startDate } = getIntervalFromDateRange({ dateRange });

  return (items ?? []).filter(({ date }) => {
    return isWithinInterval({ date, endDate, startDate });
  });
}

/**
 * Returns the date ranges which are worth offering for the given dates: ranges
 * without at least two data points as well as the ranges exceeding the
 * available history are not selectable. 'max' is always selectable.
 */
export function getSelectableDateRanges({
  dates
}: {
  dates: string[];
}): DateRange[] {
  const selectableDateRanges: DateRange[] = [];

  let hasFullCoverage = false;

  for (const dateRange of CHART_DATE_RANGES) {
    if (dateRange === 'max') {
      selectableDateRanges.push(dateRange);

      continue;
    }

    const { endIndex, startIndex } = getDateRangeSlice({ dateRange, dates });
    const numberOfItems = endIndex - startIndex;

    if (numberOfItems < 2 || hasFullCoverage) {
      continue;
    }

    selectableDateRanges.push(dateRange);

    if (numberOfItems === dates.length) {
      // Every longer date range would show the same chart
      hasFullCoverage = true;
    }
  }

  return selectableDateRanges;
}

function isWithinInterval({
  date,
  endDate,
  startDate
}: {
  date: string;
  endDate: Date;
  startDate: Date;
}) {
  // Compare on a daily granularity, otherwise the first day of a date range is
  // dropped in timezones ahead of UTC and across daylight saving time changes
  const parsedDate = resetHours(parseISO(date));

  return (
    !isBefore(parsedDate, startOfUtcDay(startDate)) &&
    !isAfter(parsedDate, endDate)
  );
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
