using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
    public enum LastStandUpgradeTrackId { CannonAttack, LauncherAttack, HullCapacity, Armor, CannonCycle, FieldRepair, ScattergunAttack }
    public enum LastStandUpgradeCategory { Attack, Defense, Utility }
    public enum LastStandUpgradeApplicability { All, Launcher, Repair, Scattergun }
    public enum LastStandFitting { Launcher, Repair, Scattergun }

    // Pure definitions shared by combat projections, prices and card descriptions.
    // No currency, persistence, clock or presentation owner lives in the catalog.
    public static class LastStandUpgradeCatalog
    {
        public const string EconomyVersion = "long-run-economy-v1";
        public const int TotalCap = 5000, PermanentCap = 2500, ScrapPriceStep = 5;
        public const int LegacyTotalCap = 8, LegacyPermanentCap = 3;
        public const int BaseCannonDamage = 20, CannonDamagePerLevel = 10;
        public const int BaseLauncherDamage = 12, LauncherDamagePerLevel = 4;
        public const int BaseScattergunDamage = 9, ScattergunDamagePerLevel = 3;
        public const int BaseMaximumHull = 120, HullPerLevel = 15;
        public const int BaseCannonPeriod = 20, BaseRepairAmount = 3, RepairPeriod = 20;

        public static IReadOnlyList<LastStandUpgradeDefinition> Tracks { get; } = Array.AsReadOnly(new[]
        {
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.CannonAttack, "cannonAttack", "Cannon Attack",
                LastStandUpgradeCategory.Attack, LastStandUpgradeApplicability.All),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.LauncherAttack, "launcherAttack", "Launcher Attack",
                LastStandUpgradeCategory.Attack, LastStandUpgradeApplicability.Launcher),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.HullCapacity, "hullCapacity", "Hull Capacity",
                LastStandUpgradeCategory.Defense, LastStandUpgradeApplicability.All),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.Armor, "armor", "Armor",
                LastStandUpgradeCategory.Defense, LastStandUpgradeApplicability.All),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.CannonCycle, "cannonCycle", "Cannon Cycle",
                LastStandUpgradeCategory.Utility, LastStandUpgradeApplicability.All),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.FieldRepair, "fieldRepair", "Field Repair",
                LastStandUpgradeCategory.Utility, LastStandUpgradeApplicability.Repair),
            new LastStandUpgradeDefinition(LastStandUpgradeTrackId.ScattergunAttack, "scattergunAttack", "Scattergun Attack",
                LastStandUpgradeCategory.Attack, LastStandUpgradeApplicability.Scattergun),
        });

        public static LastStandUpgradeDefinition Get(LastStandUpgradeTrackId id)
        {
            int index = (int)id;
            if (index < 0 || index >= Tracks.Count) throw new ArgumentOutOfRangeException(nameof(id));
            return Tracks[index];
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
        public int TotalCap => Id == LastStandUpgradeTrackId.CannonCycle ? 16 : Id == LastStandUpgradeTrackId.Armor ? 1000 : LastStandUpgradeCatalog.TotalCap;
        public int PermanentCap => Id == LastStandUpgradeTrackId.CannonCycle ? 12 : Id == LastStandUpgradeTrackId.Armor ? 500 : LastStandUpgradeCatalog.PermanentCap;

        internal LastStandUpgradeDefinition(LastStandUpgradeTrackId id, string key, string name,
            LastStandUpgradeCategory category, LastStandUpgradeApplicability applicability)
        { Id = id; Key = key; Name = name; Category = category; Applicability = applicability; }

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
            return checked((int)(5L*purchaseIndex+extra*extra/40));
        }
        public int PermanentPrice(int purchaseIndex)
        {
            if(purchaseIndex<1 || purchaseIndex>PermanentCap)throw new ArgumentOutOfRangeException(nameof(purchaseIndex));
            long extra=Math.Max(0,purchaseIndex-3);
            return checked((int)(purchaseIndex+extra*extra/16));
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
                    return LastStandUpgradeCatalog.BaseCannonDamage + LastStandUpgradeCatalog.CannonDamagePerLevel * totalLevel + growth*growth/5;
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
