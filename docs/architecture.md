# Architecture

The server exposes the Brave Search API as a set of MCP tools over two
transports from one TypeScript (ESM) codebase. STDIO is the default, and the
HTTP transport reuses the same MCP server factory and tool implementations.

## Module map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | CLI entry point and npm `bin`. Parses options, then starts the STDIO or HTTP transport. |
| `src/config.ts` | Configuration: Commander CLI parsing, `dotenv`, the Smithery `configSchema` (Zod), and the module-level `state` object that the rest of the code reads. |
| `src/server.ts` | `createMcpServer()` — builds an `McpServer`, registers each enabled tool, and returns it. Shared by every transport. |
| `src/tools/` | One folder per tool (`web`, `local`, `videos`, `images`, `news`, `summarizer`); `tools/index.ts` aggregates them. |
| `src/BraveAPI/index.ts` | `issueRequest()` — the single outbound HTTP client for the Brave Search API, including parameter shaping and upstream-error sanitization. |
| `src/protocols/stdio.ts` | STDIO transport (`StdioServerTransport`). |
| `src/protocols/http.ts` | Express app + `StreamableHTTPServerTransport`, the session map, and the request guards. |
| `src/protocols/auth.ts` | Shared Node-side auth helpers: `verifyBearer`, `bearerAuth`, `dnsRebindingGuard`, `isLoopbackHost`. |
| `src/utils.ts` | `stringify()` helper. Also defines `checkRateLimit()` — see _Reserved code_ below. |
| `src/constants.ts` | `RATE_LIMIT` constant — referenced only by the unused `checkRateLimit()`. |
| `src/helpers.ts` | `registerSigIntHandler()` — see _Reserved code_ below. |

## Build target

`tsconfig.json` compiles the Node runtime under `src/` to `dist/` via
`npm run build` (`tsc` + `chmod +x dist/*.js`).

## The MCP server factory

`createMcpServer()` (in `src/server.ts`) is the one place tools are wired up:

1. Optionally applies a Smithery config via `setOptions()`.
2. Constructs an `McpServer` with `name`, `title`, and `version` (from
   `package.json`) and declares the `logging` and `tools` capabilities.
3. Iterates the tool registry, skips any tool excluded by
   `isToolPermittedByUser()` (the enable/deny lists), and calls `tool.register()`.

Both transports call this factory, so the tool surface is identical across
STDIO and HTTP.

## Tool contract

Each tool module exports a uniform shape (`src/tools/<tool>/index.ts`):

- `name` — the MCP tool name (e.g. `brave_web_search`).
- `description` — natural-language guidance shown to the model.
- `annotations` — `ToolAnnotations` (title, `openWorldHint`).
- `inputSchema` — a Zod schema `.shape` for arguments.
- `outputSchema` — present where the tool returns structured content
  (e.g. `images`).
- `execute(params)` — calls `BraveAPI.issueRequest()` and formats the result
  into MCP `content`.
- `register(mcpServer)` — calls `mcpServer.registerTool(...)`.

## Request lifecycle

### STDIO (default)

`index.ts` → `stdioServer.start()` → `new StdioServerTransport()` →
`createMcpServer().connect(transport)`. The process speaks MCP over stdin/stdout.

### HTTP

`index.ts` → `httpServer.start()` → `createApp()` builds the Express app:

1. `x-powered-by` disabled, `trust proxy` off, `express.json()` body parsing.
2. `dnsRebindingGuard` mounted globally (validates `Host`/`Origin`).
3. `/mcp` is mounted with `app.all` (every method — POST for messages, GET for the
   SSE stream, DELETE to end a session) behind `bearerAuth(config.authToken)` (a
   no-op when no token is configured), then handled by `getTransport()`.
4. `getTransport()` resolves a transport per request:
   - reuse an existing session by `mcp-session-id`;
   - allow a `ListToolsRequest` with no session id (a stateless one-off);
   - otherwise create a stateless transport (`config.stateless`) or a stateful
     one keyed by a generated session id. Stateful transports are evicted from
     the session map on `transport.onclose` so the map cannot grow without bound.
5. `GET/POST /ping` returns `{ "message": "pong" }`.

On startup, if the server is bound to a non-loopback host without a bearer
token, it logs a warning to stderr (the port is then reachable unauthenticated).

## The Brave API client

`BraveAPI.issueRequest<endpoint>(endpoint, params, headers?)` is the only place
the code talks to `api.search.brave.com`:

- maps the logical endpoint to a path via `typeToPathMap`;
- shapes query parameters, including special handling for `result_filter`
  (forced to `summarizer` when `summary: true`), `goggles` (HTTPS URLs only),
  and the repeated `ids` parameter for local POIs/descriptions;
- injects the default headers `Accept: application/json`, `Accept-Encoding: gzip`,
  and `X-Subscription-Token: ${BRAVE_API_KEY}`;
- on a non-OK response, logs the upstream error body to **stderr** and throws an
  `Error` whose message is `Brave Search API request failed: ${status} ${statusText}`
  — the coarse HTTP status only, never the upstream body — see
  [security.md](security.md#upstream-error-sanitization).

## Reserved code

These exist in the tree but are not on any live path. They are documented here so
readers do not assume they are wired up:

- `src/utils.ts` `checkRateLimit()` and `src/constants.ts` `RATE_LIMIT` — the
  call site in `src/BraveAPI/index.ts` is commented out (`// checkRateLimit();`).
  No rate limiting is enforced today; see [security.md](security.md#known-gaps).
- `src/helpers.ts` `registerSigIntHandler()` — not invoked by either transport.
  The STDIO and HTTP servers do not install a custom `SIGINT` handler.
