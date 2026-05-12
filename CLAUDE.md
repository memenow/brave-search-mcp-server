# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Fork of `brave/brave-search-mcp-server`. A Model Context Protocol server exposing Brave Search (web, local, image, video, news, summarizer) over **two transports from the same codebase**:

- **STDIO** — default; entry `src/index.ts` → `dist/index.js` (also the npm `bin`).
- **HTTP** — entry `src/server.ts`; enabled by `BRAVE_MCP_TRANSPORT=http` or `--transport http`.
- **Cloudflare Workers + Containers** — entry `src/worker.ts`; built with `tsconfig.worker.json` (the root `tsconfig.json` **excludes** `src/worker.ts`).

Do not assume Node-only APIs in `src/worker.ts`; it runs on the Workers runtime with `nodejs_compat`.

## Commands

Package manager: **npm** (only `package-lock.json` is committed).

| Task | Command |
|---|---|
| Build (Node target) | `npm run build` — `tsc` + chmod the produced `dist/*.js` |
| Watch | `npm run watch` |
| Format | `npm run format` (Prettier; `format:check` for CI) |
| Lint | `npm run lint` (ESLint 10 + typescript-eslint flat config) |
| Lint + auto-fix | `npm run lint:fix` |
| MCP Inspector (STDIO) | `npm run inspector` |
| MCP Inspector (HTTP) | `npm run inspector:http` |
| Workers dev | `npm run cf:dev` (wrangler dev) |
| Workers deploy | `npm run cf:deploy` |
| Workers logs | `npm run cf:tail` |
| Smithery build | `npm run smithery:build` |
| Smithery dev | `npm run smithery:dev` |

`npm run prepare` runs `format` + `build` automatically on `npm install`.

**No test framework is configured.** Verify behavior manually with `npm run inspector` (STDIO) or `npm run inspector:http` (HTTP) before merging non-trivial changes.

## Required environment

- `BRAVE_API_KEY` — required for every transport.
- `BRAVE_MCP_TRANSPORT` — `stdio` (default) or `http`.
- `BRAVE_MCP_PORT` (default `8000`), `BRAVE_MCP_HOST` (default `0.0.0.0`), `BRAVE_MCP_LOG_LEVEL` (default `info`).
- `BRAVE_MCP_ENABLED_TOOLS` / `BRAVE_MCP_DISABLED_TOOLS` — comma-separated tool allow/deny list.
- `BRAVE_MCP_STATELESS` — HTTP stateless mode; default `true` (required for AWS Bedrock AgentCore).
- `MCP_AUTH_TOKEN` — **Workers deployment only**; Bearer token required on the public `/brave/mcp` route. Set via `wrangler secret put MCP_AUTH_TOKEN`. Not consumed by the Node-side server.
- `INTERNAL_SECRET` — **Workers deployment only**; secret the Worker injects as `x-internal-secret` on every request forwarded into the Container, and the container-side Express app verifies on `/mcp` via constant-time compare. Defense in depth against a misconfigured route exposing `/internal/*` directly. Set via `wrangler secret put INTERNAL_SECRET`. The Node-side server treats it as opt-in: unset = no check (preserves stdio / Docker / npm flows).

No `.env.example` exists; see `README.md` for the canonical list.

## Code style

Prettier 3.x (`.prettierrc`): single quotes, 2-space indent, semicolons, trailing comma `es5`, `printWidth: 100`, `arrowParens: always`. The `format` script targets `src/**/*.ts` only.

ESLint 10.x flat config (`eslint.config.js`) — `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier` (formatting rules disabled, Prettier owns them). CI workflows (`build.yml`, `pr-checks.yml`) gate on `npm run lint`; warnings inherited from upstream are tolerated, but errors block. Do not bulk auto-fix existing warnings without a dedicated commit — it generates noise against future upstream syncs.

TypeScript: `strict: true`, `ES2022`, `NodeNext` module + resolution. Project is ESM (`"type": "module"`); use ESM imports with explicit extensions (`./foo.js`) in source.

## Repo etiquette

- **Direct push to `main`** is the working style for this fork.
- **Conventional Commits** for all messages (`feat:`, `fix:`, `chore(deps):`, `ci:`, `docs:`). Match the existing log when in doubt.
- When syncing from upstream `brave/brave-search-mcp-server`, use commit subject `chore(deps): sync with upstream brave/brave-search-mcp-server`.
- CI workflows in `.github/workflows/` cover build, deploy, security review, and PR checks; do not bypass them with `--no-verify`.
- A Claude Code review workflow (`.github/workflows/claude.yml`) is wired to `@claude` mentions on PRs and issues.

## Gotchas

- `dist/` is generated; never hand-edit. The release workflow publishes from `dist/`.
- `src/worker.ts` uses a **separate** `tsconfig.worker.json`. Node-side `npm run build` will not catch worker-only type errors — run `npm run cf:dev` (or `wrangler deploy --dry-run`) when touching it.
- Cloudflare Containers are wired as **Durable Objects with SQLite** (`migrations[].tag: "v1"`, `new_sqlite_classes: ["BraveSearchContainer"]`). Renaming or removing the class requires a new migration tag — never edit the existing one.
- `Dockerfile` (generic) and `Dockerfile.cloudflare` (Workers Container image) are distinct; the Cloudflare deploy uses the latter via `wrangler.jsonc`.
- `BRAVE_API_KEY` must be set on the Cloudflare side (`wrangler secret put BRAVE_API_KEY`) before `cf:deploy`; it is not bundled.
- `src/worker.ts` exposes two distinct path namespaces: `/brave/*` (public, served by the `routes` entry in `wrangler.jsonc`, Bearer-auth on `/brave/mcp`) and `/internal/mcp` (service-binding-only, no public route). Both are protected on the container side by `INTERNAL_SECRET` (see Required environment). The `/internal/*` path is **load-bearing** for other Workers in the account that bind this service — do not rename or move it without updating consumer Workers.
- `src/worker.ts` uses `getRandom(env.BRAVE_SEARCH_CONTAINER, CONTAINER_FANOUT)` to fan out across the provisioned containers. `CONTAINER_FANOUT` **must match** `wrangler.jsonc containers[].max_instances` — keep them in lockstep when you change either.
- Smithery has its own build pipeline (`smithery:build`) and reads `smithery.yaml` + `server.json` — keep those in sync with `package.json` `version` on releases.
- Response schema for `brave_image_search` changed in v2 (no base64 payload); see `README.md` migration notes when touching image-tool callers.

## Skills available in `.claude/skills/`

- `sync-upstream` — fetch upstream `memenow/brave-search-mcp-server`, summarize delta, build, draft a sync PR.
- `cf-deploy` — pre-deploy checklist, `wrangler dev` smoke test, then `cf:deploy`.
