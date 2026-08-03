# Fall Damage and Parachute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic collapse fall damage and a one-use Parachute accessory without changing the action protocol.

**Architecture:** `GameEngine` accumulates downward tank movement during the existing settle pass and applies one resolved damage event when settling converges. `TankState.accessories` carries accessory counts through clone/replay/round carry; the existing `buy` action and HUD catalog expose the new item.

**Tech Stack:** TypeScript shared engine, Deno Edge validators, Vitest client UI tests, deterministic `scripts/checks/*.mjs` harnesses.

## Global Constraints

- No auth, secrets, crypto, migrations, RLS/grants, dependencies, or new action kinds.
- Fall damage is integer arithmetic and never uses wall-clock time or randomness.
- Production code follows RED → GREEN → REFACTOR; every new behavior has a failing test first.
- The exact reviewed PR head must be hosted-green before merge.

---

### Task 1: Add the RED engine contract

**Files:**
- Create: `scripts/checks/fall_damage.mjs`
- Modify: `package.json`

- [x] Write a harness that creates a deterministic engine, forces a deep terrain drop, settles it, and asserts the unprotected tank loses health; add protected and safe-fall assertions plus live/replay parity.
- [x] Add `npx tsx scripts/checks/fall_damage.mjs` to the `npm run check` chain.
- [x] Run `npx tsx scripts/checks/fall_damage.mjs`; RED confirmed before implementation (`health 100->100`, then missing accessory inventory).

### Task 2: Implement deterministic fall damage and accessory state

**Files:**
- Modify: `shared/src/types/GameState.ts`
- Modify: `shared/src/engine/Tank.ts`
- Modify: `shared/src/engine/WeaponSystem.ts`
- Modify: `shared/src/engine/GameEngine.ts`
- Modify: `shared/src/net/replay.ts`
- Modify: `supabase/functions/_shared/mod.ts`
- Modify: `supabase/functions/submit_action/validate.ts`
- Modify: `supabase/functions/submit_action/index.ts`

- [x] Add `accessories: Record<AccessoryType, number>` with zeroed defaults and clone/round carry parity.
- [x] Add named fall constants and Parachute catalog values; increment accessory inventory on buy while preserving battery/fuel effects.
- [x] Accumulate only downward movement across settle ticks; after convergence apply the explicit formula, consume one parachute only for a dangerous fall, and call `Tank.applyDamage` without credits/shield absorption.
- [x] Pass `parachute` through replay and the Edge allowlist/validated action mapping (existing generic buy/replay path; allowlist extended).
- [x] Run the focused harness; GREEN.

### Task 3: Expose and document the accessory

**Files:**
- Modify: `client/src/ui/storeCatalog.ts`
- Modify: `client/src/ui/HUD.ts`
- Modify: `docs/PLAYING.md`
- Modify: `scripts/checks/accessories.mjs`

- [x] Add the Parachute catalog row and show `Parachutes N` in both store views.
- [x] Extend accessory contract coverage to assert the catalog, price, arms level, and count semantics.
- [x] Document safe distance, damage reduction, and one-use consumption.
- [x] Run focused client/accessory tests; receipt: `npm run test:client` → 128 files / 931 tests passed, and `npx tsx scripts/checks/accessories.mjs` passed.

### Task 4: Full verification and governed delivery

- [x] Run typecheck, full deterministic checks, client suite, Edge suite, production build, and diff checks; E2E/audit/secret scan remain separately tracked where not part of this local receipt.
- [x] Package the spec, plan, sprint log, tests, and final diff for adversarial review; reviewer returned 0 Critical, with findings resolved in this revision.
- [ ] Run commit gate, push, open PR, and verify hosted checks on the exact reviewed head.
- [ ] Merge under standing authority, deploy associated client/Edge changes if credentials permit, verify production health, and close the task only after delivery evidence.
