/**
 * Cloudflare Worker entry point for Brave Search MCP Server.
 *
 * Public surface is served under the configured Workers route (e.g. `mcp.memenow.xyz/brave/*`)
 * and requires `Authorization: Bearer ${MCP_AUTH_TOKEN}` on `/brave/mcp`. The `/internal/mcp`
 * path has no public route mapped to it and is reachable only via service bindings from other
 * Workers in the same account — those callers do not carry a credential.
 */
import { Container, getContainer } from '@cloudflare/containers';
import { verifyBearer } from './worker-auth.js';

/**
 * Brave Search MCP Container configuration.
 * Runs the MCP HTTP server on port 8080.
 *
 * Transport, port, and host are configured via Dockerfile.cloudflare ENV defaults:
 *   BRAVE_MCP_TRANSPORT=http, BRAVE_MCP_PORT=8080, BRAVE_MCP_HOST=0.0.0.0
 */
export class BraveSearchContainer extends Container {
  defaultPort = 8080;

  // Keep container alive for 10 minutes after last activity
  sleepAfter = '10m';

  override onStart() {
    console.log('Brave Search MCP Container started');
  }

  override onStop() {
    console.log('Brave Search MCP Container stopped');
  }
}

/**
 * Environment interface for the Worker.
 * Secrets are set via `wrangler secret put …` and never bundled.
 */
interface Env {
  BRAVE_SEARCH_CONTAINER: DurableObjectNamespace<BraveSearchContainer>;
  BRAVE_API_KEY: string;
  MCP_AUTH_TOKEN: string;
}

type Route = { rewriteTo: string; requireAuth: boolean };

const ROUTES: Record<string, Route> = {
  '/brave/mcp': { rewriteTo: '/mcp', requireAuth: true },
  '/brave/ping': { rewriteTo: '/ping', requireAuth: false },
  // Service-binding-only: not exposed via any public Workers route.
  '/internal/mcp': { rewriteTo: '/mcp', requireAuth: false },
};

const jsonResponse = (
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: HeadersInit
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  });

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];

    if (!route) {
      return jsonResponse(404, {
        error: 'Not Found',
        message: 'Use /brave/mcp or /brave/ping',
      });
    }

    if (!env.BRAVE_API_KEY) {
      return jsonResponse(500, {
        error: 'Configuration Error',
        message: 'BRAVE_API_KEY is not configured. Set it using: wrangler secret put BRAVE_API_KEY',
      });
    }

    if (route.requireAuth) {
      if (!env.MCP_AUTH_TOKEN) {
        return jsonResponse(500, {
          error: 'Configuration Error',
          message:
            'MCP_AUTH_TOKEN is not configured. Set it using: wrangler secret put MCP_AUTH_TOKEN',
        });
      }
      if (!verifyBearer(request, env.MCP_AUTH_TOKEN)) {
        return jsonResponse(
          401,
          { error: 'Unauthorized', message: 'Bearer token required' },
          { 'WWW-Authenticate': 'Bearer' }
        );
      }
    }

    // Rewrite the path before forwarding so the containerized Express app (which only
    // serves /mcp and /ping) keeps working unchanged.
    url.pathname = route.rewriteTo;
    const forwarded = new Request(url.toString(), request);

    const container = getContainer(env.BRAVE_SEARCH_CONTAINER, 'default');

    try {
      await container.startAndWaitForPorts({
        startOptions: {
          envVars: {
            BRAVE_API_KEY: env.BRAVE_API_KEY,
          },
        },
      });

      return container.fetch(forwarded);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Container startup failed:', message);
      return jsonResponse(503, {
        error: 'Container Error',
        message: `Failed to start MCP container: ${message}`,
      });
    }
  },
};
