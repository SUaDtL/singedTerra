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
            var factory = typeof(EncounterProfile).GetMethod("ForTier", new[]{typeof(int)});
            Require(factory != null, "Playable encounter has no immutable tier profile selection.");
            var first = (EncounterProfile)factory.Invoke(null, new object[] { 1 });
            var second = (EncounterProfile)factory.Invoke(null, new object[] { 2 });
            Require(first != EncounterProfile.PlayablePrototype && first.IsWaveBased && first.Id == LastStandRunEdition.CurrentRulesVersion+":"+LastStandTierCatalog.Get(1).EncounterProfileId, "Player tier uses versioned waves.");
            Require(second.Id == LastStandRunEdition.CurrentRulesVersion+":"+LastStandTierCatalog.Get(2).EncounterProfileId && second.IsWaveBased, "Tier 2 has its own wave identity.");
            Require(first.Horizon == int.MaxValue && second.Horizon == int.MaxValue, "Wave runs do not end at the old fixture horizon.");
            Require(EncounterProfile.PlayablePrototype.Horizon == 3600 && EncounterProfile.PlayablePrototype.Id == "playable-prototype-v1" && !EncounterProfile.PlayablePrototype.IsWaveBased, "Historical playable oracle retains its explicit fixture.");
            for (int hull = 1; hull < 101; hull++)
                Require(LastStandTierCatalog.EnemyHull(2, hull) == (hull * 5 + 3) / 4, "Exact ceiling scale, including odd hull.");
            try { factory.Invoke(null, new object[] { 5 }); throw new Exception("Unknown tier admitted."); }
            catch (TargetInvocationException e) { Require(e.InnerException is ArgumentException, "Unknown tier refusal."); }
            // Repair fitting has no tick-one auxiliary shot, exposing initial hull.
            var a = new EncounterModel(false, first); var b = new EncounterModel(false, second);
            a.Step(); b.Step();
            Require(a.Foes[0].MaximumHull == 30 && b.Foes[0].MaximumHull == 90 && b.Foes[0].Hull == 90,
                "Tier 2 wave threat changes initial and maximum hull at actual spawn.");
            Require(a.Foes[0].Distance == b.Foes[0].Distance && b.Foes[0].Damage == a.Foes[0].Damage*3,
                "Wave threat scales damage while retaining movement.");
            var legacy = new EncounterModel(false); legacy.Step();
            var review = new EncounterModel(false, EncounterProfile.VisualReview); review.Step();
            Require(legacy.Foes[0].MaximumHull == 30 && review.Foes[0].MaximumHull == 30, "Legacy/review hull unchanged.");
            Console.WriteLine("PASS exact_tier_hull_scaling_and_legacy_parity"); return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
    }
}
