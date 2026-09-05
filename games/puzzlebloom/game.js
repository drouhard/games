/* The screen. Everything that decides anything lives in puzzles.js and
   progress.js; this file only turns those objects into elements and turns taps
   back into answers.

   The input rule the whole thing is built around: a tap never commits. Tapping
   an answer picks it up, tapping it again or tapping another puts it back, and
   nothing is scored until the labelled button at the bottom is pressed. The
   letter tray and the word grid work the same way - every tap is free and
   every tap is undoable. */

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

let mode = null; // "journey" | "practice"
let plan = [];
let marks = []; // per round: true, false or null
let round = 0;
let hearts = 0;
let correct = 0;
let practiceKind = null;
let practiceLevel = 1;
let practiceRun = 0; // right answers in a row, which is what moves the level

let puzzle = null;
let phase = "ask"; // "study" | "ask" | "done"
let pick = null; // number, letter array, or cell path
let tray = []; // scramble: which tray tiles have been used
let studyTimer = null;

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
  clearTimeout(studyTimer);
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
  practiceLevel = 1;
  practiceRun = 0;
  round = 0;
  el.sheet.hidden = true;
  el.garden.hidden = true;
  el.play.hidden = false;
  beginRound();
}

function beginRound() {
  clearTimeout(studyTimer);
  const kindId = mode === "journey" ? plan[round].kind : practiceKind;
  const level = mode === "journey" ? plan[round].level : practiceLevel;
  puzzle = puz.makePuzzle(kindId, rand, level);
  pick = puzzle.form === "letters" ? [] : puzzle.form === "grid" ? [] : null;
  tray = [];
  el.hint.disabled = false;
  el.verdict.textContent = "";
  el.verdict.className = "verdict";

  paintTop();
  if (puzzle.study) {
    phase = "study";
    runStudy();
  } else {
    phase = "ask";
    paintAsk();
  }
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
    el.hearts.textContent = `level ${practiceLevel}`;
  }
}

function setHost(mood) {
  el.host.innerHTML = art.mascot(puzzle.host, { mood });
}

/* --- the Flash look-and-remember phase ------------------------------------ */

function runStudy() {
  setHost("think");
  el.prompt.textContent = "Look hard. These are about to vanish.";
  el.stim.hidden = false;
  el.stim.innerHTML = "";
  el.stim.append(buildStimulus(puzzle.study.stimulus));
  el.stage.classList.add("stage--stim", "stage--study");
  el.stage.classList.remove("stage--bare");

  const bar = document.createElement("div");
  bar.className = "timer";
  const fill = document.createElement("div");
  fill.className = "timer__fill";
  bar.append(fill);
  el.answers.className = "answers";
  el.answers.replaceChildren(bar);

  el.commit.disabled = true;
  el.commit.textContent = "Watching…";
  el.hint.disabled = true;
  // Two frames, so the transition has a start value to animate away from. The
  // duration is set !important because base.css flattens every transition
  // under prefers-reduced-motion - right for decoration, wrong for a bar whose
  // whole job is to say how long is left.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.setProperty("transition-property", "transform", "important");
      fill.style.setProperty("transition-timing-function", "linear", "important");
      fill.style.setProperty("transition-duration", `${puzzle.study.seconds}s`, "important");
      fill.style.transform = "scaleX(0)";
    });
  });
  studyTimer = setTimeout(() => {
    phase = "ask";
    paintAsk();
  }, puzzle.study.seconds * 1000);
}

/* --- the question --------------------------------------------------------- */

function paintAsk() {
  setHost("think");
  el.hint.disabled = false;
  el.prompt.textContent = puzzle.prompt;
  el.stim.hidden = !puzzle.stimulus;
  el.stim.innerHTML = "";
  if (puzzle.stimulus) el.stim.append(buildStimulus(puzzle.stimulus));
  el.stage.classList.remove("stage--study");
  el.stage.classList.toggle("stage--stim", Boolean(puzzle.stimulus));
  el.stage.classList.toggle("stage--bare", !puzzle.stimulus);
  buildAnswers();
  el.commit.textContent = "Check";
  refreshCommit();
}

function buildStimulus(stim) {
  if (stim.type === "tokens") {
    const row = document.createElement("div");
    row.className = "row";
    for (const t of stim.items) {
      const cell = document.createElement("div");
      cell.className = "row__cell";
      cell.innerHTML = art.token(t);
      row.append(cell);
    }
    if (stim.tail) {
      const tail = document.createElement("div");
      tail.className = "row__tail";
      tail.textContent = stim.tail;
      row.append(tail);
    }
    return row;
  }
  if (stim.type === "scene") {
    const box = document.createElement("div");
    box.innerHTML = art.scene(stim.items, stim);
    box.className = "row";
    return box;
  }
  if (stim.type === "scales") {
    const wrap = document.createElement("div");
    wrap.className = "row";
    wrap.innerHTML = art.scales(stim.facts);
    return wrap;
  }
  const sum = document.createElement("div");
  sum.className = "sum";
  sum.textContent = stim.text;
  return sum;
}

function buildAnswers() {
  if (puzzle.form === "choice") return buildChoices();
  if (puzzle.form === "letters") return buildLetters();
  return buildGrid();
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

function buildGrid() {
  el.answers.className = "answers letters";
  const word = document.createElement("p");
  word.className = "picked-word";
  word.textContent = pick.map((c) => puzzle.grid.cells[c]).join(" ");

  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = `repeat(${puzzle.grid.size}, 1fr)`;
  puzzle.grid.cells.forEach((letter, i) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `cell${pick.includes(i) ? " cell--picked" : ""}`;
    cell.dataset.cell = String(i);
    cell.textContent = letter;
    grid.append(cell);
  });
  el.answers.replaceChildren(grid, word);
}

/* --- picking -------------------------------------------------------------- */

function refreshCommit() {
  const ready =
    puzzle.form === "choice" ? pick !== null : puzzle.form === "letters" ? pick.filter(Boolean).length === puzzle.answer.length : pick.length === puzzle.answer.length;
  el.commit.disabled = !ready;
}

function choose(i) {
  // Picking is free and reversible: tap the same card again to put it back.
  pick = pick === i ? null : i;
  for (const button of el.answers.querySelectorAll(".opt")) {
    button.classList.toggle("opt--picked", Number(button.dataset.pick) === pick);
  }
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

/* A path has to be a straight run, so the grid never accepts a shape the
   answer could not be. Tapping a cell already in the path rubs out from there
   on; tapping somewhere that cannot continue the run starts a fresh one. */
function traceCell(cell) {
  const at = pick.indexOf(cell);
  if (at !== -1) {
    pick = pick.slice(0, at);
  } else if (pick.length === 0) {
    pick = [cell];
  } else if (pick.length >= puzzle.answer.length) {
    pick = [cell];
  } else {
    const size = puzzle.grid.size;
    const xy = (c) => [c % size, Math.floor(c / size)];
    const [lx, ly] = xy(pick[pick.length - 1]);
    const [cx, cy] = xy(cell);
    const dx = cx - lx;
    const dy = cy - ly;
    const stepOk = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy);
    let ok = stepOk;
    if (ok && pick.length >= 2) {
      const [px, py] = xy(pick[pick.length - 2]);
      ok = lx - px === dx && ly - py === dy;
    }
    pick = ok ? pick.concat(cell) : [cell];
  }
  buildGrid();
  refreshCommit();
}

/* --- scoring -------------------------------------------------------------- */

function response() {
  if (puzzle.form === "choice") return pick;
  if (puzzle.form === "letters") return pick.map((p) => p.letter).join("");
  return pick;
}

function commit() {
  const right = puz.isCorrect(puzzle, response());
  phase = "done";
  P.bankAnswer(save, puzzle.kind, right, mode);
  P.store(save);
  setHost(right ? "happy" : "sad");

  if (mode === "journey") {
    marks[round] = right;
    if (right) correct += 1;
    else hearts -= 1;
  } else if (right) {
    // Practice finds its own level: two in a row moves up, a miss moves down.
    practiceRun += 1;
    if (practiceRun % 2 === 0) practiceLevel = Math.min(5, practiceLevel + 1);
  } else {
    practiceRun = 0;
    practiceLevel = Math.max(1, practiceLevel - 1);
  }
  paintTop();

  markAnswers(right);
  el.verdict.className = `verdict verdict--${right ? "right" : "wrong"}`;
  el.verdict.textContent = `${right ? "Yes! " : "Not quite. "}${puzzle.explain}`;
  el.hint.disabled = true;
  el.commit.disabled = false;
  el.commit.textContent = mode === "journey" && (round + 1 >= plan.length || hearts <= 0) ? "Finish" : "Next";
}

function markAnswers(right) {
  if (puzzle.form === "choice") {
    for (const button of el.answers.querySelectorAll(".opt")) {
      const i = Number(button.dataset.pick);
      button.disabled = true;
      button.classList.remove("opt--picked");
      if (i === puzzle.answer) button.classList.add("opt--right");
      else if (i === pick) button.classList.add("opt--wrong");
    }
  } else if (puzzle.form === "letters") {
    for (const slot of el.answers.querySelectorAll(".tile--slot")) {
      slot.classList.add(right ? "tile--right" : "tile--wrong");
    }
    if (!right) {
      // Show the word rather than making them guess again from nothing.
      el.answers.querySelectorAll(".tile--slot").forEach((slot, i) => {
        slot.textContent = puzzle.answer[i];
      });
    }
    for (const tile of el.answers.querySelectorAll(".tray .tile")) tile.classList.add("tile--used");
  } else {
    for (const cell of el.answers.querySelectorAll(".cell")) {
      const i = Number(cell.dataset.cell);
      cell.disabled = true;
      cell.classList.remove("cell--picked");
      if (puzzle.answer.includes(i)) cell.classList.add("cell--right");
      else if (pick.includes(i)) cell.classList.add("cell--wrong");
    }
  }
}

function advance() {
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
  const host = puz.KIND_BY_ID[plan[Math.min(round, plan.length - 1)].kind].host;
  el.sheetArt.innerHTML = art.mascot(host, { mood: correct >= plan.length - 2 ? "happy" : "calm" });
  el.sheetTitle.textContent = correct === plan.length ? "Every flower bloomed!" : ranOut ? "Out of hearts" : "Journey done";
  const petals = correct * P.PETALS_PER_CORRECT + bonus;
  el.sheetLine.textContent =
    `${correct} of ${plan.length} bloomed — ${petals} ${petals === 1 ? "petal" : "petals"}` +
    (bonus ? ` (${bonus} of them for a clean sweep)` : "") +
    `. You keep every petal, always.`;

  if (unlocked.length) {
    el.sheetUnlock.hidden = false;
    el.sheetUnlock.textContent = unlocked
      .map((k) => `${art.MASCOTS[k.host].name} has moved into the garden — ${k.blurb}`)
      .join(" ");
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
  const slot = event.target.closest("[data-slot]");
  if (slot) return takeLetter(Number(slot.dataset.slot));
  const tile = event.target.closest("[data-tile]");
  if (tile) return placeLetter(Number(tile.dataset.tile));
  const cell = event.target.closest("[data-cell]");
  if (cell) return traceCell(Number(cell.dataset.cell));
});

el.hint.addEventListener("click", () => {
  if (phase !== "ask") return;
  el.verdict.className = "verdict";
  el.verdict.textContent = puzzle.hint;
  el.hint.disabled = true;
});

el.commit.addEventListener("click", () => {
  if (phase === "ask") commit();
  else if (phase === "done") advance();
});

/* --- boot ----------------------------------------------------------------- */

el.defs.innerHTML = art.defs();
showGarden();
