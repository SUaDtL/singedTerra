using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // A closed, immutable identity tuple. It selects existing domain owners;
    // it is not a rule interpreter or a mutable global content override.
    public sealed class LastStandRunEdition
    {
        public const string LegacyContentVersion="last-stand-content-v1",CombatDepthContentVersion="last-stand-content-v2",BuildcraftContentVersion="last-stand-content-v3",CurrentContentVersion="last-stand-content-v4";
        public const string LegacyRulesVersion="last-stand-waves-v1",CombatDepthRulesVersion="last-stand-waves-v2",BuildcraftRulesVersion="last-stand-waves-v3",CurrentRulesVersion="last-stand-waves-v4";
        public string RulesVersion { get; }
        public string ContentVersion { get; }
        public string EconomyVersion { get; }
        public bool IsLegacy=>RulesVersion==LegacyRulesVersion;
        public bool IsBuildcraft=>RulesVersion==BuildcraftRulesVersion||IsSkills;
        public bool IsSkills=>RulesVersion==CurrentRulesVersion;
        public IReadOnlyList<LastStandTierDefinition> Tiers=>IsLegacy?LastStandTierCatalog.Legacy:IsBuildcraft?LastStandTierCatalog.All:LastStandTierCatalog.CombatDepth;
        public IReadOnlyList<LastStandFittingDefinition> Fittings=>IsLegacy?LastStandFittingCatalog.Legacy:IsBuildcraft?LastStandFittingCatalog.Definitions:LastStandFittingCatalog.CombatDepth;
        LastStandRunEdition(string rules,string content,string economy){RulesVersion=rules;ContentVersion=content;EconomyVersion=economy;}
        public static LastStandRunEdition Current { get; }=new LastStandRunEdition(CurrentRulesVersion,CurrentContentVersion,LastStandUpgradeCatalog.EconomyVersion);
        public static LastStandRunEdition Buildcraft { get; }=new LastStandRunEdition(BuildcraftRulesVersion,BuildcraftContentVersion,LastStandUpgradeCatalog.EconomyVersion);
        public static LastStandRunEdition CombatDepth { get; }=new LastStandRunEdition(CombatDepthRulesVersion,CombatDepthContentVersion,LastStandUpgradeCatalog.CombatDepthEconomyVersion);
        public static LastStandRunEdition ForEconomy(string economy)=>economy==LastStandUpgradeCatalog.EconomyVersion?Current:
            economy==LastStandUpgradeCatalog.CombatDepthEconomyVersion?CombatDepth:Legacy(economy);
        public static string ContentForRules(string rules)=>rules==LegacyRulesVersion?LegacyContentVersion:
            rules==CombatDepthRulesVersion?CombatDepthContentVersion:rules==BuildcraftRulesVersion?BuildcraftContentVersion:rules==CurrentRulesVersion?CurrentContentVersion:
            throw new ArgumentException("Unsupported Last Stand rules.");
        public static LastStandRunEdition Legacy(string economy)=>Resolve(LegacyRulesVersion,LegacyContentVersion,economy);
        public static LastStandRunEdition Resolve(string rules,string content,string economy)
        {
            if(rules==CurrentRulesVersion&&content==CurrentContentVersion&&economy==LastStandUpgradeCatalog.EconomyVersion)return Current;
            if(rules==BuildcraftRulesVersion&&content==BuildcraftContentVersion&&economy==LastStandUpgradeCatalog.EconomyVersion)return Buildcraft;
            if(rules==CombatDepthRulesVersion&&content==CombatDepthContentVersion&&economy==LastStandUpgradeCatalog.CombatDepthEconomyVersion)return CombatDepth;
            if(rules==LegacyRulesVersion&&content==LegacyContentVersion&&
                (economy==LastStandUpgradeCatalog.LegacyEconomyVersion||economy==LastStandUpgradeCatalog.PreviousEconomyVersion||economy==LastStandUpgradeCatalog.RetainedEconomyVersion))
                return new LastStandRunEdition(rules,content,economy);
            throw new ArgumentException("Unsupported Last Stand run edition.");
        }
        public LastStandTierDefinition Tier(int id)
        {foreach(var tier in Tiers)if(tier.Id==id&&tier.Playable)return tier;throw new ArgumentException("Unsupported tier for this run edition.");}
        public bool Supports(LastStandFitting fitting)
        {foreach(var row in Fittings)if(row.Mechanic==fitting)return row.Playable;return false;}
    }
}
