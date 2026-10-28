using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
    public enum LastStandUpgradeTrackId { CannonAttack, LauncherAttack, HullCapacity, Armor, CannonCycle, FieldRepair, ScattergunAttack, ScrapYield }
    public enum LastStandUpgradeCategory { Attack, Defense, Utility }
    public enum LastStandUpgradeApplicability { All, Launcher, Repair, Scattergun }
    public enum LastStandFitting { Launcher, Repair, Scattergun }
    public enum LastStandBulkQuantity { Max=0, One=1, Ten=10, Hundred=100 }

    public sealed class LastStandUpgradeQuote
    {
        public LastStandBulkQuantity RequestedQuantity { get; }
        public int Quantity { get; }
        public int Cost { get; }
        public int ResultLevel { get; }
        internal LastStandUpgradeQuote(LastStandBulkQuantity requested,int quantity,int cost,int resultLevel)
        { RequestedQuantity=requested;Quantity=quantity;Cost=cost;ResultLevel=resultLevel; }
    }

    // Pure definitions shared by combat projections, prices and card descriptions.
    // No currency, persistence, clock or presentation owner lives in the catalog.
    public static class LastStandUpgradeCatalog
    {
        public const string LegacyEconomyVersion = "long-run-economy-v1";
        public const string PreviousEconomyVersion = "research-farming-economy-v2";
        public const string EconomyVersion = "research-farming-economy-v3";
        public const int TotalCap = 5000, PermanentCap = 2500, ScrapPriceStep = 5;
        public const int LegacyTotalCap = 8, LegacyPermanentCap = 3;
        public const int BaseCannonDamage = 20, CannonDamagePerLevel = 10;
        public const int BaseLauncherDamage = 12, LauncherDamagePerLevel = 4;
        public const int BaseScattergunDamage = 9, ScattergunDamagePerLevel = 3;
        public const int BaseMaximumHull = 120, HullPerLevel = 15;
        public const int BaseCannonPeriod = 20, BaseRepairAmount = 3, RepairPeriod = 20;

        public static IReadOnlyList<LastStandUpgradeDefinition> Tracks => ForEconomy(EconomyVersion).Tracks;
        public static LastStandEconomyDefinition ForEconomy(string version) => LastStandEconomyCatalog.Get(version);
        internal static IReadOnlyList<LastStandUpgradeDefinition> BuildTracks(string version)
        {
            bool legacy=version==LegacyEconomyVersion;
            var rows=new List<LastStandUpgradeDefinition> {
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.CannonAttack, "cannonAttack", "Cannon Attack",
                LastStandUpgradeCategory.Attack, LastStandUpgradeApplicability.All,version),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.LauncherAttack, "launcherAttack", "Launcher Attack",
                LastStandUpgradeCategory.Attack, LastStandUpgradeApplicability.Launcher,version),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.HullCapacity, "hullCapacity", "Hull Capacity",
                LastStandUpgradeCategory.Defense, LastStandUpgradeApplicability.All,version),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.Armor, "armor", "Armor",
                LastStandUpgradeCategory.Defense, LastStandUpgradeApplicability.All,version),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.CannonCycle, "cannonCycle", "Cannon Cycle",
                LastStandUpgradeCategory.Utility, LastStandUpgradeApplicability.All,version),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.FieldRepair, "fieldRepair", "Field Repair",
                LastStandUpgradeCategory.Utility, LastStandUpgradeApplicability.Repair,version),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.ScattergunAttack, "scattergunAttack", "Scattergun Attack",
                LastStandUpgradeCategory.Attack, LastStandUpgradeApplicability.Scattergun,version),
            };
            if(!legacy)rows.Add(new LastStandUpgradeDefinition(LastStandUpgradeTrackId.ScrapYield,"scrapYield","Scrap Yield",
                LastStandUpgradeCategory.Utility,LastStandUpgradeApplicability.All,version));
            return rows.AsReadOnly();
        }

        public static LastStandUpgradeDefinition Get(LastStandUpgradeTrackId id)
        {
            return ForEconomy(EconomyVersion).Get(id);
        }

        public static bool TryGet(string key, out LastStandUpgradeDefinition definition)
        {
            foreach (var track in Tracks)
            {
                if (!String.Equals(track.Key, key, StringComparison.Ordinal)) continue;
                definition = track;
                return true;
            }
            definition = null;
            return false;
        }
    }

    public sealed class LastStandUpgradeDefinition
    {
        public LastStandUpgradeTrackId Id { get; }
        public string Key { get; }
        public string Name { get; }
        public LastStandUpgradeCategory Category { get; }
        public LastStandUpgradeApplicability Applicability { get; }
        public string EconomyVersion { get; }
        public bool IsLegacy => EconomyVersion==LastStandUpgradeCatalog.LegacyEconomyVersion;
        public int TotalCap => Id == LastStandUpgradeTrackId.ScrapYield ? 200 : Id == LastStandUpgradeTrackId.CannonCycle ? 16 : Id == LastStandUpgradeTrackId.Armor ? 1000 : LastStandUpgradeCatalog.TotalCap;
        public int PermanentCap => Id == LastStandUpgradeTrackId.ScrapYield ? 200 : Id == LastStandUpgradeTrackId.CannonCycle ? 12 : Id == LastStandUpgradeTrackId.Armor ? 500 : LastStandUpgradeCatalog.PermanentCap;

        internal LastStandUpgradeDefinition(LastStandUpgradeTrackId id, string key, string name,
            LastStandUpgradeCategory category, LastStandUpgradeApplicability applicability,string economyVersion)
        { Id = id; Key = key; Name = name; Category = category; Applicability = applicability; EconomyVersion=economyVersion; }

        public MechanicsShopTrack CreateTrack(int persistentLevel, int runPurchases)
        {
            if (persistentLevel < 0 || persistentLevel > PermanentCap)
                throw new ArgumentOutOfRangeException(nameof(persistentLevel));
            return new MechanicsShopTrack(TotalCap, persistentLevel, runPurchases, RunPrice);
        }
        public int RunPrice(int purchaseIndex)
        {
            if(purchaseIndex<1 || purchaseIndex>TotalCap)throw new ArgumentOutOfRangeException(nameof(purchaseIndex));
            long extra=Math.Max(0,purchaseIndex-8);
            if(IsLegacy)return checked((int)(5L*purchaseIndex+extra*extra/40));
            if(Id==LastStandUpgradeTrackId.CannonCycle)return GeometricPrice(20,17,10,purchaseIndex);
            int slope=5,divisor=160;
            switch(Id) {
                case LastStandUpgradeTrackId.LauncherAttack:slope=3;divisor=220;break;
                case LastStandUpgradeTrackId.HullCapacity:slope=4;divisor=200;break;
                case LastStandUpgradeTrackId.Armor:slope=4;divisor=100;break;
                case LastStandUpgradeTrackId.FieldRepair:slope=3;divisor=320;break;
                case LastStandUpgradeTrackId.ScattergunAttack:slope=3;divisor=240;break;
                case LastStandUpgradeTrackId.ScrapYield:slope=5;divisor=20;break;
            }
            // New-run income grows early. Its deep run prices keep long-term
            // starting levels valuable; saved economies retain their prices.
            int curve=EconomyVersion==LastStandUpgradeCatalog.EconomyVersion?22:1;
            return checked((int)((long)slope*purchaseIndex+curve*extra*extra/divisor));
        }
        public int PermanentPrice(int purchaseIndex)
        {
            if(purchaseIndex<1 || purchaseIndex>PermanentCap)throw new ArgumentOutOfRangeException(nameof(purchaseIndex));
            long extra=Math.Max(0,purchaseIndex-3);
            if(IsLegacy)return checked((int)(purchaseIndex+extra*extra/16));
            if(Id==LastStandUpgradeTrackId.CannonCycle)return checked(20*(1<<(purchaseIndex-1)));
            long n=purchaseIndex;int initial=2,linear=4,quadratic=400;
            switch(Id) {
                case LastStandUpgradeTrackId.LauncherAttack:linear=5;quadratic=500;break;
                case LastStandUpgradeTrackId.HullCapacity:initial=3;quadratic=350;break;
                case LastStandUpgradeTrackId.Armor:initial=4;linear=2;quadratic=100;break;
                case LastStandUpgradeTrackId.FieldRepair:linear=6;quadratic=600;break;
                case LastStandUpgradeTrackId.ScattergunAttack:linear=5;quadratic=550;break;
                case LastStandUpgradeTrackId.ScrapYield:initial=5;linear=1;quadratic=20;break;
            }
            return checked((int)(initial+n/linear+n*n/quadratic));
        }
        public LastStandUpgradeQuote QuoteRun(int permanentLevel,int runPurchases,int available,LastStandBulkQuantity quantity)
        {
            var track=CreateTrack(permanentLevel,runPurchases);
            return Quote(track.CurrentLevel,runPurchases,track.RemainingPurchases,available,quantity,RunPrice);
        }
        public LastStandUpgradeQuote QuotePermanent(int permanentLevel,int available,LastStandBulkQuantity quantity)
        {
            if(permanentLevel<0 || permanentLevel>PermanentCap)throw new ArgumentOutOfRangeException(nameof(permanentLevel));
            return Quote(permanentLevel,permanentLevel,PermanentCap-permanentLevel,available,quantity,PermanentPrice);
        }
        static LastStandUpgradeQuote Quote(int currentLevel,int paidRanks,int remaining,int available,
            LastStandBulkQuantity quantity,Func<int,int> priceAt)
        {
            if(available<0)throw new ArgumentOutOfRangeException(nameof(available));
            if(!Enum.IsDefined(typeof(LastStandBulkQuantity),quantity))throw new ArgumentOutOfRangeException(nameof(quantity));
            int limit=quantity==LastStandBulkQuantity.Max?remaining:Math.Min(remaining,(int)quantity),count=0;
            long cost=0;
            for(int n=1;n<=limit;n++) {
                long next=cost+priceAt(paidRanks+n);
                if(next>available)break;
                cost=next;count++;
            }
            return new LastStandUpgradeQuote(quantity,count,(int)cost,currentLevel+count);
        }
        static int GeometricPrice(int first,int numerator,int denominator,int index)
        {
            // Round each catalog step upward; bounded utility tracks avoid
            // floating point or a power that overflows before division.
            long value=first;
            for(int rank=1;rank<index;rank++)value=checked((value*numerator+denominator-1)/denominator);
            return checked((int)value);
        }

        public bool IsEligible(LastStandFitting fitting)
        {
            if (fitting != LastStandFitting.Launcher && fitting != LastStandFitting.Repair && fitting != LastStandFitting.Scattergun)
                throw new ArgumentOutOfRangeException(nameof(fitting));
            return Applicability == LastStandUpgradeApplicability.All ||
                (Applicability == LastStandUpgradeApplicability.Launcher && fitting == LastStandFitting.Launcher) ||
                (Applicability == LastStandUpgradeApplicability.Repair && fitting == LastStandFitting.Repair) ||
                (Applicability == LastStandUpgradeApplicability.Scattergun && fitting == LastStandFitting.Scattergun);
        }

        // Armor returns applied damage for the supplied positive raw enemy hit.
        public int EffectAt(int totalLevel, int rawHit)
        {
            if (totalLevel < 0 || totalLevel > TotalCap)
                throw new ArgumentOutOfRangeException(nameof(totalLevel));
            int growth=Math.Max(0,totalLevel-8);
            switch (Id)
            {
                case LastStandUpgradeTrackId.CannonAttack:
                    return LastStandUpgradeCatalog.BaseCannonDamage + LastStandUpgradeCatalog.CannonDamagePerLevel * totalLevel + growth*growth/(IsLegacy?5:80);
                case LastStandUpgradeTrackId.LauncherAttack:
                    return LastStandUpgradeCatalog.BaseLauncherDamage + LastStandUpgradeCatalog.LauncherDamagePerLevel * totalLevel + growth*growth/8;
                case LastStandUpgradeTrackId.ScattergunAttack:
                    return LastStandUpgradeCatalog.BaseScattergunDamage + LastStandUpgradeCatalog.ScattergunDamagePerLevel * totalLevel + growth*growth/12;
                case LastStandUpgradeTrackId.HullCapacity:
                    return LastStandUpgradeCatalog.BaseMaximumHull + LastStandUpgradeCatalog.HullPerLevel * totalLevel + growth*growth/2;
                case LastStandUpgradeTrackId.Armor:
                    if (rawHit < 1) throw new ArgumentOutOfRangeException(nameof(rawHit));
                    return Math.Max(1, rawHit - totalLevel);
                case LastStandUpgradeTrackId.CannonCycle:
                    return LastStandUpgradeCatalog.BaseCannonPeriod - totalLevel;
                case LastStandUpgradeTrackId.FieldRepair:
                    return LastStandUpgradeCatalog.BaseRepairAmount + totalLevel + growth*growth/40;
                case LastStandUpgradeTrackId.ScrapYield: return 100+totalLevel;
                default: throw new ArgumentOutOfRangeException(nameof(Id));
            }
        }

        public string DescribeEffect(int totalLevel)
        {
            string effect = EffectAt(totalLevel, 1).ToString(CultureInfo.InvariantCulture);
            switch (Id)
            {
                case LastStandUpgradeTrackId.CannonAttack:
                case LastStandUpgradeTrackId.LauncherAttack: return effect + " damage";
                case LastStandUpgradeTrackId.ScattergunAttack: return effect + " damage to up to 3 nearby targets";
                case LastStandUpgradeTrackId.HullCapacity: return effect + " maximum hull";
                case LastStandUpgradeTrackId.Armor:
                    return "reduce hits by " + totalLevel.ToString(CultureInfo.InvariantCulture) + " (minimum 1 damage)";
                case LastStandUpgradeTrackId.CannonCycle:
                    return Seconds(EffectAt(totalLevel, 1)) + "s between cannon shots";
                case LastStandUpgradeTrackId.FieldRepair: return effect + " hull every " +
                    Seconds(LastStandUpgradeCatalog.RepairPeriod) + "s";
                case LastStandUpgradeTrackId.ScrapYield:
                    return (EffectAt(totalLevel,1)/100m).ToString("0.00",CultureInfo.InvariantCulture)+"x kill Scrap";
                default: throw new ArgumentOutOfRangeException(nameof(Id));
            }
        }

        static string Seconds(int ticks) =>
            (ticks * LastStandRunClock.StepSeconds).ToString("0.##", CultureInfo.InvariantCulture);

        public LastStandUpgradeProjection Project(int persistentLevel, int runPurchases, LastStandFitting fitting)
        {
            var track = CreateTrack(persistentLevel, runPurchases);
            return new LastStandUpgradeProjection(this, track, IsEligible(fitting));
        }
    }

    // An immutable observation, not a purchase or a second mutable track owner.
    public sealed class LastStandUpgradeProjection
    {
        public int PermanentLevel { get; }
        public int RunPurchases { get; }
        public int CurrentLevel { get; }
        public int RemainingPurchases { get; }
        public bool IsEligible { get; }
        public bool CanPurchase => IsEligible && RemainingPurchases > 0;
        public int? NextPrice { get; }
        public int? NextPermanentPrice { get; }
        public string CurrentEffectDescription { get; }
        public string NextEffectDescription { get; }
        public string PriceDescription => NextPrice.HasValue
            ? NextPrice.Value.ToString(CultureInfo.InvariantCulture) + " Scrap" : "MAX";
        public string PermanentPriceDescription => NextPermanentPrice.HasValue
            ? NextPermanentPrice.Value.ToString(CultureInfo.InvariantCulture) + " Salvage" : "MAX";
        public string UnavailableReason { get; }

        internal LastStandUpgradeProjection(LastStandUpgradeDefinition definition, MechanicsShopTrack track, bool eligible)
        {
            PermanentLevel = track.PersistentLevel;
            RunPurchases = track.RunPurchases;
            CurrentLevel = track.CurrentLevel;
            RemainingPurchases = track.RemainingPurchases;
            IsEligible = eligible;
            bool capped = RemainingPurchases == 0;
            NextPrice = capped ? (int?)null : track.NextRunPrice;
            NextPermanentPrice = PermanentLevel == definition.PermanentCap
                ? (int?)null : definition.PermanentPrice(PermanentLevel + 1);
            CurrentEffectDescription = definition.DescribeEffect(CurrentLevel);
            NextEffectDescription = capped ? "MAX" : definition.DescribeEffect(CurrentLevel + 1);
            UnavailableReason = capped ? "MAX" : eligible ? String.Empty :
                definition.Applicability == LastStandUpgradeApplicability.Launcher
                    ? "Requires launcher fitting" : definition.Applicability == LastStandUpgradeApplicability.Repair ? "Requires repair fitting" : "Requires scattergun fitting";
        }
    }
}
