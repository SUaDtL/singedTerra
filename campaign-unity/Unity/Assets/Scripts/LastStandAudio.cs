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
        AudioClip cannon, impact, destruction, defeat, purchase;
        int cursor;
        bool unlocked, suspended;
        public bool Unlocked => unlocked;
        public bool Suspended => suspended;
        public bool Muted { get; private set; }
        public bool CanPlay => unlocked && !Muted && !suspended && Application.isFocused;

        public void Initialize()
        {
            var listeners=FindObjectsByType<AudioListener>(FindObjectsInactive.Include,FindObjectsSortMode.None);
            if(listeners.Length==0)
                GetComponent<SingedTerra.Art.TankPresentation>().view.gameObject.AddComponent<AudioListener>();
            cannon = Tone("Cannon", 125,.23f,.38f,3);
            impact = Tone("Impact", 310,.13f,.20f,2);
            destruction = Tone("Destruction", 95,.32f,.33f,5);
            defeat = Tone("Defeat", 190,.54f,.25f,4);
            purchase = Tone("Purchase", 520,.22f,.26f,1);
            for (int i=0;i<Voices;i++)
            {
                sources[i]=gameObject.AddComponent<AudioSource>();
                sources[i].playOnAwake=false; sources[i].spatialBlend=0;
            }
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
        public void UnlockFromGesture(string action) { unlocked=true; AudioListener.pause=false; Debug.Log("ST_LS_AUDIO unlock="+action); }
        public void ToggleMute()
        {
            Muted=!Muted; if(Muted)Stop();
            Debug.Log("ST_LS_AUDIO mute="+Muted);
        }
        public void SetSuspended(bool value)
        {
            if(value && !suspended) Stop();
            suspended=value;
        }
        void Stop() { foreach(var source in sources)if(source)source.Stop(); }
        void Play(AudioClip clip, string identity)
        {
            if(!CanPlay || !clip)return;
            var source=sources[cursor++%Voices]; source.Stop(); source.clip=clip; source.Play();
            Debug.Log("ST_LS_AUDIO event="+identity);
        }
        public void PlayEvent(EncounterEventKind kind, int amount, bool targetAlive)
        {
            switch(kind)
            {
                case EncounterEventKind.Cannon: Play(cannon,"cannon"); Play(targetAlive?impact:destruction,targetAlive?"impact":"destruction"); break;
                case EncounterEventKind.Launcher: Play(targetAlive?impact:destruction,targetAlive?"impact":"destruction"); break;
                case EncounterEventKind.CloseHit:
                case EncounterEventKind.RangedHit: Play(impact,"impact"); break;
            }
        }
        public void PlayDefeat() { Play(defeat,"defeat"); }
        public void PlayPurchase() { Play(purchase,"purchase"); }
        void OnApplicationFocus(bool focused) { if(!focused)SetSuspended(true); }
        void OnApplicationPause(bool paused) { if(paused)SetSuspended(true); }
        void OnDestroy()
        {
            foreach(var clip in new[]{cannon,impact,destruction,defeat,purchase})if(clip)Destroy(clip);
        }
    }
}
