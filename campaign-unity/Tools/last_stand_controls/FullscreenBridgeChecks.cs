// Compile the real bridge against a minimal host API; no fullscreen/browser
// behavior is claimed by these C# state-projection checks.
using System;
using SingedTerra.LastStand;
namespace UnityEngine
{
    public class MonoBehaviour { }
    public static class Time { public static double realtimeSinceStartupAsDouble => 0; }
    public static class Application { public static bool isMobilePlatform => false; }
    public static class Screen { public static bool fullScreen; }
}
namespace SingedTerra.LastStand
{
    public sealed class LastStandLoopController
    {
        public int RefreshCount;
        public void RefreshControls() { RefreshCount++; }
        public void RequestNavigation(bool account) { }
    }
}
public static class FullscreenBridgeChecks
{
    static void Require(bool condition,string message) { if(!condition)throw new Exception(message); }
    public static int Main(string[] args)
    {
        try
        {
            var owner=new LastStandLoopController();var bridge=new LastStandBrowserBridge();bridge.Initialize(owner);
            switch(args[0])
            {
                case "legacy_refusal_preserves_observed_fullscreen":
                    bridge.FullscreenChanged("on");bridge.FullscreenChanged("refused");
                    Require(bridge.Fullscreen&&bridge.FullscreenAvailable,"legacy rejection must not erase observed fullscreen");
                    Require(bridge.FullscreenStatus.Contains("refused")&&bridge.FullscreenStatus.Contains("on"),"refusal status states current on state");break;
                case "exit_refusal_preserves_actual_on_state":
                    bridge.FullscreenChanged("on");bridge.FullscreenChanged("refused-on");
                    Require(bridge.Fullscreen&&bridge.FullscreenAvailable,"rejected exit still has real fullscreen element");
                    Require(bridge.FullscreenStatus.Contains("refused")&&bridge.FullscreenStatus.Contains("on"),"rejected exit reports actual on state");break;
                case "enter_refusal_preserves_actual_off_state":
                    bridge.FullscreenChanged("off");bridge.FullscreenChanged("refused-off");
                    Require(!bridge.Fullscreen&&bridge.FullscreenAvailable,"rejected enter remains off and retryable");
                    Require(bridge.FullscreenStatus.Contains("refused")&&bridge.FullscreenStatus.Contains("off"),"rejected enter reports actual off state");break;
                case "atomic_refusal_replaces_stale_state":
                    bridge.FullscreenChanged("on");bridge.FullscreenChanged("refused-off");
                    Require(!bridge.Fullscreen,"refusal reports document state, not stale prior on state");
                    bridge.FullscreenChanged("refused-on");Require(bridge.Fullscreen,"refusal can report newly entered actual fullscreen");break;
                case "change_event_clears_refusal_and_unsupported_disables":
                    bridge.FullscreenChanged("refused-on");bridge.FullscreenChanged("off");
                    Require(!bridge.Fullscreen&&bridge.FullscreenStatus=="Fullscreen off","actual subsequent change clears error");
                    bridge.FullscreenChanged("unavailable");Require(!bridge.Fullscreen&&!bridge.FullscreenAvailable,"unsupported capability stays disabled");break;
                case "unknown_callback_does_not_invent_state":
                    bridge.FullscreenChanged("on");int refreshed=owner.RefreshCount;bridge.FullscreenChanged("unexpected");
                    Require(bridge.Fullscreen&&owner.RefreshCount==refreshed,"unknown host callback cannot reset observed state");break;
                default:throw new Exception("Unknown case");
            }
            Console.WriteLine("PASS "+args[0]);return 0;
        }
        catch(Exception error) { Console.Error.WriteLine(error);return 1; }
    }
}
