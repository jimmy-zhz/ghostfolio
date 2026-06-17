/**
 * Integration test — calls real Gemini API via MailService.generateAiReport()
 * Requires dev environment with AI provider configured in Property table.
 *
 * Run:
 *   npx nx test api --testFile=apps/api/src/services/mail/mail.service.ai-report.spec.ts --no-coverage
 */

import { AiService } from '@ghostfolio/api/app/endpoints/ai/ai.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  PROPERTY_AI_API_URL,
  PROPERTY_AI_RESPONSE_LANGUAGE,
  PROPERTY_API_KEY_OPENROUTER,
  PROPERTY_OPENROUTER_MODEL
} from '@ghostfolio/common/config';

import { SignalType, SignalStatus } from '@prisma/client';

import { MailService } from './mail.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(
  symbol: string,
  type: SignalType,
  amount: number,
  reason: string
) {
  return {
    id: `${symbol}-${type}`,
    planId: 'plan-1',
    symbol,
    type,
    amount,
    reason,
    date: new Date(),
    status: SignalStatus.PENDING,
    emailSent: false,
    createdAt: new Date(),
    updatedAt: new Date()
  } as any;
}

function makeHolding(symbol: string, weight: number, value: number) {
  return { currentWeight: weight, symbol, value };
}

// ---------------------------------------------------------------------------
// Real AiService backed by configured Property values
// ---------------------------------------------------------------------------

async function buildServices() {
  // Minimal PropertyService stub that reads from env or hardcoded dev values
  const propertyService = {
    getByKey: async (key: string) => {
      const map: Record<string, string> = {
        [PROPERTY_API_KEY_OPENROUTER]: process.env['GEMINI_API_KEY'] ?? '',
        [PROPERTY_AI_API_URL]: 'https://generativelanguage.googleapis.com/v1beta/models',
        [PROPERTY_OPENROUTER_MODEL]: 'gemini-2.5-flash',
        [PROPERTY_AI_RESPONSE_LANGUAGE]: 'zh'
      };
      return map[key] ?? null;
    }
  } as unknown as PropertyService;

  // ConfigurationService stub
  const configurationService = {
    get: (_key: string) => 30000
  } as any;

  // We only need AiService.generateText — build a minimal real one
  const aiService = new AiService(configurationService, null as any, propertyService);

  const mailService = new MailService(aiService, configurationService, propertyService);
  return { mailService };
}

// ---------------------------------------------------------------------------
// Test datasets
// ---------------------------------------------------------------------------

describe('MailService.generateAiReport — real Gemini call', () => {
  jest.setTimeout(60000);

  // ── Dataset 1: 空持仓 + 无信号 ─────────────────────────────────────────
  //   预期：AI应说明暂无数据，给出建议先配置持仓
  it('Dataset 1 — 空持仓、无信号', async () => {
    const { mailService } = await buildServices();

    const report = await mailService.generateAiReport('zh', [], []);

    console.log('\n===== Dataset 1: 空持仓+无信号 =====\n', report);
    expect(report.length).toBeGreaterThan(50);
  });

  // ── Dataset 2: 三基金组合 — 仅 DCA 买入信号 ────────────────────────────
  //   持仓：XIC.TO 45% / XEF.TO 28% / XBB.TO 27%，总额 $18,000 CAD
  //   信号：XIC.TO DCA买入 $200（MA5低于均线），XEF.TO DCA买入 $200（RSI<40）
  //   预期：AI建议按计划买入，并指出XEF.TO超卖
  it('Dataset 2 — 三基金组合，DCA买入信号', async () => {
    const { mailService } = await buildServices();

    const signals = [
      makeSignal('XIC.TO', SignalType.DCA_BUY, 200, 'Price $28.50 is below MA5 $29.10 — buying dip'),
      makeSignal('XEF.TO', SignalType.DCA_BUY, 200, 'RSI(14)=34.2 below threshold 40 — oversold signal')
    ];

    const holdings = [
      makeHolding('XIC.TO', 45.0, 8100),
      makeHolding('XEF.TO', 28.0, 5040),
      makeHolding('XBB.TO', 27.0, 4860)
    ];

    const report = await mailService.generateAiReport('zh', signals, holdings);

    console.log('\n===== Dataset 2: 三基金+DCA信号 =====\n', report);
    expect(report).toContain('XIC');
    expect(report.length).toBeGreaterThan(200);
  });

  // ── Dataset 3: 再平衡触发 — 卖出超配，买入欠配 ──────────────────────────
  //   持仓：QQQ 62% / SPY 38%，总额 $25,000 CAD
  //   目标：QQQ 50% / SPY 50%
  //   信号：QQQ REBALANCE_SELL $3000（超配12%），SPY REBALANCE_BUY $3000（欠配12%）
  //   预期：AI建议卖QQQ买SPY，说明偏离过大
  it('Dataset 3 — 再平衡触发（卖出+买入）', async () => {
    const { mailService } = await buildServices();

    const signals = [
      makeSignal('QQQ', SignalType.REBALANCE_SELL, 3000,
        'QQQ is overweight by 12.0% (current 62.0%, target 50.0%)'),
      makeSignal('SPY', SignalType.REBALANCE_BUY, 3000,
        'SPY is underweight by 12.0% (current 38.0%, target 50.0%)')
    ];

    const holdings = [
      makeHolding('QQQ', 62.0, 15500),
      makeHolding('SPY', 38.0, 9500)
    ];

    const report = await mailService.generateAiReport('zh', signals, holdings);

    console.log('\n===== Dataset 3: 再平衡触发 =====\n', report);
    expect(report).toContain('QQQ');
    expect(report).toContain('SPY');
    expect(report.length).toBeGreaterThan(200);
  });

  // ── Dataset 4: 混合信号 — DCA + Rebalancing 同周触发 ────────────────────
  //   持仓：XIC.TO 42% / XEF.TO 33% / XBB.TO 15% / CASH 10%，总额 $42,000
  //   信号：
  //     XIC.TO  DCA_BUY $200（MA5）
  //     XBB.TO  REBALANCE_BUY $2,100（欠配10%，目标25%）
  //     XEF.TO  DCA_BUY $200（COMBINED: MA5+RSI同时触发）
  //   预期：AI优先建议再平衡XBB.TO，同时确认DCA计划
  it('Dataset 4 — 混合：DCA + Rebalancing 同周', async () => {
    const { mailService } = await buildServices();

    const signals = [
      makeSignal('XIC.TO', SignalType.DCA_BUY, 200,
        'Price $29.10 below MA5 $29.80 — MA5 signal triggered'),
      makeSignal('XEF.TO', SignalType.DCA_BUY, 200,
        'Combined signal: price below MA5 AND RSI(14)=37.8 < 40'),
      makeSignal('XBB.TO', SignalType.REBALANCE_BUY, 2100,
        'XBB.TO is underweight by 10.0% (current 15.0%, target 25.0%)')
    ];

    const holdings = [
      makeHolding('XIC.TO', 42.0, 17640),
      makeHolding('XEF.TO', 33.0, 13860),
      makeHolding('XBB.TO', 15.0, 6300),
      makeHolding('CASH', 10.0, 4200)
    ];

    const report = await mailService.generateAiReport('zh', signals, holdings);

    console.log('\n===== Dataset 4: 混合信号 =====\n', report);
    expect(report).toContain('XBB');
    expect(report.length).toBeGreaterThan(300);
  });
});
