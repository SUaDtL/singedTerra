# Mobile Command Deck Showcase

## Problem

The README and maintained player documentation are already polished, but they
still describe the coarse-pointer controls as a generic eight-control dock and
never show the grouped Touch Command Deck that now ships on phones. That leaves
the strongest mobile improvement invisible at the repository's first impression
and lets player-facing terminology drift from the product.

## Decision

Add one authentic production-build Pixel 5 landscape capture and align the
small amount of mobile-control copy around the visible `Aim`, `Power`, `Drive`,
and utility groups. Preserve the existing README structure rather than rewriting
material that is already current and effective.

## SMARTS alternatives

| Lens | Full README rewrite | Text-only correction | Capture plus focused alignment |
|---|---|---|---|
| Scalable | Weak. Repeated rewrites make every visual sprint expensive. | Adequate. Copy can track controls but assets remain stale. | Strong. A focused showcase pattern can follow future visual milestones. |
| Maintainable | Weak. Broad churn obscures the few stale statements. | Strong. Three small copy edits are easy to maintain. | Strong. One named asset and three local edits stay reviewable. |
| Available | Indifferent. Repository docs remain available. | Indifferent. Repository docs remain available. | Indifferent. Repository docs remain available. |
| Reliable | Adequate. Broad review can catch drift but introduces more. | Adequate. Correct copy omits visual proof. | Strong. Production capture and matching copy demonstrate the shipped surface. |
| Testable | Weak. Large prose changes lack focused acceptance. | Strong. Exact terminology is mechanically checkable. | Strong. Exact copy, asset bounds, and rendered screenshot are checkable. |
| Securable | Indifferent. No runtime boundary changes. | Indifferent. No runtime boundary changes. | Indifferent. No runtime boundary changes. |

**Recommendation:** Capture plus focused alignment. Strength: **strong** —
Maintainable, Reliable, and Testable favor a visible, bounded correction without
disturbing the strong existing document.

## Requirements

- Capture the actual production bundle using the installed Playwright `Pixel 5
  landscape` device descriptor and the deterministic hot-seat E2E boot path.
- Show the grouped Touch Command Deck and tactical rail in a stable live match.
- Suppress the local First Salvo coach for the capture so it does not obscure the
  permanent interface; do not alter application defaults.
- Save the repository asset as `docs/assets/mobile-command-deck.jpg`, at least
  1600 physical pixels wide and no larger than 350 KiB.
- Add the capture to the README near the touch-control explanation with specific,
  accessible alt text.
- Describe the visible groups as `Aim`, `Power`, `Drive`, and utilities in the
  README and `docs/PLAYING.md`.
- Align `docs/UI_SYSTEM.md` with the visible `Drive` vocabulary while retaining
  the 44-by-44 CSS-pixel touch-target contract.
- Add no dependency and make no application, engine, network, backend, auth,
  secret, migration, or deployment-configuration change.

## Acceptance

- A focused pre-change check fails because the asset and aligned terminology do
  not exist; the same check passes after the change.
- Visual inspection confirms the capture is sharp, fitted, unobscured, and shows
  both the Command Deck and tactical rail.
- The asset meets the physical-width and file-size bounds.
- `npm run check`, `npm run build`, the state-free secret scan, and repository
  diff checks pass.
- One designated adversary returns no Critical, High, Medium, or merge-blocking
  finding before the PR is eligible for exact-head hosted CI.

## Non-goals

- No README redesign, new generated illustration, application screenshot mode,
  mobile control behavior change, or product-code refactor.
