# Persistent Context Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise, Git-backed project memory system that lets a fresh Codex session resume VKB Farm Manager from the active implementation checkpoint.

**Architecture:** Root agent instructions define selective loading and checkpoint policy. Stable project knowledge lives in `docs/`, while compact mutable recovery state lives in `.codex/`; Git remains the source of truth for concrete changes.

**Tech Stack:** Markdown, Git, existing React/Vite/Hono/Cloudflare Workers/D1/R2 repository.

**Spec:** `/home/satish/.codex/attachments/e00a7641-7a4f-4a94-adf5-68c86c52cf7f/pasted-text.txt`

## Global Constraints

- Do not modify application behavior.
- Do not copy chat transcripts, source files, diffs, stack traces, or long logs into context files.
- Populate every file with verified project facts; label uncertainty `Needs verification`.
- Keep `PROJECT_STATE.md` to roughly 500–1500 words and keep all recovery files compact.
- Record the current Task 6 fix as in progress, including uncommitted work and the single next action.
- Prefer Git and actual code over stale documentation.

---

### Task 1: Bootstrap durable repository context

**Files:**
- Create: `AGENTS.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/DECISIONS.md`
- Create: `docs/DEVELOPMENT.md`
- Create: `.codex/PROJECT_STATE.md`
- Create: `.codex/CURRENT_TASK.md`
- Create: `.codex/CONTEXT_INDEX.md`
- Create: `.codex/COMPLETED_TASKS.md`
- Modify: `IMPLEMENTATION_STATUS.md` only if needed to correct stale project state

**Interfaces:**
- Consumes: current Git status/log, approved design and implementation plan, migrations, package/configuration files, SDD ledger, and active Task 6 diff.
- Produces: mandatory resume sequence, stable architecture/decision references, a routing index, compressed milestones, and an exact active-task checkpoint.

- [x] **Step 1: Inspect high-information project state**

Run `git status --short`, `git diff --stat`, `git log -10 --oneline`, inspect root structure, package/config files, migrations, architecture plans, implementation status, SDD ledger, and the active Task 6 diff. Do not recursively read the entire repository.

- [x] **Step 2: Write repository instructions and stable documentation**

Create `AGENTS.md` with the exact selective resume/checkpoint policy from the spec. Create architecture, decision, and development documents from verified facts, using a small Mermaid system diagram in architecture and lightweight ADR entries only for load-bearing choices.

- [x] **Step 3: Write compact recovery files**

Create project state, current task, context index, and completed-task history. `CURRENT_TASK.md` must identify the Task 6 review-fix work as `IN_PROGRESS`, list the active modified/untracked files, capture the prior reviewer findings and failed subagent quota event, and name one next action: finish and verify the existing uncommitted fix before re-review.

- [x] **Step 4: Simulate a fresh-session resume**

Read only `AGENTS.md`, the four `.codex/` files, `git status --short`, `git diff --stat`, and `git log -5 --oneline`. Verify that these reveal the product, stack, constraints, active task, relevant files, blocker/status, and exact next action without scanning the repository. Tighten any missing or redundant content.

- [x] **Step 5: Validate and commit**

Run `git diff --check` and targeted Markdown/path consistency checks. Confirm no application source file was modified by this task. Commit only the context-system files and this plan with message `docs: add persistent Codex context system`.

---
