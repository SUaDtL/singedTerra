using System;

namespace SingedTerra.LastStand
{
    // Research does not exist yet. Production callers always use InitialMaximum;
    // the bounded policy seam supports future-cap fixtures without an unlock flag.
    public static class LastStandSpeedPolicy
    {
        public const double Step = .5;
        public const double InitialMaximum = 1;
        public const double ProposedMaximum = 5;

        public static bool IsValidMaximum(double maximum) =>
            IsFinite(maximum) && maximum >= InitialMaximum && maximum <= ProposedMaximum &&
            maximum / Step == Math.Floor(maximum / Step);

        public static bool Allows(double speed, double maximum = InitialMaximum) =>
            IsValidMaximum(maximum) && IsFinite(speed) && speed >= 0 && speed <= maximum &&
            speed / Step == Math.Floor(speed / Step);

        // Preferences select a rate, never grant an entitlement or active pause.
        public static double RestorePositive(double speed) =>
            speed > 0 && Allows(speed) ? speed : InitialMaximum;

        static bool IsFinite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}
