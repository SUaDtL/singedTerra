using System;

namespace SingedTerra.LastStand
{
    public sealed class LastStandResearchTime
    {
        public long ElapsedMilliseconds { get; internal set; }
        public long ObservedUtcMilliseconds { get; internal set; }
        public bool ClockAnomaly { get; internal set; }
        internal long generation;
        internal LastStandResearchClock owner;
        internal double monotonic, fractionalMilliseconds;
    }

    // Sample/Commit deliberately separates observing time from persisting it.
    // A rejected profile write must not consume the research interval. UTC is
    // used only at session start; open-session progression uses monotonic time.
    public sealed class LastStandResearchClock
    {
        public const long MaximumUtcMilliseconds = 253402300799999L;
        readonly long persistedUtc;
        long generation, observedUtc;
        double anchor, fraction;
        bool initialized;
        public LastStandResearchClock(long lastPersistedUtcMilliseconds)
        {
            if (!ValidUtc(lastPersistedUtcMilliseconds)) throw new ArgumentOutOfRangeException(nameof(lastPersistedUtcMilliseconds));
            persistedUtc = observedUtc = lastPersistedUtcMilliseconds;
        }
        public static bool ValidUtc(long utc) => utc >= 0 && utc <= MaximumUtcMilliseconds;
        static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value) && value >= 0;
        public bool TrySample(long utcMilliseconds, double monotonicSeconds, out LastStandResearchTime sample)
        {
            sample = null;
            if (!ValidUtc(utcMilliseconds) || !Finite(monotonicSeconds) || generation == long.MaxValue) return false;
            bool anomaly = utcMilliseconds < observedUtc || (initialized && monotonicSeconds < anchor);
            double elapsed = initialized ? Math.Max(0, monotonicSeconds - anchor) * 1000 + fraction : Math.Max(0, utcMilliseconds - persistedUtc);
            // There are at most four funded projects; no huge jump can create
            // unrequested work. Clamp conversion before converting to Int64.
            double bounded = Math.Min(MaximumUtcMilliseconds, elapsed);
            long whole = (long)Math.Floor(bounded);
            sample = new LastStandResearchTime { ElapsedMilliseconds = whole, ObservedUtcMilliseconds = utcMilliseconds,
                ClockAnomaly = anomaly, generation = generation, owner = this, monotonic = monotonicSeconds,
                fractionalMilliseconds = bounded - whole };
            return true;
        }
        public bool Commit(LastStandResearchTime sample)
        {
            if (sample == null || sample.owner != this || sample.generation != generation || generation == long.MaxValue) return false;
            observedUtc = sample.ObservedUtcMilliseconds; anchor = sample.monotonic;
            fraction = sample.fractionalMilliseconds; initialized = true; generation++;
            return true;
        }
    }
}
