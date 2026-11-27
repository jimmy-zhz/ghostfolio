import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Injectable, Logger } from '@nestjs/common';

import {
  MCP_MAX_RESPONSE_CHARACTERS,
  buildApiBody,
  buildApiPath,
  callLocalApi
} from './mcp-api-client';
import { sanitizeResponseBody } from './mcp-sanitize';
import { MCP_TOOLS, McpToolDefinition } from './mcp-tools';

/**
 * Resident context for the whole session of the connected model: state only
 * what cannot be inferred from the tool names and schemas.
 */
export const MCP_SERVER_INSTRUCTIONS = `Ghostfolio is a personal portfolio tracker. These tools return the signed-in user's own data, so use them to ground investment decisions; the few that write say WRITE.

- Call get_user first: every monetary value is reported in the user's base currency unless a field says otherwise.
- Positions: list_holdings (flat) or get_portfolio_details (allocation, accounts, summary). get_holding gives one position in depth; take its dataSource and symbol from list_holdings.
- Transactions: list_activities, paginated with take/skip and filterable by date, type, symbol and account. Narrow the filters instead of paging through everything.
- Investment plan: get_investment_plan holds the user's targets (capital pool, cash buffer, growth target, allocation groups with target weights, DCA schedules, price alerts). Compare it with the actual portfolio: get_rebalancing shows the drift and the needed actions, get_investment_signals the recent DCA signals.
- Performance figures depend on the range argument (default ytd); state the range when quoting them.
- A tool error with a 4xx/5xx status comes straight from the Ghostfolio API; do not retry it unchanged.
- Tools are read-only except the ones marked WRITE. Before any write, show the user exactly what will be written and get explicit confirmation. Use lookup_symbol to get the symbol and dataSource right.
- create_activity records one transaction in the ledger (it places no order); check list_activities for duplicates first. Transactions cannot be edited or deleted here, the user corrects them in the Ghostfolio UI.
- The investment plan's price alerts, DCA schedules, signal status and target allocation groups can be changed; take the ids from get_investment_plan (signals: get_investment_signals). Deleting an alert, a schedule or a group cannot be undone, and changing the allocation groups changes the rebalancing and its alerts, so say so when asking for confirmation. The capital pool, cash buffer/reserve, growth target and notification settings can only be changed by the user in the Ghostfolio UI.
- Fund groups split the portfolio by tags next to the accounts: sources (whose money) and purposes (what it is for), see get_fund_groups. To help assign them: create_tag, upsert_fund_group, then tag_activities, which changes the tags of activities and nothing else. The user decides which activity belongs to which source; list the activities and ask, never guess.`;

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  public constructor(
    private readonly configurationService: ConfigurationService
  ) {}

  /**
   * Builds a server bound to the credential of one request. Stateless by
   * design: the endpoint creates a fresh server per request, so there is no
   * session state to leak between users.
   */
  public createServer({
    authorizationToken
  }: {
    authorizationToken: string;
  }): McpServer {
    const server = new McpServer(
      { name: 'ghostfolio', version: '1.0.0' },
      { instructions: MCP_SERVER_INSTRUCTIONS }
    );

    for (const tool of MCP_TOOLS) {
      server.registerTool(
        tool.name,
        {
          annotations: {
            destructiveHint: tool.destructive ?? tool.method === 'DELETE',
            idempotentHint: tool.idempotent ?? tool.method !== 'POST',
            openWorldHint: false,
            readOnlyHint: (tool.method ?? 'GET') === 'GET'
          },
          description: tool.description,
          inputSchema: tool.inputSchema
        },
        (args: Record<string, unknown>) =>
          this.executeTool({ args, authorizationToken, tool })
      );
    }

    return server;
  }

  public async executeTool({
    args,
    authorizationToken,
    tool
  }: {
    args: Record<string, unknown>;
    authorizationToken: string;
    tool: McpToolDefinition;
  }): Promise<CallToolResult> {
    try {
      const { body: rawBody, statusCode } = await callLocalApi({
        authorizationToken,
        body:
          tool.method === 'POST' || tool.method === 'PUT'
            ? buildApiBody({ args, tool })
            : undefined,
        method: tool.method ?? 'GET',
        path: buildApiPath({ args, tool }),
        port: this.configurationService.get('PORT')
      });

      const body = sanitizeResponseBody(rawBody);

      if (statusCode < 200 || statusCode >= 300) {
        return this.errorResult(
          `${statusCode} ${this.extractApiMessage(body)}`
        );
      }

      if (body.length > MCP_MAX_RESPONSE_CHARACTERS) {
        return this.errorResult(
          `The response is too large (${body.length} characters). Narrow it with range, symbol, accounts, startDate/endDate or take.`
        );
      }

      return { content: [{ text: body || '{}', type: 'text' }] };
    } catch (error) {
      this.logger.error(`${tool.name}: ${error.message}`);

      return this.errorResult(error.message);
    }
  }

  private errorResult(message: string): CallToolResult {
    return { content: [{ text: message, type: 'text' }], isError: true };
  }

  private extractApiMessage(body: string) {
    try {
      const { message } = JSON.parse(body);

      return Array.isArray(message) ? message.join(', ') : String(message);
    } catch {
      return body.slice(0, 200);
    }
  }
}
