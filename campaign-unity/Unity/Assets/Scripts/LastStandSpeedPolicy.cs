using System;

namespace SingedTerra.LastStand
{
    // Preferences select within the earned ceiling; they never grant it.
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
        public static double RestorePositive(double speed,double maximum=InitialMaximum) =>
            speed > 0 && Allows(speed,maximum) ? speed : InitialMaximum;

        static bool IsFinite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}
