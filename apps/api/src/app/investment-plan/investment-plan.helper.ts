import { Prisma } from '@prisma/client';

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
      data[field] = new Date(data[field] as string);
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
