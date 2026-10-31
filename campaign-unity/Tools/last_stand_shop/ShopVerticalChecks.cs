using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Assertions invoke the actual compiled catalog, including when it is absent.
// No test-only catalog, economy or combat formula supplies production behavior.
internal static class ShopVerticalChecks
{
    static readonly string[] Keys = { "cannonAttack", "launcherAttack", "hullCapacity", "armor", "cannonCycle", "fieldRepair" };
    static readonly string[] Ids = { "CannonAttack", "LauncherAttack", "HullCapacity", "Armor", "CannonCycle", "FieldRepair" };
    static readonly string[] Names = { "Cannon Attack", "Launcher Attack", "Hull Capacity", "Armor", "Cannon Cycle", "Field Repair" };
    static readonly string[] Categories = { "Attack", "Attack", "Defense", "Defense", "Utility", "Utility" };
    static readonly string[] Applicability = { "All", "Launcher", "All", "All", "All", "Repair" };
    static readonly int[][] Effects = {
        new[] { 20, 30, 40, 50, 60, 70, 80, 90, 100 },
        new[] { 12, 16, 20, 24, 28, 32, 36, 40, 44 },
        new[] { 120, 135, 150, 165, 180, 195, 210, 225, 240 },
        new[] { 20, 19, 18, 17, 16, 15, 14, 13, 12 },
        new[] { 20, 19, 18, 17, 16, 15, 14, 13, 12 },
        new[] { 3, 4, 5, 6, 7, 8, 9, 10, 11 },
    };
    static readonly string[] Units = { " damage", " damage", " maximum hull", "", "", " hull every 1s" };
    static readonly string[] CycleSeconds = { "1", "0.95", "0.9", "0.85", "0.8", "0.75", "0.7", "0.65", "0.6" };

    static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 1, "Expected one named case.");
            switch (args[0])
            {
                case "catalog_exact_tracks_and_effects": ExactTracksAndEffects(); break;
                case "catalog_intervals_use_seconds_without_rounding_levels": IntervalsUseSeconds(); break;
                case "catalog_caps_prices_and_fitting": CapsPricesAndFitting(); break;
                case "ledger_independent_prices_and_caps": LedgerIndependentPricesAndCaps(); break;
                case "ledger_unique_kill_income": LedgerUniqueKillIncome(); break;
                case "transaction_atomic_charge_and_level": TransactionAtomicChargeAndLevel(); break;
                case "transaction_stale_replay_and_refusal": TransactionStaleReplayAndRefusal(); break;
                case "attack_cannon_exact_damage": AttackCannonExactDamage(); break;
                case "attack_launcher_fitting_isolation": AttackLauncherFittingIsolation(); break;
                case "defense_hull_purchase_and_clamp": DefenseHullPurchaseAndClamp(); break;
                case "defense_armor_close_and_ranged_hits": DefenseArmorCloseAndRangedHits(); break;
                case "cycle_future_schedule_and_next_tick": CycleFutureScheduleAndNextTick(); break;
                case "cycle_partition_and_legacy_parity": CyclePartitionAndLegacyParity(); break;
                case "repair_amount_and_maximum": RepairAmountAndMaximum(); break;
                case "repair_fitting_and_terminal_refusal": RepairFittingAndTerminalRefusal(); break;
                case "presentation_levels_effects_prices_and_reasons": PresentationLevelsEffectsPricesAndReasons(); break;
                default: throw new ArgumentException("Unknown named case.");
            }
            Console.WriteLine("PASS " + args[0]);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("ASSERTION FAILED: " + error.Message);
            return 1;
        }
    }

    static object[] ActualTracks()
    {
        var catalog = typeof(MechanicsShopTrack).Assembly.GetType("SingedTerra.LastStand.LastStandUpgradeCatalog");
        Require(catalog != null, "The actual compiled baseline supplies no six-track catalog or authoritative effect/price projection.");
        var tracksProperty = catalog.GetProperty("Tracks", BindingFlags.Public | BindingFlags.Static);
        Require(tracksProperty != null, "The catalog must expose its immutable typed track definitions.");
        var current = (IReadOnlyList<LastStandUpgradeDefinition>)tracksProperty.GetValue(null);
        Equal(current.Count, 10, "Current economy preserves eight tracks and appends two armaments");
        Equal(current[8].Key, "mortarAttack", "Mortar appended without reindexing");
        Equal(current[9].Key, "railgunAttack", "Railgun appended without reindexing");
        Equal(current[6].Key, "scattergunAttack", "Scattergun identity remains appended");
        Equal(current[7].Key, "scrapYield", "Scrap Yield is appended without reindexing");
        var tracks = LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.LegacyEconomyVersion).Tracks;
        var result = new List<object>();
        foreach (var track in (IEnumerable)tracks) result.Add(track);
        Equal(result.Count, 7, "Six preserved tracks plus explicit Scattergun Attack");
        Equal(Text(result[6], "Key"), "scattergunAttack", "New stable track is appended, never reindexes historical slots");
        var list = tracks as IList;
        Require(list != null && list.IsReadOnly, "Callers cannot replace catalog definitions.");
        // This historical suite retains its original six-track numeric oracles.
        // The wave/economy suite covers the appended fitting and full seven-track snapshots.
        result.RemoveAt(6);
        return result.ToArray();
    }

    static void ExactTracksAndEffects()
    {
        var tracks = ActualTracks();
        var legacy = new EncounterModel(false);
        var review = new EncounterModel(true, EncounterProfile.VisualReview);
        for (int tick = 0; tick < 137; tick++) { legacy.Step(); review.Step(); }
        var legacyBefore = legacy.Snapshot();
        var reviewBefore = review.Snapshot();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (int i = 0; i < tracks.Length; i++)
        {
            var definition = tracks[i];
            Equal(Text(definition, "Id"), Ids[i], "Typed stable ID");
            Equal(Text(definition, "Key"), Keys[i], "Stable save/intent key");
            Require(seen.Add(Text(definition, "Key")), "Track keys must be unique.");
            Equal(Text(definition, "Name"), Names[i], "Track name");
            Equal(Text(definition, "Category"), Categories[i], "Track category");
            Equal(Text(definition, "Applicability"), Applicability[i], "Track fitting rule");
            for (int level = 0; level <= 8; level++)
            {
                Equal(Call(definition, "EffectAt", level, 20), Effects[i][level], Keys[i] + " exact effect L=" + level);
                var expectedDescription = i == 3
                    ? "reduce hits by " + level + " (minimum 1 damage)"
                    : i == 4 ? CycleSeconds[level] + "s between cannon shots"
                    : Effects[i][level] + Units[i];
                Equal(Call(definition, "DescribeEffect", level), expectedDescription, Keys[i] + " authoritative description");
                if (i == 3)
                {
                    Equal(Call(definition, "EffectAt", level, 1), 1, "Armor never grants immunity");
                    Equal(Call(definition, "EffectAt", level, 4), Math.Max(1, 4 - level), "Armor applies to small hits");
                    if (level == 0 || level == 8)
                    {
                        foreach (int rawHit in new[] { 0, -1, int.MinValue })
                            RejectedParameter(() => Call(definition, "EffectAt", level, rawHit), "rawHit",
                                "Armor invalid rawHit=" + rawHit + " at L=" + level);
                    }
                }
            }
            Rejected(() => Call(definition, "EffectAt", -1, 20), "Negative total level");
            Rejected(() => Call(definition, "EffectAt", (int)Get(definition, "TotalCap") + 1, 20), "Above-cap total level");
        }
        Equal(Call(tracks[0], "EffectAt", 0, 20), EncounterModel.CannonDamage, "Existing zero cannon damage");
        Equal(Call(tracks[1], "EffectAt", 0, 20), EncounterModel.LauncherDamage, "Existing zero launcher damage");
        Equal(Call(tracks[2], "EffectAt", 0, 20), EncounterModel.MaximumHull, "Existing zero maximum hull");
        Equal(Call(tracks[4], "EffectAt", 0, 20), EncounterModel.CannonPeriod, "Existing zero cannon period");
        Equal(Call(tracks[5], "EffectAt", 0, 20), EncounterModel.RepairAmount, "Existing zero repair amount");
        Equal(EncounterModel.RepairPeriod, 20, "Existing repair frequency");
        for (int permanent = 0; permanent <= 3; permanent++)
        {
            string saved = "{\"version\":1,\"credits\":0,\"permanentLevel\":" + permanent +
                ",\"nextRunId\":1,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}";
            var oldProgression = LastStandProgression.Load(new MemoryStorage(saved));
            Equal(oldProgression.SaveState, "ready", "Existing progression fixture is valid");
            Equal(Call(tracks[0], "EffectAt", permanent, 20), oldProgression.CannonDamage, "Existing P0..3 Cannon Attack compatibility");
        }
        Equal(legacy.Snapshot(), legacyBefore, "Pure catalog never mutates Legacy");
        Equal(review.Snapshot(), reviewBefore, "Pure catalog never mutates VisualReview");
    }

    static void IntervalsUseSeconds()
    {
        var culture = CultureInfo.CurrentCulture;
        try
        {
            // Adjacent 0.05-second upgrades must remain distinguishable even
            // under a locale that normally uses a decimal comma.
            CultureInfo.CurrentCulture = new CultureInfo("fr-FR");
            var cycle = LegacyDefinition(LastStandUpgradeTrackId.CannonCycle);
            var repair = LegacyDefinition(LastStandUpgradeTrackId.FieldRepair);
            for (int level = 0; level <= 8; level++)
            {
                Equal(cycle.DescribeEffect(level), CycleSeconds[level] + "s between cannon shots", "Exact readable cycle L=" + level);
                Equal(repair.DescribeEffect(level), (3 + level) + " hull every 1s", "Same repair schedule L=" + level);
                Equal(cycle.EffectAt(level, 1), 20 - level, "Formatting never changes tick scheduling");
                Equal(repair.EffectAt(level, 1), 3 + level, "Formatting never changes repair amount");
            }
            var next = cycle.Project(1, 0, LastStandFitting.Repair);
            Equal(next.CurrentEffectDescription, "0.95s between cannon shots", "Current fractional seconds");
            Equal(next.NextEffectDescription, "0.9s between cannon shots", "Next fractional seconds");
            Equal(cycle.Project(3, cycle.TotalCap - 3, LastStandFitting.Repair).NextEffectDescription, "MAX", "Capped interval still has no next effect");
        }
        finally { CultureInfo.CurrentCulture = culture; }
    }

    static void CapsPricesAndFitting()
    {
        var tracks = ActualTracks();
        var fittingType = typeof(MechanicsShopTrack).Assembly.GetType("SingedTerra.LastStand.LastStandFitting");
        Require(fittingType != null && fittingType.IsEnum, "Fitting identity must be typed.");
        var launcher = Enum.Parse(fittingType, "Launcher");
        var repair = Enum.Parse(fittingType, "Repair");
        for (int i = 0; i < tracks.Length; i++)
        {
            var definition = tracks[i];
            int cap=(int)Get(definition,"TotalCap"), permanentCap=(int)Get(definition,"PermanentCap");
            Equal(Call(definition, "IsEligible", launcher), i != 5, Keys[i] + " launcher eligibility");
            Equal(Call(definition, "IsEligible", repair), i != 1, Keys[i] + " repair eligibility");
            Rejected(() => Call(definition, "IsEligible", Enum.ToObject(fittingType, 99)), "Unknown fitting");
            var compatible = i == 5 ? repair : launcher;
            var incompatible = i == 5 ? launcher : repair;
            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var actual = (MechanicsShopTrack)Call(definition, "CreateTrack", permanent, 0);
                Equal(actual.Cap, cap, "Track-specific total cap");
                for (int purchases = 0; purchases <= cap - permanent; purchases++)
                {
                    Equal(actual.CurrentLevel, permanent + purchases, "Actual foundation level");
                    Equal(actual.RunPurchases, purchases, "Actual independent n");
                    Equal(actual.RemainingPurchases, cap - permanent - purchases, "Actual remaining levels");
                    var projected = Call(definition, "Project", permanent, purchases, compatible);
                    Equal(Get(projected, "PermanentLevel"), permanent, "Projection P");
                    Equal(Get(projected, "RunPurchases"), purchases, "Projection n");
                    Equal(Get(projected, "CurrentLevel"), actual.CurrentLevel, "Projection uses foundation level");
                    Equal(Get(projected, "RemainingPurchases"), actual.RemainingPurchases, "Projection uses foundation cap");
                    Equal(Get(projected, "CurrentEffectDescription"), Call(definition, "DescribeEffect", actual.CurrentLevel), "Current effect is catalog-owned");
                    bool capped = actual.RemainingPurchases == 0;
                    Equal(Get(projected, "CanPurchase"), !capped, "Compatible cap eligibility");
                    Equal(Get(projected, "NextPrice"), capped ? null : (object)Price(purchases + 1), "Temporary price ignores P");
                    Equal(Get(projected, "PriceDescription"), capped ? "MAX" : Price(purchases + 1) + " Scrap", "Authoritative price description");
                    Equal(Get(projected, "NextEffectDescription"), capped ? "MAX" : Call(definition, "DescribeEffect", actual.CurrentLevel + 1), "No nonexistent next effect at cap");
                    Equal(Get(projected, "NextPermanentPrice"), permanent == permanentCap ? null : (object)PermanentPrice(permanent + 1), "Permanent 1/2/3 Salvage price");
                    Equal(Get(projected, "PermanentPriceDescription"), permanent == permanentCap ? "MAX" : PermanentPrice(permanent + 1) + " Salvage", "Permanent price description");
                    if (capped)
                    {
                        Require(!actual.TryPurchase(), "A ninth total level is refused.");
                        Equal(actual.CurrentLevel, cap, "Cap refusal preserves level");
                        Equal(actual.RunPurchases, purchases, "Cap refusal preserves n");
                        Equal(Get(projected, "UnavailableReason"), "MAX", "Cap reason");
                    }
                    else
                    {
                        Equal(actual.NextRunPrice, Price(purchases + 1), "Actual foundation uses catalog price");
                        Require(actual.TryPurchase(), "Each allowed purchase increments exactly once.");
                    }
                    if (i == 1 || i == 5)
                    {
                        var wrongFitting = Call(definition, "Project", permanent, purchases, incompatible);
                        Equal(Get(wrongFitting, "CanPurchase"), false, "Incompatible fitting cannot buy");
                        if (!capped) Equal(Get(wrongFitting, "UnavailableReason"), i == 1 ? "Requires launcher fitting" : "Requires repair fitting", "Explicit fitting refusal");
                    }
                }
            }
            var first = (MechanicsShopTrack)Call(definition, "CreateTrack", 3, 0);
            var other = (MechanicsShopTrack)Call(tracks[(i + 1) % 6], "CreateTrack", 0, 0);
            Require(first.TryPurchase(), "P3 first purchase exists");
            Equal(first.NextRunPrice, 10, "Second price remains 10 at P3");
            Equal(other.RunPurchases, 0, "Another track n stays independent");
            Equal(other.NextRunPrice, 5, "Another track first price remains 5");
            Rejected(() => Call(definition, "CreateTrack", -1, 0), "Negative P");
            Rejected(() => Call(definition, "CreateTrack", permanentCap + 1, 0), "Above permanent cap P");
            Rejected(() => Call(definition, "CreateTrack", 0, -1), "Negative n");
            Rejected(() => Call(definition, "CreateTrack", 3, cap - 2), "Above remaining n cap");
        }
        var catalog = tracks[0].GetType().Assembly.GetType("SingedTerra.LastStand.LastStandUpgradeCatalog");
        var lookup = catalog.GetMethod("TryGet", BindingFlags.Public | BindingFlags.Static);
        Require(lookup != null, "Catalog supplies exact stable-key lookup.");
        var typedLookup = catalog.GetMethod("Get", BindingFlags.Public | BindingFlags.Static);
        Require(typedLookup != null, "Catalog supplies its public typed lookup.");
        var trackIdType = catalog.Assembly.GetType("SingedTerra.LastStand.LastStandUpgradeTrackId");
        Require(trackIdType != null && trackIdType.IsEnum, "Track lookup identity must be the actual typed enum.");
        foreach (var current in LastStandUpgradeCatalog.Tracks)
        {
            object[] args = { current.Key, null };
            Equal(lookup.Invoke(null, args), true, "Known key accepted");
            Require(Object.ReferenceEquals(args[1], current), "Lookup returns the authoritative immutable definition.");
            var typed = CallStatic(typedLookup, current.Id);
            Require(Object.ReferenceEquals(typed, args[1]), "Typed Get returns the exact definition for " + current.Id);
            Equal(Text(typed, "Id"), current.Id.ToString(), "Typed Get exact ID");
            Equal(Text(typed, "Key"), current.Key, "Typed Get exact key");
        }
        foreach (int invalidId in new[] { -1, 10, 99, int.MaxValue })
            RejectedParameter(() => CallStatic(typedLookup, Enum.ToObject(trackIdType, invalidId)), "id",
                "Typed Get invalid id=" + invalidId);
        foreach (var unknown in new[] { null, "", "CannonAttack", "cannonAttack ", "unknown" })
        {
            object[] args = { unknown, null };
            Equal(lookup.Invoke(null, args), false, "Unknown/invalid key refused");
            Equal(args[1], null, "Unknown key returns no definition");
        }
    }

    static int Price(int n) {long extra=Math.Max(0,n-8);return checked((int)(5L*n+extra*extra/40));}
    static LastStandUpgradeDefinition LegacyDefinition(LastStandUpgradeTrackId id) =>
        LastStandUpgradeCatalog.ForEconomy(LastStandUpgradeCatalog.LegacyEconomyVersion).Get(id);
    static int PermanentPrice(int n) {long extra=Math.Max(0,n-3);return checked((int)(n+extra*extra/16));}
    static void FillToCap(object ledger,int index)
    {
        Call(ledger,"ObserveAuthoritativeKills",LastStandShopState.MaximumUniqueKills);
        int cap=LegacyDefinition((LastStandUpgradeTrackId)index).TotalCap;
        while((int)Get(LedgerTrack(ledger,index),"CurrentLevel")<cap) {
            int n=(int)Get(LedgerTrack(ledger,index),"RunPurchases");
            var result=Call(ledger,"TryPurchase",PurchaseIntent(ledger,index));
            Equal(Get(result,"Accepted"),true,"Funded purchase reaches declared extended cap");
            Equal(Get(result,"ChargedScrap"),Price(n+1),"Extended purchase charges exact independent price");
        }
    }

    static object ActualLedger(int runId, bool launcher, int[] permanentLevels)
    {
        var assembly = typeof(MechanicsShopTrack).Assembly;
        var ledgerType = assembly.GetType("SingedTerra.LastStand.LastStandShopState");
        Require(ledgerType != null, "The actual compiled baseline supplies no run-owned ledger for independent tracks and unique-kill Scrap accounting.");
        var fittingType = assembly.GetType("SingedTerra.LastStand.LastStandFitting");
        var constructor = ledgerType.GetConstructor(new[] { typeof(int), fittingType, typeof(IReadOnlyList<int>), typeof(string), typeof(LastStandRunEdition), typeof(int) });
        Require(constructor != null, "The ledger must freeze six permanent levels for an identified run and fitting.");
        // Explicitly append zero for the new track to these preserved six-slot test inputs.
        if(permanentLevels != null && permanentLevels.Length == 6) { var expanded = new int[7]; Array.Copy(permanentLevels, expanded, 6); permanentLevels = expanded; }
        try { return constructor.Invoke(new object[] { runId, Enum.Parse(fittingType, launcher ? "Launcher" : "Repair"), permanentLevels, LastStandUpgradeCatalog.LegacyEconomyVersion, null, 1 }); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }

    static object LedgerTrack(object ledger, int index)
    {
        var idType = typeof(MechanicsShopTrack).Assembly.GetType("SingedTerra.LastStand.LastStandUpgradeTrackId");
        return Call(ledger, "GetTrack", Enum.Parse(idType, Ids[index]));
    }

    static object ActualLedger(int runId, int fittingValue, IReadOnlyList<int> permanentLevels)
    {
        var assembly = typeof(MechanicsShopTrack).Assembly;
        var ledgerType = assembly.GetType("SingedTerra.LastStand.LastStandShopState");
        Require(ledgerType != null, "Malformed construction must exercise the actual compiled ledger.");
        var fittingType = assembly.GetType("SingedTerra.LastStand.LastStandFitting");
        var constructor = ledgerType.GetConstructor(new[] { typeof(int), fittingType, typeof(IReadOnlyList<int>), typeof(string), typeof(LastStandRunEdition), typeof(int) });
        Require(constructor != null, "Malformed construction uses the actual run/fitting/permanent snapshot boundary.");
        try { return constructor.Invoke(new[] { (object)runId, Enum.ToObject(fittingType, fittingValue), permanentLevels, LastStandUpgradeCatalog.LegacyEconomyVersion, null, 1 }); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }

    static void RejectedConstructor(Action action, Type expectedType, string parameterName, string claim)
    {
        try { action(); }
        catch (ArgumentException error)
        {
            Equal(error.GetType(), expectedType, claim + " exact exception type");
            Equal(error.ParamName, parameterName, claim + " exact exception parameter");
            Console.Error.WriteLine("WITNESS " + claim + ": " + error.GetType().Name + " parameter=" + error.ParamName);
            return;
        }
        throw new Exception(claim + " must refuse malformed construction.");
    }

    static bool PurchaseLedgerLevel(object ledger, int index)
    {
        var method = ledger.GetType().GetMethod("TryPurchaseLevel", BindingFlags.NonPublic | BindingFlags.Instance);
        Require(method != null && method.IsAssembly, "Only the ledger-owned internal debit/increment primitive is available before T-03 intents.");
        var idType = typeof(MechanicsShopTrack).Assembly.GetType("SingedTerra.LastStand.LastStandUpgradeTrackId");
        try { return (bool)method.Invoke(ledger, new[] { Enum.Parse(idType, Ids[index]) }); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }

    static string LedgerFingerprint(object ledger)
    {
        string result = Get(ledger, "RunId") + "|" + Get(ledger, "Version") + "|" + Get(ledger, "UniqueKills") +
            "|" + Get(ledger, "Scrap") + "|" + Get(ledger, "EarnedScrap") + "|" + Get(ledger, "SpentScrap");
        for (int i = 0; i < Keys.Length; i++)
        {
            var track = LedgerTrack(ledger, i);
            result += ";" + Get(track, "PermanentLevel") + "," + Get(track, "RunPurchases") + "," +
                Get(track, "CurrentLevel") + "," + Get(track, "RemainingPurchases") + "," + Get(track, "NextPrice");
        }
        return result;
    }

    static void LedgerIndependentPricesAndCaps()
    {
        var definitions = ActualTracks();
        for (int i = 0; i < Keys.Length; i++)
        {
            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var levels = new int[Keys.Length];
                levels[i] = permanent;
                var ledger = ActualLedger(17, i != 5, levels);
                Equal(Get(ledger, "RunId"), 17, "Ledger preserves run identity");
                Equal(Get(ledger, "Version"), 0, "Fresh ledger version");
                Equal(Get(ledger, "Scrap"), 0, "Fresh ledger has no spendable Scrap");
                levels[i] = (permanent + 1) % 4;
                var firstView = LedgerTrack(ledger, i);
                Equal(Get(firstView, "PermanentLevel"), permanent, "Caller mutation cannot alter frozen P");
                Require(!(firstView is MechanicsShopTrack), "Observations expose no mutable purchase handle.");
                foreach (var property in firstView.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
                    Require(property.GetSetMethod() == null, "Track view has no public setter: " + property.Name);
                Require(firstView.GetType().GetMethod("TryPurchase") == null, "Track view cannot bypass currency accounting.");
                string empty = LedgerFingerprint(ledger);
                Require(!PurchaseLedgerLevel(ledger, i), "No funds means no purchase.");
                Equal(LedgerFingerprint(ledger), empty, "Insufficient funds change no track, total or version");
                Equal(Call(ledger, "ObserveAuthoritativeKills", LastStandShopState.MaximumUniqueKills), true, "Authoritative growth funds the ledger");
                int cap=(int)Get(definitions[i],"TotalCap");
                int spent = 0;
                int otherIndex = i == 0 ? 2 : 0;
                for (int purchases = 0; purchases <= cap - permanent; purchases++)
                {
                    var view = LedgerTrack(ledger, i);
                    Equal(Get(view, "PermanentLevel"), permanent, Keys[i] + " frozen P");
                    Equal(Get(view, "RunPurchases"), purchases, Keys[i] + " independent n");
                    Equal(Get(view, "CurrentLevel"), permanent + purchases, Keys[i] + " P+n");
                    Equal(Get(view, "RemainingPurchases"), cap - permanent - purchases, Keys[i] + " remaining cap");
                    bool capped = purchases == cap - permanent;
                    Equal(Get(view, "NextPrice"), capped ? null : (object)Price(purchases + 1), "Ledger price ignores P");
                    Equal(Get(view, "PriceDescription"), capped ? "MAX" : Price(purchases + 1) + " Scrap", "Ledger uses catalog price text");
                    Equal(Get(view, "CurrentEffectDescription"), Call(definitions[i], "DescribeEffect", permanent + purchases), "Ledger uses catalog effect");
                    Equal(Get(ledger, "SpentScrap"), spent, "Spent is exactly successful charges");
                    Equal(Get(ledger, "Scrap"), LastStandShopState.MaximumUniqueKills * 3 - spent, "Balance conserves earned minus spent");
                    Equal(Get(ledger, "EarnedScrap"), LastStandShopState.MaximumUniqueKills * 3, "Purchasing never changes earned income");
                    Equal(Get(ledger, "Version"), 1 + purchases, "Only admitted mutations advance the version");
                    Equal(Get(LedgerTrack(ledger, otherIndex), "RunPurchases"), 0, "Other track n remains zero");
                    Equal(Get(LedgerTrack(ledger, otherIndex), "NextPrice"), 5, "Other track first price remains 5");
                    if (capped)
                    {
                        string before = LedgerFingerprint(ledger);
                        Require(!PurchaseLedgerLevel(ledger, i), "Total cap refuses repeated ledger purchase.");
                        Equal(LedgerFingerprint(ledger), before, "Cap refusal changes no accounting or track");
                        Equal(Get(view, "NextEffectDescription"), "MAX", "Cap has no nonexistent next effect");
                    }
                    else
                    {
                        Require(PurchaseLedgerLevel(ledger, i), "Each funded compatible level admits one debit and increment.");
                        spent += Price(purchases + 1);
                    }
                }
                Equal(Get(firstView, "RunPurchases"), 0, "Retained observation cannot mutate with the ledger");
                Equal(Get(firstView, "CurrentLevel"), permanent, "Retained observation is a frozen value");
                var fresh = ActualLedger(18, i != 5, levels);
                Equal(Get(fresh, "Scrap"), 0, "New run cannot inherit old Scrap");
                Equal(Get(fresh, "EarnedScrap"), 0, "New run begins fresh earnings");
                Equal(Get(fresh, "SpentScrap"), 0, "New run begins fresh spending");
                for (int index = 0; index < Keys.Length; index++)
                    Equal(Get(LedgerTrack(fresh, index), "RunPurchases"), 0, "New run clears every n");
            }
        }
        foreach (bool launcher in new[] { false, true })
        {
            var ledger = ActualLedger(21, launcher, new int[6]);
            Call(ledger, "ObserveAuthoritativeKills", 2);
            string before = LedgerFingerprint(ledger);
            Require(!PurchaseLedgerLevel(ledger, launcher ? 5 : 1), "Incompatible fitting cannot debit ledger.");
            Equal(LedgerFingerprint(ledger), before, "Incompatible refusal changes nothing");
        }
        RejectedParameter(() => ActualLedger(0, true, new int[6]), "runId", "Invalid run identity");
        Rejected(() => ActualLedger(1, true, new[] { 0, 0, LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.HullCapacity).PermanentCap + 1, 0, 0, 0 }), "Above permanent cap");
        Rejected(() => ActualLedger(1, true, new[] { 0, -1, 0, 0, 0, 0 }), "Negative permanent level");

        var progressed = ActualLedger(22, true, new int[6]);
        Equal(Call(progressed, "ObserveAuthoritativeKills", 2), true, "Two kills fund the progressed boundary fixture");
        Require(PurchaseLedgerLevel(progressed, 0), "Progressed boundary spends the first five-Scrap price.");
        Equal(Call(progressed, "ObserveAuthoritativeKills", 4), true, "Four cumulative kills retain seven spendable Scrap");
        Equal(Get(LedgerTrack(progressed, 0), "RunPurchases"), 1, "Positive insufficient-funds case has progressed n");
        Equal(Get(LedgerTrack(progressed, 0), "NextPrice"), 10, "Progressed price is ten, not the first price");
        Equal(Get(progressed, "Scrap"), 7, "Positive balance is below the current price");
        Equal(Get(progressed, "EarnedScrap"), 12, "Four unique kills earned twelve Scrap");
        Equal(Get(progressed, "SpentScrap"), 5, "Only the first successful price was spent");
        string progressedBefore = LedgerFingerprint(progressed);
        Require(!PurchaseLedgerLevel(progressed, 0), "Seven Scrap cannot buy the ten-Scrap second level.");
        Equal(LedgerFingerprint(progressed), progressedBefore, "Positive insufficient funds preserve every track, balance, total, kills and version");
        Console.Error.WriteLine("WITNESS progressed refusal: n=" + Get(LedgerTrack(progressed, 0), "RunPurchases") +
            " price=" + Get(LedgerTrack(progressed, 0), "NextPrice") + " Scrap=" + Get(progressed, "Scrap") +
            " earned=" + Get(progressed, "EarnedScrap") + " spent=" + Get(progressed, "SpentScrap") +
            " version=" + Get(progressed, "Version") + " completeFingerprintUnchanged=" + (LedgerFingerprint(progressed) == progressedBefore));
        Equal(Call(progressed, "ObserveAuthoritativeKills", 5), true, "Fifth cumulative kill reaches the exact second price");
        Equal(Get(progressed, "Scrap"), 10, "Exact-price balance is admitted without an extra Scrap");
        int exactPriceVersion = (int)Get(progressed, "Version");
        Require(PurchaseLedgerLevel(progressed, 0), "Exactly ten Scrap admits the second level.");
        Equal(Get(LedgerTrack(progressed, 0), "RunPurchases"), 2, "Exact-price success increments n exactly once");
        Equal(Get(LedgerTrack(progressed, 0), "CurrentLevel"), 2, "Exact-price success applies exactly one ledger level");
        Equal(Get(progressed, "Scrap"), 0, "Exact-price debit leaves zero spendable Scrap");
        Equal(Get(progressed, "EarnedScrap"), 15, "Five actual kills conserve fifteen earned Scrap");
        Equal(Get(progressed, "SpentScrap"), 15, "Successful five-plus-ten charges conserve fifteen spent Scrap");
        Equal(Get(progressed, "UniqueKills"), 5, "Exact-price purchase cannot manufacture kills");
        Equal(Get(progressed, "Version"), exactPriceVersion + 1, "Exact-price admission advances the version exactly once");
        for (int index = 1; index < Keys.Length; index++)
            Equal(Get(LedgerTrack(progressed, index), "RunPurchases"), 0, "Exact-price success leaves all other tracks unchanged");
        string exactPriceAfter = LedgerFingerprint(progressed);
        Require(!PurchaseLedgerLevel(progressed, 0), "A second attempt cannot reuse the exact-price funds.");
        Equal(LedgerFingerprint(progressed), exactPriceAfter, "Post-admission refusal preserves complete accounting");
        Console.Error.WriteLine("WITNESS exact-price admission: n=" + Get(LedgerTrack(progressed, 0), "RunPurchases") +
            " Scrap=" + Get(progressed, "Scrap") + " earned=" + Get(progressed, "EarnedScrap") +
            " spent=" + Get(progressed, "SpentScrap") + " version=" + Get(progressed, "Version"));

        RejectedConstructor(() => ActualLedger(23, 0, null), typeof(ArgumentNullException), "permanentLevels", "Null permanent snapshot");
        foreach (int count in new[] { 0, 5, 6, 8 })
            RejectedConstructor(() => ActualLedger(23, 0, new int[count]), typeof(ArgumentException), "permanentLevels",
                "Wrong permanent snapshot count=" + count);
        RejectedConstructor(() => ActualLedger(23, 99, new int[7]), typeof(ArgumentException), null, "Undefined ledger fitting=99 refused by edition before construction");
    }

    static void LedgerUniqueKillIncome()
    {
        var ledger = ActualLedger(31, true, new int[6]);
        Equal(Call(ledger, "ObserveAuthoritativeKills", 0), false, "Initial zero kills grant nothing");
        Equal(Get(ledger, "Version"), 0, "Zero observation leaves version unchanged");
        Equal(Call(ledger, "ObserveAuthoritativeKills", 2), true, "Two newly observed actual kills credit once");
        Equal(Get(ledger, "UniqueKills"), 2, "Ledger high-water unique kills");
        Equal(Get(ledger, "EarnedScrap"), 6, "Exactly three Scrap per new unique kill");
        Equal(Get(ledger, "SpentScrap"), 0, "Income grants no spending");
        Equal(Get(ledger, "Scrap"), 6, "Two-kill no-purchase active balance");
        Require(PurchaseLedgerLevel(ledger, 0), "Six earned Scrap funds first five-Scrap level.");
        Equal(Get(ledger, "Scrap"), 1, "Successful debit leaves one Scrap");
        Equal(Get(ledger, "SpentScrap"), 5, "Successful debit enters spent total");
        foreach (int repeat in new[] { 2, 2, 1, 0, 2 })
        {
            string before = LedgerFingerprint(ledger);
            Equal(Call(ledger, "ObserveAuthoritativeKills", repeat), false, "Repeated/decreasing kills never earn");
            Equal(LedgerFingerprint(ledger), before, "Repeated observation preserves all accounting");
        }
        Equal(Call(ledger, "ObserveAuthoritativeKills", 3), true, "Only growth above high-water adds income");
        Equal(Get(ledger, "EarnedScrap"), 9, "Third actual kill adds exactly three");
        Equal(Get(ledger, "Scrap"), 4, "Growth preserves earned-spent balance");
        foreach (int invalid in new[] { -1, int.MinValue, int.MaxValue / 3 + 1, int.MaxValue })
        {
            string before = LedgerFingerprint(ledger);
            RejectedParameter(() => Call(ledger, "ObserveAuthoritativeKills", invalid), "uniqueKills", "Unrepresentable kill income");
            Equal(LedgerFingerprint(ledger), before, "Rejected income cannot partially update kills/currency/version");
        }
        var bounded = ActualLedger(32, true, new int[6]);
        Equal(Call(bounded, "ObserveAuthoritativeKills", int.MaxValue / 3), true, "Largest representable income is accepted");
        Equal(Get(bounded, "EarnedScrap"), 2147483646, "Income remains checked and bounded");
        Require(PurchaseLedgerLevel(bounded, 0), "Bounded balance admits ordinary price");
        Equal(Get(bounded, "Scrap"), 2147483641, "Bounded balance conserves after spending");

        foreach (bool launcher in new[] { false, true })
        {
            var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            var everyStep = ActualLedger(40, launcher, new int[6]);
            var partitioned = ActualLedger(40, launcher, new int[6]);
            bool sawDamageWithoutKill = false;
            for (int tick = 0; tick < model.Profile.Horizon && model.Status == EncounterStatus.Running; tick++)
            {
                int beforeKills = model.Kills;
                model.Step();
                string before = LedgerFingerprint(everyStep);
                Equal(Call(everyStep, "ObserveAuthoritativeKills", model.Kills), model.Kills > beforeKills, "Actual model kill growth admission");
                foreach (var outcome in model.Events)
                {
                    if ((outcome.Kind == EncounterEventKind.Cannon || outcome.Kind == EncounterEventKind.Launcher) && !outcome.Killed && model.Kills == beforeKills)
                    {
                        sawDamageWithoutKill = true;
                        Equal(LedgerFingerprint(everyStep), before, "Actual damage without kill grants zero Scrap");
                    }
                }
                Equal(Get(everyStep, "EarnedScrap"), 3 * model.Kills, "Every actual source step conserves kill income");
                if (tick % 17 == 0) Call(partitioned, "ObserveAuthoritativeKills", model.Kills);
            }
            Call(partitioned, "ObserveAuthoritativeKills", model.Kills);
            Require(sawDamageWithoutKill && model.Kills > 0, "Actual playable source exercises both damage and unique kill events.");
            Equal(Get(partitioned, "UniqueKills"), Get(everyStep, "UniqueKills"), "Observation partition preserves unique kills");
            Equal(Get(partitioned, "Scrap"), Get(everyStep, "Scrap"), "Observation partition preserves income");
            Equal(Get(partitioned, "EarnedScrap"), Get(everyStep, "EarnedScrap"), "Coalesced callbacks preserve earned total");
            string final = LedgerFingerprint(everyStep);
            for (int refresh = 0; refresh < 3; refresh++) Call(everyStep, "ObserveAuthoritativeKills", model.Kills);
            Equal(LedgerFingerprint(everyStep), final, "Repeated terminal model observation grants nothing");
        }
        var removedModel = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        removedModel.Step();
        Require(removedModel.Foes[0].Alive && removedModel.Kills == 0, "Ordinary live foe exists for removal input.");
        var removedLedger = ActualLedger(41, true, new int[6]);
        string removalBefore = LedgerFingerprint(removedLedger);
        removedModel.Foes[0].Hull = 0;
        Equal(Call(removedLedger, "ObserveAuthoritativeKills", removedModel.Kills), false, "Removal without authoritative kill grants nothing");
        Equal(LedgerFingerprint(removedLedger), removalBefore, "Removal cannot mint currency");
    }

    static object PurchaseIntent(object ledger, int track, int? runId = null, int? version = null)
    {
        var assembly = typeof(MechanicsShopTrack).Assembly;
        var intentType = assembly.GetType("SingedTerra.LastStand.LastStandShopPurchaseIntent");
        Require(intentType != null, "The actual compiled ledger supplies no validated purchase intent transaction.");
        var idType = assembly.GetType("SingedTerra.LastStand.LastStandUpgradeTrackId");
        var constructor = intentType.GetConstructor(new[] { typeof(int), typeof(int), idType });
        Require(constructor != null, "Purchase intent captures run, state version and typed track.");
        return constructor.Invoke(new[] { runId ?? Get(ledger, "RunId"), version ?? Get(ledger, "Version"), Enum.ToObject(idType, track) });
    }

    static string TransactionFingerprint(object ledger)
    {
        string result = LedgerFingerprint(ledger) + "|" + Get(ledger, "Fitting") + "|" + Get(ledger, "PurchaseLifecycle");
        for (int i = 0; i < Keys.Length; i++)
        {
            var view = LedgerTrack(ledger, i);
            result += "|" + Get(view, "CurrentEffectDescription") + "|" + Get(view, "NextEffectDescription") +
                "|" + Get(view, "PriceDescription") + "|" + Get(view, "IsEligible");
        }
        return result;
    }

    static string TrackFingerprint(object ledger, int index)
    {
        var view = LedgerTrack(ledger, index);
        return Get(view, "PermanentLevel") + "|" + Get(view, "RunPurchases") + "|" + Get(view, "CurrentLevel") +
            "|" + Get(view, "RemainingPurchases") + "|" + Get(view, "NextPrice") +
            "|" + Get(view, "CurrentEffectDescription") + "|" + Get(view, "NextEffectDescription");
    }

    static void RefusedPurchase(object ledger, object intent, string reason)
    {
        string before = TransactionFingerprint(ledger);
        var result = Call(ledger, "TryPurchase", intent);
        Equal(Get(result, "Accepted"), false, reason + " refuses admission");
        var refusal = Get(result, "Refusal");
        Require(refusal.GetType().IsEnum, "Refusal is typed data for the later UI.");
        Equal(refusal.ToString(), reason, "Current exact refusal reason");
        Equal(Get(result, "ChargedScrap"), 0, reason + " has no charge");
        Equal(Get(result, "Track"), null, reason + " has no applied projection");
        Equal(Get(result, "Version"), Get(ledger, "Version"), reason + " reports unchanged current version");
        Equal(TransactionFingerprint(ledger), before, reason + " preserves all funds/levels/stats/version/lifecycle");
        Console.Error.WriteLine("WITNESS transaction refusal: " + reason + " completeFingerprintUnchanged=True");
    }

    static object LifecycleValue(string name)
    {
        var type = typeof(MechanicsShopTrack).Assembly.GetType("SingedTerra.LastStand.LastStandShopPurchaseLifecycle");
        Require(type != null && type.IsEnum, "Purchase lifecycle admission is typed.");
        return Enum.Parse(type, name);
    }

    static void ChangeLifecycle(object ledger, string name)
    {
        int version = (int)Get(ledger, "Version");
        Equal(Call(ledger, "UpdatePurchaseLifecycle", LifecycleValue(name)), true, "Owner reports a new " + name + " boundary");
        Equal(Text(ledger, "PurchaseLifecycle"), name, "Latest owner lifecycle observation");
        Equal(Get(ledger, "Version"), version + 1, "Boundary invalidates previously captured intents once");
    }

    static void TransactionAtomicChargeAndLevel()
    {
        for (int i = 0; i < Keys.Length; i++)
        {
            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var levels = new int[6];
                levels[i] = permanent;
                var ledger = ActualLedger(61, i != 5, levels);
                var initialIntent = PurchaseIntent(ledger, i);
                RefusedPurchase(ledger, initialIntent, "InsufficientScrap");
                Call(ledger, "ObserveAuthoritativeKills", 100);
                RefusedPurchase(ledger, initialIntent, "StaleVersion");
                object firstResult = null;
                int spent = 0;
                for (int n = 0; n < 8 - permanent; n++)
                {
                    var other = new string[6];
                    for (int j = 0; j < 6; j++) other[j] = TrackFingerprint(ledger, j);
                    int version = (int)Get(ledger, "Version");
                    var intent = PurchaseIntent(ledger, i);
                    var result = Call(ledger, "TryPurchase", intent);
                    Equal(Get(result, "Accepted"), true, "Compatible current intent admits once");
                    Equal(Text(result, "Refusal"), "None", "Success has no refusal");
                    Equal(Get(result, "ChargedScrap"), 5 * (n + 1), "Exact charge uses pre-purchase n independently of P");
                    spent += 5 * (n + 1);
                    Equal(Get(ledger, "SpentScrap"), spent, "Every charge enters spent exactly once");
                    Equal(Get(ledger, "Scrap"), 300 - spent, "Complete candidate balance is earned minus spent");
                    Equal(Get(ledger, "EarnedScrap"), 300, "Purchase creates no income");
                    Equal(Get(ledger, "UniqueKills"), 100, "Purchase creates no kills");
                    Equal(Get(ledger, "Version"), version + 1, "One accepted intent advances version once");
                    Equal(Get(result, "Version"), version + 1, "Result binds the complete published candidate version");
                    var applied = Get(result, "Track");
                    Equal(Get(applied, "PermanentLevel"), permanent, "Accepted effect retains frozen P");
                    Equal(Get(applied, "RunPurchases"), n + 1, "Accepted effect increments only one n");
                    Equal(Get(applied, "CurrentLevel"), permanent + n + 1, "Accepted level is P+n");
                    string expectedEffect = i == 3 ? "reduce hits by " + (permanent + n + 1) + " (minimum 1 damage)"
                        : i == 4 ? CycleSeconds[permanent + n + 1] + "s between cannon shots"
                        : Effects[i][permanent + n + 1] + Units[i];
                    Equal(Get(applied, "CurrentEffectDescription"), expectedEffect, "Exact catalog stat effect matches the charged level");
                    Equal(Get(applied, "CurrentEffectDescription"), Get(LedgerTrack(ledger, i), "CurrentEffectDescription"), "Result and authoritative ledger share one catalog projection");
                    for (int j = 0; j < 6; j++)
                        if (j != i) Equal(TrackFingerprint(ledger, j), other[j], "Every other track retains n/price/stats");
                    RefusedPurchase(ledger, intent, "StaleVersion");
                    if (firstResult == null) firstResult = result;
                }
                FillToCap(ledger, i);
                var capped = LedgerTrack(ledger, i);
                Equal(Get(capped, "CurrentLevel"), LastStandUpgradeCatalog.Get((LastStandUpgradeTrackId)i).TotalCap, "Every track ends at the total cap");
                Equal(Get(capped, "NextPrice"), null, "At cap there is no nonexistent next price");
                Equal(Get(capped, "NextEffectDescription"), "MAX", "At cap there is no nonexistent next effect");
                RefusedPurchase(ledger, PurchaseIntent(ledger, i), "AtCap");
                Equal(Get(Get(firstResult, "Track"), "RunPurchases"), 1, "Retained result projection is immutable after subsequent purchases");
                foreach (var property in firstResult.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
                    Require(property.GetSetMethod() == null, "Result has no mutable public setter: " + property.Name);
                Console.Error.WriteLine("WITNESS transaction cap: " + Keys[i] + " P=" + permanent + " spent=" + spent + " L=8");
            }
        }
        var mixed = ActualLedger(62, false, new int[6]);
        Call(mixed, "ObserveAuthoritativeKills", 10);
        Equal(Get(Call(mixed, "TryPurchase", PurchaseIntent(mixed, 0)), "ChargedScrap"), 5, "First Cannon Attack costs five");
        Equal(Get(Call(mixed, "TryPurchase", PurchaseIntent(mixed, 2)), "ChargedScrap"), 5, "First Hull Capacity remains five after Cannon Attack");
        Equal(Get(Call(mixed, "TryPurchase", PurchaseIntent(mixed, 0)), "ChargedScrap"), 10, "Second Cannon Attack retains its independent price");
        Equal(Get(Call(mixed, "TryPurchase", PurchaseIntent(mixed, 5)), "ChargedScrap"), 5, "Repair-fitting transaction applies its independent first price");
        Equal(Get(mixed, "Scrap"), 5, "Mixed purchases charge only their four exact prices");
    }

    static void TransactionStaleReplayAndRefusal()
    {
        var ledger = ActualLedger(71, true, new int[6]);
        var noFunds = PurchaseIntent(ledger, 0);
        RefusedPurchase(ledger, null, "InvalidIntent");
        foreach (int run in new[] { 0, -1, 70, 72, int.MaxValue })
            RefusedPurchase(ledger, PurchaseIntent(ledger, 0, run), "WrongRun");
        foreach (int version in new[] { -1, 1, int.MaxValue })
            RefusedPurchase(ledger, PurchaseIntent(ledger, 0, null, version), "StaleVersion");
        foreach (int unknown in new[] { -1, 7, 99, int.MaxValue })
            RefusedPurchase(ledger, PurchaseIntent(ledger, unknown), "UnknownTrack");
        RefusedPurchase(ledger, PurchaseIntent(ledger, 5), "WrongFitting");
        RefusedPurchase(ledger, noFunds, "InsufficientScrap");
        Call(ledger, "ObserveAuthoritativeKills", 2);
        RefusedPurchase(ledger, noFunds, "StaleVersion");
        var intent = PurchaseIntent(ledger, 0);
        Equal(Get(Call(ledger, "TryPurchase", intent), "Accepted"), true, "Funded intent first admission");
        RefusedPurchase(ledger, intent, "StaleVersion");
        Call(ledger, "ObserveAuthoritativeKills", 4);
        Equal(Get(ledger, "Scrap"), 7, "Progressed refusal has a positive seven-Scrap balance");
        RefusedPurchase(ledger, PurchaseIntent(ledger, 0), "InsufficientScrap");
        Call(ledger, "ObserveAuthoritativeKills", 5);
        var exact = Call(ledger, "TryPurchase", PurchaseIntent(ledger, 0));
        Equal(Get(exact, "Accepted"), true, "Exact second price admits");
        Equal(Get(exact, "ChargedScrap"), 10, "Second price charged once");
        Equal(Get(ledger, "Scrap"), 0, "Exact price consumes precisely the current funds");
        Equal(Get(ledger, "SpentScrap"), 15, "Total charges conserve the five-plus-ten prices");
        Equal(Get(LedgerTrack(ledger, 0), "CurrentLevel"), 2, "Fresh intent can buy the next level");

        var repair = ActualLedger(72, false, new int[6]);
        Call(repair, "ObserveAuthoritativeKills", 20);
        RefusedPurchase(repair, PurchaseIntent(repair, 1), "WrongFitting");
        RefusedPurchase(repair, PurchaseIntent(ledger, 0), "WrongRun");
        var beforePause = PurchaseIntent(repair, 0);
        ChangeLifecycle(repair, "Paused");
        RefusedPurchase(repair, beforePause, "StaleVersion");
        Equal(Get(Call(repair, "TryPurchase", PurchaseIntent(repair, 5)), "Accepted"), true, "Explicit settled pause permits repair purchase");
        var beforeDebt = PurchaseIntent(repair, 0);
        ChangeLifecycle(repair, "CatchingUp");
        RefusedPurchase(repair, beforeDebt, "CatchingUp");
        RefusedPurchase(repair, PurchaseIntent(repair, 0), "CatchingUp");
        string debtBefore = TransactionFingerprint(repair);
        Equal(Call(repair, "UpdatePurchaseLifecycle", LifecycleValue("CatchingUp")), false, "Same boundary is no mutation");
        Equal(TransactionFingerprint(repair), debtBefore, "Repeated debt observation preserves all state");
        var lifecycleType = LifecycleValue("Running").GetType();
        Equal(Call(repair, "UpdatePurchaseLifecycle", Enum.ToObject(lifecycleType, 99)), false, "Unknown lifecycle refuses without transition");
        Equal(TransactionFingerprint(repair), debtBefore, "Unknown lifecycle preserves all state");
        ChangeLifecycle(repair, "Running");
        RefusedPurchase(repair, beforeDebt, "StaleVersion");
        Equal(Get(LedgerTrack(repair, 0), "RunPurchases"), 0, "Refused debt intent was not queued");
        Equal(Get(Call(repair, "TryPurchase", PurchaseIntent(repair, 0)), "Accepted"), true, "Fresh settled running boundary permits one purchase");

        foreach (string terminal in new[] { "Defeated", "Exited", "Limit", "Failed", "Inactive" })
        {
            var ended = ActualLedger(80, true, new int[6]);
            Call(ended, "ObserveAuthoritativeKills", 20);
            var queued = PurchaseIntent(ended, 2);
            ChangeLifecycle(ended, terminal);
            RefusedPurchase(ended, queued, terminal);
            RefusedPurchase(ended, PurchaseIntent(ended, 2), terminal);
            string frozen = TransactionFingerprint(ended);
            Equal(Call(ended, "UpdatePurchaseLifecycle", LifecycleValue("Running")), false, "Terminal admission cannot reopen");
            Equal(TransactionFingerprint(ended), frozen, "Terminal latch preserves all state");
            RefusedPurchase(ended, PurchaseIntent(ended, 2), terminal);
            var fresh = ActualLedger(81, true, new int[6]);
            RefusedPurchase(fresh, queued, "WrongRun");
            Equal(Get(fresh, "Scrap"), 0, "Next run starts with no terminal funds");
            for (int i = 0; i < 6; i++) Equal(Get(LedgerTrack(fresh, i), "RunPurchases"), 0, "Next run starts with zero n");
        }
    }

    // A missing future seam leaves the actual baseline untouched so RED measures
    // its real wrong hit, rather than a compiler error or a substitute model.
    static bool ApplyAttack(EncounterModel model, int cannonDamage, int launcherDamage)
    {
        var method = typeof(EncounterModel).GetMethod("TryApplyPlayableAttackProjection");
        if (method == null) return false;
        try { return (bool)method.Invoke(model, new object[] { cannonDamage, launcherDamage }); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }

    static bool ApplyLedgerAttack(EncounterModel model, object ledger)
    {
        var definitions = ActualTracks();
        int cannon = (int)Call(definitions[0], "EffectAt", Get(LedgerTrack(ledger, 0), "CurrentLevel"), 1);
        int launcher = (int)Call(definitions[1], "EffectAt", Get(LedgerTrack(ledger, 1), "CurrentLevel"), 1);
        return ApplyAttack(model, cannon, launcher);
    }

    static string EventFingerprint(EncounterModel model)
    {
        string result = "";
        foreach (var outcome in model.Events)
            result += outcome.Kind + "," + outcome.Slot + "," + outcome.Amount + "," + outcome.Killed + ";";
        return result;
    }

    static EncounterFoe DurableTarget(EncounterModel model, int distance)
    {
        model.Step();
        var target = model.Foes[0];
        target.Hull = target.MaximumHull = 1000;
        target.Distance = distance;
        return target;
    }

    static EncounterEvent ShotAt(EncounterModel model, EncounterEventKind kind, int due, out int hitHullBefore, bool auxiliaryOnly = false)
    {
        hitHullBefore = model.Foes[0].Hull;
        while (model.Tick < due)
        {
            if (auxiliaryOnly)
            {
                // Controlled target location isolates launcher damage from the
                // main range. Movement and hits still execute actual Step.
                model.Foes[0].Distance = 24000;
                for (int i = 1; i < model.Foes.Count; i++) model.Foes[i].Hull = 0;
            }
            int before = kind == EncounterEventKind.Cannon ? model.CannonShots : model.LauncherShots;
            hitHullBefore = model.Foes[0].Hull;
            model.Step();
            int after = kind == EncounterEventKind.Cannon ? model.CannonShots : model.LauncherShots;
            Equal(after - before, model.Tick == due ? 1 : 0, kind + " retains the future due tick " + due);
        }
        int count = 0;
        var result = default(EncounterEvent);
        foreach (var outcome in model.Events)
            if (outcome.Kind == kind) { count++; result = outcome; }
        Equal(count, 1, "Exactly one real " + kind + " event at the due tick");
        Equal(result.Slot, 0, "The controlled durable foe receives the actual shot");
        return result;
    }

    static void AttackCannonExactDamage()
    {
        foreach (bool launcher in new[] { false, true })
            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var ledger = ActualLedger(101, launcher, new[] { permanent, 0, 0, 0, 0, 0 });
                Call(ledger, "ObserveAuthoritativeKills", 100); // Funds fixture; not a runtime income claim.
                var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype, Effects[0][permanent]);
                var target = DurableTarget(model, 22050);
                bool applied = false;
                for (int n = 0; n <= 8 - permanent; n++)
                {
                    if (n > 0) Equal(Get(Call(ledger, "TryPurchase", PurchaseIntent(ledger, 0)), "Accepted"), true,
                        "Real Cannon Attack intent increments its run track");
                    string before = model.Snapshot(), events = EventFingerprint(model);
                    applied = ApplyLedgerAttack(model, ledger);
                    Equal(model.Snapshot(), before, "Projection cannot shoot, damage or advance the current tick");
                    Equal(EventFingerprint(model), events, "Projection cannot rewrite already emitted outcomes");
                    int hullBefore = target.Hull;
                    Require(hullBefore > Effects[0][permanent + n] + 12, "Durable target prevents damage capping from hiding the cannon formula.");
                    var shot = ShotAt(model, EncounterEventKind.Cannon, 2 + n * 20, out int hitHullBefore);
                    Equal(shot.Amount, Effects[0][permanent + n], "Actual cannon damage P=" + permanent + " n=" + n + " fitting=" + launcher);
                    int otherDamage = 0;
                    foreach (var outcome in model.Events)
                        if (outcome.Kind == EncounterEventKind.Launcher && outcome.Slot == 0) otherDamage += outcome.Amount;
                    Equal(hitHullBefore - target.Hull, shot.Amount + otherDamage, "Actual foe hull loss matches all ordered real hits");
                    Equal(shot.Killed, false, "Formula witness is not a hull-capped kill");
                    Equal(model.CommittedCannonDamage, Effects[0][permanent], "The original committed deployment value remains frozen");
                    Console.Error.WriteLine("WITNESS cannon P=" + permanent + " n=" + n + " fitting=" + launcher +
                        " tick=" + model.Tick + " Amount=" + shot.Amount + " hull=" + hitHullBefore + "->" + target.Hull + " other=" + otherDamage);
                }
                Require(applied, "Playable source admits the catalog attack projection.");
                Equal(Get(model, "CurrentCannonDamage"), 100, "Actual current cannon observation is the applied catalog value");
                Equal(Get(model, "CurrentLauncherDamage"), 12, "Cannon purchases do not increase auxiliary damage");
            }
        var capped = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        var cappedTarget = DurableTarget(capped, 22050);
        cappedTarget.Hull = 7;
        Require(ApplyAttack(capped, Effects[0][8], Effects[1][0]), "Cap witness admits actual catalog values.");
        var cappedShot = ShotAt(capped, EncounterEventKind.Cannon, 2, out _);
        Equal(cappedShot.Amount, 7, "Real hit Amount is capped to the remaining target hull");
        Equal(cappedTarget.Hull, 0, "Capped shot consumes exactly the remaining hull");
        Equal(capped.Kills, 1, "Capped actual death credits one kill");
        Require(cappedShot.Killed, "Actual capped event identifies the kill.");
        CheckAttackAdmission();
        CheckAttackCompatibility();
    }

    static void AttackLauncherFittingIsolation()
    {
        for (int permanent = 0; permanent <= 3; permanent++)
        {
            var ledger = ActualLedger(111, true, new[] { 0, permanent, 0, 0, 0, 0 });
            Call(ledger, "ObserveAuthoritativeKills", 100);
            var model = new EncounterModel(true, EncounterProfile.PlayablePrototype);
            var target = DurableTarget(model, 24000);
            bool applied = false;
            for (int n = 0; n <= 8 - permanent; n++)
            {
                if (n > 0) Equal(Get(Call(ledger, "TryPurchase", PurchaseIntent(ledger, 1)), "Accepted"), true,
                    "Real compatible Launcher Attack intent increments its run track");
                string before = model.Snapshot(), events = EventFingerprint(model);
                applied = ApplyLedgerAttack(model, ledger);
                Equal(model.Snapshot(), before, "Launcher projection has no current-tick shot or hull side effect");
                Equal(EventFingerprint(model), events, "Launcher projection retains the previous shot outcome");
                int hullBefore = target.Hull;
                Require(hullBefore > Effects[1][permanent + n], "Durable target prevents launcher formula capping.");
                var shot = ShotAt(model, EncounterEventKind.Launcher, 31 + n * 30, out int hitHullBefore, true);
                Equal(shot.Amount, Effects[1][permanent + n], "Actual launcher damage P=" + permanent + " n=" + n);
                Equal(hitHullBefore - target.Hull, shot.Amount, "Launcher Amount equals actual foe health loss");
                Equal(shot.Killed, false, "Launcher formula witness is not a capped kill");
                Equal(model.CannonShots, 0, "Longer-range launcher projection does not fire the main cannon");
                Equal(model.Restored, 0, "Launcher fitting cannot repair");
                Equal(Get(LedgerTrack(ledger, 0), "CurrentLevel"), 0, "Launcher purchases leave Cannon Attack unchanged");
                Console.Error.WriteLine("WITNESS launcher P=" + permanent + " n=" + n + " tick=" + model.Tick +
                    " Amount=" + shot.Amount + " hull=" + hitHullBefore + "->" + target.Hull);
            }
            Require(applied, "Playable source admits the launcher catalog projection.");
            Equal(Get(model, "CurrentCannonDamage"), 20, "Launcher purchases do not increase main damage");
            Equal(Get(model, "CurrentLauncherDamage"), 44, "Actual auxiliary observation reaches the applied total cap");
        }
        var capped = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        var cappedTarget = DurableTarget(capped, 24000);
        cappedTarget.Hull = 7;
        Require(ApplyAttack(capped, Effects[0][0], Effects[1][8]), "Launcher cap witness admits actual catalog values.");
        var cappedShot = ShotAt(capped, EncounterEventKind.Launcher, 31, out _, true);
        Equal(cappedShot.Amount, 7, "Launcher hit is capped by remaining hull");
        Equal(cappedTarget.Hull, 0, "Launcher capped kill consumes remaining hull");
        Equal(capped.Kills, 1, "Launcher actual death counts exactly once");
        Require(cappedShot.Killed, "Capped launcher event identifies actual death.");

        var repairLedger = ActualLedger(112, false, new[] { 0, 3, 0, 0, 0, 0 });
        Call(repairLedger, "ObserveAuthoritativeKills", 100);
        RefusedPurchase(repairLedger, PurchaseIntent(repairLedger, 1), "WrongFitting");
        var repair = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        var control = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        Require(ApplyLedgerAttack(repair, repairLedger), "Compatible main projection still admits for repair fitting.");
        while (repair.Status == EncounterStatus.Running)
        {
            repair.Step(); control.Step();
            Equal(repair.Snapshot(), control.Snapshot(), "Incompatible launcher level cannot change repair combat at tick " + repair.Tick);
            Equal(EventFingerprint(repair), EventFingerprint(control), "Wrong-fitting launcher projection cannot change outcomes");
            Equal(repair.LauncherShots, 0, "Repair fitting never acquires a launcher");
        }
        Require(repair.Restored > 0 && repair.CannonShots > 0, "Wrong-fitting parity exercises actual repair and main hits.");
        Console.Error.WriteLine("WITNESS wrong-fitting launcher refused; complete repair run parity=" + repair.Summary);
    }

    static void CheckAttackAdmission()
    {
        var model = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        Require(ApplyAttack(model, 30, 16), "Valid attack values admit atomically.");
        foreach (var invalid in new[] { new[] { 19, 44 }, new[] { 100, 11 }, new[] { int.MinValue, 16 }, new[] { 30, int.MinValue } })
        {
            string before = model.Snapshot(), events = EventFingerprint(model);
            Require(!ApplyAttack(model, invalid[0], invalid[1]), "Invalid projected damage refuses without a partial stat update.");
            Equal(Get(model, "CurrentCannonDamage"), 30, "Invalid pair preserves cannon projection");
            Equal(Get(model, "CurrentLauncherDamage"), 16, "Invalid pair preserves launcher projection");
            Equal(model.Snapshot(), before, "Invalid projection preserves all encounter state");
            Equal(EventFingerprint(model), events, "Invalid projection preserves emitted events");
        }
        foreach (bool launcher in new[] { false, true })
        {
            var ended = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            while (ended.Status == EncounterStatus.Running) ended.Step();
            string before = ended.Snapshot(), events = EventFingerprint(ended);
            Require(!ApplyAttack(ended, 100, 44), "Terminal encounter cannot receive future attack effects.");
            Equal(Get(ended, "CurrentCannonDamage"), 20, "Terminal refusal preserves main damage");
            Equal(Get(ended, "CurrentLauncherDamage"), 12, "Terminal refusal preserves auxiliary damage");
            ended.Step();
            Equal(ended.Snapshot(), before, "Terminal projection cannot revive or advance the model");
            Equal(EventFingerprint(ended), events, "Terminal projection leaves final events intact");
        }
    }

    static string SnapshotHash(EncounterModel model)
    {
        using (var hash = System.Security.Cryptography.SHA256.Create())
            return BitConverter.ToString(hash.ComputeHash(System.Text.Encoding.UTF8.GetBytes(model.Snapshot()))).Replace("-", "").ToLowerInvariant();
    }

    static void CheckAttackCompatibility()
    {
        string[,] retained = {
            { "adc49df9a0713701d88fc621db959da192f5b3e66c9f8f5d6b562853868b12b6", "288cbba6d7d844d964831dfe59c82b9cbd92f55206f49b75c38f6d587a721953" },
            { "939b493e6a400dec39dd422a42c66977171dcd4ed59fcc81bd678d7f97351eb3", "bb7115d9b540e03e17c82cd3bdbdf2eeacb143d11b11bbb0f5d53d47ea1772f4" },
            { "bd4e602433adaafdf40a1d30c8bc8244962535ca3d4a156ffa068204aa381e14", "d0166220ca362fc9bdb7945aed21cc0791ec5909327b05428e064a0aa86e3003" },
            { "e333e726f15e13aa9e52792e78364b51f4cfd5748222ba112657e28eec0c784f", "11a0b9e779b797fb16b748eda2ef16f27cd709a4f3396e7b77181b0d01cd7321" },
        };
        int index = 0;
        foreach (var profile in new[] { EncounterProfile.Legacy, EncounterProfile.VisualReview })
            foreach (bool launcher in new[] { false, true })
            {
                var model = new EncounterModel(launcher, profile);
                Require(!ApplyAttack(model, 100, 44), "Shared profiles refuse playable shop projection.");
                while (model.Tick < 137) model.Step();
                Equal(SnapshotHash(model), retained[index, 0], "Pinned pre-T04 shared snapshot bytes at tick137");
                while (model.Status == EncounterStatus.Running) model.Step();
                Equal(SnapshotHash(model), retained[index, 1], "Pinned pre-T04 shared terminal snapshot bytes");
                Console.Error.WriteLine("WITNESS preserved " + profile.Id + " fitting=" + launcher + " snapshot137=" + retained[index, 0] +
                    " terminal=" + SnapshotHash(model));
                index++;
            }
        foreach (var profile in new[] { EncounterProfile.Legacy, EncounterProfile.VisualReview, EncounterProfile.PlayablePrototype })
            foreach (bool launcher in new[] { false, true })
            {
                foreach (int value in new[] { 20, 25, 30, 40, 50 })
                    Equal(new EncounterModel(launcher, profile, value).CommittedCannonDamage, value, "Original inclusive20..50 constructor values remain admitted");
                foreach (int invalid in new[] { 19, 51, int.MinValue, int.MaxValue })
                    RejectedParameter(() => new EncounterModel(launcher, profile, invalid), "cannonDamage", "Original constructor damage range");
            }
    }

    // Test-only absent-seam fallback observes unchanged compiled combat for RED.
    static bool ApplyDefense(EncounterModel model, int maximumHull, Func<int, int> incomingHit)
    {
        var method = typeof(EncounterModel).GetMethod("TryApplyPlayableDefenseProjection");
        if (method == null) return false;
        try { return (bool)method.Invoke(model, new object[] { maximumHull, incomingHit }); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }

    static int AppliedMaximumHull(EncounterModel model)
    {
        var property = typeof(EncounterModel).GetProperty("CurrentMaximumHull");
        return property == null ? EncounterModel.MaximumHull : (int)property.GetValue(model);
    }

    static bool ApplyLedgerDefense(EncounterModel model, object ledger)
    {
        var definitions = ActualTracks();
        int capacity = (int)Get(LedgerTrack(ledger, 2), "CurrentLevel");
        int armor = (int)Get(LedgerTrack(ledger, 3), "CurrentLevel");
        int maximum = (int)Call(definitions[2], "EffectAt", capacity, 1);
        // Capture immutable catalog/level values now; no ledger is read by a hit.
        var armorDefinition = definitions[3];
        return ApplyDefense(model, maximum, rawHit => (int)Call(armorDefinition, "EffectAt", armor, rawHit));
    }

    static void SetEncounterValue(EncounterModel model, string name, int value)
    {
        var property = typeof(EncounterModel).GetProperty(name);
        var setter = property.GetSetMethod(true);
        Require(setter != null, "Controlled combat fixture requires actual private state setter.");
        setter.Invoke(model, new object[] { value });
    }

    static EncounterEvent EnemyHit(EncounterModel model, FoeKind kind, int rawHit, out int hullBefore)
    {
        if (model.Tick == 0) model.Step();
        for (int i = 1; i < model.Foes.Count; i++) model.Foes[i].Hull = 0;
        var foe = model.Foes[0];
        foe.Kind = kind;
        foe.Hull = foe.MaximumHull = 1000;
        foe.Damage = rawHit;
        foe.Distance = model.Profile.Stop(kind);
        foe.NextAttack = 0;
        int hitsBefore = kind == FoeKind.Close ? model.CloseHits : model.RangedHits;
        hullBefore = model.Hull;
        model.Step();
        Equal((kind == FoeKind.Close ? model.CloseHits : model.RangedHits) - hitsBefore, 1, "Exactly one actual enemy hit");
        var expectedKind = kind == FoeKind.Close ? EncounterEventKind.CloseHit : EncounterEventKind.RangedHit;
        int count = 0, restored = 0;
        var hit = default(EncounterEvent);
        foreach (var outcome in model.Events)
        {
            if (outcome.Kind == expectedKind) { count++; hit = outcome; }
            if (outcome.Kind == EncounterEventKind.Repair) restored += outcome.Amount;
        }
        Equal(count, 1, "Actual Step emits one matching enemy hit type");
        Equal(hit.Slot, 0, "Actual controlled enemy deals the hit");
        Equal(hullBefore + restored - model.Hull, hit.Amount, "Enemy event matches actual hull loss after existing repair");
        return hit;
    }

    static void DefenseHullPurchaseAndClamp()
    {
        foreach (bool launcher in new[] { false, true })
            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var ledger = ActualLedger(121, launcher, new[] { 0, 0, permanent, 0, 0, 0 });
                Call(ledger, "ObserveAuthoritativeKills", 100);
                var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype, 30);
                bool applied = ApplyLedgerDefense(model, ledger);
                Equal(model.Hull, Effects[2][permanent], "Permanent capacity starts with full projected hull P=" + permanent);
                Equal(AppliedMaximumHull(model), Effects[2][permanent], "Permanent capacity applies dynamic maximum");
                var initialHit = EnemyHit(model, FoeKind.Close, 20, out _);
                Equal(initialHit.Amount, 20, "Capacity alone does not grant armor");
                for (int n = 1; n <= 8 - permanent; n++)
                {
                    int beforeHull = model.Hull, beforeTick = model.Tick;
                    string events = EventFingerprint(model);
                    var intent = PurchaseIntent(ledger, 2);
                    var result = Call(ledger, "TryPurchase", intent);
                    Equal(Get(result, "Accepted"), true, "Actual temporary capacity intent succeeds");
                    Equal(Get(result, "ChargedScrap"), 5 * n, "Capacity consumes its independent actual price");
                    applied = ApplyLedgerDefense(model, ledger);
                    Equal(model.Hull, beforeHull + 15, "Actual capacity purchase adds exactly fifteen current hull P=" + permanent + " n=" + n);
                    Equal(AppliedMaximumHull(model), Effects[2][permanent + n], "Actual capacity maximum follows catalog P+n");
                    Equal(model.Tick, beforeTick, "Capacity projection cannot advance combat");
                    Equal(EventFingerprint(model), events, "Capacity projection cannot rewrite emitted outcomes");
                    Equal(model.CurrentCannonDamage, 30, "Defense retains current committed attack");
                    Equal(model.CommittedCannonDamage, 30, "Defense retains frozen deployment attack");
                    Equal(model.CurrentLauncherDamage, 12, "Defense retains auxiliary attack");
                    int afterHull = model.Hull;
                    RefusedPurchase(ledger, intent, "StaleVersion");
                    Require(ApplyLedgerDefense(model, ledger), "An unchanged current defense projection is admissible.");
                    Equal(model.Hull, afterHull, "Repeated unchanged maximum cannot heal or replay capacity gain");
                    Console.Error.WriteLine("WITNESS capacity P=" + permanent + " n=" + n + " fitting=" + launcher +
                        " hull=" + beforeHull + "->" + model.Hull + " max=" + AppliedMaximumHull(model));
                }
                Require(applied, "Playable model admits actual defense projection.");
                FillToCap(ledger, 2);
                ApplyLedgerDefense(model, ledger);
                RefusedPurchase(ledger, PurchaseIntent(ledger, 2), "AtCap");
                int cappedHull = model.Hull;
                Require(ApplyLedgerDefense(model, ledger), "Cap refresh retains the current projection.");
                Equal(model.Hull, cappedHull, "Cap refusal cannot add hull");
            }

        var full = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        Require(ApplyDefense(full, Effects[2][1], rawHit => rawHit), "Full-hull capacity projects successfully.");
        Equal(full.Hull, 135, "A full tank gains exactly the new capacity");
        SetEncounterValue(full, "Hull", 137); // Controlled overfull input exercises clamp.
        Require(ApplyDefense(full, Effects[2][2], rawHit => rawHit), "Next projected maximum is applied.");
        Equal(full.Hull, 150, "Current hull clamps to the new maximum instead of over-healing");

        var repair = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        Require(ApplyDefense(repair, Effects[2][3], rawHit => rawHit), "Repair fitting receives dynamic capacity.");
        SetEncounterValue(repair, "Hull", 164);
        while (repair.Tick < 20) repair.Step();
        Equal(repair.Hull, 165, "Existing repair clamps against applied dynamic maximum");
        Equal(repair.Restored, 1, "Existing three-hull repair restores only the missing one hull");
        int repaired = repair.Hull;
        while (repair.Tick < 40) repair.Step();
        Equal(repair.Hull, repaired, "Full upgraded hull cannot be reduced by a negative constant-cap repair");
        Equal(EncounterModel.RepairAmount, 3, "This unit preserves the original repair amount");
        CheckDefenseAdmission();
        CheckDefenseCompatibility();
    }

    static void DefenseArmorCloseAndRangedHits()
    {
        foreach (bool launcher in new[] { false, true })
            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var ledger = ActualLedger(131, launcher, new[] { 0, 0, 0, permanent, 0, 0 });
                Call(ledger, "ObserveAuthoritativeKills", 100);
                var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
                bool applied = false;
                for (int n = 0; n <= 8 - permanent; n++)
                {
                    if (n > 0) Equal(Get(Call(ledger, "TryPurchase", PurchaseIntent(ledger, 3)), "Accepted"), true,
                        "Actual armor intent purchases its independent next level");
                    string before = model.Snapshot(), events = EventFingerprint(model);
                    applied = ApplyLedgerDefense(model, ledger);
                    Equal(model.Snapshot(), before, "Armor projection cannot change hull, shots or current tick");
                    Equal(EventFingerprint(model), events, "Armor projection retains previously emitted events");
                    foreach (FoeKind kind in new[] { FoeKind.Close, FoeKind.Ranged })
                        foreach (int rawHit in new[] { 1, 4, 20 })
                        {
                            SetEncounterValue(model, "Hull", 120); // Isolate each real incoming hit from prior damage.
                            var hit = EnemyHit(model, kind, rawHit, out int hullBefore);
                            Equal(hit.Amount, Math.Max(1, rawHit - permanent - n), "Actual armored " + kind + " damage P=" + permanent + " n=" + n + " raw=" + rawHit);
                            Equal(hit.Amount, Call(ActualTracks()[3], "EffectAt", permanent + n, rawHit), "Real enemy damage uses the same authoritative catalog projection");
                            Require(model.Hull < hullBefore && hit.Amount >= 1, "Armor cannot make an actual enemy hit immune.");
                            Equal(AppliedMaximumHull(model), 120, "Armor alone cannot increase capacity");
                            Console.Error.WriteLine("WITNESS armor P=" + permanent + " n=" + n + " fitting=" + launcher +
                                " kind=" + kind + " raw=" + rawHit + " applied=" + hit.Amount + " hull=" + hullBefore + "->" + model.Hull);
                        }
                }
                Require(applied, "Playable source admits captured catalog armor effects.");
            }

        var capturedLedger = ActualLedger(132, true, new int[6]);
        Call(capturedLedger, "ObserveAuthoritativeKills", 2);
        var captured = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        Require(ApplyLedgerDefense(captured, capturedLedger), "Capture current zero-level armor.");
        Equal(Get(Call(capturedLedger, "TryPurchase", PurchaseIntent(capturedLedger, 3)), "Accepted"), true, "Ledger can advance after the captured projection");
        Equal(EnemyHit(captured, FoeKind.Close, 4, out _).Amount, 4, "Mutable ledger growth cannot retroactively alter captured armor");
        Require(ApplyLedgerDefense(captured, capturedLedger), "Fresh projection applies the new immutable armor level.");
        Equal(EnemyHit(captured, FoeKind.Ranged, 4, out _).Amount, 3, "Future actual hit consumes newly applied catalog armor");
        foreach (FoeKind kind in new[] { FoeKind.Close, FoeKind.Ranged })
        {
            var capped = new EncounterModel(true, EncounterProfile.PlayablePrototype);
            var definition = ActualTracks()[3];
            Require(ApplyDefense(capped, 120, rawHit => (int)Call(definition, "EffectAt", 8, rawHit)), "Cap-level armor admits.");
            SetEncounterValue(capped, "Hull", 2);
            var hit = EnemyHit(capped, kind, 20, out _);
            Equal(hit.Amount, 2, "Enemy event caps actual damage to remaining hull");
            Equal(capped.Hull, 0, "Armored enemy hit can still defeat the tank");
            Equal(capped.Status, EncounterStatus.Defeated, "Actual terminal defeat follows capped hull loss");
        }
    }

    static void CheckDefenseAdmission()
    {
        var model = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        var armor = ActualTracks()[3];
        Require(ApplyDefense(model, 135, rawHit => (int)Call(armor, "EffectAt", 3, rawHit)), "Valid defense pair applies atomically.");
        foreach (int invalid in new[] { -1, 0, 119, 120, int.MinValue })
        {
            string before = model.Snapshot(), events = EventFingerprint(model);
            Require(!ApplyDefense(model, invalid, rawHit => rawHit), "Invalid or decreasing maximum refuses atomically.");
            Equal(AppliedMaximumHull(model), 135, "Invalid maximum preserves applied maximum");
            Equal(model.Snapshot(), before, "Invalid maximum cannot partially change hull");
            Equal(EventFingerprint(model), events, "Invalid maximum preserves events");
            Equal(EnemyHit(model, FoeKind.Close, 4, out _).Amount, 1, "Invalid maximum preserves previously applied armor");
        }
        foreach (Func<int, int> invalidHit in new Func<int, int>[] { null, rawHit => 0, rawHit => -1, rawHit => int.MaxValue })
        {
            string before = model.Snapshot(), events = EventFingerprint(model);
            Require(!ApplyDefense(model, 150, invalidHit), "Invalid hit projection refuses before any capacity change.");
            Equal(AppliedMaximumHull(model), 135, "Invalid hit projection cannot partially publish maximum");
            Equal(model.Snapshot(), before, "Invalid hit projection cannot partially heal hull");
            Equal(EventFingerprint(model), events, "Invalid hit projection preserves emitted events");
            Equal(EnemyHit(model, FoeKind.Ranged, 4, out _).Amount, 1, "Invalid hit projection retains previously applied armor");
        }
        foreach (bool launcher in new[] { false, true })
            foreach (bool limit in new[] { false, true })
            {
                var ended = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
                if (limit) { SetEncounterValue(ended, "Tick", ended.Profile.Horizon - 1); ended.Step(); }
                else while (ended.Status == EncounterStatus.Running) ended.Step();
                Equal(ended.Status, limit ? EncounterStatus.Limit : EncounterStatus.Defeated, "Terminal fixture exercises the requested actual status");
                string before = ended.Snapshot(), events = EventFingerprint(ended);
                Require(!ApplyDefense(ended, 135, rawHit => (int)Call(armor, "EffectAt", 8, rawHit)), "Terminal model refuses defense and cannot revive.");
                Equal(AppliedMaximumHull(ended), 120, "Terminal refusal preserves maximum");
                ended.Step();
                Equal(ended.Snapshot(), before, "Terminal defense cannot heal, advance or alter frozen encounter");
                Equal(EventFingerprint(ended), events, "Terminal defense retains final event evidence");
            }
    }

    static void CheckDefenseCompatibility()
    {
        foreach (var profile in new[] { EncounterProfile.Legacy, EncounterProfile.VisualReview })
            foreach (bool launcher in new[] { false, true })
            {
                var model = new EncounterModel(launcher, profile);
                Require(!ApplyDefense(model, 240, rawHit => 1), "Shared profiles refuse playable defense effects.");
                Equal(AppliedMaximumHull(model), 120, "Shared profiles retain the existing maximum");
            }
        CheckAttackCompatibility(); // Original pinned shared byte fixtures and constructor assertions unchanged.
        foreach (bool launcher in new[] { false, true })
        {
            var ledger = ActualLedger(141, launcher, new int[6]);
            var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            var control = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            Require(ApplyLedgerDefense(model, ledger), "Zero defense levels admit identity effects.");
            // Natural baseline runs can kill ranged foes before they attack.
            // Seed both real hit types identically without relaxing the oracle.
            foreach (FoeKind kind in new[] { FoeKind.Close, FoeKind.Ranged })
            {
                EnemyHit(model, kind, 4, out _);
                EnemyHit(control, kind, 4, out _);
                Equal(model.Snapshot(), control.Snapshot(), "Zero-defense controlled hits retain baseline bytes");
                Equal(EventFingerprint(model), EventFingerprint(control), "Zero-defense controlled hits retain baseline events");
            }
            while (model.Status == EncounterStatus.Running)
            {
                model.Step(); control.Step();
                Equal(model.Snapshot(), control.Snapshot(), "Zero-level playable defense preserves complete baseline combat");
                Equal(EventFingerprint(model), EventFingerprint(control), "Zero-level playable defense preserves every event");
            }
            Require(model.CloseHits > 0 && model.RangedHits > 0, "Zero-level parity observes both actual enemy hit types.");
            Console.Error.WriteLine("WITNESS zero-defense complete playable parity fitting=" + launcher + " " + model.Summary);
        }
    }

    // Reflection permits behavioral RED against the actual pre-T06 model.
    // No replacement cadence or simulated shot is supplied if the seam is absent.
    static bool ApplyCycle(EncounterModel model, int period)
    {
        var method = typeof(EncounterModel).GetMethod("TryApplyPlayableCannonPeriodProjection");
        if (method == null) return false;
        try { return (bool)method.Invoke(model, new object[] { period }); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }

    static bool ApplyLedgerCycle(EncounterModel model, object ledger)
    {
        int level = (int)Get(LedgerTrack(ledger, 4), "CurrentLevel");
        int period = (int)Call(ActualTracks()[4], "EffectAt", level, 1);
        string before = model.Summary, events = EventFingerprint(model);
        bool result = ApplyCycle(model, period);
        Equal(model.Summary, before, "Cycle projection cannot advance, shoot, damage, heal or grant a kill");
        Equal(EventFingerprint(model), events, "Cycle projection retains the already emitted events");
        return result;
    }

    static int AppliedCannonPeriod(EncounterModel model)
    {
        var property = typeof(EncounterModel).GetProperty("CurrentCannonPeriod");
        return property == null ? EncounterModel.CannonPeriod : (int)property.GetValue(model);
    }

    static int CannonDue(EncounterModel model) => Int32.Parse(model.Snapshot().Split('|')[11]);

    static void CycleFutureScheduleAndNextTick()
    {
        foreach (bool launcher in new[] { false, true })
        {
            // Purchase one tick before the newly due shot, using a real accepted intent.
            var beforeLedger = ActualLedger(151, launcher, new int[6]);
            Call(beforeLedger, "ObserveAuthoritativeKills", 100); // Funds fixture, not runtime income.
            var beforeShot = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            DurableTarget(beforeShot, 22050);
            ShotAt(beforeShot, EncounterEventKind.Cannon, 2, out _);
            while (beforeShot.Tick < 20) beforeShot.Step();
            var intent = PurchaseIntent(beforeLedger, 4);
            Equal(Get(Call(beforeLedger, "TryPurchase", intent), "Accepted"), true, "Before-shot Cycle purchase admits");
            ApplyLedgerCycle(beforeShot, beforeLedger);
            var earlier = ShotAt(beforeShot, EncounterEventKind.Cannon, 21, out _);
            Equal(earlier.Amount, 20, "Cycle changes timing while preserving real cannon damage");
            Equal(AppliedCannonPeriod(beforeShot), 19, "Applied period is the catalog level-one value");
            RefusedPurchase(beforeLedger, intent, "StaleVersion");
            string replayBefore = beforeShot.Snapshot();
            Require(ApplyLedgerCycle(beforeShot, beforeLedger), "Current unchanged Cycle projection admits");
            Equal(beforeShot.Snapshot(), replayBefore, "Replay cannot alter the current cadence schedule");

            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var ledger = ActualLedger(152, launcher, new[] { 0, 0, 0, 0, permanent, 0 });
                Call(ledger, "ObserveAuthoritativeKills", 100);
                var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
                DurableTarget(model, 22050);
                bool applied = ApplyLedgerCycle(model, ledger);
                ShotAt(model, EncounterEventKind.Cannon, 2, out _);
                for (int n = 0; n <= 8 - permanent; n++)
                {
                    if (n > 0)
                    {
                        var result = Call(ledger, "TryPurchase", PurchaseIntent(ledger, 4));
                        Equal(Get(result, "Accepted"), true, "After-shot Cycle purchase admits one real level");
                        Equal(Get(result, "ChargedScrap"), 5 * n, "Cycle price stays owned by the ledger");
                    }
                    applied = ApplyLedgerCycle(model, ledger);
                    int period = Effects[4][permanent + n], lastShot = model.Tick, due = lastShot + period;
                    while (model.Tick < lastShot + period / 2) model.Step();
                    string noOpBefore = model.Snapshot();
                    ApplyLedgerCycle(model, ledger);
                    Equal(model.Snapshot(), noOpBefore, "Unchanged projection cannot postpone the next shot");
                    var shot = ShotAt(model, EncounterEventKind.Cannon, due, out _);
                    Equal(shot.Amount, 20, "Every actual Cycle interval retains attack damage");
                    Equal(AppliedCannonPeriod(model), period, "Actual period follows catalog P+n for every level");
                    Console.Error.WriteLine("WITNESS cycle P=" + permanent + " n=" + n + " fitting=" + launcher +
                        " last=" + lastShot + " shot=" + model.Tick + " period=" + period);
                }
                Require(applied, "Playable model admits the numeric catalog period");
                FillToCap(ledger, 4);
                RefusedPurchase(ledger, PurchaseIntent(ledger, 4), "AtCap");
            }

            // Shortening below elapsed time never fires during projection or rewrites history.
            var overdueLedger = ActualLedger(153, launcher, new int[6]);
            Call(overdueLedger, "ObserveAuthoritativeKills", 100);
            var overdue = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            DurableTarget(overdue, 22050);
            ShotAt(overdue, EncounterEventKind.Cannon, 2, out _);
            while (overdue.Tick < 21) overdue.Step();
            for (int n = 1; n <= 8; n++)
            {
                Equal(Get(Call(overdueLedger, "TryPurchase", PurchaseIntent(overdueLedger, 4)), "Accepted"), true,
                    "Several current intents can shorten an already elapsed period");
                ApplyLedgerCycle(overdue, overdueLedger);
            }
            Equal(overdue.CannonShots, 1, "Shortening creates no retroactive or same-tick burst");
            Equal(CannonDue(overdue), 22, "Shortened overdue schedule floors at the next admitted tick");
            ShotAt(overdue, EncounterEventKind.Cannon, 22, out _);
            ShotAt(overdue, EncounterEventKind.Cannon, 34, out _);
            Equal(overdue.CannonShots, 3, "Past-due shortening emits exactly one shot at each future interval");
            Console.Error.WriteLine("WITNESS overdue fitting=" + launcher + " purchasedAt=21 shots=2,22,34 floor=22");

            // No actual shot yet: projection must leave initial eligibility intact.
            var idle = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            var idleTarget = DurableTarget(idle, 25000);
            while (idle.Tick < 40) { idleTarget.Distance = 25000; idle.Step(); }
            Equal(idle.CannonShots, 0, "Unavailable targets do not count as actual cannon shots");
            Require(ApplyCycle(idle, 12), "First-shot fixture admits the catalog cap period");
            Equal(CannonDue(idle), 1, "Period projection before any actual shot preserves first-shot eligibility");
            idleTarget.Distance = 22050;
            ShotAt(idle, EncounterEventKind.Cannon, 41, out _);
            ShotAt(idle, EncounterEventKind.Cannon, 53, out _);

            // Refreshing an unchanged overdue period cannot move its original eligibility.
            var noTarget = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            var hiddenTarget = DurableTarget(noTarget, 22050);
            ShotAt(noTarget, EncounterEventKind.Cannon, 2, out _);
            while (noTarget.Tick < 25) { hiddenTarget.Distance = 25000; noTarget.Step(); }
            string unchanged = noTarget.Snapshot();
            for (int refresh = 0; refresh < 3; refresh++)
            {
                Require(ApplyCycle(noTarget, 20), "Unchanged baseline period is admissible");
                Equal(noTarget.Snapshot(), unchanged, "Unchanged overdue refresh preserves complete schedule");
            }
            hiddenTarget.Distance = 22050;
            ShotAt(noTarget, EncounterEventKind.Cannon, 26, out _);
        }
        CheckCycleAdmission();
    }

    static void CheckCycleAdmission()
    {
        var model = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        Require(ApplyCycle(model, 17), "Valid numeric period admits");
        foreach (int invalid in new[] { 0, -1, 21, int.MinValue, int.MaxValue })
        {
            string before = model.Snapshot(), events = EventFingerprint(model);
            Require(!ApplyCycle(model, invalid), "Invalid numeric period refuses atomically");
            Equal(AppliedCannonPeriod(model), 17, "Invalid period retains prior cadence");
            Equal(model.Snapshot(), before, "Invalid period preserves complete model");
            Equal(EventFingerprint(model), events, "Invalid period preserves events");
        }
        foreach (bool launcher in new[] { false, true })
            foreach (bool limit in new[] { false, true })
            {
                var ended = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
                if (limit) { SetEncounterValue(ended, "Tick", ended.Profile.Horizon - 1); ended.Step(); }
                else while (ended.Status == EncounterStatus.Running) ended.Step();
                Equal(ended.Status, limit ? EncounterStatus.Limit : EncounterStatus.Defeated, "Actual Cycle terminal fixture");
                string before = ended.Snapshot(), events = EventFingerprint(ended);
                Require(!ApplyCycle(ended, 12), "Terminal model refuses cadence effects");
                Equal(AppliedCannonPeriod(ended), 20, "Terminal refusal preserves baseline period");
                ended.Step();
                Equal(ended.Snapshot(), before, "Terminal Cycle effect cannot revive or advance");
                Equal(EventFingerprint(ended), events, "Terminal Cycle effect retains final events");
            }
    }

    static void CycleClockTo(EncounterModel model, object ledger, LastStandRunClock clock, int until,
        int[] partitions, List<int> shots)
    {
        int index = 0;
        while (model.Tick < until)
        {
            int boundary = Math.Min(until, model.Tick + partitions[index++ % partitions.Length]);
            Require(clock.Observe(boundary * LastStandRunClock.StepSeconds), "Actual clock admits callback timestamp");
            while (clock.TryTakeStep())
            {
                int before = model.CannonShots;
                model.Step();
                Call(ledger, "ObserveAuthoritativeKills", model.Kills);
                Equal(model.CannonShots - before <= 1, true, "Each admitted tick emits at most one cannon shot");
                if (model.CannonShots != before) shots.Add(model.Tick);
            }
            Equal(model.Tick, boundary, "Each bounded callback drains exactly its admitted ticks");
            Equal(clock.CatchingUp, false, "Purchases use settled old-stat clock boundaries");
        }
    }

    static void CyclePartitionAndLegacyParity()
    {
        foreach (bool launcher in new[] { false, true })
        {
            string final = null, ledgerFinal = null, shotFinal = null;
            foreach (var partitions in new[] { new[] { 1 }, new[] { 3, 13, 5, 29, 7, 61 }, new[] { 128, 1, 43, 2 } })
            {
                var ledger = ActualLedger(161, launcher, new[] { 0, 0, 0, 0, 3, 0 });
                Call(ledger, "ObserveAuthoritativeKills", 100); // Identical admitted funding fixture.
                var model = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
                DurableTarget(model, 22050);
                ApplyLedgerCycle(model, ledger);
                var clock = new LastStandRunClock(.05, model.Profile.Horizon - 1);
                var shots = new List<int>();
                CycleClockTo(model, ledger, clock, 20, partitions, shots);
                Equal(String.Join(",", shots), "2,19", "P3 actual shots occur at ticks2 and19 before purchase");
                var intent = PurchaseIntent(ledger, 4);
                Equal(Get(Call(ledger, "TryPurchase", intent), "Accepted"), true, "Settled callback boundary admits Cycle purchase");
                Require(ApplyLedgerCycle(model, ledger), "Accepted callback purchase projects its numeric effect");
                RefusedPurchase(ledger, intent, "StaleVersion");
                CycleClockTo(model, ledger, clock, 137, partitions, shots);
                Equal(String.Join(",", shots), "2,19,35,51,67,83,99,115,131", "New cadence starts from the last real shot across callbacks");
                Equal(Get(Call(ledger, "TryPurchase", PurchaseIntent(ledger, 4)), "Accepted"), true, "Second settled Cycle purchase admits");
                Require(ApplyLedgerCycle(model, ledger), "Second callback purchase changes future numeric period");
                CycleClockTo(model, ledger, clock, 300, partitions, shots);
                Equal(shots[9], 146, "Second changed interval retains the actual last-shot anchor");
                string sequence = String.Join(",", shots);
                if (final == null) { final = model.Snapshot(); ledgerFinal = TransactionFingerprint(ledger); shotFinal = sequence; }
                Equal(model.Snapshot(), final, "Equivalent callback partitions preserve complete actual combat");
                Equal(TransactionFingerprint(ledger), ledgerFinal, "Equivalent callbacks preserve all tracks and currency");
                Equal(sequence, shotFinal, "Equivalent callbacks preserve every real cannon shot tick");
                Console.Error.WriteLine("WITNESS partition fitting=" + launcher + " callbacks=" + String.Join(",", partitions) + " shots=" + sequence);
            }
            var ledgerZero = ActualLedger(162, launcher, new int[6]);
            var zero = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            var control = new EncounterModel(launcher, EncounterProfile.PlayablePrototype);
            Require(ApplyLedgerCycle(zero, ledgerZero), "Zero-level cadence projection is admissible");
            while (zero.Status == EncounterStatus.Running)
            {
                zero.Step(); control.Step();
                Require(ApplyLedgerCycle(zero, ledgerZero) || zero.Status != EncounterStatus.Running, "Running zero refresh admits");
                Equal(zero.Snapshot(), control.Snapshot(), "Zero Cycle projection retains entire playable baseline run");
                Equal(EventFingerprint(zero), EventFingerprint(control), "Zero Cycle projection retains every baseline event");
            }
            Equal(zero.Restored, control.Restored, "Cycle retains existing repair amounts and cadence");
            Equal(zero.LauncherShots, control.LauncherShots, "Cycle retains auxiliary shot timing");
        }
        foreach (var profile in new[] { EncounterProfile.Legacy, EncounterProfile.VisualReview })
            foreach (bool launcher in new[] { false, true })
            {
                var shared = new EncounterModel(launcher, profile);
                string before = shared.Snapshot();
                Require(!ApplyCycle(shared, 12), "Shared profiles refuse playable cadence effects");
                Equal(shared.Snapshot(), before, "Shared refusal preserves complete default snapshot");
                Equal(AppliedCannonPeriod(shared), 20, "Shared profile retains original period");
            }
        CheckAttackCompatibility(); // All existing pinned Legacy/VisualReview bytes remain authoritative.
    }

    // Test-only absent-seam fallback observes real unchanged compiled repairs for RED.
    static bool ApplyRepair(EncounterModel model, int amount)
    {
        var method = typeof(EncounterModel).GetMethod("TryApplyPlayableRepairProjection");
        if (method == null) return false;
        try { return (bool)method.Invoke(model, new object[] { amount }); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }

    static int AppliedRepairAmount(EncounterModel model)
    {
        var property = typeof(EncounterModel).GetProperty("CurrentRepairAmount");
        return property == null ? EncounterModel.RepairAmount : (int)property.GetValue(model);
    }

    static bool ApplyLedgerRepair(EncounterModel model, object ledger)
    {
        int level = (int)Get(LedgerTrack(ledger, 5), "CurrentLevel");
        int amount = (int)Call(ActualTracks()[5], "EffectAt", level, 1);
        string before = model.Snapshot(), events = EventFingerprint(model);
        bool result = ApplyRepair(model, amount);
        Equal(model.Snapshot(), before, "Repair projection cannot heal, step, shoot or rewrite the existing cadence");
        Equal(EventFingerprint(model), events, "Repair projection preserves already emitted outcomes");
        return result;
    }

    static void RepairAt(EncounterModel model, int due, int expected, string claim)
    {
        Require(model.Tick < due, "Repair witness advances only future actual ticks");
        int hull = model.Hull, restored = model.Restored;
        while (model.Tick < due)
        {
            model.Step();
            int count = 0, amount = 0;
            foreach (var outcome in model.Events)
                if (outcome.Kind == EncounterEventKind.Repair)
                {
                    count++; amount += outcome.Amount;
                    Equal(outcome.Slot, -1, "Repair event belongs to the player hull");
                    Equal(outcome.Killed, false, "Repair cannot grant a kill");
                }
            if (model.Tick < due)
            {
                Equal(count, 0, "No repair event before its unchanged twenty-tick cadence");
                Equal(model.Hull, hull, "Repair cannot heal before its due tick");
                Equal(model.Restored, restored, "Repair cannot count restored hull before its due tick");
            }
            else
            {
                Equal(model.Hull - hull, expected, claim);
                Equal(model.Restored - restored, expected, "Restored counts the exact actual hull gain");
                Equal(amount, expected, "Repair event reports the exact actual hull gain");
                Equal(count, expected > 0 ? 1 : 0, "Exactly one useful repair event, none at full hull");
            }
        }
    }

    static void RepairAmountAndMaximum()
    {
        for (int permanent = 0; permanent <= 3; permanent++)
        {
            var ledger = ActualLedger(171, false, new[] { 0, 0, 3, 0, 0, permanent });
            Call(ledger, "ObserveAuthoritativeKills", 100); // Funds fixture, not runtime income.
            var model = new EncounterModel(false, EncounterProfile.PlayablePrototype);
            Require(ApplyLedgerDefense(model, ledger), "Repair uses the existing catalog capacity projection");
            bool applied = false;
            for (int n = 0; n <= 8 - permanent; n++)
            {
                if (n > 0)
                {
                    var intent = PurchaseIntent(ledger, 5);
                    var result = Call(ledger, "TryPurchase", intent);
                    Equal(Get(result, "Accepted"), true, "Actual repair intent increments one independent level");
                    Equal(Get(result, "ChargedScrap"), 5 * n, "Repair consumes its independent pre-purchase price");
                    RefusedPurchase(ledger, intent, "StaleVersion");
                }
                SetEncounterValue(model, "Hull", AppliedMaximumHull(model) - 30);
                applied = ApplyLedgerRepair(model, ledger);
                int due = model.Tick + 20;
                RepairAt(model, due, Effects[5][permanent + n], "Actual repair amount follows catalog P+n");
                Equal(AppliedRepairAmount(model), Effects[5][permanent + n], "Model retains the captured catalog repair amount");
                Equal(AppliedMaximumHull(model), 165, "Repair amount does not change capacity");
                Equal(model.CurrentCannonDamage, 20, "Repair leaves cannon attack unchanged");
                Equal(model.CurrentLauncherDamage, 12, "Repair leaves auxiliary attack unchanged");
                Console.Error.WriteLine("WITNESS repair P=" + permanent + " n=" + n + " tick=" + model.Tick +
                    " restored=" + Effects[5][permanent + n] + " hull=" + model.Hull + " max=" + AppliedMaximumHull(model));
            }
            Require(applied, "Repair fitting admits the numeric catalog amount");
            FillToCap(ledger, 5);
            ApplyLedgerRepair(model, ledger);
            RefusedPurchase(ledger, PurchaseIntent(ledger, 5), "AtCap");
            string capped = model.Snapshot();
            Require(ApplyLedgerRepair(model, ledger), "Unchanged capped repair projection remains admissible");
            Equal(model.Snapshot(), capped, "Cap refusal and refresh cannot heal or move the repair schedule");
        }

        // Every dynamic maximum is measured on actual hull, at near-full and full boundaries.
        for (int capacity = 0; capacity <= 8; capacity++)
        {
            int permanent = Math.Min(capacity, 3);
            var ledger = ActualLedger(172, false, new[] { 0, 0, permanent, 0, 0, 3 });
            Call(ledger, "ObserveAuthoritativeKills", 100);
            for (int n = 1; n <= capacity - permanent; n++)
            {
                var result = Call(ledger, "TryPurchase", PurchaseIntent(ledger, 2));
                Equal(Get(result, "Accepted"), true, "Actual capacity intent supplies the current repair maximum");
                Equal(Get(result, "ChargedScrap"), 5 * n, "Capacity prices stay independent from repair P");
            }
            var model = new EncounterModel(false, EncounterProfile.PlayablePrototype);
            Require(ApplyLedgerDefense(model, ledger), "Catalog capacity projects before actual repair");
            ApplyLedgerRepair(model, ledger);
            int maximum = Effects[2][capacity];
            Equal(AppliedMaximumHull(model), maximum, "Repair observes the current dynamic maximum");
            SetEncounterValue(model, "Hull", maximum - 1);
            RepairAt(model, 20, 1, "Repair clamps against the current dynamic maximum");
            Equal(model.Hull, maximum, "Near-full repaired hull equals the current maximum");
            RepairAt(model, 40, 0, "Full hull cannot be overhealed or reduced");
            SetEncounterValue(model, "Hull", maximum - 7);
            for (int n = 1; n <= 5; n++)
                Equal(Get(Call(ledger, "TryPurchase", PurchaseIntent(ledger, 5)), "Accepted"), true,
                    "Real repair purchases can reach total eight after capacity purchases");
            ApplyLedgerRepair(model, ledger);
            // Purchase at tick40 neither heals immediately nor adds a repair at tick41.
            RepairAt(model, 60, 7, "Cap repair restores only missing hull after future ticks");
            Equal(AppliedRepairAmount(model), 11, "Total repair level eight supplies eleven hull per period");
            Console.Error.WriteLine("WITNESS repair clamp capacityL=" + capacity + " max=" + maximum +
                " ticks=20,40,60 restored=1,0,7");
        }
    }

    static void RepairFittingAndTerminalRefusal()
    {
        var repairLedger = ActualLedger(181, false, new[] { 0, 0, 0, 0, 0, 3 });
        Call(repairLedger, "ObserveAuthoritativeKills", 100);
        for (int n = 1; n <= 5; n++)
            Equal(Get(Call(repairLedger, "TryPurchase", PurchaseIntent(repairLedger, 5)), "Accepted"), true,
                "Repair fitting admits its actual run purchase");
        var repair = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        SetEncounterValue(repair, "Hull", 80);
        ApplyLedgerRepair(repair, repairLedger);
        RepairAt(repair, 20, 11, "Repair fitting receives the real capped catalog amount");

        var launcherLedger = ActualLedger(182, true, new[] { 0, 0, 0, 0, 0, 3 });
        Call(launcherLedger, "ObserveAuthoritativeKills", 100);
        RefusedPurchase(launcherLedger, PurchaseIntent(launcherLedger, 5), "WrongFitting");
        var launcher = new EncounterModel(true, EncounterProfile.PlayablePrototype);
        SetEncounterValue(launcher, "Hull", 80);
        string launcherBefore = launcher.Snapshot(), launcherEvents = EventFingerprint(launcher);
        Require(!ApplyRepair(launcher, 11), "Launcher model refuses repair projection");
        Equal(launcher.Snapshot(), launcherBefore, "Wrong fitting cannot mutate real combat");
        Equal(EventFingerprint(launcher), launcherEvents, "Wrong fitting preserves emitted events");
        Equal(AppliedRepairAmount(launcher), 3, "Wrong fitting retains baseline repair amount");
        RepairAt(launcher, 20, 0, "Launcher fitting cannot apply repair on an actual due tick");
        Require(launcher.LauncherShots > 0, "Launcher continues its real independent shots");

        foreach (int invalid in new[] { 2, 0, -1, int.MinValue })
        {
            string before = repair.Snapshot(), events = EventFingerprint(repair);
            Require(!ApplyRepair(repair, invalid), "Invalid numeric repair amount refuses atomically");
            Equal(AppliedRepairAmount(repair), 11, "Invalid repair preserves the previously applied amount");
            Equal(repair.Snapshot(), before, "Invalid repair preserves complete model state");
            Equal(EventFingerprint(repair), events, "Invalid repair preserves emitted events");
        }

        foreach (bool limit in new[] { false, true })
        {
            var ended = new EncounterModel(false, EncounterProfile.PlayablePrototype);
            Require(ApplyRepair(ended, 11), "Running repair fixture applies before reaching a real terminal outcome");
            if (limit) { SetEncounterValue(ended, "Tick", ended.Profile.Horizon - 1); ended.Step(); }
            else while (ended.Status == EncounterStatus.Running) ended.Step();
            Equal(ended.Status, limit ? EncounterStatus.Limit : EncounterStatus.Defeated, "Actual repair terminal fixture");
            string before = ended.Snapshot(), events = EventFingerprint(ended);
            Require(!ApplyRepair(ended, 10), "Terminal model refuses repair effects");
            Equal(AppliedRepairAmount(ended), 11, "Terminal repair refusal preserves its final amount");
            ended.Step();
            Equal(ended.Snapshot(), before, "Terminal repair cannot heal, revive or advance");
            Equal(EventFingerprint(ended), events, "Terminal repair retains final emitted events");
            if (!limit) Equal(ended.Hull, 0, "Defeated repair run remains at zero hull");
        }

        foreach (var profile in new[] { EncounterProfile.Legacy, EncounterProfile.VisualReview })
            foreach (bool hasLauncher in new[] { false, true })
            {
                var shared = new EncounterModel(hasLauncher, profile);
                string before = shared.Snapshot();
                Require(!ApplyRepair(shared, 11), "Shared profiles refuse playable repair effects");
                Equal(shared.Snapshot(), before, "Shared refusal preserves complete default snapshot");
                Equal(AppliedRepairAmount(shared), 3, "Shared profile keeps the original repair amount");
            }
        var zeroLedger = ActualLedger(183, false, new int[6]);
        var zero = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        var control = new EncounterModel(false, EncounterProfile.PlayablePrototype);
        Require(ApplyLedgerRepair(zero, zeroLedger), "Zero repair level projects the original amount");
        while (zero.Status == EncounterStatus.Running)
        {
            zero.Step(); control.Step();
            Equal(zero.Snapshot(), control.Snapshot(), "Zero repair levels preserve the complete actual baseline run");
            Equal(EventFingerprint(zero), EventFingerprint(control), "Zero repair levels preserve every original event");
        }
        Equal(EncounterModel.RepairPeriod, 20, "Repair projection preserves the original twenty-tick period");
        Equal(EncounterModel.RepairAmount, 3, "Original repair baseline constant remains unchanged");
        CheckAttackCompatibility(); // Preserve all original pinned shared byte fixtures and constructor assertions.
    }

    // T14 exercises only actual production owners and their immutable projection.
    // Missing projection behavior is asserted after the original sources compile.
    static object Presentation(string methodName, object owner, bool launcher = true)
    {
        var type = typeof(MechanicsShopTrack).Assembly.GetType("SingedTerra.LastStand.LastStandShopPresentation");
        Require(type != null, "Actual production supplies no immutable six-card run/permanent shop presentation.");
        var method = type.GetMethod(methodName, BindingFlags.Public | BindingFlags.Static);
        Require(method != null, "Actual presentation supplies " + methodName);
        return methodName == "ProjectRun" ? CallStatic(method, owner, LastStandBulkQuantity.One) :
            CallStatic(method, owner, launcher ? LastStandFitting.Launcher : LastStandFitting.Repair, LastStandBulkQuantity.One);
    }

    static object[] PresentationCards(object view)
    {
        var cards = (IList)Get(view, "Cards");
        Require(cards.IsReadOnly, "The card collection cannot be replaced or reordered.");
        Equal(cards.Count, Text(view,"Mode") == "Permanent" ? 10 : 7, "Permanent uses current roster; historical run retains its seven tracks");
        Equal(Get(cards[6], "Key"), "scattergunAttack", "Appended card preserves existing ordering");
        if (cards.Count == 10) Equal(Get(cards[7], "Key"), "scrapYield", "Current permanent view includes Scrap Yield");
        var result = new object[cards.Count];
        cards.CopyTo(result, 0);
        var immutableItems = new List<object>(result); immutableItems.Add(view);
        foreach (object item in immutableItems)
        {
            foreach (var property in item.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
                Require(property.GetSetMethod() == null, "Presentation exposes no public setter: " + property.Name);
            foreach (var field in item.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
                Require(field.IsInitOnly, "Presentation exposes no mutable public field: " + field.Name);
            foreach (var field in item.GetType().GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance))
                Require(!typeof(Delegate).IsAssignableFrom(field.FieldType) && field.FieldType != typeof(LastStandShopState) &&
                    field.FieldType != typeof(LastStandProgression) && field.FieldType != typeof(MechanicsShopTrack),
                    "Copied presentation retains no callback or mutable owner: " + field.Name);
        }
        Array.Resize(ref result, 6); // Preserve original card oracles; new fitting has dedicated wave tests.
        return result;
    }

    static string PresentationFingerprint(object view)
    {
        string result = Text(view, "Mode") + "|" + Text(view, "Currency") + "|" + Get(view, "CurrencyName") +
            "|" + Get(view, "Balance") + "|" + Get(view, "RunId") + "|" + Get(view, "Version") +
            "|" + Get(view, "Lifecycle") + "|" + Get(view, "Fitting") + "|" + Get(view, "SaveState") + "|" + Get(view, "SaveError");
        foreach (var card in PresentationCards(view))
            foreach (var name in new[] { "TrackId", "Key", "Name", "Category", "Applicability", "PermanentLevel", "RunPurchases",
                "CurrentLevel", "Cap", "RemainingPurchases", "NextPrice", "PriceDescription", "CurrentEffectDescription",
                "NextEffectDescription", "Refusal", "Reason", "CanPurchase", "AppliesToFitting", "IsDormant" })
                result += "|" + Get(card, name);
        return result;
    }

    static void PresentationCard(object card, int index, int permanent, int purchases, bool permanentMode, bool launcher)
    {
        var definition=permanentMode ? LastStandUpgradeCatalog.Get((LastStandUpgradeTrackId)index) : LegacyDefinition((LastStandUpgradeTrackId)index);
        int level = permanent + purchases, cap = permanentMode ? definition.PermanentCap : definition.TotalCap;
        bool capped = level == cap, applies = index != (launcher ? 5 : 1);
        Equal(Text(card, "TrackId"), Ids[index], "Card has the catalog typed identity");
        Equal(Get(card, "Key"), Keys[index], "Card has the catalog save key");
        Equal(Get(card, "Name"), Names[index], "Card has the catalog name");
        Equal(Text(card, "Category"), Categories[index], "Card has the catalog category");
        Equal(Text(card, "Applicability"), Applicability[index], "Card has the catalog fitting role");
        Equal(Get(card, "PermanentLevel"), permanent, "Card copies committed or deployed P");
        Equal(Get(card, "RunPurchases"), purchases, "Card copies the context n");
        Equal(Get(card, "CurrentLevel"), level, "Card copies actual P+n");
        Equal(Get(card, "Cap"), cap, "Card uses its context cap");
        Equal(Get(card, "RemainingPurchases"), cap - level, "Card has context remaining levels");
        Equal(Get(card, "AppliesToFitting"), applies, "Card reports combat fitting applicability");
        Equal(Get(card, "IsDormant"), permanentMode && !applies, "Permanent dormant fitting is informational");
        int? price = capped ? (int?)null : permanentMode ? definition.PermanentPrice(permanent + 1) : Price(purchases + 1);
        Equal(Get(card, "NextPrice"), price, "Card has the exact context price");
        Equal(Get(card, "PriceDescription"), capped ? "MAX" : price + (permanentMode ? " Salvage" : " Scrap"), "Card names the correct currency");
        string effect = permanentMode ? definition.DescribeEffect(level) : index == 3 ? "reduce hits by " + level + " (minimum 1 damage)" :
            index == 4 ? CycleSeconds[level] + "s between cannon shots" : Effects[index][level] + Units[index];
        string next = capped ? "MAX" : permanentMode || level >= 8 ? definition.DescribeEffect(level + 1) : index == 3 ? "reduce hits by " + (level + 1) + " (minimum 1 damage)" :
            index == 4 ? CycleSeconds[level + 1] + "s between cannon shots" : Effects[index][level + 1] + Units[index];
        Equal(Get(card, "CurrentEffectDescription"), effect, "Card current effect is exact");
        Equal(Get(card, "NextEffectDescription"), next, "Card never invents an effect above its context cap");
        Equal(Get(card, "CurrentEffectDescription"), definition.DescribeEffect(level), "Card shares its economy's catalog descriptions");
    }

    static void PresentationReason(object card, string refusal, string text)
    {
        Require(Get(card, "Refusal").GetType().IsEnum, "Card refusal is typed data.");
        Equal(Text(card, "Refusal"), refusal, "Card reports current typed refusal");
        Equal(Get(card, "Reason"), text, "Card reports a readable current reason");
        Equal(Get(card, "CanPurchase"), refusal == "None", "Card admission matches its current reason");
    }

    static string PresentationSave(int wallet, int[] levels, string pending = "null", int nextRunId = 1)
    {
        string trackValues = "";
        for (int i = 0; i < Keys.Length; i++) trackValues += (i == 0 ? "" : ",") + "\"" + Keys[i] + "\":" + levels[i];
        return "{\"version\":2,\"credits\":" + wallet + ",\"permanentLevels\":{" + trackValues +
            "},\"nextRunId\":" + nextRunId + ",\"lastFinalizedRunId\":0,\"pendingDefeat\":" + pending + "}";
    }

    sealed class PresentationStorage : ILastStandStorage
    {
        public string Value;
        public int Reads, Writes;
        public bool FailWrite;
        public PresentationStorage(string value) { Value = value; }
        public string Read() { Reads++; return Value; }
        public void Write(string value) { Writes++; if (FailWrite) throw new InvalidOperationException("Fixture denied write"); Value = value; }
    }

    static void PresentationLevelsEffectsPricesAndReasons()
    {
        // Compiled absent-type RED happens before any new production file exists.
        var probe = ActualLedger(301, true, new int[6]);
        Presentation("ProjectRun", probe);
        for (int index = 0; index < 6; index++)
            for (int permanent = 0; permanent <= 3; permanent++)
            {
                bool launcher = index != 5;
                var levels = new int[6]; levels[index] = permanent;
                var ledger = ActualLedger(302, launcher, levels);
                Call(ledger, "ObserveAuthoritativeKills", 100);
                for (int n = 0; n <= 8 - permanent; n++)
                {
                    string ownerBefore = TransactionFingerprint(ledger);
                    var view = Presentation("ProjectRun", ledger);
                    Equal(TransactionFingerprint(ledger), ownerBefore, "Projecting run cards has no owner effect");
                    Equal(Text(view, "Mode"), "Run", "Live shop projects run context");
                    Equal(Text(view, "Currency"), "Scrap", "Run currency is typed Scrap");
                    Equal(Get(view, "CurrencyName"), "Scrap", "Run wallet is named Scrap");
                    Equal(Get(view, "Balance"), Get(ledger, "Scrap"), "Run wallet copies spendable funds");
                    Equal(Get(view, "RunId"), Get(ledger, "RunId"), "View copies the actual run identity");
                    Equal(Get(view, "Version"), Get(ledger, "Version"), "View copies the actual current revision");
                    Equal(Text(view, "Lifecycle"), "Running", "View copies the actual lifecycle");
                    var cards = PresentationCards(view);
                    for (int i = 0; i < 6; i++) PresentationCard(cards[i], i, i == index ? permanent : 0, i == index ? n : 0, false, launcher);
                    PresentationReason(cards[index], "None", "Ready");
                    string retained = PresentationFingerprint(view);
                    if (n != 8 - permanent)
                    {
                        Equal(Get(Call(ledger, "TryPurchase", PurchaseIntent(ledger, index)), "Accepted"), true, "Actual owner changes after a copied run view");
                        Equal(PresentationFingerprint(view), retained, "Retained run view cannot follow mutable owner changes");
                    }
                }
                FillToCap(ledger,index);
                PresentationReason(PresentationCards(Presentation("ProjectRun",ledger))[index],"AtCap","MAX");
            }
        foreach (bool launcher in new[] { false, true })
        {
            var empty = ActualLedger(303, launcher, new[] { 3, 0, 0, 0, 0, 0 });
            var emptyView = Presentation("ProjectRun", empty);
            string emptyCopy = PresentationFingerprint(emptyView);
            var emptyCards = PresentationCards(emptyView);
            PresentationReason(emptyCards[0], "InsufficientScrap", "Not enough Scrap");
            PresentationReason(emptyCards[launcher ? 5 : 1], "WrongFitting", launcher ? "Requires repair fitting" : "Requires launcher fitting");
            PresentationReason(((LastStandShopView)emptyView).Cards[6], "WrongFitting", "Requires scattergun fitting");
            Call(empty, "ObserveAuthoritativeKills", 2);
            Equal(PresentationFingerprint(emptyView), emptyCopy, "Retained wallet and cards cannot change when actual income arrives");
            var fundedView = Presentation("ProjectRun", empty);
            PresentationReason(PresentationCards(fundedView)[0], "None", "Ready");
            Equal(Get(PresentationCards(fundedView)[0], "NextEffectDescription"), "60 damage", "P3 run can advance to L4");
            Equal(Get(Call(empty, "TryPurchase", PurchaseIntent(empty, 0)), "Accepted"), true, "Actual first purchase creates a progressed-price display fixture");
            Call(empty, "ObserveAuthoritativeKills", 4);
            var progressed = Presentation("ProjectRun", empty);
            Equal(Get(progressed, "Balance"), 7, "Progressed display has positive funds below its current ten-Scrap price");
            Equal(Get(PresentationCards(progressed)[0], "NextPrice"), 10, "Display uses progressed n rather than first price");
            PresentationReason(PresentationCards(progressed)[0], "InsufficientScrap", "Not enough Scrap");
            Call(empty, "ObserveAuthoritativeKills", 5);
            PresentationReason(PresentationCards(Presentation("ProjectRun", empty))[0], "None", "Ready");
            ChangeLifecycle(empty, "Paused");
            var paused = Presentation("ProjectRun", empty);
            Equal(Text(paused, "Lifecycle"), "Paused", "Explicit pause remains an observed boundary");
            PresentationReason(PresentationCards(paused)[0], "None", "Ready");
            string pausedCopy = PresentationFingerprint(paused);
            ChangeLifecycle(empty, "CatchingUp");
            foreach (var card in PresentationCards(Presentation("ProjectRun", empty))) PresentationReason(card, "CatchingUp", "Catching up");
            Equal(PresentationFingerprint(paused), pausedCopy, "Old view does not change across settling boundaries");
            foreach (string ended in new[] { "Defeated", "Exited", "Limit", "Failed", "Inactive" })
            {
                var terminal = ActualLedger(304, launcher, new int[6]);
                Call(terminal, "ObserveAuthoritativeKills", 2);
                ChangeLifecycle(terminal, ended);
                string reason = ended == "Defeated" ? "Run ended" : ended == "Exited" ? "Run exited" : ended == "Limit" ? "Run limit reached" : ended == "Failed" ? "Run stopped" : "No active run";
                foreach (var card in PresentationCards(Presentation("ProjectRun", terminal))) PresentationReason(card, ended, reason);
            }

            for (int permanent = 0; permanent <= 3; permanent++)
            {
                var storage = new PresentationStorage(PresentationSave(1000, new[] { permanent, permanent, permanent, permanent, permanent, permanent }));
                var progression = LastStandProgression.Load(storage);
                int reads = storage.Reads, writes = storage.Writes;
                var view = Presentation("ProjectPermanent", progression, launcher);
                Equal(storage.Reads, reads, "Permanent projection never reads storage");
                Equal(storage.Writes, writes, "Permanent projection never writes storage");
                Equal(Text(view, "Mode"), "Permanent", "Workshop has distinct permanent context");
                Equal(Text(view, "Currency"), "Salvage", "Permanent currency is typed Salvage");
                Equal(Get(view, "CurrencyName"), "Salvage", "Workshop wallet is named Salvage");
                Equal(Get(view, "Balance"), 1000, "Workshop copies only committed wallet");
                Equal(Get(view, "RunId"), 0, "Permanent view contains no active run purchase identity");
                Equal(Get(view, "Version"), 0, "Permanent view cannot impersonate a run revision");
                Equal(Get(view, "SaveState"), "ready", "Workshop copies confirmed save readiness");
                var cards = PresentationCards(view);
                for (int i = 0; i < 6; i++)
                {
                    PresentationCard(cards[i], i, permanent, 0, true, launcher);
                    PresentationReason(cards[i], "None", "Ready");
                }
                string frozen = PresentationFingerprint(view);
                if (permanent < 3)
                {
                    Require(progression.TryPurchase(launcher ? LastStandUpgradeTrackId.FieldRepair : LastStandUpgradeTrackId.LauncherAttack), "Dormant permanent investment is actually admitted by progression.");
                    Equal(PresentationFingerprint(view), frozen, "Retained permanent view never observes later confirmed wallet/level changes");
                    var current = PresentationCards(Presentation("ProjectPermanent", progression, launcher))[launcher ? 5 : 1];
                    Equal(Get(current, "PermanentLevel"), permanent + 1, "Fresh permanent view observes the actual verified purchase");
                }
            }
            var insufficient = LastStandProgression.Load(new PresentationStorage(PresentationSave(0, new int[6])));
            foreach (var card in PresentationCards(Presentation("ProjectPermanent", insufficient, launcher))) PresentationReason(card, "InsufficientSalvage", "Not enough Salvage");
            var positiveInsufficient = LastStandProgression.Load(new PresentationStorage(PresentationSave(1, new[] { 2, 2, 2, 2, 2, 2 })));
            foreach (var card in PresentationCards(Presentation("ProjectPermanent", positiveInsufficient, launcher)))
            {
                Equal(Get(card, "NextPrice"), LastStandUpgradeCatalog.Get((LastStandUpgradeTrackId)Get(card,"TrackId")).PermanentPrice(3), "Permanent affordability uses current economy P+1 price");
                PresentationReason(card, "InsufficientSalvage", "Not enough Salvage");
            }
            var active = LastStandProgression.Load(new PresentationStorage(PresentationSave(100, new int[6])));
            Require(active.TryDeploy(), "Permanent active-run fixture uses a real verified reservation.");
            foreach (var card in PresentationCards(Presentation("ProjectPermanent", active, launcher))) PresentationReason(card, "None", "Ready");
            var pending = LastStandProgression.Load(new PresentationStorage(PresentationSave(10, new int[6], "{\"runId\":1,\"elapsedTicks\":20,\"kills\":2,\"reward\":1}", 2)));
            foreach (var card in PresentationCards(Presentation("ProjectPermanent", pending, launcher))) PresentationReason(card, "PendingReward", "Claim pending Salvage first");
            var broken = LastStandProgression.Load(new PresentationStorage("invalid fixture"));
            foreach (var card in PresentationCards(Presentation("ProjectPermanent", broken, launcher))) PresentationReason(card, "SaveUnavailable", "Save unavailable");
            var uncertainStorage = new PresentationStorage(PresentationSave(10, new int[6]));
            var uncertain = LastStandProgression.Load(uncertainStorage);
            uncertainStorage.FailWrite = true;
            Require(!uncertain.TryPurchase(LastStandUpgradeTrackId.Armor), "Real denied write creates an unconfirmed permanent candidate.");
            var unconfirmed = Presentation("ProjectPermanent", uncertain, launcher);
            Equal(Get(unconfirmed, "Balance"), 10, "Unconfirmed debit never appears in a card wallet");
            Equal(Get(PresentationCards(unconfirmed)[3], "PermanentLevel"), 0, "Unconfirmed permanent level never appears in a card");
            Equal(Get(unconfirmed, "SaveError"), uncertain.SaveError, "Actual save failure remains available to the renderer");
            foreach (var card in PresentationCards(unconfirmed)) PresentationReason(card, "SaveUnavailable", "Save unavailable");
            string unconfirmedCopy = PresentationFingerprint(unconfirmed);
            uncertainStorage.FailWrite = false;
            Require(uncertain.Retry(), "Existing owner confirms the same candidate exactly once.");
            Equal(PresentationFingerprint(unconfirmed), unconfirmedCopy, "Old save-error view is immutable across recovery");
            var confirmed = Presentation("ProjectPermanent", uncertain, launcher);
            Equal(Get(confirmed, "Balance"), 10 - LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).PermanentPrice(1), "Fresh view observes only verified wallet");
            Equal(Get(PresentationCards(confirmed)[3], "PermanentLevel"), 1, "Fresh view observes only verified level");
        }
        Console.Error.WriteLine("WITNESS presentation: all six identities/effects, run P0..3/n-to-cap, permanent P0..3/both fittings, typed lifecycle/save/funds reasons and immutable copies.");
    }

    static object Get(object owner, string name)
    {
        var property = owner.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
        Require(property != null, "Missing public behavior: " + name);
        return property.GetValue(owner);
    }
    static string Text(object owner, string name) => Get(owner, name).ToString();
    static object Call(object owner, string name, params object[] args)
    {
        MethodInfo method = null;
        foreach (var candidate in owner.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
        {
            if (candidate.Name != name) continue;
            var parameters = candidate.GetParameters();
            if (parameters.Length != args.Length) continue;
            bool matches = true;
            for (int i = 0; i < args.Length; i++)
                matches &= args[i] == null ? !parameters[i].ParameterType.IsValueType : parameters[i].ParameterType.IsInstanceOfType(args[i]);
            if (!matches) continue;
            Require(method == null, "Ambiguous fixture call: " + name);
            method = candidate;
        }
        Require(method != null, "Missing public behavior: " + name);
        try { return method.Invoke(owner, args); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }
    static void Rejected(Action action, string claim)
    {
        try { action(); }
        catch (ArgumentOutOfRangeException) { return; }
        throw new Exception(claim + " must be rejected.");
    }
    static object CallStatic(MethodInfo method, params object[] args)
    {
        try { return method.Invoke(null, args); }
        catch (TargetInvocationException error) { throw error.InnerException; }
    }
    static void RejectedParameter(Action action, string parameterName, string claim)
    {
        try { action(); }
        catch (ArgumentOutOfRangeException error)
        {
            Equal(error.GetType(), typeof(ArgumentOutOfRangeException), claim + " exact exception type");
            Equal(error.ParamName, parameterName, claim + " exception parameter");
            return;
        }
        throw new Exception(claim + " must throw ArgumentOutOfRangeException for " + parameterName);
    }
    static void Equal(object actual, object expected, string claim)
    {
        if (!Object.Equals(actual, expected))
            throw new Exception(claim + ": expected " + (expected ?? "null") + ", observed " + (actual ?? "null"));
    }
    static void Require(bool condition, string claim)
    {
        if (!condition) throw new Exception(claim);
    }
    sealed class MemoryStorage : ILastStandStorage
    {
        string value;
        public MemoryStorage(string value) { this.value = value; }
        public string Read() => value;
        public void Write(string next) { value = next; }
    }
}
