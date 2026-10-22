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
        double anchor, admittedThroughTimestamp;
        int admittedTicks;

        public double LastTimestamp => anchor;
        public double LastStepTimestamp { get; private set; }
        public double PendingSeconds { get; private set; }
        public int StepsThisCallback { get; private set; }
        public double MaximumSpeed { get; }
        public double LastPositiveSpeed { get; private set; }
        public double SelectedSpeed => ManualPaused ? 0 : LastPositiveSpeed;
        public double EffectiveSpeed => Paused ? 0 : LastPositiveSpeed;
        public bool ManualPaused { get; private set; }
        public bool MenuPaused { get; private set; }
        public bool Paused => ManualPaused || MenuPaused;
        public bool Failed { get; private set; }
        public bool Stopped { get; private set; }
        public bool AtHorizon => admittedTicks >= horizonTicks;
        public bool CatchingUp => !Failed && !Stopped && !AtHorizon &&
            PendingSeconds + BoundaryTolerance >= StepSeconds;

        public LastStandRunClock(double startTimestamp, int horizonTicks)
            : this(startTimestamp, horizonTicks, 1, LastStandSpeedPolicy.InitialMaximum) { }

        public LastStandRunClock(double startTimestamp, int horizonTicks, double initialSpeed, double maximumSpeed)
        {
            if (horizonTicks <= 0) throw new ArgumentOutOfRangeException(nameof(horizonTicks));
            if (!LastStandSpeedPolicy.IsValidMaximum(maximumSpeed)) throw new ArgumentOutOfRangeException(nameof(maximumSpeed));
            if (initialSpeed <= 0 || !LastStandSpeedPolicy.Allows(initialSpeed, maximumSpeed))
                throw new ArgumentOutOfRangeException(nameof(initialSpeed));
            this.horizonTicks = horizonTicks;
            MaximumSpeed = maximumSpeed; LastPositiveSpeed = initialSpeed;
            anchor = admittedThroughTimestamp = LastStepTimestamp = startTimestamp;
            if (!ValidTimestamp(startTimestamp)) Fail();
        }

        // Duplicate timestamps add no time, but may drain already retained debt
        // under a new callback budget. PendingSeconds is always simulation time;
        // LastStepTimestamp is wall time for the separate settling owner.
        public bool Observe(double timestamp)
        {
            if (Failed) return false;
            StepsThisCallback = 0;
            if (!ValidTimestamp(timestamp) || timestamp < anchor) return Fail();
            double previous = anchor, elapsed = timestamp - anchor;
            anchor = timestamp;
            if (!Paused && !Stopped)
            {
                double remaining = (horizonTicks - admittedTicks) * StepSeconds - PendingSeconds;
                if (remaining > 0 && elapsed > 0)
                {
                    double admitted = Math.Min(elapsed * LastPositiveSpeed, remaining);
                    PendingSeconds += admitted;
                    admittedThroughTimestamp = previous + admitted / LastPositiveSpeed;
                }
            }
            return true;
        }

        public bool TryTakeStep()
        {
            if (Failed || Paused || Stopped || AtHorizon ||
                StepsThisCallback >= MaximumStepsPerCallback ||
                PendingSeconds + BoundaryTolerance < StepSeconds) return false;
            PendingSeconds = Math.Max(0, PendingSeconds - StepSeconds);
            // Rate changes are admitted only below a complete pending tick.
            // After this step any remaining debt therefore belongs to the
            // current rate, even when this tick consumed an older fraction.
            LastStepTimestamp = admittedThroughTimestamp - PendingSeconds / LastPositiveSpeed;
            admittedTicks++;
            StepsThisCallback++;
            return true;
        }

        // The caller must first Observe/drain through this action timestamp and
        // gate conflicting controls while CatchingUp. Pause preserves fractions;
        // Resume validates and anchors after excluding the player's paused time.
        public bool Pause(double timestamp)
        {
            if (!Observe(timestamp) || CatchingUp) return false;
            ManualPaused = true;
            return true;
        }

        public bool Resume(double timestamp)
        {
            if (!Observe(timestamp) || CatchingUp) return false;
            ManualPaused = false;
            return true;
        }

        public bool SetSpeed(double timestamp, double speed)
        {
            if (!LastStandSpeedPolicy.Allows(speed, MaximumSpeed)) return false;
            if (!Observe(timestamp) || CatchingUp) return false;
            if (speed > 0) LastPositiveSpeed = speed;
            ManualPaused = speed == 0;
            return true;
        }

        public bool SetMenuPaused(double timestamp, bool paused)
        {
            if (!Observe(timestamp) || CatchingUp) return false;
            MenuPaused = paused;
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
