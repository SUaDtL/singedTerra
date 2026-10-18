using System;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

internal static class TierRulesChecks
{
    static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    static int Main()
    {
        try
        {
            var factory = typeof(EncounterProfile).GetMethod("ForTier", BindingFlags.Public | BindingFlags.Static);
            Require(factory != null, "Playable encounter has no immutable tier profile selection.");
            var first = (EncounterProfile)factory.Invoke(null, new object[] { 1 });
            var second = (EncounterProfile)factory.Invoke(null, new object[] { 2 });
            Require(first == EncounterProfile.PlayablePrototype && first.Id == "playable-prototype-v1", "Tier 1 retains shipped rules.");
            Require(second.Id == LastStandTierCatalog.Get(2).EncounterProfileId && second.IsPlayable, "Tier 2 has its own playable identity.");
            Require(first.Horizon == 3600 && second.Horizon == 3600, "Safety horizon remains unchanged.");
            for (int hull = 1; hull < 101; hull++)
                Require(LastStandTierCatalog.EnemyHull(2, hull) == (hull * 5 + 3) / 4, "Exact ceiling scale, including odd hull.");
            try { factory.Invoke(null, new object[] { 3 }); throw new Exception("Unknown tier admitted."); }
            catch (TargetInvocationException e) { Require(e.InnerException is ArgumentOutOfRangeException, "Unknown tier refusal."); }
            // Repair fitting has no tick-one auxiliary shot, exposing initial hull.
            var a = new EncounterModel(false, first); var b = new EncounterModel(false, second);
            a.Step(); b.Step();
            Require(a.Foes[0].MaximumHull == 30 && b.Foes[0].MaximumHull == 38 && b.Foes[0].Hull == 38,
                "Tier 2 changes both initial and maximum hull at actual spawn.");
            Require(a.Foes[0].Distance == b.Foes[0].Distance && a.Foes[0].Damage == b.Foes[0].Damage,
                "Tier scaling changes no movement or attack rules.");
            var legacy = new EncounterModel(false); legacy.Step();
            var review = new EncounterModel(false, EncounterProfile.VisualReview); review.Step();
            Require(legacy.Foes[0].MaximumHull == 30 && review.Foes[0].MaximumHull == 30, "Legacy/review hull unchanged.");
            Console.WriteLine("PASS exact_tier_hull_scaling_and_legacy_parity"); return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
    }
}
