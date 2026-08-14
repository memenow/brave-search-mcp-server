# Deployment

The Node runtime supports STDIO (local/embedded) and HTTP (standalone or Docker).
Pick the section that matches your target. For the full variable reference see
[configuration.md](configuration.md);
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
(`cap_drop: all`, `no-new-privileges`, `init: true`) and publishes the port on
`127.0.0.1` by default. Provide `BRAVE_API_KEY` and any optional documented
`BRAVE_MCP_*` variables in the environment; the Compose allowlist passes them
through to the container:

```bash
BRAVE_API_KEY=… docker compose up --build
```

To publish on another host interface, set `BRAVE_MCP_PUBLISH_HOST` explicitly.
For example, publishing on every interface requires a bearer token and the
corresponding DNS-rebinding allowlist:

```bash
BRAVE_API_KEY=… \
BRAVE_MCP_PUBLISH_HOST=0.0.0.0 \
BRAVE_MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
BRAVE_MCP_ALLOWED_HOSTS=example.internal:8080 \
docker compose up --build
```

`BRAVE_MCP_PUBLISH_HOST` controls only the host-side Docker port binding. The
container continues to listen on `BRAVE_MCP_HOST=0.0.0.0` so the published port
can reach the server.

### Amazon Bedrock AgentCore

AgentCore expects a stateless HTTP transport. `BRAVE_MCP_STATELESS` defaults to
`false`, and the env var only takes effect when set to exactly `true`, so set it
explicitly:

```bash
BRAVE_MCP_STATELESS=true BRAVE_MCP_TRANSPORT=http node dist/index.js
```
