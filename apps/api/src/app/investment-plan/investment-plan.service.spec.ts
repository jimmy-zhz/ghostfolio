import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import {
  InvestmentPlanService,
  isDiscordWebhookUrl,
  redactWebhookUrl
} from './investment-plan.service';

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
      method: 'POST',
      signal: expect.any(AbortSignal)
    });
  });

  it('returns false when the endpoint responds with a non-2xx status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: jest.fn().mockResolvedValue('not found')
    }) as any;

    const result = await svc.sendWebhook('https://example.com/webhook', {});

    expect(result).toBe(false);
  });

  it('returns false instead of throwing when the request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    const result = await svc.sendWebhook('https://example.com/webhook', {});

    expect(result).toBe(false);
  });

  it('converts a price alert into a Discord embed for Discord webhook URLs', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    await svc.sendWebhook('https://discord.com/api/webhooks/123/token-abc', {
      alert: {
        condition: 'GREATER_THAN_OR_EQUAL',
        name: null,
        symbol: 'BTCUSD',
        targetValue: 85000
      },
      currentValue: 86123.5,
      event: 'price_alert',
      planId: 'plan-1'
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.embeds[0].title).toBe('🔔 Price Alert: BTCUSD');
    expect(body.embeds[0].fields).toEqual([
      { inline: true, name: 'Current', value: '86123.50' },
      { inline: true, name: 'Threshold', value: '≥ 85000' }
    ]);
    expect(body.event).toBeUndefined();
  });

  it('converts investment signals into a Discord embed', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    await svc.sendWebhook('https://discord.com/api/webhooks/123/token-abc', {
      event: 'investment_signals',
      planId: 'plan-1',
      signals: [
        { amount: 500, reason: 'Below target weight', symbol: 'XIC.TO', type: 'REBALANCE_BUY' }
      ]
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body.embeds[0].title).toBe('📈 1 investment signal(s)');
    expect(body.embeds[0].description).toContain('XIC.TO');
  });

  it('leaves the payload untouched for non-Discord endpoints', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    await svc.sendWebhook('https://example.com/api/webhooks/123', {
      event: 'price_alert'
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      event: 'price_alert'
    });
  });
});

describe('isDiscordWebhookUrl', () => {
  it.each([
    ['https://discord.com/api/webhooks/123/token', true],
    ['https://discordapp.com/api/webhooks/123/token', true],
    ['https://ptb.discord.com/api/webhooks/123/token', true],
    ['https://example.com/api/webhooks/123/token', false],
    ['https://notdiscord.com/api/webhooks/1/t', false],
    ['https://discord.com/channels/123', false],
    ['not a url', false]
  ])('%s -> %s', (url, expected) => {
    expect(isDiscordWebhookUrl(url)).toBe(expected);
  });
});

describe('redactWebhookUrl', () => {
  it('drops the secret token from the URL', () => {
    expect(redactWebhookUrl('https://discord.com/api/webhooks/123/secret-token')).toBe(
      'discord.com/api/webhooks/***'
    );
  });
});
