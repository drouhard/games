/* The watercolour look, as SVG strings.

   There are no image files in this game and no pixel grids either - every
   creature and every puzzle token is built here out of wobbled point loops and
   three stacked washes, the way the paint actually goes on:

     1. a bleed, the same shape fattened by a wide soft stroke, very pale
     2. the body of the colour
     3. a rim of the deepest tint, where the pigment pools at a wet edge

   Everything multiplies onto the paper, so overlaps darken like real washes.
   The wobble comes from a seeded RNG, not from Math.random, so a token looks
   the same every time it is redrawn - a puzzle that repainted itself between
   the question and the answer would be unreadable.

   Nothing here touches the DOM. It returns markup as text, which is what lets
   tools/bloom-sim.mjs parse every sprite the game can produce and check it. */

/* --- colour ------------------------------------------------------------- */

/* One palette for the whole game. Values are the mid tone; the wash and the
   rim are mixed off it, so a colour can never drift out of step with itself. */
export const PALETTE = {
  rose: "#e0798f",
  coral: "#e8916a",
  amber: "#e2b455",
  lime: "#9dbe63",
  sage: "#72ab92",
  teal: "#5fa6b5",
  sky: "#7099d0",
  indigo: "#8286c9",
  violet: "#a87ec4",
  plum: "#bd76a0",
  bark: "#a97f5f",
  slate: "#8796a6",
};

export const PAPER = "#fbf5ea";
export const INK = "#4b4038";

/* What to call a colour and a shape out loud. The counting puzzle asks its
   question in words, so two palette entries that would both be read as "green"
   can never both be on the sheet - NAMED_COLORS is the subset whose names are
   all different from each other. */
export const COLOR_NAMES = {
  rose: "pink", coral: "orange", amber: "yellow", lime: "green", sage: "mint",
  teal: "teal", sky: "sky blue", indigo: "blue", violet: "purple", plum: "berry",
  bark: "brown", slate: "grey",
};

export const NAMED_COLORS = ["rose", "coral", "amber", "lime", "teal", "indigo", "violet", "bark", "slate"];

export const GLYPH_NAMES = {
  circle: ["circle", "circles"], square: ["square", "squares"], triangle: ["triangle", "triangles"],
  diamond: ["diamond", "diamonds"], heart: ["heart", "hearts"], star: ["star", "stars"],
  flower: ["flower", "flowers"], moon: ["moon", "moons"], drop: ["raindrop", "raindrops"],
  spiral: ["shell", "shells"], fish: ["fish", "fish"], bolt: ["bolt", "bolts"],
  boot: ["boot", "boots"], flag: ["flag", "flags"], hook: ["hook", "hooks"],
  tadpole: ["tadpole", "tadpoles"],
};

/* "two yellow stars", "one brown boot". */
export function describe(spec, count = 1) {
  const shape = GLYPH_NAMES[spec.glyph];
  const colour = COLOR_NAMES[spec.color] || spec.color;
  return `${colour} ${shape[count === 1 ? 0 : 1]}`;
}

export const COLOR_KEYS = Object.keys(PALETTE);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
}

/* A colour arrives as three tones: the pale first wash, the body, and the rim
   the pigment settles into. */
export function tones(key) {
  const mid = PALETTE[key] || key;
  return { wash: mix(mid, "#ffffff", 0.55), mid, rim: mix(mid, "#3f3228", 0.45) };
}

/* --- seeded randomness --------------------------------------------------- */

/* mulberry32. Small, fast, and good enough to jitter an outline. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --- geometry ------------------------------------------------------------ */

const round2 = (n) => Math.round(n * 100) / 100;

/* Catmull-Rom through the points, emitted as cubic beziers. Straight polygons
   read as clip art; curves through the same points read as a brush. */
export function smoothPath(pts, close = true, tension = 1) {
  const n = pts.length;
  if (n < 3) return "";
  let d = `M${round2(pts[0][0])} ${round2(pts[0][1])}`;
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${round2(c1[0])} ${round2(c1[1])} ${round2(c2[0])} ${round2(c2[1])} ${round2(p2[0])} ${round2(p2[1])}`;
  }
  return close ? d + "Z" : d;
}

/* An ellipse walked as points with each radius nudged, which is what makes a
   painted circle look painted. */
export function blobPts(cx, cy, rx, ry, next, wiggle = 0.09, steps = 14) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const k = 1 + (next() - 0.5) * 2 * wiggle;
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  return pts;
}

export function rotatePts(pts, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

export function mirrorPts(pts) {
  return pts.map(([x, y]) => [-x, y]);
}

/* --- the three washes ---------------------------------------------------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* One painted shape: bleed, body, rim. `soft` drops the rim, for the parts
   that should melt into what is under them (blush, shadows). */
export function wash(d, color, { soft = false, opacity = 1, bleed = 6 } = {}) {
  const t = tones(color);
  let out = `<path d="${d}" fill="${t.wash}" stroke="${t.wash}" stroke-width="${bleed}" stroke-linejoin="round" opacity="${round2(0.45 * opacity)}" filter="url(#pb-bleed)"/>`;
  out += `<path d="${d}" fill="${t.mid}" opacity="${round2(0.86 * opacity)}" filter="url(#pb-soft)"/>`;
  if (!soft) out += `<path d="${d}" fill="none" stroke="${t.rim}" stroke-width="2" stroke-linejoin="round" opacity="${round2(0.42 * opacity)}" filter="url(#pb-edge)"/>`;
  return out;
}

/* The filter set, defined once in the page and referenced by every other svg
   on it. feTurbulence is not cheap on a phone, so there is exactly one copy of
   each filter in the document rather than one per sprite. */
export function defs() {
  return `<svg class="pb-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<filter id="pb-soft" x="-30%" y="-30%" width="160%" height="160%">
  <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="4" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  <feGaussianBlur stdDeviation="0.45"/>
</filter>
<filter id="pb-bleed" x="-40%" y="-40%" width="180%" height="180%">
  <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="11" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="6.5" xChannelSelector="R" yChannelSelector="G"/>
  <feGaussianBlur stdDeviation="1.6"/>
</filter>
<filter id="pb-edge" x="-40%" y="-40%" width="180%" height="180%">
  <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="19" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G"/>
  <feGaussianBlur stdDeviation="0.6"/>
</filter>
<filter id="pb-grain">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="3"/>
  <feColorMatrix type="saturate" values="0"/>
</filter>
</defs></svg>`;
}

/* --- puzzle tokens ------------------------------------------------------- */

/* Every token shape as a closed loop of points in a -40..40 box.

   `chiral: true` promises the shape cannot be turned into its own mirror image
   by any rotation - which is the whole basis of the Mirror puzzle, and is far
   too easy to get wrong by eye (a crescent moon looks lopsided and is not: its
   mirror is just the same crescent spun half a turn). tools/bloom-sim.mjs
   proves the flag on every shape here rather than trusting it. */
export const GLYPHS = {
  circle: { chiral: false, pts: ringPts(32, 30, 30) },
  square: { chiral: false, pts: [[-28, -28], [0, -30], [28, -28], [30, 0], [28, 28], [0, 30], [-28, 28], [-30, 0]] },
  triangle: { chiral: false, pts: [[0, -32], [16, -4], [31, 26], [0, 30], [-31, 26], [-16, -4]] },
  diamond: { chiral: false, pts: [[0, -34], [20, -14], [34, 0], [20, 14], [0, 34], [-20, 14], [-34, 0], [-20, -14]] },
  heart: { chiral: false, pts: [[0, -14], [12, -30], [28, -26], [34, -8], [20, 12], [0, 32], [-20, 12], [-34, -8], [-28, -26], [-12, -30]] },
  star: { chiral: false, pts: starPts(5, 34, 15) },
  flower: { chiral: false, pts: petalPts(6, 34, 17) },
  moon: { chiral: false, pts: [[4, -32], [22, -22], [10, -18], [4, 0], [10, 18], [22, 22], [4, 32], [-18, 18], [-24, 0], [-18, -18]] },
  drop: { chiral: false, pts: [[0, -34], [14, -10], [22, 8], [14, 26], [0, 32], [-14, 26], [-22, 8], [-14, -10]] },
  // --- the chiral half: a mirror of one of these is not a turn of it ---
  spiral: { chiral: true, pts: spiralPts() },
  fish: { chiral: true, pts: [[-32, 2], [-16, -10], [0, -16], [14, -22], [18, -8], [30, -2], [24, 12], [26, 26], [10, 18], [-6, 20], [-20, 14], [-32, 20]] },
  bolt: { chiral: true, pts: [[-6, -34], [16, -30], [6, -8], [24, -6], [-2, 34], [2, 6], [-16, 8], [-14, -12]] },
  boot: { chiral: true, pts: [[-14, -32], [8, -30], [10, -6], [12, 10], [32, 16], [34, 30], [-4, 32], [-16, 26], [-16, 0]] },
  flag: { chiral: true, pts: [[-22, -32], [-12, -30], [10, -24], [30, -30], [22, -12], [30, 2], [8, 0], [-12, -4], [-12, 30], [-22, 32]] },
  hook: { chiral: true, pts: [[-4, -32], [18, -26], [26, -4], [12, 16], [-8, 12], [-6, -2], [8, -2], [10, -14], [-4, -18], [-16, -8], [-22, -24]] },
  tadpole: { chiral: true, pts: [[-2, -30], [16, -22], [22, -2], [12, 12], [24, 20], [34, 34], [4, 24], [-14, 16], [-22, -2], [-18, -20]] },
};

export const GLYPH_KEYS = Object.keys(GLYPHS);
export const CHIRAL_KEYS = GLYPH_KEYS.filter((k) => GLYPHS[k].chiral);
export const PLAIN_KEYS = GLYPH_KEYS.filter((k) => !GLYPHS[k].chiral);

/* Shapes solid enough around the middle to hold spots. A crescent is not one
   of them - a spot in the bite of the moon lands on the paper, and a puzzle
   about counting spots then has no answer. */
export const SOLID_KEYS = ["circle", "square", "triangle", "diamond", "heart", "drop"];

function ringPts(steps, rx, ry) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    pts.push([Math.cos(t) * rx, Math.sin(t) * ry]);
  }
  return pts;
}

function starPts(points, outer, inner) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const t = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? inner : outer;
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return pts;
}

/* Round lobes, not spikes. Sampled off a cosine rather than cut from two radii
   because a six-pointed flower made of straight runs is a six-pointed star,
   and then Odd One Out is asking you to tell a star from a star. */
function petalPts(petals, outer, inner) {
  const pts = [];
  const steps = petals * 6;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const lobe = Math.abs(Math.cos((petals / 2) * t)) ** 0.7;
    const r = inner + (outer - inner) * lobe;
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return pts;
}

/* A snail's shell, wound one way. The clearest chiral shape there is: no
   amount of turning makes a left-hand spiral into a right-hand one. */
function spiralPts() {
  const out = [];
  const back = [];
  const turns = 1.15;
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const r = 10 + (i / steps) * 24;
    out.push([Math.cos(t) * r, Math.sin(t) * r]);
    back.unshift([Math.cos(t) * (r - 11), Math.sin(t) * (r - 11)]);
  }
  return out.concat(back);
}

/* One puzzle token, painted. `flip` mirrors it, `rotate` turns it - the two
   moves the Mirror puzzle is asking you to tell apart. */
export function token(spec = {}) {
  const { glyph = "circle", color = "rose", rotate = 0, flip = false, seed = 1, size = 96, decor = 0 } = spec;
  const shape = GLYPHS[glyph];
  if (!shape) throw new Error(`unknown glyph: ${glyph}`);
  const next = rng(seed * 2654435761);
  // Jitter every vertex a little so two tokens of the same shape are painted,
  // not stamped. The jitter is small enough never to change what the shape is.
  const jitter = shape.pts.map(([x, y]) => [x + (next() - 0.5) * 2.4, y + (next() - 0.5) * 2.4]);
  const d = smoothPath(jitter, true, glyph === "star" || glyph === "bolt" ? 0.55 : 1);
  const t = flip ? "scale(-1,1) " : "";
  let inner = wash(d, color);
  for (let i = 0; i < decor; i++) {
    const a = (i / Math.max(1, decor)) * Math.PI * 2 + 0.6;
    inner += wash(smoothPath(blobPts(Math.cos(a) * 11, Math.sin(a) * 11, 4.5, 4.5, next, 0.16, 9), true), color, { soft: true, opacity: 0.9, bleed: 3 });
  }
  return svgWrap(`<g transform="${t}rotate(${round2(rotate)})" style="mix-blend-mode:multiply">${inner}</g>`, size, "-46 -46 92 92");
}

function svgWrap(inner, size, viewBox) {
  return `<svg class="pb-art" viewBox="${viewBox}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/* --- the hosts ----------------------------------------------------------- */

/* Ten chibi characters, one per puzzle. Chibi means the head does most of the
   work: an enormous head, a body that barely exists, eyes low and wide apart.
   Everything below is a knob on that one silhouette. */
export const MASCOTS = {
  bramble: { name: "Bramble", color: "rose", ears: "long", acc: "leaf", eyes: "wide", tuft: 2 },
  wick: { name: "Wick", color: "indigo", ears: "none", acc: "flame", eyes: "sparkle", tuft: 0 },
  pip: { name: "Pip", color: "amber", ears: "beak", acc: "none", eyes: "dot", tuft: 3 },
  skiff: { name: "Skiff", color: "teal", ears: "fin", acc: "specs", eyes: "wide", tuft: 0 },
  vine: { name: "Vine", color: "lime", ears: "tuft", acc: "leaf", eyes: "sleepy", tuft: 4 },
  plum: { name: "Plum", color: "plum", ears: "round", acc: "scarf", eyes: "wide", tuft: 1 },
  nox: { name: "Nox", color: "violet", ears: "tuft", acc: "none", eyes: "sparkle", tuft: 2 },
  marlow: { name: "Marlow", color: "coral", ears: "pointy", acc: "scarf", eyes: "wide", tuft: 2 },
  tock: { name: "Tock", color: "sage", ears: "none", acc: "crown", eyes: "dot", tuft: 0 },
  mote: { name: "Mote", color: "sky", ears: "round", acc: "star", eyes: "sleepy", tuft: 1 },
  fig: { name: "Fig", color: "bark", ears: "long", acc: "scarf", eyes: "sparkle", tuft: 1 },
  juno: { name: "Juno", color: "slate", ears: "pointy", acc: "specs", eyes: "wide", tuft: 3 },
  sable: { name: "Sable", color: "coral", ears: "tuft", acc: "crown", eyes: "sleepy", tuft: 0 },
};

export const MASCOT_KEYS = Object.keys(MASCOTS);

/* `mood` only moves the mouth and the eyelids. A host that grinned at a wrong
   answer would be worse than one that never changed. */
export function mascot(id, { size = 120, mood = "calm" } = {}) {
  const m = MASCOTS[id];
  if (!m) throw new Error(`unknown mascot: ${id}`);
  const next = rng(hashString(id));
  const c = m.color;
  let out = "";

  // Body first, so the head washes over the top of it.
  out += wash(smoothPath([[-20, 18], [-24, 40], [-14, 46], [14, 46], [24, 40], [20, 18]], true), c, { opacity: 0.9 });
  out += wash(smoothPath(blobPts(-26, 34, 8, 7, next, 0.14, 10), true), c, { opacity: 0.85, bleed: 4 });
  out += wash(smoothPath(blobPts(26, 34, 8, 7, next, 0.14, 10), true), c, { opacity: 0.85, bleed: 4 });

  out += ears(m, c, next);

  // The head: two thirds of the whole creature.
  const head = smoothPath(blobPts(0, -8, 34, 31, next, 0.055, 16), true);
  out += wash(head, c);

  // A pale muzzle keeps the face readable against the head wash.
  out += wash(smoothPath(blobPts(0, 5, 18, 11.5, next, 0.09, 12), true), "#ffffff", { soft: true, opacity: 0.5, bleed: 5 });

  out += face(m, next);
  out += accessory(m, next);
  out += mouth(mood);
  return svgWrap(`<g style="mix-blend-mode:multiply">${out}</g>`, size, "-52 -58 104 112");
}

function ears(m, c, next) {
  const paint = (pts, o = 1) => wash(smoothPath(pts, true), c, { opacity: o });
  switch (m.ears) {
    case "long":
      return (
        paint([[-20, -32], [-26, -58], [-18, -72], [-8, -64], [-8, -34]]) +
        paint([[20, -32], [26, -58], [18, -72], [8, -64], [8, -34]])
      );
    case "pointy":
      return paint([[-32, -22], [-34, -50], [-10, -34]]) + paint([[32, -22], [34, -50], [10, -34]]);
    case "round":
      return (
        paint(blobPts(-30, -30, 12, 12, next, 0.12, 10)) + paint(blobPts(30, -30, 12, 12, next, 0.12, 10))
      );
    case "tuft":
      return paint([[-30, -26], [-36, -46], [-22, -40], [-16, -50], [-10, -32]]) + paint([[30, -26], [36, -46], [22, -40], [16, -50], [10, -32]]);
    case "fin":
      return paint([[-2, -40], [-14, -56], [2, -52], [14, -58], [8, -40]]);
    case "beak":
      return "";
    default:
      return "";
  }
}

function face(m, next) {
  let out = "";
  const eyeY = 0;
  const eyeR = m.eyes === "sleepy" ? 5 : 7;
  const paintEye = (x) => {
    let s = wash(smoothPath(blobPts(x, eyeY, eyeR, m.eyes === "sleepy" ? eyeR * 0.55 : eyeR * 1.15, next, 0.1, 10), true), INK, { soft: true, bleed: 2 });
    if (m.eyes !== "sleepy") {
      // The catchlight is the whole difference between cute and unsettling.
      s += `<circle cx="${x + 2.4}" cy="${eyeY - 3}" r="2.3" fill="${PAPER}" opacity="0.95"/>`;
    }
    if (m.eyes === "sparkle") s += `<circle cx="${x - 2.6}" cy="${eyeY + 3}" r="1.2" fill="${PAPER}" opacity="0.8"/>`;
    return s;
  };
  out += paintEye(-13) + paintEye(13);

  // Blush, always soft - a rim on a cheek reads as a wound.
  out += wash(smoothPath(blobPts(-24, 8, 7, 4.5, next, 0.14, 9), true), "rose", { soft: true, opacity: 0.55, bleed: 4 });
  out += wash(smoothPath(blobPts(24, 8, 7, 4.5, next, 0.14, 9), true), "rose", { soft: true, opacity: 0.55, bleed: 4 });

  if (m.ears === "beak") out += wash(smoothPath([[0, 6], [10, 12], [0, 20], [-10, 12]], true), "amber", { opacity: 0.95, bleed: 3 });
  for (let i = 0; i < m.tuft; i++) {
    const x = -6 + i * 4;
    out += `<path d="M${x} -40 q ${2 + i} -8 ${4 + i} -12" fill="none" stroke="${tones(m.color).rim}" stroke-width="2.4" stroke-linecap="round" opacity="0.5" filter="url(#pb-edge)"/>`;
  }
  return out;
}

function accessory(m, next) {
  switch (m.acc) {
    case "leaf":
      return wash(smoothPath([[16, -40], [34, -50], [42, -38], [30, -30], [18, -32]], true), "lime", { bleed: 4 });
    case "flame":
      return wash(smoothPath([[0, -66], [10, -50], [6, -38], [-6, -38], [-10, -50]], true), "amber", { bleed: 4 });
    case "specs":
      return `<g fill="none" stroke="${INK}" stroke-width="2.2" opacity="0.65" filter="url(#pb-edge)"><circle cx="-13" cy="0" r="11"/><circle cx="13" cy="0" r="11"/><path d="M-2 0h4"/></g>`;
    case "scarf":
      return wash(smoothPath([[-24, 20], [0, 26], [24, 20], [26, 30], [0, 36], [-26, 30]], true), "teal", { bleed: 4 });
    case "crown":
      return wash(smoothPath([[-20, -34], [-16, -52], [-6, -42], [0, -56], [6, -42], [16, -52], [20, -34]], true), "amber", { bleed: 4 });
    case "star":
      return wash(smoothPath(starPts(5, 13, 6).map(([x, y]) => [x + 30, y - 42]), true, 0.6), "amber", { bleed: 3 });
    default:
      return "";
  }
}

function mouth(mood) {
  const stroke = `fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" opacity="0.7" filter="url(#pb-edge)"`;
  if (mood === "happy") return `<path d="M-9 13 q9 11 18 0" ${stroke}/>`;
  if (mood === "sad") return `<path d="M-8 18 q8 -8 16 0" ${stroke}/>`;
  if (mood === "think") return `<path d="M-7 16 q7 3 14 -2" ${stroke}/>`;
  return `<path d="M-6 14 q6 6 12 0" ${stroke}/>`;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* --- composed pictures --------------------------------------------------- */

/* The grid of cells that Juno's counting puzzle is asked about. Each present
   cell is painted separately, so the seams between them stay visible - which
   is the whole point, since the puzzle is about the squares those seams make
   and not about the blob they add up to. */
export function figure(cells, cols, rows, { color = "sage", unit = 46 } = {}) {
  const pad = 8;
  const width = cols * unit + pad * 2;
  const height = rows * unit + pad * 2;
  let inner = "";
  cells.forEach((present, i) => {
    if (!present) return;
    const cx = pad + (i % cols) * unit + unit / 2;
    const cy = pad + Math.floor(i / cols) * unit + unit / 2;
    const next = rng((i + 7) * 2654435761);
    const half = unit / 2 - 1.5;
    const pts = [
      [cx - half, cy - half], [cx, cy - half - 1], [cx + half, cy - half],
      [cx + half + 1, cy], [cx + half, cy + half], [cx, cy + half + 1],
      [cx - half, cy + half], [cx - half - 1, cy],
    ].map(([x, y]) => [x + (next() - 0.5) * 1.6, y + (next() - 0.5) * 1.6]);
    inner += `<g style="mix-blend-mode:multiply">${wash(smoothPath(pts, true, 0.35), color, { bleed: 3 })}</g>`;
  });
  return `<svg class="pb-art pb-figure" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export { esc };
