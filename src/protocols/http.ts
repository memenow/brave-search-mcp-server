import { randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import config from '../config.js';
import createMcpServer from '../server.js';
import { bearerAuth, dnsRebindingGuard, isLoopbackHost } from './auth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequest, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const yieldGenericServerError = (res: Response) => {
  res.status(500).json({
    id: null,
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
  });
};

const transports = new Map<string, StreamableHTTPServerTransport>();

const isListToolsRequest = (value: unknown): value is ListToolsRequest =>
  ListToolsRequestSchema.safeParse(value).success;

const getTransport = async (request: Request): Promise<StreamableHTTPServerTransport> => {
  // Check for an existing session
  const sessionId = request.headers['mcp-session-id'] as string;

  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }

  // We have a special case where we'll permit ListToolsRequest w/o a session ID
  if (!sessionId && isListToolsRequest(request.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    return transport;
  }

  let transport: StreamableHTTPServerTransport;

  if (config.stateless) {
    // Some contexts (e.g. AgentCore) may prefer or require a stateless transport
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
  } else {
    // Stateful: register the transport in `transports` on session init and remove it
    // on close so the map cannot grow without bound while the server runs.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };
  }

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);
  return transport;
};

/**
 * Container-side defense in depth: the Cloudflare Worker injects `x-internal-secret`
 * on every forwarded /mcp request. We constant-time compare it against the
 * INTERNAL_SECRET env var so that even if the container port is reached directly
 * (route misconfig, accidental publish, etc.) the Brave API quota stays protected.
 *
 * The check is opt-in: if INTERNAL_SECRET is unset (e.g. local stdio dev, plain
 * `npx` consumers, Docker users) the middleware passes through unchanged.
 */
const requireInternalSecret = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.INTERNAL_SECRET;
  if (!expected) return next();

  const provided = req.header('x-internal-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({
      id: null,
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
    });
    return;
  }
  next();
};

const createApp = () => {
  const app = express();

  // Don't advertise Express to clients and don't trust X-Forwarded-* headers
  // unless the operator explicitly configures a reverse proxy.
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use(express.json());

  // DNS-rebinding protection: enforced globally so /mcp, /ping, and anything we
  // mount in the future all benefit. Loopback aliases are always permitted; the
  // configured bind host:port is added automatically; operators can extend via
  // BRAVE_MCP_ALLOWED_HOSTS / BRAVE_MCP_ALLOWED_ORIGINS.
  app.use(
    dnsRebindingGuard({
      bindHost: config.host,
      bindPort: config.port,
      allowedHosts: config.allowedHosts,
      allowedOrigins: config.allowedOrigins,
    })
  );

  // Bearer auth on /mcp is opt-in: the middleware no-ops when BRAVE_MCP_AUTH_TOKEN
  // is unset, preserving stdio / Docker / npm flows. It is independent of the
  // container-side x-internal-secret check above: the Worker path uses the
  // INTERNAL_SECRET header, while a standalone HTTP deployment uses Bearer.
  app.all(
    '/mcp',
    bearerAuth(config.authToken),
    requireInternalSecret,
    async (req: Request, res: Response) => {
      try {
        const transport = await getTransport(req);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(error);
        if (!res.headersSent) {
          yieldGenericServerError(res);
        }
      }
    }
  );

  app.all('/ping', (req: Request, res: Response) => {
    res.status(200).json({ message: 'pong' });
  });

  return app;
};

const start = () => {
  if (!config.ready) {
    console.error('Invalid configuration');
    process.exit(1);
  }

  const app = createApp();

  if (!config.authToken && !isLoopbackHost(config.host)) {
    console.warn(
      `[brave-search-mcp] WARNING: HTTP transport is bound to ${config.host} without a bearer ` +
        `token. Anyone who can reach this port can call MCP tools and consume your Brave API ` +
        `quota. Set BRAVE_MCP_AUTH_TOKEN, bind to 127.0.0.1, or place an authenticating proxy ` +
        `in front of this server.`
    );
  }

  app.listen(config.port, config.host, () => {
    console.log(`Server is running on http://${config.host}:${config.port}/mcp`);
  });
};

export default { start, createApp };
