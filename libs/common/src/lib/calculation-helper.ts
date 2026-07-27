import { Big } from 'big.js';
import {
  endOfDay,
  endOfYear,
  max,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears
} from 'date-fns';
import { isFinite, isNumber } from 'lodash';

import { resetHours } from './helper';
import { DateRange } from './types';

export function getAnnualizedPerformancePercent({
  daysInMarket,
  netPerformancePercentage
}: {
  daysInMarket: number;
  netPerformancePercentage: Big;
}): Big {
  if (isNumber(daysInMarket) && daysInMarket > 0) {
    const exponent = new Big(365).div(daysInMarket).toNumber();
    const growthFactor = Math.pow(
      netPerformancePercentage.plus(1).toNumber(),
      exponent
    );

    if (isFinite(growthFactor)) {
      return new Big(growthFactor).minus(1);
    }
  }

  return new Big(0);
}

export function getIntervalFromDateRange(params: {
  dateRange: DateRange;
  endDate?: Date;
  startDate?: Date;
}) {
  const { dateRange } = params;
  let endDate = params.endDate ?? endOfDay(new Date());
  let startDate = params.startDate ?? new Date(0);

  switch (dateRange) {
    case '1d':
      startDate = max([startDate, subDays(resetHours(new Date()), 1)]);
      break;
    case 'mtd':
      startDate = max([
        startDate,
        subDays(startOfMonth(resetHours(new Date())), 1)
      ]);
      break;
    case 'wtd':
      startDate = max([
        startDate,
        subDays(startOfWeek(resetHours(new Date()), { weekStartsOn: 1 }), 1)
      ]);
      break;
    case 'ytd':
      startDate = max([
        startDate,
        subDays(startOfYear(resetHours(new Date())), 1)
      ]);
      break;
    // The new date ranges normalize after the subtraction, otherwise the
    // result is off by one day in timezones behind UTC
    case '1w':
      startDate = max([startDate, resetHours(subWeeks(new Date(), 1))]);
      break;
    case '1m':
      startDate = max([startDate, resetHours(subMonths(new Date(), 1))]);
      break;
    case '3m':
      startDate = max([startDate, resetHours(subMonths(new Date(), 3))]);
      break;
    case '6m':
      startDate = max([startDate, resetHours(subMonths(new Date(), 6))]);
      break;
    case '1y':
      startDate = max([startDate, subYears(resetHours(new Date()), 1)]);
      break;
    case '2y':
      startDate = max([startDate, resetHours(subYears(new Date(), 2))]);
      break;
    case '5y':
      startDate = max([startDate, subYears(resetHours(new Date()), 5)]);
      break;
    case '10y':
      startDate = max([startDate, resetHours(subYears(new Date(), 10))]);
      break;
    case 'max':
      break;
    default:
      // '2024', '2023', '2022', etc.
      endDate = endOfYear(new Date(dateRange));
      startDate = max([startDate, new Date(dateRange)]);
  }

  return { endDate, startDate };
}
