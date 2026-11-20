import {
  formatSummaryNumber,
  getActivitySummary,
  getHoldingSummary
} from './mobile-summary';

describe('mobile-summary', () => {
  describe('formatSummaryNumber', () => {
    it('formats with two fraction digits and grouping by default', () => {
      expect(formatSummaryNumber({ locale: 'en-US', value: 1234.5 })).toBe(
        '1,234.50'
      );
    });

    it('falls back to the plain number for an invalid locale', () => {
      expect(formatSummaryNumber({ locale: 'invalid_', value: 1.5 })).toBe(
        '1.5'
      );
    });
  });

  describe('getActivitySummary', () => {
    it('joins quantity × unit price, fee and account', () => {
      expect(
        getActivitySummary({
          account: 'Broker',
          currency: 'USD',
          fee: 1.2,
          feeLabel: 'Fee',
          locale: 'en-US',
          quantity: 10.5,
          unitPrice: 123.456
        })
      ).toBe('10.5 × 123.46 USD · Fee 1.20 · Broker');
    });

    it('leaves out a zero fee and a missing account', () => {
      expect(
        getActivitySummary({
          currency: 'USD',
          fee: 0,
          feeLabel: 'Fee',
          locale: 'en-US',
          quantity: 1,
          unitPrice: 100
        })
      ).toBe('1 × 100.00 USD');
    });

    it('leaves out quantity × unit price when one of them is missing', () => {
      expect(
        getActivitySummary({
          account: 'Broker',
          fee: 2,
          feeLabel: 'Fee',
          locale: 'en-US',
          quantity: null,
          unitPrice: 100
        })
      ).toBe('Fee 2.00 · Broker');
    });
  });

  describe('getHoldingSummary', () => {
    const holding = {
      allocationInPercentage: 0.2534,
      locale: 'en-US',
      quantity: 12.345678,
      symbol: 'VOO',
      valueInBaseCurrency: 98765.4321
    };

    it('joins symbol, value, allocation and quantity', () => {
      expect(
        getHoldingSummary({
          ...holding,
          hasPermissionToShowQuantities: true,
          hasPermissionToShowValues: true
        })
      ).toBe('VOO · 98,765.43 · 25.34% · 12.345678');
    });

    it('leaves out the fields without permission', () => {
      expect(
        getHoldingSummary({
          ...holding,
          hasPermissionToShowQuantities: false,
          hasPermissionToShowValues: false
        })
      ).toBe('VOO · 25.34%');
    });

    it('leaves out values hidden in the restricted view', () => {
      expect(
        getHoldingSummary({
          ...holding,
          hasPermissionToShowQuantities: true,
          hasPermissionToShowValues: true,
          quantity: null,
          valueInBaseCurrency: null
        })
      ).toBe('VOO · 25.34%');
    });
  });
});
