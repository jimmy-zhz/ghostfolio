# MCP server

Ghostfolio exposes a [Model Context Protocol](https://modelcontextprotocol.io/) endpoint
so an AI client such as Claude can read your portfolio, transactions and investment
plan to support decisions, record transactions you confirm, and maintain your investment
plan.

```text
POST https://<your-host>/api/v1/mcp
```

Everything is read-only except the tools marked as write: `create_activity`, which
records a single transaction, `tag_activities`, which adds or removes your own tags on
transactions (nothing else of a transaction can be edited, and there is no delete or
import), and the tools that maintain the price alerts, DCA schedules, signals, target
allocation groups and fund sources and purposes of the investment plan. The capital
pool, cash buffer and reserve, growth target and notification settings can only be
changed in the Ghostfolio UI.

## Before you connect

1. Redeploy to a version that contains the endpoint.
2. Set `ROOT_URL` to the public URL of the instance, for example
   `https://ghostfolio.example.com`. The OAuth flow derives its addresses from it. If it
   is not set they are derived from `X-Forwarded-Proto` and `X-Forwarded-Host`, which
   only works when the reverse proxy forwards them.
3. Make sure the reverse proxy passes `/api/`, `/oauth/` and `/.well-known/` to the
   application. The last two are not under `/api/`.

## Connect

### Claude Code

```shell
claude mcp add --transport http ghostfolio https://<your-host>/api/v1/mcp \
  --header "Authorization: Bearer <credential>"
```

`<credential>` is one of:

| Credential         | Where to get it                                              |
| ------------------ | ------------------------------------------------------------ |
| Security Token     | The token you sign in to Ghostfolio with                     |
| API key            | _Account → Membership_ (Premium only)                        |
| JWT                | The token the web client uses, valid for 180 days            |

### claude.ai and Claude desktop (custom connector)

Add a custom connector with the URL `https://<your-host>/api/v1/mcp`, click _Connect_,
and sign in on the consent page with your **Security Token**. Accounts without a
Security Token (Google or OpenID Connect only) cannot use this path; use an API key or
a JWT with Claude Code instead.

After the instance is upgraded, reconnect the connector so the client reloads the tool
list.

## Tools

| Tool                        | What it returns                                              |
| --------------------------- | ------------------------------------------------------------ |
| `get_user`                  | Base currency, language, settings                            |
| `lookup_symbol`             | The data source and symbol Ghostfolio uses for a ticker      |
| `list_accounts`             | Accounts with balance and value                              |
| `get_portfolio_details`     | Allocation, accounts and summary                             |
| `list_holdings`             | Current positions                                            |
| `get_holding`               | One position in depth                                        |
| `get_portfolio_performance` | Performance over a range                                     |
| `get_portfolio_investments` | Money invested per period                                    |
| `get_portfolio_dividends`   | Dividends over time                                          |
| `get_portfolio_report`      | X-Ray rules                                                  |
| `list_activities`           | Transactions, paginated                                      |
| `get_investment_plan`       | Targets, allocation groups, DCA schedules, price alerts      |
| `get_investment_signals`    | Recent DCA signals                                           |
| `get_rebalancing`           | Drift per allocation group and the buy/sell actions          |
| `get_watchlist`             | Watchlist with market prices                                 |
| `create_activity` (write)   | Records one transaction                                      |
| `create_price_alert`, `update_price_alert`, `rearm_price_alert` (write) | Create, change or re-enable a price alert |
| `delete_price_alert` (write) | Deletes a price alert |
| `update_signal_status` (write) | Marks a DCA signal as executed or dismissed |
| `create_dca_schedule`, `update_dca_schedule` (write) | Create or change a DCA schedule |
| `delete_dca_schedule` (write) | Deletes a DCA schedule |
| `upsert_allocation_group` (write) | Creates or replaces a target allocation group |
| `delete_allocation_group` (write) | Deletes a target allocation group |
| `get_fund_groups` | Fund sources and purposes with their figures and checks |
| `create_tag` (write) | Creates one of your own tags |
| `upsert_fund_group`, `delete_fund_group` (write) | Create, change or delete a fund source or purpose |
| `tag_activities` (write) | Adds or removes one of your own tags on up to 100 transactions |

### Recording transactions

`create_activity` is meant for bookkeeping from a screenshot or a statement: the client
reads the trades, shows you the full list, and writes them after you confirm. Its
description tells the client to confirm with you first and to check `list_activities`
for duplicates. The call is not idempotent, so a repeated call records the transaction
twice. A wrong entry can only be corrected in the Ghostfolio UI.

A date without a time (`2026-10-20`) is recorded at noon UTC, so the web client shows
the same day in every time zone from UTC-12 to UTC+11. Midnight UTC would show as the
day before west of UTC. With a time, the client should send the offset, for example
`2026-10-20T11:13:58-04:00`.

### Fund sources and purposes

The client can help sort your transactions into fund sources (whose money it is) and
purposes (what it is for). It lists the transactions, you say which belong where, and
after you confirm it tags them with `tag_activities`. Only your own tags change; the
amounts, quantities and dates of a transaction stay as they are, and system tags such as
Exclude from Analysis cannot be set this way. Afterwards it reads the checks of
`get_fund_groups`, for example transactions still without a source.

### Maintaining the investment plan

The plan tools change the plan as you would in the UI, after the client has shown you
the change and you have confirmed it. To change or delete an item, the client first
looks up its id with `get_investment_plan` (signals: `get_investment_signals`).

- Deleting a price alert, a DCA schedule or an allocation group cannot be undone. To
  stop an alert or a schedule for a while, ask for it to be paused instead
  (`isActive: false`).
- Changing the allocation groups changes the rebalancing (`get_rebalancing`) and its
  alerts. The target weights of all groups should still add up to 100.
- Marking a signal as executed does not record the buy; that is a separate
  `create_activity`.

### What is never returned

Webhook URLs are reduced to their host (`discord.com/***`) and credential fields are
replaced with `[redacted]`. The web client is not affected.

## Verify

1. Open the metadata and check that the addresses are your public URL, not
   `http://0.0.0.0:3333`:

   ```shell
   curl -s https://<your-host>/.well-known/oauth-protected-resource
   ```

2. Check that client registration returns JSON, not a web page:

   ```shell
   curl -s -X POST https://<your-host>/oauth/register \
     -H 'content-type: application/json' \
     -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}'
   ```

3. Connect a client and call `get_user`, then `lookup_symbol`. Try `create_activity`
   once with a small test transaction, confirm it with `list_activities`, and delete it
   in the Ghostfolio UI.

## Security notes

- Tokens issued by the OAuth flow last one hour (access) and 30 days (refresh) and are
  not valid as regular API tokens. A single refresh token cannot be revoked; changing
  `JWT_SECRET_KEY` revokes all of them.
- Failed sign-ins on the consent page are limited to 10 per IP per 10 minutes.
- Anything a tool returns becomes part of the model's context.
