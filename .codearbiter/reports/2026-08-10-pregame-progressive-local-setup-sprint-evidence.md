# Progressive Local Preparation Sprint Evidence

Date: 2026-08-10
Task: `ux.pregame.0003`
Branch: `codex/pregame-progressive-local-setup`
Base: `40c0b382377eec7d90ab4d93ec3701a10ba59288`

## Decision record

Production verification first closed the last nominal item from the 2026-08-10
adversarial player-experience audit: phone portrait showed the orientation handoff
with zero title splashes, and rotation reached the lobby without another action.
The audit's ranked remediation list was therefore complete.

SMARTS then ranked progressive Hot Seat preparation above whole-stage rescaling and
a test-only project-path repair. The selected slice directly reduces first-contact
ceremony, has a causal browser oracle, preserves valid defaults, and is bounded to
the local pregame view.

## Delivered behavior

- A valid two-player setup now presents **Battery ready**, the current player count,
  and the dominant **Deploy local battle** action without exposing every setup field.
- One native **Customize crew and battlefield** disclosure owns the unchanged Crew
  Manifest and Battlefield Protocol controls.
- The disclosure remains open across stateful rerenders and is forced open while
  validation is invalid.
- Expanded preparation suppresses redundant route headings so the unchanged setup
  and launch action remain simultaneously contained at zero scroll on desktop,
  Pixel touch, and small-window layouts.
- Existing Garage, Advanced Settings, sidewall, mobility, and match-setup browser
  journeys explicitly open customization through one shared test helper.

## Test-first evidence

### RED

- `npm -w @singedterra/client run test -- LobbyHotSeatView.test.ts`
  failed 3/5 on the absent ready summary, disclosure, and open invalid state.
- Isolated production-bundle Playwright failed causally because
  `.lobby-hotseat-ready` did not exist.
- A second geometry RED proved the expanded launch action ended 34.1 rendered pixels
  below the desktop card before the expanded-state compaction.

### GREEN and mutation proof

- Focused unit: 5/5 passed.
- Focused production browser: 3/3 passed across all supported projects.
- Full pregame command shell: 23 passed, 1 expected skip.
- Mutation: forcing `customization.open = true` made the browser contract fail on
  the unexpected `open` attribute; the mutation was reverted and the matrix returned
  green.
- The full suite exposed old journeys that assumed setup was visible. One explicit
  `openHotSeatCustomization()` helper repaired only those journeys. An initial broad
  run also omitted the benign public Playwright Supabase fixture env; that harness
  error was diagnosed, rebuilt with CI-equivalent values, and not counted as product
  evidence.

## Final verification on the exact working diff

- Client unit suite: 150 files, 1,171 tests passed.
- Client coverage: 93.40% statements, 83.89% branches, 87.54% functions,
  95.41% lines.
- `npm run check`: passed, including deterministic engine and repository harnesses.
- `npm run check:edge`: 267 passed, 0 failed.
- `npm run audit:deps`: 0 vulnerabilities.
- `npm run build`: passed.
- Full corrected CI-equivalent production-bundle browser matrix: 258 passed,
  30 expected skips, 0 failed across 288 cases.
- Visual inspection completed for closed and expanded desktop states; both are
  contained, and expanded launch remains in frame.

## Scope and deployment

Client UI and tests only. No engine, gameplay defaults, network contract,
persistence, Auth, Supabase function, database, dependency, or migration change.
Pages deployment only after exact-head hosted CI; no Supabase deployment is needed.

H-05 was respected: `.codearbiter/sprint-log.md` was neither read nor edited.

## Adversarial review correction

The exact staged review at hash `d7e975022c5f83a96ca4e07fe86fe860f9fbff9b`
returned one Important merge blocker: name edits use a lightweight launch-state
refresh, so the disclosure's render-time validation snapshot could become stale and
allow a newly invalid setup to close under a false **Battery ready** message.

The finding was reproduced test-first with a real-browser valid-to-invalid-to-valid
transition. The disclosure now carries live `data-invalid` state; the existing
refresh updates it, forces the invalid setup open, and records its open state, while
the native toggle guard reads the current value. The regression passes 3/3 on
desktop, Pixel touch, and small-window. The corrected exact diff must receive a fresh
adversarial review before commit.

The corrected staged diff at hash
`c6edcff4530d5b1dec058b69b9750af2fb151657` then received a fresh adversarial
PASS with no Critical, High, Important, or other merge-blocking findings. The
reviewer independently reran the focused unit suite, the three-project live
validation regression, typecheck, and diff integrity checks against that hash.
