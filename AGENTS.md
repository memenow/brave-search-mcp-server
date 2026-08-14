# Repository Agent Instructions

This file is the canonical repository guidance for coding agents. `CLAUDE.md`
and `GEMINI.md` are relative symlinks to this file; do not maintain separate
instruction bodies.

## Project

This repository is a fork of `brave/brave-search-mcp-server`. It exposes the
Brave Search API as Model Context Protocol tools from one TypeScript ESM
codebase over two Node.js transports:

- STDIO is the default transport and npm executable.
- HTTP uses Express and `StreamableHTTPServerTransport`.

The repository also retains the generic Docker, Smithery, npm package, and MCP
Registry surfaces inherited from upstream. It does not contain a
product-specific Cloudflare Worker, Container, Durable Object, route, custom
domain, Service Binding, or Wrangler deployment layer. Do not recreate those
removed deployment assets without a new explicit product decision.

Maintainer documentation lives under `docs/`. `README.md` owns user-facing
installation and tool documentation; `docs/` owns current architecture,
configuration, deployment, and security details.

## Runtime and Commands

- Use npm; `package-lock.json` is the only package-manager lockfile.
- CI uses Node.js 24.x. The documented runtime floor is Node.js 22.
- The project is ESM with TypeScript `NodeNext` resolution and explicit `.js`
  extensions in source imports.
- `dist/` is generated and must not be hand-edited.

| Task | Command |
| --- | --- |
| Install exactly from the lockfile | `npm ci` |
| Check formatting | `npm run format:check` |
| Apply formatting | `npm run format` |
| Lint | `npm run lint` |
| Build the Node target | `npm run build` |
| Watch TypeScript | `npm run watch` |
| Inspect STDIO | `npm run inspector` |
| Inspect HTTP | `npm run inspector:http` |
| Build Smithery | `npm run smithery:build` |
| Run Smithery locally | `npm run smithery:dev` |
| Inspect package contents | `npm pack --dry-run` |
| Build the generic container | `docker build -t brave-search-mcp-server:local .` |

There is no repository test script. For behavior changes, combine the static
gates with a focused STDIO or HTTP smoke test. Changes affecting the generic
container must also pass a Docker build and runtime smoke test.

## Architecture

- `src/index.ts` is the CLI and npm `bin` entry point.
- `src/config.ts` owns CLI parsing, environment defaults, the Smithery schema,
  and runtime state.
- `src/server.ts` owns `createMcpServer()` and the registered tool surface.
- `src/protocols/stdio.ts` owns STDIO.
- `src/protocols/http.ts` owns the Express `/mcp` and `/ping` endpoints,
  session lifecycle, and transport creation.
- `src/protocols/auth.ts` owns the optional HTTP bearer check and the global
  DNS-rebinding guard.
- `src/BraveAPI/index.ts` is the single outbound Brave Search API client.
- `src/tools/` owns one cohesive implementation per search tool.

Both transports must use the same server factory and tool registry. Do not
create transport-specific tool implementations.

## Configuration and Security

`src/config.ts` is the configuration source of truth. Important boundaries:

- `BRAVE_API_KEY` is required and must never be committed, logged, or placed in
  commands that expose its value.
- `BRAVE_MCP_TRANSPORT` selects `stdio` or `http`.
- `BRAVE_MCP_AUTH_TOKEN` is the optional bearer token for the generic Node HTTP
  `/mcp` endpoint. When HTTP is reachable beyond loopback, configure the token
  or an authenticating proxy.
- `BRAVE_MCP_ALLOWED_HOSTS` and `BRAVE_MCP_ALLOWED_ORIGINS` extend the HTTP
  DNS-rebinding guard and are comma-separated.
- `BRAVE_MCP_ENABLED_TOOLS` and `BRAVE_MCP_DISABLED_TOOLS` are
  whitespace-separated. Preserve this documented delimiter distinction unless
  a coordinated contract change explicitly replaces it.
- Upstream response bodies may contain account or quota detail. Keep downstream
  errors sanitized and operator detail on stderr only.

Do not add secrets to examples, fixtures, logs, documentation, or Git history.

## Style and Repository Boundaries

Prettier owns formatting: single quotes, two-space indentation, semicolons,
ES5 trailing commas, 100-column width, and parenthesized arrow parameters.
ESLint uses the flat configuration in `eslint.config.js`. Do not bulk-fix
unrelated inherited warnings.

Keep generic upstream functionality and package metadata intact. Smithery
metadata, `server.json`, `smithery.yaml`, package versioning, and marketplace
metadata are separate release surfaces; update them together only when the
release contract requires it.

## Git and Publication

- Use Conventional Commit and semantic pull-request titles.
- Work on a non-`main` task branch and land changes through a pull request into
  the canonical `main`.
- Do not push directly to any default branch, rewrite published history,
  force-push, publish a package or image, create a release, or deploy without
  explicit authorization for that exact external action.
- Do not add automated-generation attribution or non-human co-author metadata.
- Use `.claude/skills/sync-upstream/SKILL.md` for a bounded upstream review; it
  must not restore the removed product-specific Cloudflare deployment layer.

## Definition of Done

Run, in order:

1. `npm run format:check`
2. `npm run lint`
3. `npm run build`
4. The focused STDIO or HTTP smoke test relevant to the change
5. `npm pack --dry-run` for package-surface changes
6. A generic Docker build and runtime smoke test for container changes

Also verify documentation against live source, inspect the final diff, and
state every check that was not run.
