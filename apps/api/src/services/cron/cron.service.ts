import { DcaSignalService } from '@ghostfolio/api/app/investment-plan/dca-signal.service';
import { InvestmentPlanService } from '@ghostfolio/api/app/investment-plan/investment-plan.service';
import { PriceAlertService } from '@ghostfolio/api/app/investment-plan/price-alert.service';
import { RebalancingService } from '@ghostfolio/api/app/investment-plan/rebalancing.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { MailService } from '@ghostfolio/api/services/mail/mail.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { DataGatheringService } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.service';
import { StatisticsGatheringService } from '@ghostfolio/api/services/queues/statistics-gathering/statistics-gathering.service';
import { TwitterBotService } from '@ghostfolio/api/services/twitter-bot/twitter-bot.service';
import {
  DATA_GATHERING_QUEUE_PRIORITY_LOW,
  GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
  GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
  PROPERTY_IS_DATA_GATHERING_ENABLED
} from '@ghostfolio/common/config';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';
import type { RequestWithUser } from '@ghostfolio/common/types';

import { Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronService {
  private static readonly EVERY_HOUR_AT_RANDOM_MINUTE = `${new Date().getMinutes()} * * * *`;
  private static readonly EVERY_SUNDAY_AT_LUNCH_TIME = '0 12 * * 0';

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly dataGatheringService: DataGatheringService,
    private readonly dcaSignalService: DcaSignalService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly investmentPlanService: InvestmentPlanService,
    private readonly moduleRef: ModuleRef,
    private readonly priceAlertService: PriceAlertService,
    private readonly propertyService: PropertyService,
    private readonly rebalancingService: RebalancingService,
    private readonly statisticsGatheringService: StatisticsGatheringService,
    private readonly twitterBotService: TwitterBotService,
    private readonly userService: UserService
  ) {}

  /**
   * PortfolioService is request-scoped (it injects REQUEST), and MailService
   * is transitively request-scoped too (MailService -> AiService ->
   * PortfolioService). Injecting either directly into CronService's (or
   * PriceAlertService's) constructor makes the whole dependency tree
   * request-scoped, which silently breaks ALL @Cron registrations on this
   * class (Nest logs "Cannot register cron job ... non static provider").
   * Resolve a fresh instance per cron run instead, backed by a real user
   * fetched from the DB (same shape the JwtStrategy would attach to a
   * request), so any internal `this.request.user...` lookups work.
   */
  private async resolveRequestScoped<T>(type: new (...args: any[]) => T, userId: string): Promise<T> {
    const user = await this.userService.user({ id: userId });
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { user } as RequestWithUser,
      contextId
    );
    return this.moduleRef.resolve(type, contextId, { strict: false });
  }

  @Cron(CronExpression.EVERY_HOUR)
  public async runEveryHour() {
    if (this.configurationService.get('ENABLE_FEATURE_STATISTICS')) {
      await this.statisticsGatheringService.addJobsToQueue();
    }
  }

  @Cron(CronService.EVERY_HOUR_AT_RANDOM_MINUTE)
  public async runEveryHourAtRandomMinute() {
    if (await this.isDataGatheringEnabled()) {
      await this.dataGatheringService.gather7Days();
    }
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  public async runEveryTwelveHours() {
    await this.exchangeRateDataService.loadCurrencies();
  }

  @Cron(CronExpression.EVERY_DAY_AT_5PM)
  public async runEveryDayAtFivePm() {
    if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
      this.twitterBotService.tweetFearAndGreedIndex();
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async runEveryDayAtMidnight() {
    if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
      this.userService.resetAnalytics();
    }
  }

  @Cron(CronService.EVERY_SUNDAY_AT_LUNCH_TIME)
  public async runEverySundayAtTwelvePm() {
    if (await this.isDataGatheringEnabled()) {
      const assetProfileIdentifiers =
        await this.dataGatheringService.getActiveAssetProfileIdentifiers({
          maxAge: '60 days'
        });

      await this.dataGatheringService.addJobsToQueue(
        assetProfileIdentifiers.map(({ dataSource, symbol }) => {
          return {
            data: {
              dataSource,
              symbol
            },
            name: GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
            opts: {
              ...GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
              jobId: getAssetProfileIdentifier({ dataSource, symbol }),
              priority: DATA_GATHERING_QUEUE_PRIORITY_LOW
            }
          };
        })
      );
    }
  }

  @Cron('0 9 * * 1-5')
  public async runInvestmentSignals() {
    const plans = await this.investmentPlanService.getAllActivePlans();

    for (const plan of plans) {
      // 1. Generate DCA signals — only while the master email switch is on
      if (plan.emailEnabled && plan.notifyEmail) {
        await this.dcaSignalService.generateSignalsForPlan(plan.id, plan.dcaSchedules);
      }

      // 2. Generate Rebalancing signals (at most once per week, deduped in service)
      if (plan.allocations?.length > 0) {
        try {
          const portfolioService = await this.resolveRequestScoped(PortfolioService, plan.userId);
          const { holdings } = await portfolioService.getDetails({
            filters: [],
            impersonationId: undefined,
            userId: plan.userId,
            withMarkets: false
          });
          await this.rebalancingService.generateRebalancingSignals(
            plan.id,
            plan.allocations,
            holdings,
            plan.longTermGrowthTarget ?? 0
          );
        } catch {
          // ignore if portfolio data unavailable for this user
        }
      }

      // 3. Send email with all pending actionable signals
      if (plan.emailEnabled && plan.notifyEmail) {
        const signals = await this.investmentPlanService.getPendingSignals(plan.id);
        const actionableSignals = signals.filter(
          (s) => s.type !== 'DCA_WAIT' && !s.emailSent
        );

        if (actionableSignals.length > 0) {
          // Gather holdings summary for AI prompt context
          let portfolioSummary: { symbol: string; currentWeight: number; value: number }[] = [];
          try {
            const portfolioService = await this.resolveRequestScoped(PortfolioService, plan.userId);
            const { holdings } = await portfolioService.getDetails({
              filters: [],
              impersonationId: undefined,
              userId: plan.userId,
              withMarkets: false
            });
            const totalValue = Object.values(holdings).reduce(
              (sum: number, h: any) => sum + (h.valueInBaseCurrency ?? 0),
              0
            );
            portfolioSummary = Object.entries(holdings).map(([symbol, h]: [string, any]) => ({
              currentWeight: totalValue > 0 ? (h.valueInBaseCurrency / totalValue) * 100 : 0,
              symbol,
              value: h.valueInBaseCurrency ?? 0
            }));
          } catch {}

          const mailService = await this.resolveRequestScoped(MailService, plan.userId);
          const sent = await mailService.sendInvestmentSignalEmail(
            plan.notifyEmail,
            actionableSignals,
            portfolioSummary
          );

          if (sent) {
            await this.investmentPlanService.markSignalsEmailSent(
              actionableSignals.map((s) => s.id)
            );
          }
        }
      }
    }
  }

  @Cron('*/10 * * * *')
  public async runPriceAlertsCheck() {
    if (!this.isWithinExtendedCanadianTradingHours()) {
      return;
    }

    const plans = await this.investmentPlanService.getAllActivePlans();

    if (plans.length === 0) {
      return;
    }

    const mailService = await this.resolveRequestScoped(MailService, plans[0].userId);
    await this.priceAlertService.checkAndTriggerAlertsForPlans(plans, mailService);
  }

  /**
   * TSX/NYSE regular session is 9:30–16:00 America/Toronto. Widened by ±1h
   * here to absorb DST/timezone edge cases without adding a real calendar.
   */
  private isWithinExtendedCanadianTradingHours(): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      minute: 'numeric',
      timeZone: 'America/Toronto',
      weekday: 'short'
    }).formatToParts(new Date());

    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);

    const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
    const minutesSinceMidnight = hour * 60 + minute;

    return (
      isWeekday &&
      minutesSinceMidnight >= 8 * 60 + 30 &&
      minutesSinceMidnight <= 17 * 60
    );
  }

  private async isDataGatheringEnabled() {
    return (await this.propertyService.getByKey(
      PROPERTY_IS_DATA_GATHERING_ENABLED
    )) === false
      ? false
      : true;
  }
}
