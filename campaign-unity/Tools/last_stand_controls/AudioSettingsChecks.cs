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
        public static Action AfterPlay, BeforeStop;
        public void Play() { isPlaying=true; PlayCount++; AfterPlay?.Invoke(); }
        public void Stop() { BeforeStop?.Invoke(); isPlaying=false; StopCount++; }
    }
    public sealed class AudioListener : Component { public static bool pause; }
    public static class Application { public static bool isFocused=true; }
    public static class Time { public static double realtimeSinceStartupAsDouble; public static float unscaledDeltaTime=.1f, deltaTime=.1f, timeScale=1; }
    public static class JsonUtility { public static readonly List<object> Values=new List<object>(); public static string ToJson(object value) { Values.Add(value); return "{}"; } }
    public static class Debug { public static readonly List<string> Logs=new List<string>(); public static Action<string> AfterLog; public static void Log(string s) { Logs.Add(s); AfterLog?.Invoke(s); } }
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
// Source-extracted caller uses real domain types. These stand-ins supply only
// owner inputs and capture the authoritative telemetry invocation.
namespace SingedTerra.LastStand
{
    public static class LastStandObservations { public static int Hits;public static void Hit(EncounterModel model){Hits++;} }
}
public partial class ActualAudioCaller
{
    public sealed class SessionInputs
    {
        public EncounterModel Model;public bool Paused,CanRun=true;public string Failure="";
        public int StepsThisCallback=1;public double CallbackElapsedSeconds=.05;
    }
    public LastStandShopState runShop { get;set; }
    public LastStandProgression Progression { get;set; }
    public LastStandAudio Audio;public SessionInputs Session=new SessionInputs();
    public string Phase="battle";public bool suppressCallbackFeedback,failedRun,MenuOpen;public int Recorded,Discarded;
    public void RecordActiveStep(){Recorded++;}public void DiscardMissedFeedback(){Discarded++;}
}

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
        Debug.Logs.Clear(); Debug.AfterLog=null; AudioSource.AfterPlay=null; AudioSource.BeforeStop=null; Time.realtimeSinceStartupAsDouble=.496; Application.isFocused=true; Time.timeScale=1; Time.deltaTime=Time.unscaledDeltaTime=.1f;
        var obj=new GameObject(); var tank=obj.AddComponent<SingedTerra.Art.TankPresentation>();
        tank.view=new GameObject().AddComponent<Component>();
        var audio=obj.AddComponent<LastStandAudio>();audio.Initialize();
        int ordinal=0; audio.CombatAdmission=cue=>LastStandAudioCue.Prepare(cue,1,1,0,10,10,++ordinal,.496,0,0,true);
        JsonUtility.Values.Clear();return audio;
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
    static void EachCombatCueUsesItsOwnFreshPlaybackBoundary()
    {
        var audio=Fixture();audio.UnlockFromGesture("test-click");
        AudioSource.AfterPlay=()=>Time.realtimeSinceStartupAsDouble+=.005;
        audio.PlayEvent(EncounterEventKind.Cannon,1,false);
        Require(EffectPlays(audio)==1,"Second cue after the 500ms boundary must be suppressed independently");
        AudioSource.AfterPlay=null;
        int before=EffectPlays(audio);audio.PlayDefeat();
        Require(EffectPlays(audio)==before,"Terminal cue uses the same expired callback");
        audio.PlayPurchase();audio.PreviewEffect();
        Require(EffectPlays(audio)==before+2,"Gesture cues do not inherit the expired gameplay callback");
    }
    static LastStandAudioCue Decision(string cue,int id,int run,int from,int tick,int steps,int ordinal,
        double timestamp,double previous,double now,double pending,bool eligible)
    { var value=LastStandAudioCue.Prepare(cue,id,run,from,tick,steps,ordinal,timestamp,previous,pending,eligible);value.Admit(now);return value; }
    static void PlaybackBoundaryClocksPreparationAndDiagnostics()
    {
        foreach(double now in new[]{.5,.500001,.495,-1,double.NaN,double.PositiveInfinity})
        {
            var audio=Fixture();audio.UnlockFromGesture("test-click");Time.realtimeSinceStartupAsDouble=now;
            audio.PlayDefeat();
            var decision=JsonUtility.Values.OfType<LastStandAudioCue>().Single();
            Require(EffectPlays(audio)==(now==.5?1:0),"Exact500ms boundary and invalid/backward clocks fail closed");
            Require(decision.admittedAt.Equals(now),"Witness keeps the sampled clock without clamping");
        }
        var active=Fixture();active.UnlockFromGesture("test-click");
        active.PlayEvent(EncounterEventKind.Cannon,1,true);active.PlayEvent(EncounterEventKind.Cannon,1,true);
        var voices=Effects(active);int stops=voices.Sum(v=>v.StopCount);
        Time.realtimeSinceStartupAsDouble=.501;active.PlayEvent(EncounterEventKind.Cannon,1,true);
        Require(voices.All(v=>v.isPlaying) && voices.Sum(v=>v.StopCount)==stops && EffectPlays(active)==4,
            "Already expired attempts leave all active voices and ring position alone");
        Time.realtimeSinceStartupAsDouble=.496;active.PlayDefeat();
        Require(voices[0].clip.name=="LastStand_Defeat","Expired attempts never consume the next ring voice");
        var prepared=Fixture();prepared.UnlockFromGesture("test-click");
        AudioSource.BeforeStop=()=>Time.realtimeSinceStartupAsDouble+=.005;
        prepared.PlayEvent(EncounterEventKind.Cannon,1,true);
        Require(EffectPlays(prepared)==0 && JsonUtility.Values.OfType<LastStandAudioCue>().All(c=>!c.played&&c.reason=="expired"),
            "Slow source preparation is included before every actual playback admission");
        var logged=Fixture();logged.UnlockFromGesture("test-click");
        Debug.AfterLog=s=>{if(s.StartsWith("ST_ENC_CALLBACK"))Time.realtimeSinceStartupAsDouble+=.01;};
        logged.PlayEvent(EncounterEventKind.Cannon,1,false);
        var attempts=JsonUtility.Values.OfType<LastStandAudioCue>().ToArray();
        Require(EffectPlays(logged)==1 && attempts.Length==2 && attempts[0].played && attempts[0].admittedAt==.496 &&
            !attempts[1].played && attempts[1].reason=="expired" && attempts[1].ordinal==2,
            "Post-Play logging never rewrites admission, but its cost counts before the next cue");
        Debug.AfterLog=null;int before=EffectPlays(logged);Time.realtimeSinceStartupAsDouble=.496;
        Require(EffectPlays(logged)==before,"Suppressed attempts never queue on time/focus change");
        logged.PlayEvent(EncounterEventKind.Cannon,1,true);Require(EffectPlays(logged)==before+2,"Only new model events play");
        logged.CombatAdmission=null;before=EffectPlays(logged);logged.PlayDefeat();
        Require(EffectPlays(logged)==before,"Missing callback context refuses combat playback");
        foreach(var kind in new[]{EncounterEventKind.Launcher,EncounterEventKind.Scattergun,EncounterEventKind.CloseHit,EncounterEventKind.RangedHit})
        {
            var audio=Fixture();audio.UnlockFromGesture("test-click");Time.realtimeSinceStartupAsDouble=.501;
            audio.PlayEvent(kind,1,false);Require(EffectPlays(audio)==0 && JsonUtility.Values.OfType<LastStandAudioCue>().Any(),
                "Every combat path retains an expired disposition");
        }
        foreach(var decision in new[]{
            Decision("cannon",1,1,0,11,11,1,.496,0,.496,0,true),
            Decision("cannon",1,1,0,1,1,1,.496,0,.496,.05,true),
            Decision("cannon",1,1,0,1,1,1,.501,0,.501,0,true),
            Decision("cannon",1,1,0,1,1,1,.496,0,.496,0,false)})
            Require(!decision.played && decision.reason=="callback","Recent cue cannot excuse oversized, stale, indebted or unfocused callback");
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
    static void Batch(LastStandAudio audio,IReadOnlyList<EncounterEvent> events)=>Invoke(audio,"PlayEvents",events);
    static string[] Played()=>Debug.Logs.Where(x=>x.StartsWith("ST_LS_AUDIO event=")).Select(x=>x.Substring("ST_LS_AUDIO event=".Length)).ToArray();
    static void NewWeaponCues()
    {
        var clips=new List<AudioClip>();
        foreach(var kind in new[]{EncounterEventKind.Mortar,EncounterEventKind.Railgun}){
            var audio=Fixture();audio.PlayEvent(kind,18,true);Require(EffectPlays(audio)==0,"New cue remains gesture-locked");
            audio.UnlockFromGesture("test-click");audio.PlayEvent(kind,18,true);
            string cue=kind.ToString().ToLowerInvariant();Require(Played().SequenceEqual(new[]{cue,"impact"}),"New weapon must have distinct firing and actual impact cue: "+cue);
            var clip=Effects(audio).Single(x=>x.clip!=null&&x.clip.name=="LastStand_"+kind).clip;clips.Add(clip);
            Require(clip.Samples.Any(x=>Math.Abs(x)>.1f)&&clip.Samples.All(x=>!float.IsNaN(x)&&!float.IsInfinity(x)&&Math.Abs(x)<=1),"New weapon PCM is finite and non-silent");
            Debug.Logs.Clear();audio.PlayEvent(kind,18,false);Require(Played().SequenceEqual(new[]{cue,"destruction"}),"Lethal new weapon retains destruction cue");
        }
        Require(!clips[0].Samples.SequenceEqual(clips[1].Samples),"Mortar and Railgun have distinct actual synthesized data");
    }
    static void MortarBatch()
    {
        foreach(int victims in new[]{1,2,20})foreach(bool lethal in new[]{false,true}){
            var audio=Fixture();audio.UnlockFromGesture("test-click");var events=new List<EncounterEvent>();
            for(int n=0;n<victims;n++)events.Add(new EncounterEvent(EncounterEventKind.Mortar,n,18,lethal&&n==victims-1,0));
            Batch(audio,events);Require(EffectPlays(audio)==2&&Played().SequenceEqual(new[]{"mortar",lethal?"destruction":"impact"}),"Victim fanout must remain one firing plus one aggregate impact");
            Require(Effects(audio).Length==4,"Blast cannot grow the four-voice pool");
            Debug.Logs.Clear();Batch(audio,Array.Empty<EncounterEvent>());Require(Played().Length==0&&EffectPlays(audio)==2,"Empty step has no replay");
            Batch(audio,events);Require(EffectPlays(audio)==4,"New step at same aim slot is a fresh blast");
        }
        var mixed=Fixture();mixed.UnlockFromGesture("test-click");
        Batch(mixed,new[]{new EncounterEvent(EncounterEventKind.Cannon,0,20),new EncounterEvent(EncounterEventKind.Mortar,1,18,false,2),
            new EncounterEvent(EncounterEventKind.Mortar,2,18,true,2)});
        Require(Played().SequenceEqual(new[]{"cannon","impact","mortar","destruction"})&&EffectPlays(mixed)==4,"Cannon order stays unchanged before one aggregated Mortar pair");
        var two=Fixture();two.UnlockFromGesture("test-click");Batch(two,new[]{new EncounterEvent(EncounterEventKind.Mortar,0,18,false,0),new EncounterEvent(EncounterEventKind.Mortar,2,18,true,2),new EncounterEvent(EncounterEventKind.Mortar,1,18,false,0)});
        Require(Played().SequenceEqual(new[]{"mortar","impact","mortar","destruction"}),"Separate AimSlot blast groups stay separate without per-victim fanout");
    }
    static void BatchHolds()
    {
        foreach(var kind in new[]{EncounterEventKind.Mortar,EncounterEventKind.Railgun}){
            foreach(double now in new[]{.5,.500001}){
                var boundary=Fixture();boundary.UnlockFromGesture("test-click");Time.realtimeSinceStartupAsDouble=now;
                Batch(boundary,new[]{new EncounterEvent(kind,0,40)});
                Require(EffectPlays(boundary)==(now==.5?2:0),"New batch retains the exact500ms playback boundary");
            }
            var events=new[]{new EncounterEvent(kind,0,40,true)};var audio=Fixture();audio.UnlockFromGesture("test-click");
            AudioSource.AfterPlay=()=>Time.realtimeSinceStartupAsDouble+=.005;Batch(audio,events);
            var decisions=JsonUtility.Values.OfType<LastStandAudioCue>().ToArray();
            Require(EffectPlays(audio)==1&&decisions.Length==2&&decisions[0].played&&!decisions[1].played&&decisions[1].reason=="expired","Aggregate companion has its own fresh boundary");
            foreach(string hold in new[]{"pause","mute","focus","application","gain","callback"}){
                audio=Fixture();audio.UnlockFromGesture("test-click");
                if(hold=="pause")audio.SetSuspended(true);else if(hold=="mute")audio.ToggleMute();else if(hold=="focus")Invoke(audio,"OnApplicationFocus",false);
                else if(hold=="application")Invoke(audio,"OnApplicationPause",true);else if(hold=="gain")Settings(audio,LastStandPreferenceValues.Defaults.With(effectsVolume:0));
                else audio.CombatAdmission=cue=>LastStandAudioCue.Prepare(cue,1,1,0,11,11,1,.496,0,0,true);
                Batch(audio,events);Require(EffectPlays(audio)==0,"New batch obeys hold: "+hold);
                audio.SetSuspended(false);Settings(audio,LastStandPreferenceValues.Defaults);Invoke(audio,"OnApplicationFocus",true);Invoke(audio,"OnApplicationPause",false);
                Require(EffectPlays(audio)==0,"Recovery does not replay a discarded batch");
            }
        }
    }
    static void InvalidBatch()
    {
        var audio=Fixture();audio.UnlockFromGesture("test-click");audio.PlayEvent(EncounterEventKind.Cannon,20,true);
        var sources=Effects(audio);int stops=sources.Sum(s=>s.StopCount),plays=EffectPlays(audio);
        var clips=sources.Select(s=>s.clip).ToArray();int decisions=JsonUtility.Values.Count;
        foreach(var events in new IReadOnlyList<EncounterEvent>[] {null,
            new[]{new EncounterEvent(EncounterEventKind.Cannon,0,20),new EncounterEvent(EncounterEventKind.Mortar,-1,18)},
            new[]{new EncounterEvent(EncounterEventKind.Cannon,0,20),new EncounterEvent(EncounterEventKind.Mortar,0,18,false,EncounterModel.Capacity)}}){
            bool rejected=false;try{audio.PlayEvents(events);}catch(ArgumentException){rejected=true;}
            Require(rejected,"Malformed blast batch must be rejected before playback");
            Require(EffectPlays(audio)==plays&&sources.Sum(s=>s.StopCount)==stops&&sources.Select(s=>s.clip).SequenceEqual(clips)&&JsonUtility.Values.Count==decisions,
                "Rejected batch cannot consume a voice, stop active sound or issue a cue witness");
        }
        Batch(audio,new[]{new EncounterEvent(EncounterEventKind.Mortar,0,18)});
        Require(EffectPlays(audio)==plays+2&&sources[2].clip.name=="LastStand_Mortar"&&sources[3].clip.name=="LastStand_Impact",
            "Rejected input leaves the next voice and fresh blast admission intact");
    }
    sealed class MemoryStore:ILastStandStorage { string raw;public string Read()=>raw;public void Write(string value){raw=value;} }
    static EncounterModel MortarStep()
    {
        var m=new EncounterModel(LastStandFitting.Mortar,EncounterProfile.ForTier(2));
        typeof(EncounterModel).GetField("nextSpawn",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(m,10000);
        for(int n=0;n<2;n++){var f=m.Foes[n];f.Id=n==0?5:1;f.Kind=FoeKind.ArmoredBrute;f.Lane=0;f.Distance=n==0?18500:18000;f.Hull=f.MaximumHull=n==0?10:1000;f.Damage=1;}
        m.Step();Require(m.Events.Count(e=>e.Kind==EncounterEventKind.Cannon)==1&&m.Events.Count(e=>e.Kind==EncounterEventKind.Mortar)==2,"Actual model produced Cannon and one two-victim blast");return m;
    }
    static void ActualCaller()
    {
        foreach(bool suppressed in new[]{false,true}){
            var audio=Fixture();audio.UnlockFromGesture("test-click");var model=MortarStep();string before=model.Snapshot();
            var caller=new ActualAudioCaller{Audio=audio,Progression=LastStandProgression.Load(new MemoryStore(),()=>1790000000000L)};
            caller.Session.Model=model;caller.Session.CallbackElapsedSeconds=suppressed?.501:.05;LastStandObservations.Hits=0;
            caller.OnSessionStepped(model);
            Require(EffectPlays(audio)==(suppressed?0:4),"Actual controller must route one batch without multi-victim amplification");
            Require(LastStandObservations.Hits==1&&model.Snapshot()==before,"Authoritative Cannon telemetry survives sound suppression without model changes");
            if(suppressed)Require(caller.Discarded==1&&caller.suppressCallbackFeedback,"Delayed callback preserves discard/debt owner");
        }
    }
    static void Cleanup()
    {
        var audio=Fixture();audio.UnlockFromGesture("test-click");
        var fields=typeof(LastStandAudio).GetFields(BindingFlags.Instance|BindingFlags.NonPublic).Where(f=>f.FieldType==typeof(AudioClip)).ToArray();
        var clips=fields.Select(f=>(AudioClip)f.GetValue(audio)).ToArray();Require(clips.Length==8&&clips.All(c=>c!=null),"All old/new effects are initialized exactly once");
        var sources=Effects(audio);Invoke(audio,"OnDestroy");Require(clips.All(c=>c.Destroyed)&&sources.All(s=>s.Destroyed&&!s.isPlaying),"Owned new clips and existing pool are destroyed");
    }
    public static int Main(string[] args)
    {
        try
        {
            switch(args[0])
            {
                case "each_combat_cue_uses_its_own_fresh_playback_boundary":EachCombatCueUsesItsOwnFreshPlaybackBoundary();break;
                case "playback_boundary_clocks_preparation_and_diagnostics":PlaybackBoundaryClocksPreparationAndDiagnostics();break;
                case "existing_effect_admission":ExistingEffectAdmission();break;
                case "new_weapon_cues":NewWeaponCues();break;
                case "mortar_batch":MortarBatch();break;
                case "batch_holds":BatchHolds();break;
                case "actual_caller":ActualCaller();break;
                case "cleanup":Cleanup();break;
                case "invalid_batch":InvalidBatch();break;
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
