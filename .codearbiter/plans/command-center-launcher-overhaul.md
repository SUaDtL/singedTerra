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
| T19 | PENDING | Run complete fresh verification, adversarial two-pass review, exact-head PR review, and sprint receipt; update the draft PR but do not merge or deploy. | all changed files; governance artifacts; PR metadata | All `AC-18` commands and hosted required checks are green on the exact PR head; zero unresolved block findings; PR remains draft/open unless user separately directs otherwise. | `AC-18` | sprint close | T18 |

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

- `[NEEDS-TRIAGE]` T02's design review noted two unchanged OrientationGate fallback strings using em dashes as prose separators. This is outside the surface-lifecycle slice and does not affect behavior.
- `[NEEDS-TRIAGE]` T12 confirmed `e2e/lobby-return-focus.spec.ts` still targets the removed globally visible Local Battle chooser. The canonical campaign launch, battle return, selection, and focus path is green; broad legacy chooser migration remains with the later Skirmishes/Multiplayer adaptation rather than this campaign-first slice.
