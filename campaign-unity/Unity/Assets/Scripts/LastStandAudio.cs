using System;
using UnityEngine;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // Generated once in memory; no external sound assets or middleware.
    public sealed class LastStandAudio : MonoBehaviour
    {
        const int Voices = 4;
        readonly AudioSource[] sources = new AudioSource[Voices];
        AudioClip cannon, impact, destruction, defeat, purchase, scattergun;
        LastStandMusic music;
        int cursor;
        bool initialized, unlocked, suspended, musicSuspended;
        bool focused, applicationPaused;
        float masterGain=1, effectsGain=1, musicGain=.2f;
        public bool Unlocked => unlocked;
        public bool Suspended => suspended;
        public bool Muted { get; private set; }
        public bool MusicEnabled { get; private set; } = true;
        bool ForegroundAudio => initialized && unlocked && !Muted && focused && !applicationPaused && masterGain>0;
        public bool CanPlay => ForegroundAudio && !suspended && effectsGain>0;
        public bool MusicCanPlay => ForegroundAudio && !musicSuspended && MusicEnabled && musicGain>0;

        public void Initialize()
        {
            if(initialized)return;
            focused = Application.isFocused;
            var listeners=FindObjectsByType<AudioListener>(FindObjectsInactive.Include,FindObjectsSortMode.None);
            if(listeners.Length==0)
                GetComponent<SingedTerra.Art.TankPresentation>().view.gameObject.AddComponent<AudioListener>();
            cannon = Tone("Cannon", 125,.23f,.38f,3);
            impact = Tone("Impact", 310,.13f,.20f,2);
            destruction = Tone("Destruction", 95,.32f,.33f,5);
            defeat = Tone("Defeat", 190,.54f,.25f,4);
            purchase = Tone("Purchase", 520,.22f,.26f,1);
            scattergun = Tone("Scattergun", 175,.17f,.30f,7);
            for (int i=0;i<Voices;i++)
            {
                sources[i]=gameObject.AddComponent<AudioSource>();
                sources[i].playOnAwake=false; sources[i].spatialBlend=0;
                sources[i].pitch=1;
            }
            music=gameObject.AddComponent<LastStandMusic>(); music.Initialize();
            initialized=true;
            ApplyGains();
        }
        static AudioClip Tone(string name, float frequency, float duration, float amplitude, int character)
        {
            const int rate=22050; int count=Mathf.CeilToInt(rate*duration);
            var samples=new float[count];
            for(int i=0;i<count;i++)
            {
                float t=i/(float)rate, progress=i/(float)count;
                float envelope=Mathf.Sin(Mathf.PI*progress)*Mathf.Pow(1-progress,.65f);
                float f=frequency*(1-.4f*progress);
                float tone=Mathf.Sin(2*Mathf.PI*f*t)+.35f*Mathf.Sin(2*Mathf.PI*f*(character+1)*t);
                float texture=Mathf.Sin(2*Mathf.PI*(f*7+character*23)*t)*.14f;
                samples[i]=Mathf.Clamp((tone+texture)*envelope*amplitude,-1,1);
            }
            var clip=AudioClip.Create("LastStand_"+name,count,1,rate,false); clip.SetData(samples,0); return clip;
        }
        // Only real pointer/keyboard action owners call this. Applying loaded
        // settings, focus changes and ticking never unlock browser audio.
        public void UnlockFromGesture(string action)
        {
            unlocked=true; AudioListener.pause=false; SyncMusic();
            Debug.Log("ST_LS_AUDIO unlock="+action);
        }
        public void ApplySettings(LastStandPreferenceValues values)
        {
            if(values==null)throw new ArgumentNullException(nameof(values));
            Muted=values.Muted;
            masterGain=Mathf.Clamp01(values.MasterVolume/100f);
            effectsGain=Mathf.Clamp01(values.EffectsVolume/100f);
            musicGain=Mathf.Clamp01(values.MusicVolume/100f);
            MusicEnabled=values.MusicEnabled;
            ApplyGains();
        }
        public void ToggleMute()
        {
            Muted=!Muted; ApplyGains();
            Debug.Log("ST_LS_AUDIO mute="+Muted);
        }
        void ApplyGains()
        {
            float gain=Muted?0:masterGain*effectsGain;
            foreach(var source in sources)if(source)source.volume=gain;
            if(gain<=0)Stop();
            SyncMusic();
        }
        void SyncMusic() { if(music)music.SetPlayback(MusicCanPlay,masterGain*musicGain); }
        public void SetSuspended(bool value)
        {
            if(value && !suspended) Stop();
            suspended=value;
        }
        // This is the independent failure/visibility hold. Foreground menu and
        // manual pause use SetSuspended, so music retains its wall-time tempo.
        public void SetMusicSuspended(bool value)
        {
            musicSuspended=value; SyncMusic();
        }
        void Stop() { foreach(var source in sources)if(source)source.Stop(); }
        void Play(AudioClip clip, string identity, bool preview=false)
        {
            bool admitted=preview?ForegroundAudio && !musicSuspended && effectsGain>0:CanPlay;
            if(!admitted || !clip)return;
            var source=sources[cursor++%Voices]; source.Stop(); source.clip=clip; source.Play();
            Debug.Log("ST_LS_AUDIO event="+identity);
        }
        public void PreviewEffect()
        {
            // The sample button is a deliberate audio gesture. It does not
            // remove the run/menu pause or queue a cue for later playback.
            if(!initialized || !focused || applicationPaused || musicSuspended)return;
            UnlockFromGesture("effects-preview"); Play(cannon,"preview",true);
        }
        public void PlayEvent(EncounterEventKind kind, int amount, bool targetAlive)
        {
            switch(kind)
            {
                case EncounterEventKind.Cannon: Play(cannon,"cannon"); Play(targetAlive?impact:destruction,targetAlive?"impact":"destruction"); break;
                case EncounterEventKind.Launcher: Play(targetAlive?impact:destruction,targetAlive?"impact":"destruction"); break;
                case EncounterEventKind.Scattergun: Play(scattergun,"scattergun"); Play(targetAlive?impact:destruction,targetAlive?"impact":"destruction"); break;
                case EncounterEventKind.CloseHit:
                case EncounterEventKind.RangedHit: Play(impact,"impact"); break;
            }
        }
        public void PlayDefeat() { Play(defeat,"defeat"); }
        public void PlayPurchase() { Play(purchase,"purchase"); }
        // Visibility callbacks own visibility only. The controller owns explicit
        // Pause/failure/catch-up suspension, which focus return must not clear.
        void OnApplicationFocus(bool value) { focused=value; if(!value)Stop(); SyncMusic(); }
        void OnApplicationPause(bool value) { applicationPaused=value; if(value)Stop(); SyncMusic(); }
        void OnDestroy()
        {
            Stop();
            if(music) { music.SetPlayback(false,0); Destroy(music); }
            foreach(var source in sources)if(source)Destroy(source);
            foreach(var clip in new[]{cannon,impact,destruction,defeat,purchase,scattergun})if(clip)Destroy(clip);
        }
    }
}
