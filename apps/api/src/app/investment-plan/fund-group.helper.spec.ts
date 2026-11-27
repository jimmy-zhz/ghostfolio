import { BadRequestException } from '@nestjs/common';

import {
  FundGroupCheckActivity,
  getFundGroupChecks,
  getMonthsLeft,
  getProgress,
  getRemainderPrincipal,
  toFundGroupData
} from './fund-group.helper';

describe('toFundGroupData', () => {
  it('takes the fields of a source', () => {
    expect(
      toFundGroupData({
        kind: 'SOURCE',
        name: ' Mother ',
        note: 'Gift',
        planId: 'plan-of-someone-else',
        principal: 15000,
        tagId: 'tag-1'
      })
    ).toEqual({
      isRemainder: false,
      kind: 'SOURCE',
      name: 'Mother',
      note: 'Gift',
      principal: 15000,
      sortOrder: 0,
      tagId: 'tag-1',
      targetAmount: null,
      targetDate: null
    });
  });

  it('takes the fields of a purpose', () => {
    expect(
      toFundGroupData({
        kind: 'PURPOSE',
        name: 'Car',
        sortOrder: 2,
        tagId: 'tag-2',
        targetAmount: 30000,
        targetDate: '2027-06-30'
      })
    ).toMatchObject({
      kind: 'PURPOSE',
      principal: null,
      sortOrder: 2,
      targetAmount: 30000,
      targetDate: new Date('2027-06-30')
    });
  });

  it.each([
    [{ name: 'X', tagId: 't' }],
    [{ kind: 'ACCOUNT', name: 'X', tagId: 't' }],
    [{ kind: 'SOURCE', name: ' ', tagId: 't' }],
    [{ kind: 'SOURCE', name: 'X' }],
    [{ kind: 'SOURCE', name: 'X', principal: -1, tagId: 't' }],
    [{ kind: 'SOURCE', name: 'X', tagId: 't', targetAmount: 1 }],
    [
      { isRemainder: true, kind: 'SOURCE', name: 'X', principal: 1, tagId: 't' }
    ],
    [{ isRemainder: true, kind: 'PURPOSE', name: 'X', tagId: 't' }],
    [{ kind: 'PURPOSE', name: 'X', principal: 1, tagId: 't' }],
    [{ kind: 'PURPOSE', name: 'X', tagId: 't', targetDate: 'next year' }],
    [{ kind: 'PURPOSE', name: 'X', sortOrder: 1.5, tagId: 't' }]
  ])('rejects %j', (body) => {
    expect(() => toFundGroupData(body)).toThrow(BadRequestException);
  });
});

describe('getFundGroupChecks', () => {
  const activity = (
    id: string,
    symbol: string,
    tagIds: string[]
  ): FundGroupCheckActivity => {
    return {
      id,
      symbol,
      tagIds,
      date: new Date('2026-01-01'),
      quantity: 1,
      type: 'BUY'
    };
  };

  const activities = [
    activity('a1', 'XUS.TO', ['mother', 'car']),
    activity('a2', 'XUS.TO', ['savings']),
    activity('a3', 'XIC.TO', ['savings', 'car']),
    activity('a4', 'XIC.TO', []),
    activity('a5', 'VFV.TO', ['mother', 'savings', 'car', 'house'])
  ];

  const checks = getFundGroupChecks({
    activities,
    purposes: [
      { id: 'purpose-car', tagId: 'car' },
      { id: 'purpose-house', tagId: 'house' }
    ],
    sourceTagIds: ['mother', 'savings']
  });

  it('lists the activities without a source', () => {
    expect(checks.activitiesWithoutSource.count).toBe(1);
    expect(checks.activitiesWithoutSource.activities[0]).toMatchObject({
      id: 'a4'
    });
    expect(checks.activitiesWithoutSource.activities[0]).not.toHaveProperty(
      'tagIds'
    );
  });

  it('lists the activities with several sources or purposes', () => {
    expect(
      checks.activitiesWithMultipleSources.activities.map(({ id }) => id)
    ).toEqual(['a5']);
    expect(
      checks.activitiesWithMultiplePurposes.activities.map(({ id }) => id)
    ).toEqual(['a5']);
  });

  it('points out a symbol of which only some activities have the purpose', () => {
    expect(checks.partialPurposes).toEqual([
      { fundGroupId: 'purpose-car', symbol: 'XUS.TO', untaggedCount: 1 },
      { fundGroupId: 'purpose-car', symbol: 'XIC.TO', untaggedCount: 1 }
    ]);
  });

  it('checks nothing about sources as long as none is defined', () => {
    expect(
      getFundGroupChecks({ activities, purposes: [], sourceTagIds: [] })
        .activitiesWithoutSource.count
    ).toBe(0);
  });
});

describe('figures of the fund groups', () => {
  it('derives the principal of the remainder source', () => {
    expect(
      getRemainderPrincipal({
        principals: [2000, 10000, 15000, null],
        totalInvestment: 47467
      })
    ).toBe(20467);
  });

  it('computes the progress towards the target', () => {
    expect(
      getProgress({ targetAmount: 30000, valueInBaseCurrency: 12000 })
    ).toBe(0.4);
    expect(getProgress({ targetAmount: null, valueInBaseCurrency: 1 })).toBe(0);
  });

  it('counts the months left until the target date', () => {
    const now = new Date('2026-11-27');

    expect(getMonthsLeft({ now, targetDate: new Date('2027-06-30') })).toBe(7);
    expect(getMonthsLeft({ now, targetDate: new Date('2026-01-01') })).toBe(0);
    expect(getMonthsLeft({ now, targetDate: null })).toBeNull();
  });
});
