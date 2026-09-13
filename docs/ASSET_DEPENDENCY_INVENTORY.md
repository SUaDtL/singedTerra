# Asset and dependency inventory

This inventory records the product-improvements-v2 source at HEAD `e49b424c67b2f1a09bd5593156f15117915e93df` on 2026-09-12. The worktree contains unrelated P13 changes and these two untracked inventory artifacts; those files were preserved. It is an evidence record, not a commercial rights opinion.

## Counts

There are 27 runtime visual assets: 24 files under `client/public` plus three imported files under `client/src/assets`. Nine battle-console outputs have a complete source-master and transformation record. Six world and terrain WebPs retain documented project-generated attribution, but their source-master hashes and transformation recipes are explicitly unresolved. Twelve other runtime assets remain explicitly unresolved. `client/public` contains 26 files, including `.nojekyll` and the battle-console manifest. Four additional images under `docs/assets` are documentation-only.

The complete per-file list, bytes, SHA-256 values, evidence paths, dependency versions, and command results is in [asset-dependency-inventory.json](asset-dependency-inventory.json).

## Provenance status

`docs/ART_PROVENANCE.md` documents attribution for six world panoramas and terrain materials. For those six WebPs, the source-master SHA-256 values and transformation recipe are not present in the inspected repository; the inventory records that derivative trace as unresolved while preserving the known project-generated attribution. The battle-console manifest documents nine generated PNG derivatives. Its recipe binds source and reference paths, SHA-256 values, Sharp encoding settings, responsive Lanczos3 projection, and output hashes.

The following runtime assets have no consolidated source-master or transformation record in the inspected repository: the four `battlefield-theater-*` files, `explosion-sheet.webp`, `tank-chassis.webp`, `tank-parts.webp`, `banner.svg`, `splash-hero.png`, and the three imported battle-console frame WebPs. Existing feature specs and commit messages use terms such as authored or generated, but this inventory does not infer provenance from those labels. Each item is therefore recorded as unresolved.

The four documentation images also lack an asset provenance record. They are separated from the runtime total because the client does not ship them as application assets.

## Fonts and audio

No font files are present in the runtime asset set. CSS uses named system fallback stacks, so no system font is redistributed. Audio is synthesized through the Web Audio API in `client/src/audio/AudioEngine.ts`; no runtime audio files were found.

## Dependencies and notices

The lockfile pins every direct dependency and devDependency declared by the root, `client`, and `shared` workspaces; the JSON records the declaring workspace, requested range, locked version, registry or workspace provenance, declared license, and per-package notice status. The `declared_license` field reflects package metadata and the existing notices. It does not establish legal clearance for the application or its assets. Dependency junctions are present in this checkout, but the current installed graph is not a valid verification graph because the junction points to another worktree and `npm ls --all --depth=0` reports extraneous and unmet workspace entries. No install was performed.

`THIRD_PARTY_NOTICES.md` has exact version deltas requiring later review: PixiJS is documented as 8.20.0 while the lockfile pins 8.20.1; Sharp is documented as 0.35.3 while the lockfile pins 0.35.4; Lucide is documented as 1.27.0 and its embedded closure names 1.33.0 while the lockfile pins 1.41.0. This task intentionally does not edit that notice file.

## Verification boundary

`git rev-parse HEAD` returned `e49b424c67b2f1a09bd5593156f15117915e93df`. `git status --porcelain=v1` returned exit code 0 with the unrelated P13 work and these two inventory files present; no dirty work was changed. An earlier pre-junction `npm ls --all --depth=0` returned exit code 1 because dependencies were absent at that observation. The current junctioned checkout was also checked with `npm ls --all --depth=0` (exit code 1); it reports extraneous and unmet workspace entries, so it does not validate the installed graph. Install, removal, build, audit, full checks, asset generation, browser checks, and production checks were not run. No secrets were read or recorded. No asset or dependency was removed.

The inventory is complete for the inspected 33-file asset corpus and direct workspace dependency declarations: known attribution, complete derivative traces, and explicit unresolved records are preserved. Commercial release still requires maintainer escalation of unresolved rights and notice deltas; that escalation is separate from completing this inventory and is not silently treated as acceptance.
