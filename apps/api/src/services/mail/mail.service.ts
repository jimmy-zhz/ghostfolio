import { AiService } from '@ghostfolio/api/app/endpoints/ai/ai.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { Injectable, Logger } from '@nestjs/common';
import { InvestmentSignal, SignalType } from '@prisma/client';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  public constructor(
    private readonly aiService: AiService,
    private readonly configurationService: ConfigurationService
  ) {}

  public async sendInvestmentSignalEmail(
    toEmail: string,
    language: string,
    signals: InvestmentSignal[],
    portfolioSummary: { symbol: string; currentWeight: number; value: number }[]
  ): Promise<boolean> {
    const smtpUser = this.configurationService.get('SMTP_USER');
    if (!smtpUser || !toEmail) return false;

    try {
      const subject = language === 'zh'
        ? '【Ghostfolio】今日投资建议'
        : '[Ghostfolio] Daily Investment Signals';

      const body = await this.generateEmailBody(language, signals, portfolioSummary);

      const transporter = nodemailer.createTransport({
        auth: {
          pass: this.configurationService.get('SMTP_PASS'),
          user: smtpUser
        },
        host: this.configurationService.get('SMTP_HOST'),
        port: this.configurationService.get('SMTP_PORT'),
        secure: false
      });

      await transporter.sendMail({
        from: this.configurationService.get('SMTP_FROM') || smtpUser,
        html: body,
        subject,
        to: toEmail
      });

      this.logger.log(`Investment signal email sent to ${toEmail}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error}`);
      return false;
    }
  }

  private async generateEmailBody(
    language: string,
    signals: InvestmentSignal[],
    portfolioSummary: { symbol: string; currentWeight: number; value: number }[]
  ): Promise<string> {
    const dcaBuys = signals.filter((s) => s.type === SignalType.DCA_BUY);
    const dcaWaits = signals.filter((s) => s.type === SignalType.DCA_WAIT);
    const rebalanceBuys = signals.filter((s) => s.type === SignalType.REBALANCE_BUY);
    const rebalanceSells = signals.filter((s) => s.type === SignalType.REBALANCE_SELL);

    const signalSummary = [
      ...dcaBuys.map((s) => `DCA Buy ${s.symbol} $${s.amount.toFixed(0)}: ${s.reason}`),
      ...dcaWaits.map((s) => `DCA Wait ${s.symbol}: ${s.reason}`),
      ...rebalanceBuys.map((s) => `Rebalance Buy ${s.symbol} $${s.amount.toFixed(0)}: ${s.reason}`),
      ...rebalanceSells.map((s) => `Rebalance Sell ${s.symbol} $${s.amount.toFixed(0)}: ${s.reason}`)
    ].join('\n');

    const holdingsSummary = portfolioSummary
      .map((h) => `${h.symbol}: ${h.currentWeight.toFixed(1)}% ($${h.value.toFixed(0)})`)
      .join('\n');

    const prompt = language === 'zh'
      ? `你是一位专业的投资顾问，请根据以下信息，用中文写一封简洁专业的投资建议邮件正文（HTML格式）。

当前持仓：
${holdingsSummary}

今日信号：
${signalSummary}

要求：
- 用 <h3> 分节
- 用 <ul><li> 列出建议
- 语气专业但不夸张
- 最后加一句风险提示
- 不超过400字`
      : `You are a professional investment advisor. Write a concise, professional investment recommendation email body (HTML format) based on:

Current Holdings:
${holdingsSummary}

Today's Signals:
${signalSummary}

Requirements:
- Use <h3> for sections
- Use <ul><li> for recommendations
- Professional but not alarmist tone
- Add a brief risk disclaimer at the end
- Under 300 words`;

    try {
      const { text } = await this.aiService.generateText({ prompt });
      return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">${text}</div>`;
    } catch {
      return this.buildFallbackHtml(language, signals);
    }
  }

  private buildFallbackHtml(language: string, signals: InvestmentSignal[]): string {
    const isZh = language === 'zh';
    const rows = signals.map((s) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${s.symbol}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${s.type}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">$${s.amount.toFixed(0)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;">${s.reason}</td>
      </tr>`).join('');

    return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>${isZh ? '今日投资建议' : 'Daily Investment Signals'}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#f5f5f5">
          <th style="padding:8px;text-align:left">${isZh ? '资产' : 'Symbol'}</th>
          <th style="padding:8px;text-align:left">${isZh ? '类型' : 'Type'}</th>
          <th style="padding:8px;text-align:left">${isZh ? '金额' : 'Amount'}</th>
          <th style="padding:8px;text-align:left">${isZh ? '原因' : 'Reason'}</th>
        </tr>
        ${rows}
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px">
        ${isZh ? '⚠️ 以上内容仅供参考，不构成投资建议，投资有风险，入市需谨慎。' : '⚠️ This is for informational purposes only and does not constitute investment advice.'}
      </p>
    </div>`;
  }
}
