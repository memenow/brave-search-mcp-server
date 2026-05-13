import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const sha256 = (input: string): Buffer => createHash('sha256').update(input, 'utf8').digest();

/**
 * Constant-time comparison of an `Authorization: Bearer <token>` header against an
 * expected value. Returns false when the header is missing, mis-formatted, or the
 * token does not match.
 *
 * Both sides are SHA-256 hashed before comparison so `timingSafeEqual` always
 * operates on equal-length 32-byte buffers. This removes the token-length side
 * channel that an early `Buffer.length` check would leave open, matching the
 * Web Crypto implementation in `worker-auth.ts`.
 */
export function verifyBearer(authorization: string | undefined, expected: string): boolean {
  if (!authorization) return false;

  // Parse with indexOf so a token containing spaces is preserved verbatim.
  // `split(' ', 2)` would silently drop everything past the second segment,
  // which can break authentication after rotating to a space-bearing token.
  const space = authorization.indexOf(' ');
  if (space === -1) return false;
  const scheme = authorization.slice(0, space);
  const token = authorization.slice(space + 1);
  if (scheme.toLowerCase() !== 'bearer' || !token) return false;

  return timingSafeEqual(sha256(token), sha256(expected));
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

const hasColon = (h: string): boolean => h.includes(':');

/**
 * Builds an Express middleware that validates the `Host` and `Origin` headers to
 * mitigate DNS rebinding attacks against local HTTP MCP servers.
 *
 * - `Host` is required and must match the configured bind host:port or one of the
 *   loopback aliases. Additional hosts may be supplied via `allowedHosts`.
 * - `Origin`, when present, must appear in `allowedOrigins`. Non-browser MCP clients
 *   typically omit Origin entirely, so an empty allowlist still permits those.
 *
 * IPv6 forms: per RFC 7230 §5.4 the `Host` header for an IPv6 literal carries
 * brackets (`[::1]:8080`). We generate both the bracketed and bare forms so a
 * client that follows the RFC and an operator who passes `::1` to BRAVE_MCP_HOST
 * both work without further configuration.
 */
export function dnsRebindingGuard(opts: {
  bindHost: string;
  bindPort: number;
  allowedHosts: string[];
  allowedOrigins: string[];
}) {
  const port = opts.bindPort;
  const bracket = (h: string): string => (hasColon(h) ? `[${h}]` : h);

  const expectedHosts = new Set<string>(
    [
      // Configured bind host, both forms.
      `${bracket(opts.bindHost)}:${port}`,
      `${opts.bindHost}:${port}`,
      // Bare host names (a few clients omit the port).
      ...LOOPBACK_HOSTS,
      opts.bindHost,
      // Loopback aliases with port, IPv4 plain and IPv6 bracketed.
      ...[...LOOPBACK_HOSTS].map((h) => `${bracket(h)}:${port}`),
      ...[...LOOPBACK_HOSTS].map((h) => `${h}:${port}`),
      // Operator-supplied extras.
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
