import { BadRequestException } from '@nestjs/common';

import {
  assertAllocationGroupSymbols,
  toDcaScheduleUpdate,
  toPriceAlertUpdate
} from './investment-plan.helper';

describe('assertAllocationGroupSymbols', () => {
  it('accepts a list of symbols', () => {
    expect(() =>
      assertAllocationGroupSymbols([{ symbol: 'XEF.TO' }, { symbol: 'XEC.TO' }])
    ).not.toThrow();
  });

  it('rejects an empty or invalid list', () => {
    for (const symbols of [undefined, [], [{}], [{ symbol: '' }], 'XEF.TO']) {
      expect(() => assertAllocationGroupSymbols(symbols)).toThrow(
        BadRequestException
      );
    }
  });
});

describe('toDcaScheduleUpdate', () => {
  it('keeps the editable fields and parses the dates', () => {
    expect(
      toDcaScheduleUpdate({
        endDate: '2026-12-31',
        isActive: false,
        weeklyBudget: 250
      })
    ).toEqual({
      endDate: new Date('2026-12-31'),
      isActive: false,
      weeklyBudget: 250
    });
  });

  it('rejects a date it cannot parse', () => {
    expect(() => toDcaScheduleUpdate({ startDate: 'next friday' })).toThrow(
      BadRequestException
    );
  });

  it('drops the plan, the relations and unknown fields', () => {
    expect(
      toDcaScheduleUpdate({
        id: 'other',
        plan: { update: { user: { update: { role: 'ADMIN' } } } },
        planId: 'plan-of-someone-else',
        symbol: 'XEF.TO'
      })
    ).toEqual({ symbol: 'XEF.TO' });
  });
});

describe('toPriceAlertUpdate', () => {
  it('keeps the editable fields only', () => {
    expect(
      toPriceAlertUpdate({
        planId: 'plan-of-someone-else',
        targetValue: 42,
        triggeredAt: null
      })
    ).toEqual({ targetValue: 42 });
  });
});
