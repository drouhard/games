/* Tiny square-wave sound effects, synthesised on the fly.

   No audio files: an oscillator plus a fast envelope gets the 8-bit blip
   character, and keeps the game to plain text assets. iOS won't let an
   AudioContext start outside a user gesture, so it's created lazily on the
   first sound - by which point the player has always tapped something. */

const PREF_KEY = "emberdeep:sound";

let ctx = null;
let enabled = readPref();

function readPref() {
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
    /* preference just won't persist */
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

function tone({ freq, to, dur, type = "square", gain = 0.05, delay = 0 }) {
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

const VOICES = {
  select: () => tone({ freq: 660, dur: 0.06, gain: 0.03 }),
  hit: () => tone({ freq: 180, to: 90, dur: 0.12, gain: 0.06 }),
  crit: () => {
    tone({ freq: 300, to: 110, dur: 0.18, gain: 0.07 });
    tone({ freq: 600, to: 200, dur: 0.18, gain: 0.04, delay: 0.02 });
  },
  magic: () => tone({ freq: 420, to: 980, dur: 0.22, type: "triangle", gain: 0.05 }),
  heal: () => {
    tone({ freq: 520, dur: 0.1, type: "triangle", gain: 0.05 });
    tone({ freq: 780, dur: 0.14, type: "triangle", gain: 0.04, delay: 0.08 });
  },
  ko: () => tone({ freq: 220, to: 60, dur: 0.4, type: "sawtooth", gain: 0.06 }),
  victory: () => {
    [523, 659, 784, 1047].forEach((freq, i) =>
      tone({ freq, dur: 0.16, type: "square", gain: 0.05, delay: i * 0.11 }));
  },
  defeat: () => {
    [392, 330, 262, 196].forEach((freq, i) =>
      tone({ freq, dur: 0.26, type: "triangle", gain: 0.05, delay: i * 0.17 }));
  },
  levelup: () => {
    [659, 784, 1047].forEach((freq, i) =>
      tone({ freq, dur: 0.13, gain: 0.045, delay: i * 0.09 }));
  },
  coin: () => tone({ freq: 880, to: 1320, dur: 0.09, gain: 0.04 }),
};

export function play(name) {
  if (!enabled) return;
  try {
    VOICES[name]?.();
  } catch (error) {
    /* audio is never important enough to break a turn over */
  }
}
