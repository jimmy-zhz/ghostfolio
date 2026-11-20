import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
  return pickFields(body, [
    'condition',
    'dataSource',
    'isActive',
    'messageTemplate',
    'name',
    'symbol',
    'targetValue'
  ]) as Prisma.PriceAlertUncheckedUpdateInput;
}

function pickFields(body: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(
    fields
      .filter((field) => body?.[field] !== undefined)
      .map((field) => [field, body[field]])
  );
}
