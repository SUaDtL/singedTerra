import type { ExplosionImpactType } from '@shared/types/GameState';
import type { WallMode } from '@shared/types/GameOptions';
import { getImpactAudioProfile } from '../feel/impactMaterial';

export interface WallReflectAudioProfile {
  readonly startFrequency: number;
  readonly endFrequency: number;
  readonly noiseGain: number;
  readonly toneGain: number;
  readonly noiseDuration: number;
  readonly toneDuration: number;
}

export type WallContactAudioProfile = WallReflectAudioProfile;

/** Pure bounded profile so ricochet headroom and side distinction stay testable. */
export function getWallReflectAudioProfile(
  side: 'left' | 'right',
): WallReflectAudioProfile {
  const startFrequency = side === 'left' ? 720 : 880;
  return {
    startFrequency,
    endFrequency: startFrequency * 0.55,
    noiseGain: 0.075,
    toneGain: 0.055,
    noiseDuration: 0.065,
    toneDuration: 0.11,
  };
}

/** Bounded contact profiles keep each sidewall mode legible without competing with impact SFX. */
export function getWallContactAudioProfile(
  walls: WallMode,
  side: 'left' | 'right',
): WallContactAudioProfile | null {
  if (walls === 'open') return null;
  if (walls === 'reflective') return getWallReflectAudioProfile(side);
  if (walls === 'concrete') {
    const startFrequency = side === 'left' ? 300 : 360;
    return {
      startFrequency,
      endFrequency: startFrequency * 0.7,
      noiseGain: 0.05,
      toneGain: 0.045,
      noiseDuration: 0.06,
      toneDuration: 0.15,
    };
  }
  const startFrequency = side === 'left' ? 460 : 540;
  return {
    startFrequency,
    endFrequency: startFrequency * 1.72,
    noiseGain: 0.045,
    toneGain: 0.07,
    noiseDuration: 0.055,
    toneDuration: 0.14,
  };
}

/**
 * AudioEngine — synthesized SFX via the Web Audio API, NO asset files.
 *
 * SPEC §9/§12 specify "Web Audio synth — no files to host". Every sound is built
 * at play time from oscillators + a shared white-noise buffer + gain envelopes, so
 * the deploy stays a single static bundle (matches the project's host-light ethos).
 *
 * This is PURE PRESENTATION: it is driven from the renderer's event sink and the
 * input layer, and never touches `shared/` or the deterministic engine — so it
 * cannot affect hot-seat/networked lockstep in any way.
 *
 * Browser autoplay policy blocks audio until a user gesture, so the AudioContext
 * is created lazily and `unlockOnGesture()` resumes it on the first interaction.
 * The mute preference is persisted to localStorage.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Fast final-stage limiter keeps layered boom/material transients clean. */
  private limiter: DynamicsCompressorNode | null = null;
  /** Shared 0.5s white-noise buffer, reused (read-only) by every percussive sound. */
  private noise: AudioBuffer | null = null;
  private muted = false;
  /** Wall-clock (performance.now) of the last aim tick, to throttle key-repeat. */
  private lastAimTick = 0;
  /**
   * Sustained napalm-crackle source nodes.  Held for the lifetime of the fire
   * field so the sound loops continuously until napalmStop() tears them down.
   * Both are non-null only while napalm is active.
   */
  private napalmSrc: AudioBufferSourceNode | null = null;
  private napalmGain: GainNode | null = null;

  private static readonly STORAGE_KEY = 'singedterra:muted';
  private static readonly VOLUME = 0.85;

  constructor() {
    try {
      this.muted =
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(AudioEngine.STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Lazily build the context, master gain, and noise buffer. Idempotent; also
   *  resumes a context the browser auto-suspended. Returns null where Web Audio
   *  is unavailable (SSR / very old browsers) so callers no-op gracefully. */
  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : AudioEngine.VOLUME;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -5;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.12;
      this.master.connect(this.limiter).connect(this.ctx.destination);

      // Build a 0.5s mono white-noise buffer once. A tiny LCG (not Math.random)
      // keeps it self-contained; the exact samples are irrelevant for noise.
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, Math.floor(sr * 0.5), sr);
      const data = buf.getChannelData(0);
      let s = 0x2545f491;
      for (let i = 0; i < data.length; i++) {
        s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
        data[i] = (s / 0x3fffffff) - 1;
      }
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Resume the context on the first user gesture (autoplay-policy unlock). */
  unlockOnGesture(): void {
    if (typeof window === 'undefined') return;
    const unlock = (): void => {
      this.ensure();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      // Smooth the gain change so toggling never clicks.
      this.master.gain.setTargetAtTime(
        muted ? 0 : AudioEngine.VOLUME,
        this.ctx.currentTime,
        0.012,
      );
    }
    try {
      localStorage.setItem(AudioEngine.STORAGE_KEY, muted ? '1' : '0');
    } catch {
      /* localStorage unavailable — preference just isn't persisted */
    }
  }

  /** Flip mute and return the new state (for a UI label/key toggle). */
  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---- sound primitives -----------------------------------------------------

  /** A filtered one-shot of the shared noise buffer with an attack/decay envelope. */
  private noiseHit(
    t: number,
    dur: number,
    gain: number,
    filter: BiquadFilterType,
    freq: number,
    q = 0.7,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** A short pitched blip (square/sine) — used for UI feedback. */
  private blip(freq: number, dur: number, gain: number, type: OscillatorType = 'square'): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---- game sounds ----------------------------------------------------------

  /** Cannon launch: a pitch-dropping body thud + an airy muzzle click. */
  launch(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(72, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
    this.noiseHit(t, 0.09, 0.2, 'highpass', 1100, 0.6);
  }

  /**
   * Detonation boom, scaled by blast radius: a lowpass-swept noise body plus a
   * sub-bass thump. Bigger radius => louder, lower, longer (mirrors the renderer's
   * radius→screen-shake mapping so audio and visuals stay in lock-step of feel).
   */
  explosion(radius: number): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const n = Math.max(0.2, Math.min(1, radius / 60)); // normalized blast size
    const dur = 0.28 + 0.55 * n;
    const vol = 0.4 + 0.55 * n;

    // Body: filtered noise, cutoff opening on impact then closing as it decays.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300 + 1500 * n, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);

    // Sub thump: a short sine drop for the chest-felt low end.
    const subF = 95 - 45 * n;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(subF * 1.7, t);
    sub.frequency.exponentialRampToValueAtTime(subF, t + 0.12);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(vol * 0.9, t + 0.012);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
    sub.connect(sg).connect(this.master);
    sub.start(t);
    sub.stop(t + dur + 0.02);
  }

  /** Short collision-material layer under the main weapon explosion. */
  impact(impactType: ExplosionImpactType, radius: number): void {
    if (this.muted) return;
    const profile = getImpactAudioProfile(impactType, radius);
    if (!profile) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    this.noiseHit(
      t,
      profile.duration,
      profile.noiseGain,
      profile.noiseFilter,
      profile.noiseFrequency,
      profile.noiseQ,
    );

    const tone = ctx.createOscillator();
    tone.type = profile.toneType;
    tone.frequency.setValueAtTime(profile.toneStart, t);
    tone.frequency.exponentialRampToValueAtTime(
      profile.toneEnd,
      t + profile.duration,
    );
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(profile.toneGain, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + profile.duration);
    tone.connect(gain).connect(this.master);
    tone.start(t);
    tone.stop(t + profile.duration + 0.02);
  }

  /** Sidewall contact cue, shaped by the room's boundary rule. */
  wallContact(walls: WallMode, side: 'left' | 'right'): void {
    if (this.muted) return;
    const profile = getWallContactAudioProfile(walls, side);
    if (!profile) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    this.noiseHit(
      t,
      profile.noiseDuration,
      profile.noiseGain,
      walls === 'wrap' ? 'bandpass' : 'highpass',
      walls === 'wrap' ? 1700 : 2600,
      walls === 'wrap' ? 2.2 : 3.5,
    );
    const tone = ctx.createOscillator();
    tone.type = walls === 'wrap' ? 'sine' : 'triangle';
    tone.frequency.setValueAtTime(profile.startFrequency, t);
    tone.frequency.exponentialRampToValueAtTime(
      profile.endFrequency,
      t + profile.toneDuration - 0.025,
    );
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(profile.toneGain, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      t + profile.toneDuration - 0.02,
    );
    tone.connect(gain).connect(this.master);
    tone.start(t);
    tone.stop(t + profile.toneDuration);
  }

  /** Compatibility entry point for the reflective-only renderer contract. */
  wallReflect(side: 'left' | 'right'): void {
    this.wallContact('reflective', side);
  }

  /** Soft tick for aim (angle/power) nudges. Throttled so held-key auto-repeat
   *  becomes a gentle ratchet, not a machine-gun of blips. */
  aimTick(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now - this.lastAimTick < 45) return;
    this.lastAimTick = now;
    this.blip(520, 0.035, 0.05, 'square');
  }

  /** A slightly brighter click for cycling the selected weapon. */
  weaponCycle(): void {
    this.blip(720, 0.05, 0.07, 'square');
  }

  /**
   * A short mechanical tick for each bouncing-betty hop.
   * Intentionally clicky and metallic — different from the aim tick — so it
   * reads as the betty physically skipping off terrain.
   */
  hopTick(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    this.noiseHit(t, 0.055, 0.18, 'bandpass', 1800, 4.0);
    // A quick pitch-drop transient underneath to sell the bounce impact.
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.09);
  }

  /**
   * Begin the sustained napalm-crackle loop.  Creates a looping white-noise
   * source filtered to a narrow band-pass that reads as a crackling fire.
   * Idempotent — calling start while already playing is a no-op.
   *
   * Must call napalmStop() to tear down the held nodes; otherwise the
   * AudioContext keeps them alive indefinitely. (main.ts teardown() calls
   * napalmStop() so a game quit mid-burn does not leak the loop.)
   */
  napalmStart(): void {
    if (this.muted) return;
    if (this.napalmSrc) return; // already running
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noise) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    // Narrow bandpass centred on the crackle frequency: ~600 Hz reads as fire
    // without being harsh.  A second bandpass an octave up adds presence.
    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = 600;
    bp1.Q.value = 0.9;

    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 1200;
    bp2.Q.value = 1.2;

    const g = ctx.createGain();
    g.gain.value = 0.22;

    // Series: src → bp1 → bp2 → gain → master
    src.connect(bp1).connect(bp2).connect(g).connect(this.master);
    src.start(ctx.currentTime);

    this.napalmSrc = src;
    this.napalmGain = g;
  }

  /**
   * Stop the sustained napalm-crackle loop, with a short gain-fade to avoid
   * a hard click.  Idempotent — safe to call when not playing.
   */
  napalmStop(): void {
    const src = this.napalmSrc;
    const g = this.napalmGain;
    this.napalmSrc = null;
    this.napalmGain = null;
    if (!src || !this.ctx || !g) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // Ramp gain to zero over 120 ms then stop the source.
    g.gain.setTargetAtTime(0.0001, t, 0.04);
    src.stop(t + 0.18);
  }

  /**
   * A soft noise fizzle for a shot that flew off-screen (OOB miss).
   * Short, airy, and high-pass — reads as a "whoosh" disappearing.
   */
  fizzle(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    this.noiseHit(t, 0.32, 0.15, 'highpass', 2400, 0.5);
  }

  /** Rising shimmer for raising a shield. */
  shieldUp(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    for (const [freq, detune] of [[440, 0], [660, 4]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.22);
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.32);
    }
  }
}
