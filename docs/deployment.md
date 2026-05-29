# Deployment

The same build runs in four shapes: STDIO (local/embedded), HTTP (standalone or
Docker), and Cloudflare Workers + Containers. Pick the section that matches your
target. For the full variable reference see [configuration.md](configuration.md);
for the auth model see [security.md](security.md).

## Prerequisites

- Node.js 22.x or newer and npm.
- A Brave Search API key (`BRAVE_API_KEY`).

```bash
npm install
npm run build   # tsc -> dist/, then chmod +x dist/*.js
```

## STDIO (default)

STDIO is the conventional transport for MCP clients that launch the server as a
subprocess (Claude Desktop, VS Code, the MCP Inspector).

```bash
BRAVE_API_KEY=… node dist/index.js
# or via npx, no clone required:
BRAVE_API_KEY=… npx -y @brave/brave-search-mcp-server
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@brave/brave-search-mcp-server"],
      "env": { "BRAVE_API_KEY": "YOUR_API_KEY_HERE" }
    }
  }
}
```

## HTTP (standalone)

Select HTTP with `--transport http` or `BRAVE_MCP_TRANSPORT=http`. The server
listens on `BRAVE_MCP_HOST:BRAVE_MCP_PORT` (default `0.0.0.0:8080`) and serves
`/mcp` and `/ping`.

```bash
BRAVE_API_KEY=… \
BRAVE_MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
node dist/index.js --transport http --port 8080
```

> **Security:** binding to a non-loopback host without `BRAVE_MCP_AUTH_TOKEN`
> leaves the port open to anyone who can reach it (and your Brave quota with it).
> The server prints a stderr warning in that case. Set a token, bind to
> `127.0.0.1`, or front it with an authenticating proxy. See
> [security.md](security.md).

### Docker

The generic `Dockerfile` builds an image whose entrypoint is `node dist/index.js`
(STDIO by default; pass `--transport http` to switch).

```bash
docker build -t mcp/brave-search:latest .
docker run -i --rm -e BRAVE_API_KEY mcp/brave-search:latest
```

### Docker Compose

`docker-compose.yml` runs the HTTP transport on port 8080 with hardened defaults
(`cap_drop: all`, `no-new-privileges`, `init: true`). Provide `BRAVE_API_KEY`
(and any optional `BRAVE_MCP_*` variables) in the environment:

```bash
BRAVE_API_KEY=… docker-compose up --build
```

### Amazon Bedrock AgentCore

AgentCore expects a stateless HTTP transport. `BRAVE_MCP_STATELESS` defaults to
`false`, and the env var only takes effect when set to exactly `true`, so set it
explicitly:

```bash
BRAVE_MCP_STATELESS=true BRAVE_MCP_TRANSPORT=http node dist/index.js
```

## Cloudflare Workers + Containers

The Worker (`src/worker.ts`) terminates Bearer auth at the edge and forwards to a
container (a Durable Object running this codebase in HTTP mode). Configuration
lives in `wrangler.jsonc`; the container image is `Dockerfile.cloudflare`.

### One-time setup

Set the two secrets before the first deploy (neither is bundled):

```bash
wrangler secret put BRAVE_API_KEY
wrangler secret put MCP_AUTH_TOKEN   # public Bearer token; e.g. openssl rand -hex 32
```

### Deploy, develop, observe

```bash
npm run cf:deploy   # wrangler deploy
npm run cf:dev      # wrangler dev — local Worker + container on http://localhost:8787
npm run cf:tail     # wrangler tail — stream production logs
```

For local development, provide the secrets via `.dev.vars`:

```bash
cat > .dev.vars <<'EOF'
BRAVE_API_KEY = "<your-brave-key>"
MCP_AUTH_TOKEN = "dev-token-123"
EOF
npm run cf:dev
```

### Public routes

| Caller | URL | Auth |
| --- | --- | --- |
| Public client | `https://mcp.memenow.xyz/brave/mcp` | `Authorization: Bearer ${MCP_AUTH_TOKEN}` |
| Health probe | `https://mcp.memenow.xyz/brave/ping` | none |
| Internal Worker (same account) | `env.BRAVE_MCP.fetch("https://internal/internal/mcp", …)` | none — service binding bypasses the public edge |
| Anything else | — | `404` |

`workers_dev: false` disables the default `*.workers.dev` subdomain, so
`/internal/*` cannot leak through it. The `/internal/*` path is depended on by
other Workers in the account — do not rename it without updating those consumers.

Public client example:

```bash
curl -X POST https://mcp.memenow.xyz/brave/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Durable Object migration constraint

The container is bound as a SQLite-backed Durable Object:

```jsonc
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["BraveSearchContainer"] }]
```

Renaming or removing `BraveSearchContainer` requires a **new** migration tag.
Never edit the existing `v1` entry — doing so corrupts the migration history.
