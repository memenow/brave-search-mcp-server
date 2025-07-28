import express, { type Request, type Response, type NextFunction } from 'express';
import config from '../config.js';
import { server } from '../server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const yieldGenericServerError = (res: Response) => {
  res.status(500).json({
    id: null,
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
  });
};

export const start = () => {
  if (!config.ready) {
    console.error('Invalid configuration');
    process.exit(1);
  }

  const app = express();

  app.use(express.json());

  // CORS middleware for production security
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    // In production, validate against allowed origins
    if (process.env.NODE_ENV === 'production' && process.env.ALLOWED_ORIGINS) {
      const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    } else {
      // Development mode - be more permissive
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.all('/mcp', async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate Origin header for security (MCP best practice)
      const origin = req.headers.origin;
      if (process.env.NODE_ENV === 'production') {
        if (!origin) {
          res.status(403).json({
            id: null,
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Origin header required' },
          });
          return;
        }

        // Validate against allowed origins
        if (process.env.ALLOWED_ORIGINS) {
          const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
          if (!allowedOrigins.includes(origin)) {
            res.status(403).json({
              id: null,
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Origin not allowed' },
            });
            return;
          }
        }
      }

      const transport = new StreamableHTTPServerTransport({
        // Setting to undefined will opt-out of session-id generation
        // For stateless search service, we don't need sessions
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        yieldGenericServerError(res);
      }
    }
  });

  app.all('/ping', (_req: Request, res: Response): void => {
    res.status(200).json({ message: 'pong' });
  });

  app.listen(config.port, config.host, () => {
    console.error(`Server is running on http://${config.host}:${config.port}/mcp`);
  });
};

export default { start };
