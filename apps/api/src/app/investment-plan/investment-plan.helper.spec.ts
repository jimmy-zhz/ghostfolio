import {
  toDcaScheduleUpdate,
  toPriceAlertUpdate
} from './investment-plan.helper';

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
