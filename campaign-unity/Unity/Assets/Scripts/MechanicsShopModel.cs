using System;

namespace SingedTerra.LastStand
{
    // Pure track arithmetic. Prices and caps are supplied by the caller.
    public sealed class MechanicsShopTrack
    {
        readonly Func<int, int> price;
        public int Cap { get; }
        public int PersistentLevel { get; }
        public int RunPurchases { get; private set; }

        public MechanicsShopTrack(int cap, int persistentLevel, int runPurchases, Func<int, int> price)
        {
            if (cap < 0) throw new ArgumentOutOfRangeException(nameof(cap));
            if (persistentLevel < 0 || persistentLevel > cap)
                throw new ArgumentOutOfRangeException(nameof(persistentLevel));
            if (runPurchases < 0 || runPurchases > cap - persistentLevel)
                throw new ArgumentOutOfRangeException(nameof(runPurchases));
            Cap = cap;
            PersistentLevel = persistentLevel;
            RunPurchases = runPurchases;
            this.price = price ?? throw new ArgumentNullException(nameof(price));
        }

        public int CurrentLevel => Math.Min(Cap, PersistentLevel + RunPurchases);
        public int RemainingPurchases => Cap - PersistentLevel - RunPurchases;
        // A terminal count of int.MaxValue has no representable next price index.
        public int NextRunPrice => price(checked(RunPurchases + 1));

        public bool TryPurchase()
        {
            if (RemainingPurchases == 0) return false;
            RunPurchases++;
            return true;
        }

        public void StartNewRun() => RunPurchases = 0;
    }
}
