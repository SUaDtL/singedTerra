# P11 after-action facts and same-scenario replay

Observed 2026-09-13 on base36003c0. Worker: gpt-5.6-terra/high.
Independent reviewer: gpt-5.6-sol/high. Parent owns integration, browser
execution, visual acceptance, and delivery.

Ordinary local reports now identify a proven multi-round clinch and offer one
fixed experiment: keep power fixed, change the opening angle, and compare the
first impact. The existing restart action is labeled Replay same scenario.
No causal shot explanation is invented from aggregate scores. Single-round,
draw, missing-winner, and inconsistent round/match-winner cases omit the
clinching explanation. Team results use the existing winning-team facts.
Practice Field Orders, verified reports, and network rematches retain their
existing projection and action identities.

The new copy uses the existing HUD projection and terminal view. On coarse
pointers it occupies the hero column above the decorative tank. The hero may
shrink within the panel; the tank fits the remaining space while preserving
its aspect ratio. On fine pointers the explanations stay in report context.
The view changes the parent only when the desired destination changes.

## Causal corrections

The original copy overflowed the report and rendered at 4.883 physical CSS
pixels on the short Pixel profile. Both explanation selectors now participate
in the existing 10.5-pixel report readability gate. Narrow fine uses the
existing 15-logical-pixel style; coarse uses the established physical target
scale to produce approximately 11 physical pixels.

A stable-update test originally checked only whether prepend ran again. The
parent added assertions that the node stays in the hero on successive updates,
reproduced the alternating-parent defect, then corrected the conditional.
The complete terminal-view file passed all ten tests after that correction.

Browser measurements then isolated the remaining mobile overflow: the hero's
automatic minimum height forced a 452.85-logical-pixel grid row into a panel
with approximately 400.6 logical pixels available. An attempted gap/padding
adjustment did not fix that cause and was removed. Allowing the hero to shrink
and fitting the decorative tank passed the actual clinch browser regression
without lowering text, target, or containment requirements.

## Verification

- Final full client suite: 1,956 tests in 208 files PASS.
- Final production build and strict shared/client type checks: PASS.
- Focused final mobile and small-window browser run: 11 PASS, one existing
  profile-specific skip. The real Pixel match completed a best-of-three
  clinch, rendered the exact winning round, retained keyboard focus order,
  and replayed through the public action with fresh health, angle and power.
- Complete report/ordinary-guest/Quick Duel browser run: 39 PASS, three existing
  profile-specific skips, zero failures. Both real desktop and Pixel clinches
  and their public replay actions passed.
- Final coverage run passed: 94.14% lines and 84.44% branches, above the stage-1
  60% floors. Raw log: product-v2-p11-final-coverage.log.
- Diff hygiene passed. The only scanner candidate is the unchanged synthetic
  seat-token in a mocked network lifecycle test, verified against HEAD; no
  new secret or security primitive was introduced.

Build8b2723 was served by the sole parent-owned preview at
http://127.0.0.1:5198/singedTerra/. All 60 served files matched disk. The retained
inventory SHA-256 is
`62df27ec865e746b4bfd1bf796c5db3800d93c845ce836dbcb58710a4c85ef7e`.
Browser execution denied external network. No production backend was used.

The parent inspected the actual desktop and Pixel terminal/replay captures.
The real clinch used public controls and accepted self-directed shots; no
terminal state was injected for that proof. Separate existing Last Light and
verified terminal fixtures remain synthetic presentation evidence. Baseline
console clipping in this isolated worktree is covered by the independently
accepted P06 integration, not claimed fixed by P11.

Raw logs and captures are retained under the host temporary directory with
the product-v2-p11 prefix. The final browser log is
product-v2-p11-accepted-browser.log; layout diagnosis and rejected captures
remain separately retained. Human understanding, voluntary experimentation,
retention, and physical-device performance have not been observed.
