# Security

The asset worth protecting is the **Brave Search API quota** behind
`BRAVE_API_KEY`. Anyone who can invoke a tool spends that quota, so the goal of
the auth layers below is to keep tool invocation gated wherever the server is
reachable from an untrusted network.

This is a single-tenant proxy. The model is deliberately simple (a shared bearer
token, not OAuth or per-client identity); see [Known gaps](#known-gaps).

## Authentication

The Node HTTP transport provides an opt-in bearer check:

| Layer | File | Token | When active |
| --- | --- | --- | --- |
| Node HTTP transport | `src/protocols/auth.ts` | `BRAVE_MCP_AUTH_TOKEN` (env) | Opt-in on `/mcp`; a no-op when the token is unset. |

The bearer exists for standalone HTTP deployments such as Docker, `npx`, and
AgentCore. Bind to loopback when possible and configure the token whenever the
server is reachable from an untrusted network.

### Constant-time comparison

`verifyBearer` hashes each side with **SHA-256 before comparing**, then runs
`timingSafeEqual` over the two fixed-length 32-byte digests:

- `src/protocols/auth.ts` uses Node `crypto` (`createHash('sha256')` +
  `timingSafeEqual`).

Hashing first removes the token-length side channel a naive `length`-then-compare
would leave open (`timingSafeEqual` only guarantees constant time for
equal-length inputs).

The parser splits the `Authorization` header with `indexOf(' ')` rather than
`split(' ', 2)`, so a token that itself contains spaces survives verbatim — a
rotation to a space-bearing token will not silently fail.

## DNS-rebinding protection

`dnsRebindingGuard` (`src/protocols/auth.ts`) is mounted globally on the HTTP
app and validates request headers before any handler runs:

- **`Host`** must match the configured bind `host:port`, a loopback alias, or an
  operator-supplied `BRAVE_MCP_ALLOWED_HOSTS` entry. A mismatch returns `421`.
- **`Origin`**, when present, must be in `BRAVE_MCP_ALLOWED_ORIGINS`; otherwise
  `403`. Non-browser MCP clients usually omit `Origin`, so an empty allowlist
  still permits them.

The expected-host set is generated in both **bare and bracketed IPv6 forms**
(`::1` and `[::1]`, with and without `:port`) per RFC 7230 §5.4, so RFC-compliant
IPv6 clients and operators who pass `::1` to `BRAVE_MCP_HOST` both work without
extra configuration.

## Upstream error sanitization

Brave's API error bodies echo plan and quota metadata that should not reach
downstream MCP clients. `BraveAPI.issueRequest()` (`src/BraveAPI/index.ts`) logs
the full upstream error body to **stderr** for operators and throws an `Error`
whose message is `Brave Search API request failed: ${status} ${statusText}` — the
coarse HTTP status only, never the upstream body.

## Hardening defaults

The HTTP app (`src/protocols/http.ts`) also:

- disables `x-powered-by` (no Express version advertisement);
- sets `trust proxy` to `false` (does not honor `X-Forwarded-*` unless an
  operator opts in);
- evicts stateful sessions from the transport map on `transport.onclose`, so a
  long-lived stateful deployment cannot leak session objects without bound;
- warns on stderr when bound to a non-loopback host without a bearer token.

## Known gaps

These are accepted limitations for a single-tenant internal proxy, not hidden
behavior:

- **No rate limiting.** `checkRateLimit()` (`src/utils.ts`) is dead code; its
  call site in `src/BraveAPI/index.ts` is commented out. Nothing throttles tool
  calls today.
- **Single static token.** `BRAVE_MCP_AUTH_TOKEN` is a shared secret with no
  per-client identity and no built-in rotation.
- **No OAuth.** The MCP authorization spec moves toward OAuth 2.1; the bearer
  token here is a deliberate stop-gap for single-tenant use.
- **No CORS handling** on the HTTP server.
- **No retry/backoff** in `BraveAPI.issueRequest()` for upstream 5xx or network
  errors.
