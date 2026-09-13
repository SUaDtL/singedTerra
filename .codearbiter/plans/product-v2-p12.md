# P12 implementation plan

| Task | Acceptance covered | Paths | Verification | Status |
| --- | --- | --- | --- | --- |
| T-01 strict ST1 codec | Exact bounded parse/serialize, privacy shape, registry drift refusal, URL collision rules | `client/src/client/seedChallenge.ts`, focused test | Client Vitest file | ACCEPTED |
| T-02 Quick Duel composer | Same operation/seed reconstructs two-seat Medium CPU config; trusted imported origin | `client/src/client/quickDuelLaunch.ts`, `client/src/ui/Lobby.ts`, focused test | Client Vitest files | ACCEPTED |
| T-03 receiver callout | Explicit click start, exact operation/objective/seed, generic inert failure | `client/src/ui/LobbyShellView.ts`, `client/src/ui/Lobby.ts`, focused tests | Client Vitest files | ACCEPTED |
| T-04 terminal sender and lifecycle | Eligible-only copy, fallback selection, focus/cleanup, restart retention, imported progression suppression | `client/src/main.ts`, `client/src/ui/HUD.ts`, `client/src/ui/TerminalMatchView.ts`, `client/src/ui/HUD.css`, focused tests | Client Vitest files | ACCEPTED |
| T-05 source compatibility gate | Exact production membership and SHA-256 drift guard in precheck/prebuild | `scripts/checks/seed_challenge_compatibility.mjs`, manifest, `package.json`, Node test | Node test and named check | ACCEPTED |
| T-06 bounded verification | Type sound and focused behavioral suite green; inherited merge index unchanged | P12 working diff | Focused tests, typecheck, diff check | ACCEPTED |


## Owner-requested Hot Seat repair

The owner reported unusable preparation and requested ImageGen before implementation.
The generated reference and exact prompt are in `docs/design/hot-seat-layout-reference.*`.

| Task | Acceptance | Verification | Status |
| --- | --- | --- | --- |
| T-07 mode preparation | Default Local Battle directly exposes crew; Practice and Verified are separate accessible tabs; edits survive tab changes | Focused Lobby unit tests and real browser journeys | ACCEPTED |
| T-08 responsive mockup implementation | Readable setup, smaller vehicle preview, persistent launch footer, actual touch/keyboard reachability | Desktop, small fine-pointer, landscape touch screenshots and geometry | ACCEPTED |
| T-09 integrated delivery | Full client, engine/build, browser and independent review; PR checks, merge, Pages publication | Parent-owned release evidence | Local gates and independent review PASS; PR/merge/Pages pending |

No simulation defaults, backend, account, or reward semantics change in this repair.
