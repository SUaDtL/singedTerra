using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public sealed class LastStandEnvironmentIdentity
    {
        public string Id { get; }
        public string Name { get; }
        public string Description { get; }
        public LastStandEnvironmentIdentity(string id,string name,string description)
        { new LastStandSelectionOption(id,name,description);Id=id;Name=name;Description=description; }
    }

    // An immutable, validated input boundary. It is also used by non-awarding
    // authoring previews; it has no wallet, global override or save writer.
    public sealed class LastStandContentManifest
    {
        readonly Dictionary<int,LastStandTierDefinition> tierById=new Dictionary<int,LastStandTierDefinition>();
        readonly Dictionary<string,LastStandEnvironmentIdentity> environmentById=new Dictionary<string,LastStandEnvironmentIdentity>(StringComparer.Ordinal);
        public string Version { get; }
        public IReadOnlyList<LastStandTierDefinition> Tiers { get; }
        public IReadOnlyList<LastStandEnvironmentIdentity> Environments { get; }
        public IReadOnlyList<LastStandFittingDefinition> Fittings { get; }
        public LastStandResearchDefinitions Research { get; }
        public LastStandContentManifest(string version,IEnumerable<LastStandTierDefinition> tiers,
            IEnumerable<LastStandEnvironmentIdentity> environments,IEnumerable<LastStandFittingDefinition> fittings,LastStandResearchDefinitions research)
        {
            if(String.IsNullOrWhiteSpace(version)||version.Length>80||tiers==null||environments==null||fittings==null||research==null)
                throw new ArgumentException("Incomplete content manifest.");
            Version=version;Tiers=new List<LastStandTierDefinition>(tiers).AsReadOnly();
            Environments=new List<LastStandEnvironmentIdentity>(environments).AsReadOnly();
            Fittings=new List<LastStandFittingDefinition>(fittings).AsReadOnly();Research=research;
            Validate();
            foreach(var tier in Tiers)tierById.Add(tier.Id,tier);
            foreach(var environment in Environments)environmentById.Add(environment.Id,environment);
        }
        public void Validate()
        {
            LastStandTierCatalog.Validate(Tiers);
            LastStandEnemyCatalog.Validate();
            if(Tiers.Count>1024||Environments.Count==0||Environments.Count>1024||Fittings.Count==0||Fittings.Count>512)
                throw new ArgumentException("Content manifest exceeds supported bounds.");
            var environments=new HashSet<string>(StringComparer.Ordinal);
            foreach(var environment in Environments)
                if(environment==null||!environments.Add(environment.Id))throw new ArgumentException("Duplicate or missing environment identity.");
            var tiers=new HashSet<int>();foreach(var tier in Tiers)
            {
                LastStandSelectionOption.ValidateId(tier.Key);
                LastStandEnemyCatalog.ValidateMix(tier.EnemyMixId);
                tiers.Add(tier.Id);if(!environments.Contains(tier.EnvironmentId))throw new ArgumentException("Tier references a missing environment.");
            }
            var fittings=new HashSet<string>(StringComparer.Ordinal);var mechanics=new HashSet<LastStandFitting>();var unlocks=new HashSet<string>(StringComparer.Ordinal);
            foreach(var fitting in Fittings)
            {
                if(fitting==null||!fittings.Add(fitting.Id)||!mechanics.Add(fitting.Mechanic))throw new ArgumentException("Duplicate fitting identity or mechanic.");
                if(!fitting.InitiallyUnlocked&&(!tiers.Contains(fitting.UnlockTier)||!unlocks.Add(fitting.UnlockTier+":"+fitting.UnlockWave)))
                    throw new ArgumentException("Invalid or ambiguous fitting unlock.");
            }
            foreach(var tier in Tiers)
            {
                var milestones=LastStandRewardCatalog.Milestones(tier,Tiers,Fittings);
                foreach(var milestone in milestones)
                    if(milestone.UnlockTierId!=0&&!tiers.Contains(milestone.UnlockTierId) ||
                        milestone.UnlockFittingId!=null&&!fittings.Contains(milestone.UnlockFittingId))
                        throw new ArgumentException("Milestone references missing content.");
            }
            foreach(var economy in LastStandEconomyCatalog.All)
            {
                var ids=new HashSet<LastStandUpgradeTrackId>();var keys=new HashSet<string>(StringComparer.Ordinal);
                foreach(var track in economy.Tracks)
                    if(track==null||!ids.Add(track.Id)||!keys.Add(track.Key)||track.EconomyVersion!=economy.Version||
                        !Enum.IsDefined(typeof(LastStandUpgradeApplicability),track.Applicability)||
                        track.PermanentCap<1||track.TotalCap<track.PermanentCap)
                        throw new ArgumentException("Invalid upgrade content or economy identity.");
            }
        }
        public LastStandTierDefinition Tier(int id)
        { if(!tierById.TryGetValue(id,out var tier))throw new ArgumentOutOfRangeException(nameof(id));return tier; }
        public LastStandEnvironmentIdentity EnvironmentForTier(int id)=>environmentById[Tier(id).EnvironmentId];
        public IReadOnlyList<LastStandSelectionOption> TierOptions(Func<int,bool> isUnlocked,
            Func<LastStandTierDefinition,string> description=null, bool numericSelectionIds=false)
        {
            if(isUnlocked==null)throw new ArgumentNullException(nameof(isUnlocked));var rows=new List<LastStandSelectionOption>();
            foreach(var tier in Tiers)
            {
                if(!tier.Playable)continue;
                var environment=EnvironmentForTier(tier.Id);
                // Existing player/observation selections use the persisted numeric
                // tier identity. Content authoring keeps its semantic key as well.
                string id=numericSelectionIds?tier.Id.ToString(System.Globalization.CultureInfo.InvariantCulture):tier.Key;
                rows.Add(new LastStandSelectionOption(id,"Tier "+tier.Id+" - "+environment.Name,
                    description==null?environment.Description:description(tier),isUnlocked(tier.Id)));
            }
            return rows.AsReadOnly();
        }
        public IReadOnlyList<LastStandSelectionOption> FittingOptions(Func<string,bool> isUnlocked)
        {
            if(isUnlocked==null)throw new ArgumentNullException(nameof(isUnlocked));
            var rows=new List<LastStandSelectionOption>();
            foreach(var fitting in Fittings)if(fitting.Playable)rows.Add(fitting.Option(isUnlocked(fitting.Id)));
            return rows.AsReadOnly();
        }
    }

    public static class LastStandContentCatalog
    {
        public static IReadOnlyList<LastStandEnvironmentIdentity> Environments { get; } = Array.AsReadOnly(new[] {
            new LastStandEnvironmentIdentity("sunlit-ash","Sunlit Ash","Warm ash flats, broken rock and long sunlit approaches."),
            new LastStandEnvironmentIdentity("iron-perimeter","Iron Perimeter","A cold industrial perimeter with hard cover and steel-grey ground."),
            new LastStandEnvironmentIdentity("cinder-basin","Cinder Basin","A broken caldera rim, basalt teeth and half-buried southern ruins."),
            new LastStandEnvironmentIdentity("storm-foundry","Storm Foundry","A foundry yard, pressure tanks and cable works under cold storm light.")
        });
        public static LastStandContentManifest Legacy { get; } = new LastStandContentManifest(LastStandRunEdition.LegacyContentVersion,
            LastStandTierCatalog.Legacy,new[]{Environments[0],Environments[1]},LastStandFittingCatalog.Legacy,LastStandResearchCatalog.Definitions);
        public static LastStandContentManifest Current { get; } = new LastStandContentManifest(LastStandRunEdition.CurrentContentVersion,
            LastStandTierCatalog.All,Environments,LastStandFittingCatalog.Definitions,LastStandResearchCatalog.Definitions);
        public static LastStandContentManifest Get(string version)=>version==Legacy.Version?Legacy:version==Current.Version?Current:
            throw new ArgumentException("Unsupported content edition.");
        public static LastStandEnvironmentIdentity Environment(string id)
        {
            foreach(var row in Environments)if(String.Equals(row.Id,id,StringComparison.Ordinal))return row;
            throw new ArgumentOutOfRangeException(nameof(id),"Unknown environment identity.");
        }
    }
}
