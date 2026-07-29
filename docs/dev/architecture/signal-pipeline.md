# Signals 生成与展示链路

## Signals 页面完整工作链路

### 1. 信号生成（后台定时）

```
Cron: 每个工作日 09:00  @Cron('0 9 * * 1-5')
  └── cron.service.ts: runInvestmentSignals()
        ├── 取所有用户的 investment plan
        └── DcaSignalService.generateSignalsForPlan(planId, dcaSchedules)
              ├── 对每个 DCA schedule 调用 computeSignalsForSchedule()
              │     ├── 查最近 20 天价格数据
              │     ├── 判断今天是否是 deadlineDay（fallback 强买日）
              │     └── 按 signalType 决定：
              │           MA5: 价格 < 5日均价 → DCA_BUY，否则 DCA_WAIT
              │           RSI: RSI < 40 → DCA_BUY，否则 DCA_WAIT
              │           COMBINED: MA5 AND RSI 同时满足 → DCA_BUY
              │           FIXED: 今天就是 deadlineDay → DCA_BUY
              └── 写入 InvestmentSignal 表（去重：今日 + symbol + type 已存在则跳过）
```

**注意**：Rebalancing 信号（REBALANCE_BUY / REBALANCE_SELL）目前 cron **没有调用**，只有前端主动请求 `GET /investment-plan/rebalancing` 时才实时计算，不写入 Signal 表。

### 2. 前端展示

```
GET /api/v1/investment-plan/signals
  └── getRecentSignals(planId, days=30)
        └── 查 InvestmentSignal 表，最近 30 天，最多 50 条，按时间倒序
```

前端 Signals tab 显示 `symbol`、`type`（DCA_BUY/DCA_WAIT）、`amount`、`reason`、`date`，每条可操作：

- **Executed** → 状态改 `EXECUTED`
- **Dismiss** → 状态改 `DISMISSED`

### 3. 邮件通知

```
emailEnabled=true 且有 notifyEmail 时：  getPendingSignals() → 过滤 type != DCA_WAIT && emailSent=false  → mailService.sendInvestmentSignalEmail(notifyEmail, notifyLanguage, signals)  → 发送后标记 emailSent=true（防重发）
```


