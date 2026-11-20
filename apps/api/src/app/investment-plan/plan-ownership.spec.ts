import type { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { NotFoundException } from '@nestjs/common';

import { InvestmentPlanService } from './investment-plan.service';
import { PriceAlertService } from './price-alert.service';

/**
 * Writes by id only touch a record of the plan of the user: the lookup is
 * scoped by planId and nothing is written when it finds nothing
 */
describe('writes by id are scoped to the plan of the user', () => {
  function makePrisma(found: boolean) {
    const model = () => ({
      delete: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(found ? { id: 'id-1' } : null),
      update: jest.fn().mockResolvedValue({ id: 'id-1' })
    });

    return {
      dcaSchedule: model(),
      investmentSignal: model(),
      priceAlert: model()
    };
  }

  function makeServices(found: boolean) {
    const prisma = makePrisma(found);
    const investmentPlanService = new InvestmentPlanService(
      prisma as unknown as PrismaService
    );
    const priceAlertService = new PriceAlertService(
      undefined,
      investmentPlanService,
      prisma as unknown as PrismaService
    );

    return { investmentPlanService, priceAlertService, prisma };
  }

  const writes = [
    {
      call: ({ investmentPlanService }: ReturnType<typeof makeServices>) =>
        investmentPlanService.updateDcaSchedule('plan-1', 'id-1', {
          isActive: false
        }),
      model: 'dcaSchedule',
      operation: 'update'
    },
    {
      call: ({ investmentPlanService }: ReturnType<typeof makeServices>) =>
        investmentPlanService.deleteDcaSchedule('plan-1', 'id-1'),
      model: 'dcaSchedule',
      operation: 'delete'
    },
    {
      call: ({ investmentPlanService }: ReturnType<typeof makeServices>) =>
        investmentPlanService.updateSignalStatus('plan-1', 'id-1', 'EXECUTED'),
      model: 'investmentSignal',
      operation: 'update'
    },
    {
      call: ({ priceAlertService }: ReturnType<typeof makeServices>) =>
        priceAlertService.updateAlert('plan-1', 'id-1', { targetValue: 1 }),
      model: 'priceAlert',
      operation: 'update'
    },
    {
      call: ({ priceAlertService }: ReturnType<typeof makeServices>) =>
        priceAlertService.rearmAlert('plan-1', 'id-1'),
      model: 'priceAlert',
      operation: 'update'
    },
    {
      call: ({ priceAlertService }: ReturnType<typeof makeServices>) =>
        priceAlertService.deleteAlert('plan-1', 'id-1'),
      model: 'priceAlert',
      operation: 'delete'
    }
  ] as const;

  it.each(writes)(
    '$model.$operation writes a record of the plan',
    async ({ call, model, operation }) => {
      const services = makeServices(true);

      await call(services);

      expect(services.prisma[model].findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'id-1', planId: 'plan-1' } })
      );
      expect(services.prisma[model][operation]).toHaveBeenCalledTimes(1);
    }
  );

  it.each(writes)(
    '$model.$operation refuses a record of another plan',
    async ({ call, model, operation }) => {
      const services = makeServices(false);

      await expect(call(services)).rejects.toBeInstanceOf(NotFoundException);
      expect(services.prisma[model][operation]).not.toHaveBeenCalled();
    }
  );
});
