# ST-KIT-01 - Retained tank and field-kit art library

B requested a small library of tank/base pieces, visible upgrades and cosmetics,
an index, and PR publication before further beginning-of-game planning.
Baseline: 39e9d94bcf978e6b5a0946e5eded010e75629bc8, draft PR #524.
This is one art-library slice; not dispatch of a new progression or combat layer.

## Scope
Twenty independently reusable mesh entries: six extracted from the retained
starter art, plus fourteen newly authored gun/module/armor/cosmetic/field props.
Three paint finishes and three assembled presentation examples demonstrate reuse.
Keep the tracked-machine, worn metal, bronze accent and retro-industrial identity.
Deliver editable Blender source, separate FBX files, Unity prefabs, stable asset
IDs, source/mount/size/triangle/material metadata, illustrated Markdown index and
a separate browser-capable gallery scene with item selection and camera orbit.
Upgrade names describe candidate physical forms, not approved ranks or effects.
Field-base props are scenery; they do not implement building, production or R&D.

## Boundary and acceptance
Write campaign-unity/** and this specification only. Preserve existing source,
FieldAssembly, fixtures, original stterra/stweb01 work and dated receipts.
No new prices, unlocks, slot rules, stats, Skills, inventory, saves, rewards,
classic integration, Android, dependencies, merge, force push or public hosting.
Check all IDs/files/materials, finite geometry, pivots, assembly references and
Unity import scale; compile a separate gallery Web build and inspect real frames.
Exercise gallery selection/orbit/paint/assembly controls with ordinary pointer
input; close owned test browsers and loopback servers. Record actual evidence.
Regeneration must refuse existing authored outputs; normal export uses saved art.
Rollback is a scoped revert of this additive library, not a reset or data deletion.
