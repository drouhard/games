/* The thirteen puzzles, as pure generators.

   Nothing here knows what a screen is. A generator takes a seeded random
   function and a level from 1 to 5 and hands back a plain object describing
   the question, the picture, the answers and which one is right.

   The rule every puzzle in here has to pass is that it cannot be answered by
   noticing something. Spotting the odd colour, counting the ducks, telling
   which token was in the row - those are recognition, and a nine-year-old
   beats them without thinking. Everything below needs at least two steps of
   reasoning held in your head at once, and most of them cannot be guessed at
   all, because the answer is a number you type rather than one of four cards.

   The other rule is that the answer has to be provably the only one. Nearly
   every generator here builds a situation and then *solves it back* by brute
   force, throwing the puzzle away unless exactly one answer survives - the
   sequence with two defensible continuations, the logic grid that two
   arrangements satisfy, the pyramid that does not pin its missing brick. Those
   are invisible from playing and poisonous when they happen.

   The shared shape every generator returns:

     kind      which puzzle this is
     host      the mascot who asks it
     prompt    the question, in words
     hint      a nudge that costs nothing
     stimulus  the picture or working above the answers, or null
     form      "choice" | "keypad" | "letters"
     options   [{ text }] or [{ token }] - for "choice"
     answer    index into options, or the string the player must build
     explain   the working, shown once the answer is in */

import { COLOR_KEYS, CHIRAL_KEYS, PLAIN_KEYS, describe } from "./art.js";
import { RIDDLES, ANALOGIES, LADDER_WORDS, NAMES, LOGIC_SETS } from "./words.js";

/* --- small helpers ------------------------------------------------------- */

export function pick(list, next) {
  return list[Math.floor(next() * list.length)];
}

export function shuffle(list, next) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample(list, n, next) {
  return shuffle(list, next).slice(0, n);
}

const clampLevel = (level) => Math.max(1, Math.min(5, Math.round(level)));

/* A generator that runs out of attempts has constraints it cannot satisfy,
   which is a bug in the constraints and not something to paper over with an
   easier puzzle. tools/bloom-sim.mjs builds tens of thousands of every kind at
   every level, so if this can fire it fires there and not on a phone. */
function giveUp(kind, level) {
  throw new Error(`${kind}: ran out of attempts building a level ${level} puzzle`);
}
const int = (next, lo, hi) => lo + Math.floor(next() * (hi - lo + 1));

/* Options arrive with the right one first; this drops them into a random order
   and reports where it landed, so the answer is never "usually B". */
function place(options, next) {
  const tagged = options.map((o, i) => ({ o, correct: i === 0 }));
  const mixed = shuffle(tagged, next);
  return { options: mixed.map((t) => t.o), answer: mixed.findIndex((t) => t.correct) };
}

/* A typed number, not one of four cards. Two thirds of the puzzles here answer
   this way, which is the single biggest thing that makes them hard: there is
   nothing to guess between. */
function typed(value) {
  return { form: "keypad", answer: String(value), options: null };
}

/* --- 1. Next Number (Vine) ----------------------------------------------- */

/* Each fitter looks at the terms on show and says what it thinks comes next,
   or null if it cannot explain them. A puzzle is only allowed out if every
   fitter that *can* explain the row agrees on the answer - which is what stops
   "2 4 8 16" being marked wrong for a child who read it as doubling when the
   generator meant something else. It is honest about its own limits: these
   eight rules are what this game means by a pattern. */
const FITTERS = {
  add(t) {
    const d = t[1] - t[0];
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] !== d) return null;
    return t[t.length - 1] + d;
  },
  multiply(t) {
    if (t[0] === 0) return null;
    const r = t[1] / t[0];
    if (!Number.isInteger(r) || Math.abs(r) < 2) return null;
    for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1] * r) return null;
    return t[t.length - 1] * r;
  },
  alternate(t) {
    if (t.length < 4) return null;
    const p = t[1] - t[0];
    const q = t[2] - t[1];
    if (p === q) return null;
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] !== (i % 2 ? p : q)) return null;
    return t[t.length - 1] + (t.length % 2 ? p : q);
  },
  fibonacci(t) {
    if (t.length < 4) return null;
    for (let i = 2; i < t.length; i++) if (t[i] !== t[i - 1] + t[i - 2]) return null;
    return t[t.length - 1] + t[t.length - 2];
  },
  growingGap(t) {
    if (t.length < 4) return null;
    const d = t.slice(1).map((v, i) => v - t[i]);
    const dd = d[1] - d[0];
    if (dd === 0) return null;
    for (let i = 1; i < d.length; i++) if (d[i] - d[i - 1] !== dd) return null;
    return t[t.length - 1] + d[d.length - 1] + dd;
  },
  timesThenPlus(t) {
    for (let m = 2; m <= 5; m++) {
      for (let a = -12; a <= 12; a++) {
        let ok = true;
        for (let i = 1; i < t.length; i++) {
          if (t[i] !== t[i - 1] * m + a) {
            ok = false;
            break;
          }
        }
        if (ok) return t[t.length - 1] * m + a;
      }
    }
    return null;
  },
  twoRows(t) {
    if (t.length < 5) return null;
    const even = t.filter((_, i) => i % 2 === 0);
    const odd = t.filter((_, i) => i % 2 === 1);
    if (even.length < 2 || odd.length < 2) return null;
    const de = even[1] - even[0];
    for (let i = 1; i < even.length; i++) if (even[i] - even[i - 1] !== de) return null;
    const dd = odd[1] - odd[0];
    for (let i = 1; i < odd.length; i++) if (odd[i] - odd[i - 1] !== dd) return null;
    return t.length % 2 === 0 ? even[even.length - 1] + de : odd[odd.length - 1] + dd;
  },
};

/* Every reading of the row, so the generator can refuse an ambiguous one. */
export function readSequence(terms) {
  const seen = new Map();
  for (const [name, fit] of Object.entries(FITTERS)) {
    const v = fit(terms);
    if (v !== null && Number.isFinite(v)) seen.set(name, v);
  }
  return seen;
}

const SEQ_SHAPES = {
  1: ["add"],
  2: ["add", "multiply"],
  3: ["alternate", "timesThenPlus"],
  4: ["fibonacci", "growingGap"],
  5: ["twoRows", "timesThenPlus", "growingGap"],
};

export function sequence(next, level = 1) {
  const lv = clampLevel(level);
  for (let attempt = 0; attempt < 300; attempt++) {
    const shape = pick(SEQ_SHAPES[lv], next);
    const show = shape === "twoRows" ? 6 : 5;
    const terms = [];
    if (shape === "add") {
      const d = lv === 1 ? int(next, 2, 7) : int(next, 3, 11) * (next() < 0.35 ? -1 : 1);
      let v = int(next, 1, lv === 1 ? 9 : 40);
      for (let i = 0; i <= show; i++, v += d) terms.push(v);
    } else if (shape === "multiply") {
      const r = pick([2, 3], next);
      let v = int(next, 1, 4);
      for (let i = 0; i <= show; i++, v *= r) terms.push(v);
    } else if (shape === "alternate") {
      const p = int(next, 2, 9);
      let q = int(next, 2, 9);
      if (q === p) q = p + 3;
      let v = int(next, 1, 12);
      for (let i = 0; i <= show; i++) {
        terms.push(v);
        v += i % 2 === 0 ? p : q;
      }
    } else if (shape === "fibonacci") {
      let a = int(next, 1, 6);
      let b = int(next, 2, 9);
      terms.push(a, b);
      while (terms.length <= show) {
        const c = terms[terms.length - 1] + terms[terms.length - 2];
        terms.push(c);
      }
    } else if (shape === "growingGap") {
      const dd = int(next, 1, lv >= 5 ? 5 : 3);
      let d = int(next, 1, 5);
      let v = int(next, 1, 8);
      for (let i = 0; i <= show; i++) {
        terms.push(v);
        v += d;
        d += dd;
      }
    } else if (shape === "timesThenPlus") {
      const m = lv >= 5 ? pick([2, 3, 4], next) : 2;
      const a = int(next, 1, 6) * (next() < 0.3 ? -1 : 1);
      let v = int(next, 1, 6);
      for (let i = 0; i <= show; i++) {
        terms.push(v);
        v = v * m + a;
      }
    } else {
      const de = int(next, 2, 8);
      const dd = -int(next, 2, 8);
      let e = int(next, 1, 10);
      let o = int(next, 30, 60);
      for (let i = 0; i <= show; i++) {
        terms.push(i % 2 === 0 ? e : o);
        if (i % 2 === 0) e += de;
        else o += dd;
      }
    }

    const shown = terms.slice(0, show);
    const wanted = terms[show];
    if (shown.some((v) => v < 0 || v > 999) || wanted < 0 || wanted > 999) continue;
    if (new Set(shown).size < shown.length - 1) continue; // a row of repeats is no pattern
    const readings = readSequence(shown);
    if (readings.size === 0) continue;
    const answers = new Set(readings.values());
    if (answers.size !== 1 || !answers.has(wanted)) continue;

    const names = {
      add: "it goes up by the same amount each time",
      multiply: "each one is a multiple of the one before",
      alternate: "the gap swaps between two sizes",
      fibonacci: "each one is the two before it added together",
      growingGap: "the gap itself grows by the same amount each time",
      timesThenPlus: "each one is the one before, times something, plus something",
      twoRows: "there are two patterns taking it in turns",
    };
    return {
      kind: "sequence",
      host: "vine",
      level: lv,
      prompt: "What is the next number?",
      hint: "Write the gaps between them underneath. If the gaps do not settle, look at every other one.",
      stimulus: { type: "terms", items: shown.map(String), tail: "?" },
      rule: [...readings.keys()][0],
      ...typed(wanted),
      explain: `${wanted} — ${names[[...readings.keys()][0]]}.`,
    };
  }
  return giveUp("sequence", lv);
}

/* --- 2. Like For Like (Pip) ---------------------------------------------- */

/* Level decides which word is missing. Hiding the last one is the ordinary
   analogy; hiding one from the example pair means working the relation out
   backwards, from one complete half and one loose end. */
export function analogy(next, level = 1) {
  const lv = clampLevel(level);
  const entry = pick(ANALOGIES, next);
  const others = ANALOGIES.filter((e) => e !== entry);
  let prompt;
  let correct;
  let decoys;
  // Which word of the four is the one left out - the last, the middle of the
  // example, or the first half of the second pair.
  const missing = lv <= 2 ? "answer" : lv <= 4 ? "example" : "subject";

  if (lv <= 2) {
    prompt = `${entry.pair[0]} is to ${entry.pair[1]} as ${entry.q} is to …?`;
    correct = entry.a;
    decoys = entry.o.slice(0, 3);
  } else if (lv <= 4) {
    prompt = `${entry.pair[0]} is to …? as ${entry.q} is to ${entry.a}`;
    correct = entry.pair[1];
    // Deduped: "hand" is the second half of two different pairs, and offering
    // it twice makes one of the four cards a nonsense choice.
    decoys = sample(
      [...new Set(others.map((e) => e.pair[1]))].filter((w) => w !== correct && !entry.o.includes(w)),
      3,
      next
    );
  } else {
    prompt = `${entry.pair[0]} is to ${entry.pair[1]} as …? is to ${entry.a}`;
    correct = entry.q;
    decoys = sample(
      [...new Set(others.map((e) => e.q))].filter((w) => w !== correct && w !== entry.pair[0]),
      3,
      next
    );
  }
  if (decoys.length < 3) return giveUp("analogy", lv);

  const { options, answer } = place([{ text: correct }, ...decoys.map((text) => ({ text }))], next);
  return {
    kind: "analogy",
    host: "pip",
    level: lv,
    prompt,
    missing,
    hint: "Say the first pair as a sentence, then say the same sentence about the second.",
    stimulus: null,
    form: "choice",
    options,
    answer,
    explain: `${correct} — the link is ${entry.why}.`,
  };
}

/* --- 3. Fruit Sums (Plum) ------------------------------------------------ */

const evalRow = (row, vals) =>
  row.op === "×" ? row.terms.reduce((p, i) => p * vals[i], 1) : row.terms.reduce((s, i) => s + vals[i], 0);

/* Solve the equations back from scratch, ignoring the values they were built
   from. Two solutions means two right answers. */
export function solveSymbols(rows, count, max = 15) {
  const solutions = [];
  const vals = new Array(count);
  const walk = (i) => {
    if (solutions.length > 1) return;
    if (i === count) {
      if (rows.every((r) => evalRow(r, vals) === r.value)) solutions.push(vals.slice());
      return;
    }
    for (let v = 1; v <= max; v++) {
      vals[i] = v;
      walk(i + 1);
    }
  };
  walk(0);
  return solutions;
}

/* Which equations each level puts up, and what it then asks for. `t` is which
   symbols are in the row. */
const SUM_SHAPES = {
  1: { count: 2, rows: [{ t: [0, 0] }, { t: [0, 1] }], ask: { t: [1, 1] } },
  2: { count: 2, rows: [{ t: [0, 0, 0] }, { t: [0, 1] }], ask: { t: [0, 1, 1] } },
  3: { count: 3, rows: [{ t: [0, 0] }, { t: [0, 1] }, { t: [1, 2] }], ask: { t: [2] } },
  4: { count: 3, rows: [{ t: [0, 0] }, { t: [0, 1], op: "×" }, { t: [1, 2] }], ask: { t: [2, 2] } },
  // The classic three-sums puzzle: no symbol is ever alone, so none of it can
  // be read straight off - all three have to move at once.
  5: { count: 3, rows: [{ t: [0, 1] }, { t: [1, 2] }, { t: [0, 2] }], ask: { t: [0] } },
};

export function equations(next, level = 1) {
  const lv = clampLevel(level);
  const shape = SUM_SHAPES[lv];
  for (let attempt = 0; attempt < 600; attempt++) {
    const vals = Array.from({ length: shape.count }, () => int(next, 1, lv >= 4 ? 9 : 12));
    const rows = shape.rows.map((r) => ({ terms: r.t, op: r.op || "+", value: 0 }));
    for (const r of rows) r.value = evalRow(r, vals);
    if (rows.some((r) => r.value > 99)) continue;
    if (solveSymbols(rows, shape.count).length !== 1) continue;

    const ask = { terms: shape.ask.t, op: shape.ask.op || "+" };
    const wanted = evalRow(ask, vals);
    if (wanted < 1 || wanted > 99) continue;

    const glyphs = sample(PLAIN_KEYS, shape.count, next);
    const colors = sample(COLOR_KEYS, shape.count, next);
    const symbols = glyphs.map((glyph, i) => ({ glyph, color: colors[i], seed: 30 + i }));
    return {
      kind: "equations",
      host: "plum",
      level: lv,
      prompt: "What does the last row come to?",
      hint: "Find a row with only one kind of thing in it, and start there.",
      stimulus: { type: "equations", symbols, rows, ask },
      ...typed(wanted),
      explain: `${wanted} — ${symbols.map((s, i) => `the ${describe(s)} is ${vals[i]}`).join(", ")}.`,
    };
  }
  return giveUp("equations", lv);
}

/* --- 4. Riddles (Nox) ---------------------------------------------------- */

const RIDDLE_WINDOW = { 1: [0, 16], 2: [8, 28], 3: [18, 40], 4: [30, 52], 5: [40, 60] };

export function riddle(next, level = 1) {
  const lv = clampLevel(level);
  const [from, to] = RIDDLE_WINDOW[lv];
  const r = RIDDLES[from + Math.floor(next() * (Math.min(to, RIDDLES.length) - from))];
  const correct = r.o[r.a];
  const rest = r.o.filter((_, i) => i !== r.a);
  const { options, answer } = place([{ text: correct }, ...rest.map((text) => ({ text }))], next);
  return {
    kind: "riddle",
    host: "nox",
    level: lv,
    prompt: r.q,
    hint: "The obvious answer is usually the wrong one. Read it again for the word that is doing the trick.",
    stimulus: null,
    form: "choice",
    options,
    answer,
    explain: `${correct}.`,
  };
}

/* --- 5. Number Pyramid (Tock) -------------------------------------------- */

/* Bottom row up: every brick is the two under it added together. */
export function buildPyramid(bottom) {
  const levels = [bottom.slice()];
  let cur = bottom;
  while (cur.length > 1) {
    const up = [];
    for (let i = 0; i + 1 < cur.length; i++) up.push(cur[i] + cur[i + 1]);
    levels.unshift(up);
    cur = up;
  }
  return levels; // levels[0] is the single brick at the top
}

/* Every bottom row consistent with the bricks on show. More than one and the
   puzzle does not actually pin its missing brick down. */
export function solvePyramid(shown, width, max = 14) {
  const found = [];
  const bottom = new Array(width);
  const walk = (i) => {
    if (found.length > 1) return;
    if (i === width) {
      const levels = buildPyramid(bottom);
      const fits = shown.every(([r, c, v]) => levels[r][c] === v);
      if (fits) found.push(levels);
      return;
    }
    for (let v = 1; v <= max; v++) {
      bottom[i] = v;
      walk(i + 1);
    }
  };
  walk(0);
  return found;
}

const PYRAMID_WIDTH = { 1: 3, 2: 3, 3: 4, 4: 4, 5: 4 };

export function pyramid(next, level = 1) {
  const lv = clampLevel(level);
  const width = PYRAMID_WIDTH[lv];
  for (let attempt = 0; attempt < 400; attempt++) {
    const bottom = Array.from({ length: width }, () => int(next, 1, lv >= 3 ? 9 : 12));
    const levels = buildPyramid(bottom);
    if (levels[0][0] > 99) continue;

    const all = [];
    levels.forEach((row, r) => row.forEach((_, c) => all.push([r, c])));
    const bottomRow = levels.length - 1;
    const askAt = pick(all.filter(([r]) => r === bottomRow), next);

    // Show the top brick and then keep adding bricks - never the asked one -
    // until the rest of the pyramid is forced. That way the reveal is as thin
    // as it can be while the answer is still the only one.
    const shown = [[0, 0, levels[0][0]]];
    // At the top level no bottom brick is ever given away, so the whole row
    // has to be worked back down from above.
    const spare = shuffle(
      all.filter(
        ([r, c]) =>
          !(r === 0 && c === 0) && !(r === askAt[0] && c === askAt[1]) && !(lv >= 5 && r === bottomRow)
      ),
      next
    );
    // Level decides where the clues tend to sit. Bottom bricks read straight
    // up; bricks higher in the stack have to be worked back down, which needs
    // the subtraction as well as the addition.
    const preferred =
      lv === 1
        ? spare.slice().sort((a, b) => b[0] - a[0])
        : lv >= 4
          ? spare.slice().sort((a, b) => a[0] - b[0])
          : spare;
    for (const [r, c] of preferred) {
      if (solvePyramid(shown, width).length === 1) break;
      shown.push([r, c, levels[r][c]]);
    }
    if (solvePyramid(shown, width).length !== 1) continue;

    // Drop any brick the answer does not actually need.
    for (let i = shown.length - 1; i > 0; i--) {
      const without = shown.filter((_, k) => k !== i);
      if (solvePyramid(without, width).length === 1) shown.splice(i, 1);
    }

    const cells = levels.map((row, r) =>
      row.map((v, c) => ({
        value: shown.some(([sr, sc]) => sr === r && sc === c) ? v : null,
        ask: r === askAt[0] && c === askAt[1],
      }))
    );
    const wanted = levels[askAt[0]][askAt[1]];
    return {
      kind: "pyramid",
      host: "tock",
      level: lv,
      prompt: "Every brick is the two under it added together. What goes in the gap?",
      hint: "You can work downwards as well as up: a brick minus one of the two under it gives the other.",
      stimulus: { type: "pyramid", cells },
      ...typed(wanted),
      explain: `${wanted} — the bottom row is ${bottom.join(", ")}.`,
    };
  }
  return giveUp("pyramid", lv);
}

/* --- 6. Word Ladder (Bramble) -------------------------------------------- */

const UNIQUE_LADDER_WORDS = [...new Set(LADDER_WORDS)];

const oneApart = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return diff === 1;
};

/* Built once and kept: the neighbour map is the same every game. */
const ladderCache = new Map();
function ladderGraph(length) {
  if (ladderCache.has(length)) return ladderCache.get(length);
  const words = UNIQUE_LADDER_WORDS.filter((w) => w.length === length);
  const near = new Map(words.map((w) => [w, []]));
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (oneApart(words[i], words[j])) {
        near.get(words[i]).push(words[j]);
        near.get(words[j]).push(words[i]);
      }
    }
  }
  const graph = { words, near };
  ladderCache.set(length, graph);
  return graph;
}

const LADDER_LENGTH = { 1: 3, 2: 3, 3: 4, 4: 4, 5: 4 };

export function ladder(next, level = 1) {
  const lv = clampLevel(level);
  const { words, near } = ladderGraph(LADDER_LENGTH[lv]);
  for (let attempt = 0; attempt < 400; attempt++) {
    const start = pick(words, next);
    const twoAway = new Map();
    for (const mid of near.get(start)) {
      for (const end of near.get(mid)) {
        if (end === start || oneApart(start, end)) continue;
        twoAway.set(end, (twoAway.get(end) || []).concat(mid));
      }
    }
    // Only ends with exactly one stepping stone: two bridges is two answers.
    const ends = [...twoAway.entries()].filter(([, mids]) => new Set(mids).size === 1);
    if (!ends.length) continue;
    const [end, mids] = pick(ends, next);
    const bridge = mids[0];

    // Decoys are real words that fail one side of the crossing. From level 4
    // they all fit the start, so the end has to be checked every time.
    const nearStart = near.get(start).filter((w) => w !== bridge);
    const nearEnd = near.get(end).filter((w) => w !== bridge);
    const pool = lv >= 4 ? nearStart : shuffle(nearStart.concat(nearEnd), next);
    const decoys = sample([...new Set(pool)], 3, next);
    if (decoys.length < 3) continue;

    const { options, answer } = place([{ text: bridge }, ...decoys.map((text) => ({ text }))], next);
    return {
      kind: "ladder",
      host: "bramble",
      level: lv,
      prompt: "Which word fits in the middle? Only one letter may change at each step.",
      hint: "Check both sides. Three of these change one letter from one end but not from the other.",
      stimulus: { type: "text", text: `${start}  →  ?  →  ${end}` },
      form: "choice",
      options,
      answer,
      explain: `${start} → ${bridge} → ${end}.`,
    };
  }
  return giveUp("ladder", lv);
}

/* --- 7. Count the Shapes (Juno) ------------------------------------------ */

export function countSquares(cells, cols, rows) {
  let found = 0;
  for (let size = 1; size <= Math.min(cols, rows); size++) {
    for (let y = 0; y + size <= rows; y++) {
      for (let x = 0; x + size <= cols; x++) {
        let whole = true;
        for (let dy = 0; dy < size && whole; dy++) {
          for (let dx = 0; dx < size; dx++) {
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
  return found;
}

export function countRectangles(cells, cols, rows) {
  let found = 0;
  for (let h = 1; h <= rows; h++) {
    for (let w = 1; w <= cols; w++) {
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
  return found;
}

function connected(cells, cols, rows) {
  const start = cells.indexOf(true);
  if (start === -1) return false;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.pop();
    const x = i % cols;
    const y = Math.floor(i / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const j = ny * cols + nx;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !cells[j] || seen.has(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen.size === cells.filter(Boolean).length;
}

const SHAPE_PLAN = {
  1: { cols: 3, rows: 2, holes: 0, what: "squares" },
  2: { cols: 3, rows: 3, holes: 0, what: "squares" },
  3: { cols: 3, rows: 3, holes: 1, what: "squares" },
  4: { cols: 4, rows: 4, holes: 3, what: "squares" },
  5: { cols: 3, rows: 3, holes: 2, what: "rectangles" },
};

export function shapes(next, level = 1) {
  const lv = clampLevel(level);
  const plan = SHAPE_PLAN[lv];
  for (let attempt = 0; attempt < 400; attempt++) {
    const cells = new Array(plan.cols * plan.rows).fill(true);
    for (const i of sample([...cells.keys()], plan.holes, next)) cells[i] = false;
    if (!connected(cells, plan.cols, plan.rows)) continue;
    const wanted = plan.what === "squares" ? countSquares(cells, plan.cols, plan.rows) : countRectangles(cells, plan.cols, plan.rows);
    // Too few and it is trivial; too many and it stops being a puzzle and
    // starts being a chore.
    if (wanted < 6 || wanted > 22) continue;
    return {
      kind: "shapes",
      host: "juno",
      level: lv,
      prompt: `How many ${plan.what} can you find? Count every size, not just the small ones.`,
      hint: plan.what === "squares" ? "Count the 1×1 ones, then the 2×2 ones, then look for a 3×3." : "A rectangle can be any width and any height, including one cell wide.",
      stimulus: { type: "figure", cells, cols: plan.cols, rows: plan.rows },
      ...typed(wanted),
      explain:
        plan.what === "squares"
          ? `${wanted}. It is easy to stop at the single cells and miss the bigger ones sitting on top of them.`
          : `${wanted}. Every width and every height counts, which is a lot more than it looks.`,
    };
  }
  return giveUp("shapes", lv);
}

/* --- 8. True or False (Wick) --------------------------------------------- */

/* Knights and knaves. Each islander either always tells the truth or always
   lies; every statement is about who is which. An arrangement works only if
   each speaker's honesty matches whether what they said is true. */
const CLAIMS = {
  isLiar: {
    make: (i, j, names) => `${names[i]}: "${names[j]} is lying."`,
    holds: (truth, i, j) => !truth[j],
  },
  isHonest: {
    make: (i, j, names) => `${names[i]}: "${names[j]} is telling the truth."`,
    holds: (truth, i, j) => truth[j],
  },
  bothLie: {
    make: (i, j, names, k) => `${names[i]}: "${names[j]} and ${names[k]} are both lying."`,
    holds: (truth, i, j, k) => !truth[j] && !truth[k],
  },
  sameAsMe: {
    make: (i, j, names) => `${names[i]}: "${names[j]} and I are not the same."`,
    holds: (truth, i, j) => truth[i] !== truth[j],
  },
  someoneLies: {
    make: (i, _j, names) => `${names[i]}: "At least one of us is lying."`,
    holds: (truth) => truth.some((t) => !t),
  },
  allHonest: {
    make: (i, _j, names) => `${names[i]}: "All of us are telling the truth."`,
    holds: (truth) => truth.every((t) => t),
  },
};

/* Each level keeps everything the one below it had and adds a statement that
   reaches further - about the speaker as well as someone else, about a pair, or
   about the whole island. The top level drops the two simplest kinds entirely. */
const CLAIM_POOL = {
  1: ["isLiar", "isHonest", "someoneLies"],
  2: ["isLiar", "isHonest", "someoneLies", "sameAsMe"],
  3: ["isLiar", "isHonest", "someoneLies", "sameAsMe", "allHonest"],
  4: ["isLiar", "isHonest", "someoneLies", "sameAsMe", "allHonest", "bothLie"],
  5: ["isLiar", "someoneLies", "sameAsMe", "allHonest", "bothLie"],
};
const LIAR_COUNT = { 1: 3, 2: 3, 3: 3, 4: 4, 5: 4 };

export function liars(next, level = 1) {
  const lv = clampLevel(level);
  const n = LIAR_COUNT[lv];
  for (let attempt = 0; attempt < 800; attempt++) {
    const names = sample(NAMES, n, next);
    const said = [];
    for (let i = 0; i < n; i++) {
      const type = pick(CLAIM_POOL[lv], next);
      const rest = [...Array(n).keys()].filter((k) => k !== i);
      const [j, k] = sample(rest, 2, next);
      said.push({ type, i, j, k: k === undefined ? rest[0] : k });
    }

    // Every possible arrangement of honest and lying, kept only if consistent.
    const fits = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      const truth = [...Array(n).keys()].map((i) => Boolean(mask & (1 << i)));
      const ok = said.every((s) => CLAIMS[s.type].holds(truth, s.i, s.j, s.k) === truth[s.i]);
      if (ok) fits.push(truth);
      if (fits.length > 1) break;
    }
    if (fits.length !== 1) continue;

    const truth = fits[0];
    const honest = truth.filter(Boolean).length;
    // Ask about whichever side happens to be alone, so the player cannot
    // assume the shape of the answer before reading.
    let asking;
    let wanted;
    if (honest === 1) {
      asking = "Only one of them is telling the truth. Which one?";
      wanted = truth.indexOf(true);
    } else if (honest === n - 1) {
      asking = "Only one of them is lying. Which one?";
      wanted = truth.indexOf(false);
    } else {
      continue;
    }

    const wrong = names.filter((_, i) => i !== wanted);
    const { options, answer } = place([{ text: names[wanted] }, ...wrong.map((text) => ({ text }))], next);
    return {
      kind: "liars",
      host: "wick",
      level: lv,
      prompt: asking,
      hint: "Suppose the first one is telling the truth and follow it through. If you hit a contradiction, they were lying.",
      stimulus: { type: "lines", lines: said.map((s) => CLAIMS[s.type].make(s.i, s.j, names, s.k)) },
      form: "choice",
      options,
      answer,
      explain: names.map((nm, i) => `${nm} was ${truth[i] ? "telling the truth" : "lying"}`).join(", ") + ".",
    };
  }
  return giveUp("liars", lv);
}

/* --- 9. Mirror (Skiff) --------------------------------------------------- */

/* The only puzzle kept from recognition, because telling a turn from a flip is
   not recognition once the angles stop being right angles. */
const MIRROR_STEP = { 1: 90, 2: 60, 3: 45, 4: 36, 5: 30 };

export function mirror(next, level = 1) {
  const lv = clampLevel(level);
  const glyph = pick(CHIRAL_KEYS, next);
  const color = pick(COLOR_KEYS, next);
  const step = MIRROR_STEP[lv];
  const slots = [];
  for (let a = 0; a < 360; a += step) slots.push(a);
  const angles = sample(slots, 4, next);
  const seed = Math.floor(next() * 100000);
  const flipped = { glyph, color, rotate: angles[0], flip: true, seed: seed + 9 };
  const plain = angles.slice(1).map((rotate, i) => ({ glyph, color, rotate, flip: false, seed: seed + i }));
  const { options, answer } = place([{ token: flipped }, ...plain.map((token) => ({ token }))], next);
  return {
    kind: "mirror",
    host: "skiff",
    level: lv,
    prompt: "Three of these are the same shape turned round. One is flipped. Tap the flipped one.",
    hint: "Follow one corner all the way round the outline. A turn keeps the order; a flip reverses it.",
    stimulus: null,
    form: "choice",
    options,
    answer,
    explain: "That one is the mirror image — no amount of turning makes it match the others.",
  };
}

/* --- 10. Who's Who (Marlow) ---------------------------------------------- */

function permutations(list) {
  if (list.length <= 1) return [list];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const rest = list.slice(0, i).concat(list.slice(i + 1));
    for (const p of permutations(rest)) out.push([list[i], ...p]);
  }
  return out;
}

const LOGIC_PEOPLE = { 1: 3, 2: 3, 3: 3, 4: 4, 5: 4 };

export function logic(next, level = 1) {
  const lv = clampLevel(level);
  const n = LOGIC_PEOPLE[lv];
  const set = pick(LOGIC_SETS, next);
  const people = sample(NAMES, n, next);
  const things = sample(set.items.slice(0, Math.max(n, 3)), n, next);
  const truth = shuffle([...things.keys()], next); // person i has things[truth[i]]
  const worlds = permutations([...things.keys()]);

  // Clues, each a sentence and a test. Only the true ones are candidates.
  const candidates = [];
  for (let p = 0; p < n; p++) {
    for (let t = 0; t < n; t++) {
      if (truth[p] !== t) {
        candidates.push({ text: `${people[p]} does not have ${things[t]}.`, holds: (w) => w[p] !== t });
      }
    }
  }
  for (let p = 0; p < n; p++) {
    for (let t = 0; t < n; t++) {
      if (t === truth[p]) continue;
      const pair = shuffle([truth[p], t], next);
      candidates.push({
        text: `${people[p]} has either ${things[pair[0]]} or ${things[pair[1]]}.`,
        holds: (w) => w[p] === pair[0] || w[p] === pair[1],
      });
    }
  }
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let t = 0; t < n; t++) {
        if (truth[a] !== t && truth[b] !== t) {
          candidates.push({
            text: `Neither ${people[a]} nor ${people[b]} has ${things[t]}.`,
            holds: (w) => w[a] !== t && w[b] !== t,
          });
        }
      }
    }
  }
  // Level 4 and up drops the "either/or" clues, which are the ones that hand
  // you a foothold, and leaves only what is ruled out.
  const pool = shuffle(lv >= 4 ? candidates.filter((c) => !c.text.includes("either")) : candidates, next);

  const clues = [];
  let left = worlds;
  for (const clue of pool) {
    if (left.length === 1) break;
    const narrowed = left.filter(clue.holds);
    if (narrowed.length === left.length) continue; // says nothing new
    clues.push(clue);
    left = narrowed;
  }
  if (left.length !== 1 || clues.length < 2) return giveUp("logic", lv);

  // Throw out any clue the answer does not need, then check it still holds.
  for (let i = clues.length - 1; i >= 0; i--) {
    const without = clues.filter((_, k) => k !== i);
    if (worlds.filter((w) => without.every((c) => c.holds(w))).length === 1) clues.splice(i, 1);
  }

  const who = int(next, 0, n - 1);
  const wanted = things[truth[who]];
  const { options, answer } = place(
    [{ text: wanted }, ...things.filter((t) => t !== wanted).map((text) => ({ text }))],
    next
  );
  return {
    kind: "logic",
    host: "marlow",
    level: lv,
    prompt: `Which ${set.of} does ${people[who]} have?`,
    hint: "Draw a grid of names against things and cross off everything each clue rules out.",
    stimulus: { type: "lines", lines: shuffle(clues, next).map((c) => c.text) },
    form: "choice",
    options,
    answer,
    explain: people.map((p, i) => `${p} has ${things[truth[i]]}`).join(", ") + ".",
  };
}

/* --- 11. Secret Code (Mote) ---------------------------------------------- */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const shiftWord = (word, by) =>
  word
    .split("")
    .map((ch) => ALPHABET[(ALPHABET.indexOf(ch) + by + 26) % 26])
    .join("");

const CIPHER_PLAN = { 1: { len: 3, max: 2 }, 2: { len: 4, max: 3 }, 3: { len: 4, max: 5 }, 4: { len: 4, max: 8 }, 5: { len: 4, max: 12 } };

export function cipher(next, level = 1) {
  const lv = clampLevel(level);
  const plan = CIPHER_PLAN[lv];
  const words = UNIQUE_LADDER_WORDS.filter((w) => w.length === plan.len);
  const word = pick(words, next);
  const by = int(next, 1, plan.max);
  const example = pick(words.filter((w) => w !== word), next);

  // The tray holds the answer's letters plus three that are not in it, so the
  // code has to be broken rather than the tray anagrammed.
  const spare = sample(ALPHABET.filter((ch) => !word.includes(ch)), 3, next);
  const tray = shuffle(word.split("").concat(spare), next);

  return {
    kind: "cipher",
    host: "mote",
    level: lv,
    prompt: "Break the code and spell the word.",
    hint: `Every letter has moved ${by} place${by === 1 ? "" : "s"} forward in the alphabet. Count backwards to undo it.`,
    stimulus: {
      type: "lines",
      lines: [`In this code ${example} is written ${shiftWord(example, by)}.`, `Now read this: ${shiftWord(word, by)}`],
    },
    form: "letters",
    letters: tray,
    options: null,
    answer: word,
    explain: `${shiftWord(word, by)} shifted back ${by} is ${word}.`,
  };
}

/* --- 12. Fold It (Skiff's cousin, Fig) ------------------------------------ */

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg3 = (v) => v.map((x) => -x);
const key3 = (v) => v.join(",");

/* Roll the cube across the net. Each square gets the 3D direction its face
   ends up pointing; two squares are opposite when their directions are
   negatives. Screen y grows downwards, which is why "up" and "down" are the
   way round they are. */
export function foldNet(cells) {
  const at = new Map(cells.map((c, i) => [`${c.x},${c.y}`, i]));
  const facing = new Array(cells.length).fill(null);
  facing[0] = { n: [0, 0, 1], u: [0, 1, 0] };
  const queue = [0];
  while (queue.length) {
    const i = queue.shift();
    const { n, u } = facing[i];
    const r = cross3(u, n);
    const rolls = [
      { dx: 1, dy: 0, n: r, u },
      { dx: -1, dy: 0, n: neg3(r), u },
      { dx: 0, dy: -1, n: u, u: neg3(n) },
      { dx: 0, dy: 1, n: neg3(u), u: n },
    ];
    for (const roll of rolls) {
      const j = at.get(`${cells[i].x + roll.dx},${cells[i].y + roll.dy}`);
      if (j === undefined || facing[j]) continue;
      facing[j] = { n: roll.n, u: roll.u };
      queue.push(j);
    }
  }
  return facing;
}

/* A shape of six squares is a cube net exactly when folding it lands one face
   on each of the six directions. Grow random shapes and keep those. */
function growNet(next) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells = [{ x: 0, y: 0 }];
    while (cells.length < 6) {
      const from = pick(cells, next);
      const [dx, dy] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]], next);
      const spot = { x: from.x + dx, y: from.y + dy };
      if (cells.some((c) => c.x === spot.x && c.y === spot.y)) continue;
      cells.push(spot);
    }
    const facing = foldNet(cells);
    if (facing.some((f) => !f)) continue;
    if (new Set(facing.map((f) => key3(f.n))).size !== 6) continue;
    return cells;
  }
  return null;
}

function netDistance(cells, from, to) {
  const at = new Map(cells.map((c, i) => [`${c.x},${c.y}`, i]));
  const seen = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const i = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = at.get(`${cells[i].x + dx},${cells[i].y + dy}`);
      if (j === undefined || seen.has(j)) continue;
      seen.set(j, seen.get(i) + 1);
      queue.push(j);
    }
  }
  return seen.get(to);
}

const FOLD_REACH = { 1: [2, 2], 2: [2, 3], 3: [3, 3], 4: [3, 4], 5: [4, 5] };

export function folding(next, level = 1) {
  const lv = clampLevel(level);
  const [near, far] = FOLD_REACH[lv];
  for (let attempt = 0; attempt < 400; attempt++) {
    const cells = growNet(next);
    if (!cells) continue;
    const facing = foldNet(cells);
    const pairs = [];
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        if (key3(facing[i].n) === key3(neg3(facing[j].n))) pairs.push([i, j]);
      }
    }
    const usable = pairs.filter(([i, j]) => {
      const d = netDistance(cells, i, j);
      return d >= near && d <= far;
    });
    if (!usable.length) continue;
    const [a, b] = pick(usable, next);
    const from = next() < 0.5 ? a : b;
    const to = from === a ? b : a;

    const glyphs = sample(PLAIN_KEYS, 6, next);
    const colors = sample(COLOR_KEYS, 6, next);
    const faces = cells.map((c, i) => ({ ...c, token: { glyph: glyphs[i], color: colors[i], seed: 40 + i } }));

    const minX = Math.min(...cells.map((c) => c.x));
    const minY = Math.min(...cells.map((c) => c.y));
    for (const f of faces) {
      f.x -= minX;
      f.y -= minY;
    }
    const wrong = [...Array(6).keys()].filter((i) => i !== from && i !== to);
    const { options, answer } = place(
      [{ token: faces[to].token }, ...sample(wrong, 3, next).map((i) => ({ token: faces[i].token }))],
      next
    );
    return {
      kind: "folding",
      host: "fig",
      level: lv,
      prompt: "Fold this up into a cube. Which face ends up opposite the ringed one?",
      hint: "Faces that touch on the paper always end up next to each other, never opposite. Rule those out first.",
      stimulus: {
        type: "net",
        faces,
        cols: Math.max(...faces.map((f) => f.x)) + 1,
        rows: Math.max(...faces.map((f) => f.y)) + 1,
        ring: from,
      },
      form: "choice",
      options,
      answer,
      explain: `Rolling the cube across the paper puts those two on opposite sides.`,
    };
  }
  return giveUp("folding", lv);
}

/* --- 13. Word Problems (Sable) ------------------------------------------- */

/* Every one of these is built forwards from numbers the generator picks, and
   then solved backwards - by search or by simulation - to produce the answer.
   The two directions never share an equation, so a wrong formula shows up as a
   mismatch rather than being confirmed by itself. */
const STORIES = {
  shareOut(next) {
    const small = int(next, 3, 14);
    const gap = int(next, 2, 9);
    const total = small * 2 + gap;
    const who = sample(NAMES, 2, next);
    let answer = null;
    for (let b = 0; b <= total; b++) if (b + (b + gap) === total) answer = b;
    return {
      text: `${who[0]} and ${who[1]} have ${total} marbles between them. ${who[0]} has ${gap} more than ${who[1]}. How many does ${who[1]} have?`,
      answer,
      working: `${who[1]} has ${answer}, ${who[0]} has ${answer + gap}, and together that is ${total}.`,
    };
  },

  cutTheLog(next) {
    const pieces = int(next, 4, 9);
    const minutes = int(next, 2, 6);
    return {
      text: `It takes ${minutes} minutes to make one cut through a log. How many minutes to cut a log into ${pieces} pieces?`,
      answer: (pieces - 1) * minutes,
      working: `${pieces} pieces needs ${pieces - 1} cuts, and ${pieces - 1} × ${minutes} = ${(pieces - 1) * minutes}.`,
    };
  },

  legsAndHeads(next) {
    const cows = int(next, 2, 7);
    const ducks = int(next, 2, 8);
    const heads = cows + ducks;
    const legs = cows * 4 + ducks * 2;
    let answer = null;
    for (let c = 0; c <= heads; c++) if (c * 4 + (heads - c) * 2 === legs) answer = c;
    return {
      text: `A farm has cows and ducks: ${heads} heads and ${legs} legs altogether. How many cows are there?`,
      answer,
      working: `${answer} cows and ${heads - answer} ducks: ${answer * 4} + ${(heads - answer) * 2} = ${legs} legs.`,
    };
  },

  threeInARow(next) {
    const first = int(next, 3, 30);
    const total = first + (first + 1) + (first + 2);
    let answer = null;
    for (let a = 1; a <= total; a++) if (a + (a + 1) + (a + 2) === total) answer = a;
    return {
      text: `Three numbers in a row add up to ${total}. What is the smallest of them?`,
      answer,
      working: `${answer} + ${answer + 1} + ${answer + 2} = ${total}.`,
    };
  },

  handshakes(next) {
    const people = int(next, 5, 12);
    let answer = 0;
    for (let i = 0; i < people; i++) for (let j = i + 1; j < people; j++) answer += 1;
    return {
      text: `${people} friends each shake hands with every other one exactly once. How many handshakes is that?`,
      answer,
      working: `Each of the ${people} shakes ${people - 1} hands, but every shake was counted twice: ${people} × ${people - 1} ÷ 2 = ${answer}.`,
    };
  },

  twiceAsOld(next) {
    const young = int(next, 3, 11);
    const times = pick([2, 3], next);
    const ahead = int(next, 2, 8);
    const total = young + ahead + young * times + ahead;
    let answer = null;
    for (let a = 1; a <= 40; a++) if (a + ahead + a * times + ahead === total) answer = a;
    const who = sample(NAMES, 2, next);
    return {
      text: `${who[0]} is ${times} times as old as ${who[1]}. In ${ahead} years their ages will add up to ${total}. How old is ${who[1]} now?`,
      answer,
      working: `${who[1]} is ${answer} and ${who[0]} is ${answer * times}. In ${ahead} years that is ${answer + ahead} + ${answer * times + ahead} = ${total}.`,
    };
  },

  snailInTheWell(next) {
    const climb = int(next, 3, 5);
    const slip = climb - int(next, 1, 2);
    const depth = climb + (slip > 0 ? int(next, 2, 6) * (climb - slip) + int(next, 0, climb - 1) : 6);
    let height = 0;
    let day = 0;
    while (height < depth && day < 200) {
      day += 1;
      height += climb;
      if (height >= depth) break;
      height -= slip;
    }
    return {
      text: `A snail climbs ${climb}m up a ${depth}m well each day and slips ${slip}m back each night. On which day does it reach the top?`,
      answer: day,
      working: `It gains ${climb - slip}m a day, but on the last day it climbs out before slipping — day ${day}.`,
    };
  },

  strikingClock(next) {
    const from = pick([3, 4, 5, 6], next);
    const gap = int(next, 1, 3);
    const seconds = (from - 1) * gap;
    const to = from + int(next, 2, 6);
    return {
      text: `A clock takes ${seconds} seconds to strike ${from}. How many seconds does it take to strike ${to}?`,
      answer: (to - 1) * gap,
      working: `${from} strikes have ${from - 1} gaps, so each gap is ${gap}s. ${to} strikes have ${to - 1} gaps: ${(to - 1) * gap}s.`,
    };
  },

  sameRate(next) {
    const m = int(next, 3, 8);
    const scale = int(next, 2, 20);
    return {
      text: `${m} cats catch ${m} mice in ${m} minutes. How many minutes do ${m * scale} cats need to catch ${m * scale} mice?`,
      answer: m,
      working: `One cat takes ${m} minutes for one mouse, and there is one cat per mouse either way — still ${m} minutes.`,
    };
  },

  matchingSocks(next) {
    const colours = int(next, 2, 5);
    return {
      text: `A drawer holds socks in ${colours} different colours, all jumbled up. Taking them out in the dark, how many must you take to be certain of a matching pair?`,
      answer: colours + 1,
      working: `${colours} could all be different, so the next one must match something: ${colours + 1}.`,
    };
  },
};

const STORY_PLAN = {
  1: ["shareOut", "cutTheLog"],
  2: ["legsAndHeads", "threeInARow", "cutTheLog"],
  3: ["handshakes", "shareOut", "strikingClock"],
  4: ["twiceAsOld", "snailInTheWell", "handshakes"],
  5: ["sameRate", "matchingSocks", "twiceAsOld", "snailInTheWell"],
};

export function story(next, level = 1) {
  const lv = clampLevel(level);
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = pick(STORY_PLAN[lv], next);
    const made = STORIES[name](next);
    if (made.answer === null || !Number.isInteger(made.answer) || made.answer < 1 || made.answer > 999) continue;
    return {
      kind: "story",
      host: "sable",
      level: lv,
      prompt: made.text,
      hint: "Read it twice. Write down what you know before you try to work anything out.",
      stimulus: null,
      ...typed(made.answer),
      explain: made.working,
      story: name,
    };
  }
  return giveUp("story", lv);
}

/* --- the roster ----------------------------------------------------------- */

/* Order matters: this is the order things unlock in, and the first four are
   what a new player starts with. */
export const KINDS = [
  { id: "sequence", title: "Next Number", host: "vine", blurb: "Find the rule, then the number.", make: sequence },
  { id: "analogy", title: "Like For Like", host: "pip", blurb: "Work out the link and apply it.", make: analogy },
  { id: "riddle", title: "Riddles", host: "nox", blurb: "The obvious answer is the wrong one.", make: riddle },
  { id: "equations", title: "Fruit Sums", host: "plum", blurb: "Three sums, three unknowns.", make: equations },
  { id: "pyramid", title: "Number Pyramid", host: "tock", blurb: "Every brick is the two below it.", make: pyramid },
  { id: "ladder", title: "Word Ladder", host: "bramble", blurb: "One letter at a time, both ends must fit.", make: ladder },
  { id: "shapes", title: "Count the Shapes", host: "juno", blurb: "Every size counts, not just the small ones.", make: shapes },
  { id: "story", title: "Word Problems", host: "sable", blurb: "Puzzles hiding inside sentences.", make: story },
  { id: "liars", title: "True or False", host: "wick", blurb: "Some of them always lie. Work out which.", make: liars },
  { id: "mirror", title: "Mirror", host: "skiff", blurb: "Turned, or flipped? Tell them apart.", make: mirror },
  { id: "logic", title: "Who's Who", host: "marlow", blurb: "Cross off everything the clues rule out.", make: logic },
  { id: "cipher", title: "Secret Code", host: "mote", blurb: "Break the code, then spell it.", make: cipher },
  { id: "folding", title: "Fold It", host: "fig", blurb: "Fold the paper into a cube in your head.", make: folding },
];

export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));

export function makePuzzle(kindId, next, level) {
  const kind = KIND_BY_ID[kindId];
  if (!kind) throw new Error(`unknown puzzle kind: ${kindId}`);
  return kind.make(next, level);
}

/* Did the player get it right? One place for it, so the simulator grades a
   puzzle exactly the way the screen does. */
export function isCorrect(puzzle, response) {
  if (puzzle.form === "choice") return response === puzzle.answer;
  if (puzzle.form === "keypad") return String(response).trim() === puzzle.answer;
  if (puzzle.form === "letters") return String(response).toUpperCase() === puzzle.answer;
  return false;
}
