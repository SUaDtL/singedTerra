# Command Center Launcher Overhaul Implementation Plan

**Spec:** `.codearbiter/specs/command-center-launcher-overhaul.md`
**Task:** `ux.pregame.0001`
**Status:** approved by the user on 2026-09-17
**Delivery mode:** `$ca-sprint`, premium subagents, no Astra

## Goal

Replace the flat launcher with an extensible command-center shell while preserving existing campaign, operation, local, online, account, and battle owners. Land the real Ash Road vertical slice on a draft PR for visual acceptance before carrying the visual system through every remaining workspace.

## Global constraints

- Test first for every behavioral task; each task requires a demonstrated RED, minimal GREEN, and fresh verification.
- No new dependency, backend, schema, protocol, deterministic-engine, or save-payload change.
- Do not use Astra for planning, implementation, or launcher review.
- Use only admitted kit assets and existing repository art; do not copy prototype data or treat the kit's product model as authoritative.
- Preserve ADR-0010/0011 owner boundaries and ADR-0018 battle-console ownership.
- `.codearbiter/sprint-log.md` is append-only.
- Never merge or deploy in this sprint. Open a draft PR and stop at the explicit visual-acceptance checkpoint before styling the remaining workspaces.

## File map

- `client/index.html`: unscaled pre-game root and unchanged scaled battle root.
- `client/src/main.ts`: application-surface transitions, launch success/failure handoff, and exact focus restoration.
- `client/src/style.css`: page-level surface composition and portrait/scroll rules.
- `client/src/ui/ApplicationSurface.ts`: `pregame | launching | battle` controller.
- `client/src/ui/ApplicationSurface.test.ts`: inertness, accessibility visibility, and transition contract.
- `client/src/ui/OrientationGate.ts` and test: battle/launching-only portrait enforcement.
- `client/src/ui/commandCenter/contracts.ts`: contribution/view/save presentation contracts.
- `client/src/ui/commandCenter/registry.ts` and test: deterministic ordering, availability, context entry, and session-only selection.
- `client/src/ui/commandCenter/CommandCenterShell.ts` and test: rail/sheet, library, mounting, disposal, focus, and stale-generation guards.
- `client/src/ui/commandCenter/CommandCenter.css`: the single command-console layout and responsive visual system.
- `client/src/ui/commandCenter/assets/`: admitted kit chrome/icons only.
- `client/src/ui/commandCenter/CampaignCommandView.ts` and test: Ash Road workspace and primary action hierarchy.
- `client/src/ui/commandCenter/CampaignSavePresentation.ts` and test: seven-state save projection.
- `client/src/ui/commandCenter/CampaignRunReplacement.ts` and test: confirmed compare-and-swap replacement.
- `client/src/ui/commandCenter/SkirmishCommandView.ts` and test: `QUICK_OPERATIONS`, First Salvo, and challenge adapters.
- `client/src/ui/commandCenter/MultiplayerCommandView.ts` and test: Local/Online adapters.
- `client/src/ui/Lobby.ts` and focused tests: retain existing owners while contributing/mounting views.
- `client/src/ui/LobbyShellView.ts`: remove the superseded flat chooser after adapters are live.
- `client/src/ui/LobbyConsole.css`: remove superseded chooser/positional rules; keep only still-owned subview rules or delete after migration.
- `e2e/pregame-command-center.spec.ts`: entry priority, responsive geometry, focus, scroll, fallback, and launch/return behavior.
- Existing campaign, lobby, invite, rejoin, quick-duel, Garage, accessibility, and orientation tests: regression proof.

## Execution ledger

| ID | Status | Task | Exact paths | Verification / observable | Maps to | Covers | Depends on |
|---|---|---|---|---|---|---|---|
| T01 | ACCEPTED | Pin the application-surface state in failing tests, then add the minimal controller and move the pre-game root outside `#app` without changing the battle tree. | `client/index.html`; `client/src/ui/ApplicationSurface.ts`; `client/src/ui/ApplicationSurface.test.ts`; `client/src/style.css` | Focused test first fails for missing controller; then proves inert/hidden/ARIA state for all three surfaces and DOM separation. | `AC-01`, `AC-13`, `AC-17` | root ownership, lifecycle visibility | — |
| T02 | ACCEPTED | Make the portrait orientation gate surface-aware and prove portrait preparation remains usable while launching/battle stay gated. | `client/src/ui/OrientationGate.ts`; `client/src/ui/OrientationGate.test.ts`; `client/src/main.ts` | Focused unit test RED/GREEN; existing portrait Playwright contract remains green for battle. | `AC-01`, `AC-16` | portrait lifecycle | T01 |
| T03 | ACCEPTED | Define the contribution, mounted-view, save-presentation, stable-ID, and availability types without moving domain ownership. | `client/src/ui/commandCenter/contracts.ts`; `client/src/ui/commandCenter/contracts.test.ts` | Type-level fixture compilation and runtime availability tests fail before types/guards, then pass. | `AC-03`, `AC-04`, `AC-09` | extension seam | T01 |
| T04 | ACCEPTED | Build the deterministic registry/context resolver and session-only selection store with invalid/unavailable fallback. | `client/src/ui/commandCenter/registry.ts`; `client/src/ui/commandCenter/registry.test.ts` | Tests cover ordering, invite/rejoin > campaign > First Salvo > Quick Duel, imported challenge context, invalid memory, and no local persistence. | `AC-03`, `AC-05`, `AC-06` | context/memory | T03 |
| T05 | ACCEPTED | Build the semantic shell mount lifecycle: category rail, Modes sheet, item library, one workspace, exact disposal, stale callback rejection, and stable focus targets. | `client/src/ui/commandCenter/CommandCenterShell.ts`; `client/src/ui/commandCenter/CommandCenterShell.test.ts` | Focused tests prove keyboard activation, sheet labelling, one mounted view, disposal once, generation rejection, and registry-only growth. | `AC-02`, `AC-03`, `AC-04`, `AC-15` | shell behavior | T03, T04 |
| T06 | ACCEPTED | Admit and install only validated kit chrome/material/icon assets; add semantic icon rendering and fallback behavior. | `client/src/ui/commandCenter/assets/**`; `client/src/ui/commandCenter/CommandIcon.ts`; `client/src/ui/commandCenter/CommandIcon.test.ts` | Digest copy audit, SVG safety assertions, accessible-name tests, and missing-asset fallback pass. | `AC-07`, `AC-14`, `AC-16` | asset provenance | T05 |
| T07 | ACCEPTED | Add a seven-state campaign-save projector that does not collapse incompatibility or unavailability into empty state and rejects stale async generations. | `client/src/ui/commandCenter/CampaignSavePresentation.ts`; `client/src/ui/commandCenter/CampaignSavePresentation.test.ts`; `client/src/ui/Lobby.ts` | Focused tests cover all seven states, async race rejection, and account-refresh stability. | `AC-04`, `AC-06`, `AC-09` | save presentation | T03, T04 |
| T08 | ACCEPTED | Add confirmed, revision-checked new-run replacement over `CampaignStorage.compareAndSwap`; preserve newer data on cancel/conflict and avoid raw deletion. | `client/src/ui/commandCenter/CampaignRunReplacement.ts`; `client/src/ui/commandCenter/CampaignRunReplacement.test.ts`; `client/src/campaign/storage.ts` only if a narrow existing primitive cannot express the CAS | Regression test first fails for current unconditional new-run behavior; then covers accept, cancel, expected revision, and conflict recovery. | `AC-10` | safe restart | T07 |
| T09 | ACCEPTED | Mount the real Ash Road contribution/workspace with mission, objective, kit, save state, and exactly one Start/Resume primary action; route map and briefing are secondary disclosure. | `client/src/ui/commandCenter/CampaignCommandView.ts`; `client/src/ui/commandCenter/CampaignCommandView.test.ts`; `client/src/ui/Lobby.ts`; existing campaign view helpers as needed | Focused DOM tests prove hierarchy, truth states, callbacks, disclosure semantics, and 44px controls. Existing campaign behavior tests remain green. | `AC-07`, `AC-08`, `AC-09`, `AC-10`, `AC-15` | Ash Road vertical slice | T05, T07, T08 |
| T10 | ACCEPTED | Connect application-surface transitions to session acquisition so launching retains the initiating workspace, success alone enters battle, and failures restore exact item/focus/retry ownership. | `client/src/main.ts`; `client/src/ui/Lobby.ts`; focused session-lifecycle and return-focus tests | Tests fail on current early `lobby.hide()`/Online-forced recovery, then prove campaign/local/online failure restoration and successful handoff. | `AC-06`, `AC-13` | launch/return lifecycle | T01, T05, T09 |
| T11 | ACCEPTED | Apply the campaign-first command-console visual system and delete superseded flat-chooser/positional rules instead of adding overrides. | `client/src/ui/commandCenter/CommandCenter.css`; `client/src/style.css`; `client/src/ui/LobbyConsole.css`; `client/src/ui/LobbyShellView.ts`; `client/src/ui/Lobby.ts` | Production-browser assertions start RED and finish green for hierarchy, 44px targets, scroll, long labels, missing decoration, focus, reduced motion, forced colours, and 200% zoom. Diff inspection shows obsolete chooser CSS removed. | `AC-02`, `AC-07`, `AC-14`, `AC-15`, `AC-16`, `AC-17` | campaign visual slice | T05, T06, T09, T10 |
| T12 | ACCEPTED | Add real-browser command-center coverage across wide, standard, compact touch, portrait, and short landscape, including surface transitions and match return. | `e2e/pregame-command-center.spec.ts`; Playwright config only if an existing project cannot express a required viewport | Focused production-bundle Playwright run records geometry and direct visual evidence with no overflow or hidden primary action. | `AC-01`, `AC-02`, `AC-06`, `AC-13`, `AC-15`, `AC-16`, `AC-19` | visual proof | T11 |
| T13 | ACCEPTED | Run focused/full vertical-slice verification, two-pass review, commit through the CodeArbiter gate, push, and open a draft PR explicitly marked incomplete pending visual acceptance. | changed files; PR metadata | Focused tests, `npm run test:client`, `npm run typecheck`, `npm run check`, `npm run build`, `npm run audit:deps`, secret scan, `git diff --check`, exact-head review; draft PR URL and visual evidence available. | `AC-18`, `AC-19` | first delivery checkpoint | T12 |
| G01 | ACCEPTED | **USER VISUAL ACCEPTANCE GATE:** stop. Present the real wide/standard/compact/portrait Ash Road command center from the draft PR. Do not style remaining Skirmishes/Multiplayer workspaces until accepted. | draft PR; visual evidence | Explicit user acceptance or a bounded correction list. | `AC-19` | product quality gate | T13 |
| T14A | ACCEPTED | Extend the accepted command-console hierarchy to the existing in-game Command Menu without changing battle-console or pause lifecycle ownership. | `client/src/ui/HUD.ts`; `client/src/ui/HUD.css`; `client/src/ui/hudIcons.ts`; focused HUD tests; `e2e/command-menu.spec.ts` | RED/GREEN unit contracts plus production-browser desktop, compact-touch, and short-landscape geometry prove one linked header, one dominant Resume action, subordinate utilities, separated lobby exit, 44px targets, focus, isolation, settings/replay routing, and visual coherence. | approved 2026-09-17 command-menu extension | in-game command menu | G01 |
| T14 | ACCEPTED | Adapt Skirmishes to the contribution model with every `QUICK_OPERATIONS` item, First Salvo, validated imported challenge, selected facts, and one launch action. | `client/src/ui/commandCenter/SkirmishCommandView.ts`; test; `client/src/ui/Lobby.ts`; quick-operation helpers | Focused tests cover all operations, contextual entries, validation ownership, payload parity, and one-primary hierarchy. | `AC-05`, `AC-11`, `AC-13` | Skirmishes | G01 |
| T15 | ACCEPTED | Adapt Multiplayer Local Battle with existing crew, battlefield, Garage, validation, and start owners inside one owned workspace. | `client/src/ui/commandCenter/MultiplayerCommandView.ts`; test; existing Local/Garage view builders; `client/src/ui/Lobby.ts` | Local setup/Garage/callback tests and responsive browser path pass without payload drift. | `AC-12`, `AC-13`, `AC-15` | Local Battle | G01 |
| T16 | ACCEPTED | Adapt Online with existing create/join/browse/waiting/invite/rejoin owners and lifecycle semantics inside one owned workspace. | same Multiplayer paths; existing online view builders/tests; `client/src/ui/Lobby.ts` | Invite, rejoin, create, join, browse, waiting, retry, token/generation, and teardown suites pass; no transport shape changes. | `AC-05`, `AC-12`, `AC-13` | Online | T15 |
| T17 | ACCEPTED | Remove the final superseded chooser builders and positional CSS; exercise registry growth and all category/item focus transitions. | `client/src/ui/LobbyShellView.ts` and test; `client/src/ui/LobbyConsole.css`; command-center registry/shell tests | No dead flat chooser markup/classes remain; synthetic category/item fixture mounts without shell edit; keyboard/focus suite green. | `AC-03`, `AC-04`, `AC-14`, `AC-15` | cleanup/extension proof | T14, T16 |
| T18 | ACCEPTED | Complete full responsive/browser regression across Campaigns, Skirmishes, Local, Online, invite/rejoin, save states, asset failure, accessibility preferences, and battle entry/return. | command-center E2E and existing relevant E2E suites | Production build passes the full requested geometry/interaction matrix and direct visual review. | `AC-05`–`AC-17` | integrated product proof | T17 |
| T19 | ACCEPTED | Run complete fresh verification, adversarial two-pass review, exact-head PR review, and sprint receipt; update the draft PR but do not merge or deploy. | all changed files; governance artifacts; PR metadata | All `AC-18` commands and hosted required checks are green on the exact PR head; zero unresolved block findings; PR remains draft/open unless user separately directs otherwise. | `AC-18` | sprint close | T18 |

## Acceptance mapping

- Application shell and lifecycle: T01, T02, T10, T12.
- Contribution architecture, context, memory, and lifetime: T03–T05, T07, T17.
- Campaign slice and save safety: T07–T10.
- Visual system and responsive/accessibility proof: T06, T11–T13, G01, T18.
- Skirmishes and Multiplayer behavior: T14–T16.
- Complete verification and open draft PR: T13, T19.

## Delivery boundary

T01–T13 form the first independently reviewable vertical slice. `G01` is an intentional user gate inherited from the approved delivery plan, not an autonomous sprint ambiguity. Work after G01 remains `PENDING` until the user accepts the real Ash Road visual system or supplies corrections. The branch and draft PR stay open throughout; there is no merge or deployment step.

## Needs triage

- `[HARVESTED]` T02's two unchanged OrientationGate prose separators are queued as `sprint:command-center-launcher-overhaul#triage-1`; they remain outside this completed product slice.
- `[RESOLVED]` T12's legacy global-chooser fixture was migrated through the accepted T14-T18 Skirmishes/Multiplayer work and needs no follow-up.

## Feature-interior revision ledger — Local Battle + shared Garage

**Revision status:** approved under `$ca-sprint` on 2026-09-18 from the maintainer's explicit PR #515
workspace-finish brief. This ledger extends the existing sprint and PR; it is not a parallel backlog.
The later Online, Verified, Settings, and dossier slices remain behind `G02` and will be decomposed only
after the accepted Local/Garage treatment provides their real component baseline.

### Revision acceptance ledger

- `AC-20` preserves and records the accepted command surfaces.
- `AC-21` through `AC-25` define the Local Battle crew-preparation composition and retained rules.
- `AC-26` through `AC-30` define the shared Garage, direct choices, lifecycle, and input behavior.
- `AC-31` defines the native visual evidence matrix.
- `AC-32` defines fresh verification and the draft/unmerged delivery boundary.
- `AC-33` is the owner visual gate before any later workspace propagation.

### Ordered revision tasks

| ID | Status | Task | Exact paths | Verification / observable | Maps to | Covers | Depends on |
|---|---|---|---|---|---|---|---|
| T20 | ACCEPTED | Pin the baseline and add failing semantic assertions for one Local crew-preparation composition, explicit selected-seat state, roster identity facts, effective rules, and one Deploy action. | `client/src/ui/LobbyHotSeatView.test.ts`; `client/src/ui/Lobby.garage.test.ts`; `client/src/ui/commandCenter/MultiplayerCommandView.test.ts` | Focused Vitest begins RED for the absent workspace/seat/inspection contracts while all retained callback and payload assertions stay enabled. | `AC-20`, `AC-21`, `AC-22`, `AC-24` obligations | `AC-20`, `AC-21`, `AC-22`, `AC-24` | T19 |
| T21 | ACCEPTED | Recompose the Local builder into heading, crew/rules content, and bounded decision regions without moving setup or launch ownership. | `client/src/ui/LobbyHotSeatView.ts`; `client/src/ui/LobbyPreparationSection.ts`; focused tests | T20 tests pass for one coherent semantic hierarchy, one primary action, retained validation, and exact two-to-four-seat controls. | `AC-21`, `AC-24` obligations | `AC-21`, `AC-24` | T20 |
| T22 | ACCEPTED | Make each roster row an explicit selectable crew seat with name, controller, colour, and named appearance, routing all interactions to the existing spotlight owner. | `client/src/ui/Lobby.ts`; `client/src/ui/tankPartLabels.ts`; `client/src/ui/Lobby.garage.test.ts` | RED/GREEN proves Player 2 selection follows name/controller/colour/Customize interactions, updates only Player 2, and emits the unchanged exact launch payload. | `AC-22`, `AC-25` obligations | `AC-22`, `AC-25` | T20, T21 |
| T23 | ACCEPTED | Reframe the selected vehicle inspection with the existing painter, named build summary, and Customize intent; remove pseudo-terrain markup/styles without stretching the canvas. | `client/src/ui/Lobby.ts`; `client/src/ui/Lobby.css`; `client/src/ui/commandCenter/CommandCenter.css`; `client/src/ui/Lobby.garage.test.ts` | Focused tests and live browser inspection prove the selected owner, spotlight signature, named parts, and absence of decorative terrain layers. | `AC-22`, `AC-23` obligations | `AC-22`, `AC-23` | T22 |
| T24 | ACCEPTED | Establish the bounded shared interior treatment for Local panels, fields, named selections, facts, secondary actions, colour chips, and safe primary action. | `client/src/ui/LobbyConsole.css`; `client/src/ui/commandCenter/CommandCenter.css`; `client/src/ui/commandCenter/CommandCenterStyle.test.ts` | Style-contract RED/GREEN proves readable type, 44px targets, subordinate chips, distinct selected/taken/focus states, and no regression to accepted header/campaign selectors. | `AC-20`, `AC-21`, `AC-25`, `AC-30` obligations | `AC-20`, `AC-21`, `AC-25`, `AC-30` | T21, T22, T23 |
| T25 | ACCEPTED | Add Local desktop, four-seat, compact-landscape, portrait, narrow-phone, long-name, and validation geometry coverage, then implement the single-scroll-owner reflow. | `client/src/ui/commandCenter/CommandCenter.css`; `client/src/ui/Lobby.css`; `e2e/pregame-command-center.spec.ts` | Production-browser assertions start RED and finish green for reachability, no horizontal overflow/clipping, selected-seat visibility, and one reachable Deploy action. | `AC-21`, `AC-24`, `AC-25`, `AC-30` obligations | `AC-21`, `AC-24`, `AC-25`, `AC-30` | T24 |
| T26 | ACCEPTED | Add failing editor tests for owner identity, internal live preview, true preset thumbnails, cosmetic copy, and four direct legal choices per component. | `client/src/ui/LobbyGarageView.test.ts`; `client/src/ui/Lobby.garage.test.ts`; `client/src/renderer/TankLoadoutPreview.test.ts` | Focused Vitest begins RED for the missing editor preview/thumbnails/direct variants while current Done/Escape and immediate-edit tests remain active. | `AC-26`, `AC-27`, `AC-28` obligations | `AC-26`, `AC-27`, `AC-28` | T20 |
| T27 | ACCEPTED | Mount the assembled owner tank and four true preset thumbnails inside the shared editor through the existing painter, with signature-safe refresh and detached-view cleanup. | `client/src/ui/LobbyGarageView.ts`; `client/src/renderer/TankLoadoutPreview.ts`; `client/src/ui/Lobby.ts`; focused tests | T26 preview tests pass for live owner colour/loadout, painter fallback/late readiness, replacement signatures, and retired editor cleanup. | `AC-26`, `AC-29` obligations | `AC-26`, `AC-29` | T26 |
| T28 | ACCEPTED | Replace cycle-only component buttons with a semantic slot selector and direct named family variants while preserving immediate mutation and current-owner callbacks. | `client/src/ui/LobbyGarageView.ts`; `client/src/ui/tankPartLabels.ts`; `client/src/ui/LobbyGarageView.test.ts`; `client/src/ui/Lobby.garage.test.ts` | RED/GREEN covers all 16 slot/family combinations, mixed assemblies, selected state, immediate Local updates, Done/Escape, and exact focus restoration without Cancel. | `AC-27`, `AC-28`, `AC-30` obligations | `AC-27`, `AC-28`, `AC-30` | T26, T27 |
| T29 | ACCEPTED | Compose the editor as one command-workshop dialog with internal inspection, preset rail, component choices, cosmetic note, controlled overflow, and truthful action hierarchy. | `client/src/ui/Lobby.css`; `client/src/ui/LobbyConsole.css`; `client/src/ui/commandCenter/CommandCenter.css`; style tests | Style and production-browser checks prove useful tank size, named visible choices, 44px targets, one scroll owner, compact sticky inspection where supported, and no hidden encoded initialisms. | `AC-26`, `AC-27`, `AC-28`, `AC-30` obligations | `AC-26`, `AC-27`, `AC-28`, `AC-30` | T24, T27, T28 |
| T30 | ACCEPTED | Exercise the same editor through Local, Online create, and Online waiting owners, including busy/rejection/acknowledgement and stale/disposed callbacks, without restyling Online itself. | `client/src/ui/Lobby.garage.test.ts`; `client/src/ui/Lobby.network.test.ts`; `client/src/ui/Lobby.sessionStaleActions.test.ts`; `client/src/ui/commandCenter/MultiplayerCommandView.test.ts`; production code only if a failing retained contract exposes a defect | Focused tests prove one editor implementation, owner-correct mutations, disabled/busy behavior, rejection recovery, server acknowledgement, and stale lifetime containment. | `AC-29`, `AC-30` obligations | `AC-29`, `AC-30` | T27, T28, T29 |
| T31 | ACCEPTED | Run the Local/Garage interaction and visual matrix and retain native screenshots plus metadata for default two-seat, modified Player 2, four-seat, and open-editor states. | `e2e/pregame-command-center.spec.ts`; `.codearbiter/evidence/command-center-workspace-finish/**` | Chromium passes pointer/keyboard/touch, focus return, scroll, 200% reflow, reduced motion, forced colours, and art-failure checks at 1920×1080, 1440×900, 3440×1440, 844×390, 390×844, and 320×568 where supported; native captures and detail crops record viewport/DPR/zoom/browser/state/commit. | `AC-23` through `AC-31` obligations | `AC-23`, `AC-24`, `AC-25`, `AC-26`, `AC-27`, `AC-28`, `AC-29`, `AC-30`, `AC-31` | T25, T29, T30 |
| T32 | ACCEPTED | Run fresh focused/full verification and two-pass non-Astra review; commit through the gate, update draft PR #515, and preserve the live 4173 preview without merge or deploy. | all revision files; `.codearbiter/sprint-log.md`; `.codearbiter/plans/command-center-launcher-overhaul.md`; PR metadata | Focused tests, full client suite, typecheck, `npm run check`, build, audit, secret scan, `git diff --check`, exact-head review, and hosted CI are green; PR remains draft/open and localhost 4173 serves the updated checkout. | `AC-20`, `AC-32` obligations | `AC-20`, `AC-32` | T31 |
| G02 | PENDING | **OWNER VISUAL ACCEPTANCE GATE:** present full-size Local + Garage default and modified evidence, then stop. Do not propagate the treatment to Online room access, Verified Operations, Match settings, or the dossier until the maintainer accepts or supplies a bounded revision list. | draft PR #515; `.codearbiter/evidence/command-center-workspace-finish/**` | Explicit maintainer visual acceptance or a bounded correction brief. | `AC-33` obligation | `AC-33` | T32 |

### G02 bounded visual-correction ledger

The maintainer supplied a bounded correction brief at `G02`: the first Local/Garage implementation is
under-scaled and wastes large-display space, and the same composition failure is demonstrated in
Verified Operations and Online. `G02` remains pending. These tasks correct the shared cause and the
three evidenced workspaces only; Match settings and the commander dossier remain excluded.

| ID | Status | Task | Exact paths | Verification / observable | Maps to | Covers | Depends on |
|---|---|---|---|---|---|---|---|
| T33 | ACCEPTED | Add failing browser geometry contracts for large-display deck utilization and coherent Local, Verified, and Online content spans without weakening the existing compact, focus, or lifecycle assertions. | `e2e/pregame-command-center.spec.ts`; test support only if required | Against the accepted T32 head, 1440×900 remains bounded while approximately 2272×1170 and 3440×1440 fail for the fixed-width deck, shallow Local cluster, Verified wallpaper overlay, and Online content islands. | `AC-34` through `AC-38` obligations | `AC-34`, `AC-35`, `AC-36`, `AC-37`, `AC-38` | T32 |
| T34 | ACCEPTED | Replace the fixed-large-display shell proportions with bounded fluid deck, navigation, library, type, and spacing scales while preserving the accepted header assembly and narrow Modes-sheet reflow. | `client/src/ui/commandCenter/CommandCenter.css`; focused style contracts | Large-display deck and shell regions meet the new geometry contracts; standard, 200% reflow, compact, portrait, forced-colour, and reduced-motion contracts remain green. | `AC-34`, `AC-38` obligations | `AC-34`, `AC-38` | T33 |
| T35 | ACCEPTED | Recompose Local Battle so crew, vehicle inspection, rules, validation, and deployment form one height-aware preparation sequence rather than a top cluster and remote footer. | `client/src/ui/LobbyHotSeatView.ts`; `client/src/ui/commandCenter/CommandCenter.css`; focused Local tests | Two- and four-seat Local states use the workspace deliberately at standard and ultrawide sizes, retain one scroll owner and one Deploy action, and preserve exact setup/launch payloads. | `AC-35`, `AC-38` obligations | `AC-35`, `AC-38` | T33, T34 |
| T36 | ACCEPTED | Recompose Verified Operations into bounded battlefield context plus a materially sized orders workspace; remove the desktop rule that collapses the actionable region to a top-right overlay. | `client/src/ui/commandCenter/MultiplayerCommandView.ts`; `client/src/ui/commandCenter/CommandCenter.css`; focused Verified tests | Tabs, dossier, constraints, and launch action occupy a coherent peer region beside bounded art at standard and ultrawide widths; authenticated behavior and payloads are unchanged. | `AC-36`, `AC-38` obligations | `AC-36`, `AC-38` | T33, T34 |
| T37 | ACCEPTED | Recompose Online vehicle, commander, operation profile, protocol, alternate routes, and primary action into a continuous preparation workspace without changing create/join/browse/waiting/invite/rejoin owners. | `client/src/ui/Lobby.ts`; `client/src/ui/commandCenter/CommandCenter.css`; focused Online tests | Create and existing alternate Online routes avoid separated content islands, keep the primary decision near its supporting facts, and retain busy/retry/acknowledgement/stale-view semantics. | `AC-37`, `AC-38` obligations | `AC-37`, `AC-38` | T33, T34 |
| T38 | ACCEPTED | Run the full native visual matrix on the sole existing `127.0.0.1:4173` listener, refresh evidence, complete fresh non-Astra review and verification, commit through the gate, and update draft PR #515 without merge or deployment. | correction files; `.codearbiter/evidence/command-center-workspace-finish/**`; sprint log; PR metadata | Local, Verified, and Online are directly reviewed at standard, 2272-class, and ultrawide geometry plus existing compact/portrait states; focused/full suites and hosted CI are green at the exact PR head; no second game listener exists. | `AC-34` through `AC-38` obligations | `AC-34`, `AC-35`, `AC-36`, `AC-37`, `AC-38` | T35, T36, T37 |

After T38, return to `G02` and stop for owner visual acceptance. Do not extend the treatment to Match
settings or the commander dossier without explicit acceptance and a new bounded brief.

### Revision MVP and delivery boundary

T20–T32 are the complete first revision slice; `G02` is its hard visual gate. The packet's later Q04–Q08
sequence is retained as post-gate product direction, but is intentionally not expanded into executable
tasks until the owner accepts the Local/Garage component baseline. That prevents speculative CSS and
markup from propagating before the shared treatment is judged in the real product.

## G02 unified preparation-frame correction ledger

The maintainer supplied a second bounded correction at `G02` after inspecting the completed Local,
Verified, and Online evidence. The problem is cross-screen composition: each mode currently recreates
its own heading, viewport, scroll, and launch footer. This ledger supersedes those independent layout
seams while preserving every existing product owner and behavioral guarantee.

| ID | Status | Task | Exact paths | Verification / observable | Maps to | Covers | Depends on |
|---|---|---|---|---|---|---|---|
| T39 | ACCEPTED | Record the shared layout contract and add failing unit/browser assertions for one heading/body/dock frame, one primary-action renderer, real dock allocation, cross-route Online reachability, and resize identity/focus preservation. | `.codearbiter/specs/command-center-launcher-overhaul.md`; this plan; frame and workspace tests; `e2e/pregame-command-center.spec.ts`; `e2e/lobby-layout.spec.ts` | Focused tests began RED against the independent Local, Online, Verified, Skirmish, and Campaign layout seams; the Online Visibility collision was reproduced without weakening lifecycle assertions. | `AC-39` through `AC-44` obligations | `AC-39`, `AC-40`, `AC-41`, `AC-43`, `AC-44` | T38 |
| T40 | ACCEPTED | Implement the small semantic preparation frame and shared primary-action renderer with a heading region, body viewport, in-flow dock, update hooks, lifetime containment, and no product-state ownership. | `client/src/ui/PreparationFrame.ts`; `client/src/ui/PreparationFrame.test.ts`; shared styles | Unit tests prove semantic regions, truthful action state, callback disposal, and stable DOM identity; the frame contains no campaign, lobby, networking, or save logic. | `AC-39`, `AC-40`, `AC-43` obligations | `AC-39`, `AC-40`, `AC-43` | T39 |
| T41 | ACCEPTED | Adopt the frame in Local and every Online route together, retaining setup, validation, Garage, recovery, busy/retry, invite/rejoin, and acknowledgement owners. | `client/src/ui/LobbyHotSeatView.ts`; `client/src/ui/LobbyCreateView.ts`; `client/src/ui/LobbyJoinView.ts`; `client/src/ui/LobbyBrowseView.ts`; `client/src/ui/LobbyWaitingView.ts`; `client/src/ui/LobbyOnlineRouteActions.ts`; `client/src/ui/Lobby.ts`; focused tests | Every route has one frame and one shared primary placement; Create/Join/Start/Deploy meanings remain distinct; required fields are reachable above the dock; resizing preserves edits and focus without remount or network reacquisition. | `AC-39`, `AC-40`, `AC-41`, `AC-43` obligations | `AC-39`, `AC-40`, `AC-41`, `AC-43` | T40 |
| T42 | ACCEPTED | Apply the established frame to Campaign, Skirmishes, and Verified Operations without moving save, mission, authentication, or launch ownership. | `client/src/ui/commandCenter/CampaignCommandView.ts`; `client/src/ui/commandCenter/SkirmishCommandView.ts`; `client/src/ui/LobbyHotSeatView.ts`; focused tests | All mission-oriented screens share the same region and action contracts; campaign empty/resume safety, operation selection, challenge/deployment semantics, and existing callbacks remain unchanged. | `AC-39`, `AC-40`, `AC-42` obligations | `AC-39`, `AC-40`, `AC-42` | T41 |
| T43 | ACCEPTED | Replace conflicting page-specific responsive/footer rules with one frame policy and shell-first compaction; keep related controls together and bound previews by useful scale/aspect ratio. | `client/src/ui/commandCenter/CommandCenter.css`; `client/src/ui/Lobby.css`; style contracts | Wide, intermediate, compact, short-landscape, 200% zoom, forced-colour, reduced-motion, and art-failure checks show no overlap, hidden field, stretched filler, remote action, or task starvation. | `AC-41` through `AC-44` obligations | `AC-41`, `AC-42`, `AC-43`, `AC-44` | T41, T42 |
| T44 | ACCEPTED | Produce the matched all-mode native evidence set and live resize/interaction recording on the sole 4173 listener, run fresh verification and non-Astra review, update draft PR #515, and stop at `G02`. | `.codearbiter/evidence/pr515-preparation-frame/**`; verification outputs; sprint log; PR metadata | All preparation states were directly reviewed at identical wide/intermediate/compact dimensions; the recording demonstrated edit/focus preservation and reachable actions; exact-head CI was green; PR remained draft/open with no deployment. | `AC-44`, `AC-45` obligations | `AC-44`, `AC-45` | T43 |

After T44, return to `G02` and stop for owner visual acceptance of the unified set. Do not declare the
system complete from isolated screenshots or containment tests, and do not merge or deploy.

## G02 preparation body-layout regression correction ledger

The maintainer rejected the T44 visual gate because Campaign and Skirmish retained positional rules
from their superseded parent grids. The shared `PreparationFrame`, in-flow dock, product owners, and
accepted material system remain unchanged. This ledger corrects the body migration and returns the
complete set to the same visual gate.

| ID | Status | Task | Exact paths | Verification / observable | Maps to | Covers | Depends on |
|---|---|---|---|---|---|---|---|
| T45 | ACCEPTED | Reproduce the stale placement and transition failures with browser regressions before changing the layout. | `e2e/preparation-body-layout.spec.ts`; Campaign and Skirmish live cascade | RED proves Campaign loadout still resolves to the obsolete `loadout` area, Skirmish facts occupy a detached implicit row, compact heading text collides, and facts disappear below the initial briefing viewport. | `AC-46` through `AC-48` obligations | `AC-46`, `AC-47`, `AC-48` | T44 |
| T46 | ACCEPTED | Remove the obsolete placement rules and deliberately compose Campaign's mission/support stack and Skirmish's scene/facts board with viable outer and nested breakpoints. | `client/src/ui/commandCenter/CommandCenter.css`; `client/src/ui/commandCenter/SkirmishCommandView.ts` | Focused browser proof is green without offsets, overflow masking, typography shrinkage, callback changes, or frame/dock replacement. | `AC-46`, `AC-47` obligations | `AC-46`, `AC-47` | T45 |
| T47 | IN-PROGRESS | Produce the matched correction evidence and no-reload resize recording, run fresh verification and non-Astra exact-head review, update draft PR #515, and stop at `G02`. | `.codearbiter/evidence/pr515-preparation-body-layout-r2/**`; verification outputs; sprint log; PR metadata | Campaign new-run/resume, Skirmish ordinary/richer, Local, and Online are directly reviewed at matched wide/intermediate/compact and transition-adjacent widths; resize preserves edits and focus; exact-head CI is green; PR remains draft/open with no deployment. | `AC-48` obligation | `AC-48` | T46 |

After T47, return to `G02` and stop for owner visual acceptance. Do not extend the treatment to another
workspace or make further aesthetic changes before the maintainer responds.
