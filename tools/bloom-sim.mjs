/* Checker and balance simulator for Puzzlebloom.

   Puzzlebloom generates its puzzles rather than shipping a list of them, so the
   failure mode is not "this puzzle is wrong" but "one puzzle in four hundred is
   wrong, and the nine-year-old playing it thinks they are stupid". That is
   invisible from playing. So everything is generated in bulk and graded by code
   that does not share the generator's opinion of the answer.

   The rule followed throughout: the generator *builds* a situation forwards,
   and the checker *solves it backwards* from the words and pictures the player
   is actually shown. The two never share a formula. The liar puzzle is
   re-solved from its printed sentences; the logic grid from its printed clues;
   the cipher is re-decoded from the example it prints; the cube is re-folded by
   rolling a labelled die instead of tracking normals; every word problem is
   re-solved from the numbers in its own sentence.

       node tools/bloom-sim.mjs              # art + puzzle checks, 400 each
       node tools/bloom-sim.mjs --runs 2000  # more samples
       node tools/bloom-sim.mjs --careers    # the unlock ladder, three players
       node tools/bloom-sim.mjs --curve      # what gets harder, and by how much

   Not part of serving the site - nothing under games/ imports it. */

import * as art from "../games/puzzlebloom/art.js";
import * as puzzles from "../games/puzzlebloom/puzzles.js";
import * as progress from "../games/puzzlebloom/progress.js";
import { RIDDLES, ANALOGIES, LADDER_WORDS } from "../games/puzzlebloom/words.js";

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
  if (faults <= 25) console.log(`  FAULT ${where}: ${why}${extra ? ` ${JSON.stringify(extra).slice(0, 220)}` : ""}`);
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

/* A tag-balance scan, which is all that is needed to catch the real failure - a
   template that forgot a closing </g> and silently swallows everything after
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
    if (gap >= CHIRAL_MIN !== art.GLYPHS[key].chiral) {
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
  checkArtString(art.figure([true, true, false, true, true, true], 3, 2), "figure");
  for (const k of puzzles.KINDS) {
    if (!art.MASCOTS[k.host]) fail(`kind ${k.id}`, `host "${k.host}" is not a mascot`);
  }
  if (new Set(puzzles.KINDS.map((k) => k.host)).size !== puzzles.KINDS.length) fail("kinds", "two puzzles share a host");
  if (progress.FREE_KINDS + progress.UNLOCK_AT.length !== puzzles.KINDS.length) {
    fail("kinds", `${puzzles.KINDS.length} puzzles but ${progress.FREE_KINDS + progress.UNLOCK_AT.length} unlock slots`);
  }
  console.log(`  ${art.GLYPH_KEYS.length} glyphs, ${art.MASCOT_KEYS.length} hosts, ${faults - before} faults`);
}

/* --- independent solvers -------------------------------------------------- */

/* Sequence rules, written again and differently: this one fits a polynomial
   through the terms by repeated differencing rather than testing named shapes,
   and only falls back to ratios and to Fibonacci. It has to reach the same
   next number the game does. */
function solveSequence(terms) {
  const out = new Set();

  // Newton forward differences. Build the table until a row of at least three
  // equal values appears, then sum the last entry of every row back up.
  const layers = [terms.slice()];
  while (layers[layers.length - 1].length > 1 && layers.length <= 4) {
    const a = layers[layers.length - 1];
    layers.push(a.slice(1).map((v, i) => v - a[i]));
  }
  for (let k = 0; k < layers.length; k++) {
    const layer = layers[k];
    if (layer.length >= 3 && new Set(layer).size === 1) {
      let carry = layer[0];
      for (let j = k - 1; j >= 0; j--) carry += layers[j][layers[j].length - 1];
      out.add(carry);
      break;
    }
  }

  // A constant ratio.
  if (terms[0] !== 0) {
    const r = terms[1] / terms[0];
    if (Number.isInteger(r) && Math.abs(r) >= 2 && terms.every((v, i) => i === 0 || v === terms[i - 1] * r)) {
      out.add(terms[terms.length - 1] * r);
    }
  }

  // Each term the two before it added together.
  if (terms.length >= 4 && terms.every((v, i) => i < 2 || v === terms[i - 1] + terms[i - 2])) {
    out.add(terms[terms.length - 1] + terms[terms.length - 2]);
  }

  // Times something, plus something - solved algebraically from the first three
  // terms rather than searched for, so a wrong search would not agree with it.
  if (terms.length >= 4 && terms[1] !== terms[0]) {
    const m = (terms[2] - terms[1]) / (terms[1] - terms[0]);
    const a = terms[1] - terms[0] * m;
    if (Number.isInteger(m) && Number.isInteger(a) && Math.abs(m) >= 2 && terms.every((v, i) => i === 0 || v === terms[i - 1] * m + a)) {
      out.add(terms[terms.length - 1] * m + a);
    }
  }

  // Two arithmetic runs taking it in turns. This also covers a gap that swaps
  // between two sizes, which is the same thing seen from the other side.
  if (terms.length >= 5) {
    const even = terms.filter((_, i) => i % 2 === 0);
    const odd = terms.filter((_, i) => i % 2 === 1);
    const steady = (row) => row.length >= 2 && row.every((v, i) => i === 0 || v - row[i - 1] === row[1] - row[0]);
    if (steady(even) && steady(odd)) {
      const useEven = terms.length % 2 === 0;
      const row = useEven ? even : odd;
      out.add(row[row.length - 1] + (row[1] - row[0]));
    }
  }
  return out;
}

const evalRow = (row, vals) =>
  row.op === "×" ? row.terms.reduce((p, i) => p * vals[i], 1) : row.terms.reduce((s, i) => s + vals[i], 0);

function solveSums(rows, count, max = 15) {
  const found = [];
  const vals = new Array(count);
  const walk = (i) => {
    if (found.length > 1) return;
    if (i === count) {
      if (rows.every((r) => evalRow(r, vals) === r.value)) found.push(vals.slice());
      return;
    }
    for (let v = 1; v <= max; v++) {
      vals[i] = v;
      walk(i + 1);
    }
  };
  walk(0);
  return found;
}

/* Re-fold the net by rolling a die across it and noting which of its six faces
   is underneath on each square. That is a different mechanism from the face
   normals the game tracks, so the two agreeing is worth something.

   The die's slots are [down, up, north, south, east, west]; the ids in them
   never change partners, so ids 0/1, 2/3 and 4/5 stay opposite whatever it
   does. Returns which die face ends up under each square. */
function rollNet(faces) {
  const at = new Map(faces.map((f, i) => [`${f.x},${f.y}`, i]));
  const tips = {
    "1,0": (d) => ({ down: d.west, up: d.east, north: d.north, south: d.south, east: d.down, west: d.up }),
    "-1,0": (d) => ({ down: d.east, up: d.west, north: d.north, south: d.south, east: d.up, west: d.down }),
    "0,1": (d) => ({ down: d.north, up: d.south, north: d.up, south: d.down, east: d.east, west: d.west }),
    "0,-1": (d) => ({ down: d.south, up: d.north, north: d.down, south: d.up, east: d.east, west: d.west }),
  };
  const dice = new Map([[0, { down: 0, up: 1, north: 2, south: 3, east: 4, west: 5 }]]);
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    for (const [step, tip] of Object.entries(tips)) {
      const [dx, dy] = step.split(",").map(Number);
      const j = at.get(`${faces[i].x + dx},${faces[i].y + dy}`);
      if (j === undefined || dice.has(j)) continue;
      dice.set(j, tip(dice.get(i)));
      queue.push(j);
    }
  }
  const under = new Map();
  for (const [i, d] of dice) under.set(i, d.down);
  return under;
}

const OPPOSITE_ID = { 0: 1, 1: 0, 2: 3, 3: 2, 4: 5, 5: 4 };

/* --- per-puzzle graders --------------------------------------------------- */

const tokenKey = (t) => `${t.glyph}|${t.color}|${(t.rotate || 0) % 360}|${t.flip ? "f" : ""}|${t.decor || 0}`;
const optionKey = (o) => (o.text !== undefined ? `t:${o.text}` : `k:${tokenKey(o.token)}`);
const LADDER_SET = new Set(LADDER_WORDS);
const apart = (a, b) => a.split("").filter((ch, i) => ch !== b[i]).length;

const graders = {
  sequence(q, where) {
    const terms = q.stimulus.items.map(Number);
    if (terms.some((v) => !Number.isFinite(v))) return fail(where, "a term is not a number");
    const mine = solveSequence(terms);
    if (mine.size === 0) return fail(where, "no rule of mine explains the row", terms);
    if (mine.size > 1) return fail(where, "the row has more than one continuation", { terms, mine: [...mine] });
    if (String([...mine][0]) !== q.answer) fail(where, `row continues to ${[...mine][0]}, puzzle says ${q.answer}`, terms);
  },

  analogy(q, where) {
    const words = q.options.map((o) => o.text);
    if (new Set(words).size !== words.length) return fail(where, "two options are the same word");
    const said = words[q.answer];
    // Rebuild every prompt the data could have produced and find the one that
    // matches character for character - "foot" appears in two entries, so
    // searching by the answer word alone lands on the wrong analogy.
    let expected = null;
    for (const e of ANALOGIES) {
      if (q.prompt === `${e.pair[0]} is to ${e.pair[1]} as ${e.q} is to …?`) expected = e.a;
      else if (q.prompt === `${e.pair[0]} is to …? as ${e.q} is to ${e.a}`) expected = e.pair[1];
      else if (q.prompt === `${e.pair[0]} is to ${e.pair[1]} as …? is to ${e.a}`) expected = e.q;
      if (expected !== null) break;
    }
    if (expected === null) return fail(where, "no analogy entry produces this prompt", q.prompt);
    if (said !== expected) fail(where, `the analogy wants "${expected}", the puzzle marks "${said}"`);
  },

  riddle(q, where) {
    const source = RIDDLES.find((r) => r.q === q.prompt);
    if (!source) return fail(where, "riddle is not in the list");
    if (q.options[q.answer].text !== source.o[source.a]) fail(where, "marked answer is not the riddle's answer");
    const expected = new Set(source.o);
    for (const o of q.options) if (!expected.has(o.text)) fail(where, `option "${o.text}" is not one of the riddle's four`);
  },

  equations(q, where) {
    const { rows, ask, symbols } = q.stimulus;
    const solutions = solveSums(rows, symbols.length);
    if (solutions.length !== 1) return fail(where, `${solutions.length} sets of values fit the rows`);
    const got = evalRow(ask, solutions[0]);
    if (String(got) !== q.answer) fail(where, `the rows give ${got}, the puzzle says ${q.answer}`);
    for (const r of [...rows, ask]) {
      for (const t of r.terms) if (!symbols[t]) fail(where, `a row uses symbol ${t} which is not on the sheet`);
    }
  },

  /* Rebuild every pyramid consistent with the bricks on show and insist there
     is exactly one, then read the gap off it. */
  pyramid(q, where) {
    const cells = q.stimulus.cells;
    const width = cells[cells.length - 1].length;
    const shown = [];
    let askAt = null;
    cells.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.value !== null) shown.push([r, c, cell.value]);
        if (cell.ask) askAt = [r, c];
      })
    );
    if (!askAt) return fail(where, "no brick is marked as the question");
    if (cells[askAt[0]][askAt[1]].value !== null) fail(where, "the asked brick is already filled in");
    const fits = [];
    const bottom = new Array(width);
    const walk = (i) => {
      if (fits.length > 1) return;
      if (i === width) {
        const levels = [bottom.slice()];
        let cur = bottom;
        while (cur.length > 1) {
          const up = [];
          for (let k = 0; k + 1 < cur.length; k++) up.push(cur[k] + cur[k + 1]);
          levels.unshift(up);
          cur = up;
        }
        if (shown.every(([r, c, v]) => levels[r][c] === v)) fits.push(levels);
        return;
      }
      for (let v = 1; v <= 14; v++) {
        bottom[i] = v;
        walk(i + 1);
      }
    };
    walk(0);
    if (fits.length !== 1) return fail(where, `${fits.length} pyramids fit the bricks shown`);
    const got = fits[0][askAt[0]][askAt[1]];
    if (String(got) !== q.answer) fail(where, `the pyramid gives ${got}, the puzzle says ${q.answer}`);
  },

  ladder(q, where) {
    const m = q.stimulus.text.match(/^(\w+)\s+→\s+\?\s+→\s+(\w+)$/);
    if (!m) return fail(where, `cannot read the rungs: ${q.stimulus.text}`);
    const [, start, end] = m;
    if (apart(start, end) !== 2) fail(where, `the ends are ${apart(start, end)} letters apart, not 2`);
    q.options.forEach((o, i) => {
      const w = o.text;
      if (!LADDER_SET.has(w)) fail(where, `"${w}" is not in the word list`);
      const bridges = apart(start, w) === 1 && apart(w, end) === 1;
      if (bridges !== (i === q.answer)) {
        fail(where, i === q.answer ? `the marked answer "${w}" does not bridge` : `decoy "${w}" also bridges`);
      }
    });
  },

  /* Count the figure again from the picture, and read the prompt for which
     shape it was asking about. */
  shapes(q, where) {
    const { cells, cols, rows } = q.stimulus;
    const wantRects = /rectangles/.test(q.prompt);
    let found = 0;
    const heights = wantRects ? [...Array(rows).keys()].map((i) => i + 1) : null;
    for (let h = 1; h <= rows; h++) {
      for (let w = 1; w <= cols; w++) {
        if (!wantRects && h !== w) continue;
        for (let y = 0; y + h <= rows; y++) {
          for (let x = 0; x + w <= cols; x++) {
            let whole = true;
            for (let dy = 0; dy < h && whole; dy++) {
              for (let dx = 0; dx < w; dx++) {
                if (!cells[(y + dy) * cols + x + dx]) {
                  whole = false;
                  break;
                }
              }
            }
            if (whole) found += 1;
          }
        }
      }
    }
    void heights;
    if (String(found) !== q.answer) fail(where, `the figure holds ${found} ${wantRects ? "rectangles" : "squares"}, the puzzle says ${q.answer}`);
    if (cells.length !== cols * rows) fail(where, "the cell list does not match the grid size");
  },

  /* Re-solve the island from its printed sentences. Anything the parser cannot
     read is itself a fault: a sentence the checker cannot understand is one
     the puzzle should not have printed. */
  liars(q, where) {
    const lines = q.stimulus.lines;
    const names = lines.map((l) => l.split(":")[0].trim());
    if (new Set(names).size !== names.length) return fail(where, "two islanders share a name");
    const index = (nm) => names.indexOf(nm);
    const claims = lines.map((line) => {
      const said = line.slice(line.indexOf('"') + 1, line.lastIndexOf('"'));
      let m;
      if ((m = said.match(/^(\w+) is lying\.$/))) return (t) => !t[index(m[1])];
      if ((m = said.match(/^(\w+) is telling the truth\.$/))) return (t) => t[index(m[1])];
      if ((m = said.match(/^(\w+) and (\w+) are both lying\.$/))) return (t) => !t[index(m[1])] && !t[index(m[2])];
      if ((m = said.match(/^(\w+) and I are not the same\.$/))) return (t, self) => t[self] !== t[index(m[1])];
      if (/^At least one of us is lying\.$/.test(said)) return (t) => t.some((v) => !v);
      if (/^All of us are telling the truth\.$/.test(said)) return (t) => t.every((v) => v);
      fail(where, `a sentence the checker cannot read: ${said}`);
      return null;
    });
    if (claims.some((c) => !c)) return;
    const n = names.length;
    const fits = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      const t = [...Array(n).keys()].map((i) => Boolean(mask & (1 << i)));
      if (claims.every((c, i) => c(t, i) === t[i])) fits.push(t);
    }
    if (fits.length !== 1) return fail(where, `${fits.length} arrangements fit the statements`, lines);
    const truth = fits[0];
    const honest = truth.filter(Boolean).length;
    const wantHonest = /telling the truth/.test(q.prompt);
    if (wantHonest && honest !== 1) fail(where, `asks for the one truth-teller but ${honest} tell the truth`);
    if (!wantHonest && n - honest !== 1) fail(where, `asks for the one liar but ${n - honest} lie`);
    const marked = q.options[q.answer].text;
    const should = names[wantHonest ? truth.indexOf(true) : truth.indexOf(false)];
    if (marked !== should) fail(where, `statements point at ${should}, puzzle says ${marked}`);
  },

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

  /* Re-solve the grid from its printed clues over every arrangement. */
  logic(q, where) {
    const items = q.options.map((o) => o.text);
    const n = items.length;
    const asked = q.prompt.match(/does (\w+) have/)?.[1];
    if (!asked) return fail(where, "cannot tell who is being asked about");
    const people = [asked];
    const seat = (nm) => {
      if (!people.includes(nm)) people.push(nm);
      return people.indexOf(nm);
    };
    const tests = q.stimulus.lines.map((line) => {
      let m;
      if ((m = line.match(/^(\w+) does not have (.+)\.$/))) {
        const [p, t] = [seat(m[1]), items.indexOf(m[2])];
        return t === -1 ? null : (w) => w[p] !== t;
      }
      if ((m = line.match(/^(\w+) has either (.+) or (.+)\.$/))) {
        const [p, a, b] = [seat(m[1]), items.indexOf(m[2]), items.indexOf(m[3])];
        return a === -1 || b === -1 ? null : (w) => w[p] === a || w[p] === b;
      }
      if ((m = line.match(/^Neither (\w+) nor (\w+) has (.+)\.$/))) {
        const [a, b, t] = [seat(m[1]), seat(m[2]), items.indexOf(m[3])];
        return t === -1 ? null : (w) => w[a] !== t && w[b] !== t;
      }
      fail(where, `a clue the checker cannot read: ${line}`);
      return null;
    });
    if (tests.some((t) => !t)) return;
    while (people.length < n) people.push(`someone${people.length}`);
    const worlds = [];
    const perm = (left, sofar) => {
      if (!left.length) return worlds.push(sofar);
      for (const v of left) perm(left.filter((x) => x !== v), sofar.concat(v));
    };
    perm([...Array(n).keys()], []);
    const fits = worlds.filter((w) => tests.every((t) => t(w)));
    if (fits.length !== 1) return fail(where, `${fits.length} arrangements fit the clues`, q.stimulus.lines);
    if (items[fits[0][0]] !== q.options[q.answer].text) {
      fail(where, `clues give ${asked} ${items[fits[0][0]]}, puzzle says ${q.options[q.answer].text}`);
    }
  },

  /* Work the shift out from the example the puzzle prints, then decode the
     coded word with it. Nothing here uses the generator's own numbers. */
  cipher(q, where) {
    const [first, second] = q.stimulus.lines;
    const a = first.match(/^In this code (\w+) is written (\w+)\.$/);
    const b = second.match(/^Now read this: (\w+)$/);
    if (!a || !b) return fail(where, "cannot read the code lines", q.stimulus.lines);
    const [, plain, coded] = a;
    if (plain.length !== coded.length) return fail(where, "the example changes length");
    const shifts = new Set(plain.split("").map((ch, i) => (coded.charCodeAt(i) - ch.charCodeAt(0) + 26) % 26));
    if (shifts.size !== 1) return fail(where, "the example is not a single shift", [...shifts]);
    const by = [...shifts][0];
    const back = b[1]
      .split("")
      .map((ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 - by + 26) % 26) + 65))
      .join("");
    if (back !== q.answer) fail(where, `decoding gives ${back}, the puzzle wants ${q.answer}`);
    const tray = q.letters.slice();
    for (const ch of q.answer) {
      const at = tray.indexOf(ch);
      if (at === -1) return fail(where, `the tray has no ${ch} to spell ${q.answer} with`);
      tray.splice(at, 1);
    }
  },

  /* Roll a die across the net and check the two mechanisms name the same
     opposite face. */
  folding(q, where) {
    const { faces, ring } = q.stimulus;
    const under = rollNet(faces);
    if (under.size !== 6) return fail(where, `the net does not fold: only ${under.size} squares reachable`);
    if (new Set(under.values()).size !== 6) return fail(where, "two squares end up on the same face of the cube");
    const wantId = OPPOSITE_ID[under.get(ring)];
    const oppositeSquare = [...under.entries()].find(([, id]) => id === wantId)[0];
    const opposite = faces[oppositeSquare].token;
    const marked = q.options[q.answer].token;
    if (tokenKey(opposite) !== tokenKey(marked)) {
      fail(where, `rolling says ${opposite.glyph}/${opposite.color} is opposite, puzzle says ${marked.glyph}/${marked.color}`);
    }
    // Squares that touch on the paper always end up next to each other, never
    // opposite: a decoy that touched the ringed square would be a free pass.
    const touching = faces.filter((f) => Math.abs(f.x - faces[ring].x) + Math.abs(f.y - faces[ring].y) === 1);
    if (touching.some((f) => tokenKey(f.token) === tokenKey(marked))) fail(where, "the answer touches the ringed square on the paper");
  },

  /* Every word problem re-solved from the numbers in its own sentence, with a
     method the generator did not use. */
  story(q, where) {
    const n = [...q.prompt.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
    const expect = {
      shareOut: () => (n[0] - n[1]) / 2,
      cutTheLog: () => (n[1] - 1) * n[0],
      legsAndHeads: () => (n[1] - 2 * n[0]) / 2,
      threeInARow: () => (n[0] - 3) / 3,
      handshakes: () => (n[0] * (n[0] - 1)) / 2,
      twiceAsOld: () => (n[2] - 2 * n[1]) / (n[0] + 1),
      snailInTheWell: () => Math.ceil((n[1] - n[0]) / (n[0] - n[2])) + 1,
      strikingClock: () => ((n[2] - 1) * n[0]) / (n[1] - 1),
      sameRate: () => n[0],
      matchingSocks: () => n[0] + 1,
    }[q.story];
    if (!expect) return fail(where, `no checker for story "${q.story}"`);
    const got = expect();
    if (!Number.isFinite(got)) return fail(where, "the checker could not solve the sentence", q.prompt);
    if (String(got) !== q.answer) fail(where, `solving the sentence gives ${got}, the puzzle says ${q.answer}`, q.prompt);
  },
};

/* --- the sweep ------------------------------------------------------------ */

function checkPuzzles() {
  console.log(`\nPuzzles (${RUNS} per kind per level)`);
  const slotCounts = [0, 0, 0, 0];
  let generated = 0;
  const forms = {};

  for (const kind of puzzles.KINDS) {
    const before = faults;
    const slots = [0, 0, 0, 0];
    for (let level = 1; level <= 5; level++) {
      for (let r = 0; r < RUNS; r++) {
        const next = art.rng(art.hashString(`${kind.id}:${level}:${r}`));
        let q;
        try {
          q = puzzles.makePuzzle(kind.id, next, level);
        } catch (error) {
          fail(`${kind.id} L${level} #${r}`, error.message);
          continue;
        }
        generated += 1;
        forms[q.form] = (forms[q.form] || 0) + 1;
        const where = `${kind.id} L${level} #${r}`;

        if (q.kind !== kind.id) fail(where, `generator returned kind ${q.kind}`);
        if (q.host !== kind.host) fail(where, "generator returned a different host");
        if (!q.prompt || !q.hint || !q.explain) fail(where, "missing prompt, hint or explanation");

        if (q.form === "choice") {
          if (!Array.isArray(q.options) || q.options.length < 3) fail(where, "too few options");
          if (new Set(q.options.map(optionKey)).size !== q.options.length) fail(where, "two options are the same", q.options.map(optionKey));
          if (!(q.answer >= 0 && q.answer < q.options.length)) fail(where, `answer index ${q.answer} out of range`);
          slots[q.answer] += 1;
          slotCounts[q.answer] += 1;
          for (let i = 0; i < q.options.length; i++) {
            if (puzzles.isCorrect(q, i) !== (i === q.answer)) fail(where, `isCorrect disagrees at option ${i}`);
          }
        } else if (q.form === "keypad") {
          if (!/^\d{1,3}$/.test(q.answer)) fail(where, `answer "${q.answer}" is not a typeable number`);
          if (!puzzles.isCorrect(q, q.answer)) fail(where, "isCorrect rejects the answer");
          if (puzzles.isCorrect(q, `${q.answer}1`)) fail(where, "isCorrect accepts a longer number");
        } else if (q.form === "letters") {
          if (!puzzles.isCorrect(q, q.answer)) fail(where, "isCorrect rejects the answer");
          if (puzzles.isCorrect(q, q.answer.split("").reverse().join("") + "X")) fail(where, "isCorrect accepts nonsense");
        } else {
          fail(where, `unknown form ${q.form}`);
        }

        for (const opt of q.options || []) {
          if (opt.token) checkArtString(art.token(opt.token), `${where} option art`);
        }
        if (q.stimulus?.type === "figure") checkArtString(art.figure(q.stimulus.cells, q.stimulus.cols, q.stimulus.rows), `${where} figure`);
        if (q.stimulus?.type === "net") for (const f of q.stimulus.faces) checkArtString(art.token(f.token), `${where} net art`);
        if (q.stimulus?.type === "equations") for (const s of q.stimulus.symbols) checkArtString(art.token(s), `${where} symbol art`);

        graders[kind.id]?.(q, where);
      }
    }
    const total = slots.reduce((a, b) => a + b, 0);
    const spread = total ? slots.map((v) => `${Math.round((v / total) * 100)}%`).join(" ") : "typed";
    console.log(`  ${kind.id.padEnd(10)} ${String(faults - before).padStart(3)} faults   ${spread}`);
  }
  const all = slotCounts.reduce((a, b) => a + b, 0) || 1;
  console.log(
    `  ${generated} puzzles, ${faults} faults  |  ` +
      Object.entries(forms).map(([f, n]) => `${n} ${f}`).join(", ") +
      `  |  answer slot ${slotCounts.map((n) => `${Math.round((n / all) * 100)}%`).join("/")}`
  );
}

/* --- does it actually get harder? ----------------------------------------- */

/* Objective proxies read off the puzzle as shown, not opinions. A ladder whose
   proxy does not climb is a ladder that only looks like one. */
const SEQ_RANK = { add: 1, multiply: 2, alternate: 3, timesThenPlus: 4, growingGap: 4, fibonacci: 4, twoRows: 5 };
const STORY_RANK = { shareOut: 1, cutTheLog: 1, threeInARow: 2, legsAndHeads: 2, strikingClock: 3, handshakes: 3, twiceAsOld: 4, snailInTheWell: 4, sameRate: 5, matchingSocks: 5 };

const PROXY = {
  sequence: (q) => SEQ_RANK[q.rule],
  analogy: (q) => ({ answer: 1, example: 2, subject: 3 })[q.missing],
  riddle: (q) => RIDDLES.findIndex((r) => r.q === q.prompt),
  equations: (q) => q.stimulus.symbols.length * q.stimulus.rows.length,
  pyramid: (q) => {
    const width = q.stimulus.cells[q.stimulus.cells.length - 1].length;
    const hidden = q.stimulus.cells.flat().filter((c) => c.value === null).length;
    // Clues on the bottom row read straight upwards; clues above it have to be
    // worked back down, which is the harder half of the puzzle.
    const above = q.stimulus.cells.slice(0, -1).flat().filter((c) => c.value !== null).length;
    return width * hidden + above * 2;
  },
  ladder: (q) => {
    const [, start] = q.stimulus.text.match(/^(\w+)/);
    return start.length * q.options.filter((o) => apart(o.text, start) === 1).length;
  },
  shapes: (q) => q.stimulus.cols * q.stimulus.rows * (/rectangles/.test(q.prompt) ? 2 : 1),
  story: (q) => STORY_RANK[q.story],
  // Speakers, plus the statements that reach beyond one other islander.
  liars: (q) => q.stimulus.lines.length + q.stimulus.lines.filter((l) => /and |All of us|At least one/.test(l)).length,
  mirror: (q) => 360 / Math.min(...q.options.map((o) => o.token.rotate).filter((a, i, l) => l.indexOf(a) === i).sort((a, b) => a - b).map((a, i, l) => (i ? a - l[i - 1] : 360)).filter((d) => d > 0)),
  logic: (q) => q.stimulus.lines.length * q.options.length,
  cipher: (q) => {
    const m = q.stimulus.lines[0].match(/^In this code (\w+) is written (\w+)\.$/);
    return q.answer.length * (((m[2].charCodeAt(0) - m[1].charCodeAt(0)) % 26) + 26) % 26;
  },
  folding: (q) => {
    const under = rollNet(q.stimulus.faces);
    const target = [...under.entries()].find(([, id]) => id === OPPOSITE_ID[under.get(q.stimulus.ring)])[0];
    const at = new Map(q.stimulus.faces.map((f, i) => [`${f.x},${f.y}`, i]));
    const seen = new Map([[q.stimulus.ring, 0]]);
    const queue = [q.stimulus.ring];
    while (queue.length) {
      const i = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = at.get(`${q.stimulus.faces[i].x + dx},${q.stimulus.faces[i].y + dy}`);
        if (j === undefined || seen.has(j)) continue;
        seen.set(j, seen.get(i) + 1);
        queue.push(j);
      }
    }
    return seen.get(target);
  },
};

function checkCurve() {
  console.log("\nDifficulty proxies by level (each must climb)");
  for (const kind of puzzles.KINDS) {
    const means = [];
    for (let level = 1; level <= 5; level++) {
      let sum = 0;
      let n = 0;
      for (let r = 0; r < 200; r++) {
        const next = art.rng(art.hashString(`curve:${kind.id}:${level}:${r}`));
        try {
          const v = PROXY[kind.id](puzzles.makePuzzle(kind.id, next, level));
          if (Number.isFinite(v)) {
            sum += v;
            n += 1;
          }
        } catch (error) {
          /* already reported by the sweep */
        }
      }
      means.push(n ? sum / n : NaN);
    }
    const climbs = means[4] > means[0] && means.every((v, i) => i === 0 || v >= means[i - 1] - 0.001);
    console.log(`  ${kind.id.padEnd(10)} ${means.map((v) => v.toFixed(1).padStart(6)).join("")}   ${climbs ? "climbs" : "FLAT OR FALLS"}`);
    if (!climbs) faults += 1;
  }
}

/* --- careers -------------------------------------------------------------- */

/* Assumed accuracies, not a solver: nobody can write a program that reads a
   riddle the way a nine-year-old does. What the careers answer is the one
   question a model can answer honestly - whether the unlock ladder is
   reachable, or whether the last hosts sit behind a wall nobody walks to.
   `easy` is how often a level-1 one goes in; `slope` is what each step up the
   ladder takes off. These are pitched for a bright nine-year-old on puzzles
   that are meant to be hard, which is why they start well below 1. */
const SKILL = {
  sequence: { easy: 0.8, slope: 0.09 },
  analogy: { easy: 0.82, slope: 0.08 },
  riddle: { easy: 0.62, slope: 0.06 },
  equations: { easy: 0.74, slope: 0.09 },
  pyramid: { easy: 0.78, slope: 0.09 },
  ladder: { easy: 0.76, slope: 0.07 },
  shapes: { easy: 0.7, slope: 0.09 },
  story: { easy: 0.7, slope: 0.09 },
  liars: { easy: 0.6, slope: 0.07 },
  mirror: { easy: 0.8, slope: 0.08 },
  logic: { easy: 0.68, slope: 0.07 },
  cipher: { easy: 0.78, slope: 0.08 },
  folding: { easy: 0.6, slope: 0.07 },
};

const PLAYERS = [
  { name: "finding their feet", bonus: -0.14 },
  { name: "middling", bonus: 0 },
  { name: "sharp", bonus: 0.12 },
];

function playJourney(save, player, next) {
  const plan = progress.journeyPlan(save, next);
  let hearts = progress.HEARTS;
  let correct = 0;
  let petals = 0;
  const levels = [];
  for (const kind of plan) {
    if (hearts <= 0) break;
    const level = progress.levelFor(save, kind);
    let q;
    try {
      q = puzzles.makePuzzle(kind, next, level);
    } catch (error) {
      continue;
    }
    levels.push(level);
    // Four cards can be guessed at; a typed number cannot, which is most of
    // what makes this version harder than the last one.
    const floor = q.form === "choice" ? 1 / q.options.length : 0.02;
    const skill = SKILL[kind];
    const p = Math.max(floor, Math.min(0.98, skill.easy + player.bonus - skill.slope * (level - 1)));
    const right = next() < p;
    petals += progress.bankAnswer(save, kind, right, "journey");
    if (right) correct += 1;
    else hearts -= 1;
  }
  petals += progress.finishJourney(save, correct, progress.JOURNEY_LENGTH);
  return { correct, hearts, petals, survived: hearts > 0, level: levels.reduce((a, b) => a + b, 0) / (levels.length || 1) };
}

function careers(runs = 200) {
  console.log(`\nCareers (${runs} players each, Journeys until every host is open)`);
  for (const player of PLAYERS) {
    const toAll = [];
    const petalsPer = [];
    const survivals = [];
    const correctPer = [];
    const levelPer = [];
    for (let r = 0; r < runs; r++) {
      const save = progress.newSave();
      const next = art.rng(art.hashString(`career:${player.name}:${r}`));
      let journeys = 0;
      while (progress.unlockedCount(save) < puzzles.KINDS.length && journeys < 400) {
        const res = playJourney(save, player, next);
        journeys += 1;
        petalsPer.push(res.petals);
        survivals.push(res.survived ? 1 : 0);
        correctPer.push(res.correct);
        levelPer.push(res.level);
      }
      toAll.push(journeys);
    }
    const mean = (l) => l.reduce((a, b) => a + b, 0) / l.length;
    const pct = (l, q) => l.slice().sort((a, b) => a - b)[Math.floor(l.length * q)];
    console.log(
      `  ${player.name.padEnd(18)} all ${puzzles.KINDS.length} hosts in ${pct(toAll, 0.1)}-${pct(toAll, 0.9)} Journeys (median ${pct(toAll, 0.5)})` +
        `   ${mean(correctPer).toFixed(1)}/${progress.JOURNEY_LENGTH} right at level ${mean(levelPer).toFixed(1)}, ${mean(petalsPer).toFixed(1)} petals a run, ${Math.round(mean(survivals) * 100)}% reach the end`
    );
    if (pct(toAll, 0.9) > 32) fail("careers", `${player.name} needs ${pct(toAll, 0.9)} Journeys to see everything`);
    if (mean(survivals) < 0.35) fail("careers", `${player.name} runs out of hearts ${Math.round((1 - mean(survivals)) * 100)}% of the time`);
  }

  // Where the ladder ends up once a player has been at it for a while: the
  // levels are remembered per puzzle, so this is the difficulty they will
  // actually be playing at, not the one they start on.
  for (const player of PLAYERS) {
    const save = progress.newSave();
    const next = art.rng(art.hashString(`settle:${player.name}`));
    for (let i = 0; i < 120; i++) playJourney(save, player, next);
    const levels = puzzles.KINDS.map((k) => progress.levelFor(save, k.id));
    const stars = puzzles.KINDS.map((k) => progress.starsFor(save, k.id));
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
    console.log(
      `  ${player.name.padEnd(18)} after 120 Journeys: level ${mean.toFixed(1)} on average (${levels.join("")}), ` +
        `${stars.reduce((a, b) => a + b, 0)}/${puzzles.KINDS.length * 3} stars`
    );
    if (player.name === "sharp" && mean < 4) fail("careers", `a sharp player settles at level ${mean.toFixed(1)} - the hard end is out of reach`);
    if (progress.totalStars(save) === 0) fail("stars", "no stars are reachable at all");
  }
}

/* --- run ------------------------------------------------------------------ */

checkArt();
checkPuzzles();
if (has("curve") || !has("careers")) checkCurve();
if (has("careers") || !has("curve")) careers(flag("players", 200));

console.log(`\n${faults === 0 ? "All checks passed." : `${faults} FAULTS.`}`);
process.exit(faults === 0 ? 0 : 1);
