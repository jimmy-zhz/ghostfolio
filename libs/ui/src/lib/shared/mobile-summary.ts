import { isNumber } from 'lodash-es';

// Builds the secondary line that the tables show below a row on small screens,
// where the columns of the less important fields are hidden

export const MOBILE_SUMMARY_SEPARATOR = ' · ';

export function formatSummaryNumber({
  locale,
  maximumFractionDigits = 2,
  minimumFractionDigits = 2,
  value
}: {
  locale?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  value: number;
}) {
  try {
    return value.toLocaleString(locale, {
      maximumFractionDigits,
      minimumFractionDigits,
      useGrouping: true
    });
  } catch {
    return String(value);
  }
}

/**
 * «quantity × unit price currency · fee · account», a zero fee is left out
 */
export function getActivitySummary({
  account,
  currency,
  feeLabel,
  fee,
  locale,
  quantity,
  unitPrice
}: {
  account?: string | null;
  currency?: string;
  fee?: number | null;
  feeLabel: string;
  locale?: string;
  quantity?: number | null;
  unitPrice?: number | null;
}) {
  const parts: string[] = [];

  if (isNumber(quantity) && isNumber(unitPrice)) {
    parts.push(
      [
        formatSummaryNumber({
          locale,
          maximumFractionDigits: 6,
          minimumFractionDigits: 0,
          value: quantity
        }),
        '×',
        formatSummaryNumber({ locale, value: unitPrice }),
        currency
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  if (isNumber(fee) && fee !== 0) {
    parts.push(`${feeLabel} ${formatSummaryNumber({ locale, value: fee })}`);
  }

  if (account) {
    parts.push(account);
  }

  return parts.join(MOBILE_SUMMARY_SEPARATOR);
}

/**
 * «symbol · value · allocation · quantity», fields without permission or
 * without a value (e.g. hidden in the restricted view) are left out
 */
export function getHoldingSummary({
  allocationInPercentage,
  hasPermissionToShowQuantities,
  hasPermissionToShowValues,
  locale,
  quantity,
  symbol,
  valueInBaseCurrency
}: {
  allocationInPercentage?: number | null;
  hasPermissionToShowQuantities: boolean;
  hasPermissionToShowValues: boolean;
  locale?: string;
  quantity?: number | null;
  symbol?: string;
  valueInBaseCurrency?: number | null;
}) {
  const parts: string[] = [];

  if (symbol) {
    parts.push(symbol);
  }

  if (hasPermissionToShowValues && isNumber(valueInBaseCurrency)) {
    parts.push(formatSummaryNumber({ locale, value: valueInBaseCurrency }));
  }

  if (isNumber(allocationInPercentage)) {
    parts.push(
      `${formatSummaryNumber({ locale, value: allocationInPercentage * 100 })}%`
    );
  }

  if (hasPermissionToShowQuantities && isNumber(quantity)) {
    parts.push(
      formatSummaryNumber({
        locale,
        maximumFractionDigits: 6,
        minimumFractionDigits: 0,
        value: quantity
      })
    );
  }

  return parts.join(MOBILE_SUMMARY_SEPARATOR);
}
