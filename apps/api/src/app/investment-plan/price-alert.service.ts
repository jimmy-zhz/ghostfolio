import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import type { MailService } from '@ghostfolio/api/services/mail/mail.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable, Logger } from '@nestjs/common';
import { AlertCondition, PriceAlert, Prisma } from '@prisma/client';

import { InvestmentPlanService, PlanWithRelations } from './investment-plan.service';

@Injectable()
export class PriceAlertService {
  private readonly logger = new Logger(PriceAlertService.name);

  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly investmentPlanService: InvestmentPlanService,
    private readonly prismaService: PrismaService
  ) {}

  public async createAlert(
    planId: string,
    data: Omit<Prisma.PriceAlertUncheckedCreateInput, 'planId'>
  ): Promise<PriceAlert> {
    return this.prismaService.priceAlert.create({
      data: { ...data, planId }
    });
  }

  public async updateAlert(
    id: string,
    data: Prisma.PriceAlertUpdateInput
  ): Promise<PriceAlert> {
    return this.prismaService.priceAlert.update({ data, where: { id } });
  }

  public async deleteAlert(id: string): Promise<void> {
    await this.prismaService.priceAlert.delete({ where: { id } });
  }

  public async rearmAlert(id: string): Promise<PriceAlert> {
    return this.prismaService.priceAlert.update({
      data: { isActive: true, triggeredAt: null, triggeredValue: null },
      where: { id }
    });
  }

  public async checkAndTriggerAlertsForPlans(
    plans: PlanWithRelations[],
    mailService: MailService
  ): Promise<void> {
    const eligiblePlans = plans.filter(
      (plan) =>
        ((plan.emailEnabled && plan.notifyEmail) ||
          (plan.webhookEnabled && plan.webhookUrl)) &&
        plan.subscribePriceAlert &&
        plan.priceAlerts?.some((alert) => alert.isActive)
    );

    if (eligiblePlans.length === 0) {
      return;
    }

    const totalActiveAlerts = eligiblePlans.reduce(
      (sum, plan) => sum + plan.priceAlerts.filter((alert) => alert.isActive).length,
      0
    );
    this.logger.log(
      `Checking ${totalActiveAlerts} active price alert(s) across ${eligiblePlans.length} plan(s)`
    );

    const uniqueSymbols = new Map<
      string,
      { dataSource: PriceAlert['dataSource']; symbol: string }
    >();

    for (const plan of eligiblePlans) {
      for (const alert of plan.priceAlerts) {
        if (!alert.isActive) continue;
        uniqueSymbols.set(`${alert.dataSource}-${alert.symbol}`, {
          dataSource: alert.dataSource,
          symbol: alert.symbol
        });
      }
    }

    let quotes: Awaited<ReturnType<DataProviderService['getQuotes']>> = {};
    try {
      quotes = await this.dataProviderService.getQuotes({
        items: Array.from(uniqueSymbols.values()),
        useCache: false
      });
    } catch (error) {
      this.logger.error(`Failed to fetch live quotes for price alerts: ${error}`);
      return;
    }

    for (const plan of eligiblePlans) {
      for (const alert of plan.priceAlerts) {
        if (!alert.isActive) continue;

        const quote = quotes[alert.symbol];
        const currentValue = quote?.marketPrice;

        if (currentValue === undefined || currentValue === null) {
          this.logger.warn(`No live quote returned for ${alert.symbol} (${alert.dataSource})`);
          continue;
        }

        this.logger.log(
          `${alert.symbol} current=${currentValue} target=${this.isConditionMet(alert.condition, currentValue, alert.targetValue) ? 'MET' : 'not met'} (${alert.condition} ${alert.targetValue})`
        );

        if (!this.isConditionMet(alert.condition, currentValue, alert.targetValue)) {
          continue;
        }

        try {
          let emailSent = false;
          if (plan.emailEnabled && plan.notifyEmail) {
            emailSent = await mailService.sendPriceAlertEmail(
              plan.notifyEmail,
              alert,
              currentValue
            );
          }

          let webhookSent = false;
          if (plan.webhookEnabled && plan.webhookUrl) {
            webhookSent = await this.investmentPlanService.sendWebhook(plan.webhookUrl, {
              alert,
              currentValue,
              event: 'price_alert',
              planId: plan.id
            });
          }

          if (emailSent || webhookSent) {
            await this.prismaService.priceAlert.update({
              data: {
                isActive: false,
                triggeredAt: new Date(),
                triggeredValue: currentValue
              },
              where: { id: alert.id }
            });
            this.logger.log(`Price alert notified for ${alert.symbol}, alert deactivated`);
          } else {
            this.logger.warn(
              `Price alert notification failed for ${alert.symbol} (check SMTP_USER/webhook config)`
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to send price alert notification for ${alert.symbol}: ${error}`
          );
        }
      }
    }
  }

  private isConditionMet(
    condition: AlertCondition,
    currentValue: number,
    targetValue: number
  ): boolean {
    switch (condition) {
      case AlertCondition.GREATER_THAN:
        return currentValue > targetValue;
      case AlertCondition.GREATER_THAN_OR_EQUAL:
        return currentValue >= targetValue;
      case AlertCondition.LESS_THAN:
        return currentValue < targetValue;
      case AlertCondition.LESS_THAN_OR_EQUAL:
        return currentValue <= targetValue;
      default:
        return false;
    }
  }
}
