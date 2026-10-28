using System;

namespace SingedTerra.LastStand
{
    // A combat cue is admitted at its own playback boundary, in the same
    // monotonic clock domain as the model callback. Logging may follow later.
    [Serializable] public sealed class LastStandAudioCue
    {
        public string action = "cue", cue, reason;
        public int id, run, fromTick, tick, steps, ordinal;
        public double timestamp, previousTimestamp, admittedAt;
        public bool played;
        bool eligible;
        static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
        public static LastStandAudioCue Prepare(string cue, int id, int run, int fromTick, int tick,
            int steps, int ordinal, double timestamp, double previousTimestamp, double priorPending, bool eligible)
        {
            return new LastStandAudioCue { cue=cue, id=id, run=run, fromTick=fromTick, tick=tick,
                steps=steps, ordinal=ordinal, timestamp=timestamp, previousTimestamp=previousTimestamp,
                eligible=eligible && id>0 && run>0 && ordinal>0 && steps>=1 && steps<=10 && tick==fromTick+steps &&
                    Finite(priorPending) && priorPending>=0 && priorPending<.05 && timestamp-previousTimestamp<=.5 };
        }
        // This final clock check allocates nothing. The same precreated attempt
        // also permits an early refusal without touching a currently playing voice.
        public bool Admit(double now)
        {
            admittedAt=now;played=false;
            if (!Finite(timestamp) || !Finite(previousTimestamp) || !Finite(now) ||
                previousTimestamp<0 || timestamp<previousTimestamp || now<timestamp) reason="clock";
            else if (!eligible) reason="callback";
            else if (now-previousTimestamp>.5) reason="expired";
            else { played=true; reason="played"; }
            return played;
        }
    }
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
        readonly double[] pendingWallMilliseconds=new double[10],stepWallMilliseconds=new double[10];
        public double StepWallMilliseconds(int speedIndex)=>stepWallMilliseconds[speedIndex];

        public double LastTimestamp => anchor;
        public double LastStepTimestamp { get; private set; }
        public double PendingSeconds { get; private set; }
        public int StepsThisCallback { get; private set; }
        public double MaximumSpeed { get; private set; }
        public double LastPositiveSpeed { get; private set; }
        public double SelectedSpeed => ManualPaused ? 0 : LastPositiveSpeed;
        public double EffectiveSpeed => Paused ? 0 : LastPositiveSpeed;
        public bool ManualPaused { get; private set; }
        public bool MenuPaused { get; private set; }
        public bool HostSuspended { get; private set; }
        public bool Paused => ManualPaused || MenuPaused || HostSuspended;
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
            if (HostSuspended)
            {
                // Native suspension retains admitted debt but excludes time
                // spent suspended, including terminal settling timestamps.
                admittedThroughTimestamp += elapsed;
                LastStepTimestamp += elapsed;
            }
            if (!Paused && !Stopped)
            {
                double remaining = (horizonTicks - admittedTicks) * StepSeconds - PendingSeconds;
                if (remaining > 0 && elapsed > 0)
                {
                    double admitted = Math.Min(elapsed * LastPositiveSpeed, remaining);
                    PendingSeconds += admitted;
                    pendingWallMilliseconds[(int)(LastPositiveSpeed*2)-1]+=admitted*1000/LastPositiveSpeed;
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
            Array.Clear(stepWallMilliseconds,0,stepWallMilliseconds.Length);
            double remaining=StepSeconds;
            int current=(int)(LastPositiveSpeed*2)-1;
            // A rate change is admitted only below one pending tick. All older
            // fractional rate contributions therefore precede this rate's new
            // debt and fit within the next consumed tick.
            for(int n=0;n<10;n++)if(n!=current)ConsumeWall(n,ref remaining);
            ConsumeWall(current,ref remaining);
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

        public bool SetHostSuspended(double timestamp, bool suspended)
        {
            if (!Observe(timestamp)) return false;
            HostSuspended = suspended;
            return true;
        }

        public void Stop() { Stopped = true; }
        void ConsumeWall(int index,ref double remaining)
        {
            double rate=(index+1)*.5;
            double wall=Math.Min(pendingWallMilliseconds[index],Math.Max(0,remaining)*1000/rate);
            pendingWallMilliseconds[index]-=wall;stepWallMilliseconds[index]=wall;
            remaining-=wall*rate/1000;
        }
        // Raising an entitlement changes neither the selected rate nor already
        // admitted combat debt. A profile cannot revoke an earned rank mid-run.
        public bool GrantMaximum(double maximum)
        {
            if(!LastStandSpeedPolicy.IsValidMaximum(maximum) || maximum<MaximumSpeed)return false;
            MaximumSpeed=maximum;return true;
        }

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
