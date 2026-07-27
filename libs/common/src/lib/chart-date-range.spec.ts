import { format, subDays, subMonths, subYears } from 'date-fns';

import { getIntervalFromDateRange } from './calculation-helper';
import {
  filterByDateRange,
  getDateRangeSlice,
  getSelectableDateRanges
} from './chart-date-range';
import { DATE_FORMAT, resetHours } from './helper';

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDatesOfLastDays(numberOfDays: number) {
  return Array.from({ length: numberOfDays }, (_, index) => {
    return format(subDays(new Date(), numberOfDays - 1 - index), DATE_FORMAT);
  });
}

describe('getIntervalFromDateRange', () => {
  it.each([
    ['1w', subDays(new Date(), 7)],
    ['1m', subMonths(new Date(), 1)],
    ['3m', subMonths(new Date(), 3)],
    ['6m', subMonths(new Date(), 6)],
    ['1y', subYears(new Date(), 1)],
    ['2y', subYears(new Date(), 2)],
    ['5y', subYears(new Date(), 5)],
    ['10y', subYears(new Date(), 10)]
  ])('derives the start date for %s', (dateRange, expectedStartDate) => {
    const { startDate } = getIntervalFromDateRange({ dateRange });

    expect(formatUtcDate(startDate)).toEqual(
      formatUtcDate(resetHours(expectedStartDate))
    );
  });
});

describe('getDateRangeSlice', () => {
  it('includes the boundaries of the date range', () => {
    const dates = getDatesOfLastDays(10);

    const { endIndex, startIndex } = getDateRangeSlice({
      dates,
      dateRange: '1w'
    });

    // The last 8 days (today and the 7 preceding days)
    expect(startIndex).toEqual(2);
    expect(endIndex).toEqual(10);
  });

  it('includes every date for max', () => {
    const dates = getDatesOfLastDays(10);

    expect(getDateRangeSlice({ dates, dateRange: 'max' })).toEqual({
      endIndex: 10,
      startIndex: 0
    });
  });

  it('returns an empty slice if no date is within the date range', () => {
    const dates = [
      format(subYears(new Date(), 3), DATE_FORMAT),
      format(subYears(new Date(), 2), DATE_FORMAT)
    ];

    expect(getDateRangeSlice({ dates, dateRange: '1m' })).toEqual({
      endIndex: 0,
      startIndex: 0
    });
  });

  it('handles an empty list of dates', () => {
    expect(getDateRangeSlice({ dateRange: '1m', dates: [] })).toEqual({
      endIndex: 0,
      startIndex: 0
    });
  });
});

describe('filterByDateRange', () => {
  it('keeps only the items within the date range', () => {
    const items = [
      { date: format(subYears(new Date(), 1), DATE_FORMAT), value: 1 },
      { date: format(subDays(new Date(), 3), DATE_FORMAT), value: 2 }
    ];

    expect(filterByDateRange({ items, dateRange: '1m' })).toEqual([items[1]]);
  });

  it('handles missing items', () => {
    expect(filterByDateRange({ dateRange: '1m', items: undefined })).toEqual(
      []
    );
  });
});

describe('getSelectableDateRanges', () => {
  it('omits the date ranges exceeding the available history', () => {
    const dateRanges = getSelectableDateRanges({
      dates: getDatesOfLastDays(20)
    });

    // '1m' is the first date range covering all dates, hence every longer
    // date range except 'max' is omitted
    expect(dateRanges).toEqual(['1w', '1m', 'max']);
  });

  it('omits the date ranges without enough data points', () => {
    const dateRanges = getSelectableDateRanges({
      dates: [
        format(subYears(new Date(), 2), DATE_FORMAT),
        format(subYears(new Date(), 1), DATE_FORMAT)
      ]
    });

    expect(dateRanges).toEqual(['2y', 'max']);
  });

  it('always offers max', () => {
    expect(getSelectableDateRanges({ dates: [] })).toEqual(['max']);
  });
});
