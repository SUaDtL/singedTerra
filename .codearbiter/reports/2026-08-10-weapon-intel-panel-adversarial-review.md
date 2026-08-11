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
