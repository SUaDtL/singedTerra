# Last Stand player controls

Approved for implementation by the owner on 2026-10-21. On October 22 the owner accepted the current UI and authorized PR #541 to merge after passing CI, including removal of Ash Road code. This note records observed checks; merge, publication and native qualification remain separate results.

## October 22 campaign retirement

Last Stand is the only campaign. The Ash Road client, content, replay/save
implementation, UI, audio, art and shared-engine branches are removed. Retired
menu selections and the exact legacy campaign fragment select Last Stand;
ordinary fresh startup, explicit invites, rejoin and imported ST1 challenge
priority remain. Historical Ash Road storage is opaque and untouched.

The refreshed client coverage run passed 246 files / 2,402 tests: lines 94.92%,
branches 84.79%, statements 91.73%, functions 91.30%. Typecheck, weapon/shield
checks, the ordinary transcript/clone compatibility oracle and the unchanged
retained cq1 artifact verifier passed. The 103 browser-contract guards passed.
These local results do not substitute for exact-head hosted CI or browser proof.

Independent security/compatibility review cleared exactly nine ST1 source-pin
updates while retaining all 32 memberships and strict drift detection. Coverage
review found two generic weapon-selection regressions inside a removed campaign
test file; they now live in the ordinary integration suite, where all 96 tests
pass. The reviewer cleared the correction. Browser checks passed 35 affected
cases across desktop, touch and small-window projects; the remaining desktop
geometry case passed after correcting its singleton-layout expectation. The
real Last Stand tier-goal, unlock and reload journey passed against the new
export in 2.1 minutes. Hosted CI remains required before merge.

Hosted lifecycle checks on the preceding candidate exposed an idle Menu focus
defect: a terminal result cleared the run clock while hidden, preventing control
refresh on foreground return. The new actual-callback regression reproduced it,
then passed after idle Last Stand sessions began emitting visibility updates.
All 19 imported-scene menu cases passed. Export
`Web-20261022T074236Z-ae40a0` passed export, packaging and source/payload admission;
the earlier failed export remains failed evidence.

The owner requested the menu's brass/graphite chrome and the panel-corner
correction alongside wave conversion. The corner source has an opaque rectangular
backing beneath a clipped frame; its geometry needs the same clipped boundary.
Neither follow-up is claimed implemented here. Earlier reports below describe
their named candidates and do not qualify newly changed source automatically.

## October 22 layout correction

The owner rejected the original garage and combat action strips. The current source
uses bounded inline Tier and Fitting arrow cards, a dominant lower-centre Deploy,
a smaller Upgrades action, quiet save information and a separate top-right Menu.
Tier browsing exposes unlocked tiers and the first locked preview; previewing a
locked environment never commits that tier or permits deployment. The two authored
tier environments have distinct identities, and fitting cards connect to the
actual visible tank module with a noninteractive projected leader and highlight.

Combat keeps only the compact minus/rate/plus group and a separate Run Upgrades
action. The rate button owns pause/resume; Sound and Effects remain in the existing
settings tabs. Legacy duplicate battlefield buttons are hidden. This correction
preserves the run clock, independent pause holds, speed caps and shop accounting.

The [garage wireframe](player-controls/garage-layout-proposal.png) and
[callout wireframe](player-controls/garage-layout-callout-proposal.png) record the
accepted composition direction. Their illustrated tank quality is not runtime
evidence or an implemented art overhaul. The
[owner-supplied combat screenshot](player-controls/combat-controls-before.png)
records the rejected old preview.

Current imported checks pass for 18 menu/controller cases, six actual-mesh fitting
projection/lifecycle cases, four strict garage cases, three result/recovery cases,
the runtime layout-report case and three pure layout cases. The affected battle
shop case passed; both workshop purchase and native resize/input cases passed
after correcting test-owned initial fitting synchronization and camera-Canvas
resize order. All purchase, scroll, clipping and raycast assertions remain.

Independent source review found and cleared two defects through regression
RED/GREEN: environment failures now stay visible in the quiet garage footer, and
the fitting callout hides beyond the world camera's far clipping plane even when
its UI camera remains visible. Final imported evidence is
`Evidence/last-stand-controls/20261022T062539Z-d1c46967`,
`Evidence/last-stand-fitting/editor-20261022T062845Z-2cef1631` and
`Evidence/player-controls-client/garage-shop-recovery-green.log`.
Fresh `Web-20261022T063027Z-a994fe` passed the maintained exporter, before/after
source and toolchain guards, packaging, payload/source validators, ST1 compatibility,
typecheck and production build. Localhost now serves that export.

The repair controls journey passed 50 captures and nine audio windows, and Chromium
touch passed 12 captures / 34 actions. The first combined controls report remains
failed: its launcher analyser missed the short effects sample during concurrent
browser load; the retained WebM independently contains the rendered transient.
The separate serial launcher recovery passed 50 captures and nine audio windows
with unchanged thresholds in
`Evidence/player-controls/garage-launcher-20261022T063027Z-a994fe`. This is coverage
across retained runs, not a new combined-run pass. Their runtime inventories match.

Fresh-storage progression also exposed a real test-helper readiness race after
goal, Claim, permanent purchase and reload. Its delayed-layout regression was RED
then GREEN; all 102 browser guard tests pass after awaiting the actual HUD layout.
The launcher recovery uses that corrected helper; the earlier repair and touch
captures retain their exact original input identities. The corrected normal-speed,
fresh-storage progression journey passed both fittings with 91 screenshots in
`Evidence/first-session-polish/garage-reload-20261022T063027Z-a994fe`, including
goals, manual Claim, earned permanent purchases, reload, stronger same-tier
redeployment and Tier 2 selection. Owner UI acceptance was subsequently granted. Earlier
verification below applies to the previous packaged candidate unless superseded here.

Unaltered rendered comparisons: [desktop garage](player-controls/garage-desktop.png),
[portrait garage](player-controls/garage-portrait.png),
[launcher callout](player-controls/garage-launcher.png),
[locked tier preview](player-controls/garage-tier-preview.png),
[desktop combat](player-controls/combat-desktop.png) and
[short landscape combat](player-controls/combat-landscape.png).
The [capture inventory](player-controls/captures.json) binds each copy to its raw
report, run scope and digest.

Historical `--baseline` capture replay is not qualified by this correction: its
older control inventory is incompatible with the current strict parser. Retained
historical images remain available; current-candidate proof uses the current
controls mode. Crypto review also leaves pre-existing Python provenance hashing
outside the changed operations; the modified shared runner uses the approved
Node SHA-256 implementation.

Waves and resumable runs are the next gameplay proposal, recorded in the
[roadmap](LAST-STAND-ROADMAP.md). The owner requires each wave to finish by defeating
its defined enemy group and the full run state to checkpoint at each completed
wave. Reloading may replay only the unfinished wave. Rewards, unlocks, resources,
HP and temporary upgrades must restore consistently, with an initial checkpoint
before wave 1 and explicit abandonment kept separate. This layout correction does
not implement that replacement or active-run restoration.

## Control ownership

| Surface | Controls and behavior | Owner |
| --- | --- | --- |
| Garage / workshop | Tier and Fitting arrow cards, Deploy, Upgrades, floating Menu | Progression/controller, existing shop |
| Running | Minus / selected rate or pause / plus, separate Run Upgrades, floating Menu | EncounterSession and its LastStandRunClock; no global time scale |
| Catch-up | Current progress remains visible; pause, rate and modal entry refuse until debt reconciles | Run clock/session |
| Menu | Close/resume, settings, help, abandon, Campaigns, About | Controller; independent menu pause hold |
| Audio | Master mute/volume, effects volume and sample, music enable/volume | Preferences, LastStandAudio, LastStandMusic |
| Display | Current/Performance render resolution, Full/Reduced effects, fullscreen | Owned runtime pipeline clone; existing view; browser actual fullscreen events |
| Gameplay | Separate tutorial-tip and purchase-suggestion switches; rate/cap information; Help | Preferences/guidance; speed cap stays domain-owned |
| Save & Account | Separate gameplay/settings status and retries; existing account route; confirmed settings reset | Existing progression save, isolated preferences store, parent Lobby |
| Result / failed save | Existing manual Claim and Retry; no abandonment of unconfirmed terminal writes | Progression/controller |
| Navigation | Fixed Campaigns/account destinations; active run gets Cancel-first confirmation | Controller + narrow browser bridge |

The shop retains its existing controls while open. The additional field speed/menu controls return when the shop closes. Settings uses a scrollable modal with a fixed close control and tab navigation. The modal contains keyboard focus and disables underlying actions. Browser chrome Escape may exit fullscreen; explicit Close remains available.

## Defaults and storage

Preferences use `singedTerra.lastStand.preferences.v1`, separate from gameplay. Defaults: master/effects 100%, music 20% and enabled after a gesture, sound on, Current quality, Full effects, both guidance switches on, last positive speed 1x. Active pause/fullscreen are ephemeral. Initial admitted rates are 0, 0.5, 1; preference data cannot unlock higher rates. Research and additional speed unlocks are deferred.

Settings apply immediately in the session. Failed or uncertain writes are reported separately and retry checks actual stored data. Malformed/newer records and stale-tab conflicts are protected until a confirmed settings reset. Restore defaults affects no wallet, tiers, upgrades, run rewards, account or current run pause/rate. The reset speed preference takes effect on the next deployment.

Account navigation opens the existing account panel at `../#account/last-stand`; Last Stand progress does not sync with accounts. No gameplay reset, cloud-save, import/export or new authentication backend is introduced.

Review the actual [portrait controls](player-controls/portrait-controls.png), [portrait Audio tab](player-controls/portrait-settings.png), and [scrolled landscape Audio tab](player-controls/landscape-settings.png). These are unchanged screenshots from the source-bound Chromium touch journey; [capture identities](player-controls/captures.json) retain the raw evidence hashes.

## Verification record

- 2026-10-21: 31 actual-source Mono/Roslyn checks passed across preferences (10), speed/session (7), guidance/navigation (6), audio lifecycle/synthesis (8). Audio doubles observe source operations; these are not browser sound or listening proof.
- 2026-10-21: affected parent-client suites passed, 66 tests. The exact account route opens the existing dialog; similar routes do not. The gameplay storage record is preserved.
- Speed author reported 45 affected pure checks passing and three deliberate fault fixtures rejected. Four further temporary-source faults for wrong-key writes, protected/external-record overwrite and unsafe navigation compiled and failed their intended behavioral assertions (20 preference/guidance tests pass).
- Full client coverage: `npm run coverage:client`, 269 files / 2,550 tests passed in 87.53 seconds, exit 0. Observed v8 summary: lines 94.53% (13,179/13,941), branches 84.70% (8,814/10,405), statements 91.20% (14,256/15,631), functions 91.21% (2,150/2,357). These are client metrics; no Unity percentage is claimed. The earlier two-suite run was partial and is superseded for this numerical gate.
- The imported-scene controls runner passed all ten cases in `Evidence/last-stand-controls/20261021T231913Z-7d21f345`. The failed-deployment retry regression first reproduced combat starting behind Settings, then passed after installing the menu pause before initial deployment events. Other failed runs preserve the edit-mode fixture corrections; they are not passing evidence.
- Fullscreen refusal tests passed six compiled C# cases and six actual jslib cases, including rejected entry and rejected exit. Independent coverage review rechecked the source corrections and cleared its critical/high findings. The current imported-scene pass supersedes the earlier cleanup-fixture failure cited in that review.
- The first Web build (`Web-20261021T232004Z-3a8fa1`) was rejected by the saved-project-settings guard: edit-mode checks leaked a runtime graphics override. The test scope now restores its exact prior pipeline, including nested scopes and null overrides. All eleven imported-scene cases passed in `Evidence/last-stand-controls/20261021T232701Z-b5cc0754`; the failed export remains rejected.
- Fresh `Web-20261021T232726Z-184b51` passed the maintained exporter, exact before/after source and toolchain checks, packaging and both source/payload validators. The parent production build passed at `/singedTerra/` after independent ST1 review of the exact account-route change and a bounded Lobby-only compatibility hash refresh.
- The unavailable-account regression first failed at the missing dialog, then passed with a route-scoped explanation in the existing closeable overlay. Ninety affected client tests and typecheck passed. A subsequent full v8 run passed 2,551 tests: lines 94.53% (13,184/13,946), branches 84.72% (8,822/10,412), statements 91.21% (14,262/15,636), functions 91.21% (2,150/2,357), 80.37 seconds. Captured output: `Evidence/player-controls-client/coverage-full-20261021.log`; this supersedes the earlier client totals.
- The first browser journal exposed a real negative settings scroll offset on Help → Back at 720px. Resetting the actual content position and clamping it after layout fixed the issue without masking telemetry. All twelve imported-scene cases passed in `Evidence/last-stand-controls/20261021T234610Z-2bb182c9`; the added case also exercises tab changes, tutorial dismissal and viewport growth.
- The complete background suite initially exposed stale fixtures from the earlier tier/save upgrade: a missing active-tier reservation, a pre-tier limit-result expectation, and a v2 record failing migration before its intended purchase test. Current fixtures use the real reservation and v3 contract, and verify zero-reward limit duplicate/reload/manual acknowledgement. All twelve background tests passed in 35.444 seconds (`Evidence/player-controls-client/background-final-20261022.log`). Test scopes now restore settings before early Editor exits, including sixteen affected entrypoints; saved graphics settings stayed unchanged.
- Final export `Web-20261022T000651Z-94e564` passed the maintained exporter, source/toolchain guards, packaging, payload/source admission, ST1 compatibility, typecheck and production build. Captured build output: `Evidence/player-controls-client/build-final-20261022.log`. The earlier export is superseded after the Editor-test maintenance.
- Supplemental Chromium touch input passed at portrait 390×844 and landscape 844×390, DPR 2: speed cap, manual pause, four tabs, actual Help dragging and the music switch. Eight captures and 26 touch actions are retained in `Evidence/player-controls/touch-2026-10-22T00-08-46-990Z`. This is emulated Chromium input, not physical-mobile qualification; switch state is distinct from audible output.
- Preserved journal `Evidence/player-controls/2026-10-21T23-49-11-952Z` passed the repair fitting, but the launcher used stale coordinates after its final resize. The next journal, `Evidence/player-controls/2026-10-22T00-09-55-357Z`, passed the entire repair journey against the final export (39 captures and nine measured audio windows). Its launcher completed the responsive layouts, audio and abandon checks, then clicked outside the page after reload because readiness preceded the DPR-aware canvas update. Both overall failed runs remain failed. The runner now waits for canvas geometry before every click, including reload; its earlier exact bytes are retained with that report.
- The targeted launcher rerun, `node scripts/last-stand-controls.mjs --fitting=launcher`, passed in `Evidence/player-controls/2026-10-22T00-23-29-269Z`: 39 captures, nine measured audio windows, persisted opt-outs, Cancel/confirm reset, account dialog, confirmed wrapper return and browser-enforced fullscreen denial. Its runtime hashes exactly match the separately passing repair journey above; the helpers and validators are unchanged. These two retained runs provide both-fitting coverage, not a new combined-run pass. Recorded WebM audio is retained with each run for owner listening. Independent review found no actionable defects in the runner correction or its explicit subset reporting.
- Both normal-speed, fresh-storage progression journeys passed against the final export in `Evidence/first-session-polish/first-session-2026-10-22T00-10-15-194Z`. Each fitting covered 30 phase/profile combinations; 89 screenshots total retain purchases, manual Claim, reload, tier unlock and stronger redeploy observations. No gameplay save was seeded and owner acceptance is separate.
- At that observation, owner feedback, native Windows/background-media qualification and exact-head hosted CI remained pending. The owner subsequently accepted the UI; native qualification remains separate. The headless tab did not actually become hidden, so no hidden-tab silence result is claimed. Headless frame-cadence samples are not hardware-performance qualification.

Music source and authorship are documented in `../Tools/last_stand_controls/AUDIO_PROVENANCE.md`.
