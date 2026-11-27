import { BadRequestException } from '@nestjs/common';
import { PriceAlertRuleType, Prisma } from '@prisma/client';

/**
 * An allocation group needs at least one symbol: an empty list would remove
 * every symbol of the group (or fail on the default name)
 */
export function assertAllocationGroupSymbols(symbols: unknown) {
  if (
    !Array.isArray(symbols) ||
    symbols.length === 0 ||
    !symbols.every((entry) => {
      return typeof entry?.symbol === 'string' && entry.symbol.length > 0;
    })
  ) {
    throw new BadRequestException(
      'symbols must be a non-empty list of { symbol, name? }'
    );
  }
}

/**
 * Takes the editable fields only: the body must never reach Prisma as is,
 * where it could reassign the record to another plan or write through its
 * relations
 */
export function toDcaScheduleUpdate(
  body: Record<string, unknown>
): Prisma.DcaScheduleUncheckedUpdateInput {
  const data = pickFields(body, [
    'deadlineDay',
    'endDate',
    'isActive',
    'signalType',
    'startDate',
    'symbol',
    'totalBudget',
    'type',
    'weeklyBudget'
  ]);

  for (const field of ['endDate', 'startDate']) {
    if (typeof data[field] === 'string') {
      const date = new Date(data[field] as string);

      if (isNaN(date.getTime())) {
        throw new BadRequestException(`${field} must be an ISO date`);
      }

      data[field] = date;
    }
  }

  return data as Prisma.DcaScheduleUncheckedUpdateInput;
}

export function toPriceAlertUpdate(
  body: Record<string, unknown>
): Prisma.PriceAlertUncheckedUpdateInput {
  return {
    ...pickFields(body, [
      'condition',
      'dataSource',
      'isActive',
      'messageTemplate',
      'name',
      'symbol',
      'targetValue'
    ]),
    ...toPriceAlertRuleFields(body)
  } as Prisma.PriceAlertUncheckedUpdateInput;
}

/**
 * The rule of a price alert, see libs/common price-alert-rule. Only the given
 * fields, checked
 */
export function toPriceAlertRuleFields(body: Record<string, unknown>) {
  const fields: {
    actionNote?: string | null;
    lookbackDays?: number | null;
    ruleType?: PriceAlertRuleType;
  } = {};

  if (body?.ruleType !== undefined) {
    if (
      !Object.values(PriceAlertRuleType).includes(
        body.ruleType as PriceAlertRuleType
      )
    ) {
      throw new BadRequestException(
        `ruleType must be one of ${Object.values(PriceAlertRuleType).join(', ')}`
      );
    }

    fields.ruleType = body.ruleType as PriceAlertRuleType;
  }

  if (body?.lookbackDays !== undefined) {
    if (
      body.lookbackDays !== null &&
      (!Number.isInteger(body.lookbackDays) ||
        (body.lookbackDays as number) < 2 ||
        (body.lookbackDays as number) > 1000)
    ) {
      throw new BadRequestException(
        'lookbackDays must be a whole number from 2 to 1000'
      );
    }

    fields.lookbackDays = body.lookbackDays as number | null;
  }

  if (body?.actionNote !== undefined) {
    if (body.actionNote !== null && typeof body.actionNote !== 'string') {
      throw new BadRequestException('actionNote must be a text');
    }

    fields.actionNote = (body.actionNote as string | null)?.trim() || null;
  }

  return fields;
}

function pickFields(body: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(
    fields
      .filter((field) => body?.[field] !== undefined)
      .map((field) => [field, body[field]])
  );
}
