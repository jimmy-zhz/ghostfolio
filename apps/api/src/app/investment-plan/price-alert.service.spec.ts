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
