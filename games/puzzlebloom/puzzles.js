/* The eleven puzzles, as pure generators.

   Nothing here knows what a screen is. A generator takes a seeded random
   function and a level from 1 to 5, and hands back a plain object describing
   the question, the picture, the answers and which one is right. game.js turns
   that into elements; tools/bloom-sim.mjs generates tens of thousands of them
   and checks the things that are invisible from playing a few:

     - exactly one option is correct, and no two options are the same
     - the right answer lands in every slot about equally often
     - the arithmetic ones have no second operator that also hits the target
     - a hidden word appears in its grid exactly once
     - the difficulty ladder actually gets harder

   The shared shape every generator returns:

     kind      which puzzle this is
     host      the mascot who asks it
     prompt    the question, in words
     hint      a nudge that costs nothing
     stimulus  the picture above the answers, or null
     study     { seconds, stimulus } shown first and then taken away
     form      "choice" | "letters" | "grid"
     options   [{ text }] or [{ token }] - for "choice"
     answer    index into options, or the string/path the player must build
     explain   the line shown once the answer is in */

import { COLOR_KEYS, COLOR_NAMES, NAMED_COLORS, CHIRAL_KEYS, PLAIN_KEYS, SOLID_KEYS, describe } from "./art.js";
import { WORDS, RIDDLES, CATEGORIES } from "./words.js";

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

/* n distinct members of `list`. */
export function sample(list, n, next) {
  return shuffle(list, next).slice(0, n);
}

const clampLevel = (level) => Math.max(1, Math.min(5, Math.round(level)));

/* Options arrive in a fixed order with the right one first; this drops them
   into a random order and reports where the right one ended up. Every choice
   puzzle goes through it, which is why the answer is never "usually B". */
function place(options, next) {
  const tagged = options.map((o, i) => ({ o, correct: i === 0 }));
  const mixed = shuffle(tagged, next);
  return { options: mixed.map((t) => t.o), answer: mixed.findIndex((t) => t.correct) };
}

/* Distractor numbers around a true answer: near misses, never negative, never
   a repeat, and never the answer itself. */
function numberOptions(answer, next, spread = [1, 2, 3, 4, 5], least = 1) {
  const seen = new Set([answer]);
  const out = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 60) {
    const step = pick(spread, next) * (next() < 0.5 ? -1 : 1);
    const v = answer + step;
    if (v < least || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  // If the answer sits too near the bottom to have three lower neighbours, climb.
  let up = Math.max(answer, least) + 1;
  while (out.length < 3) {
    if (!seen.has(up)) {
      seen.add(up);
      out.push(up);
    }
    up += 1;
  }
  return out;
}

const wordsOfLength = (lens) => WORDS.filter((w) => lens.includes(w.w.length));

/* --- 1. Scramble (Bramble) ----------------------------------------------- */

const SCRAMBLE_LENGTHS = { 1: [4], 2: [4, 5], 3: [5], 4: [5, 6], 5: [6, 7] };

export function scramble(next, level = 1) {
  const lv = clampLevel(level);
  const entry = pick(wordsOfLength(SCRAMBLE_LENGTHS[lv]), next);
  const letters = entry.w.split("");
  let mixed = shuffle(letters, next);
  // A "scramble" that hands back the word is not a puzzle. Retry, then fall
  // back to a rotation, which for a word of 4+ letters is never the word.
  for (let i = 0; i < 8 && mixed.join("") === entry.w; i++) mixed = shuffle(letters, next);
  if (mixed.join("") === entry.w) mixed = letters.slice(1).concat(letters[0]);
  return {
    kind: "scramble",
    host: "bramble",
    level: lv,
    prompt: "Put the letters back in order.",
    hint: entry.hint,
    stimulus: null,
    study: null,
    form: "letters",
    letters: mixed,
    options: null,
    answer: entry.w,
    explain: `${entry.w} — ${entry.hint.toLowerCase()}.`,
  };
}

/* --- 2. Riddle (Wick) ----------------------------------------------------- */

/* The list is roughly ordered plain-to-twisty, so the level picks a window
   into it rather than needing a difficulty number on every riddle. */
const RIDDLE_WINDOW = { 1: [0, 30], 2: [0, 38], 3: [16, 50], 4: [30, 58], 5: [38, 62] };

export function riddle(next, level = 1) {
  const lv = clampLevel(level);
  const [from, to] = RIDDLE_WINDOW[lv];
  const r = RIDDLES[from + Math.floor(next() * (Math.min(to, RIDDLES.length) - from))];
  const correct = r.o[r.a];
  const rest = r.o.filter((_, i) => i !== r.a);
  const { options, answer } = place([{ text: correct }, ...rest.map((text) => ({ text }))], next);
  return {
    kind: "riddle",
    host: "wick",
    level: lv,
    prompt: r.q,
    hint: "Read it again slowly. The trick is usually one word.",
    stimulus: null,
    study: null,
    form: "choice",
    options,
    answer,
    explain: `${correct}.`,
  };
}

/* --- 3. Odd shape out (Pip) ---------------------------------------------- */

/* Hues that sit next to each other are the level-4 job: telling sage from
   teal is a different task from telling green from red. */
const NEIGHBOUR_HUES = {
  rose: ["plum", "coral"], coral: ["rose", "amber"], amber: ["coral", "lime"],
  lime: ["amber", "sage"], sage: ["lime", "teal"], teal: ["sage", "sky"],
  sky: ["teal", "indigo"], indigo: ["sky", "violet"], violet: ["indigo", "plum"],
  plum: ["violet", "rose"], bark: ["amber", "slate"], slate: ["bark", "sky"],
};

export function oddShape(next, level = 1) {
  const lv = clampLevel(level);
  // Level 5 counts spots, so it needs a shape with a middle to put them in.
  const pool = lv >= 5 ? SOLID_KEYS : PLAIN_KEYS;
  const glyph = pick(pool, next);
  const color = pick(COLOR_KEYS, next);
  const seedBase = Math.floor(next() * 100000);
  const same = (i) => ({ glyph, color, rotate: 0, seed: seedBase + i, decor: lv >= 5 ? 2 : 0 });

  let odd;
  let why;
  if (lv === 1) {
    odd = { ...same(9), glyph: pick(pool.filter((g) => g !== glyph), next), color: pick(COLOR_KEYS.filter((c) => c !== color && !NEIGHBOUR_HUES[color].includes(c)), next) };
    why = "different shape and different colour";
  } else if (lv === 2) {
    odd = { ...same(9), glyph: pick(pool.filter((g) => g !== glyph), next) };
    why = "a different shape";
  } else if (lv === 3) {
    odd = { ...same(9), color: pick(COLOR_KEYS.filter((c) => c !== color && !NEIGHBOUR_HUES[color].includes(c)), next) };
    why = "a different colour";
  } else if (lv === 4) {
    odd = { ...same(9), color: pick(NEIGHBOUR_HUES[color], next) };
    why = "very nearly the same colour, but not quite";
  } else {
    odd = { ...same(9), decor: 3 };
    why = "three spots where the others have two";
  }

  const { options, answer } = place([{ token: odd }, { token: same(1) }, { token: same(2) }, { token: same(3) }], next);
  return {
    kind: "oddShape",
    host: "pip",
    level: lv,
    prompt: "One of these does not belong. Tap it.",
    hint: lv >= 4 ? "Look very closely — the difference is small." : "Shape, colour, spots. Check one thing at a time.",
    stimulus: null,
    study: null,
    form: "choice",
    options,
    answer,
    explain: `That one had ${why}.`,
  };
}

/* --- 4. Odd word out (Marlow) -------------------------------------------- */

export function oddWord(next, level = 1) {
  const lv = clampLevel(level);
  const cat = pick(CATEGORIES, next);
  const inCount = lv >= 4 ? 4 : 3;
  const ins = sample(cat.in, inCount, next);
  const out = pick(cat.out, next);
  const { options, answer } = place([{ text: out }, ...ins.map((text) => ({ text }))], next);
  return {
    kind: "oddWord",
    host: "marlow",
    level: lv,
    prompt: "Three of these belong together. Which one does not?",
    hint: "Say what the others have in common, out loud.",
    stimulus: null,
    study: null,
    form: "choice",
    options,
    answer,
    explain: `${out} is the odd one. ${cat.why}`,
  };
}

/* --- 5. Mirror (Skiff) ---------------------------------------------------- */

const MIRROR_STEP = { 1: 90, 2: 90, 3: 45, 4: 45, 5: 30 };

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
    hint: "Pick a corner and follow it. A turn keeps the order; a flip reverses it.",
    stimulus: null,
    study: null,
    form: "choice",
    options,
    answer,
    explain: "That one is the mirror image — no amount of turning makes it match the others.",
  };
}

/* --- 6. Sequence (Vine) --------------------------------------------------- */

/* A pattern is a set of independent rules, each of which decides one property
   of the nth token. Level decides how many run at once. */
function sequenceRules(next, lv) {
  const rules = [];
  const choices = ["color", "shape", "rotate", "decor"];
  const wanted = lv >= 4 ? 2 : 1;
  const chosen = sample(lv <= 2 ? ["color", "shape"] : choices, wanted, next);
  // Once spots are in play every shape on the row has to be able to hold them.
  const shapes = chosen.includes("decor") ? SOLID_KEYS : PLAIN_KEYS;
  for (const c of chosen) {
    if (c === "color") rules.push({ prop: "color", cycle: sample(COLOR_KEYS, lv >= 4 ? 3 : 2, next) });
    if (c === "shape") rules.push({ prop: "glyph", cycle: sample(shapes, lv >= 4 ? 3 : 2, next) });
    if (c === "rotate") rules.push({ prop: "rotate", step: pick([45, 90], next) });
    if (c === "decor") rules.push({ prop: "decor", cycle: sample([1, 2, 3], lv >= 4 ? 3 : 2, next) });
  }
  return { rules, shapes };
}

function sequenceAt(rules, base, n) {
  const t = { ...base };
  for (const r of rules) {
    if (r.cycle) t[r.prop] = r.cycle[n % r.cycle.length];
    else if (r.step != null) t[r.prop] = (n * r.step) % 360;
  }
  return t;
}

export function sequence(next, level = 1) {
  const lv = clampLevel(level);
  const { rules, shapes } = sequenceRules(next, lv);
  const base = { glyph: pick(shapes, next), color: pick(COLOR_KEYS, next), rotate: 0, decor: 0, seed: 7 };
  const shown = lv >= 3 ? 5 : 4;
  const row = [];
  for (let i = 0; i < shown; i++) row.push({ ...sequenceAt(rules, base, i), seed: 100 + i });
  const correct = { ...sequenceAt(rules, base, shown), seed: 200 };

  // A wrong option is the right answer with exactly one rule broken, so every
  // option is a thing the pattern could plausibly have done.
  const wrongs = [];
  const guard = 40;
  for (let g = 0; g < guard && wrongs.length < 3; g++) {
    const off = pick(rules, next);
    const w = { ...correct, seed: 300 + wrongs.length };
    if (off.cycle) w[off.prop] = pick(off.cycle.filter((v) => v !== correct[off.prop]), next);
    else w.rotate = (correct.rotate + pick([off.step, -off.step, off.step * 2], next) + 720) % 360;
    if (w.decor < 0) continue;
    const key = (t) => `${t.glyph}|${t.color}|${t.rotate}|${t.decor}`;
    if (key(w) === key(correct) || wrongs.some((x) => key(x) === key(w))) continue;
    wrongs.push(w);
  }
  // Falling back to a plain shape swap keeps the puzzle solvable even when the
  // rules on show cannot produce three distinct near misses.
  while (wrongs.length < 3) {
    const w = { ...correct, glyph: pick(shapes.filter((g) => g !== correct.glyph), next), seed: 300 + wrongs.length };
    if (!wrongs.some((x) => x.glyph === w.glyph)) wrongs.push(w);
  }

  const { options, answer } = place([{ token: correct }, ...wrongs.map((token) => ({ token }))], next);
  const names = rules.map((r) => (r.prop === "color" ? "colour" : r.prop === "glyph" ? "shape" : r.prop === "rotate" ? "the way it points" : "how many spots"));
  // `pattern` is what was actually varying, which the explanation reads out and
  // the simulator uses to check the ladder is getting harder.
  const pattern = rules.map((r) => r.prop);
  return {
    kind: "sequence",
    host: "vine",
    level: lv,
    prompt: "What comes next in the row?",
    hint: rules.length > 1 ? "Two things are changing at once." : "One thing is changing. Find which.",
    stimulus: { type: "tokens", items: row, tail: "?" },
    study: null,
    form: "choice",
    pattern,
    options,
    answer,
    explain: `The pattern was ${names.join(" and ")}.`,
  };
}

/* --- 7. Balance (Plum) ---------------------------------------------------- */

/* Three fruits with whole-number weights, shown only as balanced scales. The
   player never sees a number - the relations are the whole of the input. */
export function balance(next, level = 1) {
  const lv = clampLevel(level);
  const [gA, gB, gC] = sample(PLAIN_KEYS, 3, next);
  const [cA, cB, cC] = sample(NAMED_COLORS, 3, next);
  const A = { glyph: gA, color: cA, seed: 11 };
  const B = { glyph: gB, color: cB, seed: 12 };
  const C = { glyph: gC, color: cC, seed: 13 };
  const k = 2 + Math.floor(next() * 2); // small ones per middle one
  const m = 2 + Math.floor(next() * 2); // middle ones per big one
  const rep = (item, n) => Array.from({ length: n }, (_, i) => ({ ...item, seed: item.seed + i }));
  const one = (item) => `one ${describe(item)}`;
  const many = (item) => describe(item, 2);

  const facts = [{ left: rep(A, k), right: [B] }];
  let answer;
  let question;
  let working;

  if (lv === 1) {
    const q = 1 + Math.floor(next() * 2);
    answer = k * q;
    question = `How many ${many(A)} balance ${q === 1 ? one(B) : `two ${many(B)}`}?`;
    working = `each ${describe(B)} is ${k} of them, so ${k} × ${q} = ${answer}`;
  } else {
    facts.push({ left: rep(B, m), right: [C] });
    if (lv === 2) {
      answer = k * m;
      question = `How many ${many(A)} balance ${one(C)}?`;
      working = `${one(C)} is ${m} ${many(B)}, and each of those is ${k} ${many(A)}, so ${m} × ${k} = ${answer}`;
    } else if (lv === 3) {
      answer = k * m * 2;
      question = `How many ${many(A)} balance two ${many(C)}?`;
      working = `${k} × ${m} × 2 = ${answer}`;
    } else if (lv === 4) {
      answer = k + k * m;
      question = `How many ${many(A)} balance ${one(B)} and ${one(C)} together?`;
      working = `${k} for the ${describe(B)} plus ${k * m} for the ${describe(C)} = ${answer}`;
    } else {
      answer = k * m - k;
      question = `${one(C)} balances ${one(B)} and how many ${many(A)}?`;
      working = `${k * m} − ${k} = ${answer}`;
    }
  }

  const { options, answer: idx } = place(
    [{ text: String(answer) }, ...numberOptions(answer, next).map((v) => ({ text: String(v) }))],
    next
  );
  const asked = question[0].toUpperCase() + question.slice(1);
  return {
    kind: "balance",
    host: "plum",
    level: lv,
    prompt: asked,
    hint: `Work out what ${one(B)} is worth in ${many(A)} first.`,
    stimulus: { type: "scales", facts },
    study: null,
    form: "choice",
    options,
    answer: idx,
    explain: `${answer}. ${working}.`,
  };
}

/* --- 8. Flash memory (Nox) ------------------------------------------------ */

const FLASH_ROW = { 1: 3, 2: 4, 3: 4, 4: 5, 5: 6 };
const FLASH_SECONDS = { 1: 4, 2: 3.5, 3: 3.2, 4: 3, 5: 2.6 };

export function flash(next, level = 1) {
  const lv = clampLevel(level);
  const n = FLASH_ROW[lv];
  const glyphs = sample(PLAIN_KEYS, n, next);
  const colors = sample(COLOR_KEYS, n, next);
  const row = glyphs.map((glyph, i) => ({ glyph, color: colors[i], seed: 400 + i }));

  // From level 4 the impostor wears a colour that was in the row, so "I
  // remember a teal one" stops being enough.
  const spareGlyph = pick(PLAIN_KEYS.filter((g) => !glyphs.includes(g)), next);
  const impostor =
    lv >= 4
      ? { glyph: spareGlyph, color: pick(colors, next), seed: 500 }
      : { glyph: spareGlyph, color: pick(COLOR_KEYS.filter((c) => !colors.includes(c)), next), seed: 500 };

  const decoys = sample(row, 3, next).map((t) => ({ ...t, seed: t.seed + 50 }));
  const { options, answer } = place([{ token: impostor }, ...decoys.map((token) => ({ token }))], next);
  return {
    kind: "flash",
    host: "nox",
    level: lv,
    prompt: "Which one was NOT in the garden?",
    hint: "Name them to yourself while you look. Names stick better than pictures.",
    stimulus: null,
    study: { seconds: FLASH_SECONDS[lv], stimulus: { type: "tokens", items: row } },
    form: "choice",
    options,
    answer,
    explain: "That one never appeared.",
  };
}

/* --- 9. Word hunt (Mote) -------------------------------------------------- */

const HUNT_SIZE = { 1: 4, 2: 4, 3: 5, 4: 5, 5: 5 };
const HUNT_LENGTHS = { 1: [3, 4], 2: [4], 3: [4, 5], 4: [5], 5: [5] };
/* Which of the eight straight runs a word may be hidden along, by level. */
const HUNT_DIRS = { 1: 2, 2: 2, 3: 4, 4: 4, 5: 8 };
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/* Every straight run of `len` cells in a grid, as arrays of indices. Used both
   to place the word and - the important half - to prove it is not accidentally
   sitting somewhere else once the filler letters go in. */
function lines(size, len) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]];
  const out = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const [dx, dy] of dirs) {
        const path = [];
        for (let i = 0; i < len; i++) {
          const nx = x + dx * i;
          const ny = y + dy * i;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
          path.push(ny * size + nx);
        }
        if (path.length === len) out.push(path);
      }
    }
  }
  return out;
}

export function wordHunt(next, level = 1) {
  const lv = clampLevel(level);
  const size = HUNT_SIZE[lv];
  const lengths = HUNT_LENGTHS[lv];
  // A palindrome reads the same backwards, so it is always in the grid twice
  // and the player can be right in a way the game scores as wrong.
  const entry = pick(
    WORDS.filter((w) => lengths.includes(w.w.length) && w.w !== w.w.split("").reverse().join("")),
    next
  );
  const word = entry.w;
  const all = lines(size, word.length);
  // Level decides which directions are on the table: straight forward at
  // first, then diagonals, then backwards as well.
  const allowed = all.filter((path) => {
    const dx = (path[1] % size) - (path[0] % size);
    const dy = Math.floor(path[1] / size) - Math.floor(path[0] / size);
    if (lv <= 2) return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    if (lv <= 4) return dx >= 0 && dy >= -1 && !(dx === 0 && dy === -1);
    return true;
  });

  const cells = new Array(size * size).fill(null);
  const path = pick(allowed, next);
  path.forEach((cell, i) => {
    cells[cell] = word[i];
  });

  // Fill the rest, then check the word does not now appear a second time. A
  // grid with two copies has two right answers and one of them scores zero.
  const spellsWord = () => all.filter((p) => p.map((c) => cells[c]).join("") === word).length;
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell]) continue;
    // Walk the whole alphabet in a random order rather than guessing letters:
    // if any letter is safe here this finds it, and the grid never degenerates
    // into a field of one filler letter.
    for (const letter of shuffle(ALPHABET, next)) {
      cells[cell] = letter;
      if (spellsWord() === 1) break;
      cells[cell] = null;
    }
    if (!cells[cell]) cells[cell] = word[0];
  }

  return {
    kind: "wordHunt",
    host: "mote",
    level: lv,
    prompt: `Find the hidden ${word.length}-letter word — it runs ${
      lv >= 5 ? "in a straight line, and it may run backwards" : lv >= 3 ? "in a straight line, maybe diagonally" : "straight across or straight down"
    }.`,
    hint: entry.hint,
    stimulus: null,
    study: null,
    form: "grid",
    grid: { size, cells },
    directions: HUNT_DIRS[lv],
    options: null,
    answer: path,
    word,
    explain: `${word} — ${entry.hint.toLowerCase()}.`,
  };
}

/* --- 10. Number chain (Tock) ---------------------------------------------- */

const OPS = {
  "+": (a, b) => a + b,
  "−": (a, b) => a - b,
  "×": (a, b) => a * b,
  "÷": (a, b) => (b !== 0 && a % b === 0 ? a / b : NaN),
};
const OP_KEYS = Object.keys(OPS);

export function numberChain(next, level = 1) {
  const lv = clampLevel(level);
  if (lv <= 2) return oneOperator(next, lv);
  if (lv === 4) return missingNumber(next, lv);
  return twoOperators(next, lv);
}

function oneOperator(next, lv) {
  const pool = lv === 1 ? ["+", "−", "×"] : OP_KEYS;
  for (let attempt = 0; attempt < 200; attempt++) {
    const op = pick(pool, next);
    const a = 2 + Math.floor(next() * (lv === 1 ? 9 : 12));
    const b = 2 + Math.floor(next() * (lv === 1 ? 8 : 10));
    const target = OPS[op](a, b);
    if (!Number.isFinite(target) || target < 0) continue;
    // Only keep it if this is the one operator that hits the target - two
    // right answers and three quarters of the marks are wrong.
    const hits = pool.filter((k) => OPS[k](a, b) === target);
    if (hits.length !== 1) continue;
    const wrong = pool.filter((k) => k !== op);
    const { options, answer } = place([{ text: op }, ...sample(wrong, 3, next).map((text) => ({ text }))], next);
    return {
      kind: "numberChain",
      host: "tock",
      level: lv,
      prompt: "Which sign makes this true?",
      hint: "Try each sign in turn and see which one lands.",
      stimulus: { type: "sum", text: `${a}  ?  ${b}  =  ${target}` },
      study: null,
      form: "choice",
      options,
      answer,
      explain: `${a} ${op} ${b} = ${target}.`,
    };
  }
  return oneOperator(next, 1);
}

function twoOperators(next, lv) {
  const pool = lv >= 5 ? OP_KEYS : ["+", "−", "×"];
  for (let attempt = 0; attempt < 400; attempt++) {
    const o1 = pick(pool, next);
    const o2 = pick(pool, next);
    const a = 2 + Math.floor(next() * 9);
    const b = 2 + Math.floor(next() * 7);
    const c = 2 + Math.floor(next() * 7);
    const mid = OPS[o1](a, b);
    const target = OPS[o2](mid, c);
    if (!Number.isFinite(target) || target < 0 || target > 90 || mid < 0) continue;
    // Brackets, not a rule about which sign goes first: a nine-year-old should
    // not have to guess whether this game believes in BODMAS.
    const pairs = [];
    for (const p of pool) for (const q of pool) pairs.push([p, q]);
    const hits = pairs.filter(([p, q]) => OPS[q](OPS[p](a, b), c) === target);
    if (hits.length !== 1) continue;
    const wrongPairs = pairs.filter(([p, q]) => !(p === o1 && q === o2));
    const { options, answer } = place(
      [{ text: `${o1}  then  ${o2}` }, ...sample(wrongPairs, 3, next).map(([p, q]) => ({ text: `${p}  then  ${q}` }))],
      next
    );
    return {
      kind: "numberChain",
      host: "tock",
      level: lv,
      prompt: "Which two signs make this true?",
      hint: "Do the bracket first, then the second sign.",
      stimulus: { type: "sum", text: `( ${a}  ?  ${b} )  ?  ${c}  =  ${target}` },
      study: null,
      form: "choice",
      options,
      answer,
      explain: `(${a} ${o1} ${b}) ${o2} ${c} = ${mid} ${o2} ${c} = ${target}.`,
    };
  }
  return oneOperator(next, 2);
}

function missingNumber(next, lv) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const o1 = pick(["+", "−", "×"], next);
    const o2 = pick(["+", "−"], next);
    const a = 2 + Math.floor(next() * 8);
    const hidden = 2 + Math.floor(next() * 8);
    const c = 2 + Math.floor(next() * 8);
    const mid = OPS[o1](a, hidden);
    const target = OPS[o2](mid, c);
    if (!Number.isFinite(target) || target < 0 || mid < 0 || target > 90) continue;
    const { options, answer } = place(
      [{ text: String(hidden) }, ...numberOptions(hidden, next, [1, 2, 3]).map((v) => ({ text: String(v) }))],
      next
    );
    return {
      kind: "numberChain",
      host: "tock",
      level: lv,
      prompt: "Which number is hiding?",
      hint: "Work backwards from the answer.",
      stimulus: { type: "sum", text: `( ${a}  ${o1}  ? )  ${o2}  ${c}  =  ${target}` },
      study: null,
      form: "choice",
      options,
      answer,
      explain: `(${a} ${o1} ${hidden}) ${o2} ${c} = ${target}.`,
    };
  }
  return oneOperator(next, 2);
}

/* --- 11. Counting (Fig) --------------------------------------------------- */

const COUNT_TOTAL = { 1: 8, 2: 10, 3: 13, 4: 15, 5: 18 };

const PLURAL = {
  circle: "circles", square: "squares", triangle: "triangles", diamond: "diamonds",
  heart: "hearts", star: "stars", flower: "flowers", moon: "moons", drop: "raindrops",
};

/* A jittered grid, not a free scatter: free scatter piles tokens on top of one
   another and then the count is a matter of opinion. */
function scatter(count, next, width, height) {
  const cols = Math.ceil(Math.sqrt(count * (width / height)));
  const rows = Math.ceil(count / cols);
  const cw = width / cols;
  const ch = height / rows;
  const spots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      spots.push([cw * (c + 0.5) + (next() - 0.5) * cw * 0.3, ch * (r + 0.5) + (next() - 0.5) * ch * 0.3]);
    }
  }
  return shuffle(spots, next).slice(0, count);
}

export function counting(next, level = 1) {
  const lv = clampLevel(level);
  const total = COUNT_TOTAL[lv];
  const width = 320;
  const height = 190;
  const [gA, gB] = sample(Object.keys(PLURAL), 2, next);
  const [cA, cB] = sample(NAMED_COLORS, 2, next);

  // Every item is one of the four (shape, colour) pairs, so any of the five
  // question shapes below has a countable answer.
  const kinds = [
    { glyph: gA, color: cA },
    { glyph: gA, color: cB },
    { glyph: gB, color: cA },
    { glyph: gB, color: cB },
  ];
  const nameA = PLURAL[gA];
  const nameB = PLURAL[gB];

  let counts;
  let items;
  let answer;
  let question;
  let working;
  // "How many pink circles?" answered by "none" is a question about an empty
  // patch of paper, so the meadow is re-sown until the answer is worth asking.
  for (let attempt = 0; attempt < 60; attempt++) {
    counts = [0, 0, 0, 0];
    items = [];
    const spots = scatter(total, next, width, height);
    for (let i = 0; i < total; i++) {
      const k = Math.floor(next() * 4);
      counts[k] += 1;
      items.push({ ...kinds[k], x: spots[i][0], y: spots[i][1], rotate: (next() - 0.5) * 40, scale: 0.85 + next() * 0.3, seed: 600 + i });
    }
    if (lv === 1) {
      answer = counts[0] + counts[1];
      question = `How many ${nameA} are there?`;
      working = `${counts[0]} + ${counts[1]} of them`;
    } else if (lv === 2) {
      answer = counts[0] + counts[2];
      question = `How many ${COLOR_NAMES[cA]} things are there?`;
      working = `${counts[0]} ${nameA} and ${counts[2]} ${nameB}`;
    } else if (lv === 3) {
      answer = counts[0];
      question = `How many ${COLOR_NAMES[cA]} ${nameA} are there?`;
      working = `both things had to be true`;
    } else if (lv === 4) {
      answer = counts[1];
      question = `How many ${nameA} are NOT ${COLOR_NAMES[cA]}?`;
      working = `${counts[0] + counts[1]} ${nameA} in all, ${counts[0]} of them ${COLOR_NAMES[cA]}`;
    } else {
      answer = Math.abs(counts[0] + counts[1] - (counts[2] + counts[3]));
      const more = counts[0] + counts[1] >= counts[2] + counts[3] ? nameA : nameB;
      question = `What is the difference between how many ${nameA} and how many ${nameB} there are?`;
      working = `${counts[0] + counts[1]} ${nameA}, ${counts[2] + counts[3]} ${nameB} — ${answer} more ${more}`;
    }
    if (answer >= 2) break;
  }

  const { options, answer: idx } = place(
    [{ text: String(answer) }, ...numberOptions(answer, next, [1, 2, 3]).map((v) => ({ text: String(v) }))],
    next
  );
  return {
    kind: "counting",
    host: "fig",
    level: lv,
    prompt: question,
    hint: "Count in twos, and start from a corner so you do not lose your place.",
    stimulus: { type: "scene", items, width, height },
    study: null,
    form: "choice",
    options,
    answer: idx,
    explain: `${answer} — ${working}.`,
  };
}

/* --- the roster ----------------------------------------------------------- */

/* Order matters: this is the order things unlock in, and the first four are
   what a new player starts with. */
export const KINDS = [
  { id: "scramble", title: "Scramble", host: "bramble", blurb: "Put the letters back in order.", make: scramble },
  { id: "oddShape", title: "Odd One Out", host: "pip", blurb: "Spot the shape that does not belong.", make: oddShape },
  { id: "riddle", title: "Riddles", host: "wick", blurb: "Questions that hide their answers.", make: riddle },
  { id: "counting", title: "Petal Count", host: "fig", blurb: "Count what is in the meadow.", make: counting },
  { id: "sequence", title: "What Comes Next", host: "vine", blurb: "Finish the pattern.", make: sequence },
  { id: "oddWord", title: "Word Out", host: "marlow", blurb: "Three words belong together. One does not.", make: oddWord },
  { id: "mirror", title: "Mirror", host: "skiff", blurb: "Turned, or flipped? Tell them apart.", make: mirror },
  { id: "numberChain", title: "Number Chain", host: "tock", blurb: "Find the missing sign.", make: numberChain },
  { id: "flash", title: "Flash", host: "nox", blurb: "Look hard, then say what vanished.", make: flash },
  { id: "wordHunt", title: "Word Hunt", host: "mote", blurb: "A word is hiding in the letters.", make: wordHunt },
  { id: "balance", title: "Balance", host: "plum", blurb: "Weigh one thing against another.", make: balance },
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
  if (puzzle.form === "letters") return String(response).toUpperCase() === puzzle.answer;
  if (puzzle.form === "grid") {
    return Array.isArray(response) && response.length === puzzle.answer.length && response.every((c, i) => c === puzzle.answer[i]);
  }
  return false;
}
