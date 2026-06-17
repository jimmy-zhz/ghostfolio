import { PortfolioPosition } from '@ghostfolio/common/interfaces';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable } from '@nestjs/common';
import { InvestmentPlanAllocation, SignalType } from '@prisma/client';

export interface RebalancingAction {
  amount: number;
  currentWeight: number;
  currentValue: number;
  deviation: number;
  reason: string;
  symbol: string;
  targetWeight: number;
  type: 'BUY' | 'SELL' | 'OK';
}

export interface RebalancingResult {
  actions: RebalancingAction[];
  totalValue: number;
  hasTriggered: boolean;
}

@Injectable()
export class RebalancingService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async calculateRebalancing(
    allocations: InvestmentPlanAllocation[],
    holdings: { [symbol: string]: Pick<PortfolioPosition, 'valueInBaseCurrency'> }
  ): Promise<RebalancingResult> {
    if (!allocations.length) {
      return { actions: [], hasTriggered: false, totalValue: 0 };
    }

    const totalValue = Object.values(holdings).reduce(
      (sum, h) => sum + (h.valueInBaseCurrency ?? 0),
      0
    );

    if (totalValue === 0) {
      return { actions: [], hasTriggered: false, totalValue: 0 };
    }

    const actions: RebalancingAction[] = [];
    let hasTriggered = false;

    for (const allocation of allocations) {
      const holding = holdings[allocation.symbol];
      const currentValue = holding?.valueInBaseCurrency ?? 0;
      const currentWeight = (currentValue / totalValue) * 100;
      const deviation = currentWeight - allocation.targetWeight;
      const adjustmentValue = (totalValue * (allocation.targetWeight - currentWeight)) / 100;

      let type: 'BUY' | 'SELL' | 'OK' = 'OK';
      if (Math.abs(deviation) >= allocation.rebalanceThreshold) {
        type = adjustmentValue > 0 ? 'BUY' : 'SELL';
        hasTriggered = true;
      }

      actions.push({
        amount: Math.abs(adjustmentValue),
        currentValue,
        currentWeight,
        deviation,
        reason: this.buildReason(allocation.symbol, currentWeight, allocation.targetWeight, deviation),
        symbol: allocation.symbol,
        targetWeight: allocation.targetWeight,
        type
      });
    }

    return { actions, hasTriggered, totalValue };
  }

  public async generateRebalancingSignals(
    planId: string,
    allocations: InvestmentPlanAllocation[],
    holdings: { [symbol: string]: Pick<PortfolioPosition, 'valueInBaseCurrency'> }
  ): Promise<void> {
    const result = await this.calculateRebalancing(allocations, holdings);
    if (!result.hasTriggered) return;

    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    for (const action of result.actions) {
      if (action.type === 'OK') continue;

      const existing = await this.prismaService.investmentSignal.findFirst({
        where: {
          date: { gte: startOfWeek },
          planId,
          symbol: action.symbol,
          type: action.type === 'BUY' ? SignalType.REBALANCE_BUY : SignalType.REBALANCE_SELL
        }
      });
      if (existing) continue;

      await this.prismaService.investmentSignal.create({
        data: {
          amount: action.amount,
          date: new Date(),
          planId,
          reason: action.reason,
          symbol: action.symbol,
          type: action.type === 'BUY' ? SignalType.REBALANCE_BUY : SignalType.REBALANCE_SELL
        }
      });
    }
  }

  private buildReason(
    symbol: string,
    current: number,
    target: number,
    deviation: number
  ): string {
    const dir = deviation > 0 ? 'overweight' : 'underweight';
    return `${symbol} is ${dir} by ${Math.abs(deviation).toFixed(1)}% (current ${current.toFixed(1)}%, target ${target.toFixed(1)}%)`;
  }
}
