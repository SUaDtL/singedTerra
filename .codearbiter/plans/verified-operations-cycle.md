# Verified Operations Cycle Plan

**Initiative:** `career.initiative.0001`
**Spec:** `.codearbiter/specs/verified-operations-cycle.md`
**Status:** approved under standing continuous-improvement authority

## File structure

- Replace `client/src/client/firstStrikeObjective.ts` with a pure Field Order
  catalog/reducer that owns selection and public progress, while retaining
  First Strike behavior as order one.
- Replace focused objective tests with causal selection/observation/receipt
  tests; extend `main.hotSeatProgression.test.ts` around resume and accepted
  completion handoff.
- Modify `client/src/main.ts`, `client/src/ui/HUD.ts`, and `client/src/ui/Lobby.ts`
  to compose the frozen order and route only the verified accepted-report primary
  action to the Battery.
- Extend `e2e/verified-deployment.spec.ts` for the complete verified order loop.
- Amend the active career plan, sprint log, and evidence only with observed
  RED/GREEN/review/hosted/deploy/live facts.

## Task 1: Make field orders deterministic and receipt-safe

- [x] Write RED reducer tests for `matchesPlayed` selecting First Strike, Fire
  for Effect, and Hold the Field; test valid bounds, malformed-summary absence,
  same-descriptor resume stability, each success/miss boundary, and terminal
  idempotence.
- [x] Implement `fieldOrder.ts` as a pure catalog plus reducer. Its public
  state contains only id, title, instruction, active progress, and terminal
  result; it has no account identifier, descriptor id, transcript, or reward.
- [x] Port the existing First Strike timing semantics exactly into the first
  order, use settled distinct human-salvo damage for Fire for Effect, and use
  terminal winner facts for Hold the Field.
- [x] Run reducer tests RED then GREEN; add mutation-resistant boundaries for
  third-salvo resolution, duplicate-damage salvos, and repeat receipts.

## Task 2: Freeze, retire, and compose order lifecycle

- [x] Write RED main/Lobby/HUD tests for a frozen active descriptor order,
  resumed order retention, retirement on teardown/casual/expiry/account change,
  and recomputation only after accepted immutable receipt summary refresh.
- [x] Replace `firstStrikeObjective` ownership in `main.ts` with a frozen
  `FieldOrder` session. Feed it only the existing verified controller transcript,
  settled human-salvo projection, terminal outcome, validated summary, and
  completion receipt state.
- [x] Generalize dossier/brief/console/report HUD copy through one public
  FieldOrder renderer; preserve current non-verified paths byte-for-byte in
  behavior and report action counts.
- [x] Run focused composition tests and strict typecheck GREEN.

## Task 3: Make the verified report lead to a fresh next order

- [x] Write RED report/action tests that require `Brief next order` only after
  accepted verified completion, no duplicate focusable action, focus-safe
  transfer to the Battery, and rejection of retry/failed/expired/casual cases.
- [x] Route the accepted-report primary callback through a guarded teardown that
  clears the consumed verified controller/order and invokes the existing lobby
  Battery route. Do not call `startGame(currentConfig)` from this path.
- [x] Prove that the next verified start returns through the existing descriptor
  start path and carries a fresh descriptor/budget before publishing its new
  order.
- [x] Run exact focused report/lifecycle tests GREEN and re-run existing retry
  and account-isolation tests.

## Task 4: Prove the whole player loop and govern the slice

- [x] Add RED browser coverage on desktop, compact, and Pixel: authenticated
  brief -> active order -> terminal report -> Brief next order -> Battery ->
  fresh verified 0/6 order. Assert ordinary/anonymous/Quick Duel/online absence.
- [x] Execute browser matrix, full client suite, `npm run check`, Edge checks,
  typecheck, and diff-check; resolve every regression without weakening existing
  verification or layout contracts.
- [ ] Give the exact spec, plan, sprint log, tests, and final diff to an
  adversarial reviewer; resolve all Critical, High, and merge-blocking findings.
- [ ] Open a PR, require exact-head hosted CI/CodeQL/Pages success, deploy only
  if the review scope changes deployable code, and capture a bounded
  authenticated production receipt before marking the task accepted.

**Local status:** GREEN. The browser mutation check and complete local gates are
recorded in `.codearbiter/reports/2026-08-15-verified-operations-cycle-sprint-evidence.md`.
Adversarial review, PR, exact-head hosted checks, deployment decision, and the
authenticated production receipt remain open; this initiative is not accepted.
