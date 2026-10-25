/**
 * Procedural sound effects with the Web Audio API — no audio files needed.
 * Every sound is a short mix of oscillators and filtered noise.
 */

const MUTE_KEY = 'arena-duel-muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    // A compressor keeps four fighters' worth of hits from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.45;
    master.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  // Browsers start audio suspended until a user gesture; any key / click resumes it.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** The shared audio context and master bus (for the music player); null if audio is unavailable or muted. */
export function audioOut(): { ac: AudioContext; master: GainNode; noise: AudioBuffer } | null {
  const ac = audio();
  if (!ac || !master || !noiseBuf || muted) return null;
  return { ac, master, noise: noiseBuf };
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Not critical.
  }
  if (master) master.gain.value = muted ? 0 : 0.45;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  /** Frequency to glide to by the end. */
  to?: number;
  delay?: number;
}

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const ac = audio();
  if (!ac || !master || muted) return;
  const t0 = ac.currentTime + (o.delay ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface NoiseOpts {
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** Filter frequency to sweep to by the end. */
  to?: number;
  q?: number;
  delay?: number;
  /** Seconds to fade in (for whooshes); default is a sharp attack. */
  attack?: number;
}

function noise(dur: number, o: NoiseOpts = {}) {
  const ac = audio();
  if (!ac || !master || !noiseBuf || muted) return;
  const t0 = ac.currentTime + (o.delay ?? 0);
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ac.createBiquadFilter();
  filter.type = o.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(o.freq ?? 1000, t0);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  filter.Q.value = o.q ?? 1;
  const gain = ac.createGain();
  const attack = o.attack ?? 0.005;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** Weapon swing. weight 0 (daggers) … 1 (hammer): heavier = lower and longer. */
  swing(weight: number) {
    const dur = 0.12 + weight * 0.16;
    noise(dur, { filter: 'bandpass', freq: 2600 - weight * 1600, to: 700 - weight * 300, q: 1.2, vol: 0.22 + weight * 0.1, attack: dur * 0.4 });
  },

  /** Someone got hit. force 0 … 1 scales the thump. */
  hit(force: number) {
    tone(170 - force * 80, 0.12 + force * 0.1, { type: 'triangle', to: 50, vol: 0.35 + force * 0.25 });
    noise(0.07 + force * 0.06, { filter: 'lowpass', freq: 2400 - force * 1200, vol: 0.3 + force * 0.2 });
  },

  wallHit() {
    noise(0.16, { filter: 'bandpass', freq: 700, q: 2, vol: 0.4 });
    tone(110, 0.14, { type: 'square', to: 60, vol: 0.12 });
    noise(0.05, { filter: 'highpass', freq: 3500, vol: 0.15, delay: 0.02 });
  },

  wallBreak() {
    noise(0.9, { filter: 'lowpass', freq: 1800, to: 200, vol: 0.5 });
    for (let i = 0; i < 6; i++) noise(0.12, { filter: 'bandpass', freq: 500 + Math.random() * 900, q: 3, vol: 0.25, delay: 0.05 + i * 0.09 });
    tone(80, 0.6, { type: 'triangle', to: 35, vol: 0.4 });
  },

  arrow() {
    tone(900, 0.09, { type: 'triangle', to: 380, vol: 0.18 });
    noise(0.14, { filter: 'highpass', freq: 3000, vol: 0.12, attack: 0.03 });
  },

  fireball() {
    noise(0.45, { filter: 'lowpass', freq: 400, to: 1400, vol: 0.35, attack: 0.08 });
    tone(140, 0.35, { type: 'sawtooth', to: 70, vol: 0.08 });
  },

  heal() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { vol: 0.12, delay: i * 0.07 }));
  },

  sprint() {
    noise(0.35, { filter: 'bandpass', freq: 500, to: 2500, q: 1.5, vol: 0.2, attack: 0.15 });
    tone(300, 0.3, { type: 'sine', to: 700, vol: 0.08 });
  },

  dash() {
    noise(0.16, { filter: 'bandpass', freq: 1200, to: 3200, q: 1, vol: 0.28, attack: 0.04 });
  },

  chestDrop() {
    noise(0.12, { filter: 'lowpass', freq: 500, vol: 0.25, delay: 0.25 });
    tone(140, 0.1, { type: 'triangle', to: 80, vol: 0.15, delay: 0.25 });
  },

  /** Hitting a chest: hollow wooden knock. */
  chestHit() {
    tone(220, 0.08, { type: 'triangle', to: 150, vol: 0.25 });
    noise(0.06, { filter: 'bandpass', freq: 1200, q: 3, vol: 0.2 });
  },

  /** An empty chest: a dull thud and a sad little drop in pitch. */
  chestEmpty() {
    noise(0.2, { filter: 'lowpass', freq: 600, vol: 0.3 });
    tone(330, 0.15, { type: 'triangle', vol: 0.1, delay: 0.08 });
    tone(220, 0.3, { type: 'triangle', vol: 0.1, delay: 0.2 });
  },

  chestOpen() {
    noise(0.25, { filter: 'bandpass', freq: 900, q: 1.5, vol: 0.3 });
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.12, delay: 0.08 + i * 0.06 }));
  },

  /** Golden Bell: a struck bronze bell. */
  guard() {
    tone(392, 1.1, { type: 'sine', vol: 0.2 });
    tone(784, 0.8, { type: 'sine', vol: 0.1 });
    tone(1176, 0.5, { type: 'triangle', vol: 0.05 });
    noise(0.05, { filter: 'highpass', freq: 4000, vol: 0.15 });
  },

  powerUp() {
    tone(110, 0.45, { type: 'sawtooth', to: 220, vol: 0.14 });
    tone(165, 0.45, { type: 'square', to: 330, vol: 0.06 });
    noise(0.4, { filter: 'lowpass', freq: 300, to: 1200, vol: 0.2, attack: 0.1 });
  },

  /** 雷符: a crack of thunder. */
  thunder() {
    noise(0.35, { filter: 'highpass', freq: 1500, to: 400, vol: 0.35 });
    tone(90, 0.4, { type: 'sawtooth', to: 40, vol: 0.15 });
  },

  /** Vanish / substitution: a soft ninja poof. */
  vanish() {
    noise(0.3, { filter: 'bandpass', freq: 1800, to: 400, q: 1, vol: 0.25, attack: 0.02 });
    tone(600, 0.2, { type: 'sine', to: 200, vol: 0.08 });
  },

  /** Caltrops scattering: little metal clinks. */
  caltrops() {
    for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 1200, 0.05, { type: 'triangle', vol: 0.06, delay: i * 0.04 + Math.random() * 0.02 });
  },

  /** 死神: a deep, eerie swoop with a ghostly whisper. */
  reaper() {
    tone(220, 0.8, { type: 'sawtooth', to: 55, vol: 0.14 });
    tone(330, 0.7, { type: 'sine', to: 90, vol: 0.09, delay: 0.05 });
    noise(0.6, { filter: 'bandpass', freq: 900, to: 250, q: 3, vol: 0.2, attack: 0.15 });
    noise(0.5, { filter: 'highpass', freq: 3000, to: 1500, vol: 0.06, attack: 0.2, delay: 0.1 }); // whisper
  },

  /** Calling a summon: a rising tone that builds over the whole call (seconds = call time). */
  summonCharge(kind: 'soulThunder' | 'soulReaper' | 'soulFire' | 'soulTree', seconds: number) {
    if (kind === 'soulTree') {
      // Deep creaking wood and a rising wind through leaves.
      tone(70, seconds, { type: 'sawtooth', to: 110, vol: 0.07 });
      tone(105, seconds, { type: 'triangle', to: 165, vol: 0.06 });
      noise(seconds, { filter: 'bandpass', freq: 400, to: 1800, q: 1.5, vol: 0.12, attack: seconds * 0.6 });
    } else if (kind === 'soulFire') {
      // A choir-like swell rising into a roar of flame.
      for (const f of [262, 330, 392]) tone(f, seconds, { type: 'triangle', to: f * 1.5, vol: 0.05 });
      noise(seconds, { filter: 'lowpass', freq: 300, to: 2400, vol: 0.12, attack: seconds * 0.7 });
    } else if (kind === 'soulThunder') {
      tone(160, seconds, { type: 'sawtooth', to: 640, vol: 0.07 });
      tone(240, seconds, { type: 'triangle', to: 960, vol: 0.05 });
      noise(seconds, { filter: 'bandpass', freq: 600, to: 4000, q: 2, vol: 0.12, attack: seconds * 0.8 }); // crackle building
    } else {
      tone(110, seconds, { type: 'sawtooth', to: 70, vol: 0.09 });
      tone(165, seconds, { type: 'sine', to: 105, vol: 0.07 });
      // A bell tolling twice.
      for (const d of [0, seconds * 0.5]) {
        tone(196, 0.9, { type: 'sine', vol: 0.12, delay: d });
        tone(392, 0.7, { type: 'sine', vol: 0.05, delay: d });
      }
    }
  },

  /** 天雷 striking: a sharp crack and a long rolling rumble. */
  skyThunder() {
    noise(0.12, { filter: 'highpass', freq: 2500, vol: 0.45 });
    noise(1.4, { filter: 'lowpass', freq: 500, to: 80, vol: 0.4, attack: 0.04 });
    tone(70, 1.1, { type: 'sawtooth', to: 35, vol: 0.12 });
  },

  /** 捨身 charging: a heartbeat that speeds up over a rising drone. */
  sacrificeCharge(seconds: number) {
    tone(55, seconds, { type: 'sawtooth', to: 140, vol: 0.08 });
    let t = 0;
    for (let gap = 0.34; t < seconds - 0.05; gap *= 0.8) {
      tone(65, 0.1, { type: 'sine', vol: 0.25, delay: t });
      t += gap;
    }
  },

  /** 捨身: a heartbeat, then a deep, ripping boom. */
  sacrifice() {
    tone(70, 0.12, { type: 'sine', vol: 0.3 });
    noise(0.7, { filter: 'lowpass', freq: 1400, to: 90, vol: 0.5, attack: 0.01, delay: 0.06 });
    tone(110, 0.8, { type: 'sawtooth', to: 30, vol: 0.18, delay: 0.06 });
    noise(0.25, { filter: 'highpass', freq: 2500, to: 900, vol: 0.18, delay: 0.06 });
  },

  /** 神樹: roots bursting out of the ground, with a rustle of leaves. */
  sacredTree() {
    noise(0.35, { filter: 'lowpass', freq: 500, to: 120, vol: 0.3, attack: 0.01 });
    tone(90, 0.4, { type: 'sawtooth', to: 50, vol: 0.12 });
    noise(0.5, { filter: 'highpass', freq: 3500, vol: 0.07, attack: 0.1, delay: 0.05 });
  },

  /** 冰棍 swing: a glittering chime over a cold whoosh. */
  iceStaff() {
    noise(0.25, { filter: 'highpass', freq: 4500, vol: 0.09, attack: 0.05 });
    for (const [f, d] of [[2093, 0], [2637, 0.04], [3136, 0.08], [4186, 0.12]] as const) tone(f, 0.28, { type: 'sine', vol: 0.045, delay: d });
  },

  /** 冰棍 hit: ice cracking. */
  iceCrack() {
    noise(0.1, { filter: 'highpass', freq: 3500, vol: 0.2 });
    tone(1800, 0.12, { type: 'triangle', to: 600, vol: 0.08 });
    tone(2600, 0.08, { type: 'sine', vol: 0.05, delay: 0.03 });
  },

  /** 聖火 landing: a whoosh and a bright chime. */
  holyFire() {
    noise(0.5, { filter: 'bandpass', freq: 700, to: 2200, q: 1, vol: 0.3, attack: 0.02 });
    tone(784, 0.5, { type: 'sine', vol: 0.08 });
    tone(1175, 0.4, { type: 'sine', vol: 0.05, delay: 0.04 });
  },

  /** A shoji door sliding shut: a wooden clack. */
  door() {
    noise(0.12, { filter: 'bandpass', freq: 900, q: 2, vol: 0.2 });
    tone(220, 0.08, { type: 'square', vol: 0.05, delay: 0.08 });
  },

  /** A powder keg going up: a sharp crack and a heavy boom. */
  explosion() {
    noise(0.1, { filter: 'highpass', freq: 2000, vol: 0.4 });
    noise(0.9, { filter: 'lowpass', freq: 700, to: 80, vol: 0.5, attack: 0.01 });
    tone(60, 0.6, { type: 'sawtooth', to: 30, vol: 0.15 });
  },

  /** The great temple bell. */
  bell() {
    tone(98, 3, { type: 'sine', vol: 0.35 });
    tone(196, 2.2, { type: 'sine', vol: 0.15 });
    tone(294, 1.6, { type: 'triangle', vol: 0.07 });
    tone(523, 0.8, { type: 'sine', vol: 0.05 });
    noise(0.12, { filter: 'lowpass', freq: 1200, vol: 0.25 });
  },

  /** A shot glancing off a crystal: a bright ping. */
  crystal() {
    tone(2400, 0.18, { type: 'sine', vol: 0.07 });
    tone(3600, 0.12, { type: 'triangle', vol: 0.04, delay: 0.02 });
  },

  /** The ground rumbling before a vent blows or a boulder comes. */
  rumble() {
    noise(0.9, { filter: 'lowpass', freq: 160, to: 90, vol: 0.3, attack: 0.3 });
  },

  /** A fire vent erupting. */
  eruption() {
    noise(0.7, { filter: 'bandpass', freq: 500, to: 2000, q: 0.8, vol: 0.35, attack: 0.02 });
    tone(80, 0.5, { type: 'sawtooth', to: 40, vol: 0.12 });
  },

  /** Stepping through a portal: a warbling shimmer. */
  portal() {
    tone(300, 0.35, { type: 'sine', to: 1200, vol: 0.1 });
    tone(450, 0.35, { type: 'triangle', to: 1800, vol: 0.05, delay: 0.04 });
  },

  /** A boulder starting to roll: a deep, grinding rumble. */
  boulder() {
    noise(1.4, { filter: 'lowpass', freq: 300, to: 120, vol: 0.35, attack: 0.05 });
    tone(55, 1.2, { type: 'sawtooth', vol: 0.08 });
  },

  /** Spike traps biting. */
  spikes() {
    noise(0.08, { filter: 'highpass', freq: 3000, vol: 0.15 });
  },

  /** A distant firework: a soft thump and crackle. */
  firework() {
    tone(140, 0.12, { type: 'sine', vol: 0.06 });
    for (let i = 0; i < 4; i++) noise(0.05, { filter: 'highpass', freq: 4000, vol: 0.03, delay: 0.15 + i * 0.05 });
  },

  /** 死神's scythe cutting the air. */
  scythe() {
    noise(0.3, { filter: 'bandpass', freq: 3200, to: 700, q: 2, vol: 0.3, attack: 0.03 });
    tone(1600, 0.25, { type: 'sine', to: 400, vol: 0.05 });
  },

  /** 死神 claims a life: a heavy temple gong. */
  deathGong() {
    tone(82, 2.2, { type: 'sine', vol: 0.3 });
    tone(164, 1.6, { type: 'sine', vol: 0.12 });
    tone(247, 1.2, { type: 'triangle', vol: 0.06 });
    noise(0.15, { filter: 'lowpass', freq: 900, vol: 0.25 });
  },

  /** Not enough PE (體力). */
  denied() {
    tone(150, 0.1, { type: 'square', vol: 0.07 });
  },

  death() {
    tone(330, 0.5, { type: 'sawtooth', to: 70, vol: 0.14 });
    noise(0.3, { filter: 'lowpass', freq: 900, to: 150, vol: 0.25 });
  },

  /**
   * A dying scream: a buzzing "voice" shaped by vowel formants (AAAH sliding to OOH),
   * jumping up then wailing down in pitch with a shaky vibrato and a breathy rasp.
   * `pitch` scales the voice (lower = deeper, e.g. a big samurai; higher = a nimble shinobi).
   */
  scream(pitch = 1) {
    const ac = audio();
    if (!ac || !master || !noiseBuf || muted) return;
    const t0 = ac.currentTime;
    const dur = 0.95;
    const f0 = 330 * pitch;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.5, t0 + 0.04);
    out.gain.setValueAtTime(0.5, t0 + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    out.connect(master);
    // Vowel formants, in parallel; they slide from "ah" towards "oh" as the scream fades.
    const formants: [number, number, number, number][] = [[800, 560, 7, 1], [1200, 900, 9, 0.55], [2800, 2500, 11, 0.22]];
    const voice = ac.createGain();
    voice.gain.value = 0.35;
    for (const [from, to, q, g] of formants) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(from * Math.sqrt(pitch), t0);
      bp.frequency.exponentialRampToValueAtTime(to * Math.sqrt(pitch), t0 + dur);
      bp.Q.value = q;
      const fg = ac.createGain();
      fg.gain.value = g;
      voice.connect(bp).connect(fg).connect(out);
    }
    // The vocal cords: two slightly detuned saws, a quick yelp up, then a long wail down.
    const lfo = ac.createOscillator();
    lfo.frequency.value = 6 + Math.random() * 2;
    const lfoG = ac.createGain();
    lfoG.gain.setValueAtTime(f0 * 0.02, t0);
    lfoG.gain.linearRampToValueAtTime(f0 * 0.06, t0 + dur);
    lfo.connect(lfoG);
    for (const det of [-9, 9]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.25, t0 + 0.09);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t0 + dur);
      lfoG.connect(o.frequency);
      o.connect(voice);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
    // Breath and rasp.
    const n = ac.createBufferSource();
    n.buffer = noiseBuf;
    const nf = ac.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 1600 * Math.sqrt(pitch);
    nf.Q.value = 0.9;
    const ng = ac.createGain();
    ng.gain.value = 0.12;
    n.connect(nf).connect(ng).connect(out);
    n.start(t0, Math.random() * 0.5);
    n.stop(t0 + dur + 0.05);
  },

  respawn() {
    [392, 523, 659].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.06 }));
  },

  win() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.7 : 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.12 }));
    tone(262, 1.3, { type: 'sine', vol: 0.12, delay: 0.36 });
  },

  countdownTick() {
    tone(660, 0.12, { type: 'square', vol: 0.1 });
  },

  countdownGo() {
    tone(1320, 0.35, { type: 'square', vol: 0.12 });
    tone(660, 0.35, { type: 'triangle', vol: 0.12 });
  },

  /** Moving the focus: a soft wooden tick. */
  menuMove() {
    tone(1250, 0.035, { type: 'triangle', vol: 0.07 });
    noise(0.03, { filter: 'bandpass', freq: 2500, q: 4, vol: 0.06 });
  },

  /** Changing a value (◀ ▶). */
  menuChange() {
    tone(880, 0.06, { type: 'triangle', vol: 0.12 });
    tone(1320, 0.05, { type: 'sine', vol: 0.05, delay: 0.03 });
  },

  /** Pressing a button: a koto-like two-note pluck, upward. */
  menuConfirm() {
    tone(587, 0.22, { type: 'triangle', vol: 0.14 });
    tone(880, 0.3, { type: 'triangle', vol: 0.12, delay: 0.06 });
    noise(0.04, { filter: 'highpass', freq: 3000, vol: 0.05 });
  },

  /** Going back: the same pluck, downward. */
  menuBack() {
    tone(784, 0.16, { type: 'triangle', vol: 0.1 });
    tone(523, 0.22, { type: 'triangle', vol: 0.1, delay: 0.05 });
  },

  menuError() {
    tone(200, 0.15, { type: 'square', to: 140, vol: 0.08 });
  },

  start() {
    [392, 523, 784].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.16, delay: i * 0.08 }));
  },
};
