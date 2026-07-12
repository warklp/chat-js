---
name: worktree-ports
description: Discover and use stable per-app ports assigned to a local monorepo worktree. Use when starting, opening, testing, or debugging local apps, or when worktree slots, localhost ports, PORT, app URLs, or .workgrove.json are involved.
---

# Worktree Ports

- Run `bun dev:info --json` before accessing local apps. Use the returned app
  URLs; never assume a port.
- Start apps through the root `bun dev*` scripts so `.env.worktree.local` and
  `.env.local` are loaded before the wrapper runs.
- Set the slot environment variable declared in `.workgrove.json` in a
  worktree-local environment file.
- Keep app offsets unique and below the configured range stride.
- Declare every variable an app needs under its `exports`, including `PORT`.
- Configure cross-app environment variables with `{apps.<name>.url}` templates.

The command wrapper is bundled in `scripts/`; configuration validation and
runtime resolution come from the pinned `workgrove/config` package contract.
