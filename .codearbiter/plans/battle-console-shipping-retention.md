# Battle console shipping retention audit

This is a dependency retention recommendation, not a staging or deletion action. The companion JSON enumerates exact new contract, generator, artwork and check-helper inputs. Retain all current client source/tests and product-completion e2e source/config separately, plus reviewed tracked changes and current governance documents.

## Required closure

The 19 contract files total 8,507,942 bytes. Production imports consume ownership/layers, ownership/retirement, reference/assemblies, state/dynamic-appearance, and topology/chrome-sockets, lifecycle-triggers, projections, semantic-owners, style-scope. Client tests also read state/visual-state, input-arbiter, input-accessibility and topology/intent-transition-traces. The asset recipe needs fixtures/asset-build and five reference PNGs. JSON documentary references are not recursively opened by runtime or generator.

Keep all 10 generated integrated-console files and all three client/src/assets/battle-console images. Keep the three selected battlefield v3 backgrounds and ultrawide-v2 fallback, referenced from main.ts.

Only build-battle-console.mjs, its test and battle-console-assets.json are required from scripts/assets for the replacement generator. They do not import the historical scripts/assets/battle-console modules.

## Historical cleanup candidates

Within .codearbiter/contracts/battle-console, all files other than the 19 allowlisted paths are outside the current shipping runtime/client-test/generator closure once historical e2e are retired. This includes scratch quarantine, frozen final evidence, verifier executable/browser snapshots, preflight, predecessors, preservation, performance and product-freezes. Preserve campaign.html locally only, never stage it. Root controls any physical deletion after path containment checks.

Remove historical e2e/battle-console-integrated and matching campaign Playwright configurations from shipping discovery; they pull frozen local-server evidence and campaign tooling. Keep product-completion tests after parent portable URL/config fixes.

The old battle-hud generator/test/recipe, client/public/art/battle-hud and client/public/generated/battle-hud have no runtime references. Remove root package build:assets:battle-hud and test:assets:battle-hud commands if deleting them. Older unused public battle-console-compact-v2 and ultrawide-underlay-v2 through v7 are not referenced by current client.

## Portability and size

Historical verifier snapshots contain chrome.dll at 297,987,584 bytes, beyond GitHub single-file limits, and duplicated node/browser executables. Do not stage entire contracts or scripts/assets trees. Largest required contract is ownership/retirement.json at 3,417,468 bytes; direct runtime contract imports remain a future simplification opportunity, not missing dependency evidence.

final-repository-root.mjs is required by the changed migration check scripts. Its default resolves the current checkout and git command portably. BATTLE_CONSOLE_FINAL_REPOSITORY_ROOT and BATTLE_CONSOLE_FINAL_GIT_EXECUTABLE accept absolute overrides; leave unset in clean-checkout CI so checks verify that checkout.

## Successor shipping test

retirement-source-closure.test.ts no longer requires a local quarantine copy. It still checks actual retired public paths absent, index/HUD references absent, legacy AST members/listeners/routes absent and no second mountable predecessor owner. Focused result: 5/5 passing. Historical scratch existence is intentionally no longer a shipping requirement under the user-authorized cleanup.
