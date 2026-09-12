# R16 terminal presentation and borrowed-state evidence

- **Task:** R16 — AC-057, AC-058, AC-059, AC-060
- **Base SHA:** `fd734f845eeb96ce5d5e93ef1c1c99630bf3c7fc`
- **Result SHA:** uncommitted lease diff on `codex/recovery-v2-r16`; no commit, staging, remote mutation, deployment, database, or settings action was made.
- **Worker:** `gpt-5.6-sol`, high reasoning; author session `01a0965d-3529-7a43-bb15-cc14b83d39e9`; tool receipt `fa0a3d`.
- **Sampling correction worker:** `gpt-5.6-sol`, high reasoning; session
  `01a096ae-c079-7101-be2a-02356193aee2`; tool receipt `8f1ce9`.
- **Immutable plan SHA-256:** `7B4CF398921FD9A324AC05215B2EE14E01729441E450FEEA2183DDC4C9E59F89`
- **Review result:** original author verification is green; fresh independent `gpt-6-astra` review is INCOMPLETE with sole MEDIUM R16-F1, pending parent browser acceptance. The review found no production defect.

## Changed paths

- `shared/src/types/GameState.ts`
- `shared/src/engine/GameEngine.ts`
- `client/src/client/GameClient.ts`
- `client/src/client/HotSeatClient.ts`
- `client/src/client/NetworkClient.ts`
- `client/src/client/matchPresentation.ts`
- `client/src/main.ts`
- `client/src/main.hotSeatProgression.test.ts`
- `client/src/client/matchPresentation.test.ts`
- `client/src/client/GameClient.borrowedState.test.ts`
- `scripts/checks/engine_clone_parity.mjs`
- `e2e/verified-deployment.spec.ts`
- `.codearbiter/reports/recovery-v2-r16-evidence.md`

## Corrected ownership boundary

`main.ts` no longer overwrites the live engine snapshot's `phase` and `winner`
when a verified duel reaches its salvo cap. `projectMatchPresentationState`
returns a frozen shallow wrapper with the adjudicated terminal phase/winner and
preserves every nested identity, including the 720,000-byte terrain buffer. The
same projected state now feeds the renderer, HUD/TerminalMatchView, Field Order,
live diagnostics, terminal-effect gate, aim/input gates, and AI gate. A complete
verified controller also rejects further input. Natural engine `GAME_OVER` states
pass through by identity.

The actual seed-17 six-shot fixture (`angle=0`, `power=5`) runs through the
production main listener for policy tuples V2 and V3. Before and after two
emissions, each controller retains the same state object with
`phase=PLAYER_TURN` and `winner=null`; its frozen replay result and frozen
transcript are byte-equivalent. The projected surfaces agree on terminal state,
winner, Field Order failure, locked diagnostics, and one completion submission.
The pinned outcomes remain V2 `human_win/p1/health/632/24155` and V3
`cpu_win/p2/health/830/24639`.

The borrowed type is deliberately narrow. `BorrowedGameState` protects only
top-level property assignments. Compile-negative checks cover the `GameClient`
interface, both concrete clients, all three listener forms, and the projector.
TypeScript structural assignability still permits a borrowed value to be passed
to a consumer declared as mutable, and nested arrays/elements plus the
`Uint8Array` buffer remain mutable shared storage. The runtime contract test
demonstrates this limitation. This evidence therefore does not claim deep or
runtime engine-state immutability. The only remaining client production-source
assignments to `phase`/`winner` are in the explicitly named, query-gated
`round-shop` and `victory` visual fixture branches; their cast is contained by a
fail-closed helper.

`GameEngine` separately takes a one-time shallow copy/freeze of scalar options,
copies/freezes the roster, and copies/freezes each optional loadout. These are
the only nested mutable `GameOptions` inputs. A clone can safely share that owned
configuration. The clone harness mutates the caller's roster, loadout, and
hazard selection after constructing the original and clone, then proves both
start the next round identically to a pristine control. This small construction
copy is separate from per-frame state publication.

## Regression-first evidence

No production implementation was written before these behavioral failures.

- `npm -w @singedterra/client run test -- --run src/main.hotSeatProgression.test.ts -t "projects a capped"`
  - Exit 1: both real-controller fixtures failed after the production listener
    emission. V2 changed the canonical state to `GAME_OVER/p1`; V3 changed it to
    `GAME_OVER/p2`; both required `PLAYER_TURN/null`.
- `npx tsx scripts/checks/engine_clone_parity.mjs`
  - Exit 1: caller mutation changed the retained original and clone roster,
    loadout, and hazard configuration used for the next round.

## Browser assertion correction

- Authoritative RED: parent browser run `exec41393` / `d33cc8`, recorded in
  `C:\Users\brenn\AppData\Local\Temp\recovery-v2-r16-terminal-visual.log`, exited 1
  for all three profiles at `e2e/verified-deployment.spec.ts:561`.
- The fixture supplies `prior.matchesPlayed = 10`; the three-entry catalog selects
  `10 % 3 = 1`, which is `Fire for Effect`. The browser therefore rendered the
  exact semantic text `Fire for Effect not achieved — CPU was damaged on 0 of 2
  required human salvos.` The assertion incorrectly expected `First Strike`.
- The assertion now matches that exact `Fire for Effect` text. No GREEN browser
  result is claimed here; the parent owns the rerun against the frozen production
  bundle. All later canonical-state, retry/resume, and receipt assertions remain
  unchanged.

## Final verification

| Command | Exit | Result |
| --- | ---: | --- |
| `npm -w @singedterra/client run test -- --run src/main.hotSeatProgression.test.ts` | 0 | 1 file, 62 tests passed, including real V2/V3 cap projection and retained-history resume. |
| `npm -w @singedterra/client run test -- --run src/client/matchPresentation.test.ts src/client/GameClient.borrowedState.test.ts` | 0 | 2 files, 3 tests passed. |
| `npx tsx scripts/checks/engine_clone_parity.mjs` | 0 | All clone fields, value equality, terrain independence, and original/clone option ownership passed. |
| `npm run coverage:client` | 0 | 207 files, 1906 tests; lines 93.98% (`8562/9110`), branches 83.91% (`5192/6187`). Existing jsdom canvas notices did not fail tests. |
| `npm run typecheck` | 0 | Shared and client strict TypeScript checks passed, including compile-negative contracts. |
| `npm run build` | 0 | 2733 modules transformed; production Vite build passed with its existing informational large-chunk warning. |
| `node --input-type=module -e <TypeScript transpileModule check for e2e/verified-deployment.spec.ts>` | 0 | Edited Playwright source has no TypeScript syntax diagnostic; no browser or server was launched. |
| `git diff --check` | 0 | No whitespace errors; Git emitted only line-ending conversion notices for existing tracked files. |

## Sandhog browser sampling correction

The integrated browser acceptance exposed a test-only sampling race in
`e2e/sandhog.spec.ts`. The production callback publishes a frozen copied probe
and renders the Canvas in one animation frame. The former test crossed that
frame boundary through multiple protocol polls and separate reads, so the
14-tick drill window could end between the successful poll, the next probe read,
and the later Canvas read.

The corrected test installs one bounded browser-side `requestAnimationFrame`
observer before firing. Each retained frame copies the frozen probe and reads
both Canvas pixels synchronously from the matching corridor witness. It retains
at most 128 frames, stops after the endpoint blast or 600 animation frames, and
cancels and removes the observer in `finally`. The assertions still require the
pre-shot terrain version, a cleared drill center at 14 or fewer burrow ticks, a
later lower tick count, increased terrain version, cleared center beside solid
earth, drill head more than 18 pixels beyond the witness, RGB distance greater
than 25, and the endpoint blast. A deliberate three-second runner-side read
delay proves the short observation survives protocol latency.

Authoritative pre-correction evidence was produced by the parent and is kept
separate from this worker's proof:

- `184fb8`, exit 1,
  `C:\Users\brenn\AppData\Local\Temp\recovery-v2-r16-general-browser.log`:
  327 passed, 18 skipped, and 3 failed: desktop-fine power-cap controls,
  pixel-touch Sandhog, and pixel-touch victory report.
- `a053b0`, exit 1,
  `C:\Users\brenn\AppData\Local\Temp\recovery-v2-r16-focused-failures.log`:
  7 passed, 2 skipped, and 3 failed; the unrelated power and victory cases
  passed while Sandhog failed in all three profiles with stale/null samples.
- `a91076`, exit 0,
  `C:\Users\brenn\AppData\Local\Temp\recovery-v2-sandhog-observation.log`:
  the read-only same-frame observer saw 10, 12, and 11 valid corridor frames in
  desktop-fine, pixel-touch, and small-window respectively, plus each endpoint
  blast. It made no production-source or engine mutation.

The corrected full run,
`C:\Users\brenn\AppData\Local\Temp\recovery-v2-r16-general-corrected.log`,
recorded 330 passed, 18 skipped, and 0 failed.

This worker ran the following correction proof against the unchanged sole
preview at `http://127.0.0.1:5198/`, with external traffic denied and the
expected backend origin set to that same origin:

```powershell
$env:E2E_LIVE_URL = 'http://127.0.0.1:5198/'
$env:E2E_DENY_EXTERNAL_NETWORK = '1'
$env:E2E_EXPECTED_BACKEND_ORIGIN = 'http://127.0.0.1:5198'
npx playwright test -c "$env:LOCALAPPDATA\Temp\recovery-v2-r16-sandhog-correction.config.ts" sandhog.spec.ts
```

The command result was `116bdb`, exit 0: all three profiles passed in 14.7
seconds with zero skips or unexpected results. Tracing was enabled for every
profile. The JSON report is
`C:\Users\brenn\AppData\Local\Temp\recovery-v2-r16-sandhog-correction-report.json`;
the three trace archives are under
`C:\Users\brenn\AppData\Local\Temp\recovery-v2-r16-sandhog-correction-artifacts`.
Their desktop-fine, pixel-touch, and small-window SHA-256 values are
`9064E821D9EADF81B881969C27247E4C88F34BA0897D9B958395442EFF8171E6`,
`23573762BBFFEB7967D94A4480917CF7DC247CAE289877F5623C0B62F876311A`,
and `B6EA3975EA402C0B96D7688F15362C7E837DC074E53B0C5B486FC30581A4D8B8`
respectively.
No build, server, backend, database, dependency, manifest, lockfile, commit,
staging, remote, or production action was run by this correction worker.

The explanatory terrain-size text in the leased comment and receipt paths now
matches `CANVAS_WIDTH=1200` by `CANVAS_HEIGHT=600`: one `Uint8Array` terrain is
720,000 bytes. Fixture-specific 400,000-byte test buffers outside this lease
were preserved.

Per parent coordination, this worker did not run `npm run check` or the CPU
benchmark. The parent owns the combined check. This worker reused the parent-owned
preview and Playwright closed the three targeted browser contexts after the run.

## Browser acceptance handoff

Against the parent-owned exact candidate on port 5198 with external traffic
denied, run the targeted `verified-deployment.spec.ts` terminal-retry journey at
wide, standard, and compact profiles. Its engine/controller is real: the stored
six-shot transcript is replayed by `VerifiedDuelController`; only account,
start, and completion HTTP responses are route mocks. Require the copied probe
to show canonical `PLAYER_TURN/null`, presented `GAME_OVER/p1`, and the exact V2
health result/ticks/transcript. Also require `Commander wins`, the missed Field
Order, disabled Fire, one retryable completion, resume, and the server-confirmed
receipt after retry.

Run `ordinary-guest-journey.spec.ts` as the natural-terminal control. It has no
`?e2e` engine-state fixture and reaches `Player 2 wins` through seven public
shots, then proves Play again returns to a ready match. The separate
`?e2e=victory-payoff` route remains a prepared presentation fixture and must not
be relabeled as natural engine-transition evidence. Capture direct visuals at
all three declared widths for R20; DOM assertions or screenshots alone are not
the responsive visual acceptance.

## Acceptance and remaining risks

- **AC-057 — covered locally:** capped presentation is detached; canonical state
  and the immutable V2/V3 replay result remain unchanged.
- **AC-058 — covered locally, browser pending:** natural/capped projection,
  retained resume history, renderer/HUD winner, Field Order, diagnostics, input,
  completion, and receipt wiring are exercised in source tests; direct browser
  acceptance remains with the parent.
- **AC-059 — covered:** projection identity assertions prove there is no terrain,
  collection, or nested-state copy. Only a shallow wrapper is allocated for a
  capped terminal presentation.
- **AC-060 — narrowly covered:** actual public/concrete publication APIs prevent
  top-level assignment at compile time and production mutation is removed. Deep
  mutation and TypeScript structural assignability remain explicit limitations.

Rollback must revert the projector, its consumers, and the borrowed API types
together. Revert the construction-option ownership copy with its clone harness
if compatibility evidence rejects it; do not replace either boundary with a
full-state copy loop.

Persistent process handles started by this worker: none. Localhost/browser
handles: none. Remote/API/database/deployment actions: none. `[NEEDS-TRIAGE]`
residue: none.
