"""Declared pure C# dependencies for standalone production-owner harnesses.

Existing paths (including intentional temporary fault copies) win by filename.
Unity presentation scaffolding stays in each harness; this adds no substitute
game logic and never recursively includes the whole application.
"""
from pathlib import Path

DEPENDENCIES = {
    "EncounterModel.cs": ("EncounterProfile.cs", "LastStandWaveCatalog.cs", "LastStandUpgradeCatalog.cs", "LastStandShopState.cs", "EncounterGeometry.cs"),
    "LastStandTierCatalog.cs": ("Content/LastStandEnemyCatalog.cs",),
    "LastStandEnemyCatalog.cs": ("EncounterFoeKind.cs", "LastStandWaveCatalog.cs", "Content/LastStandRunEdition.cs"),
    "LastStandEconomyCatalog.cs": ("LastStandUpgradeCatalog.cs", "LastStandWaveCatalog.cs", "Content/LastStandRunEdition.cs", "Content/LastStandEnemyCatalog.cs"),
    "EncounterProfile.cs": ("LastStandTierCatalog.cs", "LastStandWaveCatalog.cs", "Content/LastStandRunEdition.cs"),
    "LastStandRunEdition.cs": ("LastStandTierCatalog.cs", "LastStandSelection.cs", "LastStandUpgradeCatalog.cs"),
    "LastStandWaveCatalog.cs": ("LastStandTierCatalog.cs", "Content/LastStandRunEdition.cs"),
    "LastStandRewardCatalog.cs": ("LastStandTierCatalog.cs", "LastStandSelection.cs", "Content/LastStandRunEdition.cs"),
    "LastStandTierHudText.cs": ("LastStandTierCatalog.cs", "LastStandMilestonePresentation.cs"),
    "LastStandMilestonePresentation.cs": ("LastStandRewardCatalog.cs", "Content/LastStandRunEdition.cs"),
    "LastStandGuidance.cs": ("LastStandUpgradeCatalog.cs", "LastStandMilestonePresentation.cs"),
    "LastStandUpgradeCatalog.cs": ("MechanicsShopModel.cs", "LastStandRunClock.cs", "LastStandEconomyCatalog.cs"),
    "LastStandRunClock.cs": ("LastStandSpeedPolicy.cs",),
    "LastStandShopState.cs": ("LastStandUpgradeCatalog.cs", "Content/LastStandRunEdition.cs", "EncounterModel.cs"),
    "LastStandSelection.cs": ("LastStandUpgradeCatalog.cs",),
    "LastStandRunCheckpoint.cs": ("EncounterModel.cs", "LastStandSelection.cs", "LastStandShopState.cs"),
    "LastStandProgression.cs": ("LastStandStore.cs", "LastStandRunCheckpoint.cs", "LastStandProgressionSave.cs", "LastStandLegacySave.cs", "LastStandSaveJson.cs", "LastStandRewardCatalog.cs", "LastStandProgressionResearch.cs", "LastStandProgressionResearchSave.cs", "LastStandRunHistory.cs", "LastStandResearchState.cs"),
    "LastStandResearchState.cs": ("LastStandResearchCatalog.cs", "LastStandResearchClock.cs"),
    "LastStandResearchCatalog.cs": ("Content/LastStandResearchDefinitions.cs",),
    "LastStandResearchPresentation.cs": ("LastStandResearchCatalog.cs", "LastStandResearchState.cs"),
    "LastStandContentManifest.cs": ("LastStandTierCatalog.cs", "LastStandSelection.cs", "LastStandUpgradeCatalog.cs", "LastStandResearchCatalog.cs", "LastStandRewardCatalog.cs", "Content/LastStandRunEdition.cs"),
    "LastStandResearchCoordinator.cs": ("LastStandProgression.cs", "LastStandResearchCatalog.cs", "LastStandResearchState.cs", "LastStandResearchClock.cs"),
    "LastStandRunCoordinator.cs": ("LastStandProgression.cs", "EncounterModel.cs", "LastStandShopState.cs", "LastStandRunHistory.cs"),
    "LastStandPurchaseCoordinator.cs": ("LastStandProgression.cs", "LastStandShopState.cs", "LastStandUpgradeCatalog.cs", "Application/ILastStandPurchaseSession.cs"),
    "ILastStandPurchaseSession.cs": ("EncounterModel.cs", "LastStandShopState.cs"),
    "LastStandShopPresentation.cs": ("LastStandProgression.cs", "LastStandShopState.cs"),
    "LastStandProgressionPlanner.cs": ("LastStandProgression.cs", "LastStandShopPresentation.cs", "LastStandResearchPresentation.cs", "LastStandSelection.cs", "LastStandTierCatalog.cs"),
    "LastStandHistoryComparison.cs": ("LastStandRunHistory.cs",),
    "EncounterSession.cs": ("EncounterModel.cs", "LastStandRunClock.cs", "LastStandRunCheckpoint.cs", "Application/ILastStandPurchaseSession.cs"),
}


def complete_sources(scripts, sources):
    result = list(sources)
    names = {Path(path).name for path in result}
    for path in result:
        for name in DEPENDENCIES.get(Path(path).name, ()):
            if Path(name).name not in names:
                result.append(Path(scripts) / name)
                names.add(Path(name).name)
    return result
