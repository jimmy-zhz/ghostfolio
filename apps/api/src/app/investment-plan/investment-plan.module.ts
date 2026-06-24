import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { MailModule } from '@ghostfolio/api/services/mail/mail.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';

import { Module } from '@nestjs/common';

import { DcaSignalService } from './dca-signal.service';
import { InvestmentPlanController } from './investment-plan.controller';
import { InvestmentPlanService } from './investment-plan.service';
import { PriceAlertService } from './price-alert.service';
import { RebalancingService } from './rebalancing.service';

@Module({
  controllers: [InvestmentPlanController],
  exports: [
    DcaSignalService,
    InvestmentPlanService,
    PriceAlertService,
    RebalancingService
  ],
  imports: [
    DataProviderModule,
    MailModule,
    PortfolioModule,
    PrismaModule,
    PropertyModule
  ],
  providers: [
    DcaSignalService,
    InvestmentPlanService,
    PriceAlertService,
    RebalancingService
  ]
})
export class InvestmentPlanModule {}
