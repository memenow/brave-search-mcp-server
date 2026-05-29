# Security

The asset worth protecting is the **Brave Search API quota** behind
`BRAVE_API_KEY`. Anyone who can invoke a tool spends that quota, so the goal of
the auth layers below is to keep tool invocation gated wherever the server is
reachable from an untrusted network.

This is a single-tenant proxy. The model is deliberately simple (a shared bearer
token, not OAuth or per-client identity); see [Known gaps](#known-gaps).

## Authentication

There are two independent bearer checks, one per network edge:

| Layer | File | Token | When active |
| --- | --- | --- | --- |
| Cloudflare Worker edge | `src/worker-auth.ts` | `MCP_AUTH_TOKEN` (Worker secret) | Always, on `/brave/mcp`. |
| Node HTTP transport | `src/protocols/auth.ts` | `BRAVE_MCP_AUTH_TOKEN` (env) | Opt-in on `/mcp`; a no-op when the token is unset. |

In the Cloudflare deployment only the edge check runs: the Worker verifies the
public token and the container behind it runs **without** `BRAVE_MCP_AUTH_TOKEN`,
because the Worker has already terminated auth. The Node-side bearer exists for
standalone HTTP deployments (Docker, `npx`, AgentCore) where there is no Worker
in front.

### Constant-time comparison

Both `verifyBearer` implementations hash each side with **SHA-256 before
comparing**, then run `timingSafeEqual` over the two fixed-length 32-byte
digests:

- `src/worker-auth.ts` uses Web Crypto (`crypto.subtle.digest` +
  `crypto.subtle.timingSafeEqual`).
- `src/protocols/auth.ts` uses Node `crypto` (`createHash('sha256')` +
  `timingSafeEqual`).

Hashing first removes the token-length side channel a naive `length`-then-compare
would leave open (`timingSafeEqual` only guarantees constant time for
equal-length inputs).

Both parsers split the `Authorization` header with `indexOf(' ')` rather than
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

## Service-binding internal path

`/internal/mcp` has **no public Workers route** mapped to it and is reachable
only through a service binding (`env.BRAVE_MCP.fetch(...)`) from another Worker
in the same Cloudflare account. Service-binding calls do not traverse the public
edge, so they intentionally skip the public bearer check. `workers_dev: false`
removes the default `*.workers.dev` subdomain that could otherwise expose the
path. Route-based separation is used rather than sniffing the `CF-Worker` header,
which Cloudflare documents as unsafe for security decisions.

## Upstream error sanitization

Brave's API error bodies echo plan and quota metadata that should not reach
downstream MCP clients. `BraveAPI.issueRequest()` (`src/BraveAPI/index.ts`) logs
the full upstream error body to **stderr** for operators and throws an `Error`
whose message is `Brave Search API request failed: ${status} ${statusText}` — the
coarse HTTP status only, never the upstream body. The Worker applies the same principle:
backend and configuration failures return a generic `503`
(`{ error, message }`) while the specific cause goes to `console.error`, so
unauthenticated callers cannot distinguish "secret missing" from "backend down".

## Hardening defaults

The HTTP app (`src/protocols/http.ts`) also:

- disables `x-powered-by` (no Express version advertisement);
- sets `trust proxy` to `false` (does not honor `X-Forwarded-*` unless an
  operator opts in);
- evicts stateful sessions from the transport map on `transport.onclose`, so a
  long-lived stateful deployment cannot leak session objects without bound;
- warns on stderr when bound to a non-loopback host without a bearer token.

## History: the removed INTERNAL_SECRET layer

An earlier design (PR #18) added a Worker→Container `x-internal-secret` header
plus a `requireInternalSecret` middleware as a defense-in-depth layer, along with
per-request container fan-out (`getRandom`) and a structured `logEvent` helper.

PR #21 **reverted** that layer. The Worker no longer strips the public
`Authorization` header or injects `x-internal-secret`, the container no longer
checks it, and routing reverted to `getContainer(env.BRAVE_SEARCH_CONTAINER,
'default')`. The opt-in Node-side `bearerAuth` and the global
`dnsRebindingGuard` (both added in PR #20) were **kept**. A follow-up fix in the
same PR restored the `transport.onclose` session eviction (independent of the
reverted layer) and changed the Worker to `return await container.fetch(...)` so
post-readiness fetch rejections surface as the generic `503` rather than an
unhandled error.

If you find references to `INTERNAL_SECRET`, `x-internal-secret`,
`requireInternalSecret`, `CONTAINER_FANOUT`, or `getRandom` in older notes, they
describe pre-#21 state and no longer apply.

## Known gaps

These are accepted limitations for a single-tenant internal proxy, not hidden
behavior:

- **No rate limiting.** `checkRateLimit()` (`src/utils.ts`) is dead code; its
  call site in `src/BraveAPI/index.ts` is commented out. Nothing throttles tool
  calls today.
- **Single static token.** `MCP_AUTH_TOKEN` / `BRAVE_MCP_AUTH_TOKEN` are shared
  secrets with no per-client identity and no built-in rotation.
- **No OAuth.** The MCP authorization spec moves toward OAuth 2.1; the bearer
  token here is a deliberate stop-gap for single-tenant use.
- **No CORS handling** on either the Worker or the container.
- **No retry/backoff** in `BraveAPI.issueRequest()` for upstream 5xx or network
  errors.
