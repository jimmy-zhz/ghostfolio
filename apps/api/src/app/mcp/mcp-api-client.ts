import { request } from 'node:http';

import { McpToolDefinition } from './mcp-tools';

export const MCP_MAX_RESPONSE_CHARACTERS = 200_000;

/**
 * The only requests that may change data, as `METHOD /path`, where a `:param`
 * segment matches one path segment. Everything else must be a GET. This is
 * checked where the request is sent, so a tool definition cannot open another
 * write endpoint by accident: adding one means editing this list on purpose
 * (see ADR 0002 and ADR 0004).
 */
export const MCP_ALLOWED_WRITES = [
  'POST /api/v1/activities',
  'POST /api/v1/investment-plan/price-alert',
  'PUT /api/v1/investment-plan/price-alert/:id',
  'PUT /api/v1/investment-plan/price-alert/:id/rearm',
  'DELETE /api/v1/investment-plan/price-alert/:id',
  'PUT /api/v1/investment-plan/signals/:id/status',
  'POST /api/v1/investment-plan/dca',
  'PUT /api/v1/investment-plan/dca/:id',
  'DELETE /api/v1/investment-plan/dca/:id',
  'PUT /api/v1/investment-plan/allocation-group',
  'DELETE /api/v1/investment-plan/allocation-group/:groupId',
  'POST /api/v1/activity-tags/tags',
  'PUT /api/v1/investment-plan/fund-groups',
  'DELETE /api/v1/investment-plan/fund-groups/:id',
  'PUT /api/v1/activity-tags'
];

export type McpHttpMethod = 'DELETE' | 'GET' | 'POST' | 'PUT';

/**
 * A substituted path parameter: one encoded segment, never a dot segment (which
 * encodeURIComponent keeps) and never a query or fragment.
 */
const PATH_PARAMETER_SEGMENT = /^(?!\.{1,2}$)[^/?#]+$/;

export interface McpApiResponse {
  body: string;
  statusCode: number;
}

export function buildApiPath({
  args,
  tool
}: {
  args: Record<string, unknown>;
  tool: McpToolDefinition;
}) {
  const pathParams = new Set(tool.pathParams ?? []);

  let path = tool.path;

  for (const name of pathParams) {
    const value = args[name];

    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing required path parameter "${name}"`);
    }

    const segment = encodeURIComponent(String(value));

    if (!PATH_PARAMETER_SEGMENT.test(segment)) {
      throw new Error(`Invalid path parameter "${name}"`);
    }

    path = path.replace(`:${name}`, segment);
  }

  if (tool.method && tool.method !== 'GET') {
    // Arguments travel in the body (see buildApiBody), a DELETE has none
    return `/api/v${tool.version ?? 1}${path}`;
  }

  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(args)) {
    if (pathParams.has(name) || value === undefined || value === null) {
      continue;
    }

    query.set(name, Array.isArray(value) ? value.join(',') : String(value));
  }

  const queryString = query.toString();

  return `/api/v${tool.version ?? 1}${path}${queryString ? `?${queryString}` : ''}`;
}

/**
 * A date without a time is read as midnight UTC, which the web client shows as
 * the day before in every time zone west of UTC (the activity of 2026-10-20
 * appeared as 2026-10-19 in Winnipeg). Noon UTC is the same calendar day from
 * UTC-12 to UTC+11.
 */
export function normalizeActivityDate(date: unknown) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return `${date.trim()}T12:00:00.000Z`;
  }

  return date;
}

export function buildApiBody({
  args,
  tool
}: {
  args: Record<string, unknown>;
  tool: McpToolDefinition;
}) {
  const pathParams = new Set(tool.pathParams ?? []);

  return Object.fromEntries(
    Object.entries(args)
      .filter(([name, value]) => !pathParams.has(name) && value !== undefined)
      .map(([name, value]) => [
        name,
        name === 'date' ? normalizeActivityDate(value) : value
      ])
  );
}

export function assertRequestAllowed({
  method,
  path
}: {
  method: string;
  path: string;
}) {
  if (
    method !== 'GET' &&
    !MCP_ALLOWED_WRITES.some((allowedWrite) => {
      return matchesAllowedWrite({ allowedWrite, method, path });
    })
  ) {
    throw new Error(`${method} ${path} is not allowed through MCP`);
  }
}

function matchesAllowedWrite({
  allowedWrite,
  method,
  path
}: {
  allowedWrite: string;
  method: string;
  path: string;
}) {
  const [allowedMethod, allowedPath] = allowedWrite.split(' ');

  if (method !== allowedMethod) {
    return false;
  }

  const allowedSegments = allowedPath.split('/');
  const segments = path.split('/');

  return (
    segments.length === allowedSegments.length &&
    allowedSegments.every((allowedSegment, index) => {
      return allowedSegment.startsWith(':')
        ? PATH_PARAMETER_SEGMENT.test(segments[index])
        : allowedSegment === segments[index];
    })
  );
}

/**
 * Runs a request against the API of this very process over the loopback
 * interface. `node:http` is used on purpose instead of `fetch`: the global
 * undici dispatcher honours HTTP_PROXY and must not be involved in a request
 * that never leaves the host.
 */
export function callLocalApi({
  authorizationToken,
  body,
  method = 'GET',
  path,
  port
}: {
  authorizationToken: string;
  body?: Record<string, unknown>;
  method?: McpHttpMethod;
  path: string;
  port: number;
}): Promise<McpApiResponse> {
  return new Promise((resolve, reject) => {
    try {
      assertRequestAllowed({ method, path });
    } catch (error) {
      return reject(error);
    }

    const payload =
      method === 'GET' || method === 'DELETE'
        ? undefined
        : JSON.stringify(body ?? {});

    const apiRequest = request(
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${authorizationToken}`,
          ...(payload === undefined
            ? {}
            : {
                'content-length': Buffer.byteLength(payload),
                'content-type': 'application/json'
              })
        },
        host: '127.0.0.1',
        method,
        path,
        port,
        timeout: 60_000
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            statusCode: response.statusCode ?? 500
          })
        );
        response.on('error', reject);
      }
    );

    apiRequest.on('timeout', () => {
      apiRequest.destroy(new Error('Request to the Ghostfolio API timed out'));
    });
    apiRequest.on('error', reject);
    apiRequest.end(payload);
  });
}
