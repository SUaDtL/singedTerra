# Reassessment v3 execution ledger

Current user direction: use the September 13 v3 reassessment via START-HERE.md. Its recommendations supersede unexecuted v2 recommendations; preserve delivered behavior and historical evidence. Standing merge authority remains in force. Production actions retain their separately approved scope.

## Baseline — T00

- Input: `C:/Users/brenn/projects/singedTerra-review-inputs/reassessment-v3`; archive SHA-256 `1b1cff47e55e86eeacce3808ce87e8dc9d40838accc8a50afd2c7b7b9a033079`. All 38 supplied checksums verified. Original package remains unchanged.
- Review source: `16624ca24712d5cd4cfa54e71d587070a6b27cd5`. Current source/main: `d51b71b627ec53d62051d1057028771f060f0794`; no open PRs at baseline.
- CI `34797377242` and Pages `34797377238` both succeeded on current source. Previously verified publication receipt matches all 58 public files to artifact `10330652439`.
- Node `24.18.0`, npm `11.16.0`; supported Node range `>=24.15.0 <25`. Fresh `npm run check` passed; fresh `npm run test:client` passed 222 files / 2,128 tests.
- Untouched guest entry through a real First Salvo shot passed desktop-fine, pixel-touch and small-window, without retries or external network. Pixel-touch is browser emulation, not a physical-phone observation.
- Sole preview: `http://127.0.0.1:5198/singedTerra/`, initially serving d51 and now serving T05 commit `3003f39a635bacd4aa38813c2334b2cd46e19768` from recovered-console-validation. No additional preview or worktree created.
- Current checks produced ordinary jsdom canvas warnings; they are not proof of rendering. Browser evidence is separate.
- Logs: `C:/Users/brenn/AppData/Local/Temp/singedterra-v3-baseline-client.log`, `singedterra-v3-baseline-engine.log`, and `singedterra-v3-baseline-browser/`.
- T00 complete: independent Sol source comparison passed. None of N01–N11's implicated implementations changed across the two intervening commits; N12/N13 still require measurements and human evidence. The supplied validator passed JSON Schema, references, DAG, finite gates, all 37 prior findings / 43 prior task dispositions, report structure and historical probe hashes. Its reviewed, hash-pinned Python dependencies were installed only in `C:/Users/brenn/AppData/Local/Temp/singedterra-v3-validator/packages`; no repository manifest or lockfile changed.

## Model and ownership bindings

The current tools advertise `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, all supporting the requested high/medium efforts. Astra/high is the requested parent and acceptance role; no unsupported claim of self-inspected parent runtime settings is made. The harmless read-only T00 child and T05 preparation were dispatched through the tool with explicit `gpt-5.6-sol` / `high` selection.

At most two nonoverlapping repository writers. Serialize T01–T04 in NetworkClient. One integrator owns entrypoint/HUD/input/capabilities; T06/T07 transfer their narrow scopes to Terra after T05. Root reviews acceptance independently. No new reward, engine, backend, modal, analytics or native-platform program is implied.

## Task routing

| Tasks | Current disposition | Assignment |
| --- | --- | --- |
| T00 | Verified baseline and independent review | Astra/high; Sol review |
| T01 | Committed locally as `ebc1f902dddd42701666cff1601dc26e04a9b693`; 15 focused / 2,133 full client tests passed, independent review passed; not yet published | Sol/high; Astra review |
| T02 | Committed locally as `43fa2720e0c5dce5d9232512f8d112b4a175cf6f`; capped ordered history and recovery races covered; 2,146 client tests and independent review passed; not yet published | Sol/high; Astra review |
| T03 → T04 | T03 committed locally as `9d9e6ac60472c38a6bfd7efb2668914ed848b526`; 2,155 client tests, independent review and nine browser cases pass. T04 now proceeds serially. | Sol/high; Astra review |
| T05 | Merged in PR #501 as `d4b6fb2813e85894c1d193f20d791779d23910cd`; all required CI passed on reviewed head `3003f39a635bacd4aa38813c2334b2cd46e19768`. Pages publication proof pending. | Sol/high; Astra review |
| T06 | Merged in PR #502 as `8943abce25308a098d34c18c143debf9cc647e08`; all required CI passed. Independent review and actual browser equip/fire proof passed. Pages publication pending. | Terra/medium; Sol review |
| T07 | Implementation merged with PR #502; reviewed head `ab193c072c0f23a4e94423153ad6edcb4019a7d8` passed required CI, 2,138 client tests and browser proof. Physical mouse/touch verification remains pending. | Terra/medium; Sol review |
| T08 | Confirmed Chromium BFCache defect: real persisted Back/Forward twice removes console while retaining battlefield. WebKit runner reloaded, so persisted path unqualified. Fix queued behind T03 entrypoint ownership. | Sol/high; Astra review |
| T09 | Confirmed visual defect: impact monitor, explosion and damage cue are covered by the full report within the next 100 ms sampled frame, normal and reduced motion. Presentation fix in progress while T08 awaits the network lane; physical phone evidence pending. | Terra/high; Sol review |
| T10 | Delivery commit `26c4a92` preserves reviewed `3cd87b9` unchanged on merged #502; independent review, normal/negative controls and full engine check pass. Path B unchanged. Not yet published. | Terra/medium; Sol review |
| T11 | Browser journey evidence after correctness tasks | Sol/high; Astra review |
| T12 | Finite acceptance of T00–T07, T10, T11 and explicit T08/T09 dispositions | Astra/high; Sol review |
| T13 | Narrow desktop label/action refactor after T05/T06; not a correctness-release gate | Sol/high; Astra review |
| T14–T18 | Separate measured product work and human observations; not fabricated agent evidence | JSON assignments retained |

Complete task criteria, dependencies and rollback boundaries are in the immutable imported JSON. Supplied historical compiled probes are reproductions of reviewed behavior, not future source regression proof. Every fix must first fail against original current source for the relevant behavior. Physical mouse/touch, phone impact/payoff, listening and real-player observations remain pending until actually observed.

T05 evidence: final build `C:/Users/brenn/AppData/Local/Temp/singedterra-v3-t05-final-build.log`, browser `singedterra-v3-t05-final-browser.log`, focused root proof `singedterra-v3-t05-final-proof.log`. Windows coverage: 93.85% lines / 83.18% branches. Review caught the new runtime helper inside a file excluded as type-only; it was extracted into covered `inputCapabilities.ts` with direct default/narrowed tests. The ST1 manifest includes that new ordinary-mode dependency and its reviewed hash; compatibility and negative-guard tests pass. CQ1 power remains the retained 0–100 range. Local commit is not a hosted CQ1 activation or a physical-device acceptance claim.

T06/T07 delivery: PR #502 contains exactly four HUD/input source and counterpart test files, based on merged #501. T07 browser receipt `C:/Users/brenn/AppData/Local/Temp/singedterra-v3-t07-browser.json` and six screenshots show 180 degrees below-left, 0 below-right, and no accidental fire on desktop, small-window and emulated touch. The root inspected the rendered desktop and touch captures. Production build log: `singedterra-v3-t07-build.log`. The unchanged-content rebase maps T06 a4d961d to 90bc3cd and T07 eee283a to ab193c0. Aggregate independent audit passes; Windows coverage report is T06's 93.86% lines / 83.19% branches, supplemented by T07 focused coverage and the combined 2,138-test suite.

T08 qualification: `C:/Users/brenn/AppData/Local/Temp/singedterra-t08-qualification/qualification-summary.md` records frozen preview hashes, actual persisted flags, screenshots and a bounded correction design. Chromium's Playwright default disabled BFCache and was rejected as qualification; ignoring only that artificial flag reproduced the defect. No physical-device or WebKit persisted-path acceptance is inferred.

T09 qualification: `C:/Users/brenn/AppData/Local/Temp/singedterra-cq1-t09-evidence/t09-correction-design.md` links videos and frame captures. Root inspected normal frames at 7.3 and 7.4 seconds; reduced-motion evidence has the same transition at 6.7 and 6.8 seconds. A held loopback receipt produced one completion request, independently updating pending to final receipt. This is a client presentation finding, not a hosted verification or physical-phone claim.

T03 acceptance: initial browser proof caught a timeout Retry below the viewport; moving the recovery alert above setup and suppressing its duplicate rejoin banner resolved it without weakening the geometry checks. Final root build and all nine desktop/compact room-lifecycle cases pass (`singedterra-v3-t03-build.log`, `singedterra-v3-t03-browser-all.log` under Temp). Root inspected the compact screenshot. Independent source, coverage and auth reviews pass. Windows coverage: 93.86% lines / 83.21% branches. The existing seat credential source/recipient is unchanged; synthetic test credentials are generated at runtime. Local commit is not publication proof.

Preview ownership: exactly one localhost remains at `http://127.0.0.1:5198/singedTerra/`. For T03 validation it now serves `product-v2-p10-delivery/client/dist`, PID 64708 (the previous UI preview PID 43704 was stopped). The rebuilt candidate contains the T03 recovery placement correction over 43fa272. Recheck source/build identity before subsequent proof. The five registered worktrees are unchanged.

## Separately approved T29 operational validation

The owner approved one bounded source-bound T29 run before supplying v3. It is not a prerequisite for ordinary correctness fixes and does not enable CQ1. Production source matched d51 in all 22 functions / 58 files; provider version and disabled admission were rechecked immediately before execution. No deployment was needed.

Approved run `ffb73e84-f5a9-4f5d-a2b7-13f250b72701` ran from `2026-09-14T03:31:12.044Z` to `03:36:06.263Z`. Thirty-six probes completed and released their leases; the 37th returned HTTP 503 before native replay admission. The supervised runner stopped and was reaped. The full T29 gate is unproven; no second batch or public enablement is authorized. Read-only SQL confirmed the owned temporary account has no active worker/lease or reward/deployment sessions. Its one released historical lease row (fence 36) prevents Auth deletion because the foreign key does not cascade. A concrete proposal to delete exactly that released row before the already-approved account cleanup awaits separate owner approval, because the original scope excluded manual database writes. Evidence and proposal: `C:/Users/brenn/AppData/Local/Temp/product-v2-p10-t29-runner-source-bound-d51b71b/result.md` and `cleanup-proposal.md`. CPU/memory, cold/warm and crash/cross-endpoint proofs cannot be inferred from request latency.

## Workspace preservation

Five registered worktrees remain. Reuse suitable clean checkouts for these lanes; preserve the dirty primary and historical evidence worktrees. Retained cleanup archives and policy-blocked filesystem remnants remain described in `C:/Users/brenn/projects/singedTerra-cleanup-recovery/20260913/README.md`. Do not retry rejected deletions through another mechanism.
