# P06 compact-console legibility evidence

Observed 2026-09-13. Base `05b2bf162efb994f99746d1ab93692b3d9ce2988`.
Worker: gpt-5.6-sol/high. Independent reviewer: gpt-6-astra/high.
Parent owns integration, browser execution, and publication.

The short-height console truncated Baby Missile and split Armory and Settings
inside words. The current candidate fits the weapon name through the existing
short-height CSS by design and groups ammo metadata into two explicit semantic
rows in `CompactConsole.tsx`: amount plus cycle cue, then unit. Armory and
Settings stay on one line, longer weapon names retain bounded overflow, and metadata keeps
natural letter and word spacing. No target geometry, renderer, input intent,
font, image, dependency, or gameplay behavior changed.

## Causal verification

The baseline Pixel landscape measurement at 802 by 293 CSS pixels failed
weapon-name containment. Actual captures also showed two-line Armory/Settings.
Intermediate candidates retained the failure while the five-line weapon/ammo
stack was corrected. Individual Range rectangles exposed both horizontal and
vertical overflow. The original Windows candidate used zero inline padding and
metadata tracking to fit four lines at the existing font size.

The infinity glyph uses a separate font fragment on the same visual line as
ammo. The regression counts distinct vertical bands within one pixel while
checking every individual fragment for containment. This corrects a fragment
counting oracle; it does not relax the containment or font requirements.

Independent review identified universal `overflow: visible` as a longer-name
regression. The pre-existing Bouncing Betty DOM-cell test failed with expected
hidden versus actual visible. Restoring hidden overflow passed that test and
retained the complete two-line Baby Missile label.

## Prior local results

- `npm run build`: PASS, including strict shared/client type checks.
- `npm run test:client`: 208 files, 1,938 tests PASS.
- `playwright test e2e/compact-console-legibility.spec.ts e2e/quick-duel-pacing.spec.ts e2e/hud-layout.spec.ts --workers=1 --retries=0`: 40 PASS, two intentional skips for the short-height-only test on other profiles.
- `playwright test -c playwright.product-completion.config.ts compact-readability.spec.ts console.spec.ts --workers=1 --retries=0`: 33 PASS, 17 existing profile-specific skips across five profiles.
- Secrets scan: empty findings. `git diff --check`: PASS.

Both browser commands used `E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/`
and denied external network. Build and preview both used `VITE_BASE=/singedTerra/`.
An earlier preview omitted that base and served HTML for prefixed assets; its
setup failures were excluded from product evidence and the preview was replaced.

That candidate's 60 served files matched disk byte for byte. The retained
inventory SHA-256 is
`2350d60f18632589e00b5a52ef913b553deb7dc7051f8be51bf3395a127c36cf`.
The parent-owned listener was stopped after verification before another
worktree used the sole localhost.

Its final label size was 14.354259 physical CSS pixels. All ten targets remained
at least 44 by 44 physical CSS pixels. Target rectangles, chassis, stage, and
canvas matched the baseline exactly. The requested image/font resource URL
set was unchanged. The parent inspected live and restart captures for desktop,
Pixel landscape, and small-window profiles; named labels were complete and
the other layouts retained their presentation.

## Hosted Linux follow-up

GitHub Actions run `34737976514` reproduced a real fallback-font defect at 802
by 293 CSS pixels. `Missile` extended 2.296 pixels beyond its content box, while
the inline `∞ ammo · ›` metadata occupied three vertical bands and flex-shrank
the two-line weapon name. The screenshot visibly clipped the second name row;
this was not an oracle-only failure. All targets remained at least 44 CSS pixels
and the font remained 14.354259 physical CSS pixels.

A compressed-tracking candidate fit the geometry but failed visual review
because it crowded separators and joined the infinity glyph to `ammo`. The
replacement uses explicit amount/cycle-cue and unit rows with natural metadata
spacing. Astra source review passed this structure. The focused component test
passes all six tests in its file and covers finite `0`, `12`, and `999`
text/action preservation; these values are examples, not an inventory cap. The
unlimited fixture remains in the browser geometry regression.

The revised bundle passed the complete local browser suite: 340 tests passed,
20 existing profile-specific tests skipped, and zero failures. The full client
suite passed 1,949 tests in 208 files. Build and strict type checks passed.
All 60 served files matched disk; the inventory SHA-256 is
`ca088e0e1bb9d72d207f91ffb7d176c0e0f4a078474fac7f094f6cb782e90b6b`.
The parent and independent Astra reviewer inspected the actual short-height
capture and accepted the complete Baby Missile label and naturally spaced
amount/cycle-cue and ammo rows. Hosted Linux verification remains pending.

The first full run on this bundle exposed a measurement error: a Range over
the metadata container counted block boxes in addition to glyph fragments.
The regression now walks nonempty text nodes and measures their individual
glyph Ranges. Every fragment still must fit the same content box, with the
same one-pixel tolerance, row limits, 14-pixel font floor, and 44-pixel targets.
An unrelated desktop HUD bootstrap timeout also passed on the focused rerun
and final full run without a production change. The focused rerun passed 22
tests with two existing skips. Independent source/oracle/visual review passed
with no remaining local findings.

The final five-profile console/readability compatibility run also passed:
33 tests passed and 17 existing profile-specific cases skipped across
ultrawide, wide, standard, narrow, and compact layouts. It reused the same
verified bundle. Its raw log is `product-v2-p06-final-five-profile.log`;
the full browser and client logs are `product-v2-p06-full-browser-final.log`
and `product-v2-p06-final-client.log`.

Raw logs, measurements, and the baseline capture are preserved under the host
temporary directory as `product-v2-p06-*`; final screenshots are in this
worktree's Playwright test-results directory. The hosted failure log is
`product-v2-p06-hosted-failure.log`; its extracted trace measurement and
screenshot remain under `st-p06-ci-artifact-34737976514` and
`st-p06-ci-trace-34737976514`. The passing screenshots above are prior local
receipts, not evidence for the revised candidate or a physical-device
observation. Device emulation does not establish human usability, retention,
GPU residency, or thermal behavior.
