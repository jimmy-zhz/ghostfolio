import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { InvestmentPlanController } from './investment-plan.controller';
import { InvestmentPlanService } from './investment-plan.service';
import { RebalancingService } from './rebalancing.service';

@Module({
  controllers: [InvestmentPlanController],
  exports: [InvestmentPlanService, RebalancingService],
  imports: [PortfolioModule, PrismaModule],
  providers: [InvestmentPlanService, RebalancingService]
})
export class InvestmentPlanModule {}
