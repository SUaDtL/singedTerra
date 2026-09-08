# Battle console completion and delivery

The accepted console uses one Preact semantic owner with inert Pixi presentation over the Canvas 2D battlefield. Deterministic gameplay, keyboard input and static hosting remain intact.

## Completed and accepted

- Fit Commander health/fuel, weapon/Armory, angle/power, read-only wind, Fire Control, Match and Settings into the shared chassis.
- Verify wide, standard and compact-touch layouts, inventory scrolling, changed values, firing and turn progression.
- Correct Match header icons, title placement and battlefield clearance.
- User visual acceptance and delivery authorization on 2026-09-07: "that looks much better lets get a PR open and get it merged/published".

## Delivery in progress

1. Run fresh client coverage, engine/repository checks, production build, asset checks and responsive browser journeys against the final shipping tree.
2. Clear lifecycle, dependency, security and coverage review findings. Preserve regressions for every delivery correction.
3. Commit the explicit shipping set, push and open a PR. Resolve review comments and require green CI for its exact head.
4. Merge through the PR, verify GitHub Pages publication and the deployed revision.

## Retained scope

The shipping-retention manifest identifies contract and asset inputs still required by tests and generation. Obsolete local snapshots, generated evidence, experiment configurations and campaign.html stay outside Git history. The user authorized retiring historical artifacts; automatic approval review blocked recursive local cleanup, so those excluded files remain local.

## Delivery corrections

Review found partial Pixi asset-load cleanup and overlapping mount/destroy races; causal regressions and cleanup ordering corrections are included. Browser verification also found a short landscape touch-target defect and briefing focus loss; these have targeted regression coverage. The transitive xmldom patch was vetted and updated to 0.8.15, clearing the dependency audit.
## Fresh delivery evidence — 2026-09-07

The clean shipping checkout installs with npm ci and passes 1,635 client tests in 183 files (lines 91.97%, branches 79.65%), engine/repository checks, all 356 Edge tests, two deterministic asset-generator tests, and a production build with the GitHub Pages project base. Dependency audit reports zero vulnerabilities. The state-free secrets scan found only reviewed HTML autocomplete strings and synthetic browser-fixture tokens; no credentials are present. Whole-branch correctness, coverage, dependency, security and migration reviews pass.

The five-profile product suite passes 81 applicable checks with 19 explicit profile skips. The final default three-profile suite passes 321 checks with 12 intentional profile skips (1.7 minutes), including the diagnostics focus and compact online containment corrections.

The inherited branch also includes protected-floor protocol changes from commit 209b7c6. Production remains on verified V1 and migration 016. The reviewed cutover and forward-recovery procedure is in docs/VERIFIED_V2_CUTOVER.md. Keep the PR unmerged until backend readiness is proven; merging automatically publishes Pages. Existing network records must not be canceled or deleted.

The repository's last-checkpoint file is an override-count marker, as confirmed in the installed state reader. Its value remains unchanged; this plan records the fresh delivery gate evidence.