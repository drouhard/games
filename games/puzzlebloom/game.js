/* The screen. Everything that decides anything lives in puzzles.js and
   progress.js; this file only turns those objects into elements and turns taps
   back into answers.

   Two rules shape the input. A tap never commits: picking an answer, typing a
   digit and placing a letter are all free and all undoable, and nothing is
   scored until the button at the bottom. And a right answer never asks for a
   tap it does not need - it shows the tick, says why in one line, and moves on
   by itself. Only a wrong answer waits, because that is the one worth reading.
   Two taps a puzzle is the floor and this sits on it. */

import * as art from "./art.js";
import * as puz from "./puzzles.js";
import * as P from "./progress.js";

const el = {
  defs: document.getElementById("defs"),
  garden: document.getElementById("garden"),
  play: document.getElementById("play"),
  stage: document.getElementById("stage"),
  petals: document.getElementById("petals"),
  stars: document.getElementById("stars"),
  gardenNote: document.getElementById("garden-note"),
  hosts: document.getElementById("hosts"),
  startJourney: document.getElementById("start-journey"),
  quit: document.getElementById("quit"),
  pips: document.getElementById("pips"),
  hearts: document.getElementById("hearts"),
  host: document.getElementById("host"),
  prompt: document.getElementById("prompt"),
  stim: document.getElementById("stim"),
  answers: document.getElementById("answers"),
  verdict: document.getElementById("verdict"),
  hint: document.getElementById("hint"),
  commit: document.getElementById("commit"),
  sheet: document.getElementById("sheet"),
  sheetArt: document.getElementById("sheet-art"),
  sheetTitle: document.getElementById("sheet-title"),
  sheetLine: document.getElementById("sheet-line"),
  sheetUnlock: document.getElementById("sheet-unlock"),
  sheetGarden: document.getElementById("sheet-garden"),
  sheetAgain: document.getElementById("sheet-again"),
};

const save = P.load();
const rand = art.rng((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);

/* How long a right answer sits before the next puzzle arrives: long enough to
   see the tick and read one line, short enough that nobody taps "Next" ten
   times a Journey. A tap anywhere skips the wait. */
const SAVOUR_MS = 1500;

let mode = null; // "journey" | "practice"
let plan = [];
let marks = [];
let round = 0;
let hearts = 0;
let correct = 0;
let practiceKind = null;

let puzzle = null;
let phase = "ask"; // "ask" | "done"
let pick = null; // option index, digit string, or placed letters
let tray = []; // which letter tiles have been used
let advanceTimer = null;

/* --- the garden ----------------------------------------------------------- */

function paintGarden() {
  el.petals.textContent = String(save.petals);
  el.stars.textContent = `${P.totalStars(save)}/${puz.KINDS.length * 3}`;

  const next = P.nextUnlock(save);
  el.gardenNote.textContent = next
    ? `${next.togo} more ${next.togo === 1 ? "petal" : "petals"} and ${art.MASCOTS[next.kind.host].name} arrives.`
    : "Every friend is here. Now beat your best.";

  const open = P.unlockedCount(save);
  el.hosts.replaceChildren(
    ...puz.KINDS.map((kind, i) => {
      const unlocked = i < open;
      const card = document.createElement(unlocked ? "button" : "div");
      card.className = `host${unlocked ? "" : " host--locked"}`;
      if (unlocked) {
        card.type = "button";
        card.dataset.kind = kind.id;
      }

      const artBox = document.createElement("span");
      artBox.className = "host__art";
      artBox.innerHTML = art.mascot(kind.host, { mood: unlocked ? "happy" : "calm" });

      const text = document.createElement("span");
      const name = document.createElement("span");
      name.className = "host__name";
      name.textContent = unlocked ? art.MASCOTS[kind.host].name : "???";
      const sub = document.createElement("span");
      sub.className = "host__sub";
      if (unlocked) {
        const stars = P.starsFor(save, kind.id);
        sub.innerHTML = `${kind.title}<br><span class="host__stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>`;
      } else {
        sub.textContent = `opens at ${P.UNLOCK_AT[i - P.FREE_KINDS]} petals`;
      }
      text.append(name, sub);
      card.append(artBox, text);
      return card;
    })
  );
}

function showGarden() {
  clearTimeout(advanceTimer);
  mode = null;
  puzzle = null;
  el.sheet.hidden = true;
  el.play.hidden = true;
  el.garden.hidden = false;
  paintGarden();
}

/* --- starting something --------------------------------------------------- */

function startJourney() {
  mode = "journey";
  plan = P.journeyPlan(save, rand);
  marks = plan.map(() => null);
  round = 0;
  hearts = P.HEARTS;
  correct = 0;
  el.sheet.hidden = true;
  el.garden.hidden = true;
  el.play.hidden = false;
  beginRound();
}

function startPractice(kindId) {
  mode = "practice";
  practiceKind = kindId;
  round = 0;
  el.sheet.hidden = true;
  el.garden.hidden = true;
  el.play.hidden = false;
  beginRound();
}

function beginRound() {
  clearTimeout(advanceTimer);
  const kindId = mode === "journey" ? plan[round] : practiceKind;
  // The level is not this run's business: every puzzle remembers where this
  // player got to on it, in Journey and Practice alike.
  puzzle = puz.makePuzzle(kindId, rand, P.levelFor(save, kindId));
  pick = puzzle.form === "choice" ? null : puzzle.form === "keypad" ? "" : [];
  tray = [];
  phase = "ask";
  el.hint.disabled = false;
  el.verdict.textContent = "";
  el.verdict.className = "verdict";
  paintTop();
  paintAsk();
}

/* --- the frame ------------------------------------------------------------ */

function paintTop() {
  if (mode === "journey") {
    el.pips.replaceChildren(
      ...plan.map((_, i) => {
        const pip = document.createElement("span");
        pip.className = `pip${marks[i] === true ? " pip--right" : marks[i] === false ? " pip--wrong" : i === round ? " pip--now" : ""}`;
        return pip;
      })
    );
    el.hearts.className = "hearts";
    el.hearts.textContent = "♥".repeat(hearts) + "♡".repeat(Math.max(0, P.HEARTS - hearts));
  } else {
    el.pips.replaceChildren();
    el.hearts.className = "hearts hearts--practice";
    el.hearts.textContent = `level ${P.levelFor(save, practiceKind)}`;
  }
}

function paintAsk() {
  el.host.innerHTML = art.mascot(puzzle.host, { mood: "think" });
  el.prompt.textContent = puzzle.prompt;
  el.stim.hidden = !puzzle.stimulus;
  el.stim.innerHTML = "";
  if (puzzle.stimulus) el.stim.append(buildStimulus(puzzle.stimulus));
  el.stage.className = "stage";
  if (puzzle.stimulus) el.stage.classList.add("stage--stim");
  else el.stage.classList.add("stage--bare");
  // Sentences to reason over need width and no picture; the split goes the
  // other way for those.
  if (puzzle.stimulus?.type === "lines") el.stage.classList.add("stage--reading");
  buildAnswers();
  el.commit.textContent = "Check";
  refreshCommit();
}

/* --- the pictures --------------------------------------------------------- */

function buildStimulus(stim) {
  const box = document.createElement("div");
  switch (stim.type) {
    case "terms": {
      box.className = "terms";
      for (const item of stim.items) {
        const chip = document.createElement("span");
        chip.className = "term";
        chip.textContent = item;
        box.append(chip);
      }
      if (stim.tail) {
        const tail = document.createElement("span");
        tail.className = "term term--ask";
        tail.textContent = stim.tail;
        box.append(tail);
      }
      return box;
    }

    case "equations": {
      box.className = "eq";
      const row = (terms, op, value) => {
        const line = document.createElement("div");
        line.className = "eq__row";
        terms.forEach((t, i) => {
          if (i) {
            const sign = document.createElement("span");
            sign.className = "eq__op";
            sign.textContent = op;
            line.append(sign);
          }
          const tok = document.createElement("span");
          tok.className = "eq__tok";
          tok.innerHTML = art.token(stim.symbols[t]);
          line.append(tok);
        });
        const equals = document.createElement("span");
        equals.className = "eq__op";
        equals.textContent = "=";
        const total = document.createElement("span");
        total.className = `eq__val${value === null ? " eq__val--ask" : ""}`;
        total.textContent = value === null ? "?" : String(value);
        line.append(equals, total);
        return line;
      };
      for (const r of stim.rows) box.append(row(r.terms, r.op, r.value));
      box.append(row(stim.ask.terms, stim.ask.op, null));
      return box;
    }

    case "pyramid": {
      box.className = "pyr";
      for (const row of stim.cells) {
        const line = document.createElement("div");
        line.className = "pyr__row";
        for (const cell of row) {
          const brick = document.createElement("span");
          brick.className = `pyr__brick${cell.ask ? " pyr__brick--ask" : cell.value === null ? " pyr__brick--blank" : ""}`;
          brick.textContent = cell.ask ? "?" : cell.value === null ? "" : String(cell.value);
          line.append(brick);
        }
        box.append(line);
      }
      return box;
    }

    case "figure": {
      box.className = "row";
      box.innerHTML = art.figure(stim.cells, stim.cols, stim.rows);
      return box;
    }

    case "net": {
      box.className = "net";
      box.style.gridTemplateColumns = `repeat(${stim.cols}, 1fr)`;
      const bySpot = new Map(stim.faces.map((f, i) => [`${f.x},${f.y}`, i]));
      for (let y = 0; y < stim.rows; y++) {
        for (let x = 0; x < stim.cols; x++) {
          const i = bySpot.get(`${x},${y}`);
          const cell = document.createElement("span");
          if (i === undefined) {
            cell.className = "net__gap";
          } else {
            cell.className = `net__cell${i === stim.ring ? " net__cell--ring" : ""}`;
            cell.innerHTML = art.token(stim.faces[i].token);
          }
          box.append(cell);
        }
      }
      return box;
    }

    case "lines": {
      box.className = "lines";
      for (const line of stim.lines) {
        const p = document.createElement("p");
        p.textContent = line;
        box.append(p);
      }
      return box;
    }

    default: {
      box.className = "sum";
      box.textContent = stim.text;
      return box;
    }
  }
}

/* --- the answers ---------------------------------------------------------- */

function buildAnswers() {
  if (puzzle.form === "choice") return buildChoices();
  if (puzzle.form === "keypad") return buildKeypad();
  return buildLetters();
}

function buildChoices() {
  const isArt = Boolean(puzzle.options[0].token);
  const short = !isArt && puzzle.options.every((o) => o.text.length <= 14);
  el.answers.className = `answers ${isArt ? "answers--art" : "answers--text"}${short ? " answers--wide" : ""}`;
  el.answers.replaceChildren(
    ...puzzle.options.map((option, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `opt ${isArt ? "opt--art" : "opt--text"}`;
      button.dataset.pick = String(i);
      if (option.token) {
        button.innerHTML = art.token(option.token);
        button.setAttribute("aria-label", `Picture ${i + 1}`);
      } else {
        button.textContent = option.text;
      }
      return button;
    })
  );
}

/* A number you type, not one of four cards to guess between. */
function buildKeypad() {
  el.answers.className = "answers pad";
  const display = document.createElement("div");
  display.className = `pad__display${pick ? "" : " pad__display--empty"}`;
  display.textContent = pick || "type your answer";

  const keys = document.createElement("div");
  keys.className = "pad__keys";
  for (const label of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✕"]) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = `pad__key${label === "⌫" || label === "✕" ? " pad__key--edit" : ""}`;
    key.dataset.key = label;
    key.textContent = label;
    key.setAttribute("aria-label", label === "⌫" ? "Rub out the last digit" : label === "✕" ? "Clear" : label);
    keys.append(key);
  }
  el.answers.replaceChildren(display, keys);
}

function buildLetters() {
  el.answers.className = "answers letters";
  const slots = document.createElement("div");
  slots.className = "slots";
  for (let i = 0; i < puzzle.answer.length; i++) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `tile tile--slot${pick[i] ? " tile--filled" : ""}`;
    slot.dataset.slot = String(i);
    slot.textContent = pick[i] ? pick[i].letter : "";
    slot.setAttribute("aria-label", pick[i] ? `Letter ${pick[i].letter}, tap to take it back` : `Empty space ${i + 1}`);
    slots.append(slot);
  }

  const bank = document.createElement("div");
  bank.className = "tray";
  puzzle.letters.forEach((letter, i) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `tile${tray.includes(i) ? " tile--used" : ""}`;
    tile.dataset.tile = String(i);
    tile.textContent = letter;
    tile.setAttribute("aria-label", `Letter ${letter}`);
    bank.append(tile);
  });
  el.answers.replaceChildren(slots, bank);
}

/* --- picking (all of it free, all of it undoable) ------------------------- */

function refreshCommit() {
  const ready =
    puzzle.form === "choice"
      ? pick !== null
      : puzzle.form === "keypad"
        ? pick.length > 0
        : pick.filter(Boolean).length === puzzle.answer.length;
  el.commit.disabled = !ready;
}

function choose(i) {
  pick = pick === i ? null : i;
  for (const button of el.answers.querySelectorAll(".opt")) {
    button.classList.toggle("opt--picked", Number(button.dataset.pick) === pick);
  }
  refreshCommit();
}

function typeKey(label) {
  if (label === "⌫") pick = pick.slice(0, -1);
  else if (label === "✕") pick = "";
  else if (pick.length < 3) pick = (pick === "0" ? "" : pick) + label;
  buildKeypad();
  refreshCommit();
}

function placeLetter(tileIndex) {
  if (tray.includes(tileIndex)) return;
  const slot = pick.findIndex((v, i) => !v && i < puzzle.answer.length);
  const at = slot === -1 ? pick.length : slot;
  if (at >= puzzle.answer.length) return;
  pick[at] = { letter: puzzle.letters[tileIndex], tile: tileIndex };
  tray.push(tileIndex);
  buildLetters();
  refreshCommit();
}

function takeLetter(slotIndex) {
  const held = pick[slotIndex];
  if (!held) return;
  tray = tray.filter((t) => t !== held.tile);
  pick[slotIndex] = undefined;
  buildLetters();
  refreshCommit();
}

/* --- scoring -------------------------------------------------------------- */

function response() {
  if (puzzle.form === "choice") return pick;
  if (puzzle.form === "keypad") return pick;
  return pick.map((p) => p.letter).join("");
}

function commit() {
  const right = puz.isCorrect(puzzle, response());
  phase = "done";
  P.bankAnswer(save, puzzle.kind, right, mode);
  P.store(save);
  el.host.innerHTML = art.mascot(puzzle.host, { mood: right ? "happy" : "sad" });

  if (mode === "journey") {
    marks[round] = right;
    if (right) correct += 1;
    else hearts -= 1;
  }
  paintTop();

  markAnswers(right);
  el.verdict.className = `verdict verdict--${right ? "right" : "wrong"}`;
  el.verdict.textContent = `${right ? "Yes! " : "Not quite. "}${puzzle.explain}`;
  el.hint.disabled = true;
  el.commit.disabled = false;
  const last = mode === "journey" && (round + 1 >= plan.length || hearts <= 0);
  el.commit.textContent = last ? "Finish" : "Next";

  // The whole point of the tick is that you do not have to acknowledge it.
  if (right) advanceTimer = setTimeout(advance, SAVOUR_MS);
}

/* Nothing here is switched off with `disabled`: a disabled button swallows the
   tap instead of letting it bubble, and the tap that lands on one is usually
   the one meant to move on to the next puzzle. The handlers already ignore
   everything once the phase is "done", so aria-disabled says the same thing to
   a screen reader without eating the touch. */
function lock(element) {
  element.setAttribute("aria-disabled", "true");
  element.classList.add("is-locked");
}

function markAnswers(right) {
  if (puzzle.form === "choice") {
    for (const button of el.answers.querySelectorAll(".opt")) {
      const i = Number(button.dataset.pick);
      lock(button);
      button.classList.remove("opt--picked");
      if (i === puzzle.answer) button.classList.add("opt--right");
      else if (i === pick) button.classList.add("opt--wrong");
    }
  } else if (puzzle.form === "keypad") {
    const display = el.answers.querySelector(".pad__display");
    display.classList.add(right ? "pad__display--right" : "pad__display--wrong");
    if (!right) display.textContent = `${pick} — it was ${puzzle.answer}`;
    for (const key of el.answers.querySelectorAll(".pad__key")) lock(key);
  } else {
    for (const slot of el.answers.querySelectorAll(".tile--slot")) slot.classList.add(right ? "tile--right" : "tile--wrong");
    if (!right) {
      el.answers.querySelectorAll(".tile--slot").forEach((slot, i) => {
        slot.textContent = puzzle.answer[i];
      });
    }
    for (const tile of el.answers.querySelectorAll(".tray .tile")) tile.classList.add("tile--used");
  }
}

function advance() {
  clearTimeout(advanceTimer);
  if (phase !== "done") return;
  if (mode === "practice") {
    round += 1;
    beginRound();
    return;
  }
  round += 1;
  if (round >= plan.length || hearts <= 0) return endJourney();
  beginRound();
}

function endJourney() {
  const bonus = P.finishJourney(save, correct, plan.length);
  const unlocked = P.takeNewUnlocks(save);
  P.store(save);

  const ranOut = hearts <= 0;
  const host = puz.KIND_BY_ID[plan[Math.min(round, plan.length - 1)]].host;
  el.sheetArt.innerHTML = art.mascot(host, { mood: correct >= plan.length - 2 ? "happy" : "calm" });
  el.sheetTitle.textContent = correct === plan.length ? "Every flower bloomed!" : ranOut ? "Out of hearts" : "Journey done";
  const petals = correct * P.PETALS_PER_CORRECT + bonus;
  el.sheetLine.textContent =
    `${correct} of ${plan.length} bloomed — ${petals} ${petals === 1 ? "petal" : "petals"}` +
    (bonus ? ` (${bonus} of them for a clean sweep)` : "") +
    `. You keep every petal, always.`;

  if (unlocked.length) {
    el.sheetUnlock.hidden = false;
    el.sheetUnlock.textContent = unlocked.map((k) => `${art.MASCOTS[k.host].name} has moved into the garden — ${k.blurb}`).join(" ");
  } else {
    const next = P.nextUnlock(save);
    el.sheetUnlock.hidden = !next;
    if (next) el.sheetUnlock.textContent = `${next.togo} more ${next.togo === 1 ? "petal" : "petals"} and ${art.MASCOTS[next.kind.host].name} arrives.`;
  }
  el.sheet.hidden = false;
}

/* --- input ---------------------------------------------------------------- */

el.startJourney.addEventListener("click", startJourney);
el.quit.addEventListener("click", showGarden);
el.sheetGarden.addEventListener("click", showGarden);
el.sheetAgain.addEventListener("click", startJourney);

el.hosts.addEventListener("click", (event) => {
  const card = event.target.closest(".host");
  if (card?.dataset.kind) startPractice(card.dataset.kind);
});

el.answers.addEventListener("click", (event) => {
  if (phase !== "ask") return;
  const option = event.target.closest(".opt");
  if (option) return choose(Number(option.dataset.pick));
  const key = event.target.closest("[data-key]");
  if (key) return typeKey(key.dataset.key);
  const slot = event.target.closest("[data-slot]");
  if (slot) return takeLetter(Number(slot.dataset.slot));
  const tile = event.target.closest("[data-tile]");
  if (tile) return placeLetter(Number(tile.dataset.tile));
});

el.hint.addEventListener("click", () => {
  if (phase !== "ask") return;
  el.verdict.className = "verdict";
  el.verdict.textContent = puzzle.hint;
  el.hint.disabled = true;
});

el.commit.addEventListener("click", () => {
  if (phase === "ask") commit();
  else advance();
});

/* Once the answer is in, anywhere on the puzzle moves on - no aiming at a
   button, and no waiting out the pause if you have already read it. This is
   why nothing gets the `disabled` attribute when a round is graded. */
el.play.addEventListener("click", (event) => {
  if (phase !== "done") return;
  if (event.target.closest("#commit") || event.target.closest("#quit")) return;
  advance();
});

/* --- boot ----------------------------------------------------------------- */

el.defs.innerHTML = art.defs();
showGarden();
