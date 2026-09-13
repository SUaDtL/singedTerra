# P02 First Salvo integration evidence

Observed 2026-09-13. Local implementation accepted; publication and the human product experiment remain separate.

An unseen First Salvo preference now offers one primary one-round duel through the existing local Quick Duel launch. Ordinary operations remain available through a native disclosure, and returning players retain Standard Duel. The existing coach remains the only instructional owner. Offline manual evidence accepts optional elapsed timing without adding runtime telemetry.

## Source and ownership

Worker: actual gpt-5.6-terra/high, `/root/p02_first_session_preflight`. Independent reviewer: actual gpt-5.6-sol/high, `/root/p02_first_session_independent_review`; separate architecture and coverage review contexts completed. Parent gpt-6-astra integrated and verified the candidate.

The merge combines foundations `3b6b3464e9c7782d99965f28204d45014d56a6cc` with P03 `05b2bf162efb994f99746d1ab93692b3d9ce2988`. Original author bytes remain in stash `06ec6e136e60e61d381ffb366f8b525eb1d078b9`, applied once and retained. The three integration conflicts preserved both the First Salvo route and Last Light practice identity/objective. No original user checkout was modified.

## Validation

| Check | Actual result |
| --- | --- |
| Author causal RED | Missing First Salvo catalog, CTA, filtering and p02 manual-schema/docs caused the focused checks to fail before production implementation. Original session `01a098ae-befe-78f3-ac59-05561e01a3b3`, RED call `call_4f98eZSHuY5whOsrbRM5mFXR`, retains output. |
| Author GREEN | Four focused client files, 37 tests; 11 offline tests; 208 client files, 1,934 tests; typecheck passed. |
| Final integrated client coverage | 208 files, 1,946 tests passed. Lines 94.12%; branches 84.24%. Parent run `2aa9ba`; `Temp/product-v2-p02-final-coverage.log`. |
| Final review regressions | 20/20 projection and Lobby launch/lifecycle cases passed (`9fe88c`); offline validation/aggregation 12/12 passed (`fcc834`). |
| Engine, static and release-contract checks | `npm run check` passed, including deterministic replay, corpus, benchmark and migration/release-manifest validation (`3c95a2`). Log `Temp/product-v2-p02-final-check.log`. No backend change or deployment. |
| Production build | Prefixed `npm run build` passed (`a61553`), with synthetic loopback E2E configuration. |
| Browser | 41 passed, four established profile-specific skips, 55.4 seconds (`aedad8`). `quick-duel-pacing`, `ordinary-guest-journey`, and `first-salvo` specs, one worker, zero retries, external network denied. |
| Independent review | PASS, zero remaining in-scope findings; all five coverage findings corrected; 17 accepted ADRs confirmed without drift. |

The final browser run includes all three untouched guest-entry First Salvo journeys, the existing desktop natural local terminal/retry journey, all 18 P03 operation cases, and the existing briefing/focus/input cases. Two native-touch cases remain limited to the touch profile; two natural terminal/retry cases remain desktop-only. These four existing skips were not introduced to hide failures.

The initial P02 browser attempt failed three new cases because its assertion expected `Round 1 of 1`. The existing HUD actually renders `Single round`; that oracle was corrected from the renderer, with the exact First Salvo identity still asserted. The failure log remains `Temp/product-v2-p02-browser.log`. The final run passes the real accepted Fire path at all three profiles. It does not claim a natural full First Salvo match or human understanding.

## Direct visual and served-build proof

Parent inspected the entry and live battle screenshots at desktop 1600x900, emulated Pixel touch, and 900x520. The entry exposed a grid-placement issue: introductory content and disclosure occupied individual cells, staggering Local Battle and Play Online. A five-line existing-owner CSS correction spans those two items across the chooser grid. The final images show aligned actions and readable entry content. Before images remain `Temp/product-v2-p02-entry-before/{desktop-fine,pixel-touch,small-window}.png`; after images remain in `test-results/ordinary-guest-journey-ord-08d8a-y-and-reaches-one-real-shot-{profile}/` as `first-salvo-entry.png` and `first-salvo-battle.png`.

The sole preview is PID80072 at `http://127.0.0.1:5198/singedTerra/`, serving this worktree's `client/dist`. Parent `54a75a` compared every served file to disk: 60 matches, zero mismatches. Inventory SHA-256 is `7819d58074abf7b7a8d12a9a35c77c1a92baa4d1327324b23e4ec824565c8c34`. The comparison's tracked source/test diff SHA-256 was `b7550c1759fe6caa63677ef6c19b355a0ceafa8526479e8303adc133377ea211`; later receipt/plan/board additions do not change that built code. Raw receipt: `Temp/product-v2-p02-preview-binding-final.json`.

The touch battle screenshot also shows pre-existing control-word splitting. P06 owns that separate visual correction; P02 claims the entry alignment and functional route only. Emulation is not physical-device evidence.

## Review corrections and limits

The final regressions prove a supplied three-round base changes only for First Salvo, exact normalized human and medium-CPU roster/seed composition, preference refresh on the same Lobby instance, unreadable preference-key fallback, and unchanged complete funnel/segment reports across v1, untimed v2, timed v2 and mixed inputs. Documentation tests preserve the explicit human-evidence boundary.

A broader storage-getter test exposed an existing constructor dependency that fails if the `window.localStorage` property itself throws, before P02 reads its preference. That broader scenario was harvested through the task-board writer with origin `product-v2-p02-review`. The final P02 test deliberately covers its actual unreadable preference-key contract. Global storage unavailability is not claimed as supported.

No actual participant records or timing observations were collected. The owner consent/retention policy remains pending. Optional v2 timing lacks the selected launch route and cannot attribute elapsed time to First Salvo. Reachability, one-round composition and schema correctness do not establish faster time-to-value, newcomer understanding, voluntary replay, retention or demand. The original P02 product experiment remains incomplete until adequate human evidence exists.

P13's historical source-closure baseline remains bound to its original catalog revision. These catalog additions do not silently regenerate or reinterpret that earlier balance evidence.
