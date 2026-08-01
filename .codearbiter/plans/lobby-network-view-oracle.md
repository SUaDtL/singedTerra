# Lobby Network View Browser Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` task-by-task, `superpowers:verification-before-completion` before delivery, and the codeArbiter commit/review/PR gates.

**Goal:** Extend real-browser Lobby coverage to Browse and Waiting with deterministic intercepted Edge responses and no production state hook.

**Architecture:** Configure only the local Playwright preview build with a same-origin dummy Supabase endpoint/key. In the Lobby spec, intercept exact function routes, navigate via public controls, assert fixture-derived content, and reuse the Phase 1 geometry helpers.

**Tech Stack:** TypeScript, Playwright route interception, Vite production preview; no dependency.

## Global Constraints

- Dummy Supabase values apply only to the non-live Playwright web server.
- Every exercised Edge request must be intercepted; no real Supabase project may be contacted.
- Use public Lobby controls and existing HTTP response shapes.
- Do not click Ready Up, Leave, Join, or Copy Invite; this phase proves rendering and reachability only.
- Do not touch production, dependency, backend, auth, crypto, migration, or workflow behavior.

---

### Task 1: Provide deterministic local transport coordinates

**Files:**

- Modify: `playwright.config.ts`

- [x] Add a non-live `webServer.env` with `VITE_SUPABASE_URL` set to the origin-only `localOrigin` and `VITE_SUPABASE_ANON_KEY` set to `e2e-public-anon-key`.
- [x] Keep the live-smoke branch unchanged because it does not create a local `webServer`.

### Task 2: Cover Browse and Waiting views

**Files:**

- Modify: `e2e/lobby-layout.spec.ts`

- [x] Add a `fulfillFunction(page, name, body)` helper that intercepts exactly `**/functions/v1/<name>`, returns HTTP 200 JSON, and records the request.
- [x] Add a Browse test that intercepts `list_rooms`, navigates via Play Online -> Browse public rooms, and asserts the complete fixture row plus frame/reachability invariants.
- [x] Add a Waiting test that intercepts `create_room`, fills the create-form name, clicks Create Room, and asserts code, roster/readiness, invite, Ready Up, Leave, and frame/reachability invariants.
- [x] Assert each fixture route is called exactly once before the view assertion completes.
- [x] Run `npx playwright test e2e/lobby-layout.spec.ts`; expect 15 passes total (5 tests x 3 projects), including 6 new network-view cases.

### Task 3: Verify, review, and deliver

**Files:**

- Append only: `.codearbiter/sprint-log.md`
- Append only when authorized gates are bypassed: `.codearbiter/overrides.log`

- [x] Run the complete Playwright suite, `npm run check`, client and Edge tests, client coverage, build, dependency audit, secret scan, and diff hygiene.
- [x] Give one adversarial reviewer the exact spec, plan, diff, route fixtures, and evidence; correct every Critical, High, Medium, and merge blocker.
- [x] Commit through `$ca-commit`, open a ready PR referencing but not closing #129, and obtain exact-head hosted CI.
- [ ] Use the standing PR-only merge authority only after the reviewed final head is green; verify Pages exact-main provenance and live smoke.
- [ ] Select the first bounded Lobby view extraction under the completed oracle.
