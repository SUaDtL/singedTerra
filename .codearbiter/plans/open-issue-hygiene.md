# Open Issue Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this documentation-only plan. No production implementation or TDD cycle is permitted because this is a `ca-chore docs` slice.

**Goal:** Replace the stale open-issue inventory with an evidence-backed current roadmap without changing runtime behavior.

**Architecture:** Capture the complete 16-issue snapshot in one append-only governance report. Land that report through an exact-head reviewed PR, then apply only the enumerated GitHub closures, title changes, and status comments from the merged record.

**Tech Stack:** Git, GitHub CLI, Markdown, existing codeArbiter audit files; no dependency.

## Global constraints

- No product, test, package, workflow, migration, Supabase, or user-facing documentation change.
- Do not mutate security issue #69, security-policy issue #110, or migration issue #125.
- Do not close partially completed work.
- Every GitHub mutation must match the merged disposition report.
- One adversarial review and exact-head hosted CI are required before merge.

---

### Task 1: Establish the current evidence baseline

**Files:**

- Create: `.codearbiter/reports/2026-08-01-open-issue-hygiene.md`
- Modify: `.codearbiter/sprint-log.md` by append only

- [x] Query all open issues with bodies and comments.
- [x] Verify deployed main provenance at `7d4deb845a9a40c03aa304d073d8f574c41c1997`.
- [x] Run `npm run check` from the fresh-main worktree.
- [x] Run `npm run coverage:client` and record the current 104-file, 744-test coverage result.
- [x] Author the complete disposition table with source, test, PR, and live evidence.

### Task 2: Review and land the immutable disposition record

**Files:**

- Modify: `.codearbiter/specs/open-issue-hygiene.md`
- Modify: `.codearbiter/plans/open-issue-hygiene.md`
- Modify: `.codearbiter/reports/2026-08-01-open-issue-hygiene.md`
- Modify: `.codearbiter/sprint-log.md` by append only
- Modify: `.codearbiter/overrides.log` by append only

- [x] Run the `ca-chore docs` secret scan and diff-only behavioral-scope review.
- [x] Give one adversarial reviewer the spec, plan, report, sprint log, tests, and exact final diff.
- [x] Resolve every Critical, High, Medium, and other merge-blocking finding.
- [x] Run `npm run check`, `git diff --check`, and the state-free secret scan on the final diff.
- [ ] Commit, push, and open a governance-only PR.
- [ ] Require every hosted check green on the exact reviewed head, then merge through the PR.

### Task 3: Apply the merged issue dispositions

**External state:** GitHub issues only; exact actions are listed in the report.

- [ ] Close #10, #85, and #109 as completed with the report's evidence comments.
- [ ] Close #64 as not planned because simulation is required for lethal-shot next-seat prediction.
- [ ] Narrow the titles and add current-scope comments to #45, #67, #68, #70, and #134.
- [ ] Leave #47, #69, #104, #110, #111, #125, and #129 open and unchanged.
- [ ] Re-query the open list and verify 12 retained issues, zero accidental closures, and exact title/comment mutations.
- [ ] Continue immediately to the next highest-value sprint cell.
