import { PortfolioPosition } from '@ghostfolio/common/interfaces';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable } from '@nestjs/common';
import { InvestmentPlanAllocation, SignalType } from '@prisma/client';

export interface RebalancingAction {
  amount: number;
  currentWeight: number;
  currentValue: number;
  deviation: number;
  groupId: string;
  name: string;
  reason: string;
  symbols: string[];
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
    holdings: { [symbol: string]: Pick<PortfolioPosition, 'valueInBaseCurrency'> },
    longTermGrowthTarget = 0
  ): Promise<RebalancingResult> {
    if (!allocations.length) {
      return { actions: [], hasTriggered: false, totalValue: 0 };
    }

    const deployedValue = Object.values(holdings).reduce(
      (sum, h) => sum + (h.valueInBaseCurrency ?? 0),
      0
    );

    // Use longTermGrowthTarget as the base when set; fall back to actual deployed value
    const totalValue = longTermGrowthTarget > 0 ? longTermGrowthTarget : deployedValue;

    if (totalValue === 0) {
      return { actions: [], hasTriggered: false, totalValue: 0 };
    }

    const actions: RebalancingAction[] = [];
    let hasTriggered = false;

    const groups = new Map<string, InvestmentPlanAllocation[]>();
    for (const allocation of allocations) {
      const group = groups.get(allocation.groupId) ?? [];
      group.push(allocation);
      groups.set(allocation.groupId, group);
    }

    for (const [groupId, group] of groups) {
      const { targetWeight, rebalanceThreshold } = group[0];
      const symbols = group.map(({ symbol }) => symbol);
      const name = group[0].name || symbols.join(', ');

      const currentValue = symbols.reduce(
        (sum, symbol) => sum + (holdings[symbol]?.valueInBaseCurrency ?? 0),
        0
      );
      // Current weight is always relative to the target base (longTermGrowthTarget)
      const currentWeight = (currentValue / totalValue) * 100;
      const deviation = currentWeight - targetWeight;
      const adjustmentValue = (totalValue * (targetWeight - currentWeight)) / 100;

      let type: 'BUY' | 'SELL' | 'OK' = 'OK';
      if (Math.abs(deviation) >= rebalanceThreshold) {
        type = adjustmentValue > 0 ? 'BUY' : 'SELL';
        hasTriggered = true;
      }

      actions.push({
        amount: Math.abs(adjustmentValue),
        currentValue,
        currentWeight,
        deviation,
        groupId,
        name,
        reason: this.buildReason(name, currentWeight, targetWeight, deviation),
        symbols,
        targetWeight,
        type
      });
    }

    return { actions, hasTriggered, totalValue };
  }

  public async generateRebalancingSignals(
    planId: string,
    allocations: InvestmentPlanAllocation[],
    holdings: { [symbol: string]: Pick<PortfolioPosition, 'valueInBaseCurrency'> },
    longTermGrowthTarget = 0
  ): Promise<void> {
    const result = await this.calculateRebalancing(allocations, holdings, longTermGrowthTarget);
    if (!result.hasTriggered) return;

    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    for (const action of result.actions) {
      if (action.type === 'OK') continue;

      const symbol = action.symbols.join(', ');

      const existing = await this.prismaService.investmentSignal.findFirst({
        where: {
          date: { gte: startOfWeek },
          planId,
          symbol,
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
          symbol,
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
