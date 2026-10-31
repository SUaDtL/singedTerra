using System;
using UnityEngine;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // Read-only wire projections; application commands and persistence remain
    // with their owners. Keep the existing v1 player/evidence field identities.
    public static class LastStandObservations
    {
        public static void Emit(LastStandLoopController loop,string action)
        {
            var edition=loop.Session.Model?.Profile.Edition??loop.Progression.Checkpoint?.Edition??LastStandRunEdition.Current;
            Debug.Log("ST_LS_STATE " + JsonUtility.ToJson(new State { action = action, phase = loop.Phase,
                saveState = loop.Progression.SaveState, saveError = loop.Progression.SaveError ?? "", notice = loop.Notice,
                wallet = loop.Progression.Wallet, level = loop.Progression.CannonAttackLevel, nextCost = loop.Progression.NextCost,
                cannonDamage = loop.Session.Model?.CommittedCannonDamage ?? loop.Progression.CannonDamage,
                runId = loop.Progression.ActiveRunId, pendingRunId = loop.Progression.PendingDefeat?.RunId ?? 0,
                tick = loop.Session.Model?.Tick ?? 0, hull = loop.Session.Model?.Hull ?? 120, kills = loop.Session.Model?.Kills ?? 0,
                mortarShots=loop.Session.Model?.MortarShots??0,railgunShots=loop.Session.Model?.RailgunShots??0,
                mortarDamage=loop.Session.Model?.CurrentMortarDamage??LastStandUpgradeCatalog.BaseMortarDamage,
                railgunDamage=loop.Session.Model?.CurrentRailgunDamage??LastStandUpgradeCatalog.BaseRailgunDamage,
                selectedTier = loop.Progression.SelectedTier, activeTier = loop.Progression.ActiveTier,
                profileVersion = edition.RulesVersion, contentVersion=edition.ContentVersion,economyVersion=edition.EconomyVersion,
                tierTwoUnlocked = loop.Progression.TierTwoUnlocked,
                bestTicks1 = loop.Progression.GetBestTicks(1), bestTicks2 = loop.Progression.GetBestTicks(2),
                bestKills1 = loop.Progression.GetBestKills(1), bestKills2 = loop.Progression.GetBestKills(2),
                pendingTier = loop.Progression.PendingDefeat?.Tier ?? 0, pendingReward = loop.Progression.PendingDefeat?.Reward ?? 0,
                goalMet = loop.Session.Model != null && LastStandTierHudText.GoalMet(loop.Session.Model.Profile.Tier,loop.Session.Model.CompletedWave),
                wave=loop.Session.Model?.Wave??0,completedWave=loop.Session.Model?.CompletedWave??0,
                remainingWaveEnemies=loop.Session.Model?.RemainingWaveEnemies??0,
                hasCheckpoint=loop.Progression.HasCheckpoint,checkpointWave=loop.Progression.Checkpoint?.CompletedWave??0,
                checkpointBlocked=loop.Session.CheckpointBlocked,bestWave=loop.Progression.GetBestWave(loop.Session.Model?.Profile.Tier??loop.Progression.SelectedTier),
                paused = loop.Session.Paused, muted = loop.Muted, speed = loop.Session.EffectiveSpeed,
                selectedSpeed = loop.Session.SelectedSpeed, menu = loop.MenuPage, preferencesState = loop.Preferences.SaveState,
                selectionId = loop.SelectionOpen && loop.Selection!=null ? loop.Selection.Current.Id : "",
                selectionUnlocked = loop.SelectionOpen && loop.Selection!=null && loop.Selection.Current.Unlocked,
                garageTierId = loop.GarageCardsVisible && loop.GarageTierSelection!=null ? loop.GarageTierSelection.Current.Id : "",
                garageTierUnlocked = loop.GarageCardsVisible && loop.GarageTierSelection!=null && loop.GarageTierSelection.Current.Unlocked,
                lockedTierPreview = loop.HasLockedTierPreview,
                environmentId = loop.EnvironmentId, fittingId=loop.FittingId,
                renderScale = loop.Display.RenderScale, fullscreen = loop.Browser.Fullscreen,
                musicEnabled = loop.Preferences.Current.MusicEnabled, tutorialTips = loop.Preferences.Current.TutorialTips,
                purchaseSuggestions = loop.Preferences.Current.PurchaseSuggestions,
                masterVolume = loop.Preferences.Current.MasterVolume, effectsVolume = loop.Preferences.Current.EffectsVolume,
                musicVolume = loop.Preferences.Current.MusicVolume }));
        }
        public static void Hit(EncounterModel model)
        {
            Debug.Log("ST_LS_HIT " + JsonUtility.ToJson(new HitState { tick=model.Tick,
                cannonDamage=model.CommittedCannonDamage,firstFoeHull=model.Foes[0].Hull,kills=model.Kills }));
        }
        [Serializable] sealed class State
        {
            public string action, phase, saveState, saveError, notice, profileVersion,contentVersion,economyVersion;
            public int wallet, level, nextCost, cannonDamage, runId, pendingRunId, tick, hull, kills;
            public int mortarShots,railgunShots,mortarDamage,railgunDamage;
            public int selectedTier, activeTier, bestTicks1, bestTicks2, bestKills1, bestKills2, pendingTier, pendingReward;
            public bool paused, muted, tierTwoUnlocked, goalMet;
            public int wave,completedWave,remainingWaveEnemies,checkpointWave,bestWave;
            public bool hasCheckpoint,checkpointBlocked;
            public double speed, selectedSpeed;
            public string menu, preferencesState;
            public string selectionId, environmentId, fittingId;
            public bool selectionUnlocked;
            public string garageTierId;
            public bool garageTierUnlocked,lockedTierPreview;
            public float renderScale;
            public bool fullscreen, musicEnabled, tutorialTips, purchaseSuggestions;
            public int masterVolume, effectsVolume, musicVolume;
        }
        [Serializable] sealed class HitState { public int tick, cannonDamage, firstFoeHull, kills; }
    }
}
