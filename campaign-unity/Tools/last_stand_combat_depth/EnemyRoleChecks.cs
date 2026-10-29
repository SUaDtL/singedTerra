using System;
using System.Collections.Generic;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class EnemyRoleChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static void Set(object target, string field, object value)
    {
        var member = target.GetType().GetField(field, Private);
        Check(member != null, "Explicit synthetic-fixture field is missing: " + field);
        member.SetValue(target, value);
    }
    static FoeKind Kind(string name)
    {
        Check(Enum.IsDefined(typeof(FoeKind), name), "Authored enemy role is missing: " + name);
        return (FoeKind)Enum.Parse(typeof(FoeKind), name);
    }
    static EncounterModel Fixture(int tier, int wave, bool retained = false)
    {
        var edition = retained ? LastStandRunEdition.Legacy(LastStandUpgradeCatalog.RetainedEconomyVersion) : LastStandRunEdition.Current;
        var model = new EncounterModel(LastStandFitting.Repair, EncounterProfile.ForTier(tier, edition));
        // Deliberate bounded encounter probes; these do not claim progression.
        Set(model, "<Wave>k__BackingField", wave);
        Set(model, "nextCannon", int.MaxValue - 1);
        Check(model.TryApplyPlayableDefenseProjection(1000000000, raw => 1), "Fixture protection must be admitted.");
        return model;
    }
    static Dictionary<string, int> Cohort(int tier, int wave, bool retained = false)
    {
        var a = Fixture(tier, wave, retained); var b = Fixture(tier, wave, retained);
        int limit = 2000;
        while (a.Spawned < a.WaveEnemyCount && limit-- > 0)
        {
            a.Step(); b.Step();
            Check(a.Snapshot() == b.Snapshot(), "Repeated authored cohort must be deterministic at every tick.");
        }
        Check(limit > 0 && a.Spawned == a.WaveEnemyCount, "Every authored enemy must spawn within bounded ticks.");
        Check(a.ActiveCount == a.WaveEnemyCount && !a.AwaitingWaveCommit, "Living enemies prevent a clear.");
        Check(a.WaveEnemyCount <= 20 && a.Foes.Count == 32, "Roles and elites may not expand cohort or storage capacity.");
        var result = new Dictionary<string, int>(); var ids = new HashSet<int>();
        foreach (var foe in a.Foes)
        {
            if (!foe.Alive) continue;
            Check(ids.Add(foe.Id) && foe.Lane >= 0 && foe.Lane < 8, "Unique bounded enemy identity/lane.");
            Check(foe.Hull > 0 && foe.Hull <= LastStandWaveCatalog.MaximumCombatValue && foe.Damage > 0 && foe.Damage <= LastStandWaveCatalog.MaximumCombatValue,
                "Scaled combat values must remain positive and capped.");
            string name = foe.Kind.ToString(); result[name] = result.TryGetValue(name, out var count) ? count + 1 : 1;
        }
        return result;
    }
    static int Count(Dictionary<string, int> counts, string kind) => counts.TryGetValue(kind, out var value) ? value : 0;
    static void Composition()
    {
        foreach (int wave in new[] { 1, 49, 50, 51, 100, 5000, int.MaxValue })
        {
            var tier1 = Cohort(1, wave); var oldTier2 = Cohort(2, wave, true); var tier2 = Cohort(2, wave);
            foreach (var old in new[] { tier1, oldTier2 })
                Check(Count(old, "Swarmer") + Count(old, "ArmoredBrute") + Count(old, "SiegeElite") == 0,
                    "Tier 1 onboarding and retained Tier 2 must retain Close/Ranged cohorts.");
            Check(Count(tier2, "Swarmer") > 0 && Count(tier2, "ArmoredBrute") > 0,
                "Current Tier 2 must contain distinct Swarmer and Armored Brute roles.");
            Check(Count(tier2, "SiegeElite") == (wave % 50 == 0 ? 1 : 0),
                "Exactly one elite replaces an ordinary slot every 50 waves.");
            Check(Count(tier2, "Close") > 0 && Count(tier2, "Ranged") > 0,
                "New roles do not erase existing close and ranged roles.");
        }
    }
    static EncounterFoe Single(EncounterModel model, FoeKind kind, int hull, int damage)
    {
        Set(model, "nextSpawn", int.MaxValue - 1);
        var foe = model.Foes[0]; foe.Id = 1; foe.Lane = 0; foe.Kind = kind;
        foe.Hull = foe.MaximumHull = hull; foe.Damage = damage; foe.Distance = 0; foe.NextAttack = 1;
        return foe;
    }
    static void Armor()
    {
        var brute = Kind("ArmoredBrute"); var elite = Kind("SiegeElite");
        var model = Fixture(2, 1); var foe = Single(model, brute, 100, 0);
        var armor = typeof(EncounterFoe).GetProperty("Armor");
        Check(armor != null && armor.PropertyType == typeof(int), "Enemy armor must be actual domain state.");
        armor.SetValue(foe, 15);
        Set(model, "nextCannon", 1); model.Step();
        Check(foe.Hull == 95, "Ordinary cannon damage20 must subtract armor15 once.");
        armor.SetValue(foe, 1000); Set(model, "nextCannon", model.Tick + 1); model.Step();
        Check(foe.Hull == 94, "Ordinary hits retain minimum one positive damage.");

        var dying = Fixture(2, 50); var target = Single(dying, elite, 1, 1000);
        Set(dying, "nextCannon", 1); Set(dying, "nextRepair", 10000);
        int hull = dying.Hull; dying.Step();
        Check(!target.Alive && dying.Kills == 1 && dying.Hull == hull,
            "Killing an armed elite cancels its attack; no post-death hit may consume hull.");
        for (int n = 0; n < 200; n++) dying.Step();
        Check(dying.Hull == hull && dying.Kills == 1, "No delayed dead-elite attack or duplicate kill.");

        var warning = Fixture(2, 50); var siege = Single(warning, elite, 1000000, 1000); siege.NextAttack = 0;
        int before = warning.Hull; warning.Step();
        Check(warning.Hull == before && siege.NextAttack > warning.Tick + 1,
            "The first heavy attack must have a visible simulation-time warning, not immediate damage.");
        int due = siege.NextAttack;
        while (warning.Tick < due - 1) { warning.Step(); Check(warning.Hull == before, "No damage before the warning completes."); }
        warning.Step(); Check(warning.Hull < before, "The live elite attacks when its telegraph completes.");
    }
    static void Checkpoint()
    {
        var model = new EncounterModel(LastStandFitting.Launcher, EncounterProfile.ForTier(2));
        Check(model.TryApplyPlayableAttackProjection(500000, 250000), "Synthetic damage fixture admitted.");
        Check(model.TryApplyPlayableDefenseProjection(1000000000, raw => 1), "Synthetic defense fixture admitted.");
        for (int wave = 1; wave <= 120; wave++)
        {
            int remaining = 20000;
            while (!model.AwaitingWaveCommit && remaining-- > 0) model.Step();
            Check(remaining > 0 && model.CompletedWave == wave && model.ActiveCount == 0, "Every finite wave clears only after all roles die.");
            var saved = model.CaptureCheckpoint();
            var restored = EncounterModel.RestoreCheckpoint(model.Profile, model.Fitting, saved);
            Check(model.Snapshot() == restored.Snapshot(), "New-edition cleared checkpoint restores exact state.");
            if (wave == 120) break;
            Check(model.ContinueAfterCheckpoint() && restored.ContinueAfterCheckpoint(), "One explicit advance from durable boundary.");
            Check(!model.ContinueAfterCheckpoint() && !restored.ContinueAfterCheckpoint(), "Duplicate continuation cannot skip waves.");
            for (int n = 0; n < 120 && !model.AwaitingWaveCommit; n++)
            {
                model.Step(); restored.Step();
                Check(model.Snapshot() == restored.Snapshot(), "Restored new-role state replays identically.");
            }
        }
    }
    static int Main(string[] args)
    {
        try
        {
            switch (args[0])
            {
                case "composition": Composition(); break;
                case "armor": Armor(); break;
                case "checkpoint": Checkpoint(); break;
                default: throw new Exception("Unknown combat-depth enemy case.");
            }
            Console.WriteLine("PASS " + args[0]); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
