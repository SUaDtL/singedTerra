using System;
using UnityEngine;

namespace SingedTerra.LastStand
{
    public interface ILastStandPlatform
    {
        bool CanNavigate { get; }
        bool CanOpenAccount { get; }
        bool Fullscreen { get; }
        bool FullscreenAvailable { get; }
        string FullscreenStatus { get; }
        void ToggleFullscreen();
        void Navigate(bool account);
    }
    public sealed class LastStandUnityTime : ILastStandTime
    {
        public long UtcMilliseconds => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        public double MonotonicSeconds => Time.realtimeSinceStartupAsDouble;
    }
}
