/**
 * Cloudflare Worker entry point for Brave Search MCP Server.
 * This worker routes requests to the containerized MCP HTTP server.
 */
import { Container, getContainer } from '@cloudflare/containers';

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
 * BRAVE_API_KEY is set via Wrangler Secrets (not in vars).
 */
interface Env {
  BRAVE_SEARCH_CONTAINER: DurableObjectNamespace<BraveSearchContainer>;
  BRAVE_API_KEY: string;
}

/**
 * Worker fetch handler.
 * Routes MCP and health-check requests to the Brave Search MCP Container.
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Only allow known MCP paths
    if (url.pathname !== '/mcp' && url.pathname !== '/ping') {
      return new Response(JSON.stringify({ error: 'Not Found', message: 'Use /mcp or /ping' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate that BRAVE_API_KEY is configured
    if (!env.BRAVE_API_KEY) {
      return new Response(
        JSON.stringify({
          error: 'Configuration Error',
          message:
            'BRAVE_API_KEY is not configured. Set it using: wrangler secret put BRAVE_API_KEY',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the container instance and forward the request
    const container = getContainer(env.BRAVE_SEARCH_CONTAINER, 'default');

    try {
      await container.startAndWaitForPorts({
        startOptions: {
          envVars: {
            BRAVE_API_KEY: env.BRAVE_API_KEY,
          },
        },
      });

      return container.fetch(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Container startup failed:', message);
      return new Response(
        JSON.stringify({
          error: 'Container Error',
          message: `Failed to start MCP container: ${message}`,
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
