---
name: sync-upstream
description: Sync this fork with the configured `upstream` remote (memenow/brave-search-mcp-server, which itself tracks brave/brave-search-mcp-server). Use when the user says "sync upstream", "pull from upstream", "rebase on upstream", or asks to bring in the latest Brave Search MCP server changes.
---

# sync-upstream

Goal: cleanly bring the latest upstream changes into local `main`, preserve fork-specific work (CLAUDE files, Cloudflare deploy assets, `.github/workflows/` additions), build, then push.

## Pre-flight (always run first)

1. `git -C "$REPO" remote -v` — confirm `upstream` points at `https://github.com/memenow/brave-search-mcp-server.git`. If missing, stop and ask the user.
2. `git status --porcelain` — must be empty. If not, stop and ask the user how to handle the dirty tree.
3. `git rev-parse --abbrev-ref HEAD` — confirm we are on `main`. If not, ask before switching.

## Survey the delta

4. `git fetch upstream --tags`
5. `git log --oneline main..upstream/main` — list incoming commits.
6. `git log --oneline upstream/main..main` — list fork-only commits (Bill's customizations).
7. `git diff --stat main upstream/main -- ':!CLAUDE.md' ':!CLAUDE.local.md' ':!.claude/' ':!.github/workflows/' ':!wrangler.jsonc' ':!Dockerfile.cloudflare'` — file-level change scope outside fork-only areas.

Summarize for the user before merging:
- Count and category of incoming commits (feat/fix/chore/deps).
- Any incoming touches to files the fork has customized (especially `package.json`, `tsconfig*.json`, `src/index.ts`, `src/server.ts`, `README.md`).
- Whether `package-lock.json` will need a regeneration.

## Propose the merge strategy

Default: **merge, not rebase.** Main reasons:
- Fork pushes directly to `main`; a rebase would rewrite history Bill has already pushed.
- Existing commit `a4b195c chore(deps): sync with upstream brave/brave-search-mcp-server` shows merge-style sync is the established pattern.

Surface the tradeoff: rebase would produce a linear history but force-pushes `main`; merge keeps history honest at the cost of an extra merge commit. Wait for confirmation if the incoming delta is non-trivial (>5 commits or any conflict-prone files).

## Execute

8. `git merge upstream/main --no-ff -m "chore(deps): sync with upstream brave/brave-search-mcp-server"` — preserves the commit subject convention used in this repo.
9. Resolve conflicts; prefer **upstream** for code in `src/**` (except `src/worker.ts`), **local** for `CLAUDE*.md`, `.claude/**`, `.github/workflows/**`, `wrangler.jsonc`, `Dockerfile.cloudflare`, `tsconfig.worker.json`. Ask before resolving anything in `package.json` or `tsconfig.json`.
10. `npm install` — regenerate lockfile if `package.json` changed.
11. `npm run format && npm run build` — must succeed before the sync is considered done.
12. If `src/worker.ts` was touched (directly or via shared imports), also confirm `npx wrangler deploy --dry-run` builds; the root `tsc` does **not** typecheck the worker.

## Hand-off

Report to the user:
- Incoming commits merged (count + bullet list).
- Conflicts encountered and resolution choices.
- Build status (Node + Worker).
- Whether `package-lock.json` changed.

Then ask whether to `git push origin main` (default for this fork's workflow) or open a PR.

## Things to NOT do

- Do not run `git rebase upstream/main` without explicit confirmation — it rewrites pushed history.
- Do not silently drop fork-specific files during conflict resolution.
- Do not run `npm install --force` or `--legacy-peer-deps` to mask peer-dep errors — surface them.
- Do not bypass commit hooks with `--no-verify`.
