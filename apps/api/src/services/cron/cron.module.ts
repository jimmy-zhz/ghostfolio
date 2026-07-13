import { DcaSignalService } from '@ghostfolio/api/app/investment-plan/dca-signal.service';
import { InvestmentPlanModule } from '@ghostfolio/api/app/investment-plan/investment-plan.module';
import { InvestmentPlanService } from '@ghostfolio/api/app/investment-plan/investment-plan.service';
import { PriceAlertService } from '@ghostfolio/api/app/investment-plan/price-alert.service';
import { RebalancingService } from '@ghostfolio/api/app/investment-plan/rebalancing.service';
import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { UserModule } from '@ghostfolio/api/app/user/user.module';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { MailModule } from '@ghostfolio/api/services/mail/mail.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { DataGatheringQueueModule } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.module';
import { DataGatheringService } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.service';
import { StatisticsGatheringQueueModule } from '@ghostfolio/api/services/queues/statistics-gathering/statistics-gathering.module';
import { StatisticsGatheringService } from '@ghostfolio/api/services/queues/statistics-gathering/statistics-gathering.service';
import { TwitterBotModule } from '@ghostfolio/api/services/twitter-bot/twitter-bot.module';
import { TwitterBotService } from '@ghostfolio/api/services/twitter-bot/twitter-bot.service';

import { Logger, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { CronService } from './cron.service';

@Module({
  imports: [
    ConfigurationModule,
    InvestmentPlanModule,
    MailModule,
    PortfolioModule,
    DataGatheringQueueModule,
    PropertyModule,
    StatisticsGatheringQueueModule,
    TwitterBotModule,
    UserModule
  ],
  providers: [
    {
      inject: [
        ConfigurationService,
        DataGatheringService,
        DcaSignalService,
        InvestmentPlanService,
        ModuleRef,
        PriceAlertService,
        PropertyService,
        RebalancingService,
        StatisticsGatheringService,
        TwitterBotService,
        UserService
      ],
      provide: CronService,
      useFactory: (
        configurationService: ConfigurationService,
        dataGatheringService: DataGatheringService,
        dcaSignalService: DcaSignalService,
        investmentPlanService: InvestmentPlanService,
        moduleRef: ModuleRef,
        priceAlertService: PriceAlertService,
        propertyService: PropertyService,
        rebalancingService: RebalancingService,
        statisticsGatheringService: StatisticsGatheringService,
        twitterBotService: TwitterBotService,
        userService: UserService
      ) => {
        if (!configurationService.get('ENABLE_FEATURE_CRON')) {
          Logger.log('Scheduled cron jobs are disabled', 'CronService');

          return null;
        }

        return new CronService(
          configurationService,
          dataGatheringService,
          dcaSignalService,
          investmentPlanService,
          moduleRef,
          priceAlertService,
          propertyService,
          rebalancingService,
          statisticsGatheringService,
          twitterBotService,
          userService
        );
      }
    }
  ]
})
export class CronModule {}
