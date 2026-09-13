# P12 local implementation evidence

- Task: P12, credential-free public seed challenge links
- Base HEAD: `e5c1a99c3500544f79860b0abe46fdcc9267b314`
- Integrated pending merge parent: `923fbc40938cec7d7d1b1692221fc19eff470132`
- Result SHA: uncommitted local implementation; parent owns integration and commit
- Worker: GPT-5.6 Sol, high reasoning
- Review: independent Astra source review pending parent routing

## Behavior delivered

- Strict ST1 parser/serializer and canonical query-free fragment URL builder for
  Last Light and the three P04 practice operations.
- Exact registry/profile validation, canonical uint32 base36 bounds, fixed P04
  seed 42, and no Standard Duel fallback for imported material.
- One shared Quick Duel composer preserving the existing recipient-local roster,
  Medium CPU, operation settings, and exact launch seed.
- Explicit chooser callout and click-to-start receiver. Invalid challenge input
  remains inert and is never echoed. Live-room query ownership is preserved.
- Eligible terminal copy action with Clipboard success announcement and a
  selectable canonical full-link fallback on missing or denied Clipboard.
- Imported origin retained in `currentConfig` across restart. A validated imported
  run cannot call casual recording or create the anonymous sign-in handoff.
- ST1 source manifest binds 30 normalized-LF production inputs, including all
  engine/type membership, Quick Duel/Field Order/hot-seat composition, the main
  CPU action driver, package gate wiring, and the guard itself.

## TDD and commands

- RED: client codec/composer focus failed because both production modules were
  absent. Exit 1.
- GREEN: codec/composer focus passed 39 tests. Exit 0.
- RED: receiver focus produced 7 expected failures before chooser and Lobby
  integration. Exit 1.
- RED: terminal/HUD focus produced 5 expected failures before the copy and
  projection seam. Exit 1.
- RED: Node compatibility test failed with `ERR_MODULE_NOT_FOUND` before the guard
  existed. Exit 1.
- `node --test scripts/checks/seed_challenge_compatibility.test.mjs`: 3 passed.
  Exit 0. Covers exact membership, added/deleted source refusal, hash drift, and
  malformed ordering.
- `npm run check:seed-challenge-compatibility`: PASS, 30 bound sources. Exit 0.
- Seven P12-focused Vitest files: 180 passed. Exit 0.
- Seven adjacent Quick Operation, Field Order, mode-composition, Lobby invite,
  and Lobby account files: 128 passed. Exit 0.
- `npm run typecheck`: shared and client PASS. Exit 0.
- `git diff --check`: PASS (final check recorded at freeze).

The local test junction currently supplies Vitest 4.1.11 from the accepted P02
dependency tree. The parent owns final validation after refreshing to the current
integrated Vitest 5 dependency base.

## Parent-owned acceptance

No browser, build, server, full-client, coverage, install, or remote command ran in
this worker. The parent owns integrated Vitest 5/full gates and browser proof for
Last Light and one P04 direct link, query collision, keyboard/touch copy, Clipboard
fallback, same-seed restart, and responsive terminal/lobby geometry.

If the parent imports any newer bound source, especially `package.json` or
`client/src/main.ts`, the manifest must fail. Retain ST1 only after comparing the
integrated source and explicitly confirming parity; do not regenerate it blindly.

## Rollback

Remove the terminal generation action first while retaining strict ST1 decoding
or an explicit unsupported-version result. Never reinterpret ST1 under changed
engine/CPU behavior.

## Parent integration on 2026-09-13

The reviewed P12 patch was applied to delivery worktree `product-v2-p12-delivery`
at9408b5e, preserving the original author worktree and pending merge index.
All30 bound production inputs still match the original manifest; no hashes were
refreshed. Independent Astra source/security/compatibility review passed with one
LOW accessible-name finding. The focused fallback test reproduced it in both
missing/denied Clipboard cases (2 failed,12 passed); adding the explicit Challenge
link label produced14 passed. Browser proof is being added separately.

- Full client on paired Vitest5:2027 passed;94.31% lines,84.46% branches.
- Prefixed production build and strict typecheck:PASS.
- Full npm run check engine/release/compatibility chain:PASS.
- Browser spec standalone strict TypeScript check:PASS.
- Raw logs:Temp/product-v2-p12-integrated-coverage.log,
  Temp/product-v2-p12-build.log,Temp/product-v2-p12-integrated-check.log,
  Temp/product-v2-p12-fallback-name-red.log and its green counterpart.

Final browser, visual acceptance, integration review, commit and publication remain
pending. These checks do not substitute for those acceptance steps.

ST1 integration parity: independent Astra confirmed df26c1c changes only the bound root package Node type patch24.13.3 to24.13.4. Other29 hashes and membership remain unchanged. The guard correctly refused the new root package before its single reviewed hash update to965d5d6a4d2d3f38967a91e240c5825a00979c826777db0c86dab90f6842e763. Simulation/CPU/launch behavior is unchanged. Original snapshot stash93b3fa74e77dff27d64055c0acb50d8b4ae0d69d is retained.

## Final integrated acceptance on 2026-09-13

The parent integrated the owner-requested Hot Seat repair with P12 in
`product-v2-p12-delivery`. Built-in ImageGen generated the reference before the
repair was implemented. The saved image and exact prompt are in
`docs/design/hot-seat-layout-reference.png` and its adjacent Markdown file.

Local Battle now exposes crew and battlefield controls directly. Practice vs CPU
and Verified Deployment occupy separate accessible tabs with persistent launch
actions. The smaller Vehicle Bay leaves room for setup. Keyboard tab navigation,
native touch scrolling, crew editing, Garage customization, and launching the
configured match are covered by browser journeys.

Final acceptance supersedes the earlier pending validation above:

- Full client coverage: 2,031 tests in 212 files passed; 94.34% lines and 84.34%
  branches. Log: `Temp/product-v2-p12-hotseat-final-coverage.log`.
- Full non-live browser suite: 387 passed and 24 existing skips, exit 0.
  Log: `Temp/product-v2-hotseat-final-browser.log`. Preserved local captures and results:
  `Temp/product-v2-hotseat-final-browser-results/`.
- Deliberate native touch drag, one tap to edit the fourth crew name, and one tap
  to deploy the four-player match: three consecutive passes plus the full suite.
  Log: `Temp/product-v2-hotseat-native-drag.log`. This proves browser emulation,
  not physical-device or fling-specific behavior.
- Full engine/release/compatibility check chain passed:
  `Temp/product-v2-p12-hotseat-check.log`.
- Final prefixed production build, strict typecheck, and 30-source ST1 guard passed:
  `Temp/product-v2-hotseat-mockup-build6.log`.
- Preview binding verified all 60 served files against disk, zero mismatches:
  `Temp/product-v2-hotseat-final-binding.json`. Inventory SHA-256:
  `E0CD9FD459F9D4B1B75F22699B85B7FBF0D5CDD90FBD1C2950521F20650E623E`.
- Independent Astra review passed all nine Local/Practice/Verified captures across
  desktop, small window, and emulated landscape touch. Parent visual inspection
  agreed. Source, security, dependency, and coverage-design review passed without
  remaining blocking findings.
- The scanner's synthetic network-seat fixture in
  `client/src/main.hotSeatProgression.test.ts` was independently reviewed as test
  data, not a credential. The two unchanged account access/refresh strings in
  `e2e/account-progression-summary.spec.ts` are likewise synthetic fixtures used
  with mocked account data. All three scanner findings are non-secret. No
  dependencies, engine behavior, or backend changed.

The final CSS SHA-256 is
`C1F1829ED19119C5B91A1C60EFAE29736CD06446174E824EBA15B403C0E79B88`.
The reviewed normalized-LF Lobby.ts ST1 hash is
`c9940829b8e78a51a638e4fb7f9e920cd2ad53afffa13e011e4deb6398e356bd`.
Only Lobby.ts, package.json, and seedChallenge.ts changed in the original
30-entry ST1 manifest; CSS is not a manifest input. The final seedChallenge.ts
change removes trailing blank lines only, as verified by comparing both inputs
after stripping trailing whitespace. Its reviewed SHA-256 is
`bcba0ffd99edd25b660a15d1b8087ee152d91869a14237dbab827d3da7b89f3c`. Simulation, CPU, launch defaults, and
source membership retain ST1 parity. The remaining 27 entries are unchanged.

Commit, PR checks, merge, and Pages publication are separate delivery steps;
these local results do not claim production publication or backend deployment.
