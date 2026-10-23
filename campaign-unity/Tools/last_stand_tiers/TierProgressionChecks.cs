using System;
using System.Reflection;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

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

    static LastStandProgression StrongProfile(TierStorage storage)
    {
        var model=LastStandProgression.Load(storage);
        foreach(var track in LastStandUpgradeCatalog.Tracks)
            storage.Value=storage.Value.Replace("\""+track.Key+"\":0","\""+track.Key+"\":"+track.PermanentCap);
        return LastStandProgression.Load(storage);
    }
    static void Clear(EncounterModel combat,LastStandShopState shop)
    {
        if(combat.AwaitingWaveCommit)Require(combat.ContinueAfterCheckpoint(),"Continue only after the caller confirms its boundary.");
        while(combat.Status==EncounterStatus.Running && !combat.AwaitingWaveCommit)combat.Step();
        Require(combat.AwaitingWaveCommit && combat.Hull>0,"Numerical capped build clears the authored wave.");
        shop.ObserveAuthoritativeKills(combat.Kills);
    }
    static void Terminal()
    {
        var s=new TierStorage();var m=StrongProfile(s);
        Require(m.SelectedTier==1 && !Unlocked(m),"Fresh profile starts at unlocked Tier 1 only.");
        Require(!Select(m,2) && !Select(m,0) && !Select(m,3),"Locked or invalid selection fails.");
        Require(m.TryDeploy() && m.ActiveTier==1 && m.ActiveProfileVersion==LastStandWaveCatalog.RulesVersion,
            "Deployment durably binds current wave rules.");
        Require(!Select(m,1),"Selection cannot change during a resumable run.");
        var combat=m.Checkpoint.RestoreModel();var shop=m.Checkpoint.RestoreShop();
        for(int wave=1;wave<300;wave++)
        {
            Clear(combat,shop);Require(m.TryCommitWave(combat,shop),"Clear commits the next actual cohort.");
            Require(m.GetBestWave(1)==wave && !Unlocked(m),"Tier 2 stays locked below wave 300.");
        }
        int wallet=m.Wallet;string original=s.Value;
        Clear(combat,shop);s.Denied=true;
        Require(!m.TryCommitWave(combat,shop) && !Unlocked(m) && m.GetBestWave(1)==299 && m.Wallet==wallet &&
            m.Checkpoint.CompletedWave==299 && m.SaveState=="retry" && s.Value==original,
            "Denied wave commit cannot publish reward, milestone, unlock or checkpoint.");
        Require(!Select(m,2) && !m.TryCommitWave(combat,shop) && !m.TryFinalizeRun(),
            "An unconfirmed candidate blocks alternate actions.");
        s.Denied=false;Require(m.Retry(),"Exact candidate retries.");
        var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),300);
        Require(Unlocked(m) && m.GetBestWave(1)==300 && m.SelectedTier==1 &&
            m.Wallet==wallet+reward.RepeatableSalvage+reward.FirstClearSalvage && m.LastReceipt.UnlockedTier==2,
            "Wave 300 banks its reward and unlocks Tier 2 without forcing promotion.");
        int writes=s.Writes;wallet=m.Wallet;
        Require(m.Retry() && s.Writes==writes && !m.TryCommitWave(combat,shop) && m.Wallet==wallet,
            "Repeated reconciliation and duplicate clear never repeat an award.");
        m=LastStandProgression.Load(s);
        Require(m.Checkpoint.CompletedWave==300 && m.ActiveRunId==1 && m.Wallet==wallet && !m.TryDeploy(),
            "Reload retains the committed run for explicit Resume.");
        combat=m.Checkpoint.RestoreModel();shop=m.Checkpoint.RestoreShop();
        Require(combat.AwaitingWaveCommit && combat.ContinueAfterCheckpoint(),"Resume begins the next wave explicitly.");
        for(int tick=0;tick<40;tick++)combat.Step();
        var reload=LastStandProgression.Load(s);
        Require(reload.Checkpoint.CompletedWave==300 && reload.Checkpoint.Encounter.Tick<combat.Tick,
            "Partial next-wave activity never overwrites the completed boundary.");
        s.Uncertain=true;
        Require(!m.TryStageDefeat(combat.Tick,combat.Kills) && m.HasCheckpoint && m.PendingDefeat==null && m.Wallet==wallet,
            "Unconfirmed finalization retains published checkpoint and creates no death payout.");
        Require(m.Retry() && !m.HasCheckpoint && m.FinalizedRunId==1 && m.PendingDefeat==null &&
            m.GetBestWave(1)==300 && m.Wallet==wallet && !m.TryClaim(),"Finalization retains banked rewards and has no new Claim.");
        s.Denied=true;
        Require(!Select(m,2) && m.SelectedTier==1 && !m.TryDeploy(),"Failed selection retains its old value and blocks admission.");
        s.Denied=false;Require(m.Retry() && m.SelectedTier==2,"Selection retry confirms the exact tier.");
        s.Uncertain=true;
        Require(!m.TryDeploy() && m.ActiveRunId==0 && m.ActiveTier==0,"Unconfirmed reservation never starts combat.");
        Require(m.Retry() && m.ActiveRunId==2 && m.ActiveTier==2 && m.Checkpoint.CompletedWave==0,
            "Reservation retry binds a complete starting checkpoint exactly once.");
        Require(!Limit(m,3599,30) && !Limit(m,3600,30) && m.ActiveRunId==2,
            "Old timed limits cannot manufacture wave progress or end a current run.");
        Require(Best(m,false,1)==0 && Best(m,true,1)==0,"New wave records do not fabricate legacy time or kill records.");
        m.AbandonRun();m=LastStandProgression.Load(s);
        Require(!m.HasCheckpoint && m.GetBestWave(1)==300 && m.PendingDefeat==null && m.Wallet==wallet,
            "Abandon durably clears only the active checkpoint.");
    }

    static string V1(string pending="null") => "{\"version\":1,\"credits\":17,\"permanentLevel\":2,\"nextRunId\":9,\"lastFinalizedRunId\":6,\"pendingDefeat\":"+pending+"}";
    static string V3(bool limit=false,int wallet=17)
    {
        int ticks=limit?3600:1200;
        return "{\"version\":3,\"credits\":"+wallet+",\"permanentLevels\":{\"cannonAttack\":2,\"launcherAttack\":0,\"hullCapacity\":0,\"armor\":0,\"cannonCycle\":0,\"fieldRepair\":0},"+
            "\"nextRunId\":9,\"lastFinalizedRunId\":6,\"selectedTier\":1,\"tierRecords\":{\"tier-goals-v1\":{\"bestTicks1\":"+ticks+",\"bestKills1\":4,\"bestTicks2\":0,\"bestKills2\":0,\"tierTwoUnlocked\":true}},"+
            "\"pendingDefeat\":{\"runId\":8,\"elapsedTicks\":"+ticks+",\"kills\":4,\"reward\":"+(limit?0:1)+",\"tier\":1,\"profileVersion\":\"tier-goals-v1\",\"isLimit\":"+(limit?"true":"false")+",\"newBestTime\":true,\"newBestKills\":true,\"unlockedTierTwo\":true}}";
    }
    static void Invalid(string value)
    {
        var storage=new TierStorage {Value=value};var model=LastStandProgression.Load(storage);
        Require(model.SaveState=="blocked" && storage.Value==value && storage.Writes==0 && !model.TryDeploy() && !model.TryClaim(),
            "Unknown, conflicting or malformed save bytes remain untouched: "+value);
    }
    static void Migration()
    {
        const string oldPending="{\"runId\":8,\"elapsedTicks\":3600,\"kills\":2147483647,\"reward\":1}";
        var s=new TierStorage {Value=" \r\n"+V1(oldPending)+"\t"};var m=LastStandProgression.Load(s);
        Require(m.SaveState=="ready" && s.Value.StartsWith("{\"version\":4,"),"Legacy migration writes strict v4.");
        Require(m.Wallet==17 && m.CannonAttackLevel==2 && m.NextRunId==9 && m.FinalizedRunId==6 && !Unlocked(m) &&
            Best(m,false,1)==0 && Best(m,true,1)==0 && m.GetBestWave(1)==0 && m.PendingDefeat.Tier==0 && m.PendingDefeat.Reward==1,
            "Legacy pending result preserves value without inventing tier or wave history.");
        Require(m.TryClaim() && !m.TryClaim() && m.Wallet==18 && !Unlocked(m),"Legacy reward is claimable exactly once without wave credit.");
        string valid=s.Value;
        foreach(string value in new[]{valid.Replace("\"version\":4","\"version\":5"),
            valid.Replace("\"selectedTier\":1","\"selectedTier\":2"),
            valid.Replace("\"bestWave\":0","\"bestWave\":10"),
            valid.Replace("\"legacyTicks\":0","\"legacyTicks\":3601"),
            valid.Replace("\"legacyKills\":0","\"legacyKills\":2147483648"),
            valid.Replace("\"selectedFitting\":\"repair\"","\"selectedFitting\":\"unknown\""),
            valid.Substring(0,valid.Length-1)+",\"extra\":0}",valid+"trailing"})Invalid(value);
        string terminal=V3();
        foreach(string value in new[]{terminal.Replace("\"reward\":1","\"reward\":0"),
            terminal.Replace("\"tier\":1","\"tier\":2"),
            terminal.Replace("\"profileVersion\":\"tier-goals-v1\"","\"profileVersion\":\"old-profile\""),
            terminal.Replace("\"isLimit\":false","\"isLimit\":true"),
            terminal.Replace("\"bestTicks1\":1200","\"bestTicks1\":1201"),
            terminal.Replace("\"bestKills1\":4","\"bestKills1\":3"),
            terminal.Replace("\"newBestTime\":true","\"newBestTime\":false"),
            terminal.Replace("\"runId\":8","\"runId\":0"),
            terminal.Replace("\"newBestKills\":true","\"newBestKills\":1")})Invalid(value);
        var earnedStore=new TierStorage {Value=terminal};var earned=LastStandProgression.Load(earnedStore);
        Require(earned.SaveState=="ready" && Unlocked(earned) && Best(earned,false,1)==1200 && Best(earned,true,1)==4 &&
            earned.GetBestWave(1)==0 && earned.PendingDefeat.UnlockedTierTwo && earned.PendingDefeat.NewBestTime && earned.PendingDefeat.NewBestKills,
            "V3 migration preserves legacy PB notices and earned tier access without fabricating cleared waves.");
        Require(earned.TryClaim() && !earned.TryClaim() && earned.Wallet==18 && Select(earned,2),
            "Migrated tier result remains claimable once and keeps its earned Tier 2 selection.");
        var failed=new TierStorage {Value=V1(oldPending),Denied=true};var retry=LastStandProgression.Load(failed);string original=failed.Value;
        Require(retry.SaveState=="retry" && failed.Value==original && !retry.TryClaim(),"Unconfirmed migration blocks actions without changing old bytes.");
        failed.Denied=false;failed.Value=V1();
        Require(!retry.Retry() && retry.SaveState=="blocked" && failed.Value==V1(),"Conflict cannot overwrite external bytes.");
        failed.Value=original;Require(retry.Retry() && retry.TryClaim() && retry.Wallet==18,"Exact original migration candidate stays recoverable.");
        var maximum=new TierStorage {Value=V3(true,int.MaxValue)};var full=LastStandProgression.Load(maximum);
        Require(full.PendingDefeat.IsLimit && full.PendingDefeat.Reward==0 && full.TryClaim() && !full.TryClaim() && full.Wallet==int.MaxValue,
            "Legacy zero-reward limit acknowledgement remains valid at maximum wallet.");
        var pendingOverflow=new TierStorage {Value=V1(oldPending).Replace("\"credits\":17","\"credits\":2147483647")};
        var blockedClaim=LastStandProgression.Load(pendingOverflow);string before=pendingOverflow.Value;int writes=pendingOverflow.Writes;
        Require(!blockedClaim.TryClaim() && blockedClaim.PendingDefeat!=null && blockedClaim.Wallet==int.MaxValue && pendingOverflow.Value==before && pendingOverflow.Writes==writes,
            "A legacy reward that would overflow preserves its pending award without a debit or write.");
    }

    public static int Main(string[] args)
    {
        try { if (args[0] == "terminal") Terminal(); else Migration(); Console.WriteLine("PASS " + args[0]); return 0; }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
