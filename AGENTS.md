# Agent instructions

This repository is a reusable Feishu workbench template. Before changing it, read this file and `docs/AGENT_GUIDE.md` completely.

## Required workflow

1. Inspect `git status --short` and preserve unrelated user changes.
2. Identify the data owner: browser-local state, Feishu user OAuth, Feishu Bitable, or another authenticated server store.
3. Extend the existing route, component, model, theme and dialog systems; do not create parallel implementations.
4. Add focused tests, then run `pnpm lint`, `pnpm test:all`, and `pnpm build`.
5. Do not deploy, change a real Feishu schema, or mutate real records without explicit authorization.
6. For an authorized Cloudflare update, deploy with `--keep-vars` and verify the exact target domain.

## Security

- Never commit or print App Secrets, access/refresh tokens, OAuth codes, cookies, Cloudflare tokens, `.dev.vars`, local account paths, or real Base identifiers.
- Do not add owner-specific fallback IDs to source. Every tenant, user and Bitable identifier must come from environment configuration.
- Keep OAuth state validation and secure HttpOnly cookies.
- Tenant fallback is limited access and must never be presented as complete personal synchronization.
- Do not test writes against real tasks, events, Wiki spaces or Bitable records without a named test item and action-time approval.

## Architecture and UI invariants

- API and OAuth: `app/api/[...path]/route.js`.
- Workbench and shared controls: `dashboard/main.jsx`, `dashboard/styles.css`.
- Course board: `dashboard/course-plan.jsx`, `dashboard/course-plan.css`.
- Models and persistence belong in focused files under `dashboard/`.
- Business IDs and motion keys must remain stable through edits, sorting, filtering and refreshes.
- Reuse theme tokens and shared controls. Motion durations are 140/220/320 ms and should affect only the smallest changed region.
- Preserve keyboard access, narrow layouts, focus restoration and `prefers-reduced-motion`.

## Completion standard

A change is complete only when behavior, errors, tests, build, docs and security boundaries agree. Report what was verified and what still requires the owner’s authorization or authenticated browser session.
