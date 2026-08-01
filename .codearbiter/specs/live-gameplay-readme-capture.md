# Live Gameplay README Capture Spec

**Type:** documentation and visual-asset chore
**Approval:** maintainer standing passion-project sprint authority, logged per sprint

## Goal

Make the repository landing page show the exact current production game, including the enlarged active-tank identity card shipped in PR #253, instead of an older combat screenshot.

## Behavior contract

- Capture the deployed GitHub Pages build at the standard 1440x720 documentation viewport through the deterministic hot-seat entrypoint.
- Dismiss the splash overlay used by the existing live-smoke path and the one-time First Salvo coach through its real Skip control in an ephemeral browser context; do not mutate game state, durable user browser state, source, or production data.
- Preserve the full battlefield, Command Deck, ballistic computer, player status, active-turn portrait, movement fuel, Store, Fire, and collapsed Arsenal in one fitted frame.
- Replace `docs/assets/gameplay-command-rail.jpg` with an optimized JPEG derived from that production capture.
- Update the README alternative text so it describes the current active custom-tank portrait as well as the combat instruments.
- Do not change runtime code, tests, dependencies, lockfiles, backend, auth, crypto, migrations, workflows, issues, or task trackers.

## Approved surface

| File | Purpose |
| --- | --- |
| `.codearbiter/overrides.log` | Append the sprint-specific standing approval and later merge receipt. |
| `.codearbiter/sprint-log.md` | Append SMARTS, capture, verification, review, and hosted receipts. |
| `.codearbiter/specs/live-gameplay-readme-capture.md` | This approved contract. |
| `.codearbiter/plans/live-gameplay-readme-capture.md` | Governed execution plan. |
| `docs/assets/gameplay-command-rail.jpg` | Current production gameplay capture. |
| `README.md` | Accurate descriptive alternative text for the refreshed capture. |

## Acceptance

1. The capture comes from the exact deployed merge SHA `7eb0bb0bf86d2990a80fe07e361c72434d34f3d8`, whose Pages provenance and live smoke passed.
2. The JPEG is exactly 1440x720, visually crisp, bounded in size, and shows the complete single-page combat layout without splash, scrollbars, clipping, modals, or open overlays.
3. The active custom-tank portrait is visibly larger than in the replaced image and its barrel remains aligned inside the card.
4. README links and image loading remain valid; Markdown hygiene, build, secret scan, and diff checks pass.
5. One adversarial reviewer returns CLEAN / READY after every Critical, High, Medium, and merge blocker is corrected.
6. Delivery uses a PR, exact-head hosted CI, separately logged merge receipt, fresh final-head CI, squash merge, Pages provenance, and live smoke.
