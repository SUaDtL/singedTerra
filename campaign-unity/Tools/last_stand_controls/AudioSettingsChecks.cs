// The actual production audio classes own synthesis and routing. These doubles
// record Unity source calls; they cannot establish browser audibility or quality.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using SingedTerra.LastStand;
using SingedTerra.Encounter;
using UnityEngine;

namespace UnityEngine
{
    public enum FindObjectsInactive { Include }
    public enum FindObjectsSortMode { None }
    public class Object
    {
        public bool Destroyed;
        public static implicit operator bool(Object value) => value != null && !value.Destroyed;
        public static void Destroy(Object value) { if(value != null)value.Destroyed=true; }
        public static T[] FindObjectsByType<T>(FindObjectsInactive inactive, FindObjectsSortMode mode) { return new T[0]; }
    }
    public class Component : Object
    {
        public GameObject gameObject;
        public T GetComponent<T>() where T : Component => gameObject.GetComponent<T>();
    }
    public class MonoBehaviour : Component { }
    public class GameObject : Object
    {
        public readonly List<Component> Components = new List<Component>();
        public T AddComponent<T>() where T : Component, new() { var c=new T { gameObject=this }; Components.Add(c); return c; }
        public T GetComponent<T>() where T : Component => Components.OfType<T>().FirstOrDefault(c=>!c.Destroyed);
    }
    public sealed class AudioClip : Object
    {
        public string name;
        public float[] Samples;
        public int frequency;
        public static AudioClip Create(string name, int count, int channels, int frequency, bool stream)
            => new AudioClip { name=name, Samples=new float[count], frequency=frequency };
        public bool SetData(float[] samples, int offset) { Array.Copy(samples,0,Samples,offset,samples.Length); return true; }
    }
    public sealed class AudioSource : Component
    {
        public bool playOnAwake=true, loop, isPlaying;
        public float spatialBlend, volume=1, pitch=1;
        public int priority=128, PlayCount, StopCount;
        public AudioClip clip;
        public void Play() { isPlaying=true; PlayCount++; }
        public void Stop() { isPlaying=false; StopCount++; }
    }
    public sealed class AudioListener : Component { public static bool pause; }
    public static class Application { public static bool isFocused=true; }
    public static class Time { public static float unscaledDeltaTime=.1f, deltaTime=.1f, timeScale=1; }
    public static class Debug { public static readonly List<string> Logs=new List<string>(); public static void Log(string s) { Logs.Add(s); } }
    public static class Mathf
    {
        public const float PI=(float)Math.PI;
        public static int CeilToInt(float n)=>(int)Math.Ceiling(n);
        public static float Sin(float n)=>(float)Math.Sin(n);
        public static float Cos(float n)=>(float)Math.Cos(n);
        public static float Pow(float a,float b)=>(float)Math.Pow(a,b);
        public static float Clamp(float n,float min,float max)=>Math.Max(min,Math.Min(max,n));
        public static float Clamp01(float n)=>Clamp(n,0,1);
        public static float MoveTowards(float n,float target,float maxDelta)=>Math.Abs(target-n)<=maxDelta?target:n+Math.Sign(target-n)*maxDelta;
    }
}
namespace SingedTerra.Art
{
    public sealed class TankPresentation : Component { public Component view; }
}
namespace SingedTerra.Encounter { public enum EncounterEventKind { Cannon, Launcher, Repair, CloseHit, RangedHit, Scattergun } }
public static class AudioSettingsChecks
{
    static void Require(bool ok,string message) { if(!ok)throw new Exception(message); }
    static void Near(float actual,float expected,string message) { Require(Math.Abs(actual-expected)<.00001,message+": "+actual+" != "+expected); }
    static object Invoke(object value,string name,params object[] args)
    {
        var method=value.GetType().GetMethod(name,BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance);
        Require(method!=null,"Required audio behavior is missing: "+name);
        return method.Invoke(value,args);
    }
    static LastStandAudio Fixture()
    {
        Debug.Logs.Clear(); Application.isFocused=true; Time.timeScale=1; Time.deltaTime=Time.unscaledDeltaTime=.1f;
        var obj=new GameObject(); var tank=obj.AddComponent<SingedTerra.Art.TankPresentation>();
        tank.view=new GameObject().AddComponent<Component>();
        var audio=obj.AddComponent<LastStandAudio>();audio.Initialize();return audio;
    }
    static AudioSource[] Effects(LastStandAudio audio) => audio.gameObject.Components.OfType<AudioSource>().Where(s=>!s.loop).ToArray();
    static AudioSource Music(LastStandAudio audio)
    {
        var sources=audio.gameObject.Components.OfType<AudioSource>().Where(s=>s.loop).ToArray();
        Require(sources.Length==1,"There must be exactly one owned ambient source, got "+sources.Length);return sources[0];
    }
    static void TickMusic(LastStandAudio audio)
    {
        var owner=audio.gameObject.Components.Single(c=>c.GetType().Name=="LastStandMusic");Invoke(owner,"Update");
    }
    static void Settings(LastStandAudio audio,LastStandPreferenceValues values) { Invoke(audio,"ApplySettings",values); }
    static int EffectPlays(LastStandAudio audio)=>Effects(audio).Sum(s=>s.PlayCount);
    static void ExistingEffectAdmission()
    {
        var audio=Fixture();audio.PlayPurchase();Require(EffectPlays(audio)==0,"Locked audio refuses cues");
        audio.UnlockFromGesture("test-click");audio.PlayEvent(EncounterEventKind.Cannon,1,true);
        Require(EffectPlays(audio)==2,"Cannon retains cannon plus impact voices");
        audio.SetSuspended(true);audio.PlayDefeat();Require(EffectPlays(audio)==2,"Suspended audio refuses cues");
        Require(Effects(audio).All(s=>!s.isPlaying),"Suspension stops active effects");
        audio.SetSuspended(false);Require(EffectPlays(audio)==2,"Resume does not replay cues");
        audio.ToggleMute();audio.PlayPurchase();Require(EffectPlays(audio)==2,"Muted audio refuses cues");
        audio.ToggleMute();audio.PlayPurchase();Require(EffectPlays(audio)==3,"New unmuted cue plays");
    }
    static void ScattergunFeedbackAndHolds()
    {
        var audio=Fixture();audio.PlayEvent(EncounterEventKind.Scattergun,8,true);
        Require(EffectPlays(audio)==0,"Scattergun respects the initial gesture lock");
        audio.UnlockFromGesture("test-click");audio.PlayEvent(EncounterEventKind.Scattergun,8,true);
        Require(Debug.Logs.Contains("ST_LS_AUDIO event=scattergun") && Debug.Logs.Contains("ST_LS_AUDIO event=impact"),"distinct burst and actual impact cues route together");
        var burst=Effects(audio).Single(s=>s.clip!=null && s.clip.name=="LastStand_Scattergun").clip;
        Require(burst.Samples.Any(s=>Math.Abs(s)>.1f) && burst.Samples.All(s=>!float.IsNaN(s)&&Math.Abs(s)<=1),"Scattergun has finite non-silent unclipped PCM");
        Debug.Logs.Clear();audio.PlayEvent(EncounterEventKind.Scattergun,8,false);
        Require(Debug.Logs.Contains("ST_LS_AUDIO event=destruction"),"lethal scatter hit preserves destruction cue");
        int before=EffectPlays(audio);audio.SetSuspended(true);audio.PlayEvent(EncounterEventKind.Scattergun,8,true);
        Require(EffectPlays(audio)==before,"paused burst is refused");audio.SetSuspended(false);
        audio.ToggleMute();audio.PlayEvent(EncounterEventKind.Scattergun,8,true);
        Require(EffectPlays(audio)==before,"muted burst is refused");audio.ToggleMute();
        Invoke(audio,"OnApplicationFocus",false);audio.PlayEvent(EncounterEventKind.Scattergun,8,true);
        Require(EffectPlays(audio)==before,"hidden burst is refused");
    }
    static void InitializeDoesNotDuplicateSources()
    {
        var audio=Fixture();int before=audio.gameObject.Components.OfType<AudioSource>().Count();audio.Initialize();
        Require(audio.gameObject.Components.OfType<AudioSource>().Count()==before,"Repeated Initialize must not duplicate sources");
        Require(before==5,"Four existing effect voices plus one music source");
    }
    static void MasterAndChannelGainsChangeActiveSources()
    {
        var audio=Fixture();audio.UnlockFromGesture("test-click");audio.PlayPurchase();
        Settings(audio,LastStandPreferenceValues.Defaults.With(masterVolume:50,effectsVolume:40,musicVolume:60));
        foreach(var source in Effects(audio))Near(source.volume,.2f,"Active and future effect gain");
        for(int i=0;i<10;i++)TickMusic(audio);Near(Music(audio).volume,.3f,"Master times music gain");
        Settings(audio,LastStandPreferenceValues.Defaults.With(masterVolume:0));
        Require(Effects(audio).All(s=>!s.isPlaying)&&!Music(audio).isPlaying,"Zero master silences every channel immediately");
        int before=EffectPlays(audio);audio.PlayPurchase();Require(EffectPlays(audio)==before,"Zero master refuses new cues");
        Settings(audio,LastStandPreferenceValues.Defaults.With(effectsVolume:0));
        audio.PlayPurchase();Require(EffectPlays(audio)==before&&Music(audio).isPlaying,"Effects zero preserves music only");
        Settings(audio,LastStandPreferenceValues.Defaults.With(muted:true));Require(!Music(audio).isPlaying,"Saved master mute applies to music");
    }
    static void MusicRequiresGestureAndIgnoresCombatPause()
    {
        var audio=Fixture();Require(!Music(audio).isPlaying,"Ambient locked before gesture");
        Settings(audio,LastStandPreferenceValues.Defaults);Require(!Music(audio).isPlaying,"Applying settings never unlocks audio");
        audio.UnlockFromGesture("settings-click");Require(Music(audio).isPlaying,"Gesture admits ambient");
        audio.SetSuspended(true);Require(Music(audio).isPlaying&&!audio.CanPlay,"Manual/menu pause stops effects and preserves ambient");
        for(int i=0;i<4;i++)audio.Initialize();audio.UnlockFromGesture("second-click");
        Require(Music(audio).PlayCount==1,"Reinitialization and gestures do not restart/duplicate the loop");
        Settings(audio,LastStandPreferenceValues.Defaults.With(musicEnabled:false));Require(!Music(audio).isPlaying,"Music switch stops active loop");
        Settings(audio,LastStandPreferenceValues.Defaults);Require(Music(audio).isPlaying,"Music switch enables single current loop");
    }
    static void VisibilityAndFailureStopWithoutEffectReplay()
    {
        var audio=Fixture();audio.UnlockFromGesture("test-click");audio.PlayPurchase();
        Invoke(audio,"OnApplicationFocus",false);Require(!Music(audio).isPlaying&&Effects(audio).All(s=>!s.isPlaying),"Blur silences both");
        audio.PlayDefeat();Invoke(audio,"OnApplicationPause",true);Invoke(audio,"OnApplicationFocus",true);
        Require(!Music(audio).isPlaying,"Focus cannot clear hidden state");
        Invoke(audio,"OnApplicationPause",false);Require(Music(audio).isPlaying&&EffectPlays(audio)==1,"Visibility restores ambient only, no cue history");
        Invoke(audio,"SetMusicSuspended",true);audio.SetSuspended(true);
        Require(!Music(audio).isPlaying,"Failure/global suspension silences ambient");
        Invoke(audio,"OnApplicationFocus",false);Invoke(audio,"OnApplicationFocus",true);
        Require(!Music(audio).isPlaying,"Focus return cannot clear owner failure suspension");
        Invoke(audio,"SetMusicSuspended",false);Require(Music(audio).isPlaying&&EffectPlays(audio)==1,"Recovery restores ambient without effects replay");
    }
    static void EffectPreviewRequiresALiveGestureContext()
    {
        var audio=Fixture();audio.SetSuspended(true);Invoke(audio,"PreviewEffect");
        Require(audio.Unlocked&&EffectPlays(audio)==1&&audio.Suspended,"Actual preview gesture works in paused settings without clearing pause");
        Invoke(audio,"OnApplicationFocus",false);Invoke(audio,"PreviewEffect");Require(EffectPlays(audio)==1,"Hidden preview is refused");
        Invoke(audio,"OnApplicationFocus",true);Invoke(audio,"SetMusicSuspended",true);Invoke(audio,"PreviewEffect");Require(EffectPlays(audio)==1,"Failure preview is refused");
        Invoke(audio,"SetMusicSuspended",false);audio.ToggleMute();Invoke(audio,"PreviewEffect");Require(EffectPlays(audio)==1,"Muted preview is refused");
    }
    static void MusicIsDeterministicBoundedAndSeamless()
    {
        var first=Music(Fixture()).clip;var second=Music(Fixture()).clip;
        Require(first.Samples.Length>=first.frequency*16,"Ambient spans at least sixteen seconds");
        Require(first.Samples.SequenceEqual(second.Samples),"Generated source is deterministic");
        double squares=0,maximum=0,jump=0;
        for(int i=0;i<first.Samples.Length;i++)
        {
            float v=first.Samples[i];Require(!float.IsNaN(v)&&!float.IsInfinity(v),"Finite PCM");
            squares+=v*v;maximum=Math.Max(maximum,Math.Abs(v));
            jump=Math.Max(jump,Math.Abs(v-first.Samples[(i+1)%first.Samples.Length]));
        }
        Require(Math.Sqrt(squares/first.Samples.Length)>.015,"Ambient has actual measurable energy");
        Require(maximum<.35&&jump<.04,"Restrained unclipped loop without discontinuities");
        Require(Math.Abs(first.Samples[0]-first.Samples[first.Samples.Length-1])<.003,"Loop seam is continuous");
    }
    static void MusicTransitionUsesUnscaledTimeAndNormalPitch()
    {
        var audio=Fixture();audio.UnlockFromGesture("test-click");var music=Music(audio);
        Near(music.volume,0,"New loop starts at zero gain");Time.timeScale=0;Time.deltaTime=0;Time.unscaledDeltaTime=.1f;
        TickMusic(audio);Require(music.volume>0&&music.volume<.2f,"Music fades in while simulation paused");
        for(int i=0;i<10;i++)TickMusic(audio);Near(music.volume,.2f,"Fade reaches configured gain");
        Time.timeScale=5;Time.deltaTime=.5f;audio.PlayPurchase();
        Require(Effects(audio).All(s=>s.pitch==1)&&music.pitch==1,"All audio keeps normal pitch at changed game speed");
        Settings(audio,LastStandPreferenceValues.Defaults.With(musicVolume:10));TickMusic(audio);
        Require(music.volume<.2f&&music.volume>=.1f,"Active ambient gain follows setting with a transition");
    }
    public static int Main(string[] args)
    {
        try
        {
            switch(args[0])
            {
                case "existing_effect_admission":ExistingEffectAdmission();break;
                case "scattergun_feedback_and_holds":ScattergunFeedbackAndHolds();break;
                case "initialize_does_not_duplicate_sources":InitializeDoesNotDuplicateSources();break;
                case "master_and_channel_gains_change_active_sources":MasterAndChannelGainsChangeActiveSources();break;
                case "music_requires_gesture_and_ignores_combat_pause":MusicRequiresGestureAndIgnoresCombatPause();break;
                case "visibility_and_failure_stop_without_effect_replay":VisibilityAndFailureStopWithoutEffectReplay();break;
                case "effect_preview_requires_a_live_gesture_context":EffectPreviewRequiresALiveGestureContext();break;
                case "music_is_deterministic_bounded_and_seamless":MusicIsDeterministicBoundedAndSeamless();break;
                case "music_transition_uses_unscaled_time_and_normal_pitch":MusicTransitionUsesUnscaledTimeAndNormalPitch();break;
                default:throw new Exception("Unknown case");
            }
            Console.WriteLine("PASS "+args[0]);return 0;
        }
        catch(Exception e) { Console.Error.WriteLine(e.ToString());return 1; }
    }
}
