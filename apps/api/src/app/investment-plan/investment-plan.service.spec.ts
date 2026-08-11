import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { InvestmentPlanService } from './investment-plan.service';

describe('InvestmentPlanService.sendWebhook', () => {
  const svc = new InvestmentPlanService({} as PrismaService);
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('POSTs the payload as JSON and returns true on a 2xx response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const payload = { event: 'investment_signals', planId: 'plan-1', signals: [] };
    const result = await svc.sendWebhook('https://example.com/webhook', payload);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/webhook', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });
  });

  it('returns false when the endpoint responds with a non-2xx status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;

    const result = await svc.sendWebhook('https://example.com/webhook', {});

    expect(result).toBe(false);
  });

  it('returns false instead of throwing when the request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    const result = await svc.sendWebhook('https://example.com/webhook', {});

    expect(result).toBe(false);
  });
});
