import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import type { MailService } from '@ghostfolio/api/services/mail/mail.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';
import { AssetProfileIdentifier } from '@ghostfolio/common/interfaces';
import {
  PriceAlertClose,
  describePriceAlertEvaluation,
  describePriceAlertRule,
  evaluatePriceAlert,
  getLookbackDays,
  isPriceAlertConditionMet
} from '@ghostfolio/common/price-alert-rule';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PriceAlert, PriceAlertRuleType, Prisma } from '@prisma/client';

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
    planId: string,
    id: string,
    data: Prisma.PriceAlertUncheckedUpdateInput
  ): Promise<PriceAlert> {
    await this.assertAlertOfPlan(planId, id);

    return this.prismaService.priceAlert.update({ data, where: { id } });
  }

  public async deleteAlert(planId: string, id: string): Promise<void> {
    await this.assertAlertOfPlan(planId, id);

    await this.prismaService.priceAlert.delete({ where: { id } });
  }

  public async rearmAlert(planId: string, id: string): Promise<PriceAlert> {
    await this.assertAlertOfPlan(planId, id);

    return this.prismaService.priceAlert.update({
      data: { isActive: true, triggeredAt: null, triggeredValue: null },
      where: { id }
    });
  }

  public async checkAndTriggerAlertsForPlans(
    plans: PlanWithRelations[],
    mailService: MailService,
    {
      getAverageCost,
      now = new Date()
    }: {
      /** Average cost of a position of the user, for PCT_FROM_COST */
      getAverageCost?: (
        holding: AssetProfileIdentifier & { userId: string }
      ) => Promise<number | undefined>;
      now?: Date;
    } = {}
  ): Promise<void> {
    const isEvaluable = (alert: PriceAlert) => {
      return alert.isActive && !this.isTriggeredToday({ alert, now });
    };

    const eligiblePlans = plans.filter(
      (plan) =>
        ((plan.emailEnabled && plan.notifyEmail) ||
          (plan.webhookEnabled && plan.webhookUrl)) &&
        plan.subscribePriceAlert &&
        plan.priceAlerts?.some(isEvaluable)
    );

    if (eligiblePlans.length === 0) {
      return;
    }

    const evaluableAlerts = eligiblePlans.flatMap((plan) => {
      return plan.priceAlerts.filter(isEvaluable);
    });

    this.logger.log(
      `Checking ${evaluableAlerts.length} active price alert(s) across ${eligiblePlans.length} plan(s)`
    );

    const uniqueSymbols = new Map<
      string,
      { dataSource: PriceAlert['dataSource']; symbol: string }
    >();

    for (const alert of evaluableAlerts) {
      uniqueSymbols.set(`${alert.dataSource}-${alert.symbol}`, {
        dataSource: alert.dataSource,
        symbol: alert.symbol
      });
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

    const closesBySymbol = await this.getCloses({ alerts: evaluableAlerts, now });
    const averageCosts = new Map<string, Promise<number | undefined>>();

    for (const plan of eligiblePlans) {
      for (const alert of plan.priceAlerts) {
        if (!isEvaluable(alert)) continue;

        const assetProfileIdentifier = getAssetProfileIdentifier({
          dataSource: alert.dataSource,
          symbol: alert.symbol
        });
        const currentValue = quotes[assetProfileIdentifier]?.marketPrice;

        if (currentValue === undefined || currentValue === null) {
          this.logger.warn(`No live quote returned for ${alert.symbol} (${alert.dataSource})`);
          continue;
        }

        let averageCost: number | undefined;

        if (alert.ruleType === PriceAlertRuleType.PCT_FROM_COST && getAverageCost) {
          const key = `${plan.userId}-${assetProfileIdentifier}`;

          if (!averageCosts.has(key)) {
            averageCosts.set(
              key,
              getAverageCost({
                dataSource: alert.dataSource,
                symbol: alert.symbol,
                userId: plan.userId
              }).catch((error) => {
                this.logger.warn(`No average cost of ${alert.symbol}: ${error}`);
                return undefined;
              })
            );
          }

          averageCost = await averageCosts.get(key);
        }

        const evaluation = evaluatePriceAlert({
          averageCost,
          currentPrice: currentValue,
          closes: closesBySymbol.get(assetProfileIdentifier),
          rule: alert
        });

        if ('missing' in evaluation) {
          // Not enough data never triggers an alert
          this.logger.warn(
            `${alert.symbol} ${describePriceAlertRule(alert)} not evaluated: ${evaluation.missing}`
          );
          continue;
        }

        const isMet = isPriceAlertConditionMet({
          condition: alert.condition,
          targetValue: alert.targetValue,
          value: evaluation.metric
        });

        this.logger.log(
          `${alert.symbol} current=${currentValue} ${describePriceAlertRule(alert)}: ${isMet ? 'MET' : 'not met'} (${describePriceAlertEvaluation(evaluation)})`
        );

        if (!isMet) {
          continue;
        }

        try {
          let emailSent = false;
          if (plan.emailEnabled && plan.notifyEmail) {
            emailSent = await mailService.sendPriceAlertEmail(
              plan.notifyEmail,
              alert,
              currentValue,
              evaluation
            );
          }

          let webhookSent = false;
          if (plan.webhookEnabled && plan.webhookUrl) {
            webhookSent = await this.investmentPlanService.sendWebhook(plan.webhookUrl, {
              alert,
              currentValue,
              evaluation,
              event: 'price_alert',
              planId: plan.id
            });
          } else {
            this.logger.warn(
              `Webhook skipped for ${alert.symbol}: webhookEnabled=${plan.webhookEnabled}, webhookUrl=${plan.webhookUrl ? 'set' : 'empty'}`
            );
          }

          if (emailSent || webhookSent) {
            // A daily change fires at most once a day and stays active, every
            // other rule fires once and has to be rearmed
            const isDaily = alert.ruleType === PriceAlertRuleType.DAILY_CHANGE;

            await this.prismaService.priceAlert.update({
              data: {
                isActive: isDaily,
                triggeredAt: now,
                triggeredValue: currentValue
              },
              where: { id: alert.id }
            });
            this.logger.log(
              `Price alert notified for ${alert.symbol}, alert ${isDaily ? 'paused until tomorrow' : 'deactivated'}`
            );
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

  /**
   * The closes before today, the most recent first, as many as the rules of
   * the alerts of a symbol need. Carried forward prices are no trading days.
   */
  private async getCloses({
    alerts,
    now
  }: {
    alerts: PriceAlert[];
    now: Date;
  }) {
    const countBySymbol = new Map<string, AssetProfileIdentifier & { count: number }>();

    for (const alert of alerts) {
      const count =
        alert.ruleType === PriceAlertRuleType.PCT_FROM_HIGH
          ? getLookbackDays(alert)
          : alert.ruleType === PriceAlertRuleType.DAILY_CHANGE
            ? 1
            : 0;

      if (count === 0) continue;

      const key = getAssetProfileIdentifier(alert);
      const existing = countBySymbol.get(key);

      countBySymbol.set(key, {
        count: Math.max(count, existing?.count ?? 0),
        dataSource: alert.dataSource,
        symbol: alert.symbol
      });
    }

    const closesBySymbol = new Map<string, PriceAlertClose[]>();

    for (const [key, { count, dataSource, symbol }] of countBySymbol) {
      const closes = await this.prismaService.marketData.findMany({
        orderBy: { date: 'desc' },
        select: { date: true, marketPrice: true },
        take: count,
        where: {
          dataSource,
          symbol,
          date: { lt: startOfUtcDay(now) },
          isCarriedForward: false,
          state: 'CLOSE'
        }
      });

      closesBySymbol.set(key, closes);
    }

    return closesBySymbol;
  }

  private isTriggeredToday({ alert, now }: { alert: PriceAlert; now: Date }) {
    return (
      alert.ruleType === PriceAlertRuleType.DAILY_CHANGE &&
      !!alert.triggeredAt &&
      alert.triggeredAt >= startOfUtcDay(now)
    );
  }

  /**
   * Updates and deletes by id must stay within the plan of the user
   */
  private async assertAlertOfPlan(planId: string, id: string) {
    const alert = await this.prismaService.priceAlert.findFirst({
      select: { id: true },
      where: { id, planId }
    });

    if (!alert) {
      throw new NotFoundException(`Price alert ${id} not found`);
    }
  }
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
