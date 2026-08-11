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
