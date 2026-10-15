using System;
using System.Collections.Generic;
using System.Linq;
using SingedTerra.Encounter;

// Pure checks also run without an Editor. Expected rules come from ST-VIS-01 r2,
// while the retained terminal signatures come from the ST-ENC-01 fixture receipt.
public static class VisualReviewModelChecks
{
    [Serializable] public sealed class Receipt
    {
        public string rules;
        public string[] checks, summaries, legacySummaries;
    }

    static void Require(bool condition, string name)
    {
        if (!condition) throw new InvalidOperationException("Visual review model check failed: " + name);
    }

    public static Receipt Run()
    {
        var checks = new List<string>();
        var legacy = new List<string>();
        string[] retained = {
            "False|Defeated|334|0|21|8|16|0|31|31",
            "True|Defeated|388|0|25|13|19|13|0|19"
        };
        foreach (bool fitting in new[] { false, true })
        {
            var original = new EncounterModel(fitting);
            while (original.Status == EncounterStatus.Running) original.Step();
            Require(original.Profile == EncounterProfile.Legacy && original.Summary == retained[fitting ? 1 : 0],
                "legacy default and retained outcome " + fitting);
            legacy.Add(original.Summary);
        }
        checks.Add("legacy default profile and both retained terminal outcomes");
        Require(EncounterModel.TicksPerSecond == 20 && EncounterProfile.VisualReview.Id == "review-pacing-v1" &&
            EncounterProfile.VisualReview.Horizon == 3600, "named review units and bounded horizon");
        checks.Add("review identity, fixed ticks and horizon");
        bool refusedNull = false;
        try { new EncounterModel(false, null); }
        catch (ArgumentNullException) { refusedNull = true; }
        Require(refusedNull, "null profile refusal");
        checks.Add("null profile refused before simulation");

        var repair = new EncounterModel(false, EncounterProfile.VisualReview);
        repair.Step();
        Require(repair.Tick == 1 && repair.Spawned == 1 && repair.Foes[0].Distance == 24950 &&
            repair.CannonShots == 0 && repair.LauncherShots == 0, "review first spawn, movement and range refusal");
        while (repair.Tick < 59) repair.Step();
        Require(repair.Foes[0].Distance == 22050 && repair.CannonShots == 0 && repair.Spawned == 2,
            "outside main range remains ready");
        repair.Step();
        Require(repair.Foes[0].Distance == 22000 && repair.CannonShots == 1 && repair.Foes[0].Hull == 10,
            "inclusive main range at tick sixty");
        while (repair.Tick < 79) repair.Step();
        Require(repair.CannonShots == 1, "main cooldown after actual fire");
        repair.Step();
        Require(repair.CannonShots == 2 && repair.Kills == 1, "main cooldown due exactly twenty ticks later");
        checks.Add("review spawn, approach, inclusive range and held readiness");

        var launcher = new EncounterModel(true, EncounterProfile.VisualReview);
        launcher.Step();
        Require(launcher.CannonShots == 0 && launcher.LauncherShots == 1 && launcher.Foes[0].Hull == 18,
            "auxiliary fires independently at admission");
        while (launcher.Tick < 30) launcher.Step();
        Require(launcher.LauncherShots == 1 && launcher.Restored == 0, "auxiliary cooldown and exclusive fitting");
        launcher.Step();
        Require(launcher.LauncherShots == 2 && launcher.Foes[0].Hull == 6 && launcher.CannonShots == 0,
            "auxiliary period thirty at longer range");
        checks.Add("independent auxiliary range and exact period");
        CheckControlledCloseContact();
        checks.Add("synthetic close-foe setup: real movement/contact boundary and twenty-tick attack cadence");

        var summaries = new List<string>();
        foreach (bool fitting in new[] { false, true })
            summaries.Add(CheckCompleteRun(fitting, checks));
        return new Receipt { rules = "review-pacing-v1", checks = checks.ToArray(),
            summaries = summaries.ToArray(), legacySummaries = legacy.ToArray() };
    }

    static string CheckCompleteRun(bool fitting, List<string> checks)
    {
        var a = new EncounterModel(fitting, EncounterProfile.VisualReview);
        var b = new EncounterModel(fitting, EncounterProfile.VisualReview);
        int admitted = 0, nextAdmission = 1, lastCannon = -100, lastLauncher = -100;
        int[] intervals = { 56, 42, 32, 24, 20 };
        var attacks = new Dictionary<int, int>();
        var lanes = new HashSet<int>();
        var previous = new Dictionary<int, int>();
        bool population = true, streams = true, cadence = true, movement = true, targets = true, order = true;
        while (a.Status == EncounterStatus.Running)
        {
            a.Step(); b.Step();
            Require(FullState(a) == FullState(b), "deterministic full state at " + a.Tick + " fitting " + fitting);
            population &= a.Hull >= 0 && a.Hull <= 120 && a.ActiveCount <= 32 && a.Kills + a.ActiveCount == a.Spawned;
            if (a.Spawned != admitted)
            {
                streams &= a.Spawned == admitted + 1 && a.Tick == nextAdmission;
                var foe = a.Foes.Single(f => f.Id == a.Spawned);
                int group = admitted / 8;
                streams &= foe.Lane == (admitted / 4 * 3) % 8 &&
                    foe.Kind == (admitted % 3 == 2 ? FoeKind.Ranged : FoeKind.Close) &&
                    foe.MaximumHull == 30 + group * 10 && foe.Damage == 4 + group * 2;
                lanes.Add(foe.Lane);
                nextAdmission += intervals[Math.Min(4, group)];
                admitted++;
            }
            foreach (var foe in a.Foes)
            {
                if (foe.Id == 0) continue;
                int stop = foe.Kind == FoeKind.Close ? 4800 : 12000;
                int speed = foe.Kind == FoeKind.Close ? 50 : 40;
                population &= foe.Hull >= 0 && foe.Hull <= foe.MaximumHull;
                if (foe.Alive || a.Events.Any(e => e.Slot >= 0 && a.Foes[e.Slot] == foe))
                {
                    int before = previous.TryGetValue(foe.Id, out int distance) ? distance : 25000;
                    movement &= foe.Distance == Math.Max(stop, before - speed);
                    movement &= foe.Distance >= stop && foe.Distance < 25000;
                }
                previous[foe.Id] = foe.Distance;
            }
            int phase = -1;
            foreach (var e in a.Events)
            {
                population &= e.Amount > 0;
                int currentPhase = e.Kind == EncounterEventKind.Cannon ? 0 :
                    e.Kind == EncounterEventKind.Launcher || e.Kind == EncounterEventKind.Repair ? 1 : 2;
                order &= currentPhase >= phase; phase = currentPhase;
                if (e.Kind == EncounterEventKind.Cannon)
                { cadence &= a.Tick - lastCannon >= 20; lastCannon = a.Tick; }
                else if (e.Kind == EncounterEventKind.Launcher)
                { cadence &= a.Tick - lastLauncher >= 30; lastLauncher = a.Tick; }
                else if (e.Kind == EncounterEventKind.Repair)
                    cadence &= a.Tick % 20 == 0 && e.Amount <= 3 && !fitting;
                else
                {
                    var foe = a.Foes[e.Slot];
                    int period = foe.Kind == FoeKind.Close ? 20 : 30;
                    int prior = attacks.TryGetValue(foe.Id, out int tick) ? tick : -100;
                    cadence &= a.Tick - prior >= period;
                    order &= foe.Alive && foe.Distance == (foe.Kind == FoeKind.Close ? 4800 : 12000);
                    attacks[foe.Id] = a.Tick;
                }
            }
            targets &= VerifyTargets(a);
        }
        Require(streams && lanes.Count == 8 && admitted >= 40, "all streams and five arrival intervals " + fitting);
        Require(population && movement, "hull/population bounds and role approach/stop " + fitting);
        Require(cadence && order && targets, "cadences, ordered resolution and nearest-then-ID targets " + fitting);
        string final = FullState(a);
        a.Step(); a.Step();
        Require(final == FullState(a), "terminal no-op " + fitting);
        Require(a.Status == EncounterStatus.Defeated && a.CloseHits == 0 && a.RangedHits > 0 &&
            (fitting ? a.LauncherShots > 0 && a.Restored == 0 : a.LauncherShots == 0 && a.Restored > 0),
            "natural v1 ranged-driven defeat and committed fitting " + fitting);
        string expected = fitting ? "True|Defeated|1647|0|53|33|59|55|0|11" :
            "False|Defeated|1557|0|49|28|68|0|33|17";
        Require(a.Summary == expected, "review-pacing-v1 terminal signature " + fitting);
        foreach (string claim in new[] { "all stream lanes and arrival intervals", "population and role movement bounds",
            "cadence, target ordering and dead-foe refusal", "full deterministic replay", "terminal outcome and no-op" })
            checks.Add((fitting ? "launcher " : "repair ") + claim);
        return a.Summary;
    }

    static void CheckControlledCloseContact()
    {
        // This intentionally synthetic state tests compatibility, not the natural
        // profile's pacing: both unmodified v1 runs are defeated by ranged foes.
        // Editor tests live in another assembly, so only this setup uses reflected
        // internal setters; movement, firing and contact still execute real Step.
        var model = new EncounterModel(false, EncounterProfile.VisualReview);
        model.Step(); var foe = model.Foes[0];
        typeof(EncounterFoe).GetProperty(nameof(EncounterFoe.Distance)).SetValue(foe, 4851);
        typeof(EncounterFoe).GetProperty(nameof(EncounterFoe.Hull)).SetValue(foe, 80);
        typeof(EncounterFoe).GetProperty(nameof(EncounterFoe.MaximumHull)).SetValue(foe, 80);
        model.Step();
        Require(foe.Distance == 4801 && model.CloseHits == 0, "close attacker refuses just outside stop");
        model.Step();
        Require(foe.Distance == 4800 && model.CloseHits == 1 && model.Hull == 116,
            "close attacker clamps and hits at inclusive stop");
        while (model.Tick < 22) model.Step();
        Require(foe.Alive && foe.Distance == 4800 && model.CloseHits == 1,
            "surviving close attacker holds position and cooldown");
        model.Step();
        Require(model.CloseHits == 2 && model.Events.Any(e => e.Kind == EncounterEventKind.CloseHit && e.Amount == 4),
            "close attacker repeats after twenty real ticks");
    }

    static bool VerifyTargets(EncounterModel model)
    {
        int[] health = model.Foes.Select(f => f.Hull).ToArray();
        var shots = model.Events.Where(e => e.Kind == EncounterEventKind.Cannon || e.Kind == EncounterEventKind.Launcher).ToArray();
        foreach (var shot in shots) health[shot.Slot] += shot.Amount;
        foreach (var shot in shots)
        {
            int range = shot.Kind == EncounterEventKind.Cannon ? 22000 : 25000;
            int expected = Enumerable.Range(0, model.Foes.Count).Where(i => health[i] > 0 && model.Foes[i].Distance <= range)
                .OrderBy(i => model.Foes[i].Distance).ThenBy(i => model.Foes[i].Id).DefaultIfEmpty(-1).First();
            if (shot.Slot != expected) return false;
            health[shot.Slot] -= shot.Amount;
        }
        return true;
    }

    static string FullState(EncounterModel model)
    {
        return model.Profile.Id + "|" + model.Snapshot() + "|" +
            string.Join(";", model.Foes.Select(f => f.Id + "," + f.Lane + "," + f.Kind + "," + f.MaximumHull + "," + f.Damage)) + "|" +
            string.Join(";", model.Events.Select(e => e.Kind + "," + e.Slot + "," + e.Amount));
    }
}
