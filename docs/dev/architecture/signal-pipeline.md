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


## AI Integration

### Module 1 — Rebalancing 信号生成时机修正

**现状**：`generateRebalancingSignals` 去重逻辑是"今天已生成过则跳过"，且尚未接入 cron。

**修改**：

- 去重窗口从"今天"改为"本周"（`gte: startOfWeek`），每个 symbol 每周最多生成一次
- 接入现有 `@Cron('0 9 * * 1-5')` 的 `runInvestmentSignals()`，在 DCA 信号之后触发
- 需要给 CronModule 引入 `PortfolioModule`，注入 `PortfolioService` 取持仓市值

---

### Module 2 — Email 使用 AI Response Language

**现状**：`MailService.sendInvestmentSignalEmail()` 接收 `plan.notifyLanguage` 作为 AI prompt 语言。

**修改**：

- `MailService` 注入 `PropertyService`，从 `PROPERTY_AI_RESPONSE_LANGUAGE` 读取语言
- 忽略 `plan.notifyLanguage`（UI 上已删除该字段）

---

### Module 3 — DCA 页面"Generate Report"按钮（手动、不持久化）

**数据输入**（与 Email 一致）：

```
当前持仓市值（portfolioService.getDetails）+ Rebalancing 计算结果（actions + deviation）+ DCA 配置列表（schedules）+ 近期 Signals（最近 7 天）
```

**与 Email 的区别**：

|| Email   |Generate Report|
|---|---------|---|
|触发| Cron 每日 |用户手动点击|
|持久化| 写 DB    |不写|
|发邮件| 是       |否|
|次数限制| 每周一次    |无限|
|返回方式| 邮件 HTML |API 返回纯文本，前端展示|

**实现**：

- 新增 `POST /api/v1/investment-plan/ai-report`（无需 body）
- 后端聚合数据 → 拼 prompt → 调 `AiService.generateText()` → 返回文本
- 前端 `onGenerateReport()` 调该接口，结果写入 `aiReport` 展示在 textarea
- `isGeneratingReport` 控制 loading 状态
