# Brave Search MCP Server — Documentation

Maintainer-facing documentation for this fork of
[`brave/brave-search-mcp-server`](https://github.com/brave/brave-search-mcp-server).
It complements, and does not duplicate, the two root guides:

- [`../README.md`](../README.md) — user-facing install instructions, tool reference, and quick start.
- [`../CLAUDE.md`](../CLAUDE.md) — repository conventions, commands, and gotchas for contributors.

## Contents

| Document | Scope |
| --- | --- |
| [architecture.md](architecture.md) | Module map, the three transports, request lifecycle, and the tool contract. |
| [configuration.md](configuration.md) | Authoritative environment variable and CLI flag reference. |
| [deployment.md](deployment.md) | Running the server over STDIO, HTTP, Docker, and Cloudflare Workers + Containers. |
| [security.md](security.md) | Authentication model, DNS-rebinding protection, error sanitization, and known gaps. |

## Source of truth

When this documentation and the code disagree, the code wins. The canonical
references are:

- `src/config.ts` — configuration schema, defaults, and CLI parsing.
- `src/protocols/` — STDIO and HTTP transports plus the shared auth helpers.
- `src/worker.ts` / `src/worker-auth.ts` — the Cloudflare Workers entry point.

Re-derive values from those files rather than trusting prose. This fork tracks
upstream closely, so the user-facing `README.md` intentionally stays near the
upstream copy; deployment- and security-specific detail lives here instead.
