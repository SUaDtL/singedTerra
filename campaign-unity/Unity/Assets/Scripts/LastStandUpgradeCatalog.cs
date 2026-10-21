using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
    public enum LastStandUpgradeTrackId { CannonAttack, LauncherAttack, HullCapacity, Armor, CannonCycle, FieldRepair }
    public enum LastStandUpgradeCategory { Attack, Defense, Utility }
    public enum LastStandUpgradeApplicability { All, Launcher, Repair }
    public enum LastStandFitting { Launcher, Repair }

    // Pure definitions shared by combat projections, prices and card descriptions.
    // No currency, persistence, clock or presentation owner lives in the catalog.
    public static class LastStandUpgradeCatalog
    {
        public const int TotalCap = 8, PermanentCap = 3, ScrapPriceStep = 5;
        public const int BaseCannonDamage = 20, CannonDamagePerLevel = 10;
        public const int BaseLauncherDamage = 12, LauncherDamagePerLevel = 4;
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

        internal LastStandUpgradeDefinition(LastStandUpgradeTrackId id, string key, string name,
            LastStandUpgradeCategory category, LastStandUpgradeApplicability applicability)
        { Id = id; Key = key; Name = name; Category = category; Applicability = applicability; }

        public MechanicsShopTrack CreateTrack(int persistentLevel, int runPurchases)
        {
            if (persistentLevel < 0 || persistentLevel > LastStandUpgradeCatalog.PermanentCap)
                throw new ArgumentOutOfRangeException(nameof(persistentLevel));
            return new MechanicsShopTrack(LastStandUpgradeCatalog.TotalCap, persistentLevel, runPurchases,
                index => checked(LastStandUpgradeCatalog.ScrapPriceStep * index));
        }

        public bool IsEligible(LastStandFitting fitting)
        {
            if (fitting != LastStandFitting.Launcher && fitting != LastStandFitting.Repair)
                throw new ArgumentOutOfRangeException(nameof(fitting));
            return Applicability == LastStandUpgradeApplicability.All ||
                (Applicability == LastStandUpgradeApplicability.Launcher && fitting == LastStandFitting.Launcher) ||
                (Applicability == LastStandUpgradeApplicability.Repair && fitting == LastStandFitting.Repair);
        }

        // Armor returns applied damage for the supplied positive raw enemy hit.
        public int EffectAt(int totalLevel, int rawHit)
        {
            if (totalLevel < 0 || totalLevel > LastStandUpgradeCatalog.TotalCap)
                throw new ArgumentOutOfRangeException(nameof(totalLevel));
            switch (Id)
            {
                case LastStandUpgradeTrackId.CannonAttack:
                    return LastStandUpgradeCatalog.BaseCannonDamage + LastStandUpgradeCatalog.CannonDamagePerLevel * totalLevel;
                case LastStandUpgradeTrackId.LauncherAttack:
                    return LastStandUpgradeCatalog.BaseLauncherDamage + LastStandUpgradeCatalog.LauncherDamagePerLevel * totalLevel;
                case LastStandUpgradeTrackId.HullCapacity:
                    return LastStandUpgradeCatalog.BaseMaximumHull + LastStandUpgradeCatalog.HullPerLevel * totalLevel;
                case LastStandUpgradeTrackId.Armor:
                    if (rawHit < 1) throw new ArgumentOutOfRangeException(nameof(rawHit));
                    return Math.Max(1, rawHit - totalLevel);
                case LastStandUpgradeTrackId.CannonCycle:
                    return LastStandUpgradeCatalog.BaseCannonPeriod - totalLevel;
                case LastStandUpgradeTrackId.FieldRepair:
                    return LastStandUpgradeCatalog.BaseRepairAmount + totalLevel;
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
            NextPermanentPrice = PermanentLevel == LastStandUpgradeCatalog.PermanentCap
                ? (int?)null : PermanentLevel + 1;
            CurrentEffectDescription = definition.DescribeEffect(CurrentLevel);
            NextEffectDescription = capped ? "MAX" : definition.DescribeEffect(CurrentLevel + 1);
            UnavailableReason = capped ? "MAX" : eligible ? String.Empty :
                definition.Applicability == LastStandUpgradeApplicability.Launcher
                    ? "Requires launcher fitting" : "Requires repair fitting";
        }
    }
}
