namespace SingedTerra.Encounter
{
    // Historical fixtures and authored playable combat profiles share one model.
    public sealed class EncounterProfile
    {
        public static readonly EncounterProfile Legacy = new EncounterProfile(false);
        public static readonly EncounterProfile VisualReview = new EncounterProfile(true);
        public static readonly EncounterProfile PlayablePrototype = new EncounterProfile(true, true);
        // Historical fixture retained for immutable oracle/negative controls.
        // Actual player deployment always resolves through ForTier below.
        readonly SingedTerra.LastStand.LastStandTierDefinition authoredTier;
        public SingedTerra.LastStand.LastStandRunEdition Edition { get; }
        public SingedTerra.LastStand.LastStandTierDefinition TierDefinition => IsPlayable ? authoredTier ?? Edition.Tier(Tier) : null;
        public int Tier { get; }
        public bool IsReview { get; }
        public bool IsPlayable { get; }
        public bool IsWaveBased { get; }
        public string Id => IsPlayable ? (IsWaveBased?Edition.RulesVersion+":":"")+TierDefinition.EncounterProfileId : IsReview ? "review-pacing-v1" : EncounterModel.RulesVersion;
        public int SpawnRadius => IsReview ? 25000 : EncounterModel.SpawnDistance;
        public int MainRange => IsReview ? 22000 : EncounterModel.CannonRange;
        public int AuxiliaryRange => IsReview ? 25000 : EncounterModel.LauncherRange;
        public int ScattergunRange => IsWaveBased&&!Edition.IsLegacy ? 22000 : EncounterModel.ScattergunRange;
        public int Horizon => IsWaveBased ? int.MaxValue : IsReview ? 3600 : EncounterModel.TickLimit;
        private EncounterProfile(bool review, bool playable = false, int tier = 1,bool waves=false)
        { IsReview = review; IsPlayable = playable; Tier = playable ? tier : 0;IsWaveBased=waves;Edition=SingedTerra.LastStand.LastStandRunEdition.Legacy(SingedTerra.LastStand.LastStandUpgradeCatalog.RetainedEconomyVersion); }
        private EncounterProfile(SingedTerra.LastStand.LastStandTierDefinition tier,SingedTerra.LastStand.LastStandRunEdition edition)
        {authoredTier=tier??throw new System.ArgumentNullException(nameof(tier));Edition=edition;IsReview=true;IsPlayable=true;IsWaveBased=true;Tier=tier.Id;}
        // Explicit authored fixture/content path. The player selector still uses only the shipped catalog.
        public static EncounterProfile ForDefinition(SingedTerra.LastStand.LastStandTierDefinition tier)=>new EncounterProfile(tier,SingedTerra.LastStand.LastStandRunEdition.Current);
        public static EncounterProfile ForTier(int tier)=>ForTier(tier,SingedTerra.LastStand.LastStandRunEdition.Current);
        public static EncounterProfile ForTier(int tier,SingedTerra.LastStand.LastStandRunEdition edition)=>new EncounterProfile(edition.Tier(tier),edition);
        public static EncounterProfile ForTier(int tier,System.Collections.Generic.IReadOnlyList<SingedTerra.LastStand.LastStandTierDefinition> definitions)
        {
            SingedTerra.LastStand.LastStandTierCatalog.Validate(definitions);
            foreach(var definition in definitions)if(definition.Id==tier)return ForDefinition(definition);
            throw new System.ArgumentOutOfRangeException(nameof(tier));
        }
        public int EnemyHull(int baseHull) => IsPlayable
            ? checked((int)(((long)baseHull*TierDefinition.EnemyHullNumerator+TierDefinition.EnemyHullDenominator-1)/TierDefinition.EnemyHullDenominator)) : baseHull;
        public int Speed(FoeKind kind) => IsWaveBased&&!Edition.IsLegacy?SingedTerra.LastStand.LastStandEnemyCatalog.Get(kind).Speed:IsReview
            ? (kind == FoeKind.Close ? 50 : 40) : (kind == FoeKind.Close ? 110 : 70);
        public int Stop(FoeKind kind) => IsWaveBased&&!Edition.IsLegacy?SingedTerra.LastStand.LastStandEnemyCatalog.Get(kind).StopDistance:IsReview
            ? (kind == FoeKind.Close ? 4800 : 12000) : (kind == FoeKind.Close ? 3400 : 10000);
        public int Interval(int spawnedBeforeAdmission)
        {
            if (!IsReview) return EncounterModel.SpawnPeriod;
            switch (spawnedBeforeAdmission / 8)
            {
                case 0: return 56; case 1: return 42;
                case 2: return 32; case 3: return 24; default: return 20;
            }
        }
        public int Lane(int index) => IsReview ? ((index / 4) * 3) % 8 : index * 3 % 8;
    }
}
