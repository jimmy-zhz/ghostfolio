import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { MailService } from '@ghostfolio/api/services/mail/mail.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { PROPERTY_AI_RESPONSE_LANGUAGE } from '@ghostfolio/common/config';
import type { RequestWithUser } from '@ghostfolio/common/types';

import { RebalancingService } from './rebalancing.service';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { DcaSignalType, DcaType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';

import { InvestmentPlanService } from './investment-plan.service';

@Controller('investment-plan')
export class InvestmentPlanController {
  public constructor(
    private readonly investmentPlanService: InvestmentPlanService,
    private readonly mailService: MailService,
    private readonly portfolioService: PortfolioService,
    private readonly propertyService: PropertyService,
    private readonly rebalancingService: RebalancingService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  public async getPlan() {
    const plan = await this.investmentPlanService.getPlanByUserId(
      this.request.user.id
    );

    let deployedCapital = 0;
    try {
      const { holdings } = await this.portfolioService.getDetails({
        filters: [],
        impersonationId: undefined,
        userId: this.request.user.id,
        withMarkets: false
      });
      deployedCapital = Object.values(holdings).reduce(
        (sum: number, h: any) => sum + (h.investment ?? 0),
        0
      );
    } catch {
      // ignore if portfolio data is unavailable
    }

    if (!plan) {
      return {
        allocations: [],
        capitalPool: 0,
        dcaSchedules: [],
        deployedCapital,
        emailEnabled: false,
        notifyEmail: null,
        notifyLanguage: 'en'
      };
    }

    return { ...plan, deployedCapital };
  }

  @Put()
  @UseGuards(AuthGuard('jwt'))
  public async upsertPlan(
    @Body()
    body: {
      capitalPool: number;
      deployedCapital?: number;
      emailEnabled?: boolean;
      notifyEmail?: string;
      notifyLanguage?: string;
    }
  ) {
    return this.investmentPlanService.upsertPlan(this.request.user.id, body);
  }

  @Put('allocation/:symbol')
  @UseGuards(AuthGuard('jwt'))
  public async upsertAllocation(
    @Param('symbol') symbol: string,
    @Body()
    body: { targetWeight: number; rebalanceThreshold?: number }
  ) {
    const plan = await this.getOrCreatePlan();
    return this.investmentPlanService.upsertAllocation(
      plan.id,
      symbol,
      body.targetWeight,
      body.rebalanceThreshold
    );
  }

  @Delete('allocation/:symbol')
  @UseGuards(AuthGuard('jwt'))
  public async deleteAllocation(@Param('symbol') symbol: string) {
    const plan = await this.getOrCreatePlan();
    await this.investmentPlanService.deleteAllocation(plan.id, symbol);
    return { success: true };
  }

  @Post('dca')
  @UseGuards(AuthGuard('jwt'))
  public async createDcaSchedule(
    @Body()
    body: {
      deadlineDay?: number;
      endDate?: string;
      signalType?: DcaSignalType;
      startDate: string;
      symbol: string;
      totalBudget?: number;
      type?: DcaType;
      weeklyBudget: number;
    }
  ) {
    const plan = await this.getOrCreatePlan();
    return this.investmentPlanService.createDcaSchedule(plan.id, {
      deadlineDay: body.deadlineDay ?? 5,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      signalType: body.signalType ?? DcaSignalType.MA5,
      startDate: new Date(body.startDate),
      symbol: body.symbol,
      totalBudget: body.totalBudget,
      type: body.type ?? DcaType.ADD_POSITION,
      weeklyBudget: body.weeklyBudget
    });
  }

  @Put('dca/:id')
  @UseGuards(AuthGuard('jwt'))
  public async updateDcaSchedule(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.investmentPlanService.updateDcaSchedule(id, body);
  }

  @Delete('dca/:id')
  @UseGuards(AuthGuard('jwt'))
  public async deleteDcaSchedule(@Param('id') id: string) {
    await this.investmentPlanService.deleteDcaSchedule(id);
    return { success: true };
  }

  @Get('signals')
  @UseGuards(AuthGuard('jwt'))
  public async getSignals() {
    const plan = await this.investmentPlanService.getPlanByUserId(
      this.request.user.id
    );
    if (!plan) return { signals: [] };
    return {
      signals: await this.investmentPlanService.getRecentSignals(plan.id)
    };
  }

  @Get('rebalancing')
  @UseGuards(AuthGuard('jwt'))
  public async getRebalancing() {
    const plan = await this.investmentPlanService.getPlanByUserId(
      this.request.user.id
    );
    if (!plan) return { actions: [], hasTriggered: false, totalValue: 0 };
    const { holdings } = await this.portfolioService.getDetails({
      filters: [],
      impersonationId: undefined,
      userId: this.request.user.id,
      withMarkets: false
    });
    return this.rebalancingService.calculateRebalancing(
      plan.allocations,
      holdings
    );
  }

  @Post('ai-prompt')
  @UseGuards(AuthGuard('jwt'))
  public async getAiPrompt() {
    const userId = this.request.user.id;
    const plan = await this.investmentPlanService.getPlanByUserId(userId);
    const signals = plan
      ? await this.investmentPlanService.getRecentSignals(plan.id, 7)
      : [];

    const portfolioSummary = await this.fetchPortfolioSummary(userId);

    const language =
      (await this.propertyService.getByKey<string>(PROPERTY_AI_RESPONSE_LANGUAGE)) ?? 'en';
    const prompt = this.mailService.buildPrompt(language, signals, portfolioSummary);
    return { prompt };
  }

  @Post('ai-report')
  @UseGuards(AuthGuard('jwt'))
  public async generateAiReport() {
    const userId = this.request.user.id;
    const plan = await this.investmentPlanService.getPlanByUserId(userId);

    // Gather holdings
    const portfolioSummary = await this.fetchPortfolioSummary(userId);

    // Gather recent signals
    const signals = plan
      ? await this.investmentPlanService.getRecentSignals(plan.id, 7)
      : [];

    const language =
      (await this.propertyService.getByKey<string>(PROPERTY_AI_RESPONSE_LANGUAGE)) ?? 'en';

    const report = await this.mailService.generateAiReport(language, signals, portfolioSummary);
    return { report };
  }

  @Put('signals/:id/status')
  @UseGuards(AuthGuard('jwt'))
  public async updateSignalStatus(
    @Param('id') id: string,
    @Body() body: { status: 'EXECUTED' | 'DISMISSED' }
  ) {
    return this.investmentPlanService.updateSignalStatus(id, body.status as any);
  }

  private async fetchPortfolioSummary(
    userId: string,
    timeoutMs = 15000
  ): Promise<{ symbol: string; currentWeight: number; value: number }[]> {
    try {
      const race = await Promise.race([
        this.portfolioService.getDetails({
          filters: [],
          impersonationId: undefined,
          userId,
          withMarkets: false
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getDetails timeout')), timeoutMs)
        )
      ]);
      const holdings: Record<string, any> = (race as any).holdings ?? {};
      const totalValue: number = Object.values(holdings).reduce(
        (sum: number, h: any) => sum + (h.valueInBaseCurrency ?? 0),
        0
      );
      return Object.entries(holdings).map(([symbol, h]: [string, any]) => ({
        currentWeight: totalValue > 0 ? (h.valueInBaseCurrency / totalValue) * 100 : 0,
        symbol,
        value: h.valueInBaseCurrency ?? 0
      }));
    } catch {
      return [];
    }
  }

  private async getOrCreatePlan() {
    const existing = await this.investmentPlanService.getPlanByUserId(
      this.request.user.id
    );
    if (existing) return existing;
    throw new HttpException(
      'Investment plan not found. Please create one first.',
      StatusCodes.NOT_FOUND
    );
  }
}
