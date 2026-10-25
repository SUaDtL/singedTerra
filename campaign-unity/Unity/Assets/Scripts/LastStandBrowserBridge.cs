using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace SingedTerra.LastStand
{
    // Fixed browser capabilities only: no credentials, arbitrary URLs or scripts.
    public sealed class LastStandBrowserBridge : MonoBehaviour, ILastStandPlatform
    {
        LastStandLoopController loop;
        public bool Fullscreen { get; private set; }
        public bool FullscreenAvailable { get; private set; }
        public string FullscreenStatus { get; private set; } = "Fullscreen unavailable on this host.";
        // Web callbacks retain their established object/method identities. Game
        // views depend on capabilities instead of the browser transport.
        public bool CanNavigate
        {
            get
            {
#if UNITY_WEBGL || UNITY_EDITOR
                return true;
#else
                return false;
#endif
            }
        }
        public bool CanOpenAccount => CanNavigate;
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void LastStandBrowser_Initialize();
        [DllImport("__Internal")] static extern void LastStandBrowser_Fullscreen();
        [DllImport("__Internal")] static extern void LastStandBrowser_Navigate(int account);
#endif
        public void Initialize(LastStandLoopController owner)
        {
            loop = owner;
#if UNITY_WEBGL && !UNITY_EDITOR
            LastStandBrowser_Initialize();
#elif !UNITY_EDITOR
            FullscreenAvailable = !Application.isMobilePlatform;
            Fullscreen = Screen.fullScreen;
            FullscreenStatus = FullscreenAvailable ? (Fullscreen ? "Fullscreen on" : "Fullscreen off") : "Display mode is managed by this device.";
#endif
        }
        public void RequestReturn(string ignored) { loop.RequestNavigation(false); }
        public void FullscreenChanged(string state)
        {
            bool refused = state == "refused" || state == "refused-on" || state == "refused-off";
            switch(state)
            {
                case "on": case "refused-on": Fullscreen=true; FullscreenAvailable=true; break;
                case "off": case "refused-off": Fullscreen=false; FullscreenAvailable=true; break;
                case "unavailable": Fullscreen=false; FullscreenAvailable=false; break;
                // Older callbacks carried only an error, not a new document
                // state. Rejection alone must not make an active fullscreen
                // session look exited. Current callbacks carry both facts.
                case "refused": break;
                default: return;
            }
            FullscreenStatus = refused ? "Fullscreen change was refused. Fullscreen remains " +
                (Fullscreen ? "on" : "off") + ". Try again with the fullscreen button." :
                state == "unavailable" ? "Fullscreen is unavailable in this browser." : Fullscreen ? "Fullscreen on" : "Fullscreen off";
            loop.RefreshControls();
        }
        public void ToggleFullscreen()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            LastStandBrowser_Fullscreen();
#elif !UNITY_EDITOR
            if (!FullscreenAvailable) return;
            Screen.fullScreen = !Screen.fullScreen;
            Fullscreen = Screen.fullScreen;
            FullscreenStatus = Fullscreen ? "Fullscreen on" : "Fullscreen off";
            loop.RefreshControls();
#endif
        }
        public void Navigate(bool account)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            LastStandBrowser_Navigate(account ? 1 : 0);
#endif
        }
    }
}
