/**
 * Auth helpers for the Cloudflare Worker entry point.
 * Runs on the Workers runtime; uses Web Crypto, not Node crypto.
 */

const encoder = new TextEncoder();

/**
 * Constant-time comparison of an Authorization Bearer header against an expected token.
 * Returns false when the header is missing, mis-formatted, or the token does not match.
 *
 * Both sides are SHA-256 hashed before comparison so the `timingSafeEqual` call
 * always operates on equal-length 32-byte buffers. This removes the
 * token-length side channel that a raw early-length-check would leave open:
 * Workers' `crypto.subtle.timingSafeEqual` only guarantees constant time for
 * inputs of the same length, so comparing the hashes (always 32 bytes) hides
 * the underlying token length from response-time probes.
 */
export async function verifyBearer(request: Request, expected: string): Promise<boolean> {
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

  const [providedHash, targetHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  return crypto.subtle.timingSafeEqual(providedHash, targetHash);
}
