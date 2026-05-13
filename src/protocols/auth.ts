import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Constant-time comparison of an `Authorization: Bearer <token>` header against an
 * expected value. Returns false when the header is missing, mis-formatted, or the
 * token does not match.
 */
export function verifyBearer(authorization: string | undefined, expected: string): boolean {
  if (!authorization) return false;

  const [scheme, token] = authorization.split(' ', 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false;

  const provided = Buffer.from(token);
  const target = Buffer.from(expected);
  if (provided.length !== target.length) return false;

  return timingSafeEqual(provided, target);
}

/**
 * Express middleware that enforces a bearer token on the route it is mounted on.
 * If `expected` is empty, the middleware is a no-op (auth disabled).
 */
export function bearerAuth(expected: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected) return next();

    if (verifyBearer(req.headers.authorization, expected)) return next();

    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({
        id: null,
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
      });
  };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '0:0:0:0:0:0:0:1']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

/**
 * Builds an Express middleware that validates the `Host` and `Origin` headers to
 * mitigate DNS rebinding attacks against local HTTP MCP servers.
 *
 * - `Host` is required and must match the configured bind host:port or one of the
 *   loopback aliases. Additional hosts may be supplied via `allowedHosts`.
 * - `Origin`, when present, must appear in `allowedOrigins`. Non-browser MCP clients
 *   typically omit Origin entirely, so an empty allowlist still permits those.
 */
export function dnsRebindingGuard(opts: {
  bindHost: string;
  bindPort: number;
  allowedHosts: string[];
  allowedOrigins: string[];
}) {
  const expectedHosts = new Set<string>(
    [
      `${opts.bindHost}:${opts.bindPort}`,
      ...LOOPBACK_HOSTS,
      ...[...LOOPBACK_HOSTS].map((h) => `${h}:${opts.bindPort}`),
      ...opts.allowedHosts,
    ].map((h) => h.toLowerCase())
  );
  const allowedOrigins = new Set(opts.allowedOrigins.map((o) => o.toLowerCase()));

  return (req: Request, res: Response, next: NextFunction) => {
    const host = (req.headers.host ?? '').toLowerCase();
    if (!host || !expectedHosts.has(host)) {
      res
        .status(421)
        .json({ id: null, jsonrpc: '2.0', error: { code: -32000, message: 'Host not allowed' } });
      return;
    }

    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin.toLowerCase())) {
      res
        .status(403)
        .json({ id: null, jsonrpc: '2.0', error: { code: -32000, message: 'Origin not allowed' } });
      return;
    }

    next();
  };
}
