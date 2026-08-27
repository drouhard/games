/* Square-wave blips, synthesised on the fly - no audio files, so the game is
   still nothing but text. iOS refuses to start an AudioContext outside a user
   gesture, so it is created lazily on the first sound, by which point the
   player has always tapped Launch. */

const PREF_KEY = "petalstorm:sound";

let ctx = null;
let enabled = read();
let lastShot = 0;

function read() {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch (error) {
    return true;
  }
}

export function isEnabled() {
  return enabled;
}

export function setEnabled(value) {
  enabled = value;
  try {
    localStorage.setItem(PREF_KEY, value ? "on" : "off");
  } catch (error) {
    /* the preference just won't persist */
  }
}

function context() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ freq, to, dur, type = "square", gain = 0.04, delay = 0 }) {
  if (!enabled) return;
  const audio = context();
  if (!audio) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  const start = audio.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.06, from = 1200, to = 90 }) {
  if (!enabled) return;
  const audio = context();
  if (!audio) return;
  const frames = Math.floor(audio.sampleRate * dur);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(from, audio.currentTime);
  filter.frequency.exponentialRampToValueAtTime(to, audio.currentTime + dur);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(gain, audio.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  src.connect(filter).connect(amp).connect(audio.destination);
  src.start();
}

/* The ship fires ten times a second; playing all of those would be a buzzsaw,
   so the shot tick is thinned out to something the ear reads as rhythm. */
export function shoot(now) {
  if (now - lastShot < 0.16) return;
  lastShot = now;
  tone({ freq: 900, to: 1500, dur: 0.035, type: "square", gain: 0.012 });
}

export const sfx = {
  boom: () => noise({ dur: 0.22, gain: 0.05, from: 1400, to: 80 }),
  bigBoom: () => {
    noise({ dur: 0.5, gain: 0.09, from: 900, to: 50 });
    tone({ freq: 200, to: 40, dur: 0.5, type: "sawtooth", gain: 0.05 });
  },
  die: () => {
    tone({ freq: 420, to: 60, dur: 0.5, type: "sawtooth", gain: 0.07 });
    noise({ dur: 0.4, gain: 0.07 });
  },
  bloom: () => {
    tone({ freq: 220, to: 1800, dur: 0.35, type: "triangle", gain: 0.06 });
    noise({ dur: 0.35, gain: 0.05, from: 400, to: 3000 });
  },
  graze: () => tone({ freq: 1800, to: 2400, dur: 0.03, type: "sine", gain: 0.02 }),
  pickup: () => {
    tone({ freq: 700, dur: 0.06, type: "square", gain: 0.04 });
    tone({ freq: 1050, dur: 0.08, type: "square", gain: 0.04, delay: 0.06 });
  },
  extend: () => {
    [660, 880, 1320].forEach((freq, i) => tone({ freq, dur: 0.12, gain: 0.05, delay: i * 0.1 }));
  },
  warn: () => {
    tone({ freq: 320, to: 220, dur: 0.3, type: "sawtooth", gain: 0.05 });
    tone({ freq: 320, to: 220, dur: 0.3, type: "sawtooth", gain: 0.05, delay: 0.42 });
  },
  clear: () => {
    [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, dur: 0.16, gain: 0.05, delay: i * 0.11 }));
  },
  over: () => {
    [392, 330, 262, 196].forEach((freq, i) => tone({ freq, dur: 0.3, type: "triangle", gain: 0.06, delay: i * 0.18 }));
  },
};
