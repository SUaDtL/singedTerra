using System;
using UnityEngine;

namespace SingedTerra.LastStand
{
    // Original project-owned ambient piece, "Holding Ground". Deterministic
    // additive synthesis is the complete source; no recordings or samples.
    // Every oscillator and envelope uses whole cycles in the same 32-second
    // period, including the sparse machinery pulse, so the PCM joins smoothly.
    public sealed class LastStandMusic : MonoBehaviour
    {
        const int SampleRate=22050;
        const int LoopSeconds=32;
        const float FadeSeconds=.6f;
        AudioSource source;
        AudioClip clip;
        float targetGain, fadeRate;

        public void Initialize()
        {
            if(source)return;
            clip=AudioClip.Create("LastStand_HoldingGround",SampleRate*LoopSeconds,1,SampleRate,false);
            clip.SetData(Compose(),0);
            source=gameObject.AddComponent<AudioSource>();
            source.playOnAwake=false; source.loop=true; source.spatialBlend=0;
            source.pitch=1; source.volume=0;
            source.clip=clip;
        }

        static float[] Compose()
        {
            var samples=new float[SampleRate*LoopSeconds];
            const double Tau=2*Math.PI;
            for(int i=0;i<samples.Length;i++)
            {
                double cycle=i/(double)samples.Length;
                // D/A/F/C partials swell across the loop at deliberately
                // different phases. Frequencies are quantized to 1/32 Hz.
                double low=Math.Cos(Tau*1175*cycle)*.042;
                double root=Math.Cos(Tau*2349*cycle)*(.038+.012*Math.Cos(Tau*cycle));
                double fifth=Math.Cos(Tau*3520*cycle)*(.025+.011*Math.Cos(Tau*cycle+1.1));
                double third=Math.Cos(Tau*2794*cycle)*(.018+.012*Math.Cos(Tau*cycle+3.6));
                double seventh=Math.Cos(Tau*4186*cycle)*(.013+.010*Math.Cos(Tau*cycle+4.9));
                double pulse=Math.Pow((1+Math.Cos(Tau*16*cycle))/2,12);
                double machinery=(Math.Cos(Tau*5632*cycle)+.3*Math.Cos(Tau*17604*cycle))*.012*pulse;
                samples[i]=(float)(low+root+fifth+third+seventh+machinery);
            }
            return samples;
        }

        public void SetPlayback(bool admitted,float gain)
        {
            if(!source)return;
            float nextGain=admitted?Mathf.Clamp01(gain):0;
            if(nextGain!=targetGain)fadeRate=Math.Abs(nextGain-source.volume)/FadeSeconds;
            targetGain=nextGain;
            if(targetGain<=0)
            {
                // Mute, zero volume, disabled music and background/failure must
                // be silent immediately; never leave a delayed fade audible.
                source.volume=0; source.Stop(); return;
            }
            if(!source.isPlaying)
            {
                source.volume=0; fadeRate=targetGain/FadeSeconds; source.Play();
            }
        }

        void Update()
        {
            if(source && source.isPlaying)
                source.volume=Mathf.MoveTowards(source.volume,targetGain,Time.unscaledDeltaTime*fadeRate);
        }

        void OnDestroy()
        {
            if(source) { source.Stop(); Destroy(source); }
            if(clip)Destroy(clip);
        }
    }
}
