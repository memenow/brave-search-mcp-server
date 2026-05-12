/**
 * Cloudflare Worker entry point for Brave Search MCP Server.
 *
 * Public surface is served under the configured Workers route (e.g. `mcp.memenow.xyz/brave/*`)
 * and requires `Authorization: Bearer ${MCP_AUTH_TOKEN}` on `/brave/mcp`. The `/internal/mcp`
 * path has no public route mapped to it and is reachable only via service bindings from other
 * Workers in the same account — those callers do not carry a credential.
 *
 * Defense in depth: every request the Worker forwards into the Container carries an
 * `x-internal-secret: ${INTERNAL_SECRET}` header, and the container-side Express app
 * rejects any /mcp request whose header does not match. This way, even if a routes
 * entry accidentally exposes /internal/*, or the container port is reached directly,
 * Brave Search API quota stays protected.
 */
import { Container, getRandom } from '@cloudflare/containers';
import { verifyBearer } from './worker-auth.js';

/**
 * Environment interface shared by the Worker and the Container Durable Object.
 * Secrets are set via `wrangler secret put …` and never bundled.
 */
interface Env {
  BRAVE_SEARCH_CONTAINER: DurableObjectNamespace<BraveSearchContainer>;
  BRAVE_API_KEY: string;
  MCP_AUTH_TOKEN: string;
  INTERNAL_SECRET: string;
}

/**
 * Brave Search MCP Container configuration.
 * Runs the MCP HTTP server on port 8080.
 *
 * `envVars` is populated in the constructor so secrets are re-applied every time
 * the container starts (cold start, post-sleep restart, redeploy). Setting them
 * here rather than in `startAndWaitForPorts({ startOptions: { envVars } })` is the
 * documented pattern: per-request startOptions are a no-op against an already-warm
 * container, which would silently leave a stale process.env in place.
 *
 * Transport/port/host are configured via Dockerfile.cloudflare ENV defaults:
 *   BRAVE_MCP_TRANSPORT=http, BRAVE_MCP_PORT=8080, BRAVE_MCP_HOST=0.0.0.0
 */
export class BraveSearchContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '10m';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envVars = {
      BRAVE_API_KEY: env.BRAVE_API_KEY ?? '',
      INTERNAL_SECRET: env.INTERNAL_SECRET ?? '',
    };
  }

  override onStart() {
    console.log('Brave Search MCP Container started');
  }

  override onStop() {
    console.log('Brave Search MCP Container stopped');
  }
}

type Route = { rewriteTo: string; requireAuth: boolean };

const ROUTES: Record<string, Route> = {
  '/brave/mcp': { rewriteTo: '/mcp', requireAuth: true },
  '/brave/ping': { rewriteTo: '/ping', requireAuth: false },
  // Service-binding-only: not exposed via any public Workers route.
  '/internal/mcp': { rewriteTo: '/mcp', requireAuth: false },
};

// Must match wrangler.jsonc containers[].max_instances so getRandom can spread
// load across every provisioned container.
const CONTAINER_FANOUT = 2;

const jsonResponse = (
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: HeadersInit
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  });

const generateRequestId = (request: Request): string =>
  request.headers.get('cf-ray') ?? crypto.randomUUID();

const backendUnavailable = (requestId: string): Response =>
  jsonResponse(503, {
    error: 'Service Unavailable',
    message: 'Backend temporarily unavailable',
    requestId,
  });

const logEvent = (event: string, ctx: Record<string, unknown>): void => {
  console.error(JSON.stringify({ event, ...ctx }));
};

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

    // Authenticate before any config-state check so unauthenticated probes on the
    // public surface cannot distinguish "secret missing" from "auth required". A
    // missing `MCP_AUTH_TOKEN` is treated as a 401, not a configuration error.
    if (route.requireAuth) {
      if (!env.MCP_AUTH_TOKEN || !(await verifyBearer(request, env.MCP_AUTH_TOKEN))) {
        return jsonResponse(
          401,
          { error: 'Unauthorized', message: 'Bearer token required' },
          { 'WWW-Authenticate': 'Bearer' }
        );
      }
    }

    const requestId = generateRequestId(request);

    // Config-state errors collapse into the same generic 503 used for backend
    // failures so unauthenticated callers on auth-free paths (e.g. /brave/ping)
    // cannot distinguish "secret missing" from "backend down". Operators see the
    // specific cause via console.error.
    if (!env.BRAVE_API_KEY) {
      logEvent('config_missing', { requestId, secret: 'BRAVE_API_KEY' });
      return backendUnavailable(requestId);
    }

    if (!env.INTERNAL_SECRET) {
      logEvent('config_missing', { requestId, secret: 'INTERNAL_SECRET' });
      return backendUnavailable(requestId);
    }

    // Rewrite the path before forwarding so the containerized Express app (which
    // only serves /mcp and /ping) keeps working unchanged. Strip the public
    // Authorization header so it does not reach the container, and inject the
    // internal secret that the container will require on /mcp.
    url.pathname = route.rewriteTo;
    const forwarded = new Request(url.toString(), request);
    forwarded.headers.delete('authorization');
    forwarded.headers.set('x-internal-secret', env.INTERNAL_SECRET);

    // Round-robin across the provisioned container instances; Brave Search calls
    // are stateless so any container can serve any request.
    const container = await getRandom(env.BRAVE_SEARCH_CONTAINER, CONTAINER_FANOUT);

    try {
      await container.startAndWaitForPorts();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      logEvent('container_start_failed', { requestId, path: url.pathname, error: detail });
      return backendUnavailable(requestId);
    }

    try {
      return await container.fetch(forwarded);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      logEvent('container_fetch_failed', { requestId, path: url.pathname, error: detail });
      return backendUnavailable(requestId);
    }
  },
};
