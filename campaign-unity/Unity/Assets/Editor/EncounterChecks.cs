using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using SingedTerra.Encounter;

public static class EncounterChecks
{
    static void Require(bool condition, string name)
    { if (!condition) throw new InvalidOperationException("Encounter check failed: " + name); }
    public static void Run()
    {
        EncounterPoseChecks.Run();
        var repair = new EncounterModel(false);
        Require(repair.Tick == 0 && repair.Hull == 120 && repair.ActiveCount == 0, "fresh state");
        repair.Step();
        Require(repair.Spawned == 1 && repair.Foes[0].Distance == 15890 && repair.CannonShots == 0, "spawn then move; range refusal");
        while (repair.Tick < 18) repair.Step();
        Require(repair.CannonShots == 0 && repair.Spawned == 2, "inclusive range boundary");
        repair.Step();
        Require(repair.CannonShots == 1 && repair.Foes[0].Hull == 10, "first valid cannon hit");
        var launcher = new EncounterModel(true); launcher.Step();
        Require(launcher.LauncherShots == 1 && launcher.CannonShots == 0 && launcher.Foes[0].Hull == 18, "independent longer-range launcher");
        while (launcher.Tick < 19) launcher.Step();
        Require(launcher.Kills == 1 && launcher.CannonShots == 1 && launcher.LauncherShots == 1, "immediate ordered kill");
        var signatures = new List<string>();
        foreach (bool fitting in new[] { false, true }) signatures.Add(CheckCompleteRun(fitting));
        Debug.Log("ST_ENC_MODEL_PASS " + JsonUtility.ToJson(new Receipt
        { rules = EncounterModel.RulesVersion, cases = 14, summaries = signatures.ToArray() }));
    }
    static string CheckCompleteRun(bool fitting)
    {
        var a = new EncounterModel(fitting); var b = new EncounterModel(fitting);
        int cannon = -100, launcher = -100;
        bool invariants = true, cadence = true, ordering = true, repeat = true;
        while (a.Status == EncounterStatus.Running)
        {
            a.Step(); b.Step(); repeat &= a.Snapshot() == b.Snapshot();
            invariants &= a.Hull >= 0 && a.Hull <= EncounterModel.MaximumHull &&
                a.Kills + a.ActiveCount == a.Spawned && a.ActiveCount <= EncounterModel.Capacity;
            foreach (var f in a.Foes)
                invariants &= f.Hull >= 0 && f.Hull <= f.MaximumHull &&
                    (!f.Alive || f.Distance >= (f.Kind == FoeKind.Close ? 3400 : 10000));
            foreach (var e in a.Events)
            {
                invariants &= e.Amount > 0;
                if (e.Kind == EncounterEventKind.Cannon)
                { cadence &= a.Tick - cannon >= 20; cannon = a.Tick; }
                if (e.Kind == EncounterEventKind.Launcher)
                { cadence &= a.Tick - launcher >= 30; launcher = a.Tick; }
                if (e.Kind == EncounterEventKind.CloseHit || e.Kind == EncounterEventKind.RangedHit)
                    ordering &= a.Foes[e.Slot].Alive;
            }
            ordering &= VerifyTargets(a);
        }
        Require(invariants, "hull, population and event bounds " + fitting);
        Require(cadence && ordering, "independent cadence, target tie-break and dead-foe refusal " + fitting);
        string terminal = a.Snapshot(); a.Step(); a.Step();
        Require(repeat && terminal == a.Snapshot() && a.Status == EncounterStatus.Defeated,
            "repeatability, eventual defeat and terminal no-op " + fitting);
        Require(a.CloseHits > 0 && a.RangedHits > 0 && a.CannonShots > 0 &&
            (fitting ? a.LauncherShots > 0 && a.Restored == 0 : a.LauncherShots == 0 && a.Restored > 0),
            "both enemy roles and committed fitting behavior " + fitting);
        return a.Summary;
    }
    static bool VerifyTargets(EncounterModel model)
    {
        int[] health = model.Foes.Select(f => f.Hull).ToArray();
        var shots = model.Events.Where(e => e.Kind == EncounterEventKind.Cannon || e.Kind == EncounterEventKind.Launcher).ToArray();
        foreach (var shot in shots) health[shot.Slot] += shot.Amount;
        foreach (var shot in shots)
        {
            int range = shot.Kind == EncounterEventKind.Cannon ? 14000 : 18000;
            int expected = Enumerable.Range(0, EncounterModel.Capacity)
                .Where(i => health[i] > 0 && model.Foes[i].Distance <= range)
                .OrderBy(i => model.Foes[i].Distance).ThenBy(i => model.Foes[i].Id)
                .DefaultIfEmpty(-1).First();
            if (expected != shot.Slot) return false;
            health[shot.Slot] -= shot.Amount;
        }
        return true;
    }
    [Serializable] sealed class Receipt
    { public string rules; public int cases; public string[] summaries; }
}
