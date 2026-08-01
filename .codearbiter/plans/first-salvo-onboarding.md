# Plan: First Salvo onboarding

Spec: `.codearbiter/specs/first-salvo-onboarding.md`

Status: spec and plan explicitly approved by the maintainer on 2026-07-31.

| Task | Status |
|---|---|
| T-01 — Establish the pure coach contract | completed |
| T-02 — Add the HUD presentation seam | completed |
| T-03 — Wire real local actions without touching lockstep | completed |
| T-04 — Prove responsive behavior | completed |
| T-05 — Document and verify | completed |
| T-06 — PR handoff | in progress |

## Task 1: Establish the pure coach contract

Create a client-only state-machine module with versioned persistence adapters and eligibility inputs.

TDD RED:

- Aim advances only on `set_angle`.
- Power + wind advances only on `set_power`.
- `fire` and `use_shield` complete from every active step.
- Unrelated actions do nothing.
- Skip, replay, completed preference, unavailable storage, CPU turns, remote turns, and non-turn phases are explicit.

TDD GREEN: implement the smallest pure API that satisfies those cases without importing engine implementation code.

## Task 2: Add the HUD presentation seam

Build the First Salvo card and target-highlighting API inside the existing HUD.

- Reuse current tokens, typography, glyphs, focus styles, and reduced-motion rules.
- Keep the card non-modal and the battlefield/control surfaces interactive.
- Add stable target hooks for Aim, Power + wind, and Fire.
- Add Skip and an accessible live-region update.
- Add Replay First Salvo to the existing pause panel.

TDD RED/GREEN: DOM tests prove copy, active-target selection, dismissal, replay callback, focusability, and idempotent updates.

## Task 3: Wire real local actions without touching lockstep

Create one local action-observation point in `main.ts` immediately before the unchanged `GameClient.sendAction` call.

- Start only on an eligible local human `PLAYER_TURN`.
- Observe keyboard, drag, and touch actions through the shared `InputHandler` emission path.
- Complete before or alongside forwarding a real fire action, never instead of it.
- Keep CPU and remote actions outside the coach.
- Resume the live match and restart the local coach from the pause-menu command.
- Add a narrow explicit query flag for deterministic E2E forcing.

Tests prove no duplicate sends and no changed `PlayerAction` payloads.

## Task 4: Prove responsive behavior

Add a focused Playwright spec using the existing desktop-fine, small-window, and pixel-touch projects.

- Force the coach without mutating unrelated storage.
- Progress with actual keyboard and touch controls.
- Assert card bounds remain inside the fixed stage, Fire remains usable, and the document does not scroll.
- Assert reduced-motion disables coach animation.

## Task 5: Document and verify

- Add a concise First Salvo note to `docs/PLAYING.md`.
- Run source-format and stale-copy scans.
- Run focused tests, typecheck, the deterministic harness suite, full client tests, production build, and focused production-browser checks.
- Run the state-free secret scan and adversarial review; correct every Critical/High finding and any valid lower-severity regression.

## Task 6: PR handoff

- Run the codeArbiter commit gate.
- Commit and push `codex/first-salvo-onboarding`.
- Open a ready pull request linked to the approved spec.
- Wait for every required check on the exact reviewed head.
- After the adversarial review is clean and every hosted check is green on the exact reviewed head, merge under the maintainer's standing authority and verify the GitHub Pages deployment before selecting the next sprint slice.
