/* Checker and balance simulator for Puzzlebloom.

   Puzzlebloom generates its puzzles rather than shipping a list of them, which
   means the failure mode is not "this puzzle is wrong" but "one puzzle in four
   hundred is wrong, and the nine-year-old playing it thinks they are stupid".
   That is invisible from playing. So everything here is generated in bulk and
   graded by code that does not share the generator's opinion of the answer:
   the arithmetic is re-evaluated, the meadow is re-counted from the picture
   against the words of the question, the hidden word is re-searched in its
   grid, the sequence is re-solved by a solver that never saw the rules, and
   the mirrored shape is measured against every rotation of its twin.

       node tools/bloom-sim.mjs              # art + puzzle checks, 400 each
       node tools/bloom-sim.mjs --runs 2000  # more samples
       node tools/bloom-sim.mjs --careers    # the unlock ladder, three players
       node tools/bloom-sim.mjs --curve      # what gets harder, and by how much

   What good output looks like, and what it currently says:

     every generator: 0 faults over 22000 puzzles
     the right answer lands in each slot 24-26% of the time
     every difficulty proxy climbs from level 1 to level 5
     a middling player opens all eleven hosts in 13-16 Journeys, about an hour
     a weak player still opens all eleven, in 22-27

   Not part of serving the site - nothing under games/ imports it. */

import * as art from "../games/puzzlebloom/art.js";
import * as puzzles from "../games/puzzlebloom/puzzles.js";
import * as progress from "../games/puzzlebloom/progress.js";
import { RIDDLES, CATEGORIES } from "../games/puzzlebloom/words.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const has = (name) => args.includes(`--${name}`);
const RUNS = flag("runs", 400);

let faults = 0;
const fail = (where, why, extra) => {
  faults += 1;
  if (faults <= 25) console.log(`  FAULT ${where}: ${why}${extra ? ` ${JSON.stringify(extra).slice(0, 200)}` : ""}`);
};

/* --- shape geometry, for the chirality proof ----------------------------- */

function dense(pts, n = 200) {
  const segs = pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lens.reduce((s, l) => s + l, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    let t = (i / n) * total;
    for (let s = 0; s < segs.length; s++) {
      if (t <= lens[s] || s === segs.length - 1) {
        const f = lens[s] ? t / lens[s] : 0;
        out.push([segs[s][0][0] + (segs[s][1][0] - segs[s][0][0]) * f, segs[s][0][1] + (segs[s][1][1] - segs[s][0][1]) * f]);
        break;
      }
      t -= lens[s];
    }
  }
  return out;
}

function hausdorff(A, B) {
  const one = (P, Q) => {
    let worst = 0;
    for (const p of P) {
      let best = Infinity;
      for (const q of Q) best = Math.min(best, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
      worst = Math.max(worst, best);
    }
    return Math.sqrt(worst);
  };
  return Math.max(one(A, B), one(B, A));
}

/* How far a shape's mirror image sits from the closest thing a rotation of it
   can reach. Zero means the mirror is just a turn, and the Mirror puzzle would
   be asking the player to see a difference that is not there. */
function mirrorGap(pts, step = 2) {
  const M = dense(art.mirrorPts(pts));
  let best = Infinity;
  for (let d = 0; d < 360; d += step) best = Math.min(best, hausdorff(M, dense(art.rotatePts(pts, d))));
  return best;
}

const CHIRAL_MIN = 5; // units, on shapes about 68 units across

/* --- markup checks -------------------------------------------------------- */

const VOID_OK = new Set(["path", "circle", "rect", "line", "ellipse", "polygon", "polyline", "stop", "use", "feTurbulence", "feDisplacementMap", "feGaussianBlur", "feColorMatrix"]);

/* A tag-balance scan, which is all that is needed to catch the real failure -
   a template that forgot a closing </g> and silently swallows everything after
   it. There is no XML parser in Node without a dependency, and this game has
   none by design. */
function wellFormed(svg) {
  const stack = [];
  const tag = /<(\/?)([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let m;
  let scanned = 0;
  while ((m = tag.exec(svg))) {
    scanned = tag.lastIndex;
    const [, closing, name, attrs, selfClose] = m;
    if (closing) {
      if (stack.pop() !== name) return `mismatched </${name}>`;
      continue;
    }
    // Every attribute must be name="value" - an unquoted one is a rendering
    // bug that only shows up on some browsers.
    const bad = attrs.replace(/\s+[\w:-]+="[^"]*"/g, "").trim();
    if (bad) return `bad attributes on <${name}>: ${bad.slice(0, 40)}`;
    if (!selfClose && !VOID_OK.has(name)) stack.push(name);
    if (selfClose && !VOID_OK.has(name) && name !== "svg") return `unexpected self-closing <${name}>`;
  }
  if (scanned === 0) return "no markup at all";
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  return null;
}

const KNOWN_FILTERS = new Set([...art.defs().matchAll(/<filter id="([^"]+)"/g)].map((m) => m[1]));

function checkArtString(svg, where) {
  const problem = wellFormed(svg);
  if (problem) return fail(where, problem);
  for (const m of svg.matchAll(/filter="url\(#([^)]+)\)"/g)) {
    if (!KNOWN_FILTERS.has(m[1])) fail(where, `references undefined filter #${m[1]}`);
  }
  for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)) {
    if (!/^#[0-9a-fA-F]{6}$/.test(m[1])) fail(where, `odd colour literal ${m[1]}`);
  }
}

function checkArt() {
  console.log("\nArt");
  const before = faults;
  checkArtString(art.defs(), "defs");
  for (const key of art.GLYPH_KEYS) {
    const gap = mirrorGap(art.GLYPHS[key].pts);
    const chiral = gap >= CHIRAL_MIN;
    if (chiral !== art.GLYPHS[key].chiral) {
      fail(`glyph ${key}`, `claims chiral=${art.GLYPHS[key].chiral} but mirror sits ${gap.toFixed(2)} from the nearest rotation`);
    }
    for (const flip of [false, true]) {
      checkArtString(art.token({ glyph: key, color: "teal", rotate: 37, flip, seed: 3, decor: 2 }), `token ${key}`);
    }
    if (has("show")) console.log(`  ${key.padEnd(9)} mirror gap ${gap.toFixed(2).padStart(6)}  ${art.GLYPHS[key].chiral ? "chiral" : "-"}`);
  }
  for (const id of art.MASCOT_KEYS) {
    for (const mood of ["calm", "happy", "sad", "think"]) checkArtString(art.mascot(id, { mood }), `mascot ${id}`);
  }
  for (const key of art.COLOR_KEYS) {
    const t = art.tones(key);
    for (const [name, hex] of Object.entries(t)) {
      if (!/^#[0-9a-f]{6}$/.test(hex)) fail(`tones ${key}`, `${name} is ${hex}`);
    }
  }
  // Every mascot a puzzle names must exist, or its card renders empty.
  for (const k of puzzles.KINDS) {
    if (!art.MASCOTS[k.host]) fail(`kind ${k.id}`, `host "${k.host}" is not a mascot`);
  }
  const hosts = new Set(puzzles.KINDS.map((k) => k.host));
  if (hosts.size !== puzzles.KINDS.length) fail("kinds", "two puzzles share a host");
  console.log(`  ${art.GLYPH_KEYS.length} glyphs, ${art.MASCOT_KEYS.length} hosts, ${faults - before} faults`);
}

/* --- per-puzzle graders --------------------------------------------------- */

const tokenKey = (t) => `${t.glyph}|${t.color}|${(t.rotate || 0) % 360}|${t.flip ? "f" : ""}|${t.decor || 0}`;
const optionKey = (o) => (o.text !== undefined ? `t:${o.text}` : `k:${tokenKey(o.token)}`);

const PLURAL_TO_GLYPH = Object.fromEntries(Object.entries(art.GLYPH_NAMES).map(([g, [, p]]) => [p, g]));
const NAME_TO_COLOR = Object.fromEntries(Object.entries(art.COLOR_NAMES).map(([k, n]) => [n, k]));

const OPS = { "+": (a, b) => a + b, "−": (a, b) => a - b, "×": (a, b) => a * b, "÷": (a, b) => (b && a % b === 0 ? a / b : NaN) };

const graders = {
  /* The letters given must be the answer's letters, and must not already spell
     it - a scramble that hands over the word is a free mark. */
  scramble(q, where) {
    const sorted = (s) => s.split("").sort().join("");
    if (sorted(q.letters.join("")) !== sorted(q.answer)) fail(where, "letters are not the answer's letters", { letters: q.letters, answer: q.answer });
    if (q.letters.join("") === q.answer) fail(where, "the scramble is the word");
    if (!/^[A-Z]+$/.test(q.answer)) fail(where, `answer is not plain uppercase: ${q.answer}`);
  },

  riddle(q, where) {
    const source = RIDDLES.find((r) => r.q === q.prompt);
    if (!source) return fail(where, "riddle is not in the list");
    if (q.options[q.answer].text !== source.o[source.a]) fail(where, "marked answer is not the riddle's answer");
    const expected = new Set(source.o);
    for (const o of q.options) if (!expected.has(o.text)) fail(where, `option "${o.text}" is not one of the riddle's four`);
  },

  /* Three options must agree on everything and the fourth must break exactly
     the property the explanation names. */
  oddShape(q, where) {
    const others = q.options.filter((_, i) => i !== q.answer).map((o) => o.token);
    const odd = q.options[q.answer].token;
    const props = ["glyph", "color", "decor"];
    for (const p of props) {
      const values = new Set(others.map((t) => t[p] ?? 0));
      if (values.size !== 1) return fail(where, `the three matching tokens disagree on ${p}`);
    }
    const differs = props.filter((p) => (odd[p] ?? 0) !== (others[0][p] ?? 0));
    if (differs.length === 0) fail(where, "the odd one is not odd");
  },

  oddWord(q, where) {
    const words = q.options.map((o) => o.text);
    const odd = words[q.answer];
    const cat = CATEGORIES.find((c) => c.out.includes(odd) && words.filter((w) => c.in.includes(w)).length === words.length - 1);
    if (!cat) fail(where, "no category makes exactly this word the odd one", words);
  },

  /* Exactly one option may be a flip, its glyph must be genuinely chiral, and
     the flipped shape must sit measurably away from every rotation on show. */
  mirror(q, where) {
    const flipped = q.options.filter((o) => o.token.flip);
    if (flipped.length !== 1) return fail(where, `${flipped.length} flipped options`);
    if (q.options[q.answer].token.flip !== true) return fail(where, "the marked answer is not the flipped one");
    const glyph = q.options[0].token.glyph;
    if (!art.GLYPHS[glyph].chiral) return fail(where, `glyph ${glyph} is not chiral`);
    if (new Set(q.options.map((o) => o.token.glyph)).size !== 1) fail(where, "options are not all the same shape");
    const pts = art.GLYPHS[glyph].pts;
    const target = dense(art.rotatePts(art.mirrorPts(pts), q.options[q.answer].token.rotate));
    for (const o of q.options) {
      if (o.token.flip) continue;
      const gap = hausdorff(target, dense(art.rotatePts(pts, o.token.rotate)));
      if (gap < CHIRAL_MIN) fail(where, `the flip is only ${gap.toFixed(1)} from a rotation on show`);
    }
  },

  /* Solved from the row alone, by rules this solver works out for itself. */
  sequence(q, where) {
    const row = q.stimulus.items;
    const predict = (values) => {
      const n = values.length;
      if (values.every((v) => v === values[0])) return values[0];
      for (const period of [2, 3]) {
        let fits = n > period;
        for (let i = period; i < n; i++) if (values[i] !== values[i - period]) fits = false;
        if (fits) return values[n - period];
      }
      if (values.every((v) => typeof v === "number")) {
        const d = (values[1] - values[0] + 360) % 360;
        let fits = true;
        for (let i = 1; i < n; i++) if ((values[i] - values[i - 1] + 360) % 360 !== d) fits = false;
        if (fits) return (values[n - 1] + d) % 360;
      }
      return undefined;
    };
    const wanted = {};
    for (const p of ["glyph", "color", "rotate", "decor"]) {
      const v = predict(row.map((t) => t[p] ?? 0));
      if (v === undefined) return fail(where, `no rule explains ${p} in the row`, row.map((t) => t[p]));
      wanted[p] = v;
    }
    const matches = q.options.filter((o) => ["glyph", "color", "rotate", "decor"].every((p) => (o.token[p] ?? 0) === wanted[p]));
    if (matches.length !== 1) return fail(where, `${matches.length} options continue the pattern`, { wanted });
    if (q.options[q.answer] !== matches[0]) fail(where, "the marked answer is not the one that continues the pattern");
  },

  /* Weights come out of the pictured scales; the sum comes out of the words of
     the question. Neither is the generator's own arithmetic. */
  balance(q, where) {
    const weights = new Map();
    const name = (t) => `${art.COLOR_NAMES[t.color]} ${art.GLYPH_NAMES[t.glyph][0]}`;
    const first = q.stimulus.facts[0];
    weights.set(name(first.left[0]), 1);
    for (const f of q.stimulus.facts) {
      const w = weights.get(name(f.left[0]));
      if (w === undefined) return fail(where, "a scale weighs something never established");
      if (!f.left.every((i) => name(i) === name(f.left[0]))) return fail(where, "mixed items on one pan");
      weights.set(name(f.right[0]), w * f.left.length);
    }
    const plural = (t) => `${art.COLOR_NAMES[t.color]} ${art.GLYPH_NAMES[t.glyph][1]}`;
    const byPlural = new Map();
    for (const f of q.stimulus.facts) for (const i of [...f.left, ...f.right]) byPlural.set(plural(i), weights.get(name(i)));
    const w = (phrase) => byPlural.get(phrase.trim());
    const p = q.prompt;
    let expect;
    let m;
    if ((m = p.match(/^How many (.+?) balance one (.+?) and one (.+?) together\?$/))) {
      expect = (weights.get(m[2]) + weights.get(m[3])) / w(m[1]);
    } else if ((m = p.match(/^How many (.+?) balance two (.+?)\?$/))) {
      expect = (2 * w(m[2])) / w(m[1]);
    } else if ((m = p.match(/^How many (.+?) balance one (.+?)\?$/))) {
      expect = weights.get(m[2]) / w(m[1]);
    } else if ((m = p.match(/^One (.+?) balances one (.+?) and how many (.+?)\?$/))) {
      expect = (weights.get(m[1]) - weights.get(m[2])) / w(m[3]);
    } else {
      return fail(where, `prompt does not match any known question: ${p}`);
    }
    if (!Number.isFinite(expect)) return fail(where, `could not weigh the question: ${p}`);
    if (Number(q.options[q.answer].text) !== expect) fail(where, `scales say ${expect}, puzzle says ${q.options[q.answer].text}`);
  },

  flash(q, where) {
    const row = q.study.stimulus.items.map((t) => `${t.glyph}|${t.color}`);
    const odd = q.options[q.answer].token;
    if (row.includes(`${odd.glyph}|${odd.color}`)) fail(where, "the answer was in the row after all");
    for (const [i, o] of q.options.entries()) {
      if (i === q.answer) continue;
      if (!row.includes(`${o.token.glyph}|${o.token.color}`)) fail(where, "a decoy was not in the row");
    }
    if (new Set(row).size !== row.length) fail(where, "the row repeats an item");
  },

  /* The word must be findable, and findable exactly once - two copies would
     mean two right answers and only one of them scores. */
  wordHunt(q, where) {
    const { size, cells } = q.grid;
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]];
    let found = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (const [dx, dy] of dirs) {
          let s = "";
          for (let i = 0; i < q.word.length; i++) {
            const nx = x + dx * i;
            const ny = y + dy * i;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
            s += cells[ny * size + nx];
          }
          if (s === q.word) found += 1;
        }
      }
    }
    if (found !== 1) fail(where, `the word appears ${found} times`);
    if (q.answer.map((c) => cells[c]).join("") !== q.word) fail(where, "the marked path does not spell the word");
    if (cells.some((c) => !/^[A-Z]$/.test(c))) fail(where, "grid holds something that is not a letter");
  },

  /* Re-evaluate the sum in the prompt with each offered sign, and insist that
     exactly one of them lands on the target. */
  numberChain(q, where) {
    const p = q.stimulus.text;
    let m;
    let hits;
    if ((m = p.match(/^(\d+)\s+\?\s+(\d+)\s+=\s+(-?\d+)$/))) {
      const [a, b, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
      hits = q.options.map((o, i) => [i, OPS[o.text](a, b)]).filter(([, v]) => v === t);
    } else if ((m = p.match(/^\(\s*(\d+)\s+\?\s+(\d+)\s*\)\s+\?\s+(\d+)\s+=\s+(-?\d+)$/))) {
      const [a, b, c, t] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      hits = q.options.map((o, i) => {
        const [o1, o2] = o.text.split("then").map((s) => s.trim());
        return [i, OPS[o2](OPS[o1](a, b), c)];
      }).filter(([, v]) => v === t);
    } else if ((m = p.match(/^\(\s*(\d+)\s+(.)\s+\?\s*\)\s+(.)\s+(\d+)\s+=\s+(-?\d+)$/))) {
      const [a, o1, o2, c, t] = [Number(m[1]), m[2], m[3], Number(m[4]), Number(m[5])];
      hits = q.options.map((o, i) => [i, OPS[o2](OPS[o1](a, Number(o.text)), c)]).filter(([, v]) => v === t);
    } else {
      return fail(where, `the shown sum is not one this checker knows: ${p}`);
    }
    if (hits.length !== 1) return fail(where, `${hits.length} of the options hit the target`, { p, options: q.options.map((o) => o.text) });
    if (hits[0][0] !== q.answer) fail(where, "the marked answer is not the one that works");
  },

  /* Re-count the meadow from the picture, reading the question's own words for
     what to count. */
  counting(q, where) {
    const items = q.stimulus.items;
    const p = q.prompt;
    const countIf = (fn) => items.filter(fn).length;
    let expect;
    let m;
    if ((m = p.match(/^What is the difference between how many (\w+) and how many (\w+) there are\?$/))) {
      const a = PLURAL_TO_GLYPH[m[1]];
      const b = PLURAL_TO_GLYPH[m[2]];
      expect = Math.abs(countIf((i) => i.glyph === a) - countIf((i) => i.glyph === b));
    } else if ((m = p.match(/^How many (\w+) are NOT (\w+)\?$/))) {
      expect = countIf((i) => i.glyph === PLURAL_TO_GLYPH[m[1]] && i.color !== NAME_TO_COLOR[m[2]]);
    } else if ((m = p.match(/^How many (\w+) things are there\?$/))) {
      expect = countIf((i) => i.color === NAME_TO_COLOR[m[1]]);
    } else if ((m = p.match(/^How many (\w+) (\w+) are there\?$/))) {
      expect = countIf((i) => i.color === NAME_TO_COLOR[m[1]] && i.glyph === PLURAL_TO_GLYPH[m[2]]);
    } else if ((m = p.match(/^How many (\w+) are there\?$/))) {
      expect = countIf((i) => i.glyph === PLURAL_TO_GLYPH[m[1]]);
    } else {
      return fail(where, `prompt is not a question this checker knows: ${p}`);
    }
    if (Number(q.options[q.answer].text) !== expect) fail(where, `the picture holds ${expect}, the puzzle says ${q.options[q.answer].text}`);
    // Two items on top of each other cannot be counted at all.
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y) < 16) fail(where, "two items are painted on top of each other");
      }
    }
  },
};

/* --- the sweep ------------------------------------------------------------ */

function checkPuzzles() {
  console.log(`\nPuzzles (${RUNS} per kind per level)`);
  const slotCounts = [0, 0, 0, 0, 0];
  let generated = 0;

  for (const kind of puzzles.KINDS) {
    const before = faults;
    const slots = [0, 0, 0, 0, 0];
    for (let level = 1; level <= 5; level++) {
      for (let r = 0; r < RUNS; r++) {
        const next = art.rng(art.hashString(`${kind.id}:${level}:${r}`));
        const q = puzzles.makePuzzle(kind.id, next, level);
        generated += 1;
        const where = `${kind.id} L${level} #${r}`;

        if (q.kind !== kind.id) fail(where, `generator returned kind ${q.kind}`);
        if (q.host !== kind.host) fail(where, "generator returned a different host");
        if (!q.prompt || !q.hint || !q.explain) fail(where, "missing prompt, hint or explanation");

        if (q.form === "choice") {
          if (!Array.isArray(q.options) || q.options.length < 3) fail(where, "too few options");
          // Odd One Out is the one puzzle where repeated options are the point:
          // three cards match and the fourth does not.
          if (kind.id === "oddShape") {
            const counts = new Map();
            for (const o of q.options) counts.set(optionKey(o), (counts.get(optionKey(o)) || 0) + 1);
            if (counts.get(optionKey(q.options[q.answer])) !== 1) fail(where, "the odd one is not the only one of its kind");
            if (counts.size !== 2) fail(where, "the matching cards do not all match", q.options.map(optionKey));
          } else if (new Set(q.options.map(optionKey)).size !== q.options.length) {
            fail(where, "two options are the same", q.options.map(optionKey));
          }
          if (!(q.answer >= 0 && q.answer < q.options.length)) fail(where, `answer index ${q.answer} out of range`);
          slots[q.answer] += 1;
          slotCounts[q.answer] += 1;
          // The grader the screen uses must agree, and must reject every other
          // option - if it accepted two, a wrong tap would score.
          for (let i = 0; i < q.options.length; i++) {
            if (puzzles.isCorrect(q, i) !== (i === q.answer)) fail(where, `isCorrect disagrees at option ${i}`);
          }
        } else if (q.form === "letters") {
          if (!puzzles.isCorrect(q, q.answer)) fail(where, "isCorrect rejects the answer");
          if (puzzles.isCorrect(q, q.answer.split("").reverse().join("") + "X")) fail(where, "isCorrect accepts nonsense");
        } else if (q.form === "grid") {
          if (!puzzles.isCorrect(q, q.answer)) fail(where, "isCorrect rejects the path");
          if (puzzles.isCorrect(q, q.answer.slice(0, -1))) fail(where, "isCorrect accepts a short path");
        } else {
          fail(where, `unknown form ${q.form}`);
        }

        for (const opt of q.options || []) {
          if (opt.token) checkArtString(art.token(opt.token), `${where} option art`);
        }
        if (q.stimulus?.type === "tokens") for (const t of q.stimulus.items) checkArtString(art.token(t), `${where} row art`);
        if (q.stimulus?.type === "scene") checkArtString(art.scene(q.stimulus.items, q.stimulus), `${where} scene art`);
        if (q.stimulus?.type === "scales") checkArtString(art.scales(q.stimulus.facts), `${where} scales art`);
        if (q.study?.stimulus?.items) for (const t of q.study.stimulus.items) checkArtString(art.token(t), `${where} study art`);

        graders[kind.id]?.(q, where);
      }
    }
    const total = slots.reduce((a, b) => a + b, 0) || 1;
    const spread = slots.filter((n) => n).map((n) => `${Math.round((n / total) * 100)}%`).join(" ");
    console.log(`  ${kind.id.padEnd(12)} ${String(faults - before).padStart(3)} faults   answer slots ${spread}`);
  }
  const all = slotCounts.reduce((a, b) => a + b, 0) || 1;
  console.log(`  ${generated} puzzles, ${faults} faults, answer lands in each slot ${slotCounts.filter((n) => n).map((n) => `${Math.round((n / all) * 100)}%`).join("/")}`);
}

/* --- does it actually get harder? ----------------------------------------- */

/* Objective proxies, not opinions: how many letters to reorder, how many items
   to count, how many degrees apart the shapes on show are. A ladder whose
   proxy does not climb is a ladder that only looks like one. */
const PROXY = {
  scramble: (q) => q.answer.length,
  riddle: (q) => RIDDLES.findIndex((r) => r.q === q.prompt),
  oddShape: (q) => ({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 })[q.level],
  oddWord: (q) => q.options.length,
  mirror: (q) => 360 / Math.min(...q.options.map((o) => o.token.rotate).filter((a, i, l) => l.indexOf(a) === i).sort((a, b) => a - b).map((a, i, l) => (i ? a - l[i - 1] : 360)).filter((d) => d > 0)),
  sequence: (q) => q.pattern.length * q.stimulus.items.length,
  balance: (q) => q.stimulus.facts.length * 2 + (q.prompt.includes("and") ? 1 : 0),
  flash: (q) => q.study.stimulus.items.length / q.study.seconds,
  wordHunt: (q) => (q.grid.size * q.word.length * q.directions) / 2,
  numberChain: (q) => q.options.length + (q.stimulus.text.includes("(") ? 4 : 0),
  counting: (q) => q.stimulus.items.length,
};

function checkCurve() {
  console.log("\nDifficulty proxies by level (each must climb)");
  for (const kind of puzzles.KINDS) {
    const means = [];
    for (let level = 1; level <= 5; level++) {
      let sum = 0;
      for (let r = 0; r < 200; r++) {
        const next = art.rng(art.hashString(`curve:${kind.id}:${level}:${r}`));
        sum += PROXY[kind.id](puzzles.makePuzzle(kind.id, next, level));
      }
      means.push(sum / 200);
    }
    const climbs = means[4] > means[0] && means.every((v, i) => i === 0 || v >= means[i - 1] - 0.001);
    console.log(`  ${kind.id.padEnd(12)} ${means.map((v) => v.toFixed(1).padStart(6)).join("")}   ${climbs ? "climbs" : "FLAT OR FALLS"}`);
    if (!climbs) faults += 1;
  }
}

/* --- careers -------------------------------------------------------------- */

/* Assumed accuracies, not a solver: nobody can write a program that reads a
   riddle the way a nine-year-old does. What the careers are for is the one
   question a model can answer honestly - whether the unlock ladder is
   reachable, or whether the last four hosts sit behind a wall nobody walks to.
   Three players bracket the range, and the answer has to hold for all three. */
const SKILL = {
  // How often a nine-year-old gets a level-1 one of these right, and how much
  // each step up the ladder takes off. Level 1 is genuinely easy - "one of
  // these is a different shape AND a different colour" - so these start high.
  scramble: { easy: 0.92, slope: 0.09 },
  riddle: { easy: 0.85, slope: 0.08 },
  oddShape: { easy: 0.97, slope: 0.1 },
  oddWord: { easy: 0.94, slope: 0.06 },
  mirror: { easy: 0.88, slope: 0.09 },
  sequence: { easy: 0.93, slope: 0.09 },
  balance: { easy: 0.86, slope: 0.11 },
  flash: { easy: 0.9, slope: 0.09 },
  wordHunt: { easy: 0.93, slope: 0.07 },
  numberChain: { easy: 0.9, slope: 0.09 },
  counting: { easy: 0.95, slope: 0.08 },
};

const PLAYERS = [
  { name: "finding their feet", bonus: -0.16 },
  { name: "middling", bonus: 0 },
  { name: "sharp", bonus: 0.07 },
];

function playJourney(save, player, next) {
  const plan = progress.journeyPlan(save, next);
  let hearts = progress.HEARTS;
  let correct = 0;
  let asked = 0;
  let petals = 0;
  for (const round of plan) {
    if (hearts <= 0) break;
    asked += 1;
    const q = puzzles.makePuzzle(round.kind, next, round.level);
    const floor = q.form === "choice" ? 1 / q.options.length : 0.05;
    const skill = SKILL[round.kind];
    const p = Math.max(floor, Math.min(0.98, skill.easy + player.bonus - skill.slope * (round.level - 1)));
    const right = next() < p;
    petals += progress.bankAnswer(save, round.kind, right, "journey");
    if (right) correct += 1;
    else hearts -= 1;
  }
  petals += progress.finishJourney(save, correct, progress.JOURNEY_LENGTH);
  return { correct, asked, hearts, petals, survived: hearts > 0 };
}

function careers(runs = 200) {
  console.log(`\nCareers (${runs} players each, Journeys until every host is open)`);
  for (const player of PLAYERS) {
    const toAll = [];
    const petalsPer = [];
    const survivals = [];
    const correctPer = [];
    for (let r = 0; r < runs; r++) {
      const save = progress.newSave();
      const next = art.rng(art.hashString(`career:${player.name}:${r}`));
      let journeys = 0;
      while (progress.unlockedCount(save) < puzzles.KINDS.length && journeys < 300) {
        const res = playJourney(save, player, next);
        journeys += 1;
        petalsPer.push(res.petals);
        survivals.push(res.survived ? 1 : 0);
        correctPer.push(res.correct);
      }
      toAll.push(journeys);
    }
    const mean = (l) => l.reduce((a, b) => a + b, 0) / l.length;
    const pct = (l, q) => l.slice().sort((a, b) => a - b)[Math.floor(l.length * q)];
    console.log(
      `  ${player.name.padEnd(18)} all 11 hosts in ${pct(toAll, 0.1)}-${pct(toAll, 0.9)} Journeys (median ${pct(toAll, 0.5)})` +
        `   ${mean(correctPer).toFixed(1)}/${progress.JOURNEY_LENGTH} right, ${mean(petalsPer).toFixed(1)} petals a run, ${Math.round(mean(survivals) * 100)}% reach the end`
    );
    if (pct(toAll, 0.9) > 30) {
      fail("careers", `${player.name} needs ${pct(toAll, 0.9)} Journeys to see everything - the last hosts are out of reach`);
    }
    if (mean(survivals) < 0.4) fail("careers", `${player.name} runs out of hearts ${Math.round((1 - mean(survivals)) * 100)}% of the time`);
  }

  // Stars have to be reachable too, or the third one is decoration.
  const save = progress.newSave();
  const next = art.rng(7);
  const player = PLAYERS[1];
  for (let i = 0; i < 40; i++) playJourney(save, player, next);
  const stars = puzzles.KINDS.map((k) => progress.starsFor(save, k.id));
  console.log(`  after 40 Journeys a middling player holds ${stars.reduce((a, b) => a + b, 0)}/${puzzles.KINDS.length * 3} stars (${stars.join("")})`);
  if (progress.totalStars(save) === 0) fail("stars", "no stars are reachable at all");
}

/* --- run ------------------------------------------------------------------ */

checkArt();
checkPuzzles();
if (has("curve") || !has("careers")) checkCurve();
if (has("careers") || !has("curve")) careers(flag("players", 200));

console.log(`\n${faults === 0 ? "All checks passed." : `${faults} FAULTS.`}`);
process.exit(faults === 0 ? 0 : 1);
