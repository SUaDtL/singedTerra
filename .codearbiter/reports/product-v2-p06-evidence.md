# P06 compact-console legibility evidence

Observed 2026-09-13. Base `05b2bf162efb994f99746d1ab93692b3d9ce2988`.
Worker: gpt-5.6-sol/high. Independent reviewer: gpt-6-astra/high.
Parent owns integration, browser execution, and publication.

The short-height console truncated Baby Missile and split Armory and Settings
inside words. One existing CSS media block now fits the weapon name and ammo
metadata on two lines each, keeps Armory and Settings on one line, and retains
bounded overflow for longer weapon names. No component, target geometry,
renderer, input, font, image, dependency, or gameplay behavior changed.

## Causal verification

The baseline Pixel landscape measurement at 802 by 293 CSS pixels failed
weapon-name containment. Actual captures also showed two-line Armory/Settings.
Intermediate candidates retained the failure while the five-line weapon/ammo
stack was corrected. Individual Range rectangles exposed both horizontal and
vertical overflow; zero inline padding and metadata tracking made four lines
fit at the existing font size.

The infinity glyph uses a separate font fragment on the same visual line as
ammo. The regression counts distinct vertical bands within one pixel while
checking every individual fragment for containment. This corrects a fragment
counting oracle; it does not relax the containment or font requirements.

Independent review identified universal `overflow: visible` as a longer-name
regression. The pre-existing Bouncing Betty DOM-cell test failed with expected
hidden versus actual visible. Restoring hidden overflow passed that test and
retained the complete two-line Baby Missile label.

## Final results

- `npm run build`: PASS, including strict shared/client type checks.
- `npm run test:client`: 208 files, 1,938 tests PASS.
- `playwright test e2e/compact-console-legibility.spec.ts e2e/quick-duel-pacing.spec.ts e2e/hud-layout.spec.ts --workers=1 --retries=0`: 40 PASS, two intentional skips for the short-height-only test on other profiles.
- `playwright test -c playwright.product-completion.config.ts compact-readability.spec.ts console.spec.ts --workers=1 --retries=0`: 33 PASS, 17 existing profile-specific skips across five profiles.
- Secrets scan: empty findings. `git diff --check`: PASS.

Both browser commands used `E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/`
and denied external network. Build and preview both used `VITE_BASE=/singedTerra/`.
An earlier preview omitted that base and served HTML for prefixed assets; its
setup failures were excluded from product evidence and the preview was replaced.

The final candidate's 60 served files matched disk byte for byte. The retained
inventory SHA-256 is
`2350d60f18632589e00b5a52ef913b553deb7dc7051f8be51bf3395a127c36cf`.
The parent-owned listener was stopped after verification before another
worktree used the sole localhost.

Final label size was 14.354259 physical CSS pixels. All ten targets remained
at least 44 by 44 physical CSS pixels. Target rectangles, chassis, stage, and
canvas matched the baseline exactly. The requested image/font resource URL
set was unchanged. The parent inspected live and restart captures for desktop,
Pixel landscape, and small-window profiles; named labels were complete and
the other layouts retained their presentation.

Raw logs, measurements, and the baseline capture are preserved under the host
temporary directory as `product-v2-p06-*`; final screenshots are in this
worktree's Playwright test-results directory. These are local validation
receipts, not a hosted publication or physical-device observation. Device
emulation does not establish human usability, retention, GPU residency, or
thermal behavior.
