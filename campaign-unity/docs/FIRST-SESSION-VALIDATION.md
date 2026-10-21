# First-session clarity validation

The October 21, 2026 candidate clarifies three existing interfaces: upgrade
intervals use seconds, shop headings identify purchase lifetime, and the live
goal banner says that progress saves at the end of the run. It also repairs the
Vite audit failure that followed PR #540. Combat, rewards, prices, save version,
tier goals, art and camera are unchanged.

## Local evidence

- The [dependency report](../Evidence/first-session-polish/dependency-repair.md)
  records the bounded Vite 8.3.4 update, exact Nano ID override, reviewed
  transitives, zero audit vulnerabilities, signatures, 2,548 client cases and
  compatibility checks. These are local results, not hosted CI.
- Forty-two affected pure C# checks passed. The catalog regression covers
  fractional seconds, adjacent upgrade levels and invariant formatting. HUD
  checks cover the goal threshold without prematurely saving or unlocking a
  tier. Existing save and progression checks remain enabled.
- The pinned Unity 6000.3.24f1 Editor passed `RunBattleShop`, `RunWorkshop`, and
  the new `RunFirstSessionClarity` check. The new check covers both fittings
  across five Canvas sizes. Its first fixture incorrectly began in the
  Workshop; that failed result is retained separately from the corrected pass.
- A fresh Unity Web export passed with equal source inventories before and
  after the build. The checked-in asset manifest, sanitized build receipt and
  source lock bind the new runtime. The normal `/singedTerra/` production build
  then passed its source validators and TypeScript checks.
- [Both fittings passed the post-change browser journey](../Evidence/first-session-polish/both-fittings-polished-scroll-20261021/summary.json)
  at normal speed without seeded progression. Each earned and manually claimed
  Salvage, purchased Cannon level 1, reloaded, and redeployed with stronger
  damage. Five viewport sizes cover shop and live-goal text as well as the
  existing garage, combat and result matrix. Interrupted runs paid no reward.
- The new shop matrix initially rejected correctly clipped, scrollable Buy
  controls. The corrected helper checks actual clipping, reachability, full
  reveal by pointer scrolling, minimum target size and visible overlaps. A
  subsequent independent review found a CSS/backing-pixel mismatch at DPR 2.
  Its regression failed before normalization and passed afterward. All seven
  geometry regressions and the focused re-review passed. The both-fitting
  record retains its earlier helper hash; it is not relabeled as a run of the
  final helper.
- The geometry regressions are included in the explicit `npm run check` chain,
  as required by CONTRIBUTING. The seven cases passed again after integration,
  and the ST1 manifest passed with all 32 members retained. Its only new source
  hash is the root package script; deterministic simulation sources are
  unchanged. The dependency report retains its earlier candidate hash.
- [The tuning rerun](FIRST-SESSION-TUNING.md#check-after-the-clarity-changes)
  reproduced all 16 baseline measurements and both earned-purchase proofs
  exactly. The optional same-tier comparison cue remains a proposal.

Selected captures show the [phone Utility shop](../Evidence/first-session-polish/both-fittings-polished-scroll-20261021/repair/permanent-shop-utility-390x844.png),
[phone live-goal banner](../Evidence/first-session-polish/both-fittings-polished-scroll-20261021/repair/goal-met-live-390x844.png),
and [landscape Field Repair card after scrolling](../Evidence/first-session-polish/both-fittings-polished-scroll-20261021/repair/permanent-shop-utility-844x390-ShopCard_fieldRepairBuy.png).
Full raw browser captures, Editor archives and failed attempts remain local.
Committed summaries retain the raw hashes and selected observations, not native
acceptance receipts.

## Remaining boundaries

The maintained tier journey passed against the final helper and packaged
runtime. The native Windows Campaigns journey then stopped at a 10-second
PowerShell timeout during auxiliary-window activation, after 848 passing checks
and before the blur interval. Activation completion is unknown. Cleanup
confirmed no remaining owned processes and removal of the owned profile. The
failed run is retained. An unchanged affected-journey retry stopped after 19.3
seconds because the native safety check reported capture or held input. Its 22
recorded checks passed, but it did not qualify the player journey. Both failures
and their exact runtime identities are preserved in the [attempt summary](../Evidence/first-session-polish/windows-attempts-summary.json).
The timeout and input protections remain unchanged. A fresh native run needs a
suitable idle desktop window. Hosted CI, merge and deployment are not
established by the local results above.

The owner approved sprint execution in ordinary language. The combat-treatment
choice remains open, as do human visual, motion and listening acceptance. No
code, receipt or scripted browser observation substitutes for those decisions.
The sprint's combat task remains pending; this candidate is the independently
reviewed clarity, measurement and dependency portion of the sprint.
