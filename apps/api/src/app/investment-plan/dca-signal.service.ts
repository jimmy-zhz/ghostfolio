import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable, Logger } from '@nestjs/common';
import { DcaSchedule, DcaSignalType, SignalType } from '@prisma/client';
import { subDays } from 'date-fns';

export interface DailySignal {
  amount: number;
  reason: string;
  shouldBuy: boolean;
  symbol: string;
}

@Injectable()
export class DcaSignalService {
  private readonly logger = new Logger(DcaSignalService.name);

  public constructor(private readonly prismaService: PrismaService) {}

  public async computeSignalsForSchedule(
    schedule: DcaSchedule
  ): Promise<DailySignal> {
    const prices = await this.getRecentPrices(schedule.symbol, 20);

    if (prices.length < 5) {
      return {
        amount: schedule.weeklyBudget,
        reason: `Insufficient price history for ${schedule.symbol}, defaulting to buy`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const isDeadline = dayOfWeek >= schedule.deadlineDay;

    switch (schedule.signalType) {
      case DcaSignalType.FIXED:
        return {
          amount: schedule.weeklyBudget,
          reason: `Fixed DCA: buy on schedule`,
          shouldBuy: true,
          symbol: schedule.symbol
        };

      case DcaSignalType.MA5:
        return this.checkMa5Signal(schedule, prices, isDeadline);

      case DcaSignalType.RSI:
        return this.checkRsiSignal(schedule, prices, isDeadline);

      case DcaSignalType.COMBINED:
        return this.checkCombinedSignal(schedule, prices, isDeadline);

      default:
        return this.checkMa5Signal(schedule, prices, isDeadline);
    }
  }

  public async generateSignalsForPlan(
    planId: string,
    schedules: DcaSchedule[]
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const schedule of schedules) {
      if (!schedule.isActive) continue;
      if (schedule.endDate && schedule.endDate < today) continue;

      try {
        // 本周已有 DCA_BUY → 本窗口已执行，不再生成
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // 本周一
        const alreadyBoughtThisWeek = await this.prismaService.investmentSignal.findFirst({
          where: {
            date: { gte: weekStart },
            planId,
            symbol: schedule.symbol,
            type: SignalType.DCA_BUY
          }
        });
        if (alreadyBoughtThisWeek) continue;

        // 今天已生成过任意信号 → 跳过（避免重复运行）
        const todaySignal = await this.prismaService.investmentSignal.findFirst({
          where: {
            date: { gte: today },
            planId,
            symbol: schedule.symbol
          }
        });
        if (todaySignal) continue;

        const signal = await this.computeSignalsForSchedule(schedule);

        await this.prismaService.investmentSignal.create({
          data: {
            amount: signal.shouldBuy ? signal.amount : 0,
            date: new Date(),
            planId,
            reason: signal.reason,
            symbol: signal.symbol,
            type: signal.shouldBuy ? SignalType.DCA_BUY : SignalType.DCA_WAIT
          }
        });
      } catch (error) {
        this.logger.error(`Failed to generate signal for ${schedule.symbol}: ${error}`);
      }
    }
  }

  private checkMa5Signal(
    schedule: DcaSchedule,
    prices: number[],
    isDeadline: boolean
  ): DailySignal {
    const latest = prices[prices.length - 1];
    const ma5 = prices.slice(-5).reduce((s, p) => s + p, 0) / 5;
    const belowMa = latest < ma5;
    const deviation = ((latest - ma5) / ma5) * 100;

    if (belowMa) {
      return {
        amount: schedule.weeklyBudget,
        reason: `${schedule.symbol} price ${latest.toFixed(2)} is below 5-day MA ${ma5.toFixed(2)} (${deviation.toFixed(1)}%) — buy signal`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    if (isDeadline) {
      return {
        amount: schedule.weeklyBudget,
        reason: `Deadline reached — buying ${schedule.symbol} despite price above MA5 (${deviation.toFixed(1)}% above)`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    return {
      amount: 0,
      reason: `${schedule.symbol} is ${deviation.toFixed(1)}% above 5-day MA — waiting for dip`,
      shouldBuy: false,
      symbol: schedule.symbol
    };
  }

  private checkRsiSignal(
    schedule: DcaSchedule,
    prices: number[],
    isDeadline: boolean
  ): DailySignal {
    const rsi = this.calculateRsi(prices, 14);
    const oversold = rsi < 40;

    if (oversold) {
      return {
        amount: schedule.weeklyBudget,
        reason: `${schedule.symbol} RSI is ${rsi.toFixed(1)} (oversold < 40) — buy signal`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    if (isDeadline) {
      return {
        amount: schedule.weeklyBudget,
        reason: `Deadline reached — buying ${schedule.symbol} despite RSI ${rsi.toFixed(1)}`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    return {
      amount: 0,
      reason: `${schedule.symbol} RSI ${rsi.toFixed(1)} — not oversold, waiting`,
      shouldBuy: false,
      symbol: schedule.symbol
    };
  }

  private checkCombinedSignal(
    schedule: DcaSchedule,
    prices: number[],
    isDeadline: boolean
  ): DailySignal {
    const latest = prices[prices.length - 1];
    const ma5 = prices.slice(-5).reduce((s, p) => s + p, 0) / 5;
    const rsi = this.calculateRsi(prices, 14);
    const belowMa = latest < ma5;
    const rsiLow = rsi < 45;

    if (belowMa && rsiLow) {
      return {
        amount: schedule.weeklyBudget,
        reason: `${schedule.symbol} strong buy: below MA5 and RSI ${rsi.toFixed(1)} — full budget`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    if (belowMa || rsiLow) {
      return {
        amount: schedule.weeklyBudget * 0.5,
        reason: `${schedule.symbol} partial signal (${belowMa ? 'below MA5' : `RSI ${rsi.toFixed(1)}`}) — half budget`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    if (isDeadline) {
      return {
        amount: schedule.weeklyBudget,
        reason: `Deadline — buying ${schedule.symbol} at full budget`,
        shouldBuy: true,
        symbol: schedule.symbol
      };
    }

    return {
      amount: 0,
      reason: `${schedule.symbol} no signal (MA5: +${(((latest - ma5) / ma5) * 100).toFixed(1)}%, RSI: ${rsi.toFixed(1)}) — waiting`,
      shouldBuy: false,
      symbol: schedule.symbol
    };
  }

  private async getRecentPrices(symbol: string, days: number): Promise<number[]> {
    const since = subDays(new Date(), days + 5);
    const records = await this.prismaService.marketData.findMany({
      orderBy: { date: 'asc' },
      select: { marketPrice: true },
      take: days + 5,
      where: {
        date: { gte: since },
        symbol
      }
    });
    return records.map((r) => r.marketPrice);
  }

  private calculateRsi(prices: number[], period = 14): number {
    if (prices.length < period + 1) return 50;

    const changes = prices.slice(1).map((p, i) => p - prices[i]);
    const recent = changes.slice(-period);

    const gains = recent.filter((c) => c > 0).reduce((s, c) => s + c, 0) / period;
    const losses = recent.filter((c) => c < 0).reduce((s, c) => s + Math.abs(c), 0) / period;

    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }
}
