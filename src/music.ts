import { audioOut } from '@/sfx';

/**
 * Procedural background music (Web Audio, no files): a calm koto-and-flute piece
 * for the menus, a driving taiko-and-shamisen piece for battles, and for the 闖關
 * underworld a dark, slow 'hell' piece and a frantic 'boss' piece. All are generated
 * a few notes ahead from Japanese scales, so they never loop exactly.
 */

export type Track = 'menu' | 'battle' | 'hell' | 'boss' | 'victory' | 'defeat';

/** Seconds per step for each track. */
const STEP: Record<Track, number> = { menu: 60 / 72 / 2, battle: 60 / 132 / 4, hell: 60 / 66 / 2, boss: 60 / 150 / 4, victory: 60 / 100 / 2, defeat: 60 / 54 / 2 };

const MUSIC_KEY = 'arena-duel-music';
const VOLUME = 0.55;

/** 都節 (miyako-bushi) scale degrees, in semitones. */
const IN_SCALE = [0, 1, 5, 7, 8];
/** D3 */
const ROOT = 146.83;

/** 陽 (yo) scale: the bright Japanese pentatonic, for the victory music. */
const YO_SCALE = [0, 2, 5, 7, 9];

const freq = (deg: number, octave = 0, scale = IN_SCALE) => {
  const n = scale.length;
  const o = Math.floor(deg / n);
  const step = scale[((deg % n) + n) % n];
  return ROOT * 2 ** (octave + o + step / 12);
};
const yo = (deg: number, octave = 0) => freq(deg, octave, YO_SCALE);

let enabled = (() => {
  try {
    return localStorage.getItem(MUSIC_KEY) !== '0';
  } catch {
    return true;
  }
})();

let current: Track | null = null;
let bus: GainNode | null = null;
const fadingBuses = new Set<GainNode>();
let timer: number | null = null;
let nextTime = 0;
let step = 0;
let melodyDeg = 7;

/** What's playing (for debugging): the track and whether its loop is running. */
export const musicState = () => ({ track: current, playing: timer !== null });

export function isMusicOn() {
  return enabled;
}

export function toggleMusic() {
  enabled = !enabled;
  try {
    localStorage.setItem(MUSIC_KEY, enabled ? '1' : '0');
  } catch {
    // Not critical.
  }
  const t = current;
  stopMusic();
  if (enabled && t) playMusic(t);
  else current = t;
}

/** Starts a track (no-op if it's already playing); the previous one fades out. */
export function playMusic(track: Track) {
  if (track === current && timer !== null) return;
  stopMusic();
  current = track;
  if (!enabled) return;
  step = 0;
  nextTime = 0;
  timer = window.setInterval(tick, 80);
  tick();
}

export function stopMusic(immediate = false) {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (immediate) {
    for (const old of fadingBuses) old.disconnect();
    fadingBuses.clear();
  }
  const out = audioOut();
  if (bus && out && !immediate) {
    const old = bus;
    fadingBuses.add(old);
    old.gain.setTargetAtTime(0.0001, out.ac.currentTime, 0.25);
    window.setTimeout(() => { if (fadingBuses.delete(old)) old.disconnect(); }, 1500);
  } else bus?.disconnect();
  bus = null;
}

function tick() {
  const out = audioOut();
  if (!out || out.ac.state !== 'running') return;
  const { ac } = out;
  if (!bus) {
    bus = ac.createGain();
    bus.gain.setValueAtTime(0.0001, ac.currentTime);
    bus.gain.setTargetAtTime(VOLUME, ac.currentTime, 0.4);
    bus.connect(out.master);
  }
  // A throttled background tab can fall behind: skip ahead rather than burst.
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  const stepDur = STEP[current ?? 'menu'];
  while (nextTime < ac.currentTime + 0.35) {
    if (current === 'battle') battleStep(out, nextTime, step, stepDur);
    else if (current === 'hell') hellStep(out, nextTime, step, stepDur);
    else if (current === 'boss') bossStep(out, nextTime, step, stepDur);
    else if (current === 'victory') victoryStep(out, nextTime, step, stepDur);
    else if (current === 'defeat') defeatStep(out, nextTime, step, stepDur);
    else menuStep(out, nextTime, step, stepDur);
    nextTime += stepDur;
    step++;
  }
}

type Out = NonNullable<ReturnType<typeof audioOut>>;

// ---------- menu: koto arpeggios, a shakuhachi-like flute, a soft drone ----------

function menuStep(out: Out, t: number, s: number, dur: number) {
  const bar = Math.floor(s / 8);
  const roots = [0, -2, 0, 3];
  const root = roots[bar % roots.length];
  if (s % 16 === 0) {
    drone(out, freq(root, -1), t, dur * 16, 0.05);
    drone(out, freq(root + 3, -1), t, dur * 16, 0.03);
  }
  // Koto: a rolling pattern with the odd rest.
  const pattern = [0, 2, 4, 5, 4, 2, 3, 1];
  if (Math.random() > 0.12) pluck(out, freq(root + pattern[s % 8]), t, 1.6, 0.11, 2600);
  // Flute phrase every other bar.
  if (s % 16 === 4 || (s % 16 === 10 && Math.random() < 0.6)) {
    melodyDeg = clampDeg(melodyDeg + [-2, -1, 1, 2][Math.floor(Math.random() * 4)], 4, 11);
    flute(out, freq(melodyDeg, 1), t, dur * (s % 16 === 4 ? 5 : 3), 0.045);
  }
}

// ---------- battle: taiko, shime-daiko, shamisen ostinato ----------

function battleStep(out: Out, t: number, s: number, dur: number) {
  const bar = Math.floor(s / 16);
  const i = s % 16;
  const roots = [0, 0, -2, 3];
  const root = roots[bar % roots.length];
  // Big drum: don . . don . . don . don . . . don . . .
  if ([0, 3, 6, 8, 12].includes(i)) taiko(out, t, i === 0 ? 0.5 : 0.32);
  if (bar % 4 === 3 && i >= 12) taiko(out, t, 0.28); // fill into the next phrase
  // Shime-daiko on the off-beats.
  if (i % 2 === 1) rim(out, t, i % 4 === 3 ? 0.09 : 0.05);
  // Shamisen ostinato, bright and percussive.
  const riff = [0, -1, 0, 2, 0, -1, 3, 2, 0, -1, 0, 2, 4, 3, 2, -1];
  if (riff[i] >= 0) pluck(out, freq(root + riff[i]), t, 0.35, 0.1, 4200, 'sawtooth');
  // Bass on the beat.
  if (i % 4 === 0) pluck(out, freq(root, -1), t, 0.5, 0.12, 800);
  // A flute cry every four bars.
  if (bar % 4 === 2 && i === 0) {
    melodyDeg = clampDeg(melodyDeg + [-1, 1, 2][Math.floor(Math.random() * 3)], 5, 11);
    flute(out, freq(melodyDeg, 1), t, dur * 10, 0.05);
  }
}

// ---------- hell: a heartbeat drum, a groaning drone, temple bells, a wailing flute ----------

function hellStep(out: Out, t: number, s: number, dur: number) {
  const bar = Math.floor(s / 8);
  // Down a semitone and back: the darkest move the scale has.
  const root = [0, 0, -4, -5][bar % 4];
  if (s % 16 === 0) {
    growl(out, freq(root, -2), t, dur * 16, 0.07);
    growl(out, freq(root, -2) * Math.SQRT2, t, dur * 16, 0.025); // a tritone above: unsettling
  }
  // Heartbeat: lub-dub.
  if (s % 8 === 0) taiko(out, t, 0.42);
  if (s % 8 === 1) taiko(out, t, 0.26);
  // A cracked temple bell every two bars.
  if (s % 16 === 6) bell(out, freq(root + 2, 0), t, 0.07);
  // Low koto, slow and sparse.
  if (s % 4 === 2 && Math.random() < 0.7) pluck(out, freq(root + [0, 1, 3, 1][(s / 4) % 4 | 0], -1), t, 1.8, 0.09, 900);
  // A wailing flute, bending down into its notes.
  if (s % 32 === 12) {
    melodyDeg = clampDeg(melodyDeg + [-1, 1, -2][Math.floor(Math.random() * 3)], 3, 9);
    wail(out, freq(melodyDeg, 1), t, dur * 9, 0.04);
  }
  // Now and then, something whispers.
  if (s % 32 === 20 && Math.random() < 0.6) whisper(out, t, dur * 6);
}

// ---------- boss: pounding drums, a snarling low riff, bells on the downbeat ----------

function bossStep(out: Out, t: number, s: number, dur: number) {
  const bar = Math.floor(s / 16);
  const i = s % 16;
  const root = [0, 0, 1, -4][bar % 4];
  if (i === 0) growl(out, freq(root, -2), t, dur * 16, 0.06);
  // Double-time taiko with flams.
  if ([0, 2, 4, 7, 8, 10, 12, 14].includes(i)) taiko(out, t, i % 8 === 0 ? 0.5 : 0.3);
  if (bar % 2 === 1 && i >= 12) taiko(out, t, 0.25);
  if (i % 2 === 1) rim(out, t, i % 4 === 3 ? 0.1 : 0.06);
  // Snarling low riff on a sawtooth shamisen.
  const riff = [0, 0, 1, 0, 3, 0, 1, -1, 0, 0, 1, 0, 4, 3, 1, 0];
  if (riff[i] >= 0) pluck(out, freq(root + riff[i], -1), t, 0.25, 0.12, 2400, 'sawtooth');
  // Octave stabs and a bell at the top of each phrase.
  if (i === 0 && bar % 2 === 0) bell(out, freq(root + 5, 0), t, 0.06);
  if (i === 8 || i === 12) pluck(out, freq(root + 5, 0), t, 0.3, 0.07, 3000, 'square');
  if (bar % 4 === 3 && i === 0) wail(out, freq(clampDeg(melodyDeg + 2, 5, 11), 1), t, dur * 14, 0.05);
}

// ---------- victory: a horn-and-drum fanfare, then a bright festival loop ----------

function victoryStep(out: Out, t: number, s: number, dur: number) {
  if (s < 16) {
    // Fanfare: a drum roll under a rising horn call, a bell on the final note.
    const call: [number, number, number][] = [[0, 0, 1], [2, 2, 1], [4, 3, 1], [6, 5, 2], [9, 4, 1], [10, 5, 6]];
    for (const [at, deg, len] of call) if (s === at) horn(out, yo(deg), t, dur * len, 0.09);
    if (s < 8) taiko(out, t, 0.18 + s * 0.03);
    if (s === 10) {
      taiko(out, t, 0.5);
      bell(out, yo(5, 1), t, 0.05);
      drone(out, yo(0, -1), t, dur * 6, 0.06);
    }
    return;
  }
  const i = (s - 16) % 32;
  const root = [0, 0, 3, 4][Math.floor(i / 8)];
  // Festival koto arpeggios, light drums, a flute tune on top.
  pluck(out, yo(root + [0, 2, 4, 5, 4, 2, 5, 7][i % 8]), t, 0.9, 0.09, 3200);
  if (i % 8 === 0) {
    taiko(out, t, 0.3);
    drone(out, yo(root, -1), t, dur * 8, 0.04);
  }
  if (i % 4 === 2) rim(out, t, 0.06);
  if (i % 8 === 4 && Math.random() < 0.7) flute(out, yo(root + 5 + Math.floor(Math.random() * 3), 0), t, dur * 3, 0.04);
}

// ---------- defeat: a falling lament with a tolling bell, then a sparse, sad loop ----------

function defeatStep(out: Out, t: number, s: number, dur: number) {
  if (s < 12) {
    const fall: [number, number, number][] = [[0, 7, 3], [3, 6, 3], [6, 5, 2], [8, 3, 4]];
    for (const [at, deg, len] of fall) if (s === at) wail(out, freq(deg), t, dur * len, 0.045);
    if (s === 0 || s === 8) bell(out, freq(0, 0), t, 0.06);
    if (s === 0) growl(out, freq(0, -2), t, dur * 12, 0.05);
    return;
  }
  const i = (s - 12) % 16;
  const root = i < 8 ? 0 : -1;
  if (i === 0) {
    drone(out, freq(root, -1), t, dur * 16, 0.05);
    bell(out, freq(root, 0), t, 0.035);
  }
  if (i % 4 === 2 && Math.random() < 0.75) pluck(out, freq(root + [3, 1, 2, 0][(i / 4) | 0]), t, 2, 0.07, 1200);
  if (i === 10 && Math.random() < 0.5) flute(out, freq(root + 5, 0), t, dur * 5, 0.03);
}

const clampDeg = (d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, d));

// ---------- instruments ----------

function env(out: Out, t: number, attack: number, peak: number, decay: number) {
  const g = out.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(bus!);
  return g;
}

/** Plucked string: a bright attack through a closing low-pass filter. */
function pluck(out: Out, f: number, t: number, decay: number, vol: number, bright: number, type: OscillatorType = 'triangle') {
  const { ac } = out;
  const g = env(out, t, 0.004, vol, decay);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(bright, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + decay * 0.6);
  lp.connect(g);
  for (const [mult, type2, v] of [[1, type, 1], [2, 'sine', 0.3]] as const) {
    const o = ac.createOscillator();
    o.type = type2;
    o.frequency.value = f * mult;
    const og = ac.createGain();
    og.gain.value = v;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

/** Breathy flute with a slow attack and a little vibrato. */
function flute(out: Out, f: number, t: number, dur: number, vol: number) {
  const { ac } = out;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.25);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bus!);
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 0.97, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.2); // a shakuhachi-style bend up into the note
  const lfo = ac.createOscillator();
  lfo.frequency.value = 5;
  const lfoG = ac.createGain();
  lfoG.gain.setValueAtTime(0, t);
  lfoG.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.5);
  lfo.connect(lfoG).connect(o.frequency);
  o.connect(g);
  // Breath.
  const n = ac.createBufferSource();
  n.buffer = out.noise;
  n.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 2;
  bp.Q.value = 6;
  const ng = ac.createGain();
  ng.gain.value = 0.35;
  n.connect(bp).connect(ng).connect(g);
  for (const src of [o, lfo, n]) {
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}

function drone(out: Out, f: number, t: number, dur: number, vol: number) {
  const { ac } = out;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bus!);
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A dark, buzzing drone (filtered sawtooth with a slow wobble). */
function growl(out: Out, f: number, t: number, dur: number, vol: number) {
  const { ac } = out;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bus!);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  lp.connect(g);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.4;
  const lfoG = ac.createGain();
  lfoG.gain.value = 120;
  lfo.connect(lfoG).connect(lp.frequency);
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = f;
  o.detune.value = -8;
  o.connect(lp);
  for (const src of [o, lfo]) {
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}

/** Brass-like horn: a filtered sawtooth with a soft attack and a touch of vibrato. */
function horn(out: Out, f: number, t: number, dur: number, vol: number) {
  const { ac } = out;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bus!);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
  lp.connect(g);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoG = ac.createGain();
  lfoG.gain.value = f * 0.006;
  lfo.connect(lfoG);
  for (const det of [-6, 6]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    lfoG.connect(o.frequency);
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

/** Temple bell: inharmonic partials with a long ring. */
function bell(out: Out, f: number, t: number, vol: number) {
  for (const [mult, v, decay] of [[1, 1, 3], [2.76, 0.5, 1.6], [5.4, 0.25, 0.8], [0.5, 0.4, 3.5]] as const) {
    const g = env(out, t, 0.003, vol * v, decay);
    const o = out.ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * mult;
    o.connect(g);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

/** A ghostly flute that slides down into its note. */
function wail(out: Out, f: number, t: number, dur: number, vol: number) {
  flute(out, f, t, dur, vol);
  const { ac } = out;
  const g = env(out, t, 0.3, vol * 0.5, dur);
  const o = ac.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.01, t + dur * 0.6);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Breathy noise swelling and fading, like a voice just out of hearing. */
function whisper(out: Out, t: number, dur: number) {
  const { ac } = out;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bus!);
  const n = ac.createBufferSource();
  n.buffer = out.noise;
  n.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 8;
  bp.frequency.setValueAtTime(1800, t);
  bp.frequency.exponentialRampToValueAtTime(700, t + dur);
  n.connect(bp).connect(g);
  n.start(t);
  n.stop(t + dur + 0.05);
}

/** Taiko: a pitched-down thump with a skin slap. */
function taiko(out: Out, t: number, vol: number) {
  const { ac } = out;
  const g = env(out, t, 0.005, vol, 0.45);
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.3);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.5);
  noiseHit(out, t, 'lowpass', 600, 0.06, vol * 0.6);
}

/** Shime-daiko: a tight, high crack. */
function rim(out: Out, t: number, vol: number) {
  noiseHit(out, t, 'bandpass', 3200, 0.05, vol);
}

function noiseHit(out: Out, t: number, type: BiquadFilterType, f: number, dur: number, vol: number) {
  const { ac } = out;
  const g = env(out, t, 0.002, vol, dur);
  const n = ac.createBufferSource();
  n.buffer = out.noise;
  const flt = ac.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  n.connect(flt).connect(g);
  n.start(t, Math.random() * 0.5);
  n.stop(t + dur + 0.02);
}

// During development, a hot-reloaded copy of this module must not leave the old loop playing.
import.meta.hot?.dispose(() => stopMusic());
