import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { DcaSignalService } from './dca-signal.service';
import { InvestmentPlanController } from './investment-plan.controller';
import { InvestmentPlanService } from './investment-plan.service';
import { RebalancingService } from './rebalancing.service';

@Module({
  controllers: [InvestmentPlanController],
  exports: [DcaSignalService, InvestmentPlanService, RebalancingService],
  imports: [PortfolioModule, PrismaModule],
  providers: [DcaSignalService, InvestmentPlanService, RebalancingService]
})
export class InvestmentPlanModule {}
