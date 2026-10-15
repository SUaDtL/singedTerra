using System;

namespace SingedTerra.LastStand
{
    // Same-document scheduling only. The session owns model steps and terminal
    // outcomes; progression/storage remain with their existing owners.
    public sealed class LastStandRunClock
    {
        public const double StepSeconds = .05;
        public const int MaximumStepsPerCallback = 128;
        const double BoundaryTolerance = 1e-9;
        readonly int horizonTicks;
        double anchor;
        int admittedTicks;

        public double LastTimestamp => anchor;
        public double PendingSeconds { get; private set; }
        public int StepsThisCallback { get; private set; }
        public bool Paused { get; private set; }
        public bool Failed { get; private set; }
        public bool Stopped { get; private set; }
        public bool AtHorizon => admittedTicks >= horizonTicks;
        public bool CatchingUp => !Failed && !Stopped && !AtHorizon &&
            PendingSeconds + BoundaryTolerance >= StepSeconds;

        public LastStandRunClock(double startTimestamp, int horizonTicks)
        {
            if (horizonTicks <= 0) throw new ArgumentOutOfRangeException(nameof(horizonTicks));
            this.horizonTicks = horizonTicks;
            anchor = startTimestamp;
            if (!ValidTimestamp(startTimestamp)) Fail();
        }

        // Duplicate timestamps add no time, but may drain already retained debt
        // under a new callback budget. Stopped clocks retain bounded elapsed for
        // the settling owner; they can never admit another combat step.
        public bool Observe(double timestamp)
        {
            if (Failed) return false;
            StepsThisCallback = 0;
            if (!ValidTimestamp(timestamp) || timestamp < anchor) return Fail();
            double elapsed = timestamp - anchor;
            anchor = timestamp;
            if (!Paused)
            {
                double remaining = (horizonTicks - admittedTicks) * StepSeconds - PendingSeconds;
                if (remaining > 0) PendingSeconds += Math.Min(elapsed, remaining);
            }
            return true;
        }

        public bool TryTakeStep()
        {
            if (Failed || Paused || Stopped || AtHorizon ||
                StepsThisCallback >= MaximumStepsPerCallback ||
                PendingSeconds + BoundaryTolerance < StepSeconds) return false;
            PendingSeconds = Math.Max(0, PendingSeconds - StepSeconds);
            admittedTicks++;
            StepsThisCallback++;
            return true;
        }

        // The caller must first Observe/drain through this action timestamp and
        // gate conflicting controls while CatchingUp. Pause preserves fractions;
        // Resume validates and anchors after excluding the player's paused time.
        public bool Pause(double timestamp)
        {
            if (!Observe(timestamp)) return false;
            Paused = true;
            return true;
        }

        public bool Resume(double timestamp)
        {
            if (!Observe(timestamp)) return false;
            Paused = false;
            return true;
        }

        public void Stop() { Stopped = true; }

        static bool ValidTimestamp(double timestamp) =>
            !double.IsNaN(timestamp) && !double.IsInfinity(timestamp) && timestamp >= 0;

        bool Fail()
        {
            Failed = true;
            PendingSeconds = 0;
            StepsThisCallback = 0;
            return false;
        }
    }
}
