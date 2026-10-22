# Last Stand audio source

“Holding Ground” is the original, project-owned ambient piece authored for the
Last Stand controls sprint. Its full reproducible source is
`Unity/Assets/Scripts/LastStandMusic.cs`; there are no external recordings,
samples, music libraries, or additional license requirements. The code synthesizes
a 32-second mono loop at 22,050 Hz, with slow D-minor partials and a restrained
periodic machinery pulse. All frequencies and envelopes complete whole cycles
within the loop. There are no vocals.

`LastStandAudio.cs` retains the five existing generated cannon, impact,
destruction, defeat, and purchase cues. Four effect voices and one looping music
voice are created once per owner. Settings change active source gains. Browser
audio stays locked until an actual gesture; loading settings never unlocks it.
The settings sample button is itself an audio gesture. Master mute, disabled
music, zero volume, background visibility and owner failure stop the affected
sources immediately. Music starts gently and follows unscaled wall time; manual
and menu pause suspend combat effects while permitting foreground music.

`test_audio_settings.py` compiles the actual C# routing and synthesis with small
Unity API doubles. It checks PCM continuity, deterministic synthesis, energy,
gain changes, gesture admission, source ownership, visibility/failure holds and
cue replay exclusion. It does not demonstrate a real browser audio device,
rendered gain levels or subjective listening quality. Those require the sprint's
source-bound browser capture and owner listening review.
