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

  // Parse with indexOf so a token containing spaces is preserved verbatim.
  // `String.prototype.split(' ', 2)` would silently drop everything past the
  // second segment, which can make a rotation to a space-bearing token fail
  // authentication for the legitimate value.
  const space = header.indexOf(' ');
  if (space === -1) return false;
  const scheme = header.slice(0, space);
  const token = header.slice(space + 1);
  if (scheme.toLowerCase() !== 'bearer' || !token) return false;

  const provided = encoder.encode(token);
  const target = encoder.encode(expected);
  if (provided.byteLength !== target.byteLength) return false;

  return crypto.subtle.timingSafeEqual(provided, target);
}
