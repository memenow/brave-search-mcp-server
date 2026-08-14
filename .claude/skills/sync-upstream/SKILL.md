---
name: sync-upstream
description: Review and integrate changes from the configured upstream main branch without restoring removed product-specific deployment assets. Use when the user asks to sync, merge, or inspect upstream Brave Search MCP server changes.
---

# sync-upstream

Bring current upstream changes into a non-main task branch while preserving the
generic Node, STDIO, HTTP, Docker, Smithery, package, and registry surfaces.

This Skill does not authorize a push, pull request, default-branch mutation,
release, package publication, image publication, or deployment.

## Preflight

1. Resolve and report `git remote get-url upstream` and
   `git remote get-url origin`.
2. Run `git status --short --branch`.
3. Resolve the current branch and both current `HEAD` and `upstream/main` OIDs.
4. Stop before integration if the worktree contains changes outside the user's
   stated scope.
5. Run `git fetch upstream --tags`.
6. Re-resolve `upstream/main`; if its OID changed during the survey, regenerate
   the comparison.

Do not integrate while checked out on `main`. Use a task branch created from the
intended canonical base.

## Survey

Collect and summarize:

```sh
git log --oneline HEAD..upstream/main
git log --oneline upstream/main..HEAD
git diff --stat HEAD...upstream/main
git diff --name-status HEAD...upstream/main
```

Identify changes to:

- `package.json` and `package-lock.json`
- TypeScript configuration
- `src/index.ts`, `src/config.ts`, `src/server.ts`, and `src/protocols/`
- tool schemas and response contracts
- the generic `Dockerfile`
- Smithery, package, registry, and marketplace metadata
- repository instructions, documentation, and GitHub workflows

Explicitly flag any incoming change that would recreate a Cloudflare Worker,
Container, Durable Object, route, custom domain, Service Binding, Wrangler
configuration, Cloudflare-specific Dockerfile, or Cloudflare deploy workflow.
Those assets were intentionally removed and must remain absent unless the user
makes a new explicit product decision.

## Integration Decision

Use an ordinary merge into the task branch; do not rebase or rewrite published
history. Before creating a merge commit, present:

- the exact upstream and current branch OIDs;
- incoming and task-branch-only commits;
- expected conflicts;
- package or public-contract changes;
- the exact merge command and resulting external-workflow implications.

Wait for explicit authorization for the merge commit. Do not apply blanket
"ours" or "theirs" rules. Resolve each conflict from current source,
documentation, tests, and the user's selected product scope.

The expected command after authorization is:

```sh
git merge --no-ff upstream/main -m "chore(deps): sync with upstream brave/brave-search-mcp-server"
```

## Validation

After integration:

```sh
npm ci
npm run format:check
npm run lint
npm run build
npm pack --dry-run
docker build -t brave-search-mcp-server:upstream-sync .
```

Run focused STDIO and HTTP smoke tests when their paths changed. Verify that the
removed product-specific Cloudflare deployment files and references remain
absent.

## Handoff

Report the merged upstream commits, conflicts and resolutions, dependency or
lockfile changes, validation results, and unrun checks. Publication must use a
separately authorized pull-request workflow; never push directly to `main`.
