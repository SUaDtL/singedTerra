# Weapon Intel Panel - Final Adversarial Review Package

- Date: 2026-08-10
- Branch: `codex/weapon-intel-panel`
- Review target: the complete final staged change set listed in the serialized diff below
- Canonical serialized-diff blob hash: `d307402c69d11afcbee7e86d24149789d475f9df`
- Package recursion rule: this governance wrapper is excluded from its own embedded diff; every implementation, test, task-board, spec, plan, audit, prior-review record, and sprint-evidence change is included.
- Diff encoding: the JSON string decodes byte-for-byte to the UTF-8 unified diff.
- Final-review mandate: independently verify all findings from all three prior BLOCK verdicts are resolved, especially dossier scroll reset and heading visibility across keyboard, pointer, and touch; invariant desktop and compact dossier/grid/button geometry; edge-hover authority; and at most one weapon transition while moving between targets. Reassess player value, responsive geometry, accessibility, correctness, scope fidelity, and mutation-resistant coverage. Report every Critical/High/Medium/Low finding plus MERGE or BLOCK. Do not modify files.

## Approved spec

~~~~markdown
# Weapon Intel Panel sprint spec

Status: approved under the user's standing continuous-improvement authority
Date: 2026-08-10
Task: `ux.hud.0002`
Source: `.codearbiter/reports/2026-08-10-post-remediation-adversarial-player-audit.md`

## Outcome

A player can inspect every implemented arsenal weapon with mouse, keyboard, or touch and understand its tactical role before committing ammunition. Guidance remains inside the arsenal drawer, never covers the battlefield, and never adds a modal or changes deterministic gameplay.

## Player contract

- Opening the arsenal immediately shows intel for the currently selected weapon.
- Focusing or pointing at another visible weapon previews that weapon's intel without selecting or firing it.
- Activating a weapon selects it through the existing callback and leaves its intel visible.
- Moving the pointer away restores intel for the selected weapon; keyboard focus remains authoritative while it is inside a weapon button.
- Intel includes the weapon name, a short tactical role, terrain interaction, damage or blast character, live ammunition, and one concise use case.
- All implemented `WeaponType` values have authored intel. The TypeScript mapping is exhaustive so a future weapon cannot compile without guidance.
- The panel is readable and contained inside the existing fitted arsenal drawer on desktop-fine, pixel-touch, and small-window Playwright projects.
- Existing collapse preference, Escape-to-close behavior, owned-only visibility, weapon selection, firing, store, engine, network, and replay behavior remain unchanged.

## Design

Create a focused `weaponIntel.ts` presentation catalog keyed by `WeaponType`. Keep player-facing tactical language separate from engine tuning so exact balance changes do not turn the panel into misleading pseudo-precision. The catalog exposes role, terrain, damage, and use-case strings and is imported only by the HUD.

The arsenal builds one persistent intel region beneath its weapon grid. It defaults to the selected weapon during `syncStrip`. Button `focus` and pointer entry preview another weapon. Button pointer exit restores the selected weapon unless keyboard focus is still on that button. Click continues to use the existing selection callback and updates the preview immediately. The region uses an accessible heading and polite status semantics; weapon buttons reference it with `aria-describedby`.

The panel is part of the drawer's existing layer and scroll containment. It is hidden whenever the drawer is collapsed. Compact CSS reduces spacing and type size while preserving the current 44-pixel touch-target floor.

## Considered approaches and SMARTS decision

1. **Inline drawer dossier - chosen.** Strong: best safety, maintenance, accessibility, reversibility, testability, and player comprehension. It is persistently readable on touch and inherits the drawer's established layering.
2. **Hover tooltip.** Rejected: weak on touch and keyboard, easy to clip, and transient while the player compares choices.
3. **Battlefield modal or popover.** Rejected: obscures the exact battlefield context needed to judge a weapon and repeats the overlay-composition failure class already repaired.

SMARTS verdict: inline dossier, strong confidence. Intent: current adversarial audit plus the user's standing priority on polished player experience.

## Authored content boundaries

Guidance may use stable qualitative bands such as precision, broad, massive, terrain-building, tunneling, lingering fire, or defense. It must not expose brittle internal frame counts, velocity constants, or formulas. Shield capacities may be described qualitatively rather than as engine HP. Ammunition is live HUD state, not duplicated catalog data.

## Test obligations

1. A catalog unit test proves every implemented weapon has non-empty, bounded role, terrain, damage, and use-case text.
2. HUD unit tests fail before implementation and prove selected default, focus preview, pointer preview/restore, click persistence, live ammo, `aria-describedby`, and collapse behavior.
3. A real-browser test runs in all three viewport projects and proves the panel is visible, changes via each applicable input mode, remains inside the drawer and viewport, does not overlap the canvas, and does not increase `#hud` scroll height.
4. Mutation-oriented assertions must fail if any one intel field is omitted, preview events are removed, selected fallback is removed, or compact containment is broken.

## Out of scope

No weapon balance, inventory, store, engine, action schema, network, Supabase, auth, progression, dependency, asset, or migration changes. No tutorial sequence and no new modal.
~~~~

## Implementation plan

~~~~markdown
# Weapon Intel Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every implemented arsenal weapon understandable before a player spends ammunition.

**Architecture:** Add one exhaustive client-only tactical-copy catalog and render it through one persistent region inside the existing arsenal drawer. HUD events preview focused or pointed weapons, while the selected weapon remains the stable fallback. No engine or action behavior changes.

**Tech Stack:** TypeScript, DOM, CSS injected by `HUD.ts`, Vitest/jsdom, Playwright/Chromium.

## Global Constraints

- Work test-first and preserve the RED output before production edits.
- Keep the feature inside the existing arsenal drawer; no tooltip, popover, or modal.
- Cover every implemented `WeaponType` exhaustively.
- Support mouse, keyboard, and touch without changing weapon selection semantics.
- Keep drawer, HUD, and page geometry contained in desktop-fine, pixel-touch, and small-window.
- Do not touch engine, network, Supabase, auth, progression, dependencies, assets, schemas, or migrations.

---

### Task 1: Exhaustive tactical intel catalog

**Files:**
- Create: `client/src/ui/weaponIntel.ts`
- Create: `client/src/ui/weaponIntel.test.ts`

**Interfaces:**
- Produces: `WeaponIntel` and `WEAPON_INTEL: Record<WeaponType, WeaponIntel>` with `role`, `terrain`, `damage`, and `useCase` strings.

- [ ] Write a failing unit test that iterates the implemented keys in `WEAPONS`, requires an exactly matching intel key set, and requires every field to be non-empty and concise.
- [ ] Run `npm test --workspace client -- --run client/src/ui/weaponIntel.test.ts` and record the expected module-not-found RED.
- [ ] Add the exhaustive authored catalog with qualitative, player-facing tactical copy for all 18 implemented weapons.
- [ ] Re-run the focused test and keep it green.

### Task 2: Input-complete arsenal dossier behavior

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/ui/HUD.arsenal.test.ts`

**Interfaces:**
- Consumes: `WEAPON_INTEL`.
- Produces: `.st-hud__weapon-intel` with named fields and live ammo; every weapon button receives `aria-describedby`.

- [ ] Add failing HUD tests for selected default content, keyboard focus preview, pointer preview and selected fallback, click persistence, live ammo updates, accessible description wiring, and hidden-with-collapsed behavior.
- [ ] Run `npm test --workspace client -- --run client/src/ui/HUD.arsenal.test.ts` and record assertion RED caused by the absent dossier.
- [ ] Build one dossier below the arsenal grid, cache its field nodes, and add focused preview helpers without rebuilding per frame.
- [ ] Wire `focus`, `pointerenter`, `pointerleave`, and the existing click listener so previews never emit selection and click emits selection exactly once.
- [ ] Reconcile selected fallback and live ammunition in `syncStrip`; preserve Escape focus return and collapse state.
- [ ] Re-run both focused Vitest files and keep them green.

### Task 3: Battlefield-safe responsive composition

**Files:**
- Modify: `client/src/ui/HUD.ts` (injected HUD CSS)
- Create: `e2e/weapon-intel.spec.ts`

**Interfaces:**
- Consumes: dossier DOM from Task 2.
- Produces: fitted drawer composition across the existing Playwright project matrix.

- [ ] Add a Playwright test that opens the arsenal, proves selected intel, exercises pointer preview on desktop, focus preview on fine-pointer projects, and touch selection on pixel-touch.
- [ ] Assert computed geometry: dossier inside drawer and viewport, drawer disjoint from the canvas, no page overflow, no increase in `#hud` scroll height, and 44-pixel weapon targets on touch.
- [ ] Run `npm run test:e2e -- --grep "weapon intel"` and record the expected RED before CSS/behavior completion.
- [ ] Add compact dossier layout, restrained qualitative labels, and bounded overflow inside the existing drawer.
- [ ] Re-run the focused browser test and affected `hud-layout` guardrails across all projects.

### Task 4: Verification and review package

**Files:**
- Create: `.codearbiter/reports/2026-08-10-weapon-intel-panel-sprint-evidence.md`
- Create: `.codearbiter/reports/2026-08-10-weapon-intel-panel-final-review-package.md`
- Modify via `$ca-task`: `.codearbiter/open-tasks.md`

- [ ] Run focused unit and browser suites, client suite, typecheck, deterministic harness, build, dependency audit, and the complete Playwright matrix.
- [ ] Record RED/GREEN evidence, SMARTS decisions, test results, and the exact final staged diff hash in sprint evidence.
- [ ] Assemble the exact spec, plan, audit, evidence, tests, and final diff in one adversarial review package.
- [ ] Dispatch one fresh adversarial reviewer; resolve every Critical, High, and other merge-blocking finding and regenerate exact-head review evidence after any correction.
- [ ] Mark `ux.hud.0002` done through `$ca-task`, route through `$ca-commit` and `$ca-pr`, require hosted CI green on the exact reviewed head, merge under standing authority, verify Pages production, and write the delivery receipt.
~~~~

## Scoped sprint log and verification evidence

~~~~markdown
# Weapon Intel Panel sprint evidence

Date: 2026-08-10
Task: `ux.hud.0002`
Branch: `codex/weapon-intel-panel`
Merge base: `e154aebeb42fb5efde17e18b796ee9ed0e816377`
Status: third adversarial review blocked stale dossier scroll; correction fully verified; final adversarial verdict pending

## Scoped sprint log

The repository's canonical `.codearbiter/sprint-log.md` remains intentionally untouched because its pre-existing malformed UTF-8 state is governed as a preservation constraint. This scoped report is the recovery and decision ledger for this slice and is included verbatim in the final adversarial package.

### Auto-decision 1 - presentation surface

- Options: inline arsenal dossier; transient tooltip; battlefield modal or popover.
- SMARTS verdict: inline dossier.
- Strength: strong; confidence: high.
- Rationale: strongest accessibility, touch persistence, layer safety, reversibility, and testability. A modal would cover the context needed to judge the shot; a tooltip would fail touch comparison.
- Intent: post-remediation adversarial audit plus the user's standing player-experience priority.

### Auto-decision 2 - tactical copy source

- Options: expose exact engine constants; compute prose from weapon definitions; author stable qualitative guidance.
- SMARTS verdict: exhaustive authored qualitative catalog in `weaponIntel.ts`.
- Strength: strong; confidence: high.
- Rationale: compile-time exhaustiveness without turning ordinary balance tuning into stale player promises. Live ammunition remains state-derived.
- Intent: sprint spec.

### Auto-decision 3 - compact drawer composition

- Options: shrink weapon targets; clip the dossier beneath the grid; keep the dossier fixed and make the weapon grid internally scrollable.
- SMARTS verdict: fixed dossier above an internally scrollable grid.
- Strength: strong; confidence: high.
- Rationale: preserves the real 44-pixel touch floor, keeps guidance visible during comparison, and contains the drawer without covering the battlefield.
- Intent: causal Pixel 5 geometry RED and the sprint's battlefield-safe requirement.

### Auto-decision 4 - pointer preview trigger

- Options: `pointerenter`; `pointermove`; click-only preview.
- SMARTS verdict: non-touch `pointermove`, keyboard `focus`, touch activation.
- Strength: strong; confidence: high.
- Rationale: opening the drawer reflowed a button beneath the pointer and generated an accidental `pointerenter` preview. Requiring actual mouse movement preserves hover intent; touch remains activation-driven and keyboard remains focus-driven.
- Intent: causal real-browser and unit regressions.

### Auto-decision 5 - physically readable compact typography

- Options: accept whole-stage shrinkage; counter-scale the dossier outside the drawer; derive logical type sizes from the live stage zoom and use a one-column compact dossier.
- SMARTS verdict: zoom-derived physical type floors inside the existing drawer.
- Strength: strong; confidence: high.
- Rationale: retains battlefield containment and the existing layer model while guaranteeing readable rendered type on both compact projects. Counter-scaling would escape the rail and recreate the overlay defect this sprint exists to prevent.
- Intent: adversarial review High finding 1 and measured 3.42-6.15 pixel compact copy.

### Auto-decision 6 - stable compact interaction geometry

- Options: let the dossier auto-size; reserve a fixed dossier and let the drawer shrink-wrap it; make the open drawer own the rail height, reserve a scrollable dossier region, and give the weapon grid the remainder.
- SMARTS verdict: full-height in-rail drawer with independent dossier and weapon-grid scroll regions.
- Strength: strong; confidence: high.
- Rationale: physically readable copy cannot fit the 129-pixel rendered rail without vertical scrolling. Owning the rail height prevents copy changes from moving pointer targets, preserves 44-pixel touch controls, and keeps every layer inside the rail instead of over the battlefield.
- Intent: causal full-browser RED where compact hover reflow canceled Sandhog selection and a shrink-wrapped drawer assigned the grid zero height.

## Test-first evidence

1. **Catalog RED:** `npm test --workspace client -- --run src/ui/weaponIntel.test.ts` failed because `./weaponIntel` did not exist.
2. **Catalog GREEN:** the same command passed 1/1 after the exhaustive 18-weapon mapping was added.
3. **HUD RED:** `HUD.arsenal.test.ts` produced three dossier failures because no panel, preview state, or live ammunition existed.
4. **HUD GREEN:** catalog plus arsenal tests pass 16/16, including selected fallback, focus, mouse movement, touch activation, live ammo, collapse, accessible description, and touch-hover suppression.
5. **Geometry RED:** the unstyled Pixel 5 panel extended to `318.875` while the drawer ended at `287.140625`.
6. **Touch target RED:** the initially fitted treatment left scaled weapon controls at `21.484375` rendered pixels instead of the promised 44.
7. **Pointer race RED:** a real compact opening could preview Sandhog without player intent; the causal unit regression received `sandhog` instead of `baby_missile`.
8. **Browser GREEN:** the final focused matrix passes 3/3 with dossier containment, canvas separation, no document or HUD overflow, correct mouse/keyboard/touch behavior, and at least 44 rendered pixels per Pixel 5 weapon target.
9. **Adversarial correction RED:** the first frozen-package review measured compact copy at 3.42-6.15 rendered pixels, observed 60 same-value live-region assignments, and blocked stale preview, keyboard authority, semantic heading, Tracer wording, ARIA ownership, and mutation-resistant coverage.
10. **Correction unit RED:** the expanded catalog/HUD run failed 5 assertions for heading semantics, keyboard focus authority, collapse reset, repeated-update live-region mutations, and Tracer tradeoff copy.
11. **Correction unit GREEN:** focused catalog/HUD tests pass 20/20 after cached rendering, transient-state reset, input-modality arbitration, semantic region naming, full-field assertions, and honest Tracer guidance.
12. **Correction browser GREEN:** the production-bundle matrix passes 3/3 with actual Tab navigation, compact physical font floors, 44-pixel touch targets, drawer containment, and no page/HUD overflow.
13. **Compact interaction RED:** the first corrected full matrix passed 254/258 but four compact Sandhog selections failed because pointer preview changed dossier height before pointer-down. A first fixed-height attempt then exposed a zero-height weapon grid because the drawer shrink-wrapped its contents.
14. **Compact interaction GREEN:** the open drawer now owns the available rail height, the readable dossier occupies a stable focusable scroll region, and the weapon grid scrolls in the remainder. The affected compact HUD/Sandhog matrix passes 42 with 12 intentional project skips; the complete matrix passes 258 with 30 intentional project skips.
15. **Desktop edge-hover RED:** corrected-package re-review reproduced up to 23.6 rendered pixels of desktop target movement and an edge hover that announced Heavy Missile then fell back to Baby Missile. The exhaustive fine-pointer browser regression failed with changed dossier/grid/button geometry, and its transition observer caught two weapon announcements while moving between targets.
16. **Desktop edge-hover GREEN:** the base dossier now reserves invariant height, every visible desktop and compact fine-pointer weapon survives a 4-pixel edge hover with an exact layout snapshot, and pointer leave/move is coalesced to at most one weapon transition. The focused three-project matrix passes 3/3 and the broader compact HUD/Sandhog matrix passes 42 with 12 intentional skips.
17. **Dossier scroll RED:** the second corrected-package review reproduced a new weapon opening at `scrollTop` 42.29 on compact fine pointer and 151.54 on Pixel touch. The causal unit regression then failed with the old scroll position of 37 after keyboard focus changed the weapon.
18. **Dossier scroll GREEN:** the dossier now resets to its heading only when the rendered weapon changes. Unit coverage proves keyboard, pointer, and touch paths; compact production-bundle coverage scrolls to the bottom before each change and requires zero scroll plus a fully visible new heading.

One invalid browser run reached an unrelated codeArbiter service already occupying port 4173; it was rejected as evidence and that process was not touched. A later full-matrix run against a preview built without E2E Supabase variables produced fixture-only failures; it too was rejected and rerun against a same-origin CI-equivalent build. A project-base preview run returned 404 for its built assets because the local preview server was rooted at `/`; it was rejected and replaced by the same production bundle rebuilt for the local root. One unrelated portrait focus timing assertion failed under 16-worker contention, passed immediately in isolation, and the complete eight-worker rerun passed.

## Fresh verification

The results below were rerun after the final dossier-scroll correction.

- Focused Vitest: 27/27 passed across arsenal, shell, and intel catalog coverage.
- Client suite: 152 files, 1,188/1,188 tests passed.
- `npm run check`: passed, including typecheck and all deterministic engine/contract harnesses.
- `npm run build`: passed with CI-equivalent public E2E Supabase fixture values.
- Dependency audit: `npm audit --audit-level=high` -> 0 vulnerabilities.
- Corrected compact HUD/Sandhog browser guardrails: 42 passed, 12 intentional project skips.
- Complete Playwright matrix: 258 passed, 30 intentional project skips.
- Visual inspection: the corrected 900x520 production bundle shows readable dossier copy contained in the right rail, an unobstructed battlefield, and a distinct weapon-grid scroll region with no overlap or ghosting.
- `git diff --check`: passed on the corrected staged payload before package integrity verification.

## Scope proof

Changed runtime behavior is limited to client HUD presentation and input previews. There are no engine, deterministic state, weapon balance, action protocol, network, Supabase, auth, progression, dependency, asset, schema, migration, or secret changes.
~~~~

## Prior adversarial reviews and dispositions

~~~~markdown
# Weapon Intel Panel adversarial review record

Date: 2026-08-10
Reviewer: Darwin the 2nd (`019fee12-d47d-7073-b81d-ebf698f81b49`)
Reviewed serialized-diff blob: `3f006a1a98048f2ef151b219c688b1d7d830b9d0`
Initial verdict: **BLOCK**

## Findings and dispositions

1. **High - compact typography unreadable.** Corrected with zoom-derived physical font floors, a one-column compact dossier, and Pixel/small-window rendered-size assertions.
2. **High - polite live region rewritten every frame.** Corrected with weapon/ammunition render caches and a MutationObserver regression proving identical frame updates produce no mutations.
3. **Medium, merge-blocking - stale transient preview survives collapse/loadout changes.** Corrected by clearing focus/pointer state on collapse, expansion, selected-loadout changes, and hidden previews; covered for collapse, loadout change, and depletion.
4. **Medium, merge-blocking - pointer state overrides keyboard authority.** Corrected with explicit keyboard/pointer modality arbitration. Keyboard focus remains authoritative until pointer-down changes modality; unit and actual-Tab browser coverage enforce it.
5. **Medium, merge-blocking - missing accessible heading.** Corrected with an `h3` and `aria-labelledby` relationship; asserted semantically.
6. **Medium, merge-blocking - Tracer called risk-free despite consuming a turn and ammunition.** Corrected to state the non-damaging effect and explicit cost.
7. **Medium, merge-blocking - mutation-resistant coverage incomplete.** Corrected with exact assertions for every rendered field, actual keyboard traversal, compact physical type floors, transient reset tests, and same-frame mutation coverage.
8. **Low - toggle controls only the grid.** Corrected with a shared drawer-body wrapper containing both dossier and weapon grid; `aria-controls` now targets that wrapper.

All Critical, High, and merge-blocking findings require a corrected frozen package and fresh adversarial verdict before commit.

## Corrected-package re-review

Reviewed serialized-diff blob: `2cf97e4d062f122cde9122e3ac41254d88623269`
Verdict: **BLOCK**

The reviewer independently cleared every first-pass finding, then found one remaining High and one merge-blocking Medium: noncompact desktop dossier copy still had content-driven height, moving weapon targets by up to 23.6 rendered pixels and allowing edge hover to announce Heavy Missile then fall back while the pointer remained over that button; browser coverage checked height stability only on compact fine-pointer layouts.

Disposition: corrected with an invariant 180-logical-pixel desktop dossier inside the full-height rail drawer. The browser contract now edge-previews every visible fine-pointer weapon, waits for fallback races, requires the dossier/grid/button layout snapshot to remain exact, requires the hovered weapon to remain authoritative, and observes at most one `data-weapon` transition. Pointer leave/move fallback is coalesced so moving between buttons cannot announce an intermediate focused selection. The three-project focused contract and broader compact HUD/Sandhog matrix are green; a new frozen package and verdict remain required.

## Second corrected-package re-review

Reviewed serialized-diff blob: `43cf83769c369099ec82461a30d603e8152ffb0b`
Verdict: **BLOCK**

The reviewer independently cleared both second-pass findings, then found one remaining merge-blocking Medium: changing weapons preserved the previous dossier's internal scroll position. On compact mouse and touch layouts, a player who had read to the bottom could select a new weapon and land midway through its guidance with the identifying heading offscreen.

Disposition: corrected by resetting the dossier scroll position only when the rendered weapon changes. A causal unit regression covers keyboard focus, pointer preview, and touch activation. Production-bundle browser coverage scrolls the compact dossier to the bottom, changes weapons through keyboard, pointer, and touch paths, and requires `scrollTop === 0` with the new heading fully visible. The focused compact browser contract passes 2/2 and the complete matrix passes 258 with 30 intentional project skips; a new frozen package and verdict remain required.
~~~~

## Tests under review

### `client/src/ui/weaponIntel.test.ts`

~~~~typescript
import { describe, expect, it } from 'vitest';
import { WEAPONS } from '@shared/engine/WeaponSystem';
import { WEAPON_INTEL } from './weaponIntel';

describe('weapon tactical intel catalog', () => {
  it('authors concise tactical guidance for every implemented weapon', () => {
    const implemented = Object.entries(WEAPONS)
      .filter(([, weapon]) => weapon.implemented)
      .map(([type]) => type)
      .sort();

    expect(Object.keys(WEAPON_INTEL).sort()).toEqual(implemented);
    expect(implemented).toHaveLength(18);

    for (const type of implemented) {
      const intel = WEAPON_INTEL[type as keyof typeof WEAPON_INTEL];
      expect(intel, `${type} needs authored intel`).toBeDefined();
      for (const field of ['role', 'terrain', 'damage', 'useCase'] as const) {
        expect(intel[field].trim(), `${type}.${field} must not be empty`).not.toBe('');
        expect(intel[field].length, `${type}.${field} must stay scannable`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('describes tracer as a finite turn-and-ammunition tradeoff', () => {
    expect(WEAPON_INTEL.tracer.role).not.toMatch(/risk-free/i);
    expect(WEAPON_INTEL.tracer.useCase).toMatch(/turn/i);
    expect(WEAPON_INTEL.tracer.useCase).toMatch(/ammunition/i);
  });
});
~~~~

### `client/src/ui/HUD.arsenal.test.ts`

~~~~typescript
/**
 * HUD.arsenal.test.ts — the owned-only + collapsible arsenal contract (#③).
 *
 * The strip used to render every implemented weapon and grey out the ones with
 * no ammo, which ate a lot of vertical space (worse on mobile, worse still as
 * weapons are added). Now it shows only weapons the active tank OWNS
 * (unlimited, or count > 0) plus whatever is currently selected, and the whole
 * grid can be collapsed behind its header.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD } from './HUD';
import { WEAPON_INTEL } from './weaponIntel';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';

function mount(): { root: HTMLElement; hud: HUD; state: GameState; engine: GameEngine } {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal);
  const engine = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  });
  return { root, hud, state: engine.getState(), engine };
}

function btn(root: HTMLElement, weapon: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`.st-hud__weapon-btn[data-weapon="${weapon}"]`);
}
function isHidden(el: Element | null): boolean {
  return !!el?.classList.contains('st-hud__weapon-btn--hidden');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('HUD arsenal — owned-only', () => {
  beforeEach(() => localStorage.clear());

  it('hides finite weapons the active tank does not own, keeps owned + unlimited', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((t) => t.id === state.activePlayerId)!;
    tank.inventory.missile = { count: 0, unlimited: false }; // spent → not owned
    tank.inventory.nuke = { count: 2, unlimited: false };    // owned
    hud.update(state);

    expect(isHidden(btn(root, 'missile'))).toBe(true);
    expect(isHidden(btn(root, 'nuke'))).toBe(false);
    expect(isHidden(btn(root, 'baby_missile'))).toBe(false); // unlimited, always shown
  });

  it('never hides the currently selected weapon, even at zero ammo', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((t) => t.id === state.activePlayerId)!;
    tank.inventory.nuke = { count: 0, unlimited: false };
    tank.selectedWeapon = 'nuke';
    hud.update(state);

    expect(isHidden(btn(root, 'nuke'))).toBe(false);
  });

  it('reveals a weapon once it is (re)acquired', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((t) => t.id === state.activePlayerId)!;
    tank.inventory.napalm = { count: 0, unlimited: false };
    hud.update(state);
    expect(isHidden(btn(root, 'napalm'))).toBe(true);

    tank.inventory.napalm = { count: 3, unlimited: false }; // bought
    hud.update(state);
    expect(isHidden(btn(root, 'napalm'))).toBe(false);
  });
});

describe('HUD arsenal - weapon intel', () => {
  beforeEach(() => localStorage.clear());

  function intel(root: HTMLElement): HTMLElement {
    return root.querySelector<HTMLElement>('.st-hud__weapon-intel')!;
  }

  it('opens with accessible intel for the selected weapon and live ammunition', () => {
    const { root, hud, state } = mount();
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const panel = intel(root);
    const selected = btn(root, 'baby_missile')!;
    expect(panel).toBeTruthy();
    expect(panel.dataset['weapon']).toBe('baby_missile');
    expect(panel.querySelector('.st-hud__weapon-intel-name')?.textContent).toBe('Baby Missile');
    expect(panel.querySelector('[data-intel-field="role"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.role);
    expect(panel.querySelector('[data-intel-field="terrain"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.terrain);
    expect(panel.querySelector('[data-intel-field="damage"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.damage);
    expect(panel.querySelector('[data-intel-field="useCase"] .st-hud__weapon-intel-value')?.textContent)
      .toBe(WEAPON_INTEL.baby_missile.useCase);
    expect(panel.querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('\u221e');
    expect(panel.getAttribute('role')).toBe('status');
    expect(panel.getAttribute('aria-live')).toBe('polite');
    expect(panel.tabIndex).toBe(0);
    const heading = panel.querySelector('h3');
    expect(heading?.textContent).toBe('Baby Missile');
    expect(heading?.id).toBeTruthy();
    expect(panel.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(root.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))
      .toBe(panel.parentElement?.id);
    expect(selected.getAttribute('aria-describedby')).toBe(panel.id);
    expect(panel.hidden).toBe(false);
  });

  it('previews focus and pointer without selecting, then restores the selected weapon', async () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.missile = { count: 4, unlimited: false };
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    const selected = vi.fn();
    hud.onWeaponSelect(selected);
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const missile = btn(root, 'missile')!;
    const dirtBomb = btn(root, 'dirt_bomb')!;
    missile.focus();
    expect(intel(root).dataset['weapon']).toBe('missile');
    expect(selected).not.toHaveBeenCalled();

    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('missile');

    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');
    expect(intel(root).querySelector('[data-intel-field="terrain"]')?.textContent)
      .toContain('Raises a mound');
    expect(selected).not.toHaveBeenCalled();

    dirtBomb.dispatchEvent(new Event('pointerleave'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(intel(root).dataset['weapon']).toBe('missile');
    missile.blur();
    expect(intel(root).dataset['weapon']).toBe('baby_missile');
    expect(selected).not.toHaveBeenCalled();
  });

  it('returns the dossier to its heading whenever keyboard, pointer, or touch changes weapons', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.missile = { count: 4, unlimited: false };
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    tank.inventory.tracer = { count: 3, unlimited: false };
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const panel = intel(root);
    panel.scrollTop = 37;
    btn(root, 'missile')!.focus();
    expect(panel.dataset['weapon']).toBe('missile');
    expect(panel.scrollTop).toBe(0);

    panel.scrollTop = 41;
    const dirtBomb = btn(root, 'dirt_bomb')!;
    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(panel.dataset['weapon']).toBe('dirt_bomb');
    expect(panel.scrollTop).toBe(0);

    btn(root, 'missile')!.blur();
    panel.scrollTop = 53;
    const tracer = btn(root, 'tracer')!;
    const touchDown = new Event('pointerdown');
    Object.defineProperty(touchDown, 'pointerType', { value: 'touch' });
    tracer.dispatchEvent(touchDown);
    tracer.click();
    expect(panel.dataset['weapon']).toBe('tracer');
    expect(panel.scrollTop).toBe(0);
  });

  it('restores selected intel after collapse instead of reopening a stale preview', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    hud.update(state);
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    toggle.click();

    const dirtBomb = btn(root, 'dirt_bomb')!;
    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');

    toggle.click();
    toggle.click();
    expect(intel(root).dataset['weapon']).toBe('baby_missile');
  });

  it('drops a transient preview when the active loadout changes or the weapon is hidden', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.dirt_bomb = { count: 2, unlimited: false };
    tank.inventory.missile = { count: 4, unlimited: false };
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();
    const dirtBomb = btn(root, 'dirt_bomb')!;

    dirtBomb.dispatchEvent(new Event('pointerdown'));
    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');

    tank.selectedWeapon = 'missile';
    hud.update(state);
    expect(intel(root).dataset['weapon']).toBe('missile');

    dirtBomb.dispatchEvent(new Event('pointermove'));
    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');
    tank.inventory.dirt_bomb.count = 0;
    hud.update(state);
    expect(intel(root).dataset['weapon']).toBe('missile');
  });

  it('does not mutate the polite live region for identical frame updates', async () => {
    const { root, hud, state } = mount();
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();
    const panel = intel(root);
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(panel, { attributes: true, characterData: true, childList: true, subtree: true });

    hud.update(state);
    hud.update(state);
    hud.update(state);
    await Promise.resolve();
    observer.disconnect();

    expect(mutations).toEqual([]);
  });

  it('keeps activated touch intel visible, updates ammo, and hides with the drawer', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.tracer = { count: 3, unlimited: false };
    hud.onWeaponSelect((weapon) => {
      tank.selectedWeapon = weapon;
    });
    hud.update(state);
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    toggle.click();

    btn(root, 'tracer')!.click();
    hud.update(state);
    expect(intel(root).dataset['weapon']).toBe('tracer');
    expect(intel(root).querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('3');

    tank.inventory.tracer.count = 2;
    hud.update(state);
    expect(intel(root).querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('2');

    toggle.click();
    expect(intel(root).hidden).toBe(true);
  });

  it('ignores touch pointer entry until the player activates a weapon', () => {
    const { root, hud, state } = mount();
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.inventory.sandhog = { count: 1, unlimited: false };
    hud.update(state);
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const touchMove = new Event('pointermove');
    Object.defineProperty(touchMove, 'pointerType', { value: 'touch' });
    btn(root, 'sandhog')!.dispatchEvent(touchMove);

    expect(intel(root).dataset['weapon']).toBe('baby_missile');
  });
});

describe('HUD arsenal — collapsible', () => {
  beforeEach(() => localStorage.clear());

  it('defaults a fresh combat shell to a closed drawer', () => {
    localStorage.removeItem('st_arsenal_collapsed');
    const { root, hud, state } = mount();
    hud.update(state);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
      .toBe(true);
    expect(root.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a saved expanded preference', () => {
    localStorage.setItem('st_arsenal_collapsed', '0');
    const { root, hud, state } = mount();
    hud.update(state);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-hud__strip--collapsed'))
      .toBe(false);
  });

  it('keeps a saved collapsed preference', () => {
    localStorage.setItem('st_arsenal_collapsed', '1');
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('treats an invalid stored preference as closed', () => {
    localStorage.setItem('st_arsenal_collapsed', 'invalid');
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses the closed default after a storage read failure', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the manual drawer state when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles the collapsed state when the header control is clicked', () => {
    const { root, hud, state } = mount();
    hud.update(state);
    const strip = root.querySelector('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    expect(toggle).toBeTruthy();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    toggle.click();
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
  });

  it('persists the expanded state across a fresh HUD (localStorage)', () => {
    const first = mount();
    first.hud.update(first.state);
    first.root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    // A brand-new HUD (e.g. a reload) should honor the player's open preference.
    const second = mount();
    second.hud.update(second.state);
    expect(second.root.querySelector('.st-hud__strip')!.classList.contains('st-hud__strip--collapsed')).toBe(false);
  });
});
~~~~

### `client/src/ui/HUD.shell.test.ts`

~~~~typescript
import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import { HUD } from './HUD';
import type { GameState } from '@shared/types/GameState';

interface MountedShell {
  root: HTMLElement;
  modal: HTMLElement;
  hud: HUD;
  state: GameState;
}

function mountHarness(): MountedShell {
  const root = document.createElement('div');
  const overlay = document.createElement('div');
  const modal = document.createElement('div');
  document.body.append(root, overlay, modal);
  const hud = new HUD(root, overlay, modal);
  const engine = new GameEngine({
    players: [
      { name: 'Alice', color: '#e84d4d' },
      { name: 'Bob', color: '#4d8ce8' },
    ],
    maxPlayers: 2,
    seed: 1,
  });
  const state = engine.getState();
  hud.update(state);
  return { root, modal, hud, state };
}

function mount(): HTMLElement {
  return mountHarness().root;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#st-hud-style')?.remove();
  localStorage.clear();
});

describe('HUD single-screen combat shell', () => {
  it('marks one shell and applies the shared section rhythm to every rail region', () => {
    const root = mount();
    const commandConsole = root.querySelector<HTMLElement>('.st-hud__command-console')!;

    expect(root.classList.contains('st-ui-shell')).toBe(true);
    expect(root.getAttribute('data-ui')).toBe('combat-rail');
    expect(root.querySelector('.st-hud__players')?.classList.contains('st-ui-section')).toBe(true);
    expect(root.querySelector('.st-hud__instruments')?.classList.contains('st-ui-section')).toBe(true);
    expect(commandConsole.classList.contains('st-ui-section')).toBe(true);
    expect(commandConsole.parentElement).toBe(root);
    expect(commandConsole.getAttribute('role')).toBe('region');
    expect(commandConsole.getAttribute('aria-label')).toBe('Turn command console');
    expect(commandConsole.querySelector('.st-hud__active-row')).not.toBeNull();
    expect(commandConsole.querySelector('.st-hud__aim')).not.toBeNull();
    expect(commandConsole.querySelector('.st-hud__turn-actions')).not.toBeNull();
    expect(root.querySelector('.st-hud__store-btn')?.classList.contains('st-ui-action')).toBe(true);
    expect(root.querySelector('.st-hud__primary-action')?.classList.contains('st-ui-action')).toBe(true);
    expect(root.querySelector('.st-hud__strip')?.classList.contains('st-ui-section')).toBe(true);
  });

  it('orders one current-turn decision console before secondary battle status', () => {
    const root = mount();
    const commandConsole = root.querySelector<HTMLElement>('.st-hud__command-console')!;
    const instruments = root.querySelector<HTMLElement>('.st-hud__instruments')!;
    const active = root.querySelector<HTMLElement>('.st-hud__active-row')!;
    const progress = root.querySelector<HTMLElement>('.st-hud__aim')!;
    const actions = root.querySelector<HTMLElement>('.st-hud__turn-actions')!;
    const roster = root.querySelector<HTMLElement>('.st-hud__players')!;

    expect([...commandConsole.children]).toEqual([
      active,
      instruments,
      progress,
      actions,
    ]);
    expect(instruments.parentElement).toBe(commandConsole);
    const persistentCombatRegions = [...root.children].filter(
      (child) => !child.classList.contains('st-hud__quick-chat'),
    );
    expect(persistentCombatRegions).toEqual([
      root.querySelector('.st-hud__menu'),
      root.querySelector('.st-hud__round'),
      commandConsole,
      roster,
      root.querySelector('.st-hud__strip'),
    ]);
    expect(commandConsole.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
  });

  it('keeps the selected weapon glyph synchronized inside a stable tactical tile', () => {
    const { root, hud, state } = mountHarness();
    const tile = root.querySelector<HTMLElement>('.st-hud__weapon')!;
    const iconHost = tile.querySelector<HTMLElement>('.st-hud__weapon-icon')!;

    expect(iconHost.querySelector('.st-weapon-icon')?.getAttribute('data-weapon'))
      .toBe('baby_missile');
    expect(tile.querySelector('.st-hud__weapon-value')?.textContent).toBe('Baby Missile');

    state.tanks[0]!.selectedWeapon = 'bouncing_betty';
    hud.update(state, false, true);

    expect(root.querySelector('.st-hud__weapon')).toBe(tile);
    expect(root.querySelector('.st-hud__weapon-icon')).toBe(iconHost);
    expect(iconHost.querySelector('.st-weapon-icon')?.getAttribute('data-weapon'))
      .toBe('bouncing_betty');
    expect(tile.querySelector('.st-hud__weapon-value')?.textContent).toBe('Bouncing Betty');
  });

  it('uses exact decorative SVG icons while visible text keeps actions named', () => {
    const root = mount();
    const menu = root.querySelector<HTMLButtonElement>('.st-hud__menu')!;
    const store = root.querySelector<HTMLButtonElement>('.st-hud__store-btn')!;
    const arsenal = root.querySelector<HTMLElement>('.st-hud__strip-title')!;
    const icons = root.querySelectorAll<SVGSVGElement>('svg.st-ui-icon');
    const glyphs = root.querySelectorAll<HTMLElement>('.st-ui-glyph');
    const iconNames = [...icons].map((icon) => icon.dataset['icon']);
    const iconSymbols = [...icons].map((icon) => icon.dataset['symbol']);
    const iconPaths = Object.fromEntries(
      [...icons].map((icon) => [
        icon.dataset['icon'],
        [...icon.querySelectorAll('path')].map((path) => path.getAttribute('d')),
      ]),
    );

    expect(menu.getAttribute('aria-label')).toBe('Menu');
    expect(menu.textContent).toContain('Menu');
    expect(store.getAttribute('aria-label')).toMatch(/Store/);
    expect(store.textContent).toContain('Store');
    expect(arsenal.textContent).toContain('Arsenal');
    expect(iconNames).toEqual(['menu', 'store', 'fire', 'arsenal', 'disclosure']);
    expect(iconSymbols).toEqual([
      'menu',
      'credits',
      'target',
      'ordnance',
      'disclosure',
    ]);
    expect([...glyphs].map((glyph) => glyph.dataset['glyph'])).toEqual([
      'menu',
      'store',
      'fire',
      'arsenal',
    ]);
    expect(iconPaths).toEqual({
      menu: ['M4 5h16', 'M4 12h16', 'M4 19h16'],
      store: [
        'M13.744 17.736a6 6 0 1 1-7.48-7.48',
        'M15 6h1v4',
        'm6.134 14.768.866-.5 2 3.464',
      ],
      fire: [],
      arsenal: [
        'M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95',
        'm22 2-1.5 1.5',
      ],
      disclosure: ['m6 9 6 6 6-6'],
    });
    expect(root.querySelector('[data-icon="store"] circle')?.getAttribute('r')).toBe('6');
    expect(root.querySelector('[data-icon="arsenal"] circle')?.getAttribute('r')).toBe('9');
    expect(
      root.querySelector('[data-icon="disclosure"]')?.closest('.st-ui-glyph'),
    ).toBeNull();
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('focusable')).toBe('false');
    }
  });

  it('exposes the arsenal as a controlled in-rail drawer', () => {
    const root = mount();
    const strip = root.querySelector<HTMLElement>('.st-hud__strip')!;
    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;
    const body = root.querySelector<HTMLElement>('.st-hud__strip-body')!;
    const grid = root.querySelector<HTMLElement>('.st-hud__strip-grid')!;
    const intel = root.querySelector<HTMLElement>('.st-hud__weapon-intel')!;

    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);
    expect(strip.getAttribute('data-ui')).toBe('arsenal-drawer');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expand arsenal');
    expect(toggle.textContent).toContain('Expand');
    expect(toggle.getAttribute('aria-controls')).toBe(body.id);
    expect(body.contains(grid)).toBe(true);
    expect(body.contains(intel)).toBe(true);
    expect(grid.id).not.toBe('');
    expect(grid.getAttribute('role')).toBe('region');
    expect(grid.getAttribute('aria-label')).toBe('Weapon arsenal');

    toggle.click();
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse arsenal');
    expect(toggle.textContent).toContain('Close');
    for (const sibling of [...root.children]) {
      if (sibling !== strip) expect((sibling as HTMLElement).inert).toBe(true);
    }

    const firstWeapon = grid.querySelector<HTMLButtonElement>('.st-hud__weapon-btn')!;
    firstWeapon.focus();
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    for (const sibling of [...root.children]) {
      if (sibling !== strip) expect((sibling as HTMLElement).inert).toBe(false);
    }

    toggle.click();
    toggle.click();
    expect(toggle.getAttribute('aria-label')).toBe('Expand arsenal');
    expect(toggle.textContent).toContain('Expand');
  });

  it('keeps each drawer control relationship unique across HUD instances', () => {
    const first = mount();
    const second = mount();
    const firstBody = first.querySelector<HTMLElement>('.st-hud__strip-body')!;
    const secondBody = second.querySelector<HTMLElement>('.st-hud__strip-body')!;
    const firstGrid = first.querySelector<HTMLElement>('.st-hud__strip-grid')!;
    const secondGrid = second.querySelector<HTMLElement>('.st-hud__strip-grid')!;

    expect(firstBody.id).not.toBe(secondBody.id);
    expect(firstGrid.id).not.toBe(secondGrid.id);
    expect(first.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))
      .toBe(firstBody.id);
    expect(second.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))
      .toBe(secondBody.id);
  });

  it('preserves weapon selection and store behavior through the shell controls', () => {
    const { root, modal, hud, state } = mountHarness();
    const selected: string[] = [];
    hud.onWeaponSelect((weapon) => selected.push(weapon));
    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();

    const missile = root.querySelector<HTMLButtonElement>(
      '.st-hud__weapon-btn[data-weapon="missile"]',
    )!;
    missile.click();
    expect(selected).toEqual(['missile']);
    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;
    tank.selectedWeapon = 'missile';
    hud.update(state);
    expect(missile.classList.contains('st-hud__weapon-btn--active')).toBe(true);
    expect(missile.getAttribute('aria-pressed')).toBe('true');
    expect(
      root.querySelector<HTMLButtonElement>(
        '.st-hud__weapon-btn[data-weapon="baby_missile"]',
      )!.getAttribute('aria-pressed'),
    ).toBe('false');

    const strip = root.querySelector('.st-hud__strip')!;
    const store = modal.querySelector('.st-hud__store')!;
    root.querySelector<HTMLButtonElement>('.st-hud__store-btn')!.click();
    expect(store.classList.contains('st-hud__store--hidden')).toBe(false);
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    modal.querySelector<HTMLButtonElement>('.st-hud__store-close')!.click();
    expect(store.classList.contains('st-hud__store--hidden')).toBe(true);
    expect(strip.classList.contains('st-hud__strip--open')).toBe(true);
    expect(missile.classList.contains('st-hud__weapon-btn--active')).toBe(true);
  });
});
~~~~

### `e2e/weapon-intel.spec.ts`

~~~~typescript
import { test, expect } from '@playwright/test';
import { gotoRunningGame } from './support';

test.describe('weapon intel battlefield composition', () => {
  test('previews tactics through the active input mode and stays inside the arsenal layer', async ({
    page,
  }, testInfo) => {
    await gotoRunningGame(page);
    const hud = page.locator('#hud');
    const drawer = page.locator('.st-hud__strip');
    const panel = page.locator('.st-hud__weapon-intel');
    const before = await hud.evaluate((node) => node.scrollHeight);

    const openArsenal = page.getByRole('button', { name: 'Expand arsenal' });
    if (testInfo.project.name === 'pixel-touch') await openArsenal.tap();
    else await openArsenal.click();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-weapon', 'baby_missile');
    await expect(panel).toContainText('Reliable precision shot');
    const scrollDossierToBottom = () => panel.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      return node.scrollTop;
    });
    const expectHeadingVisible = async (name: string) => {
      const visibility = await panel.evaluate((node, expectedName) => {
        const heading = node.querySelector<HTMLElement>('.st-hud__weapon-intel-name')!;
        const panelRect = node.getBoundingClientRect();
        const headingRect = heading.getBoundingClientRect();
        return {
          name: heading.textContent,
          scrollTop: node.scrollTop,
          visible: headingRect.top >= panelRect.top && headingRect.bottom <= panelRect.bottom,
        };
      }, name);
      expect(visibility).toEqual({ name, scrollTop: 0, visible: true });
    };
    const missile = page.locator('.st-hud__weapon-btn[data-weapon="missile"]');
    await expect(missile).toBeVisible();
    if (testInfo.project.name === 'pixel-touch') {
      expect(await scrollDossierToBottom()).toBeGreaterThan(0);
      await missile.tap();
      await expect(panel).toHaveAttribute('data-weapon', 'missile');
      await expectHeadingVisible('Missile');
      await expect(page.locator('.st-hud__weapon-value')).toHaveText('Missile');
    } else {
      await page.getByRole('button', { name: 'Collapse arsenal' }).focus();
      await page.keyboard.press('Tab');
      await expect(panel).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('.st-hud__weapon-btn[data-weapon="baby_missile"]')).toBeFocused();
      if (testInfo.project.name === 'small-window') {
        expect(await scrollDossierToBottom()).toBeGreaterThan(0);
      }
      await page.keyboard.press('Tab');
      await expect(missile).toBeFocused();
      await expect(panel).toHaveAttribute('data-weapon', 'missile');
      if (testInfo.project.name === 'small-window') await expectHeadingVisible('Missile');
      await expect(panel).toContainText('Balanced direct attack');

      const dirtBomb = page.locator('.st-hud__weapon-btn[data-weapon="dirt_bomb"]');
      await expect(dirtBomb).toBeVisible();
      await missile.click();
      if (testInfo.project.name === 'small-window') {
        expect(await scrollDossierToBottom()).toBeGreaterThan(0);
      }
      const beforeHover = await panel.boundingBox();
      await dirtBomb.hover();
      const afterHover = await panel.boundingBox();
      expect(afterHover?.y).toBeCloseTo(beforeHover!.y, 0);
      if (testInfo.project.name === 'small-window') {
        expect(afterHover?.height).toBeCloseTo(beforeHover!.height, 0);
      }
      await expect(panel).toHaveAttribute('data-weapon', 'dirt_bomb');
      if (testInfo.project.name === 'small-window') await expectHeadingVisible('Dirt Bomb');
      await expect(panel).toContainText('Raises a mound');
      await missile.hover();
      await expect(panel).toHaveAttribute('data-weapon', 'missile');

      const snapshotPointerLayout = () => page.evaluate(() => {
        const panelNode = document.querySelector<HTMLElement>('.st-hud__weapon-intel')!;
        const gridNode = document.querySelector<HTMLElement>('.st-hud__strip-grid')!;
        const buttons = [...document.querySelectorAll<HTMLElement>('.st-hud__weapon-btn')]
          .filter((node) => getComputedStyle(node).display !== 'none')
          .map((node) => ({
            weapon: node.dataset['weapon'],
            offsetTop: node.offsetTop,
            offsetLeft: node.offsetLeft,
            offsetWidth: node.offsetWidth,
            offsetHeight: node.offsetHeight,
          }));
        return {
          panelHeight: panelNode.offsetHeight,
          gridTop: gridNode.offsetTop,
          gridHeight: gridNode.clientHeight,
          buttons,
        };
      });
      const pointerLayout = await snapshotPointerLayout();
      const visibleWeapons = page.locator('.st-hud__weapon-btn:not(.st-hud__weapon-btn--hidden)');
      for (let index = 0; index < await visibleWeapons.count(); index += 1) {
        const weaponButton = visibleWeapons.nth(index);
        const type = await weaponButton.getAttribute('data-weapon');
        const box = await weaponButton.boundingBox();
        await panel.evaluate((node) => {
          const tracked = node as HTMLElement & {
            weaponIntelObserver?: MutationObserver;
            weaponIntelTransitions?: string[];
          };
          tracked.weaponIntelTransitions = [];
          tracked.weaponIntelObserver?.disconnect();
          tracked.weaponIntelObserver = new MutationObserver((records) => {
            if (records.some((record) => record.type === 'attributes')) {
              tracked.weaponIntelTransitions!.push(tracked.dataset['weapon'] ?? '');
            }
          });
          tracked.weaponIntelObserver.observe(tracked, {
            attributes: true,
            attributeFilter: ['data-weapon'],
          });
        });
        await weaponButton.hover({ position: { x: box!.width / 2, y: Math.min(4, box!.height / 2) } });
        await expect(panel).toHaveAttribute('data-weapon', type!);
        await page.waitForTimeout(50);
        await expect(panel).toHaveAttribute('data-weapon', type!);
        const transitions = await panel.evaluate((node) => {
          const tracked = node as HTMLElement & {
            weaponIntelObserver?: MutationObserver;
            weaponIntelTransitions?: string[];
          };
          tracked.weaponIntelObserver?.disconnect();
          return tracked.weaponIntelTransitions ?? [];
        });
        expect(transitions.length).toBeLessThanOrEqual(1);
        if (transitions.length === 1) expect(transitions[0]).toBe(type);
        expect(await snapshotPointerLayout()).toEqual(pointerLayout);
      }
    }

    const geometry = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect().toJSON();
      const hudNode = document.querySelector<HTMLElement>('#hud')!;
      const panelNode = document.querySelector<HTMLElement>('.st-hud__weapon-intel')!;
      const targets = [...document.querySelectorAll<HTMLElement>('.st-hud__weapon-btn')]
        .filter((node) => node.getBoundingClientRect().height > 0)
        .map((node) => node.getBoundingClientRect().height);
      const app = document.querySelector<HTMLElement>('#app')!;
      const zoom = Number.parseFloat(getComputedStyle(app).zoom || '1');
      const physicalFontSize = (selector: string) =>
        Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(selector)!).fontSize) * zoom;
      return {
        drawer: rect('.st-hud__strip'),
        panel: rect('.st-hud__weapon-intel'),
        canvas: rect('#game'),
        hudScrollHeight: hudNode.scrollHeight,
        panelClientWidth: panelNode.clientWidth,
        panelScrollWidth: panelNode.scrollWidth,
        panelClientHeight: panelNode.clientHeight,
        panelScrollHeight: panelNode.scrollHeight,
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        targets,
        fonts: {
          name: physicalFontSize('.st-hud__weapon-intel-name'),
          ammo: physicalFontSize('.st-hud__weapon-intel-ammo'),
          label: physicalFontSize('.st-hud__weapon-intel-label'),
          value: physicalFontSize('.st-hud__weapon-intel-value'),
        },
      };
    });

    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.drawer.left - 1);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.drawer.right + 1);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.drawer.top - 1);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.drawer.bottom + 1);
    expect(geometry.drawer.left).toBeGreaterThanOrEqual(geometry.canvas.right - 1);
    expect(geometry.hudScrollHeight).toBe(before);
    expect(geometry.panelScrollWidth).toBeLessThanOrEqual(geometry.panelClientWidth + 1);
    if (testInfo.project.name === 'desktop-fine') {
      expect(geometry.panelScrollHeight).toBeLessThanOrEqual(geometry.panelClientHeight + 1);
    } else {
      expect(geometry.panelClientHeight).toBeGreaterThan(0);
    }
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    if (testInfo.project.name === 'pixel-touch') {
      expect(Math.min(...geometry.targets)).toBeGreaterThanOrEqual(44);
    }
    if (testInfo.project.name === 'pixel-touch' || testInfo.project.name === 'small-window') {
      expect(geometry.fonts.name).toBeGreaterThanOrEqual(11.5);
      expect(geometry.fonts.ammo).toBeGreaterThanOrEqual(9.5);
      expect(geometry.fonts.label).toBeGreaterThanOrEqual(8.5);
      expect(geometry.fonts.value).toBeGreaterThanOrEqual(10.5);
    }
  });
});
~~~~

## Exact final review-target diff

Decode the following JSON string as UTF-8 text to recover the exact complete unified diff.

~~~~json
"diff --git a/.codearbiter/open-tasks.md b/.codearbiter/open-tasks.md\nindex b1b40d4..ff884f0 100644\n--- a/.codearbiter/open-tasks.md\n+++ b/.codearbiter/open-tasks.md\n@@ -161,6 +161,8 @@ Decision forks split to `open-questions.md` (CONFIRM-04 rate-limiting, CONFIRM-0\n \n - (Possible-later, from room-browser-enrichment spec 2026-06-22) Surface `interestRate` / `suddenDeathTurn` on the public browse row too, now that `StoredOptions` declares them. Pure read-path addition mirroring the rounds/armsLevel/botCount work. [L/S]\n ## In-flight\n+- [x] ux.hud.0002 - Show battlefield-safe tactical intel for every arsenal weapon on focus or selection across mouse, keyboard, and touch  (from post-remediation-adversarial-player-audit-2026-08-10)  (done 2026-08-10)\n+  - Boundaries: client, hud, weapon-presentation\n - [x] ux.pregame.0006 - Keep the full persistent commander identity, level, and next XP milestone legible in the pre-game command header across desktop and compact layouts without changing authentication or progression rules.  (from live-production-commander-dossier-audit-2026-08-10)  (done 2026-08-10)\n   - Boundaries: client, pregame-ux, account-presentation\n - [x] ux.pregame.0005 - Present Quick Duel, Local Battle, and Play Online as a focused deployment chooser before revealing either setup flow.  (from adversarial-player-experience-followup-2026-08-10)  (done 2026-08-10)\ndiff --git a/.codearbiter/plans/weapon-intel-panel.md b/.codearbiter/plans/weapon-intel-panel.md\nnew file mode 100644\nindex 0000000..ae649d3\n--- /dev/null\n+++ b/.codearbiter/plans/weapon-intel-panel.md\n@@ -0,0 +1,80 @@\n+# Weapon Intel Panel Implementation Plan\n+\n+> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.\n+\n+**Goal:** Make every implemented arsenal weapon understandable before a player spends ammunition.\n+\n+**Architecture:** Add one exhaustive client-only tactical-copy catalog and render it through one persistent region inside the existing arsenal drawer. HUD events preview focused or pointed weapons, while the selected weapon remains the stable fallback. No engine or action behavior changes.\n+\n+**Tech Stack:** TypeScript, DOM, CSS injected by `HUD.ts`, Vitest/jsdom, Playwright/Chromium.\n+\n+## Global Constraints\n+\n+- Work test-first and preserve the RED output before production edits.\n+- Keep the feature inside the existing arsenal drawer; no tooltip, popover, or modal.\n+- Cover every implemented `WeaponType` exhaustively.\n+- Support mouse, keyboard, and touch without changing weapon selection semantics.\n+- Keep drawer, HUD, and page geometry contained in desktop-fine, pixel-touch, and small-window.\n+- Do not touch engine, network, Supabase, auth, progression, dependencies, assets, schemas, or migrations.\n+\n+---\n+\n+### Task 1: Exhaustive tactical intel catalog\n+\n+**Files:**\n+- Create: `client/src/ui/weaponIntel.ts`\n+- Create: `client/src/ui/weaponIntel.test.ts`\n+\n+**Interfaces:**\n+- Produces: `WeaponIntel` and `WEAPON_INTEL: Record<WeaponType, WeaponIntel>` with `role`, `terrain`, `damage`, and `useCase` strings.\n+\n+- [ ] Write a failing unit test that iterates the implemented keys in `WEAPONS`, requires an exactly matching intel key set, and requires every field to be non-empty and concise.\n+- [ ] Run `npm test --workspace client -- --run client/src/ui/weaponIntel.test.ts` and record the expected module-not-found RED.\n+- [ ] Add the exhaustive authored catalog with qualitative, player-facing tactical copy for all 18 implemented weapons.\n+- [ ] Re-run the focused test and keep it green.\n+\n+### Task 2: Input-complete arsenal dossier behavior\n+\n+**Files:**\n+- Modify: `client/src/ui/HUD.ts`\n+- Modify: `client/src/ui/HUD.arsenal.test.ts`\n+\n+**Interfaces:**\n+- Consumes: `WEAPON_INTEL`.\n+- Produces: `.st-hud__weapon-intel` with named fields and live ammo; every weapon button receives `aria-describedby`.\n+\n+- [ ] Add failing HUD tests for selected default content, keyboard focus preview, pointer preview and selected fallback, click persistence, live ammo updates, accessible description wiring, and hidden-with-collapsed behavior.\n+- [ ] Run `npm test --workspace client -- --run client/src/ui/HUD.arsenal.test.ts` and record assertion RED caused by the absent dossier.\n+- [ ] Build one dossier below the arsenal grid, cache its field nodes, and add focused preview helpers without rebuilding per frame.\n+- [ ] Wire `focus`, `pointerenter`, `pointerleave`, and the existing click listener so previews never emit selection and click emits selection exactly once.\n+- [ ] Reconcile selected fallback and live ammunition in `syncStrip`; preserve Escape focus return and collapse state.\n+- [ ] Re-run both focused Vitest files and keep them green.\n+\n+### Task 3: Battlefield-safe responsive composition\n+\n+**Files:**\n+- Modify: `client/src/ui/HUD.ts` (injected HUD CSS)\n+- Create: `e2e/weapon-intel.spec.ts`\n+\n+**Interfaces:**\n+- Consumes: dossier DOM from Task 2.\n+- Produces: fitted drawer composition across the existing Playwright project matrix.\n+\n+- [ ] Add a Playwright test that opens the arsenal, proves selected intel, exercises pointer preview on desktop, focus preview on fine-pointer projects, and touch selection on pixel-touch.\n+- [ ] Assert computed geometry: dossier inside drawer and viewport, drawer disjoint from the canvas, no page overflow, no increase in `#hud` scroll height, and 44-pixel weapon targets on touch.\n+- [ ] Run `npm run test:e2e -- --grep \"weapon intel\"` and record the expected RED before CSS/behavior completion.\n+- [ ] Add compact dossier layout, restrained qualitative labels, and bounded overflow inside the existing drawer.\n+- [ ] Re-run the focused browser test and affected `hud-layout` guardrails across all projects.\n+\n+### Task 4: Verification and review package\n+\n+**Files:**\n+- Create: `.codearbiter/reports/2026-08-10-weapon-intel-panel-sprint-evidence.md`\n+- Create: `.codearbiter/reports/2026-08-10-weapon-intel-panel-final-review-package.md`\n+- Modify via `$ca-task`: `.codearbiter/open-tasks.md`\n+\n+- [ ] Run focused unit and browser suites, client suite, typecheck, deterministic harness, build, dependency audit, and the complete Playwright matrix.\n+- [ ] Record RED/GREEN evidence, SMARTS decisions, test results, and the exact final staged diff hash in sprint evidence.\n+- [ ] Assemble the exact spec, plan, audit, evidence, tests, and final diff in one adversarial review package.\n+- [ ] Dispatch one fresh adversarial reviewer; resolve every Critical, High, and other merge-blocking finding and regenerate exact-head review evidence after any correction.\n+- [ ] Mark `ux.hud.0002` done through `$ca-task`, route through `$ca-commit` and `$ca-pr`, require hosted CI green on the exact reviewed head, merge under standing authority, verify Pages production, and write the delivery receipt.\ndiff --git a/.codearbiter/reports/2026-08-10-post-remediation-adversarial-player-audit.md b/.codearbiter/reports/2026-08-10-post-remediation-adversarial-player-audit.md\nnew file mode 100644\nindex 0000000..25150d3\n--- /dev/null\n+++ b/.codearbiter/reports/2026-08-10-post-remediation-adversarial-player-audit.md\n@@ -0,0 +1,30 @@\n+# Post-remediation adversarial player audit\n+\n+Date: 2026-08-10\n+Production head: `e154aebeb42fb5efde17e18b796ee9ed0e816377`\n+Production URL: `https://suadtl.github.io/singedTerra/`\n+Reviewer: Beauvoir the 2nd (`019fedf0-c16a-7dd1-b53a-ac21aa3371ef`)\n+Scope: player enjoyment, comprehension, and return motivation only; no security, cheating, or source-quality review\n+\n+## Grade\n+\n+**B-**, up from the prior **C+**.\n+\n+The reviewer confirmed that the completed remediation campaign materially improved the game: Quick Duel reaches play immediately, post-impact feedback supports shot correction, the combat HUD has a clear hierarchy, mobile presents one coherent handoff, and progression is visible.\n+\n+## Remaining player findings\n+\n+1. **Weapon variety is opaque.** The arsenal exposes a deep set of distinct weapons, but its controls provide only names and ammunition counts. Purpose, behavior, terrain interaction, damage character, and suggested use are hidden behind experiments that consume scarce ammunition.\n+2. **Progression is legible but not yet motivating.** Player Record shows level and XP remaining, but does not say what the next level changes or earns.\n+3. **Quick Duel teaches controls, not tactics.** The Command Deck says which inputs to use, but gives a new player no reason to move beyond Baby Missile.\n+4. **The returning-player loop is still mostly another duel.** The simulation provides terrain, wind, vehicle, and weapon variation, but no earned identity, unlock, challenge, or concrete promise attached to the next match.\n+\n+## Recommended next bounded slice\n+\n+**Weapon Intel Panel** - High impact, Medium effort.\n+\n+When an arsenal weapon receives focus or selection, show compact battlefield-safe guidance covering tactical role, terrain interaction, damage or blast character, ammunition, and one concise use case. Cover every implemented weapon and support mouse, keyboard, and touch. A first-time player must be able to inspect an unfamiliar weapon and explain when to use it before firing, without obscuring the battlefield or adding another modal.\n+\n+## Disposition\n+\n+Accepted as task `ux.hud.0002` and selected as the next sprint slice. The progression and replay-loop findings remain inputs to future SMARTS selection after this slice ships.\ndiff --git a/.codearbiter/reports/2026-08-10-weapon-intel-panel-adversarial-review.md b/.codearbiter/reports/2026-08-10-weapon-intel-panel-adversarial-review.md\nnew file mode 100644\nindex 0000000..5035a4f\n--- /dev/null\n+++ b/.codearbiter/reports/2026-08-10-weapon-intel-panel-adversarial-review.md\n@@ -0,0 +1,37 @@\n+# Weapon Intel Panel adversarial review record\n+\n+Date: 2026-08-10\n+Reviewer: Darwin the 2nd (`019fee12-d47d-7073-b81d-ebf698f81b49`)\n+Reviewed serialized-diff blob: `3f006a1a98048f2ef151b219c688b1d7d830b9d0`\n+Initial verdict: **BLOCK**\n+\n+## Findings and dispositions\n+\n+1. **High - compact typography unreadable.** Corrected with zoom-derived physical font floors, a one-column compact dossier, and Pixel/small-window rendered-size assertions.\n+2. **High - polite live region rewritten every frame.** Corrected with weapon/ammunition render caches and a MutationObserver regression proving identical frame updates produce no mutations.\n+3. **Medium, merge-blocking - stale transient preview survives collapse/loadout changes.** Corrected by clearing focus/pointer state on collapse, expansion, selected-loadout changes, and hidden previews; covered for collapse, loadout change, and depletion.\n+4. **Medium, merge-blocking - pointer state overrides keyboard authority.** Corrected with explicit keyboard/pointer modality arbitration. Keyboard focus remains authoritative until pointer-down changes modality; unit and actual-Tab browser coverage enforce it.\n+5. **Medium, merge-blocking - missing accessible heading.** Corrected with an `h3` and `aria-labelledby` relationship; asserted semantically.\n+6. **Medium, merge-blocking - Tracer called risk-free despite consuming a turn and ammunition.** Corrected to state the non-damaging effect and explicit cost.\n+7. **Medium, merge-blocking - mutation-resistant coverage incomplete.** Corrected with exact assertions for every rendered field, actual keyboard traversal, compact physical type floors, transient reset tests, and same-frame mutation coverage.\n+8. **Low - toggle controls only the grid.** Corrected with a shared drawer-body wrapper containing both dossier and weapon grid; `aria-controls` now targets that wrapper.\n+\n+All Critical, High, and merge-blocking findings require a corrected frozen package and fresh adversarial verdict before commit.\n+\n+## Corrected-package re-review\n+\n+Reviewed serialized-diff blob: `2cf97e4d062f122cde9122e3ac41254d88623269`\n+Verdict: **BLOCK**\n+\n+The reviewer independently cleared every first-pass finding, then found one remaining High and one merge-blocking Medium: noncompact desktop dossier copy still had content-driven height, moving weapon targets by up to 23.6 rendered pixels and allowing edge hover to announce Heavy Missile then fall back while the pointer remained over that button; browser coverage checked height stability only on compact fine-pointer layouts.\n+\n+Disposition: corrected with an invariant 180-logical-pixel desktop dossier inside the full-height rail drawer. The browser contract now edge-previews every visible fine-pointer weapon, waits for fallback races, requires the dossier/grid/button layout snapshot to remain exact, requires the hovered weapon to remain authoritative, and observes at most one `data-weapon` transition. Pointer leave/move fallback is coalesced so moving between buttons cannot announce an intermediate focused selection. The three-project focused contract and broader compact HUD/Sandhog matrix are green; a new frozen package and verdict remain required.\n+\n+## Second corrected-package re-review\n+\n+Reviewed serialized-diff blob: `43cf83769c369099ec82461a30d603e8152ffb0b`\n+Verdict: **BLOCK**\n+\n+The reviewer independently cleared both second-pass findings, then found one remaining merge-blocking Medium: changing weapons preserved the previous dossier's internal scroll position. On compact mouse and touch layouts, a player who had read to the bottom could select a new weapon and land midway through its guidance with the identifying heading offscreen.\n+\n+Disposition: corrected by resetting the dossier scroll position only when the rendered weapon changes. A causal unit regression covers keyboard focus, pointer preview, and touch activation. Production-bundle browser coverage scrolls the compact dossier to the bottom, changes weapons through keyboard, pointer, and touch paths, and requires `scrollTop === 0` with the new heading fully visible. The focused compact browser contract passes 2/2 and the complete matrix passes 258 with 30 intentional project skips; a new frozen package and verdict remain required.\ndiff --git a/.codearbiter/reports/2026-08-10-weapon-intel-panel-sprint-evidence.md b/.codearbiter/reports/2026-08-10-weapon-intel-panel-sprint-evidence.md\nnew file mode 100644\nindex 0000000..25ec6da\n--- /dev/null\n+++ b/.codearbiter/reports/2026-08-10-weapon-intel-panel-sprint-evidence.md\n@@ -0,0 +1,100 @@\n+# Weapon Intel Panel sprint evidence\n+\n+Date: 2026-08-10\n+Task: `ux.hud.0002`\n+Branch: `codex/weapon-intel-panel`\n+Merge base: `e154aebeb42fb5efde17e18b796ee9ed0e816377`\n+Status: third adversarial review blocked stale dossier scroll; correction fully verified; final adversarial verdict pending\n+\n+## Scoped sprint log\n+\n+The repository's canonical `.codearbiter/sprint-log.md` remains intentionally untouched because its pre-existing malformed UTF-8 state is governed as a preservation constraint. This scoped report is the recovery and decision ledger for this slice and is included verbatim in the final adversarial package.\n+\n+### Auto-decision 1 - presentation surface\n+\n+- Options: inline arsenal dossier; transient tooltip; battlefield modal or popover.\n+- SMARTS verdict: inline dossier.\n+- Strength: strong; confidence: high.\n+- Rationale: strongest accessibility, touch persistence, layer safety, reversibility, and testability. A modal would cover the context needed to judge the shot; a tooltip would fail touch comparison.\n+- Intent: post-remediation adversarial audit plus the user's standing player-experience priority.\n+\n+### Auto-decision 2 - tactical copy source\n+\n+- Options: expose exact engine constants; compute prose from weapon definitions; author stable qualitative guidance.\n+- SMARTS verdict: exhaustive authored qualitative catalog in `weaponIntel.ts`.\n+- Strength: strong; confidence: high.\n+- Rationale: compile-time exhaustiveness without turning ordinary balance tuning into stale player promises. Live ammunition remains state-derived.\n+- Intent: sprint spec.\n+\n+### Auto-decision 3 - compact drawer composition\n+\n+- Options: shrink weapon targets; clip the dossier beneath the grid; keep the dossier fixed and make the weapon grid internally scrollable.\n+- SMARTS verdict: fixed dossier above an internally scrollable grid.\n+- Strength: strong; confidence: high.\n+- Rationale: preserves the real 44-pixel touch floor, keeps guidance visible during comparison, and contains the drawer without covering the battlefield.\n+- Intent: causal Pixel 5 geometry RED and the sprint's battlefield-safe requirement.\n+\n+### Auto-decision 4 - pointer preview trigger\n+\n+- Options: `pointerenter`; `pointermove`; click-only preview.\n+- SMARTS verdict: non-touch `pointermove`, keyboard `focus`, touch activation.\n+- Strength: strong; confidence: high.\n+- Rationale: opening the drawer reflowed a button beneath the pointer and generated an accidental `pointerenter` preview. Requiring actual mouse movement preserves hover intent; touch remains activation-driven and keyboard remains focus-driven.\n+- Intent: causal real-browser and unit regressions.\n+\n+### Auto-decision 5 - physically readable compact typography\n+\n+- Options: accept whole-stage shrinkage; counter-scale the dossier outside the drawer; derive logical type sizes from the live stage zoom and use a one-column compact dossier.\n+- SMARTS verdict: zoom-derived physical type floors inside the existing drawer.\n+- Strength: strong; confidence: high.\n+- Rationale: retains battlefield containment and the existing layer model while guaranteeing readable rendered type on both compact projects. Counter-scaling would escape the rail and recreate the overlay defect this sprint exists to prevent.\n+- Intent: adversarial review High finding 1 and measured 3.42-6.15 pixel compact copy.\n+\n+### Auto-decision 6 - stable compact interaction geometry\n+\n+- Options: let the dossier auto-size; reserve a fixed dossier and let the drawer shrink-wrap it; make the open drawer own the rail height, reserve a scrollable dossier region, and give the weapon grid the remainder.\n+- SMARTS verdict: full-height in-rail drawer with independent dossier and weapon-grid scroll regions.\n+- Strength: strong; confidence: high.\n+- Rationale: physically readable copy cannot fit the 129-pixel rendered rail without vertical scrolling. Owning the rail height prevents copy changes from moving pointer targets, preserves 44-pixel touch controls, and keeps every layer inside the rail instead of over the battlefield.\n+- Intent: causal full-browser RED where compact hover reflow canceled Sandhog selection and a shrink-wrapped drawer assigned the grid zero height.\n+\n+## Test-first evidence\n+\n+1. **Catalog RED:** `npm test --workspace client -- --run src/ui/weaponIntel.test.ts` failed because `./weaponIntel` did not exist.\n+2. **Catalog GREEN:** the same command passed 1/1 after the exhaustive 18-weapon mapping was added.\n+3. **HUD RED:** `HUD.arsenal.test.ts` produced three dossier failures because no panel, preview state, or live ammunition existed.\n+4. **HUD GREEN:** catalog plus arsenal tests pass 16/16, including selected fallback, focus, mouse movement, touch activation, live ammo, collapse, accessible description, and touch-hover suppression.\n+5. **Geometry RED:** the unstyled Pixel 5 panel extended to `318.875` while the drawer ended at `287.140625`.\n+6. **Touch target RED:** the initially fitted treatment left scaled weapon controls at `21.484375` rendered pixels instead of the promised 44.\n+7. **Pointer race RED:** a real compact opening could preview Sandhog without player intent; the causal unit regression received `sandhog` instead of `baby_missile`.\n+8. **Browser GREEN:** the final focused matrix passes 3/3 with dossier containment, canvas separation, no document or HUD overflow, correct mouse/keyboard/touch behavior, and at least 44 rendered pixels per Pixel 5 weapon target.\n+9. **Adversarial correction RED:** the first frozen-package review measured compact copy at 3.42-6.15 rendered pixels, observed 60 same-value live-region assignments, and blocked stale preview, keyboard authority, semantic heading, Tracer wording, ARIA ownership, and mutation-resistant coverage.\n+10. **Correction unit RED:** the expanded catalog/HUD run failed 5 assertions for heading semantics, keyboard focus authority, collapse reset, repeated-update live-region mutations, and Tracer tradeoff copy.\n+11. **Correction unit GREEN:** focused catalog/HUD tests pass 20/20 after cached rendering, transient-state reset, input-modality arbitration, semantic region naming, full-field assertions, and honest Tracer guidance.\n+12. **Correction browser GREEN:** the production-bundle matrix passes 3/3 with actual Tab navigation, compact physical font floors, 44-pixel touch targets, drawer containment, and no page/HUD overflow.\n+13. **Compact interaction RED:** the first corrected full matrix passed 254/258 but four compact Sandhog selections failed because pointer preview changed dossier height before pointer-down. A first fixed-height attempt then exposed a zero-height weapon grid because the drawer shrink-wrapped its contents.\n+14. **Compact interaction GREEN:** the open drawer now owns the available rail height, the readable dossier occupies a stable focusable scroll region, and the weapon grid scrolls in the remainder. The affected compact HUD/Sandhog matrix passes 42 with 12 intentional project skips; the complete matrix passes 258 with 30 intentional project skips.\n+15. **Desktop edge-hover RED:** corrected-package re-review reproduced up to 23.6 rendered pixels of desktop target movement and an edge hover that announced Heavy Missile then fell back to Baby Missile. The exhaustive fine-pointer browser regression failed with changed dossier/grid/button geometry, and its transition observer caught two weapon announcements while moving between targets.\n+16. **Desktop edge-hover GREEN:** the base dossier now reserves invariant height, every visible desktop and compact fine-pointer weapon survives a 4-pixel edge hover with an exact layout snapshot, and pointer leave/move is coalesced to at most one weapon transition. The focused three-project matrix passes 3/3 and the broader compact HUD/Sandhog matrix passes 42 with 12 intentional skips.\n+17. **Dossier scroll RED:** the second corrected-package review reproduced a new weapon opening at `scrollTop` 42.29 on compact fine pointer and 151.54 on Pixel touch. The causal unit regression then failed with the old scroll position of 37 after keyboard focus changed the weapon.\n+18. **Dossier scroll GREEN:** the dossier now resets to its heading only when the rendered weapon changes. Unit coverage proves keyboard, pointer, and touch paths; compact production-bundle coverage scrolls to the bottom before each change and requires zero scroll plus a fully visible new heading.\n+\n+One invalid browser run reached an unrelated codeArbiter service already occupying port 4173; it was rejected as evidence and that process was not touched. A later full-matrix run against a preview built without E2E Supabase variables produced fixture-only failures; it too was rejected and rerun against a same-origin CI-equivalent build. A project-base preview run returned 404 for its built assets because the local preview server was rooted at `/`; it was rejected and replaced by the same production bundle rebuilt for the local root. One unrelated portrait focus timing assertion failed under 16-worker contention, passed immediately in isolation, and the complete eight-worker rerun passed.\n+\n+## Fresh verification\n+\n+The results below were rerun after the final dossier-scroll correction.\n+\n+- Focused Vitest: 27/27 passed across arsenal, shell, and intel catalog coverage.\n+- Client suite: 152 files, 1,188/1,188 tests passed.\n+- `npm run check`: passed, including typecheck and all deterministic engine/contract harnesses.\n+- `npm run build`: passed with CI-equivalent public E2E Supabase fixture values.\n+- Dependency audit: `npm audit --audit-level=high` -> 0 vulnerabilities.\n+- Corrected compact HUD/Sandhog browser guardrails: 42 passed, 12 intentional project skips.\n+- Complete Playwright matrix: 258 passed, 30 intentional project skips.\n+- Visual inspection: the corrected 900x520 production bundle shows readable dossier copy contained in the right rail, an unobstructed battlefield, and a distinct weapon-grid scroll region with no overlap or ghosting.\n+- `git diff --check`: passed on the corrected staged payload before package integrity verification.\n+\n+## Scope proof\n+\n+Changed runtime behavior is limited to client HUD presentation and input previews. There are no engine, deterministic state, weapon balance, action protocol, network, Supabase, auth, progression, dependency, asset, schema, migration, or secret changes.\ndiff --git a/.codearbiter/specs/weapon-intel-panel.md b/.codearbiter/specs/weapon-intel-panel.md\nnew file mode 100644\nindex 0000000..183faf1\n--- /dev/null\n+++ b/.codearbiter/specs/weapon-intel-panel.md\n@@ -0,0 +1,52 @@\n+# Weapon Intel Panel sprint spec\n+\n+Status: approved under the user's standing continuous-improvement authority\n+Date: 2026-08-10\n+Task: `ux.hud.0002`\n+Source: `.codearbiter/reports/2026-08-10-post-remediation-adversarial-player-audit.md`\n+\n+## Outcome\n+\n+A player can inspect every implemented arsenal weapon with mouse, keyboard, or touch and understand its tactical role before committing ammunition. Guidance remains inside the arsenal drawer, never covers the battlefield, and never adds a modal or changes deterministic gameplay.\n+\n+## Player contract\n+\n+- Opening the arsenal immediately shows intel for the currently selected weapon.\n+- Focusing or pointing at another visible weapon previews that weapon's intel without selecting or firing it.\n+- Activating a weapon selects it through the existing callback and leaves its intel visible.\n+- Moving the pointer away restores intel for the selected weapon; keyboard focus remains authoritative while it is inside a weapon button.\n+- Intel includes the weapon name, a short tactical role, terrain interaction, damage or blast character, live ammunition, and one concise use case.\n+- All implemented `WeaponType` values have authored intel. The TypeScript mapping is exhaustive so a future weapon cannot compile without guidance.\n+- The panel is readable and contained inside the existing fitted arsenal drawer on desktop-fine, pixel-touch, and small-window Playwright projects.\n+- Existing collapse preference, Escape-to-close behavior, owned-only visibility, weapon selection, firing, store, engine, network, and replay behavior remain unchanged.\n+\n+## Design\n+\n+Create a focused `weaponIntel.ts` presentation catalog keyed by `WeaponType`. Keep player-facing tactical language separate from engine tuning so exact balance changes do not turn the panel into misleading pseudo-precision. The catalog exposes role, terrain, damage, and use-case strings and is imported only by the HUD.\n+\n+The arsenal builds one persistent intel region beneath its weapon grid. It defaults to the selected weapon during `syncStrip`. Button `focus` and pointer entry preview another weapon. Button pointer exit restores the selected weapon unless keyboard focus is still on that button. Click continues to use the existing selection callback and updates the preview immediately. The region uses an accessible heading and polite status semantics; weapon buttons reference it with `aria-describedby`.\n+\n+The panel is part of the drawer's existing layer and scroll containment. It is hidden whenever the drawer is collapsed. Compact CSS reduces spacing and type size while preserving the current 44-pixel touch-target floor.\n+\n+## Considered approaches and SMARTS decision\n+\n+1. **Inline drawer dossier - chosen.** Strong: best safety, maintenance, accessibility, reversibility, testability, and player comprehension. It is persistently readable on touch and inherits the drawer's established layering.\n+2. **Hover tooltip.** Rejected: weak on touch and keyboard, easy to clip, and transient while the player compares choices.\n+3. **Battlefield modal or popover.** Rejected: obscures the exact battlefield context needed to judge a weapon and repeats the overlay-composition failure class already repaired.\n+\n+SMARTS verdict: inline dossier, strong confidence. Intent: current adversarial audit plus the user's standing priority on polished player experience.\n+\n+## Authored content boundaries\n+\n+Guidance may use stable qualitative bands such as precision, broad, massive, terrain-building, tunneling, lingering fire, or defense. It must not expose brittle internal frame counts, velocity constants, or formulas. Shield capacities may be described qualitatively rather than as engine HP. Ammunition is live HUD state, not duplicated catalog data.\n+\n+## Test obligations\n+\n+1. A catalog unit test proves every implemented weapon has non-empty, bounded role, terrain, damage, and use-case text.\n+2. HUD unit tests fail before implementation and prove selected default, focus preview, pointer preview/restore, click persistence, live ammo, `aria-describedby`, and collapse behavior.\n+3. A real-browser test runs in all three viewport projects and proves the panel is visible, changes via each applicable input mode, remains inside the drawer and viewport, does not overlap the canvas, and does not increase `#hud` scroll height.\n+4. Mutation-oriented assertions must fail if any one intel field is omitted, preview events are removed, selected fallback is removed, or compact containment is broken.\n+\n+## Out of scope\n+\n+No weapon balance, inventory, store, engine, action schema, network, Supabase, auth, progression, dependency, asset, or migration changes. No tutorial sequence and no new modal.\ndiff --git a/client/src/main.ts b/client/src/main.ts\nindex d663751..3553e60 100644\n--- a/client/src/main.ts\n+++ b/client/src/main.ts\n@@ -716,6 +716,12 @@ function bootstrap(): void {\n     appEl.style.setProperty('--st-command-choice-target', `${commandChoiceTarget}px`);\n     const deploymentChoiceTarget = Math.ceil(44 / Math.max(s, Number.EPSILON));\n     appEl.style.setProperty('--st-deployment-choice-target', `${deploymentChoiceTarget}px`);\n+    // The arsenal dossier lives inside the zoomed stage. Keep its tactical copy\n+    // above physical readability floors instead of shrinking it to 3-6px on phones.\n+    appEl.style.setProperty('--st-weapon-intel-name-size', `${Math.max(12, Math.ceil(12 / s))}px`);\n+    appEl.style.setProperty('--st-weapon-intel-ammo-size', `${Math.max(9, Math.ceil(10 / s))}px`);\n+    appEl.style.setProperty('--st-weapon-intel-label-size', `${Math.max(7, Math.ceil(9 / s))}px`);\n+    appEl.style.setProperty('--st-weapon-intel-value-size', `${Math.max(9, Math.ceil(11 / s))}px`);\n     appEl.classList.toggle('is-compact', s < COMPACT_SCALE);\n   }\n   window.addEventListener('resize', updateScale);\ndiff --git a/client/src/style.css b/client/src/style.css\nindex b92f15e..bc8c588 100644\n--- a/client/src/style.css\n+++ b/client/src/style.css\n@@ -378,6 +378,7 @@ body::before {\n   left: 12px;\n   z-index: 20;\n   width: auto;\n+  height: calc(100% - 24px);\n   max-height: calc(100% - 24px);\n   margin: 0;\n   padding: var(--ui-space-3);\ndiff --git a/client/src/ui/HUD.arsenal.test.ts b/client/src/ui/HUD.arsenal.test.ts\nindex a12fa11..940306c 100644\n--- a/client/src/ui/HUD.arsenal.test.ts\n+++ b/client/src/ui/HUD.arsenal.test.ts\n@@ -9,6 +9,7 @@\n  */\n import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';\n import { HUD } from './HUD';\n+import { WEAPON_INTEL } from './weaponIntel';\n import { GameEngine } from '@shared/engine/GameEngine';\n import type { GameState } from '@shared/types/GameState';\n \n@@ -81,6 +82,211 @@ describe('HUD arsenal — owned-only', () => {\n   });\n });\n \n+describe('HUD arsenal - weapon intel', () => {\n+  beforeEach(() => localStorage.clear());\n+\n+  function intel(root: HTMLElement): HTMLElement {\n+    return root.querySelector<HTMLElement>('.st-hud__weapon-intel')!;\n+  }\n+\n+  it('opens with accessible intel for the selected weapon and live ammunition', () => {\n+    const { root, hud, state } = mount();\n+    hud.update(state);\n+    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();\n+\n+    const panel = intel(root);\n+    const selected = btn(root, 'baby_missile')!;\n+    expect(panel).toBeTruthy();\n+    expect(panel.dataset['weapon']).toBe('baby_missile');\n+    expect(panel.querySelector('.st-hud__weapon-intel-name')?.textContent).toBe('Baby Missile');\n+    expect(panel.querySelector('[data-intel-field=\"role\"] .st-hud__weapon-intel-value')?.textContent)\n+      .toBe(WEAPON_INTEL.baby_missile.role);\n+    expect(panel.querySelector('[data-intel-field=\"terrain\"] .st-hud__weapon-intel-value')?.textContent)\n+      .toBe(WEAPON_INTEL.baby_missile.terrain);\n+    expect(panel.querySelector('[data-intel-field=\"damage\"] .st-hud__weapon-intel-value')?.textContent)\n+      .toBe(WEAPON_INTEL.baby_missile.damage);\n+    expect(panel.querySelector('[data-intel-field=\"useCase\"] .st-hud__weapon-intel-value')?.textContent)\n+      .toBe(WEAPON_INTEL.baby_missile.useCase);\n+    expect(panel.querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('\\u221e');\n+    expect(panel.getAttribute('role')).toBe('status');\n+    expect(panel.getAttribute('aria-live')).toBe('polite');\n+    expect(panel.tabIndex).toBe(0);\n+    const heading = panel.querySelector('h3');\n+    expect(heading?.textContent).toBe('Baby Missile');\n+    expect(heading?.id).toBeTruthy();\n+    expect(panel.getAttribute('aria-labelledby')).toBe(heading?.id);\n+    expect(root.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))\n+      .toBe(panel.parentElement?.id);\n+    expect(selected.getAttribute('aria-describedby')).toBe(panel.id);\n+    expect(panel.hidden).toBe(false);\n+  });\n+\n+  it('previews focus and pointer without selecting, then restores the selected weapon', async () => {\n+    const { root, hud, state } = mount();\n+    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;\n+    tank.inventory.missile = { count: 4, unlimited: false };\n+    tank.inventory.dirt_bomb = { count: 2, unlimited: false };\n+    const selected = vi.fn();\n+    hud.onWeaponSelect(selected);\n+    hud.update(state);\n+    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();\n+\n+    const missile = btn(root, 'missile')!;\n+    const dirtBomb = btn(root, 'dirt_bomb')!;\n+    missile.focus();\n+    expect(intel(root).dataset['weapon']).toBe('missile');\n+    expect(selected).not.toHaveBeenCalled();\n+\n+    dirtBomb.dispatchEvent(new Event('pointermove'));\n+    expect(intel(root).dataset['weapon']).toBe('missile');\n+\n+    dirtBomb.dispatchEvent(new Event('pointerdown'));\n+    dirtBomb.dispatchEvent(new Event('pointermove'));\n+    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');\n+    expect(intel(root).querySelector('[data-intel-field=\"terrain\"]')?.textContent)\n+      .toContain('Raises a mound');\n+    expect(selected).not.toHaveBeenCalled();\n+\n+    dirtBomb.dispatchEvent(new Event('pointerleave'));\n+    await new Promise((resolve) => setTimeout(resolve, 0));\n+    expect(intel(root).dataset['weapon']).toBe('missile');\n+    missile.blur();\n+    expect(intel(root).dataset['weapon']).toBe('baby_missile');\n+    expect(selected).not.toHaveBeenCalled();\n+  });\n+\n+  it('returns the dossier to its heading whenever keyboard, pointer, or touch changes weapons', () => {\n+    const { root, hud, state } = mount();\n+    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;\n+    tank.inventory.missile = { count: 4, unlimited: false };\n+    tank.inventory.dirt_bomb = { count: 2, unlimited: false };\n+    tank.inventory.tracer = { count: 3, unlimited: false };\n+    hud.update(state);\n+    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();\n+\n+    const panel = intel(root);\n+    panel.scrollTop = 37;\n+    btn(root, 'missile')!.focus();\n+    expect(panel.dataset['weapon']).toBe('missile');\n+    expect(panel.scrollTop).toBe(0);\n+\n+    panel.scrollTop = 41;\n+    const dirtBomb = btn(root, 'dirt_bomb')!;\n+    dirtBomb.dispatchEvent(new Event('pointerdown'));\n+    dirtBomb.dispatchEvent(new Event('pointermove'));\n+    expect(panel.dataset['weapon']).toBe('dirt_bomb');\n+    expect(panel.scrollTop).toBe(0);\n+\n+    btn(root, 'missile')!.blur();\n+    panel.scrollTop = 53;\n+    const tracer = btn(root, 'tracer')!;\n+    const touchDown = new Event('pointerdown');\n+    Object.defineProperty(touchDown, 'pointerType', { value: 'touch' });\n+    tracer.dispatchEvent(touchDown);\n+    tracer.click();\n+    expect(panel.dataset['weapon']).toBe('tracer');\n+    expect(panel.scrollTop).toBe(0);\n+  });\n+\n+  it('restores selected intel after collapse instead of reopening a stale preview', () => {\n+    const { root, hud, state } = mount();\n+    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;\n+    tank.inventory.dirt_bomb = { count: 2, unlimited: false };\n+    hud.update(state);\n+    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;\n+    toggle.click();\n+\n+    const dirtBomb = btn(root, 'dirt_bomb')!;\n+    dirtBomb.dispatchEvent(new Event('pointerdown'));\n+    dirtBomb.dispatchEvent(new Event('pointermove'));\n+    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');\n+\n+    toggle.click();\n+    toggle.click();\n+    expect(intel(root).dataset['weapon']).toBe('baby_missile');\n+  });\n+\n+  it('drops a transient preview when the active loadout changes or the weapon is hidden', () => {\n+    const { root, hud, state } = mount();\n+    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;\n+    tank.inventory.dirt_bomb = { count: 2, unlimited: false };\n+    tank.inventory.missile = { count: 4, unlimited: false };\n+    hud.update(state);\n+    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();\n+    const dirtBomb = btn(root, 'dirt_bomb')!;\n+\n+    dirtBomb.dispatchEvent(new Event('pointerdown'));\n+    dirtBomb.dispatchEvent(new Event('pointermove'));\n+    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');\n+\n+    tank.selectedWeapon = 'missile';\n+    hud.update(state);\n+    expect(intel(root).dataset['weapon']).toBe('missile');\n+\n+    dirtBomb.dispatchEvent(new Event('pointermove'));\n+    expect(intel(root).dataset['weapon']).toBe('dirt_bomb');\n+    tank.inventory.dirt_bomb.count = 0;\n+    hud.update(state);\n+    expect(intel(root).dataset['weapon']).toBe('missile');\n+  });\n+\n+  it('does not mutate the polite live region for identical frame updates', async () => {\n+    const { root, hud, state } = mount();\n+    hud.update(state);\n+    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();\n+    const panel = intel(root);\n+    const mutations: MutationRecord[] = [];\n+    const observer = new MutationObserver((records) => mutations.push(...records));\n+    observer.observe(panel, { attributes: true, characterData: true, childList: true, subtree: true });\n+\n+    hud.update(state);\n+    hud.update(state);\n+    hud.update(state);\n+    await Promise.resolve();\n+    observer.disconnect();\n+\n+    expect(mutations).toEqual([]);\n+  });\n+\n+  it('keeps activated touch intel visible, updates ammo, and hides with the drawer', () => {\n+    const { root, hud, state } = mount();\n+    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;\n+    tank.inventory.tracer = { count: 3, unlimited: false };\n+    hud.onWeaponSelect((weapon) => {\n+      tank.selectedWeapon = weapon;\n+    });\n+    hud.update(state);\n+    const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;\n+    toggle.click();\n+\n+    btn(root, 'tracer')!.click();\n+    hud.update(state);\n+    expect(intel(root).dataset['weapon']).toBe('tracer');\n+    expect(intel(root).querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('3');\n+\n+    tank.inventory.tracer.count = 2;\n+    hud.update(state);\n+    expect(intel(root).querySelector('.st-hud__weapon-intel-ammo')?.textContent).toContain('2');\n+\n+    toggle.click();\n+    expect(intel(root).hidden).toBe(true);\n+  });\n+\n+  it('ignores touch pointer entry until the player activates a weapon', () => {\n+    const { root, hud, state } = mount();\n+    const tank = state.tanks.find((candidate) => candidate.id === state.activePlayerId)!;\n+    tank.inventory.sandhog = { count: 1, unlimited: false };\n+    hud.update(state);\n+    root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!.click();\n+\n+    const touchMove = new Event('pointermove');\n+    Object.defineProperty(touchMove, 'pointerType', { value: 'touch' });\n+    btn(root, 'sandhog')!.dispatchEvent(touchMove);\n+\n+    expect(intel(root).dataset['weapon']).toBe('baby_missile');\n+  });\n+});\n+\n describe('HUD arsenal — collapsible', () => {\n   beforeEach(() => localStorage.clear());\n \ndiff --git a/client/src/ui/HUD.shell.test.ts b/client/src/ui/HUD.shell.test.ts\nindex 1f171d1..6b7d370 100644\n--- a/client/src/ui/HUD.shell.test.ts\n+++ b/client/src/ui/HUD.shell.test.ts\n@@ -173,14 +173,18 @@ describe('HUD single-screen combat shell', () => {\n     const root = mount();\n     const strip = root.querySelector<HTMLElement>('.st-hud__strip')!;\n     const toggle = root.querySelector<HTMLButtonElement>('.st-hud__strip-toggle')!;\n+    const body = root.querySelector<HTMLElement>('.st-hud__strip-body')!;\n     const grid = root.querySelector<HTMLElement>('.st-hud__strip-grid')!;\n+    const intel = root.querySelector<HTMLElement>('.st-hud__weapon-intel')!;\n \n     expect(strip.classList.contains('st-hud__strip--collapsed')).toBe(true);\n     expect(strip.getAttribute('data-ui')).toBe('arsenal-drawer');\n     expect(toggle.getAttribute('aria-expanded')).toBe('false');\n     expect(toggle.getAttribute('aria-label')).toBe('Expand arsenal');\n     expect(toggle.textContent).toContain('Expand');\n-    expect(toggle.getAttribute('aria-controls')).toBe(grid.id);\n+    expect(toggle.getAttribute('aria-controls')).toBe(body.id);\n+    expect(body.contains(grid)).toBe(true);\n+    expect(body.contains(intel)).toBe(true);\n     expect(grid.id).not.toBe('');\n     expect(grid.getAttribute('role')).toBe('region');\n     expect(grid.getAttribute('aria-label')).toBe('Weapon arsenal');\n@@ -213,14 +217,17 @@ describe('HUD single-screen combat shell', () => {\n   it('keeps each drawer control relationship unique across HUD instances', () => {\n     const first = mount();\n     const second = mount();\n+    const firstBody = first.querySelector<HTMLElement>('.st-hud__strip-body')!;\n+    const secondBody = second.querySelector<HTMLElement>('.st-hud__strip-body')!;\n     const firstGrid = first.querySelector<HTMLElement>('.st-hud__strip-grid')!;\n     const secondGrid = second.querySelector<HTMLElement>('.st-hud__strip-grid')!;\n \n+    expect(firstBody.id).not.toBe(secondBody.id);\n     expect(firstGrid.id).not.toBe(secondGrid.id);\n     expect(first.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))\n-      .toBe(firstGrid.id);\n+      .toBe(firstBody.id);\n     expect(second.querySelector('.st-hud__strip-toggle')?.getAttribute('aria-controls'))\n-      .toBe(secondGrid.id);\n+      .toBe(secondBody.id);\n   });\n \n   it('preserves weapon selection and store behavior through the shell controls', () => {\ndiff --git a/client/src/ui/HUD.ts b/client/src/ui/HUD.ts\nindex adaaac5..e31fb1e 100644\n--- a/client/src/ui/HUD.ts\n+++ b/client/src/ui/HUD.ts\n@@ -17,6 +17,7 @@ import { resolveInitialArsenalCollapsed } from './arsenalPreference';\n import { makeHudGlyph, makeHudIcon } from './hudIcons';\n import { STORE_CATALOG } from './storeCatalog';\n import { makeWeaponIcon } from './weaponIcons';\n+import { WEAPON_INTEL } from './weaponIntel';\n import {\n   clearTankLoadoutPreview,\n   paintTankLoadoutPreview,\n@@ -208,7 +209,22 @@ export class HUD {\n   /** Collapse/expand control for the arsenal strip + its persisted state. */\n   private stripToggleEl!: HTMLButtonElement;\n   private stripToggleLabelEl!: HTMLElement;\n+  private stripBodyEl!: HTMLElement;\n   private stripCollapsed = false;\n+  private weaponIntelEl!: HTMLElement;\n+  private weaponIntelNameEl!: HTMLElement;\n+  private weaponIntelAmmoEl!: HTMLElement;\n+  private weaponIntelRoleEl!: HTMLElement;\n+  private weaponIntelTerrainEl!: HTMLElement;\n+  private weaponIntelDamageEl!: HTMLElement;\n+  private weaponIntelUseCaseEl!: HTMLElement;\n+  private selectedIntelWeapon: WeaponType = 'baby_missile';\n+  private focusedIntelWeapon: WeaponType | null = null;\n+  private pointedIntelWeapon: WeaponType | null = null;\n+  private intelInputMode: 'keyboard' | 'pointer' = 'keyboard';\n+  private pointerIntelFallbackTimer: ReturnType<typeof setTimeout> | null = null;\n+  private renderedIntelWeapon: WeaponType | null = null;\n+  private renderedIntelAmmo: string | null = null;\n   private storeBtnEl!: HTMLButtonElement;\n   private storeBtnLabelEl!: HTMLElement;\n   private commandConsoleEl!: HTMLElement;\n@@ -999,12 +1015,56 @@ export class HUD {\n     stripHeader.append(stripTitle, stripToggle);\n     this.stripToggleEl = stripToggle;\n     this.stripToggleLabelEl = stripToggleLabel;\n+    const stripBody = document.createElement('div');\n+    stripBody.className = 'st-hud__strip-body';\n+    stripBody.id = `st-hud-arsenal-drawer-${HUD.arsenalDrawerSequence++}`;\n+    this.stripBodyEl = stripBody;\n     const stripGrid = document.createElement('div');\n     stripGrid.className = 'st-hud__strip-grid';\n-    stripGrid.id = `st-hud-arsenal-drawer-${HUD.arsenalDrawerSequence++}`;\n+    stripGrid.id = `${stripBody.id}-grid`;\n     stripGrid.setAttribute('role', 'region');\n     stripGrid.setAttribute('aria-label', 'Weapon arsenal');\n-    stripToggle.setAttribute('aria-controls', stripGrid.id);\n+    stripToggle.setAttribute('aria-controls', stripBody.id);\n+    const intel = document.createElement('section');\n+    intel.className = 'st-hud__weapon-intel';\n+    intel.id = `${stripGrid.id}-intel`;\n+    intel.setAttribute('role', 'status');\n+    intel.setAttribute('aria-live', 'polite');\n+    intel.setAttribute('aria-atomic', 'true');\n+    intel.tabIndex = 0;\n+    const intelHeader = document.createElement('div');\n+    intelHeader.className = 'st-hud__weapon-intel-header';\n+    const intelName = document.createElement('h3');\n+    intelName.className = 'st-hud__weapon-intel-name';\n+    intelName.id = `${intel.id}-heading`;\n+    intel.setAttribute('aria-labelledby', intelName.id);\n+    const intelAmmo = document.createElement('span');\n+    intelAmmo.className = 'st-hud__weapon-intel-ammo';\n+    intelHeader.append(intelName, intelAmmo);\n+    const makeIntelField = (label: string, field: keyof typeof WEAPON_INTEL.baby_missile) => {\n+      const row = document.createElement('p');\n+      row.className = 'st-hud__weapon-intel-field';\n+      row.dataset['intelField'] = field;\n+      const term = document.createElement('span');\n+      term.className = 'st-hud__weapon-intel-label';\n+      term.textContent = label;\n+      const value = document.createElement('span');\n+      value.className = 'st-hud__weapon-intel-value';\n+      row.append(term, value);\n+      return { row, value };\n+    };\n+    const role = makeIntelField('Role', 'role');\n+    const terrain = makeIntelField('Terrain', 'terrain');\n+    const damage = makeIntelField('Effect', 'damage');\n+    const useCase = makeIntelField('Use', 'useCase');\n+    intel.append(intelHeader, role.row, terrain.row, damage.row, useCase.row);\n+    this.weaponIntelEl = intel;\n+    this.weaponIntelNameEl = intelName;\n+    this.weaponIntelAmmoEl = intelAmmo;\n+    this.weaponIntelRoleEl = role.value;\n+    this.weaponIntelTerrainEl = terrain.value;\n+    this.weaponIntelDamageEl = damage.value;\n+    this.weaponIntelUseCaseEl = useCase.value;\n     for (const type of STRIP_WEAPONS) {\n       const btn = document.createElement('button');\n       btn.type = 'button';\n@@ -1016,13 +1076,52 @@ export class HUD {\n       const ammoSpan = document.createElement('span');\n       ammoSpan.className = 'st-hud__weapon-btn-ammo';\n       btn.append(makeWeaponIcon(type, 14), nameSpan, ammoSpan);\n+      btn.setAttribute('aria-describedby', intel.id);\n       // Capture `type` per-iteration (for-of/const). Listener attached once.\n-      btn.addEventListener('click', () => this.weaponSelectCb?.(type));\n+      btn.addEventListener('focus', () => {\n+        this.focusedIntelWeapon = type;\n+        if (this.intelInputMode === 'keyboard') this.renderWeaponIntel();\n+      });\n+      btn.addEventListener('blur', () => {\n+        if (this.focusedIntelWeapon === type) this.focusedIntelWeapon = null;\n+        this.renderWeaponIntel();\n+      });\n+      btn.addEventListener('pointerdown', () => {\n+        this.cancelPointerIntelFallback();\n+        this.intelInputMode = 'pointer';\n+        this.pointedIntelWeapon = null;\n+      });\n+      btn.addEventListener('pointermove', (event) => {\n+        if (event.pointerType === 'touch') return;\n+        this.cancelPointerIntelFallback();\n+        if (this.pointedIntelWeapon === type) return;\n+        this.pointedIntelWeapon = type;\n+        this.renderWeaponIntel();\n+      });\n+      btn.addEventListener('pointerleave', (event) => {\n+        if (event.pointerType === 'touch') return;\n+        if (this.pointedIntelWeapon === type) this.pointedIntelWeapon = null;\n+        this.cancelPointerIntelFallback();\n+        this.pointerIntelFallbackTimer = setTimeout(() => {\n+          this.pointerIntelFallbackTimer = null;\n+          if (this.pointedIntelWeapon === null) this.renderWeaponIntel();\n+        }, 0);\n+      });\n+      btn.addEventListener('click', () => {\n+        this.selectedIntelWeapon = type;\n+        this.renderWeaponIntel();\n+        this.weaponSelectCb?.(type);\n+      });\n       this.weaponCells.set(type, { el: btn, ammo: ammoSpan });\n       stripGrid.append(btn);\n     }\n-    this.stripEl.append(stripHeader, stripGrid);\n+    stripBody.append(intel, stripGrid);\n+    this.stripEl.append(stripHeader, stripBody);\n     this.stripEl.addEventListener('keydown', (event) => {\n+      if (event.key === 'Tab' || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {\n+        this.intelInputMode = 'keyboard';\n+        this.renderWeaponIntel();\n+      }\n       if (event.key !== 'Escape' || this.stripCollapsed) return;\n       event.preventDefault();\n       event.stopPropagation();\n@@ -1036,6 +1135,45 @@ export class HUD {\n     this.applyStripCollapsed();\n   }\n \n+  /** Render the active preview without rebuilding the dossier DOM. */\n+  private renderWeaponIntel(): void {\n+    const type = this.intelInputMode === 'keyboard'\n+      ? this.focusedIntelWeapon ?? this.pointedIntelWeapon ?? this.selectedIntelWeapon\n+      : this.pointedIntelWeapon ?? this.focusedIntelWeapon ?? this.selectedIntelWeapon;\n+    const definition = WEAPONS[type];\n+    const intel = WEAPON_INTEL[type];\n+    const ammo = `Ammo ${this.weaponCells.get(type)?.ammo.textContent ?? '0'}`;\n+    if (this.renderedIntelWeapon !== type) {\n+      this.weaponIntelEl.dataset['weapon'] = type;\n+      this.weaponIntelNameEl.textContent = definition.name;\n+      this.weaponIntelRoleEl.textContent = intel.role;\n+      this.weaponIntelTerrainEl.textContent = intel.terrain;\n+      this.weaponIntelDamageEl.textContent = intel.damage;\n+      this.weaponIntelUseCaseEl.textContent = intel.useCase;\n+      this.weaponIntelEl.scrollTop = 0;\n+      this.renderedIntelWeapon = type;\n+    }\n+    if (this.renderedIntelAmmo !== ammo) {\n+      this.weaponIntelAmmoEl.textContent = ammo;\n+      this.renderedIntelAmmo = ammo;\n+    }\n+  }\n+\n+  /** Drop transient comparison state whenever the drawer or active loadout changes. */\n+  private resetWeaponIntelPreview(): void {\n+    this.cancelPointerIntelFallback();\n+    this.focusedIntelWeapon = null;\n+    this.pointedIntelWeapon = null;\n+    this.intelInputMode = 'keyboard';\n+  }\n+\n+  /** Coalesce pointerleave/pointermove into one comparison announcement. */\n+  private cancelPointerIntelFallback(): void {\n+    if (this.pointerIntelFallbackTimer === null) return;\n+    clearTimeout(this.pointerIntelFallbackTimer);\n+    this.pointerIntelFallbackTimer = null;\n+  }\n+\n   /** Store toggle button (side panel) + the store modal (on the modal layer). */\n   private buildStore(): void {\n     // Store toggle button (side panel) + the store modal (on the canvas overlay).\n@@ -2446,6 +2584,7 @@ export class HUD {\n \n   /** Reflect the collapsed state onto the strip DOM + toggle affordance. */\n   private applyStripCollapsed(): void {\n+    this.resetWeaponIntelPreview();\n     this.stripEl.classList.toggle('st-hud__strip--collapsed', this.stripCollapsed);\n     this.stripEl.classList.toggle('st-hud__strip--open', !this.stripCollapsed);\n     this.stripToggleEl.setAttribute('aria-expanded', String(!this.stripCollapsed));\n@@ -2454,6 +2593,9 @@ export class HUD {\n       this.stripCollapsed ? 'Expand arsenal' : 'Collapse arsenal',\n     );\n     this.stripToggleLabelEl.textContent = this.stripCollapsed ? 'Expand' : 'Close';\n+    this.stripBodyEl.hidden = this.stripCollapsed;\n+    this.weaponIntelEl.hidden = this.stripCollapsed;\n+    this.renderWeaponIntel();\n     for (const child of [...this.root.children]) {\n       if (child !== this.stripEl) (child as HTMLElement).inert = !this.stripCollapsed;\n     }\n@@ -2475,6 +2617,8 @@ export class HUD {\n     const selectedInventory = tank?.inventory[tank.selectedWeapon];\n     const selectedUsable = !!selectedInventory &&\n       (selectedInventory.unlimited || selectedInventory.count > 0);\n+    const previousSelected = this.selectedIntelWeapon;\n+    if (tank) this.selectedIntelWeapon = tank.selectedWeapon;\n     for (const [type, cell] of this.weaponCells) {\n       const entry = tank?.inventory[type];\n       const unlimited = entry?.unlimited ?? false;\n@@ -2496,6 +2640,16 @@ export class HUD {\n       // this is UX only.)\n       cell.el.disabled = !canAct || depleted;\n     }\n+    const previewIsHidden = (type: WeaponType | null) => type !== null &&\n+      this.weaponCells.get(type)?.el.classList.contains('st-hud__weapon-btn--hidden');\n+    if (\n+      previousSelected !== this.selectedIntelWeapon ||\n+      previewIsHidden(this.focusedIntelWeapon) ||\n+      previewIsHidden(this.pointedIntelWeapon)\n+    ) {\n+      this.resetWeaponIntelPreview();\n+    }\n+    this.renderWeaponIntel();\n     // Sync the shared primary action and touch weapon stepper from the same\n     // explicit local-ownership state.\n     for (const button of this.touchCommandBtns) {\n@@ -3294,10 +3448,23 @@ export class HUD {\n .st-hud__strip--open .st-hud__strip-toggle .st-ui-icon {\n   transform: rotate(180deg);\n }\n+.st-hud__strip-body {\n+  display: flex;\n+  min-height: 0;\n+  flex: 1 1 auto;\n+  flex-direction: column;\n+  gap: 5px;\n+  overflow: hidden;\n+}\n+.st-hud__strip-body[hidden] { display: none; }\n .st-hud__strip-grid {\n   display: grid;\n+  flex: 1 1 0;\n   grid-template-columns: repeat(2, minmax(0, 1fr));\n   gap: 4px;\n+  min-height: 0;\n+  overflow-y: auto;\n+  overscroll-behavior: contain;\n }\n /* Collapsed: fold the button grid away, keep the header + toggle. */\n .st-hud__strip--collapsed .st-hud__strip-grid { display: none; }\n@@ -3377,6 +3544,84 @@ export class HUD {\n   color: var(--text-gold);\n   opacity: 0.9;\n }\n+.st-hud__weapon-intel {\n+  display: grid;\n+  box-sizing: border-box;\n+  flex: 0 0 180px;\n+  grid-template-columns: repeat(2, minmax(0, 1fr));\n+  gap: 5px 9px;\n+  min-width: 0;\n+  padding: 8px 9px;\n+  border: 1px solid rgba(122, 215, 255, 0.3);\n+  border-radius: var(--ui-radius-sm);\n+  background:\n+    linear-gradient(135deg, rgba(122, 215, 255, 0.08), transparent 52%),\n+    rgba(7, 6, 13, 0.86);\n+  box-shadow: inset 0 0 18px rgba(122, 215, 255, 0.04);\n+  overflow-y: auto;\n+  overscroll-behavior: contain;\n+}\n+.st-hud__weapon-intel[hidden] { display: none; }\n+.st-hud__weapon-intel-header {\n+  grid-column: 1 / -1;\n+  display: flex;\n+  align-items: baseline;\n+  justify-content: space-between;\n+  gap: 8px;\n+  padding-bottom: 4px;\n+  border-bottom: 1px solid rgba(255, 210, 63, 0.2);\n+}\n+.st-hud__weapon-intel-name {\n+  color: var(--gold);\n+  font-family: var(--font-display);\n+  margin: 0;\n+  font-size: var(--st-weapon-intel-name-size, 12px);\n+  letter-spacing: 0.7px;\n+}\n+.st-hud__weapon-intel-ammo {\n+  color: var(--tank-blue-lite, #7ad7ff);\n+  font-family: var(--font-mono);\n+  font-size: var(--st-weapon-intel-ammo-size, 9px);\n+  white-space: nowrap;\n+}\n+.st-hud__weapon-intel-field {\n+  display: grid;\n+  gap: 1px;\n+  min-width: 0;\n+  margin: 0;\n+}\n+.st-hud__weapon-intel-label {\n+  color: var(--ui-muted);\n+  font-family: var(--font-mono);\n+  font-size: var(--st-weapon-intel-label-size, 7px);\n+  font-weight: 700;\n+  letter-spacing: 0.9px;\n+  line-height: 1.1;\n+  text-transform: uppercase;\n+}\n+.st-hud__weapon-intel-value {\n+  color: var(--ui-copy);\n+  font-family: var(--font-sans);\n+  font-size: var(--st-weapon-intel-value-size, 9px);\n+  line-height: 1.25;\n+  overflow-wrap: anywhere;\n+}\n+#app.is-compact .st-hud__weapon-intel {\n+  box-sizing: border-box;\n+  flex: 0 0 210px;\n+  grid-template-columns: minmax(0, 1fr);\n+  gap: 3px 7px;\n+  padding: 6px 7px;\n+  overflow-y: auto;\n+  overscroll-behavior: contain;\n+}\n+#app.is-compact .st-hud__weapon-intel-name {\n+  font-size: var(--st-weapon-intel-name-size, 12px);\n+}\n+#app.is-compact .st-hud__weapon-intel-value {\n+  font-size: var(--st-weapon-intel-value-size, 9px);\n+  line-height: 1.15;\n+}\n /* First Salvo stays compact and non-modal: the card is pointer-transparent; only Skip receives pointer input. */\n .st-hud__first-salvo {\n   position: absolute;\n@@ -4440,7 +4685,9 @@ export class HUD {\n   .st-hud__conn { top: 176px; }\n   .st-hud__toast { top: 214px; }\n   .st-hud__turnwatch { top: 252px; }\n-  .st-hud__weapon-btn { min-height: 44px; }\n+  /* The fixed stage scales to ~0.488 on Pixel 5 landscape. Match the drawer\n+     toggle's authored 91px floor so weapon choices remain >=44 rendered px. */\n+  .st-hud__weapon-btn { min-height: 91px; }\n   .st-hud__strip-toggle { min-width: 91px; min-height: 91px; }\n   .st-hud__store-buy { min-height: 44px; }\n   .st-hud__store-catalog .st-hud__store-buy {\ndiff --git a/client/src/ui/weaponIntel.test.ts b/client/src/ui/weaponIntel.test.ts\nnew file mode 100644\nindex 0000000..914b40b\n--- /dev/null\n+++ b/client/src/ui/weaponIntel.test.ts\n@@ -0,0 +1,30 @@\n+import { describe, expect, it } from 'vitest';\n+import { WEAPONS } from '@shared/engine/WeaponSystem';\n+import { WEAPON_INTEL } from './weaponIntel';\n+\n+describe('weapon tactical intel catalog', () => {\n+  it('authors concise tactical guidance for every implemented weapon', () => {\n+    const implemented = Object.entries(WEAPONS)\n+      .filter(([, weapon]) => weapon.implemented)\n+      .map(([type]) => type)\n+      .sort();\n+\n+    expect(Object.keys(WEAPON_INTEL).sort()).toEqual(implemented);\n+    expect(implemented).toHaveLength(18);\n+\n+    for (const type of implemented) {\n+      const intel = WEAPON_INTEL[type as keyof typeof WEAPON_INTEL];\n+      expect(intel, `${type} needs authored intel`).toBeDefined();\n+      for (const field of ['role', 'terrain', 'damage', 'useCase'] as const) {\n+        expect(intel[field].trim(), `${type}.${field} must not be empty`).not.toBe('');\n+        expect(intel[field].length, `${type}.${field} must stay scannable`).toBeLessThanOrEqual(100);\n+      }\n+    }\n+  });\n+\n+  it('describes tracer as a finite turn-and-ammunition tradeoff', () => {\n+    expect(WEAPON_INTEL.tracer.role).not.toMatch(/risk-free/i);\n+    expect(WEAPON_INTEL.tracer.useCase).toMatch(/turn/i);\n+    expect(WEAPON_INTEL.tracer.useCase).toMatch(/ammunition/i);\n+  });\n+});\ndiff --git a/client/src/ui/weaponIntel.ts b/client/src/ui/weaponIntel.ts\nnew file mode 100644\nindex 0000000..f1ecac1\n--- /dev/null\n+++ b/client/src/ui/weaponIntel.ts\n@@ -0,0 +1,127 @@\n+import type { WeaponType } from '@shared/engine/WeaponSystem';\n+\n+export interface WeaponIntel {\n+  /** The battlefield job this weapon is best at. */\n+  role: string;\n+  /** How the shot changes or depends on terrain. */\n+  terrain: string;\n+  /** Qualitative harm, reach, or protection character. */\n+  damage: string;\n+  /** One concise decision cue for a player choosing a shot. */\n+  useCase: string;\n+}\n+\n+/**\n+ * Player-facing tactical guidance. This intentionally describes stable behavior\n+ * instead of repeating balance constants that may change during playtesting.\n+ */\n+export const WEAPON_INTEL = {\n+  baby_missile: {\n+    role: 'Reliable precision shot',\n+    terrain: 'Cuts a small crater at impact.',\n+    damage: 'Light, tight blast',\n+    useCase: 'Use to range a target or finish a wounded tank.',\n+  },\n+  missile: {\n+    role: 'Balanced direct attack',\n+    terrain: 'Opens a medium crater at impact.',\n+    damage: 'Strong, focused blast',\n+    useCase: 'Use when you have a clean line and want dependable damage.',\n+  },\n+  heavy_missile: {\n+    role: 'Heavy direct strike',\n+    terrain: 'Carves a broad crater that can destabilize slopes.',\n+    damage: 'Very strong, broad blast',\n+    useCase: 'Use to punish a near-direct hit or undermine a protected tank.',\n+  },\n+  baby_nuke: {\n+    role: 'Large-area finisher',\n+    terrain: 'Removes a wide section of ground.',\n+    damage: 'Severe, very wide blast',\n+    useCase: 'Use when close is good enough and nearby terrain can be sacrificed.',\n+  },\n+  nuke: {\n+    role: 'Maximum area destruction',\n+    terrain: 'Erases a massive crater and can collapse whole positions.',\n+    damage: 'Extreme, massive blast',\n+    useCase: 'Use for a decisive strike when collateral terrain damage is acceptable.',\n+  },\n+  dirt_bomb: {\n+    role: 'Terrain builder',\n+    terrain: 'Raises a mound instead of making a crater.',\n+    damage: 'No direct blast damage',\n+    useCase: 'Use to bury, shield, or block a firing lane.',\n+  },\n+  bouncing_betty: {\n+    role: 'Chained ground assault',\n+    terrain: 'Skips along the surface and blasts at each landing.',\n+    damage: 'Multiple medium blasts',\n+    useCase: 'Use across rolling ground or against several tanks in a row.',\n+  },\n+  funky_bomb: {\n+    role: 'Unpredictable airburst spread',\n+    terrain: 'Scatters several craters across the landing zone.',\n+    damage: 'Wide multi-bomb pattern',\n+    useCase: 'Use to pressure a broad area when pinpoint aim is unlikely.',\n+  },\n+  napalm: {\n+    role: 'Lingering area denial',\n+    terrain: 'Fire spreads along the surface and pools in low ground.',\n+    damage: 'Sustained burn over time',\n+    useCase: 'Use on slopes and valleys where a target cannot escape the flames.',\n+  },\n+  cluster_bomb: {\n+    role: 'Reliable airburst coverage',\n+    terrain: 'Drops a tight carpet of small craters after the apex.',\n+    damage: 'Several light overlapping blasts',\n+    useCase: 'Use when wind or distance makes one precise impact risky.',\n+  },\n+  mirv: {\n+    role: 'Heavy airburst attack',\n+    terrain: 'Splits at the apex into several broad craters.',\n+    damage: 'Multiple strong warheads',\n+    useCase: 'Use to cover nearby targets or stack warheads on one position.',\n+  },\n+  deaths_head: {\n+    role: 'Saturation strike',\n+    terrain: 'Blankets a wide zone with overlapping heavy craters.',\n+    damage: 'Devastating multi-warhead barrage',\n+    useCase: 'Use to overwhelm a crowded or heavily fortified area.',\n+  },\n+  riot_bomb: {\n+    role: 'Terrain remover',\n+    terrain: 'Clears a wide disc of earth without a damaging blast.',\n+    damage: 'No direct blast damage',\n+    useCase: 'Use to free a buried tank, open a lane, or collapse support.',\n+  },\n+  hot_napalm: {\n+    role: 'Heavy area denial',\n+    terrain: 'Spreads farther and burns longer along the surface.',\n+    damage: 'Severe sustained burn',\n+    useCase: 'Use to lock down a large valley or force damage over time.',\n+  },\n+  sandhog: {\n+    role: 'Subterranean attack',\n+    terrain: 'Burrows through earth, leaving a tunnel before detonation.',\n+    damage: 'Strong endpoint blast',\n+    useCase: 'Use against targets hidden behind hills or thick cover.',\n+  },\n+  tracer: {\n+    role: 'Non-damaging ranging shot',\n+    terrain: 'Leaves the battlefield unchanged.',\n+    damage: 'No damage',\n+    useCase: 'Spends one turn and ammunition to read wind before a valuable shot.',\n+  },\n+  shield: {\n+    role: 'Temporary defense',\n+    terrain: 'Does not alter terrain.',\n+    damage: 'Absorbs incoming damage',\n+    useCase: 'Activate before an exposed turn or an expected heavy strike.',\n+  },\n+  heavy_shield: {\n+    role: 'Reinforced defense',\n+    terrain: 'Does not alter terrain.',\n+    damage: 'Absorbs substantially more damage',\n+    useCase: 'Activate when survival matters more than immediate offense.',\n+  },\n+} satisfies Record<WeaponType, WeaponIntel>;\ndiff --git a/e2e/weapon-intel.spec.ts b/e2e/weapon-intel.spec.ts\nnew file mode 100644\nindex 0000000..006dd47\n--- /dev/null\n+++ b/e2e/weapon-intel.spec.ts\n@@ -0,0 +1,198 @@\n+import { test, expect } from '@playwright/test';\n+import { gotoRunningGame } from './support';\n+\n+test.describe('weapon intel battlefield composition', () => {\n+  test('previews tactics through the active input mode and stays inside the arsenal layer', async ({\n+    page,\n+  }, testInfo) => {\n+    await gotoRunningGame(page);\n+    const hud = page.locator('#hud');\n+    const drawer = page.locator('.st-hud__strip');\n+    const panel = page.locator('.st-hud__weapon-intel');\n+    const before = await hud.evaluate((node) => node.scrollHeight);\n+\n+    const openArsenal = page.getByRole('button', { name: 'Expand arsenal' });\n+    if (testInfo.project.name === 'pixel-touch') await openArsenal.tap();\n+    else await openArsenal.click();\n+    await expect(panel).toBeVisible();\n+    await expect(panel).toHaveAttribute('data-weapon', 'baby_missile');\n+    await expect(panel).toContainText('Reliable precision shot');\n+    const scrollDossierToBottom = () => panel.evaluate((node) => {\n+      node.scrollTop = node.scrollHeight;\n+      return node.scrollTop;\n+    });\n+    const expectHeadingVisible = async (name: string) => {\n+      const visibility = await panel.evaluate((node, expectedName) => {\n+        const heading = node.querySelector<HTMLElement>('.st-hud__weapon-intel-name')!;\n+        const panelRect = node.getBoundingClientRect();\n+        const headingRect = heading.getBoundingClientRect();\n+        return {\n+          name: heading.textContent,\n+          scrollTop: node.scrollTop,\n+          visible: headingRect.top >= panelRect.top && headingRect.bottom <= panelRect.bottom,\n+        };\n+      }, name);\n+      expect(visibility).toEqual({ name, scrollTop: 0, visible: true });\n+    };\n+    const missile = page.locator('.st-hud__weapon-btn[data-weapon=\"missile\"]');\n+    await expect(missile).toBeVisible();\n+    if (testInfo.project.name === 'pixel-touch') {\n+      expect(await scrollDossierToBottom()).toBeGreaterThan(0);\n+      await missile.tap();\n+      await expect(panel).toHaveAttribute('data-weapon', 'missile');\n+      await expectHeadingVisible('Missile');\n+      await expect(page.locator('.st-hud__weapon-value')).toHaveText('Missile');\n+    } else {\n+      await page.getByRole('button', { name: 'Collapse arsenal' }).focus();\n+      await page.keyboard.press('Tab');\n+      await expect(panel).toBeFocused();\n+      await page.keyboard.press('Tab');\n+      await expect(page.locator('.st-hud__weapon-btn[data-weapon=\"baby_missile\"]')).toBeFocused();\n+      if (testInfo.project.name === 'small-window') {\n+        expect(await scrollDossierToBottom()).toBeGreaterThan(0);\n+      }\n+      await page.keyboard.press('Tab');\n+      await expect(missile).toBeFocused();\n+      await expect(panel).toHaveAttribute('data-weapon', 'missile');\n+      if (testInfo.project.name === 'small-window') await expectHeadingVisible('Missile');\n+      await expect(panel).toContainText('Balanced direct attack');\n+\n+      const dirtBomb = page.locator('.st-hud__weapon-btn[data-weapon=\"dirt_bomb\"]');\n+      await expect(dirtBomb).toBeVisible();\n+      await missile.click();\n+      if (testInfo.project.name === 'small-window') {\n+        expect(await scrollDossierToBottom()).toBeGreaterThan(0);\n+      }\n+      const beforeHover = await panel.boundingBox();\n+      await dirtBomb.hover();\n+      const afterHover = await panel.boundingBox();\n+      expect(afterHover?.y).toBeCloseTo(beforeHover!.y, 0);\n+      if (testInfo.project.name === 'small-window') {\n+        expect(afterHover?.height).toBeCloseTo(beforeHover!.height, 0);\n+      }\n+      await expect(panel).toHaveAttribute('data-weapon', 'dirt_bomb');\n+      if (testInfo.project.name === 'small-window') await expectHeadingVisible('Dirt Bomb');\n+      await expect(panel).toContainText('Raises a mound');\n+      await missile.hover();\n+      await expect(panel).toHaveAttribute('data-weapon', 'missile');\n+\n+      const snapshotPointerLayout = () => page.evaluate(() => {\n+        const panelNode = document.querySelector<HTMLElement>('.st-hud__weapon-intel')!;\n+        const gridNode = document.querySelector<HTMLElement>('.st-hud__strip-grid')!;\n+        const buttons = [...document.querySelectorAll<HTMLElement>('.st-hud__weapon-btn')]\n+          .filter((node) => getComputedStyle(node).display !== 'none')\n+          .map((node) => ({\n+            weapon: node.dataset['weapon'],\n+            offsetTop: node.offsetTop,\n+            offsetLeft: node.offsetLeft,\n+            offsetWidth: node.offsetWidth,\n+            offsetHeight: node.offsetHeight,\n+          }));\n+        return {\n+          panelHeight: panelNode.offsetHeight,\n+          gridTop: gridNode.offsetTop,\n+          gridHeight: gridNode.clientHeight,\n+          buttons,\n+        };\n+      });\n+      const pointerLayout = await snapshotPointerLayout();\n+      const visibleWeapons = page.locator('.st-hud__weapon-btn:not(.st-hud__weapon-btn--hidden)');\n+      for (let index = 0; index < await visibleWeapons.count(); index += 1) {\n+        const weaponButton = visibleWeapons.nth(index);\n+        const type = await weaponButton.getAttribute('data-weapon');\n+        const box = await weaponButton.boundingBox();\n+        await panel.evaluate((node) => {\n+          const tracked = node as HTMLElement & {\n+            weaponIntelObserver?: MutationObserver;\n+            weaponIntelTransitions?: string[];\n+          };\n+          tracked.weaponIntelTransitions = [];\n+          tracked.weaponIntelObserver?.disconnect();\n+          tracked.weaponIntelObserver = new MutationObserver((records) => {\n+            if (records.some((record) => record.type === 'attributes')) {\n+              tracked.weaponIntelTransitions!.push(tracked.dataset['weapon'] ?? '');\n+            }\n+          });\n+          tracked.weaponIntelObserver.observe(tracked, {\n+            attributes: true,\n+            attributeFilter: ['data-weapon'],\n+          });\n+        });\n+        await weaponButton.hover({ position: { x: box!.width / 2, y: Math.min(4, box!.height / 2) } });\n+        await expect(panel).toHaveAttribute('data-weapon', type!);\n+        await page.waitForTimeout(50);\n+        await expect(panel).toHaveAttribute('data-weapon', type!);\n+        const transitions = await panel.evaluate((node) => {\n+          const tracked = node as HTMLElement & {\n+            weaponIntelObserver?: MutationObserver;\n+            weaponIntelTransitions?: string[];\n+          };\n+          tracked.weaponIntelObserver?.disconnect();\n+          return tracked.weaponIntelTransitions ?? [];\n+        });\n+        expect(transitions.length).toBeLessThanOrEqual(1);\n+        if (transitions.length === 1) expect(transitions[0]).toBe(type);\n+        expect(await snapshotPointerLayout()).toEqual(pointerLayout);\n+      }\n+    }\n+\n+    const geometry = await page.evaluate(() => {\n+      const rect = (selector: string) =>\n+        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect().toJSON();\n+      const hudNode = document.querySelector<HTMLElement>('#hud')!;\n+      const panelNode = document.querySelector<HTMLElement>('.st-hud__weapon-intel')!;\n+      const targets = [...document.querySelectorAll<HTMLElement>('.st-hud__weapon-btn')]\n+        .filter((node) => node.getBoundingClientRect().height > 0)\n+        .map((node) => node.getBoundingClientRect().height);\n+      const app = document.querySelector<HTMLElement>('#app')!;\n+      const zoom = Number.parseFloat(getComputedStyle(app).zoom || '1');\n+      const physicalFontSize = (selector: string) =>\n+        Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(selector)!).fontSize) * zoom;\n+      return {\n+        drawer: rect('.st-hud__strip'),\n+        panel: rect('.st-hud__weapon-intel'),\n+        canvas: rect('#game'),\n+        hudScrollHeight: hudNode.scrollHeight,\n+        panelClientWidth: panelNode.clientWidth,\n+        panelScrollWidth: panelNode.scrollWidth,\n+        panelClientHeight: panelNode.clientHeight,\n+        panelScrollHeight: panelNode.scrollHeight,\n+        pageWidth: document.documentElement.scrollWidth,\n+        pageHeight: document.documentElement.scrollHeight,\n+        viewportWidth: window.innerWidth,\n+        viewportHeight: window.innerHeight,\n+        targets,\n+        fonts: {\n+          name: physicalFontSize('.st-hud__weapon-intel-name'),\n+          ammo: physicalFontSize('.st-hud__weapon-intel-ammo'),\n+          label: physicalFontSize('.st-hud__weapon-intel-label'),\n+          value: physicalFontSize('.st-hud__weapon-intel-value'),\n+        },\n+      };\n+    });\n+\n+    expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.drawer.left - 1);\n+    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.drawer.right + 1);\n+    expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.drawer.top - 1);\n+    expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.drawer.bottom + 1);\n+    expect(geometry.drawer.left).toBeGreaterThanOrEqual(geometry.canvas.right - 1);\n+    expect(geometry.hudScrollHeight).toBe(before);\n+    expect(geometry.panelScrollWidth).toBeLessThanOrEqual(geometry.panelClientWidth + 1);\n+    if (testInfo.project.name === 'desktop-fine') {\n+      expect(geometry.panelScrollHeight).toBeLessThanOrEqual(geometry.panelClientHeight + 1);\n+    } else {\n+      expect(geometry.panelClientHeight).toBeGreaterThan(0);\n+    }\n+    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);\n+    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight);\n+    if (testInfo.project.name === 'pixel-touch') {\n+      expect(Math.min(...geometry.targets)).toBeGreaterThanOrEqual(44);\n+    }\n+    if (testInfo.project.name === 'pixel-touch' || testInfo.project.name === 'small-window') {\n+      expect(geometry.fonts.name).toBeGreaterThanOrEqual(11.5);\n+      expect(geometry.fonts.ammo).toBeGreaterThanOrEqual(9.5);\n+      expect(geometry.fonts.label).toBeGreaterThanOrEqual(8.5);\n+      expect(geometry.fonts.value).toBeGreaterThanOrEqual(10.5);\n+    }\n+  });\n+});\n"
~~~~
