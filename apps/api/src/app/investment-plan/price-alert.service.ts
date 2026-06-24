import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { MailService } from '@ghostfolio/api/services/mail/mail.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable, Logger } from '@nestjs/common';
import { AlertCondition, PriceAlert, Prisma } from '@prisma/client';

import { PlanWithRelations } from './investment-plan.service';

@Injectable()
export class PriceAlertService {
  private readonly logger = new Logger(PriceAlertService.name);

  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly mailService: MailService,
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
    plans: PlanWithRelations[]
  ): Promise<void> {
    const eligiblePlans = plans.filter(
      (plan) =>
        plan.emailEnabled &&
        plan.notifyEmail &&
        plan.priceAlerts?.some((alert) => alert.isActive)
    );

    if (eligiblePlans.length === 0) {
      return;
    }

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
          continue;
        }

        if (!this.isConditionMet(alert.condition, currentValue, alert.targetValue)) {
          continue;
        }

        try {
          const sent = await this.mailService.sendPriceAlertEmail(
            plan.notifyEmail,
            alert,
            currentValue
          );

          if (sent) {
            await this.prismaService.priceAlert.update({
              data: {
                isActive: false,
                triggeredAt: new Date(),
                triggeredValue: currentValue
              },
              where: { id: alert.id }
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to send price alert email for ${alert.symbol}: ${error}`
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
