# VKB Farm Manager — Agent Instructions

## Context persistence

Conversation history is not the authoritative project state. Before implementation work, read:

1. `.codex/PROJECT_STATE.md`
2. `.codex/CURRENT_TASK.md`
3. `.codex/CONTEXT_INDEX.md`
4. `git status --short`, `git diff --stat`, `git diff`, and `git log -5 --oneline`

Then load only the documents and source files relevant to the task. Do not scan the repository wholesale unless the task requires it.

## Context priority

Resolve context in this order: current user request; `.codex/CURRENT_TASK.md`; Git working tree and diff; `.codex/PROJECT_STATE.md`; architecture and decision docs; relevant implementation; older history. If documentation conflicts with code or Git, investigate and correct the stale documentation.

## Engineering rules

- Keep the single React/Vite frontend and Hono Cloudflare Worker architecture; do not add a long-running server or microservices.
- TypeScript is strict. Validate every write on the server, use parameterized D1 SQL, and do not expose raw SQL errors or stack traces.
- Authoritative monetary values are integer paise; client amounts are decimal strings. Farm dates are ISO local dates; timestamps are UTC.
- Production identity is Cloudflare Access mapped to an active D1 person and must fail closed. Development identity is local-only.
- Preserve the Excel-import rules and verified baseline in the approved design. Do not invent source values or normalization mappings.
- Follow existing mobile-first, accessible UI patterns and route state conventions.

## Checkpoints and completion

Before ending meaningful implementation work:

1. Update `.codex/CURRENT_TASK.md`.
2. Update `.codex/PROJECT_STATE.md` when project-level state changed.
3. Record durable architectural decisions in `docs/DECISIONS.md`.
4. Add significant completed work to `.codex/COMPLETED_TASKS.md`.
5. Update `.codex/CONTEXT_INDEX.md` when routing information changed.
6. Run task-appropriate tests and record failures or blockers.

Keep context compact: record conclusions, decisions, state, and next actions—not chats, source copies, large diffs, logs, or stack traces.
