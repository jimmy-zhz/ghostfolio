import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { DcaSignalType } from '@prisma/client';

import { DcaSignalService } from './dca-signal.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSchedule(
  overrides: Partial<{
    deadlineDay: number;
    signalType: DcaSignalType;
    weeklyBudget: number;
  }> = {}
) {
  return {
    createdAt: new Date(),
    deadlineDay: overrides.deadlineDay ?? 5,
    endDate: null,
    id: 'test-id',
    isActive: true,
    planId: 'plan-id',
    signalType: overrides.signalType ?? DcaSignalType.MA5,
    startDate: new Date('2026-01-01'),
    symbol: 'XIC.TO',
    totalBudget: null,
    type: 'ADD_POSITION' as any,
    updatedAt: new Date(),
    weeklyBudget: overrides.weeklyBudget ?? 200
  };
}

/** Build a mock PrismaService whose marketData.findMany returns given prices */
function mockPrisma(prices: number[]) {
  return {
    investmentSignal: { findFirst: jest.fn().mockResolvedValue(null) },
    marketData: {
      findMany: jest.fn().mockResolvedValue(
        prices.map((marketPrice, i) => ({
          date: new Date(2026, 0, i + 1),
          marketPrice
        }))
      )
    }
  } as unknown as PrismaService;
}

// ---------------------------------------------------------------------------
// Test date: Wednesday 2026-06-17 → getDay() = 3
//   deadlineDay=5 → 3 < 5 → NOT deadline
//   deadlineDay=3 → 3 >= 3 → IS deadline
// ---------------------------------------------------------------------------
// Wednesday 2026-06-17 → getDay() = 3
const FIXED_DATE_MS = new Date('2026-06-17T10:00:00Z').getTime();

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_DATE_MS);
});

afterAll(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Level 1 — No price data at all
// ---------------------------------------------------------------------------
describe('Level 1 – No price data (0 rows returned)', () => {
  it('returns default buy signal when marketData is empty', async () => {
    const svc = new DcaSignalService(mockPrisma([]));
    const result = await svc.computeSignalsForSchedule(makeSchedule());

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);
    expect(result.reason).toContain('defaulting to buy');
  });
});

// ---------------------------------------------------------------------------
// Level 2 — Sparse data (4 prices, below the minimum of 5)
// ---------------------------------------------------------------------------
describe('Level 2 – Sparse data (4 prices < 5)', () => {
  // Prices: [30, 28, 26, 24]
  it('returns default buy signal when fewer than 5 data points', async () => {
    const svc = new DcaSignalService(mockPrisma([30, 28, 26, 24]));
    const result = await svc.computeSignalsForSchedule(makeSchedule());

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);
    expect(result.reason).toContain('Insufficient price history');
  });
});

// ---------------------------------------------------------------------------
// Level 3 — FIXED strategy (price data irrelevant)
// ---------------------------------------------------------------------------
describe('Level 3 – FIXED strategy', () => {
  // Prices: rising trend, normally MA5 would say "wait"
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

  it('always generates a buy signal regardless of price', async () => {
    const svc = new DcaSignalService(mockPrisma(prices));
    const schedule = makeSchedule({ signalType: DcaSignalType.FIXED });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);
    expect(result.reason).toContain('Fixed DCA');
  });

  it('uses the exact weeklyBudget value from the schedule', async () => {
    const svc = new DcaSignalService(mockPrisma(prices));
    const schedule = makeSchedule({
      signalType: DcaSignalType.FIXED,
      weeklyBudget: 500
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.amount).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Level 4 — MA5 strategy
//   Prices (10 values): last 5 = [12, 13, 14, 12, 11]
//   MA5 = (12+13+14+12+11)/5 = 62/5 = 12.4
//   latest = 11 → 11 < 12.4 → BELOW MA5 → BUY
//
//   Prices (rising, last 5): [16, 17, 18, 19, 20]
//   MA5 = (16+17+18+19+20)/5 = 90/5 = 18.0
//   latest = 20 → 20 > 18 → ABOVE MA5 → WAIT / DEADLINE-BUY
// ---------------------------------------------------------------------------
describe('Level 4 – MA5 strategy', () => {
  // 4a: price below MA5 → buy
  const pricesBelowMa: number[] = [10, 11, 13, 15, 12, 13, 14, 12, 11, 11];
  //   last 5: [12, 13, 14, 12, 11] → MA5=12.4, latest=11 → below

  it('4a: buys full budget when latest price is below 5-day MA', async () => {
    const svc = new DcaSignalService(mockPrisma(pricesBelowMa));
    const schedule = makeSchedule({
      deadlineDay: 5,       // Wednesday(3) < 5 → not deadline
      signalType: DcaSignalType.MA5
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);
    expect(result.reason).toContain('below 5-day MA');
  });

  // 4b: price above MA5 and NOT deadline → wait
  const pricesAboveMa: number[] = [5, 6, 7, 8, 9, 16, 17, 18, 19, 20];
  //   last 5: [16, 17, 18, 19, 20] → MA5=18.0, latest=20 → above

  it('4b: waits when price is above MA5 and deadline not reached', async () => {
    const svc = new DcaSignalService(mockPrisma(pricesAboveMa));
    const schedule = makeSchedule({
      deadlineDay: 5,       // Wednesday(3) < 5 → not deadline
      signalType: DcaSignalType.MA5
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(false);
    expect(result.amount).toBe(0);
    expect(result.reason).toContain('waiting for dip');
  });

  // 4c: price above MA5 but deadline reached → force buy
  it('4c: force-buys full budget when deadline is reached (price above MA5)', async () => {
    const svc = new DcaSignalService(mockPrisma(pricesAboveMa));
    const schedule = makeSchedule({
      deadlineDay: 3,       // Wednesday(3) >= 3 → IS deadline
      signalType: DcaSignalType.MA5
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);
    expect(result.reason).toContain('Deadline');
  });
});

// ---------------------------------------------------------------------------
// Level 5 — RSI strategy
//   Declining prices (16 values) → all changes = -1
//   RSI: gains=0, losses=1 → RS=0 → RSI = 100 - 100/(1+0) = 0 → oversold
//
//   Rising prices (16 values) → all changes = +1
//   RSI: gains=1, losses=0 → losses===0 → RSI = 100 → not oversold
// ---------------------------------------------------------------------------
describe('Level 5 – RSI strategy', () => {
  // 5a: strong decline → RSI ≈ 0 → buy
  const declining = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5];

  it('5a: buys when RSI < 40 (oversold — all declining prices → RSI≈0)', async () => {
    const svc = new DcaSignalService(mockPrisma(declining));
    const schedule = makeSchedule({
      deadlineDay: 5,
      signalType: DcaSignalType.RSI
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);
    expect(result.reason).toContain('oversold');
  });

  // 5b: pure rise → RSI = 100 → not oversold, no deadline → wait
  const rising = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  it('5b: waits when RSI ≥ 40 and deadline not reached (all rising → RSI=100)', async () => {
    const svc = new DcaSignalService(mockPrisma(rising));
    const schedule = makeSchedule({
      deadlineDay: 5,
      signalType: DcaSignalType.RSI
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(false);
    expect(result.amount).toBe(0);
    expect(result.reason).toContain('not oversold');
  });

  // 5c: RSI high but deadline reached → force buy
  it('5c: force-buys when deadline reached despite RSI ≥ 40', async () => {
    const svc = new DcaSignalService(mockPrisma(rising));
    const schedule = makeSchedule({
      deadlineDay: 3,       // IS deadline
      signalType: DcaSignalType.RSI
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);
    expect(result.reason).toContain('Deadline');
  });

  // 5d: edge — exactly 14 price points (period+1 not met) → RSI defaults to 50
  it('5d: returns RSI=50 (neutral) when data just below 15 points → waits', async () => {
    // 14 declining prices → calculateRsi returns 50 (neutral, ≥ 40)
    const prices14 = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7];
    const svc = new DcaSignalService(mockPrisma(prices14));
    const schedule = makeSchedule({
      deadlineDay: 5,
      signalType: DcaSignalType.RSI
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    // RSI=50 ≥ 40 → not oversold → wait
    expect(result.shouldBuy).toBe(false);
    expect(result.reason).toContain('not oversold');
  });
});

// ---------------------------------------------------------------------------
// Level 6 — COMBINED strategy (MA5 threshold < MA5, RSI threshold < 45)
//
//   6a: both MA5↓ and RSI<45 → full budget
//       Declining: [20..5] → MA5 of last 5=(9+8+7+6+5)/5=7, latest=5<7; RSI≈0
//
//   6b: only MA5↓ (RSI ≥ 45) → half budget
//       Rising with recent 2-step dip: [1..14, 12, 11]
//       last 5=[13,14,12,11,11]? let me use explicit array below
//
//   6c: only RSI<45 (price above MA5) → half budget
//       Declining with final spike: [20..6, 10]
//       last 5 ends above MA5; RSI still low
//
//   6d: no signal, no deadline → wait
//       Pure rising, RSI=100, above MA5
//
//   6e: no signal but deadline → full budget force buy
// ---------------------------------------------------------------------------
describe('Level 6 – COMBINED strategy', () => {
  // 6a — Both signals: declining → below MA5 AND RSI≈0 < 45
  //   prices[-5:] = [9,8,7,6,5] → MA5=7, latest=5 → below MA5
  //   RSI of 16 declining prices ≈ 0 < 45
  const declining16 = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5];

  it('6a: buys FULL budget when both MA5↓ and RSI<45', async () => {
    const svc = new DcaSignalService(mockPrisma(declining16));
    const schedule = makeSchedule({
      deadlineDay: 5,
      signalType: DcaSignalType.COMBINED,
      weeklyBudget: 400
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(400);         // full budget
    expect(result.reason).toContain('strong buy');
  });

  // 6b — Only MA5 signal: rising trend with a recent 2-step dip
  //   [1,2,3,4,5,6,7,8,9,10,11,12,13,14,12,11]
  //   prices[-5:] = [13,14,12,11,11] → MA5=(13+14+12+11+11)/5=61/5=12.2 wait no
  //   Actually prices[-5] for 16-len array = index 11..15
  //   = [12, 13, 14, 12, 11] → MA5=62/5=12.4, latest=11 < 12.4 → below MA5 ✓
  //   RSI: changes = [+1 ×13, -2, -1] → recent14=[+1×12,-2,-1]
  //        gains=(12/14)≈0.857, losses=(3/14)≈0.214 → RS≈4.0 → RSI≈80 ≥ 45 → no RSI signal
  const onlyMa5 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 12, 11];

  it('6b: buys HALF budget when only MA5↓ (RSI≈80 ≥ 45)', async () => {
    const svc = new DcaSignalService(mockPrisma(onlyMa5));
    const schedule = makeSchedule({
      deadlineDay: 5,
      signalType: DcaSignalType.COMBINED,
      weeklyBudget: 400
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);         // half budget
    expect(result.reason).toContain('half budget');
    expect(result.reason).toContain('below MA5');
  });

  // 6c — Only RSI signal: declining prices with a final spike above MA5
  //   [20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,10]
  //   prices[-5:] = [9,8,7,6,10] → MA5=40/5=8, latest=10 > 8 → ABOVE MA5 ✓
  //   RSI: changes = [-1×14, +4] → recent14=[-1×13,+4]
  //        gains=4/14≈0.286, losses=13/14≈0.929 → RS≈0.308 → RSI≈23.5 < 45 ✓
  const onlyRsi = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 10];

  it('6c: buys HALF budget when only RSI<45 (price above MA5)', async () => {
    const svc = new DcaSignalService(mockPrisma(onlyRsi));
    const schedule = makeSchedule({
      deadlineDay: 5,
      signalType: DcaSignalType.COMBINED,
      weeklyBudget: 400
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(200);         // half budget
    expect(result.reason).toContain('half budget');
    expect(result.reason).toContain('RSI');
  });

  // 6d — No signal, no deadline: pure rise → above MA5, RSI=100 ≥ 45
  //   deadlineDay=5, today=Wednesday(3) → not deadline
  const rising16 = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  it('6d: waits when no signal and deadline not reached', async () => {
    const svc = new DcaSignalService(mockPrisma(rising16));
    const schedule = makeSchedule({
      deadlineDay: 5,
      signalType: DcaSignalType.COMBINED
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(false);
    expect(result.amount).toBe(0);
    expect(result.reason).toContain('no signal');
  });

  // 6e — No signal but deadline reached → full budget force buy
  it('6e: force-buys FULL budget when deadline reached (no other signal)', async () => {
    const svc = new DcaSignalService(mockPrisma(rising16));
    const schedule = makeSchedule({
      deadlineDay: 3,       // IS deadline (Wednesday=3 >= 3)
      signalType: DcaSignalType.COMBINED,
      weeklyBudget: 400
    });
    const result = await svc.computeSignalsForSchedule(schedule);

    expect(result.shouldBuy).toBe(true);
    expect(result.amount).toBe(400);         // full budget
    expect(result.reason).toContain('Deadline');
  });
});
