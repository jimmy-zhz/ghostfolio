# Investment Features

This fork adds an investment planning layer on top of Ghostfolio: a **Capital Pool**,
a **Systematic Investment Plan (DCA)**, **Rebalancing** advice, a **Signals** feed,
**Fund Sources and Purposes** and **Price Alerts** with rules. This page describes what
each feature does and how to configure it.

The investment plan is a tab of the home page (_Overview, Holdings, Activities, Investment
Plan, Watchlist_); Summary and Markets moved to the Portfolio tabs. Old links keep working.

## Capital Pool

The Capital Pool is the static total of your savings, split into three layers:

```text
Capital Pool                              ← InvestmentPlan.capitalPool
├─ Layer 1 — Emergency Fund
│  ├─ Cash Reserve Target                 ← short-term living expenses
│  ├─ Cash Buffer Target                  ← emergency buffer on top of the reserve
│  └─ Actual Cash                         ← calculated automatically
├─ Layer 2 — Capital Preservation Bucket  ← reserve for rare, high-impact events
│                                            (market crashes, major life changes)
├─ Layer 3 — Long-term Growth Target
│  └─ Deployed Capital                    ← calculated; the gap is what is still to be invested
└─ SIP Monthly Budget                     ← monthly cash available for recurring investments
```

How to read the numbers:

- **Long-term Growth Target** is the capital you have earmarked for the market — a
  theoretical target position. It is normally larger than what is actually deployed;
  the difference is the amount you should plan to invest, typically as a one-off
  top-up plan.
- If your **deployed capital exceeds** the Long-term Growth Target, you are carrying
  more market risk than planned and should consider trimming positions.
- **SIP Monthly Budget** tracks the share of your monthly income available for
  recurring investments. Combined with the Rebalancing result, it drives the DCA
  decision: how much to add, and on which day.

Configure these values on the Investment Plan page.

## DCA (Systematic Investment Plan)

Each DCA schedule targets one symbol and has a strategy, a budget, and a deadline day.
On every run the strategy decides whether to buy today or wait, based on the last
20 closing prices.

| Strategy   | Buy when                                                                            | Fallback                        | Wait when                          |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------- |
| `FIXED`    | Always                                                                              | —                               | —                                  |
| `MA5`      | Latest price is below the 5-day moving average                                       | Forced buy on the deadline day  | Above MA5 and deadline not reached |
| `RSI`      | RSI(14) below 40                                                                     | Forced buy on the deadline day  | RSI ≥ 40 and deadline not reached  |
| `COMBINED` | MA5 **and** RSI(<45) → full position; MA5 **or** RSI(<45) → half position            | Full forced buy on the deadline | Neither signal, deadline not met   |

Notes:

- RSI is the standard RSI(14). With fewer than 15 data points it returns 50 (neutral),
  which counts as "no signal".
- With no market data or fewer than 5 prices, the schedule falls back to its default
  buy amount.

## Rebalancing

Set a target weight and a rebalance threshold per symbol. For every symbol the
application computes:

```text
currentWeight%  = holding value / total portfolio value × 100
deviation       = currentWeight% − targetWeight%      positive = overweight
adjustmentValue = totalValue × (targetWeight% − currentWeight%) / 100
                                                      positive = buy, negative = sell
action          = |deviation| ≥ threshold ? BUY / SELL : OK
```

All weights and amounts are based on the **actual market value** of your holdings, so the
weights of a fully assigned portfolio add up to 100%. The result also reports how that value
compares with your Long-term Growth Target (`capital`): how much of the target is not
deployed yet, or by how much you are above it. This is shown beside the weights and never
triggers a rebalancing on its own.

The result is a list of suggested actions plus a flag indicating whether at least one
symbol crossed its threshold. Thresholds are per symbol, so different holdings can
tolerate different drift.

Rebalancing suggestions are calculated on demand when the page requests them; they are
not stored.

## Signals

The Signals tab shows recent suggestions from the last 30 days (up to 50 entries,
newest first). Each entry shows the symbol, type (`DCA_BUY` / `DCA_WAIT`), amount,
reason, and date, and can be marked as:

- **Executed** — you acted on it
- **Dismiss** — you ignored it

DCA signals are generated automatically every weekday morning; see
[operations.md](operations.md).

## Fund Sources and Purposes

Accounts tell where the money is. Fund groups add two more views, on the _Funds_ tab of
the investment plan:

- A **source** tells whose money it is, e.g. a gift from your mother or money you keep for
  someone. It has a principal. One source can be the **remainder**: everything not in
  another source (e.g. "My savings"); its principal is worked out for you.
- A **purpose** tells what the money is for, e.g. a car. It has a target amount and an
  optional target date, and shows the progress. Several holdings can make up one purpose.

Both are defined by **tags of the activities**. Create a tag by typing a new name into the
Tags field of an activity (e.g. `Source · Mother`), or with _Edit Tags_ on the Activities
page, which adds or removes one tag on many selected activities at once. Then add the source
or purpose on the _Funds_ tab and pick its tag.

Rules for tagging:

1. Every buy, sell and dividend gets exactly one source tag, also your own money.
2. A buy paid from two sources is recorded as two activities, split by quantity and fee.
3. A sell is tagged with the source whose shares were sold.
4. A purpose tag is optional, at most one per activity. If a whole holding belongs to a
   purpose, tag all its activities; split only if part of one buy belongs to it.
5. Tag activities, not accounts: a tag on an account counts every activity of the account.

The tab shows, per source, the principal, the amount invested, the value, the return, the
split across the accounts and the gap between principal and invested (money not invested
yet, or an activity without its tag). A row expands to its accounts and holdings. Below,
the checks list activities without a source or with several sources or purposes, and
holdings of which only some activities carry a purpose tag.

Cash in an account cannot be split by source; only the invested money can.

## Price Alerts

A price alert notifies you by email or webhook when its rule is met. Besides a fixed
price, a rule can compare a percentage:

| Rule | Compares | Example |
| --- | --- | --- |
| Price | the price | XUS.TO ≤ 40 |
| Change from the high | the price with the highest close of the last N trading days (252 ≈ 52 weeks) | ≤ -15 (15% below the 52-week high) |
| Change vs. average cost | the price with your average cost of the holding | ≥ 0 (back at cost) |
| Daily change | the price with the previous close | ≤ -3 |

Write what you plan to do in _Action when it fires_; the notification includes it along
with the reference value, e.g. "-15.3% from the high of 47.20 (2026-09-18)".

A price, high or cost alert fires once and is then off until you _Re-arm_ it. A daily
change alert fires at most once a day and stays active. An alert whose data is missing
(e.g. fewer closes than the trading days asked for) does not fire.

