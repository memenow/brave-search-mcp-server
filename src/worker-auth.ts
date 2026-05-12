/**
 * Auth helpers for the Cloudflare Worker entry point.
 * Runs on the Workers runtime; uses Web Crypto, not Node crypto.
 */

const encoder = new TextEncoder();

/**
 * Constant-time comparison of an Authorization Bearer header against an expected token.
 * Returns false when the header is missing, mis-formatted, or the token does not match.
 */
export function verifyBearer(request: Request, expected: string): boolean {
  const header = request.headers.get('authorization');
  if (!header) return false;

  const [scheme, token] = header.split(' ', 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false;

  const provided = encoder.encode(token);
  const target = encoder.encode(expected);
  if (provided.byteLength !== target.byteLength) return false;

  return crypto.subtle.timingSafeEqual(provided, target);
}
