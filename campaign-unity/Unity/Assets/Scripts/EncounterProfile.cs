namespace SingedTerra.Encounter
{
    // Two bounded fixtures, not the production progression or configuration system.
    public sealed class EncounterProfile
    {
        public static readonly EncounterProfile Legacy = new EncounterProfile(false);
        public static readonly EncounterProfile VisualReview = new EncounterProfile(true);
        public static readonly EncounterProfile PlayablePrototype = new EncounterProfile(true, true);
        static readonly EncounterProfile PlayableTierTwo = new EncounterProfile(true, true, 2);
        public int Tier { get; }
        public bool IsReview { get; }
        public bool IsPlayable { get; }
        public string Id => IsPlayable ? SingedTerra.LastStand.LastStandTierCatalog.Get(Tier).EncounterProfileId : IsReview ? "review-pacing-v1" : EncounterModel.RulesVersion;
        public int SpawnRadius => IsReview ? 25000 : EncounterModel.SpawnDistance;
        public int MainRange => IsReview ? 22000 : EncounterModel.CannonRange;
        public int AuxiliaryRange => IsReview ? 25000 : EncounterModel.LauncherRange;
        public int Horizon => IsReview ? 3600 : EncounterModel.TickLimit;
        private EncounterProfile(bool review, bool playable = false, int tier = 1)
        { IsReview = review; IsPlayable = playable; Tier = playable ? tier : 0; }
        public static EncounterProfile ForTier(int tier)
        {
            SingedTerra.LastStand.LastStandTierCatalog.Get(tier);
            return tier == 1 ? PlayablePrototype : PlayableTierTwo;
        }
        public int EnemyHull(int baseHull) => IsPlayable
            ? SingedTerra.LastStand.LastStandTierCatalog.EnemyHull(Tier, baseHull) : baseHull;
        public int Speed(FoeKind kind) => IsReview
            ? (kind == FoeKind.Close ? 50 : 40) : (kind == FoeKind.Close ? 110 : 70);
        public int Stop(FoeKind kind) => IsReview
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
