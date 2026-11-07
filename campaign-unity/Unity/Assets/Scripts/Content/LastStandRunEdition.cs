using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // A closed, immutable identity tuple. It selects existing domain owners;
    // it is not a rule interpreter or a mutable global content override.
    public sealed class LastStandRunEdition
    {
        public const string LegacyContentVersion="last-stand-content-v1",CurrentContentVersion="last-stand-content-v2";
        public const string LegacyRulesVersion="last-stand-waves-v1",CurrentRulesVersion="last-stand-waves-v2";
        public string RulesVersion { get; }
        public string ContentVersion { get; }
        public string EconomyVersion { get; }
        public bool IsLegacy=>RulesVersion==LegacyRulesVersion;
        public IReadOnlyList<LastStandTierDefinition> Tiers=>IsLegacy?LastStandTierCatalog.Legacy:LastStandTierCatalog.All;
        public IReadOnlyList<LastStandFittingDefinition> Fittings=>IsLegacy?LastStandFittingCatalog.Legacy:LastStandFittingCatalog.Definitions;
        LastStandRunEdition(string rules,string content,string economy){RulesVersion=rules;ContentVersion=content;EconomyVersion=economy;}
        public static LastStandRunEdition Current { get; }=new LastStandRunEdition(CurrentRulesVersion,CurrentContentVersion,LastStandUpgradeCatalog.EconomyVersion);
        public static LastStandRunEdition Legacy(string economy)=>Resolve(LegacyRulesVersion,LegacyContentVersion,economy);
        public static LastStandRunEdition Resolve(string rules,string content,string economy)
        {
            if(rules==CurrentRulesVersion&&content==CurrentContentVersion&&economy==LastStandUpgradeCatalog.EconomyVersion)return Current;
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
