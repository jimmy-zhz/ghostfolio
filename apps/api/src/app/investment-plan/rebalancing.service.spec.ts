import { RebalancingService } from './rebalancing.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal InvestmentPlanAllocation-shaped object */
function alloc(
  symbol: string,
  targetWeight: number,
  rebalanceThreshold = 5
) {
  return {
    createdAt: new Date(),
    id: symbol + '-alloc',
    planId: 'plan-1',
    rebalanceThreshold,
    symbol,
    targetWeight,
    updatedAt: new Date()
  };
}

/** Build a holdings map — each entry is just { valueInBaseCurrency } */
function holdings(map: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(map).map(([sym, val]) => [
      sym,
      { valueInBaseCurrency: val }
    ])
  );
}

// RebalancingService only uses prisma for generateRebalancingSignals.
// calculateRebalancing is pure — pass a stub.
const svc = new RebalancingService(null as any);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('RebalancingService.calculateRebalancing', () => {
  // ── Guard cases ────────────────────────────────────────────────────────────

  it('G1: returns empty result when allocations array is empty', async () => {
    const result = await svc.calculateRebalancing([], holdings({ 'XIC.TO': 5000 }));

    expect(result).toEqual({ actions: [], hasTriggered: false, totalValue: 0 });
  });

  it('G2: returns empty result when total portfolio value is 0 (no holdings)', async () => {
    const result = await svc.calculateRebalancing(
      [alloc('XIC.TO', 40)],
      {}  // no holdings at all
    );

    expect(result).toEqual({ actions: [], hasTriggered: false, totalValue: 0 });
  });

  // ── Case 1: Perfectly balanced portfolio ───────────────────────────────────
  //
  //   Total: $10 000
  //   XIC.TO $4 000 → 40 %  target 40 %  deviation   0 %  threshold 5 %  → OK
  //   XEF.TO $3 000 → 30 %  target 30 %  deviation   0 %  threshold 5 %  → OK
  //   VCN.TO $3 000 → 30 %  target 30 %  deviation   0 %  threshold 5 %  → OK

  describe('Case 1 – Perfectly balanced (no action needed)', () => {
    const allocations = [
      alloc('XIC.TO', 40),
      alloc('XEF.TO', 30),
      alloc('VCN.TO', 30)
    ];
    const h = holdings({ 'XIC.TO': 4000, 'XEF.TO': 3000, 'VCN.TO': 3000 });

    it('totalValue equals sum of all holdings', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      expect(r.totalValue).toBe(10000);
    });

    it('hasTriggered is false', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      expect(r.hasTriggered).toBe(false);
    });

    it('all actions are type OK', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      expect(r.actions.every((a) => a.type === 'OK')).toBe(true);
    });

    it('deviation for each symbol is exactly 0', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      for (const action of r.actions) {
        expect(action.deviation).toBeCloseTo(0, 5);
      }
    });
  });

  // ── Case 2: XIC overweight, VCN underweight ────────────────────────────────
  //
  //   Total: $10 000
  //   XIC.TO $4 800 → 48 %  target 40 %  deviation  +8 %  ≥ 5 %  → SELL $800
  //   XEF.TO $2 800 → 28 %  target 30 %  deviation  −2 %  < 5 %  → OK
  //   VCN.TO $2 400 → 24 %  target 30 %  deviation  −6 %  ≥ 5 %  → BUY  $600

  describe('Case 2 – XIC overweight (+8%) and VCN underweight (−6%)', () => {
    const allocations = [
      alloc('XIC.TO', 40),
      alloc('XEF.TO', 30),
      alloc('VCN.TO', 30)
    ];
    const h = holdings({ 'XIC.TO': 4800, 'XEF.TO': 2800, 'VCN.TO': 2400 });

    it('hasTriggered is true', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      expect(r.hasTriggered).toBe(true);
    });

    it('XIC.TO → SELL $800 (8% overweight)', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const xic = r.actions.find((a) => a.symbol === 'XIC.TO')!;

      expect(xic.type).toBe('SELL');
      expect(xic.currentWeight).toBeCloseTo(48, 4);
      expect(xic.deviation).toBeCloseTo(8, 4);
      expect(xic.amount).toBeCloseTo(800, 4);
    });

    it('XEF.TO → OK (only 2% underweight, below 5% threshold)', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const xef = r.actions.find((a) => a.symbol === 'XEF.TO')!;

      expect(xef.type).toBe('OK');
      expect(xef.deviation).toBeCloseTo(-2, 4);
    });

    it('VCN.TO → BUY $600 (6% underweight)', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const vcn = r.actions.find((a) => a.symbol === 'VCN.TO')!;

      expect(vcn.type).toBe('BUY');
      expect(vcn.currentWeight).toBeCloseTo(24, 4);
      expect(vcn.deviation).toBeCloseTo(-6, 4);
      expect(vcn.amount).toBeCloseTo(600, 4);
    });
  });

  // ── Case 3: Symbol entirely missing from holdings ──────────────────────────
  //
  //   Total: $10 000  (XIC only)
  //   XIC.TO $10 000 → 100 %  target 60 %  deviation +40 %  → SELL $4 000
  //   VCN.TO $0      →   0 %  target 40 %  deviation −40 %  → BUY  $4 000

  describe('Case 3 – Target symbol not held at all (new position needed)', () => {
    const allocations = [alloc('XIC.TO', 60), alloc('VCN.TO', 40)];
    const h = holdings({ 'XIC.TO': 10000 }); // VCN.TO not in holdings

    it('VCN.TO currentValue is treated as 0', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const vcn = r.actions.find((a) => a.symbol === 'VCN.TO')!;

      expect(vcn.currentValue).toBe(0);
      expect(vcn.currentWeight).toBeCloseTo(0, 4);
    });

    it('VCN.TO → BUY $4 000 (entirely underweight)', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const vcn = r.actions.find((a) => a.symbol === 'VCN.TO')!;

      expect(vcn.type).toBe('BUY');
      expect(vcn.amount).toBeCloseTo(4000, 4);
    });

    it('XIC.TO → SELL $4 000 (entirely overweight)', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const xic = r.actions.find((a) => a.symbol === 'XIC.TO')!;

      expect(xic.type).toBe('SELL');
      expect(xic.amount).toBeCloseTo(4000, 4);
    });
  });

  // ── Case 4: Deviation exactly at and just below threshold ──────────────────
  //
  //   Total: $10 000, threshold = 5 %
  //   XIC.TO $4 500 → 45 %  target 40 %  deviation  +5 %  → exactly AT threshold → SELL
  //   XEF.TO $4 490 → 44.9% target 40 %  deviation +4.9%  → just below threshold  → OK

  describe('Case 4 – Threshold boundary (exactly at vs just below)', () => {
    it('4a: deviation = exactly threshold → triggers (SELL)', async () => {
      const h = holdings({ 'XIC.TO': 4500, 'XEF.TO': 5500 });
      // XIC: 4500/10000 = 45%, target 40%, deviation = +5% = threshold
      const r = await svc.calculateRebalancing(
        [alloc('XIC.TO', 40, 5)],
        h
      );

      const xic = r.actions.find((a) => a.symbol === 'XIC.TO')!;
      expect(xic.type).toBe('SELL');
      expect(r.hasTriggered).toBe(true);
    });

    it('4b: deviation = threshold − 0.1% → does NOT trigger (OK)', async () => {
      // XIC: 4490/10000 = 44.9%, target 40%, deviation = +4.9% < 5%
      const h = holdings({ 'XIC.TO': 4490, 'XEF.TO': 5510 });
      const r = await svc.calculateRebalancing(
        [alloc('XIC.TO', 40, 5)],
        h
      );

      const xic = r.actions.find((a) => a.symbol === 'XIC.TO')!;
      expect(xic.type).toBe('OK');
      expect(r.hasTriggered).toBe(false);
    });
  });

  // ── Case 5: Custom per-symbol threshold ────────────────────────────────────
  //
  //   Total: $10 000
  //   QQQ: target 50 %, threshold 10 %   holdings $6 000 → 60 % → dev +10 % → SELL $1 000
  //   SPY: target 50 %, threshold 20 %   holdings $4 000 → 40 % → dev −10 % < 20 % → OK

  describe('Case 5 – Different thresholds per symbol', () => {
    const allocations = [alloc('QQQ', 50, 10), alloc('SPY', 50, 20)];
    const h = holdings({ QQQ: 6000, SPY: 4000 });

    it('QQQ hits its 10% threshold → SELL $1 000', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const qqq = r.actions.find((a) => a.symbol === 'QQQ')!;

      expect(qqq.type).toBe('SELL');
      expect(qqq.amount).toBeCloseTo(1000, 4);
    });

    it('SPY deviation is 10% but its threshold is 20% → OK', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const spy = r.actions.find((a) => a.symbol === 'SPY')!;

      expect(spy.type).toBe('OK');
    });

    it('hasTriggered reflects at least one symbol triggering', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      expect(r.hasTriggered).toBe(true);
    });
  });

  // ── Case 6: reason string content ──────────────────────────────────────────
  //
  //   XIC.TO $4 800 / $10 000 = 48 %, target 40 %, deviation +8 %

  describe('Case 6 – Reason string is descriptive', () => {
    it('contains "overweight" for a positive deviation', async () => {
      const r = await svc.calculateRebalancing(
        [alloc('XIC.TO', 40)],
        holdings({ 'XIC.TO': 4800, other: 5200 })
      );
      const xic = r.actions.find((a) => a.symbol === 'XIC.TO')!;

      expect(xic.reason).toContain('overweight');
      expect(xic.reason).toContain('XIC.TO');
    });

    it('contains "underweight" for a negative deviation', async () => {
      const r = await svc.calculateRebalancing(
        [alloc('XIC.TO', 60)],
        holdings({ 'XIC.TO': 4000, other: 6000 })
      );
      const xic = r.actions.find((a) => a.symbol === 'XIC.TO')!;
      // 40% actual vs 60% target → underweight
      expect(xic.reason).toContain('underweight');
    });
  });

  // ── Case 7: Real-world 3-ETF Canadian portfolio ────────────────────────────
  //
  //   Total value: $27 000 CAD (realistic portfolio size)
  //   Targets:  XIC.TO 40 %  XEF.TO 35 %  XBB.TO 25 %   threshold 5 %
  //   Actual:   XIC.TO $12 000  XEF.TO $8 100  XBB.TO $6 900
  //
  //   XIC.TO: 12000/27000 = 44.4 %  target 40 %  dev +4.4 % < 5 % → OK
  //   XEF.TO:  8100/27000 = 30.0 %  target 35 %  dev −5.0 % = 5 % → BUY $1 350
  //   XBB.TO:  6900/27000 = 25.6 %  target 25 %  dev +0.6 % < 5 % → OK

  describe('Case 7 – Real-world 3-ETF Canadian portfolio ($27 000)', () => {
    const allocations = [
      alloc('XIC.TO', 40),
      alloc('XEF.TO', 35),
      alloc('XBB.TO', 25)
    ];
    const h = holdings({
      'XIC.TO': 12000,
      'XEF.TO': 8100,
      'XBB.TO': 6900
    });

    it('totalValue = $27 000', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      expect(r.totalValue).toBe(27000);
    });

    it('XIC.TO is 44.4 % — within 5 % of target 40 % → OK', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const xic = r.actions.find((a) => a.symbol === 'XIC.TO')!;

      expect(xic.currentWeight).toBeCloseTo(44.44, 1);
      expect(xic.type).toBe('OK');
    });

    it('XEF.TO is exactly 5 % underweight → triggers BUY $1 350', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const xef = r.actions.find((a) => a.symbol === 'XEF.TO')!;

      expect(xef.currentWeight).toBeCloseTo(30, 1);
      expect(xef.deviation).toBeCloseTo(-5, 4);
      expect(xef.type).toBe('BUY');
      expect(xef.amount).toBeCloseTo(1350, 0);
    });

    it('XBB.TO is 0.6 % overweight — below threshold → OK', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      const xbb = r.actions.find((a) => a.symbol === 'XBB.TO')!;

      expect(xbb.type).toBe('OK');
    });

    it('hasTriggered = true (XEF.TO hit threshold)', async () => {
      const r = await svc.calculateRebalancing(allocations, h);
      expect(r.hasTriggered).toBe(true);
    });
  });
});
