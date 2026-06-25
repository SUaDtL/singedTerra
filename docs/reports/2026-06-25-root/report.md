# singedTerra — Deep Review Report

**Run:** `2026-06-25-root` · scope: repository root · 10 specialist lenses across 3 waves · orchestrated on Opus 4.8.
**Source of truth:** `findings/<lens>.jsonl` (69 findings, append-only) + `triage.jsonl` (69 decisions). This report is a projection.
**Mode:** report-only (no issue-create command supplied) — ready-to-run filing commands are at the end. **No project code was modified.**

## Executive summary

singedTerra is a **healthy, carefully-built codebase**. The highest-risk surfaces came back clean on their core controls: the Postgres **RLS posture is sound** (anon key cannot forge `room_actions`/`rooms`/`match_scores`; service-role RPCs have `PUBLIC EXECUTE` revoked), there is **no injection and XSS is handled** (`textContent`/escaping; colors to CSSOM not innerHTML), the **`submit_room_action` atomicity is correct** (FOR UPDATE + UNIQUE), the **migrations are forward-only and non-destructive**, and the **prime determinism invariant holds** — grep confirms zero `Date.now`/`performance.now`/`Math.random` under `shared/src/engine`. Four findings are explicitly recorded as **positive controls**.

The defects that exist cluster in the **networking/state-plumbing layer, not the engine math**:

- **One guaranteed bug (HIGH):** `restart_game` drops the `ai` flag on rematch, so any room with a CPU seat **freezes on bot turns after a rematch**. One-line fix; no test exists for `restart_game`.
- **One structural design question (decision-required):** the **thin referee has no independent turn-order source of truth** — it trusts the submitter's client-reported `nextActiveIndex`/`roundOver`. Bounded to a caller's own room and within the accepted no-auth posture (ADR 0006), but it is the latent root behind the historical P0-2/P0-3 patches. The proper response is an ADR (authoritative-replay vs hardened-thin referee), not a quick patch.
- **A handful of real medium reliability/typing items:** an unknown weapon string can **brick a room on replay** (referee doesn't validate `weapon`); no fetch has a timeout (stuck "Sending…"); the tick-cap leaves the engine silently wedged; `ServiceClient = any` hides schema drift; the flagship `determinism.mjs` snapshot **omits fields it claims to guard** (napalm `fire`, Sprint-4/5/6 tank fields).
- **Many low-severity, cheap hardening items** in observability/logging, perf (canvas-gradient caching, an edge N+1), supply-chain (security headers, `deno.lock`), and dead-code cleanup.

Nothing critical; nothing that breaks the determinism core. The work is precise and mostly small.

## At a glance

| Final severity | Issue-eligible findings |
|---|---|
| critical | 0 |
| high | 2 (one task) |
| medium | 21 |
| low | 41 |

| Decision | Count |
|---|---|
| keep | 27 |
| combine | 28 |
| decision-required | 3 |
| false-positive (positive controls) | 4 |
| investigate | 3 |
| defer | 3 |
| duplicate | 1 |

Findings combine into **~34 issue-eligible tasks** (1 high, 1 decision-required ADR, 12 medium, ~20 low). Per-wave plans: `plans/phase-1.md` (correctness & trust-boundary), `plans/phase-2.md` (resilience & determinism), `plans/phase-3.md` (typing/perf/tests/observability/cleanup).

---

## Tasks (issue-eligible)

### 🔴 HIGH
1. **rematch-ai-flag** — `restart_game` drops the `ai` flag → bot rematches freeze. *(migration-004 + testcov-001)* · effort S
   - Fix all three `players.map` sites to spread `...(p.ai ? { ai: p.ai } : {})`; add `restart_game.test.ts`.
   - **AC:** rematch of a room with a bot keeps `ai`; bot seats drive themselves; test green.

### 🟠 DECISION-REQUIRED (ADR-grade, not a fix-ticket)
D1. **referee-cursor-trust** — thin referee trusts client-reported `nextActiveIndex`/`roundOver` as the turn gate. *(reliability-003 + appsec-001 + appsec-004)* · medium
   - Decide: **authoritative-replay referee** (SPEC §5) vs **hardened thin referee** (reject dead/out-of-range/non-successor reported seats; derive round-phase from the log). Write `docs/adr/000X-referee-turn-authority.md`. Characterization tests (testcov-003/006) pin current behavior either way.

### 🟡 MEDIUM
2. **boundary-action-validation** — unknown `weapon` string is unvalidated by the referee → commits to the log → crashes `getWeapon()` on every replaying client (permanent room brick; malicious or version-skew). *(dx-003 + dx-002)* · S–M
3. **supabase-typing** — `ServiceClient = any` + incomplete `RoomRow` + stale `RoomAction` type hide schema drift. *(dx-001 + migration-005 + migration-003; dx-004 dup)* · M
4. **fire-recovery-robustness** — no fetch timeout + swallowed `resyncLog` failure → stuck "Sending…". *(reliability-005 + observability-005)* · M
5. **tickcap-handling** — tick-cap leaves the engine wedged (silent freeze) and logs no context. *(reliability-006 + observability-001)* · M
6. **determinism-drift-guards** — physics-default literals across 5 sites, `clone()` field-parity, referee accessory allowlist — hand-synced couplings that silently desync. *(architecture-001/004/005)* · M
7. **edge-fn-test-coverage** — 6/10 mutating edge functions untested; finish_game sanitizer, ghost-seat gate, nextCursor dead-seat, rate-limit rollover, rpc array-form. *(testcov-002/003/004/005/006 + testfid-004)* · M
8. **determinism-snapshot** — `determinism.mjs serialize()` omits `fire`, Sprint-4/5/6 tank fields, round fields → blind spots in the flagship guard. *(testfid-001/002/003)* · S
9. **performance-001** — `list_rooms` N+1 reap loop → batch the GC writes. · M
10. **performance-002** — AI forward-sim (~13.9k probes hard) blocks the main thread → Worker / coarser grid. · M
11. **performance-007** — `computeNextSeat` clones the full engine (720k bytes) per turn → cheap seat scan. · M
12. **migration-002** — `rate_limits` grows unbounded for dead IP buckets → cleanup job. · S
13. **observability-004** — no global error handler in `main.ts` → silent blank screen. · S

### 🟢 LOW (grouped)
- **reliability-009** — CI guard against wall-clock/`Math.random` in `shared/engine` (invariant verified clean). · S
- **gradient-caching** (perf-003/004/006) — cache canvas gradients. · S
- **edge-fn-perf** (perf-009 + perf-010) — narrow `select('*')`; singleton service client. · S
- **performance-005** — `syncFire` per-tick alloc → in-place decrement. · S
- **rate-limit-observability** (reliability-002 + observability-002) — distinguishable fail-open signal. · S
- **edge-logging-context** (observability-003 + observability-007, w/ secrets-001) — correlated edge logs / log `error.message`. · S
- **desync-diagnostics** (observability-006 + observability-008) — client warn logs for desync signatures. · S
- **appsec-002** — `finish_game` unverified winner/scoreboard (pairs with testcov-002). · M
- **appsec-003** — bound + format-check player `color`. · S
- **secrets-002** — larger room-code space / failed-join lockout. · S
- **secrets-003** — explicit `.env[.local]` gitignore entries. · S
- **secrets-004** — HTTP security headers (nginx + netlify). · S
- **secrets-006** — commit `deno.lock` integrity (or vendor supabase-js). · M
- **reliability-001** — `AudioEngine.dispose()` + fix stale `reset()` doc. · S
- **migration-001** — drop redundant `room_actions` index. · S
- **architecture-002** — delete dead `shared/src/index.ts` barrel. · S
- **architecture-003** — delete dead `Tank.create`/`Tank.bounds`. · S
- **dx-005** — enable `noUncheckedIndexedAccess`. · M
- **dx-007** — Lobby response shape guard (drop non-null assertions). · S
- **testfid-006** — `list_rooms.test` reap-pipeline fixture/test. · S

---

## Not filed this run

**Positive controls (false-positive = no defect, kept as evidence):**
- reliability-004 — only `Math.random` in the client is network jitter, outside the replayed path.
- performance-011 — `TerrainRenderer` correctly gates the rebuild on `terrainVersion` (P2-8 fixed).
- migration-006 — `submit_room_action` atomicity/serialization correct.
- migration-007 — migration ordering forward-safe, consistent RLS.

**Investigate (below the calibrated confidence/severity bar):**
- reliability-007 — defensive RESOLVING-phase iteration cap (speculative; settle currently converges).
- reliability-008 — firing-lock released on any drained action (HUD flicker; not a desync). Fold into fire-recovery if picked up.
- secrets-005 — `@supabase/supabase-js` client vs esm.sh version skew (same version today).

**Defer (real, trivial / out of priority):**
- performance-008 — `EffectsRenderer.update` early-return (sub-µs).
- dx-006 — `armsLevel as number` cast cleanup (no behavior change).
- testfid-005 — `validate.test` `human()` missing `lastSeen` (no functional gap; authorizeAction ignores it).

**Duplicate:** dx-004 → migration-003.

---

## Filing the issues

This was a **report-only** run (no issue-create command supplied). To file, re-invoke with a command template, e.g.:

```
/review . 3 'gh issue create --title "{title}" --body-file {body_file}'
```

or file the top items manually. Suggested first tranche (highest ROI):

```
# 1. The one guaranteed bug — fix is one line
gh issue create --title "restart_game drops ai flag → bot rematches freeze" \
  --label bug,backend --body "See docs/reports/2026-06-25-root/ findings migration-004 + testcov-001. \
restart_game/index.ts player map omits p.ai; spread it on all 3 sites + add restart_game.test.ts."

# 2. ADR for the referee turn-authority question
gh issue create --title "ADR: thin-trusting vs authoritative-replay referee for turn ordering" \
  --label adr,discussion --body "See referee-cursor-trust group (reliability-003/appsec-001/appsec-004)."

# 3. Room-brick on unvalidated weapon string
gh issue create --title "Referee must validate fire.weapon against the known set (unknown string bricks room on replay)" \
  --label bug,security --body "See dx-003/dx-002: type weapon as WeaponType, validate in referee, guard getWeapon()."
```

Bodies for every kept finding are generated lazily at the filing gate (approved-only) to avoid materializing dozens of near-duplicate files on a report-only run. Ask to "file the Phase 1 issues" (or all) and supply the tracker command; I'll generate `bodies/<id>.md` and run the template per issue.
