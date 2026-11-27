import type { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import type { MailService } from '@ghostfolio/api/services/mail/mail.service';
import type { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { AlertCondition } from '@prisma/client';

import { InvestmentPlanService, PlanWithRelations } from './investment-plan.service';
import { PriceAlertService } from './price-alert.service';

function makePlan(overrides: Partial<PlanWithRelations> = {}): PlanWithRelations {
  return {
    allocations: [],
    dcaSchedules: [],
    emailEnabled: false,
    id: 'plan-1',
    notifyEmail: null,
    priceAlerts: [
      {
        condition: AlertCondition.GREATER_THAN,
        dataSource: 'YAHOO' as any,
        id: 'alert-1',
        isActive: true,
        messageTemplate: '{{symbol}} hit {{value}}',
        name: 'Test alert',
        planId: 'plan-1',
        symbol: 'XIC.TO',
        targetValue: 10
      } as any
    ],
    subscribeDca: true,
    subscribePriceAlert: true,
    subscribeRebalancing: true,
    userId: 'user-1',
    webhookEnabled: false,
    webhookUrl: null,
    ...overrides
  } as PlanWithRelations;
}

describe('PriceAlertService.checkAndTriggerAlertsForPlans channel handling', () => {
  function buildService(currentValue: number) {
    const dataProviderService = {
      getQuotes: jest.fn().mockResolvedValue({
        'YAHOO-XIC.TO': { marketPrice: currentValue }
      })
    } as unknown as DataProviderService;

    const investmentPlanService = {
      sendWebhook: jest.fn().mockResolvedValue(true)
    } as unknown as InvestmentPlanService;

    const prismaService = {
      priceAlert: { update: jest.fn().mockResolvedValue({}) }
    } as unknown as PrismaService;

    const mailService = {
      sendPriceAlertEmail: jest.fn().mockResolvedValue(true)
    } as unknown as MailService;

    const service = new PriceAlertService(
      dataProviderService,
      investmentPlanService,
      prismaService
    );

    return { dataProviderService, investmentPlanService, mailService, prismaService, service };
  }

  it('sends the webhook (not email) for a plan with only webhook notifications enabled', async () => {
    const { investmentPlanService, mailService, prismaService, service } = buildService(11);
    const plan = makePlan({ webhookEnabled: true, webhookUrl: 'https://example.com/webhook' });

    await service.checkAndTriggerAlertsForPlans([plan], mailService);

    expect(investmentPlanService.sendWebhook).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({ event: 'price_alert', planId: 'plan-1' })
    );
    expect(mailService.sendPriceAlertEmail).not.toHaveBeenCalled();
    expect(prismaService.priceAlert.update).toHaveBeenCalled();
  });

  it('sends the email (not webhook) for a plan with only email notifications enabled', async () => {
    const { investmentPlanService, mailService, service } = buildService(11);
    const plan = makePlan({ emailEnabled: true, notifyEmail: 'user@example.com' });

    await service.checkAndTriggerAlertsForPlans([plan], mailService);

    expect(mailService.sendPriceAlertEmail).toHaveBeenCalled();
    expect(investmentPlanService.sendWebhook).not.toHaveBeenCalled();
  });

  it('skips plans where neither channel is enabled, regardless of subscribePriceAlert', async () => {
    const { investmentPlanService, mailService, service } = buildService(11);
    const plan = makePlan({ subscribePriceAlert: true });

    await service.checkAndTriggerAlertsForPlans([plan], mailService);

    expect(mailService.sendPriceAlertEmail).not.toHaveBeenCalled();
    expect(investmentPlanService.sendWebhook).not.toHaveBeenCalled();
  });

  it('skips a plan with both channels enabled when subscribePriceAlert is off', async () => {
    const { investmentPlanService, mailService, service } = buildService(11);
    const plan = makePlan({
      emailEnabled: true,
      notifyEmail: 'user@example.com',
      subscribePriceAlert: false,
      webhookEnabled: true,
      webhookUrl: 'https://example.com/webhook'
    });

    await service.checkAndTriggerAlertsForPlans([plan], mailService);

    expect(mailService.sendPriceAlertEmail).not.toHaveBeenCalled();
    expect(investmentPlanService.sendWebhook).not.toHaveBeenCalled();
  });
});

describe('PriceAlertService.checkAndTriggerAlertsForPlans rules', () => {
  const now = new Date('2026-11-27T15:00:00Z');

  function buildService({
    closes = [],
    currentValue
  }: {
    closes?: number[];
    currentValue: number;
  }) {
    const dataProviderService = {
      getQuotes: jest.fn().mockResolvedValue({
        'YAHOO-XIC.TO': { marketPrice: currentValue }
      })
    } as unknown as DataProviderService;

    const investmentPlanService = {
      sendWebhook: jest.fn().mockResolvedValue(true)
    } as unknown as InvestmentPlanService;

    const prismaService = {
      marketData: {
        findMany: jest.fn().mockImplementation(({ take }) => {
          return Promise.resolve(
            closes.slice(0, take).map((marketPrice, index) => {
              return {
                marketPrice,
                date: new Date(Date.UTC(2026, 10, 26 - index))
              };
            })
          );
        })
      },
      priceAlert: { update: jest.fn().mockResolvedValue({}) }
    };

    const mailService = {
      sendPriceAlertEmail: jest.fn().mockResolvedValue(true)
    } as unknown as MailService;

    const service = new PriceAlertService(
      dataProviderService,
      investmentPlanService,
      prismaService as unknown as PrismaService
    );

    return { investmentPlanService, mailService, prismaService, service };
  }

  function planWithAlert(alert: Record<string, unknown>) {
    return makePlan({
      priceAlerts: [
        {
          condition: AlertCondition.LESS_THAN_OR_EQUAL,
          dataSource: 'YAHOO',
          id: 'alert-1',
          isActive: true,
          messageTemplate: '',
          planId: 'plan-1',
          symbol: 'XIC.TO',
          ...alert
        } as any
      ],
      webhookEnabled: true,
      webhookUrl: 'https://example.com/webhook'
    });
  }

  it('fires a drop from the high with the high as reference', async () => {
    const { investmentPlanService, mailService, prismaService, service } =
      buildService({ closes: [45, 47.2, 46], currentValue: 40 });

    await service.checkAndTriggerAlertsForPlans(
      [
        planWithAlert({
          lookbackDays: 3,
          ruleType: 'PCT_FROM_HIGH',
          targetValue: -15
        })
      ],
      mailService,
      { now }
    );

    expect(prismaService.marketData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        where: expect.objectContaining({
          date: { lt: new Date('2026-11-27T00:00:00Z') },
          isCarriedForward: false,
          symbol: 'XIC.TO'
        })
      })
    );
    expect(investmentPlanService.sendWebhook).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        evaluation: expect.objectContaining({
          reference: expect.objectContaining({ kind: 'high', value: 47.2 })
        })
      })
    );
    expect(prismaService.priceAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false })
      })
    );
  });

  it('never fires without enough closes', async () => {
    const { investmentPlanService, mailService, service } = buildService({
      closes: [45, 47.2],
      currentValue: 1
    });

    await service.checkAndTriggerAlertsForPlans(
      [planWithAlert({ ruleType: 'PCT_FROM_HIGH', targetValue: -15 })],
      mailService,
      { now }
    );

    expect(investmentPlanService.sendWebhook).not.toHaveBeenCalled();
  });

  it('compares with the average cost of the position of the user', async () => {
    const { investmentPlanService, mailService, service } = buildService({
      currentValue: 79
    });
    const getAverageCost = jest.fn().mockResolvedValue(78.95);

    await service.checkAndTriggerAlertsForPlans(
      [
        planWithAlert({
          condition: AlertCondition.GREATER_THAN_OR_EQUAL,
          ruleType: 'PCT_FROM_COST',
          targetValue: 0
        })
      ],
      mailService,
      { getAverageCost, now }
    );

    expect(getAverageCost).toHaveBeenCalledWith({
      dataSource: 'YAHOO',
      symbol: 'XIC.TO',
      userId: 'user-1'
    });
    expect(investmentPlanService.sendWebhook).toHaveBeenCalled();
  });

  it('keeps a daily change active, and fires it at most once a day', async () => {
    const { investmentPlanService, mailService, prismaService, service } =
      buildService({ closes: [100], currentValue: 96 });
    const alert = {
      ruleType: 'DAILY_CHANGE',
      targetValue: -3
    };

    await service.checkAndTriggerAlertsForPlans(
      [planWithAlert(alert)],
      mailService,
      { now }
    );

    expect(prismaService.priceAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: true, triggeredAt: now, triggeredValue: 96 }
      })
    );

    // Already fired today
    await service.checkAndTriggerAlertsForPlans(
      [planWithAlert({ ...alert, triggeredAt: new Date('2026-11-27T14:00:00Z') })],
      mailService,
      { now }
    );

    expect(investmentPlanService.sendWebhook).toHaveBeenCalledTimes(1);

    // The next day it fires again
    await service.checkAndTriggerAlertsForPlans(
      [planWithAlert({ ...alert, triggeredAt: new Date('2026-11-26T15:00:00Z') })],
      mailService,
      { now }
    );

    expect(investmentPlanService.sendWebhook).toHaveBeenCalledTimes(2);
  });
});
