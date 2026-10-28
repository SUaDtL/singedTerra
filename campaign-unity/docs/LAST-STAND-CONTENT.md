# Last Stand content authoring

Content is authored as immutable typed C# definitions. The runtime, preview and build validation consume the same definitions. There is no mutable global preview override, separate generated balance table or new content framework.

## Owners

| Content | Authoring source | Consumers |
| --- | --- | --- |
| Tiers and prerequisite chain | `LastStandTierCatalog` | manifest, selectors, encounter profiles and waves |
| Environment identity and copy | `LastStandContentCatalog.Environments` | selector projection and environment presentation |
| Environment lighting and material treatment | `LastStandEnvironmentCatalog` and saved scene bindings | `BattlefieldReview` |
| Fitting identity, copy and milestone unlock | `LastStandFittingCatalog.Definitions` | selectors, save identity parsing and reward milestones |
| Research definitions, curves and effects | `LastStandResearchCatalog.Definitions` | research state, presentation, profile persistence |
| Upgrade definitions and retained prices | `LastStandUpgradeCatalog` and `LastStandEconomyCatalog.All` | shops, combat and retained runs |
| Wave and reward rules | `LastStandWaveCatalog` and `LastStandRewardCatalog` | the production encounter and checkpoint transaction |

`LastStandContentCatalog.Current` is the validated composition of production content. `LastStandContentManifest` accepts a separate immutable definition set for non-awarding previews. `TierOptions`, `Tier` and `EnvironmentForTier` use that set; they do not unlock content, save progress or alter the production singleton.

## Add a tier or battlefield

1. Add a stable tier ID/key, encounter identity, environment reference and prerequisite to the tier catalog. The prerequisite must resolve without a cycle.
2. Reuse an environment, or author its identity once in `LastStandContentCatalog.Environments`. Add its visual treatment in `LastStandEnvironmentCatalog` and a matching saved `BattlefieldReview.environmentBindings` root. Identity/name/description are not copied into the visual catalog.
3. The normal selector derives entries from the manifest. Wave generation accepts the resolved tier definition. Reward milestones derive next-tier unlocks from prerequisites; fitting unlocks derive from fitting definitions.
4. Run content checks and `LastStandContentValidation.Run` in the pinned Unity editor. Both player build targets also run content admission. A missing visual treatment or scene root is a build failure, not a fallback battlefield.

## Add research using existing mechanics

Author one `LastStandResearchDefinition`: stable identity/key, display name, maximum rank, storage slot, price curve, duration curve, effect kind and per-rank effect. A curve is a positive table or polynomial. The definition owns cost, duration, category and effect projection; callers do not switch on its key.

`LastStandResearchDefinitions` separates authored ordering from serialized slots. Its `Get`, `Slot` and `AtSlot` methods own lookup. The current four historical keys keep slots 0..3 regardless of list order. Snapshot `Rank` and `Partial` accessors, and the engine and presentation APIs, resolve those slots through the definition set.

An expanded definition set needs a new catalog version. Adding production content requires an explicit save migration for that version; old saves must not silently acquire a different meaning. This sprint does not ship new research or change the current catalog version/economy. The optional definition argument exercises future content through the real engine without substituting it into the player's profile.

Salvage and Scrap effects combine additively above their 100% base through `EffectNumerator`. Combat speed and research speed each have one authoritative track; competing clock owners are rejected. A genuinely new mechanic needs a new effect handler and its own behavior checks, rather than a misleading label using another effect.

## Validation and proof

Run from repository root:

```powershell
python -B -m unittest discover -s campaign-unity/Tools/last_stand_architecture -p test_content.py -v
```

The focused checks exercise a sparse-ID research extension through actual quoting/admission, funding, completion, effect projection and restore. A tier/environment extension reaches the normal selector and production wave generator. Negative cases cover duplicate identities/slots, missing environment references, prerequisite cycles and unsupported catalog identity. Reordered definitions retain historical slot meanings.

`LastStandContentValidation` validates the pure manifest, matching visual definitions and real saved-scene bindings before packaging. Its scene checks call the same read-only `BattlefieldReview.CanPresentEnvironment` method used by runtime selection. It never writes or regenerates the scene.

The default catalog keeps the existing two tiers, three fittings, four research tracks and three supported economy editions. A successful preview is not permission to publish new progression content or a claim of native-device acceptance.
