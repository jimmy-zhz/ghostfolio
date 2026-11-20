# MCP server

[Model Context Protocol](https://modelcontextprotocol.io/) endpoint that lets an
AI client (Claude Code, ...) pull portfolio data to support investment
decisions, record transactions from a screenshot and maintain the investment
plan.

- **Endpoint:** `POST /api/v1/mcp` (Streamable HTTP, stateless, JSON responses;
  `GET`/`DELETE` answer `405`)
- **Design:** modelled on ToucanShelf's MCP service. The package owns no data
  logic. Each tool maps 1:1 onto an existing REST endpoint and a tool call is
  replayed against the API of the same process over `127.0.0.1`, so guards,
  permissions, subscription checks and response interceptors all apply as for
  the web client.
- **Read-only for the most part, with allowlisted writes** (ADR 0002, ADR 0004):
  - `create_activity` creates one transaction (`POST /api/v1/activities`, which
    places no order), for bookkeeping from screenshots. Transactions cannot be
    edited, deleted or imported, so a wrong entry can be added but never
    silently changed or removed, and the user fixes it in the UI. It goes
    through the normal API guards, so the user needs the `createActivity`
    permission.
  - The investment plan without its capital pool: price alerts (create,
    update, rearm, delete), the status of a DCA signal, DCA schedules (create,
    update, delete) and target allocation groups (upsert, delete).
    `PUT /investment-plan` (capital pool, cash buffer/reserve, growth target,
    notification settings) stays UI only.
- **The allowlist is enforced where the request is sent** (`MCP_ALLOWED_WRITES`
  in `mcp-api-client.ts`), not just by tool definition. An entry is
  `METHOD /path`, where a `:param` segment matches exactly one path segment
  (never `.`, `..`, a query or a fragment).
- **Rules baked into the tool descriptions:** every write starts with `WRITE`
  and tells the client to show the user exactly what will be written and get
  explicit confirmation first; deletes and allocation changes also name their
  consequences (no undo, rebalancing and alerts change). `create_activity`
  additionally checks `list_activities` for duplicates; tools that change an
  existing item take its id from `get_investment_plan`.
- **Annotations:** writes have `readOnlyHint: false`; deletes and
  `upsert_allocation_group` (replacing a group removes the symbols left out)
  have `destructiveHint: true`; creates and `upsert_allocation_group` are not
  idempotent.
- **Arguments are validated before the API is called:** ids are UUIDs (except
  `groupId`), dates are `YYYY-MM-DD` and `dataSource` is one of the data
  sources of Ghostfolio.
- **Ids are scoped by the API:** updates and deletes by id only find a record
  of the plan of the signed-in user (`404` otherwise), and the update endpoints
  only take the editable fields of the record.

## Secrets never leave through MCP

Tool results go straight into the context of the connected model, so every
response is sanitized in `mcp-sanitize.ts` before it is returned, even where
the REST API returns the value as is (the web client has to show and edit it):

- `webhookUrl` keeps only its host (`discord.com/***`): the token is in the
  path. The `webhookEnabled` flag still tells whether it is set.
- credential-like fields (`accessToken`, `apiKey`, `hashedKey`, `password`,
  `secret`, `token`, `scraperConfiguration`) become `[redacted]`.

A new tool that can return another kind of secret needs its field added there.

## Authentication

`Authorization: Bearer <credential>`, where the credential is one of

1. an access token from the OAuth flow below,
2. a Ghostfolio JWT (what the web client uses, valid 180 days),
3. an API key (Premium, generated in _Account → Membership_),
4. the **Security Token** you log in with.

An API key or Security Token is exchanged for a 10 minute JWT that is only used
for the internal calls of that request. A missing or invalid credential gets
`401` with a `WWW-Authenticate` header pointing at the OAuth metadata.

## OAuth (claude.ai connectors)

Clients that can only connect through OAuth discover and run the flow on their
own (`oauth/`): protected-resource and authorization-server metadata under
`/.well-known/`, dynamic client registration at `/oauth/register`, a consent
page at `/oauth/authorize`, and `/oauth/token` for `authorization_code` (PKCE
S256 required) and `refresh_token`.

- **Public URL:** issuer, redirect base and token audience come from `ROOT_URL`
  if set. Otherwise they are derived from `X-Forwarded-Proto`/`X-Forwarded-Host`
  (or the request's own host). Set `ROOT_URL` explicitly when the reverse proxy
  does not forward those headers: its built-in default is the listen address
  (`http://0.0.0.0:3333`), which no client can reach.
- **Consent:** the page asks for the Security Token you sign in with. There is no
  server-side browser session in Ghostfolio to reuse (the web app keeps its JWT
  client-side), so this is the sign-in. Accounts without a Security Token (for
  example Google/OIDC only) cannot use this path; use an API key or JWT.
- **Stateless tokens:** access tokens last 1 hour, refresh tokens 30 days. Both
  are signed with a key derived from `JWT_SECRET_KEY`, so they are not valid as
  API JWTs and vice versa. Registered clients are signed `client_id`s, no table.
  The consequence is that a single refresh token cannot be revoked: rotating
  `JWT_SECRET_KEY` revokes everything, deleting the user ends their tokens.
- **In-memory state:** authorization codes (5 minutes, single use) and the
  failed-consent counter (10 attempts per IP per 10 minutes) live in memory, so
  a restart only costs an in-flight sign-in.

## Connect Claude Code

```bash
claude mcp add --transport http ghostfolio https://<your-host>/api/v1/mcp \
  --header "Authorization: Bearer <credential>"
```

In claude.ai add a custom connector with the URL `https://<your-host>/api/v1/mcp`
and sign in on the consent page.

Then ask Claude to use the `ghostfolio` MCP, e.g. "use ghostfolio to review my
holdings against my investment plan".

## Tools

| Tool                                           | Endpoint                                            |
| ---------------------------------------------- | --------------------------------------------------- |
| `get_user`                                     | `GET /user`                                         |
| `lookup_symbol`                                | `GET /symbol/lookup`                                |
| `list_accounts`                                | `GET /account`                                      |
| `get_portfolio_details`                        | `GET /portfolio/details`                            |
| `list_holdings`                                | `GET /portfolio/holdings`                           |
| `get_holding`                                  | `GET /portfolio/holding/:dataSource/:symbol`        |
| `get_portfolio_performance`                    | `GET /v2/portfolio/performance`                     |
| `get_portfolio_investments`                    | `GET /portfolio/investments`                        |
| `get_portfolio_dividends`                      | `GET /portfolio/dividends`                          |
| `get_portfolio_report`                         | `GET /portfolio/report`                             |
| `list_activities`                              | `GET /activities`                                   |
| `get_investment_plan`                          | `GET /investment-plan`                              |
| `get_investment_signals`                       | `GET /investment-plan/signals`                      |
| `get_rebalancing`                              | `GET /investment-plan/rebalancing`                  |
| `get_watchlist`                                | `GET /watchlist`                                    |
| `create_activity` (write)                      | `POST /activities`                                  |
| `create_price_alert` (write)                   | `POST /investment-plan/price-alert`                 |
| `update_price_alert` (write)                   | `PUT /investment-plan/price-alert/:id`              |
| `rearm_price_alert` (write)                    | `PUT /investment-plan/price-alert/:id/rearm`        |
| `delete_price_alert` (write, destructive)      | `DELETE /investment-plan/price-alert/:id`           |
| `update_signal_status` (write)                 | `PUT /investment-plan/signals/:id/status`           |
| `create_dca_schedule` (write)                  | `POST /investment-plan/dca`                         |
| `update_dca_schedule` (write)                  | `PUT /investment-plan/dca/:id`                      |
| `delete_dca_schedule` (write, destructive)     | `DELETE /investment-plan/dca/:id`                   |
| `upsert_allocation_group` (write)              | `PUT /investment-plan/allocation-group`             |
| `delete_allocation_group` (write, destructive) | `DELETE /investment-plan/allocation-group/:groupId` |

## Adding a tool

Add an entry to `MCP_TOOLS` in `mcp-tools.ts` and keep its description short:
the tool list is resident context for the connected model. Tools are `GET`
unless they are an allowlisted write. A tool that writes (`POST`, `PUT` or
`DELETE`) also needs its `METHOD /path` added to `MCP_ALLOWED_WRITES` in
`mcp-api-client.ts`, an explicit decision that should come with a test, an ADR
and an update of this README and the consent text in `oauth/oauth-pages.ts`.
The test `has a tool for every allowed write` keeps the list and the tools in
step. Responses above 200,000 characters are refused with a
hint to narrow the filters instead of being truncated.

## Tests

```bash
cd apps/api && npx jest -c jest.config.ts src/app/mcp src/app/investment-plan
```
