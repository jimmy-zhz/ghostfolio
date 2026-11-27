import {
  formatAmount,
  formatPercent,
  formatShare,
  getAccountColors,
  getDistribution,
  hasGap
} from './fund-groups.util';

describe('fund-groups.util', () => {
  const sources = [
    {
      accounts: [
        { id: 'tfsa', name: 'TFSA', valueInBaseCurrency: 1000 },
        { id: 'fhsa', name: 'FHSA', valueInBaseCurrency: 3000 }
      ]
    },
    {
      accounts: [
        { id: 'di', name: 'DI', valueInBaseCurrency: 5000 },
        { id: 'tfsa', name: 'TFSA', valueInBaseCurrency: 500 }
      ]
    }
  ];

  it('gives the same account the same color in every row', () => {
    const colors = getAccountColors(sources);

    // Ordered by the value they hold: DI 5,000, FHSA 3,000, TFSA 1,500
    expect([...colors.keys()]).toEqual(['di', 'fhsa', 'tfsa']);
    expect(new Set(colors.values()).size).toBe(3);
  });

  it('splits a row into the shares of its accounts', () => {
    const colors = getAccountColors(sources);

    expect(getDistribution({ colors, accounts: sources[0].accounts })).toEqual([
      {
        color: colors.get('fhsa'),
        name: 'FHSA',
        share: 0.75,
        valueInBaseCurrency: 3000
      },
      {
        color: colors.get('tfsa'),
        name: 'TFSA',
        share: 0.25,
        valueInBaseCurrency: 1000
      }
    ]);
  });

  it('shows nothing for a row without value', () => {
    expect(
      getDistribution({
        accounts: [{ id: 'di', name: 'DI', valueInBaseCurrency: 0 }],
        colors: new Map()
      })
    ).toEqual([]);
  });

  it('formats amounts, returns and shares', () => {
    expect(formatAmount(12345.6, 'en-US')).toBe('12,346');
    expect(formatAmount(null, 'en-US')).toBe('');
    expect(formatPercent(0.065, 'en-US')).toBe('+6.5%');
    expect(formatPercent(-0.027, 'en-US')).toBe('-2.7%');
    expect(formatPercent(0, 'en-US')).toBe('0.0%');
    expect(formatShare(0.413, 'en-US')).toBe('41%');
  });

  it('treats a gap below one as rounding', () => {
    expect(hasGap(0.4)).toBe(false);
    expect(hasGap(-150)).toBe(true);
    expect(hasGap(null)).toBe(false);
  });
});
