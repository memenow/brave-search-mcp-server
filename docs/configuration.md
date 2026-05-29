# Configuration

`src/config.ts` is the single source of truth for configuration. It reads
options in this order of precedence:

1. **CLI flags** (e.g. `--port 9000`).
2. **Environment variables** — each flag falls back to its env var as the
   Commander default.
3. **Built-in defaults** baked into the `state` object.

`dotenv` loads a local `.env` file at startup, so any of the variables below can
be set there as well. There is no `.env.example` in the repository.

## Environment variables and CLI flags

| Environment variable | CLI flag | Default | Applies to | Notes |
| --- | --- | --- | --- | --- |
| `BRAVE_API_KEY` | `--brave-api-key` | _(empty — required)_ | all | Brave Search API key. Startup fails if missing. |
| `BRAVE_MCP_TRANSPORT` | `--transport` | `stdio` | all | `stdio` or `http`. |
| `BRAVE_MCP_PORT` | `--port` | `8080` | HTTP | Must be `1`–`65535`. |
| `BRAVE_MCP_HOST` | `--host` | `0.0.0.0` | HTTP | Bind address. |
| `BRAVE_MCP_LOG_LEVEL` | `--logging-level` | `info` | all | One of `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`. |
| `BRAVE_MCP_ENABLED_TOOLS` | `--enabled-tools` | _(none)_ | all | Tool allowlist. **Whitespace-separated** (`split(' ')`). Mutually exclusive with the deny list. |
| `BRAVE_MCP_DISABLED_TOOLS` | `--disabled-tools` | _(none)_ | all | Tool denylist. **Whitespace-separated** (`split(' ')`). Mutually exclusive with the allow list. |
| `BRAVE_MCP_STATELESS` | `--stateless` | `false` | HTTP | Stateless transport mode. The env var only enables it when set to exactly `true`. |
| `BRAVE_MCP_AUTH_TOKEN` | `--auth-token` | _(empty — disabled)_ | HTTP | Bearer token required on `/mcp`. When empty, auth is off (a no-op middleware). |
| `BRAVE_MCP_ALLOWED_HOSTS` | `--allowed-hosts` | _(none)_ | HTTP | Extra `Host` header values for the DNS-rebinding guard. **Comma-separated** (`parseCsv`). |
| `BRAVE_MCP_ALLOWED_ORIGINS` | `--allowed-origins` | _(none)_ | HTTP | `Origin` header allowlist for the DNS-rebinding guard. **Comma-separated** (`parseCsv`). |

### Delimiter inconsistency (intentional, documented)

The tool lists and the host/origin lists use **different delimiters**:

- `BRAVE_MCP_ENABLED_TOOLS` / `BRAVE_MCP_DISABLED_TOOLS` are split on **spaces**
  (`process.env.…?.trim().split(' ')`).
- `BRAVE_MCP_ALLOWED_HOSTS` / `BRAVE_MCP_ALLOWED_ORIGINS` are split on **commas**
  (`parseCsv`, which trims and drops empties).

Do not assume commas work for the tool lists, or spaces for the host/origin
lists. This asymmetry is inherited behavior, not a bug to "fix" — see the note in
`CLAUDE.md`.

## Validation rules

`getOptions()` rejects the configuration (exits non-zero) when:

- both `--enabled-tools` and `--disabled-tools` are non-empty;
- a tool name is not one of the six registered tools;
- `--transport` is not `stdio` or `http`;
- `--logging-level` is not a valid MCP logging level;
- `--brave-api-key` is empty;
- (HTTP only) `--port` is outside `1`–`65535`, or `--host` is empty.

## Smithery config schema

`configSchema` in `src/config.ts` is the Zod schema Smithery uses. It is a
**subset** of the full configuration: `braveApiKey`, `enabledTools`,
`disabledTools`, `loggingLevel`, and `stateless`. Smithery passes a parsed config
object into `createMcpServer({ config })`, which calls `setOptions()` to merge it
into `state`. The HTTP-only knobs (`port`, `host`, auth token, allowed
hosts/origins) are not part of the Smithery schema.

## Cloudflare Worker configuration

The Worker path is configured differently from the Node CLI:

- **Secrets** are set with `wrangler secret put` and are never bundled:
  - `BRAVE_API_KEY` — forwarded to the container via
    `startAndWaitForPorts({ startOptions: { envVars } })`.
  - `MCP_AUTH_TOKEN` — the public Bearer token verified at the edge on
    `/brave/mcp`. This is **distinct** from `BRAVE_MCP_AUTH_TOKEN`; the container
    itself runs without a Node-side bearer token because the Worker terminates
    auth at the edge.
- **Container env** (`BRAVE_MCP_TRANSPORT`, `BRAVE_MCP_PORT`, `BRAVE_MCP_HOST`) is
  baked into `Dockerfile.cloudflare`.
- **Routing, instances, and Durable Object migrations** live in `wrangler.jsonc`.

See [deployment.md](deployment.md) for the full deploy procedure and
[security.md](security.md) for what each token protects.
