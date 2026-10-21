using System;
using System.Globalization;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Measurement-only entry point: compile the production combat, catalog and
// progression owners. No copied combat formulas, edited rules or browser save.
internal static class FirstSessionMeasurements
{
    sealed class MemoryStorage : ILastStandStorage
    {
        string value;
        public string Read() => value;
        public void Write(string next) { value = next; }
    }

    static void Require(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }

    static EncounterModel Measure(int tier, LastStandFitting fitting, string scenario,
        int[] permanentLevels, int runLevel)
    {
        bool launcher = fitting == LastStandFitting.Launcher;
        var model = new EncounterModel(launcher, EncounterProfile.ForTier(tier));
        int Level(LastStandUpgradeTrackId id)
        {
            var definition = LastStandUpgradeCatalog.Get(id);
            return definition.IsEligible(fitting)
                ? definition.Project(permanentLevels[(int)id], runLevel, fitting).CurrentLevel : 0;
        }
        int Effect(LastStandUpgradeTrackId id) => LastStandUpgradeCatalog.Get(id).EffectAt(Level(id), 1);
        int armorLevel = Level(LastStandUpgradeTrackId.Armor);
        Require(model.TryApplyPlayableAttackProjection(Effect(LastStandUpgradeTrackId.CannonAttack),
            launcher ? Effect(LastStandUpgradeTrackId.LauncherAttack) : EncounterModel.LauncherDamage), "attack projection");
        Require(model.TryApplyPlayableDefenseProjection(Effect(LastStandUpgradeTrackId.HullCapacity),
            raw => LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).EffectAt(armorLevel, raw)), "defense projection");
        Require(model.TryApplyPlayableCannonPeriodProjection(Effect(LastStandUpgradeTrackId.CannonCycle)), "cannon period projection");
        if (!launcher) Require(model.TryApplyPlayableRepairProjection(Effect(LastStandUpgradeTrackId.FieldRepair)), "repair projection");

        int firstKill = 0, firstHit = 0, goalHull = -1, goalKills = -1;
        int goal = LastStandTierCatalog.Get(tier).GoalTicks;
        while (model.Status == EncounterStatus.Running)
        {
            model.Step();
            if (firstKill == 0 && model.Kills > 0) firstKill = model.Tick;
            if (firstHit == 0 && model.CloseHits + model.RangedHits > 0) firstHit = model.Tick;
            if (model.Tick == goal) { goalHull = model.Hull; goalKills = model.Kills; }
        }
        Console.WriteLine(string.Join(",", new object[] { "measurement", tier,
            launcher ? "launcher" : "repair", scenario, model.Tick, model.Kills, model.Hull,
            model.Status, firstKill, firstHit, goalHull, goalKills, model.CannonShots,
            model.LauncherShots, model.Restored, model.CloseHits, model.RangedHits,
            model.CurrentCannonDamage, model.CurrentMaximumHull, model.CurrentCannonPeriod,
            model.CurrentLauncherDamage, model.CurrentRepairAmount }));
        return model;
    }

    static int[] Levels(int level)
    {
        var result = new int[LastStandUpgradeCatalog.Tracks.Count];
        for (int i = 0; i < result.Length; i++) result[i] = level;
        return result;
    }

    static int[] EarnFirstUpgrade(LastStandFitting fitting, EncounterModel firstRun)
    {
        var storage = new MemoryStorage();
        var progression = LastStandProgression.Load(storage);
        Require(progression.TryDeploy(), "fresh deployment");
        Require(firstRun.Profile.Tier == progression.ActiveTier && firstRun.Status == EncounterStatus.Defeated,
            "actual starter Tier 1 defeat required");
        Require(progression.TryStageDefeat(firstRun.Tick, firstRun.Kills), "save actual model terminal result");
        Require(progression.Wallet == 0 && progression.PendingDefeat.Reward == 1, "claim must remain manual");
        Require(progression.TryClaim() && progression.Wallet == 1, "claim exactly one Salvage");
        Require(progression.TryPurchase(LastStandUpgradeTrackId.CannonAttack) && progression.Wallet == 0,
            "first cannon upgrade spends exactly one Salvage");
        progression = LastStandProgression.Load(storage);
        Require(progression.SaveState == "ready" && progression.TierTwoUnlocked, "reload confirmed earned profile");
        var levels = new int[LastStandUpgradeCatalog.Tracks.Count];
        foreach (var definition in LastStandUpgradeCatalog.Tracks)
        {
            levels[(int)definition.Id] = progression.GetPermanentLevel(definition.Id);
            Require(levels[(int)definition.Id] == (definition.Id == LastStandUpgradeTrackId.CannonAttack ? 1 : 0),
                "exactly one purchased level, no other upgrade");
        }
        Console.WriteLine("earned,{0},{1},{2},{3},{4},{5}",
            fitting == LastStandFitting.Launcher ? "launcher" : "repair", firstRun.Tick, firstRun.Kills,
            progression.CannonAttackLevel, progression.Wallet, progression.TierTwoUnlocked);
        return levels;
    }

    static int Main()
    {
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        try
        {
            foreach (var fitting in new[] { LastStandFitting.Repair, LastStandFitting.Launcher })
            {
                var starter = Measure(1, fitting, "starter", Levels(0), 0);
                var earned = EarnFirstUpgrade(fitting, starter);
                Measure(2, fitting, "starter", Levels(0), 0);
                foreach (int tier in new[] { 1, 2 })
                {
                    Measure(tier, fitting, "first_earned_cannon", earned, 0);
                    Measure(tier, fitting, "permanent_cap_bound", Levels(LastStandUpgradeCatalog.PermanentCap), 0);
                    Measure(tier, fitting, "total_cap_bound", Levels(LastStandUpgradeCatalog.PermanentCap),
                        LastStandUpgradeCatalog.TotalCap - LastStandUpgradeCatalog.PermanentCap);
                }
            }
            return 0;
        }
        catch (Exception exception) { Console.Error.WriteLine(exception); return 1; }
    }
}
