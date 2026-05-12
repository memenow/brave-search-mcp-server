---
name: cf-deploy
description: Deploy the MCP server to Cloudflare Workers + Containers, with a pre-flight checklist and a wrangler dev smoke test. Use when the user says "deploy to cloudflare", "cf deploy", "ship to workers", or asks to push the worker / container to production.
---

# cf-deploy

Goal: deploy `src/worker.ts` (+ `Dockerfile.cloudflare`-built Container) to Cloudflare without surprises. The worker is wired as a Durable Object class (`BraveSearchContainer`) with SQLite state — destructive renames break in-flight state.

## Pre-flight (every deploy)

1. `git status --porcelain` — must be clean; ask the user before deploying a dirty tree.
2. `git rev-parse --abbrev-ref HEAD` — confirm `main` (or ask).
3. `npx wrangler whoami` — confirm the right Cloudflare account is active. If not, stop and instruct the user to run `npx wrangler login` themselves (interactive, not for Claude to drive).
4. `npx wrangler secret list` — confirm `BRAVE_API_KEY` is set on the deployment. If absent, stop and tell the user to run `npx wrangler secret put BRAVE_API_KEY` (interactive prompt; never paste the key into a tool call).
5. `cat wrangler.jsonc` — verify the live config still matches expectations:
   - `migrations[].tag` is `v1` with `new_sqlite_classes: ["BraveSearchContainer"]` — **never** mutate an existing migration tag; add a new one if classes change.
   - `containers[].image` is `./Dockerfile.cloudflare` (not the generic `Dockerfile`).
   - `compatibility_flags` includes `nodejs_compat`.

## Dry-run build

6. `npx wrangler deploy --dry-run --outdir=.wrangler/tmp-dryrun` — fails fast on worker-only type errors that `npm run build` will not catch.
7. If the dry-run touches new bindings/secrets, surface them before deploying.

## Smoke test in dev

8. Start `npx wrangler dev --port 8787` in a background shell (`run_in_background: true`).
9. Poll `curl -sf http://127.0.0.1:8787/health` (or whichever health route `src/worker.ts` exposes — confirm in source first) with a small `for i in 1..10; do ... sleep 1; done` loop. Tear down the dev server when done.
10. If a manual MCP Inspector pass is requested, hand the URL to the user with `npx @modelcontextprotocol/inspector --transport http http://127.0.0.1:8787/mcp` — do not try to drive the Inspector UI from a tool.

## Propose then deploy

Before calling deploy, summarize:
- Source diff vs. last deployed commit (`git log --oneline <last-deployed-tag>..HEAD` if a deployment tag exists, otherwise the latest few commits).
- Whether Container image rebuilds (any change under `Dockerfile.cloudflare` or its build context).
- Bindings/secrets that will be (re)used.

Wait for user confirmation, then:

11. `npm run cf:deploy` (`wrangler deploy`).
12. `npm run cf:tail` for ~30 s to confirm the new version is serving without immediate errors. Stream output, do not block indefinitely.

## Hand-off

Report:
- Deployed version URL (from wrangler output).
- Container instance count (default `max_instances: 2`).
- Any warnings from `wrangler tail`.
- Whether a Git tag should be cut (offer; do not push tags without confirmation).

## Things to NOT do

- Do not edit `migrations[].tag: "v1"` in place — Durable Object SQLite migrations are append-only.
- Do not `wrangler deploy --force` to overwrite a deploy that the user did not authorize.
- Do not paste `BRAVE_API_KEY` into any command; `wrangler secret put` reads from stdin in an interactive prompt the user runs themselves.
- Do not skip the dry-run on changes touching `src/worker.ts` or `wrangler.jsonc` — the root `tsc` build does not catch worker-only errors.
- Do not deploy from a branch other than `main` without explicit confirmation.
