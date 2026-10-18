using System;
using System.Reflection;
using SingedTerra.LastStand;

internal sealed class TierStorage : ILastStandStorage
{
    public string Value;
    public bool Denied, Uncertain;
    public int Writes;
    bool failRead;
    public string Read()
    {
        if (failRead) { failRead = false; throw new Exception("verification read failed"); }
        return Value;
    }
    public void Write(string value)
    {
        if (Denied) throw new Exception("write denied");
        Value = value; Writes++;
        if (Uncertain) { Uncertain = false; failRead = true; }
    }
}

internal static class TierProgressionChecks
{
    static void Require(bool value, string message)
    { if (!value) throw new InvalidOperationException(message); }
    static object Property(object owner, string name)
    {
        var p = owner.GetType().GetProperty(name);
        Require(p != null, "Missing production tier behavior: " + name);
        return p.GetValue(owner);
    }
    static object Call(object owner, string name, params object[] args)
    {
        var method = owner.GetType().GetMethod(name);
        Require(method != null, "Missing production tier behavior: " + name);
        return method.Invoke(owner, args);
    }
    static int Best(LastStandProgression m, bool kills, int tier) =>
        (int)Call(m, kills ? "GetBestKills" : "GetBestTicks", tier);
    static bool Unlocked(LastStandProgression m) => (bool)Property(m, "TierTwoUnlocked");
    static bool Select(LastStandProgression m, int tier) => (bool)Call(m, "TrySelectTier", tier);
    static bool Limit(LastStandProgression m, int ticks, int kills) =>
        (bool)Call(m, "TryStageLimit", ticks, kills);

    static void Terminal()
    {
        var s = new TierStorage(); var m = LastStandProgression.Load(s);
        Require((int)Property(m, "SelectedTier") == 1 && !Unlocked(m), "Fresh profile starts at locked Tier 1.");
        Require(!Select(m, 2) && !Select(m, 0) && !Select(m, 3), "Locked and invalid selection must fail.");
        Require(m.TryDeploy() && (int)Property(m, "ActiveTier") == 1 &&
            (string)Property(m, "ActiveProfileVersion") == LastStandTierCatalog.ProfileVersion,
            "Deployment binds current rules.");
        Require(!Select(m, 1), "Selection cannot change during a run.");
        Require(m.TryStageDefeat(1199, 14) && !Unlocked(m) && m.Wallet == 0 && Best(m,false,1) == 1199,
            "Below-goal terminal result records time without unlocking or auto-paying.");
        Require(m.PendingDefeat.Reward == 1 && (bool)Property(m.PendingDefeat,"NewBestTime") &&
            (bool)Property(m.PendingDefeat,"NewBestKills"), "First improving result has independent notices.");
        Require(!m.TryDeploy() && !Select(m,1) && !m.TryStageDefeat(1200,99), "Pending result must block duplicate staging/admission.");
        Require(m.TryClaim() && !m.TryClaim() && m.Wallet == 1, "Reward claims exactly once.");
        Require(m.TryDeploy(), "Next run admitted.");
        s.Denied = true;
        Require(!m.TryStageDefeat(1200, 5) && !Unlocked(m) && Best(m,false,1) == 1199 &&
            m.ActiveRunId != 0 && m.PendingDefeat == null && m.SaveState == "retry",
            "Denied terminal write cannot present records, unlock or terminal completion.");
        Require(!Select(m,2) && !m.TryStageDefeat(3600,999), "Candidate binds the original run and result.");
        s.Denied = false; Require(m.Retry(), "Exact candidate retries.");
        Require(Unlocked(m) && Best(m,false,1) == 1200 && Best(m,true,1) == 14 &&
            !(bool)Property(m.PendingDefeat,"NewBestKills") && (bool)Property(m.PendingDefeat,"UnlockedTierTwo"),
            "Exact-threshold terminal unlocks and preserves the independent kill maximum.");
        int writes = s.Writes; Require(m.Retry() && s.Writes == writes, "Repeated reconciliation writes no duplicate result.");
        m = LastStandProgression.Load(s);
        Require(Unlocked(m) && m.Wallet == 1 && Best(m,false,1) == 1200 && !m.TryDeploy(),
            "Reload retains saved result and claim gate.");
        Require(m.TryClaim() && Select(m,2) && m.TryDeploy() && (int)Property(m,"ActiveTier") == 2,
            "Saved unlock admits Tier 2.");
        Require(!Limit(m,3599,30) && m.ActiveRunId != 0, "A partial run cannot masquerade as the limit.");
        s.Uncertain = true;
        Require(!Limit(m,3600,30) && Best(m,false,2) == 0 && m.PendingDefeat == null && m.SaveState == "retry",
            "Unconfirmed readback never presents saved progress.");
        Require(m.Retry() && Best(m,false,2) == 3600 && Best(m,true,2) == 30 &&
            m.PendingDefeat.Reward == 0 && (bool)Property(m.PendingDefeat,"IsLimit"), "Limit qualifies records without a reward.");
        int wallet = m.Wallet; Require(m.TryClaim() && m.Wallet == wallet && !m.TryClaim(), "Limit acknowledgement never pays.");
        Require(Select(m,1) && m.TryDeploy() && m.TryStageDefeat(1200,14), "Tie run stages.");
        Require(!(bool)Property(m.PendingDefeat,"NewBestTime") && !(bool)Property(m.PendingDefeat,"NewBestKills") &&
            !(bool)Property(m.PendingDefeat,"UnlockedTierTwo"), "Ties and already unlocked tier have no repeated notice.");
        Require(m.TryClaim() && m.TryDeploy(), "Run admitted before abandon.");
        m.AbandonRun(); Require(Best(m,false,1) == 1200 && m.PendingDefeat == null, "Abandon grants no progress.");
        Require(m.TryDeploy(), "Run admitted before reload.");
        m = LastStandProgression.Load(s);
        Require(m.ActiveRunId == 0 && m.PendingDefeat == null && Best(m,false,1) == 1200, "Reload never finalizes unfinished combat.");
        Require(Select(m,1) && m.TryDeploy() && m.TryStageDefeat(100,15) && Best(m,true,1) == 15 &&
            Best(m,false,1) == 1200 && !(bool)Property(m.PendingDefeat,"NewBestTime") &&
            (bool)Property(m.PendingDefeat,"NewBestKills"), "Later shorter run may independently improve kills.");
    }

    static string V1(string pending = "null") => "{\"version\":1,\"credits\":17,\"permanentLevel\":2,\"nextRunId\":9,\"lastFinalizedRunId\":6,\"pendingDefeat\":" + pending + "}";
    static void Migration()
    {
        const string oldPending = "{\"runId\":8,\"elapsedTicks\":3600,\"kills\":2147483647,\"reward\":1}";
        var s = new TierStorage { Value = " \r\n" + V1(oldPending) + "\t" };
        var m = LastStandProgression.Load(s);
        Require(m.SaveState == "ready" && s.Value.StartsWith("{\"version\":3,"), "Legacy migration writes strict v3.");
        Require(m.Wallet == 17 && m.CannonAttackLevel == 2 && m.NextRunId == 9 && m.FinalizedRunId == 6 &&
            !Unlocked(m) && Best(m,false,1) == 0 && Best(m,true,1) == 0 &&
            (int)Property(m.PendingDefeat,"Tier") == 0 && m.PendingDefeat.Reward == 1,
            "Legacy pending result preserves value without inventing tier history.");
        Require(m.TryClaim() && m.Wallet == 18 && !Unlocked(m) && Best(m,false,1) == 0, "Legacy reward remains claimable without goal credit.");
        string valid = s.Value;
        string[] bad = { valid.Replace("\"version\":3", "\"version\":4"),
            valid.Replace(LastStandTierCatalog.ProfileVersion, "unknown-profile-v9"),
            valid.Replace("\"selectedTier\":1", "\"selectedTier\":2"),
            valid.Replace("\"tierTwoUnlocked\":false", "\"tierTwoUnlocked\":true"),
            valid.Replace("\"bestTicks1\":0", "\"bestTicks1\":3601"),
            valid.Replace("\"bestKills1\":0", "\"bestKills1\":2147483648"),
            valid.Substring(0,valid.Length-1) + ",\"extra\":0}", valid + "trailing" };
        foreach (string value in bad)
        {
            var invalid = new TierStorage { Value = value }; var blocked = LastStandProgression.Load(invalid);
            Require(blocked.SaveState == "blocked" && invalid.Value == value && invalid.Writes == 0 && !blocked.TryDeploy(),
                "Unknown, conflicting or malformed save bytes must remain untouched.");
        }
        var earnedStore = new TierStorage(); var earned = LastStandProgression.Load(earnedStore);
        Require(earned.TryDeploy() && earned.TryStageDefeat(1200,4), "Construct an actual qualifying terminal record.");
        string terminal = earnedStore.Value;
        string[] badPending = {
            terminal.Replace("\"reward\":1", "\"reward\":0"),
            terminal.Replace("\"tier\":1", "\"tier\":2"),
            terminal.Replace("\"profileVersion\":\"tier-goals-v1\"", "\"profileVersion\":\"old-profile\""),
            terminal.Replace("\"isLimit\":false", "\"isLimit\":true"),
            terminal.Replace("\"bestTicks1\":1200", "\"bestTicks1\":1201"),
            terminal.Replace("\"bestKills1\":4", "\"bestKills1\":3"),
            terminal.Replace("\"newBestTime\":true", "\"newBestTime\":false"),
            terminal.Replace("\"runId\":1", "\"runId\":0"),
            terminal.Replace("\"newBestKills\":true", "\"newBestKills\":1") };
        foreach (string value in badPending)
        {
            var invalid = new TierStorage { Value = value }; var blocked = LastStandProgression.Load(invalid);
            Require(blocked.SaveState == "blocked" && invalid.Value == value && invalid.Writes == 0 && !blocked.TryClaim(),
                "Inconsistent pending records cannot grant rewards, unlocks or notices.");
        }
        var failed = new TierStorage { Value = V1(oldPending), Denied = true };
        var retry = LastStandProgression.Load(failed); string original = failed.Value;
        Require(retry.SaveState == "retry" && failed.Value == original && !retry.TryClaim(), "Unconfirmed migration blocks actions without changing old bytes.");
        failed.Denied = false; failed.Value = V1();
        Require(!retry.Retry() && retry.SaveState == "blocked" && failed.Value == V1(), "Conflict cannot overwrite external bytes.");
        failed.Value = original; Require(retry.Retry() && retry.TryClaim() && retry.Wallet == 18, "Exact preserved migration candidate is recoverable.");
        var max = new TierStorage { Value = V1().Replace("\"credits\":17", "\"credits\":2147483647") };
        var full = LastStandProgression.Load(max);
        Require(full.TryDeploy() && Limit(full,3600,1) && full.TryClaim() && full.Wallet == int.MaxValue,
            "Zero-reward acknowledgement works even at maximum wallet.");
        Require(earned.TryClaim(), "Acknowledge the actual qualifying result.");
        earnedStore.Denied = true;
        Require(!Select(earned,2) && (int)Property(earned,"SelectedTier") == 1 && !earned.TryDeploy(),
            "Failed selection writes retain the old selection and block admission.");
        earnedStore.Denied = false;
        Require(earned.Retry() && (int)Property(earned,"SelectedTier") == 2, "Selection retry confirms its exact tier.");
        earnedStore.Uncertain = true;
        Require(!earned.TryDeploy() && earned.ActiveRunId == 0 && (int)Property(earned,"ActiveTier") == 0,
            "Unconfirmed reservation never starts combat.");
        Require(earned.Retry() && earned.ActiveRunId == 2 && (int)Property(earned,"ActiveTier") == 2 &&
            (string)Property(earned,"ActiveProfileVersion") == LastStandTierCatalog.ProfileVersion,
            "Reservation retry binds the original run and current immutable tier rules.");
    }

    public static int Main(string[] args)
    {
        try { if (args[0] == "terminal") Terminal(); else Migration(); Console.WriteLine("PASS " + args[0]); return 0; }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
