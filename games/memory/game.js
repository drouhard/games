/* Memory Match.
   Plain script, no modules and no build step - the file that ships is the file
   that runs. State lives in `deck`; the DOM is only ever nudged with classes
   after the initial deal. */

(() => {
  "use strict";

  const SYMBOLS = ["🍕", "🚀", "🐙", "🎸", "🌵", "⚡"];
  const BEST_KEY = "memory:best-moves";
  const MISMATCH_MS = 800; // how long a non-matching pair stays visible

  const el = {
    board: document.getElementById("board"),
    moves: document.getElementById("moves"),
    time: document.getElementById("time"),
    best: document.getElementById("best"),
    status: document.getElementById("status"),
    restart: document.getElementById("restart"),
    win: document.getElementById("win"),
    winSummary: document.getElementById("win-summary"),
    winNote: document.getElementById("win-note"),
    playAgain: document.getElementById("play-again"),
  };

  let deck = []; // [{ symbol, matched }]
  let picked = []; // indices face up and not yet resolved (0-2 of them)
  let moves = 0;
  let locked = false; // true while a mismatched pair is on show
  let startedAt = null; // clock starts on the first flip, not on load
  let tickTimer = null;
  let flipTimer = null;

  // --- setup ---------------------------------------------------------------

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function makeCard(card, index) {
    const button = document.createElement("button");
    button.className = "card";
    button.type = "button";
    button.dataset.index = String(index);

    const inner = document.createElement("span");
    inner.className = "card__inner";

    const cover = document.createElement("span");
    cover.className = "card__cover";

    const face = document.createElement("span");
    face.className = "card__face";
    face.textContent = card.symbol;

    inner.append(cover, face);
    button.append(inner);
    describe(button, index, "face down");
    return button;
  }

  function deal() {
    clearTimeout(flipTimer);
    stopClock();

    deck = shuffle(
      SYMBOLS.concat(SYMBOLS).map((symbol) => ({ symbol, matched: false }))
    );
    picked = [];
    moves = 0;
    locked = false;
    startedAt = null;

    el.board.replaceChildren(...deck.map(makeCard));
    el.win.hidden = true;
    el.status.textContent = "";
    el.time.textContent = "0:00";
    render();
  }

  // --- play ----------------------------------------------------------------

  function cardEl(index) {
    return el.board.children[index];
  }

  function describe(button, index, state) {
    button.setAttribute("aria-label", `Card ${index + 1}, ${state}`);
  }

  function setFaceUp(index, up) {
    const button = cardEl(index);
    button.classList.toggle("is-up", up);
    describe(button, index, up ? deck[index].symbol : "face down");
  }

  function reveal(index) {
    const card = deck[index];
    if (locked || !card || card.matched || picked.includes(index)) return;

    if (startedAt === null) startClock();
    picked.push(index);
    setFaceUp(index, true);
    if (picked.length < 2) return;

    moves += 1;
    render();

    const [a, b] = picked;
    if (deck[a].symbol === deck[b].symbol) {
      deck[a].matched = deck[b].matched = true;
      for (const i of picked) {
        cardEl(i).classList.add("is-matched");
        describe(cardEl(i), i, `${deck[i].symbol}, matched`);
      }
      picked = [];
      el.status.textContent = "Match";
      if (deck.every((c) => c.matched)) finish();
    } else {
      // Hold both cards up briefly so the player can read them, then hide.
      locked = true;
      el.status.textContent = "No match";
      flipTimer = setTimeout(() => {
        setFaceUp(a, false);
        setFaceUp(b, false);
        picked = [];
        locked = false;
      }, MISMATCH_MS);
    }
  }

  function finish() {
    stopClock();
    const seconds = elapsedSeconds();
    const previous = loadBest();
    const isBest = previous === null || moves < previous;
    if (isBest) saveBest(moves);

    el.winSummary.textContent = `${moves} moves in ${formatTime(seconds)}`;
    el.winNote.textContent = isBest
      ? previous === null
        ? "First finish — that's the score to beat."
        : `New best, ${previous - moves} fewer than before.`
      : `Best so far: ${previous} moves`;
    el.win.hidden = false;
    render();
  }

  // --- clock ---------------------------------------------------------------

  function elapsedSeconds() {
    return startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000);
  }

  function formatTime(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function startClock() {
    startedAt = Date.now();
    // Faster than 1s so the display never lags a tick behind the real time.
    tickTimer = setInterval(() => {
      el.time.textContent = formatTime(elapsedSeconds());
    }, 250);
  }

  function stopClock() {
    clearInterval(tickTimer);
    tickTimer = null;
  }

  // --- persistence ---------------------------------------------------------

  // localStorage throws in some private-browsing situations, so never let a
  // missing high score take the game down with it.
  function loadBest() {
    try {
      const stored = localStorage.getItem(BEST_KEY);
      return stored === null ? null : Number(stored);
    } catch (error) {
      return null;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (error) {
      /* score just won't persist */
    }
  }

  function render() {
    const best = loadBest();
    el.moves.textContent = String(moves);
    el.best.textContent = best === null ? "—" : String(best);
  }

  // --- input ---------------------------------------------------------------

  // pointerdown rather than click: the card flips the instant a finger lands.
  el.board.addEventListener("pointerdown", (event) => {
    const button = event.target.closest(".card");
    if (button) reveal(Number(button.dataset.index));
  });

  // Keyboard activation still arrives as a click, and only those have
  // detail === 0 - so this never double-fires after a real tap.
  el.board.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const button = event.target.closest(".card");
    if (button) reveal(Number(button.dataset.index));
  });

  el.restart.addEventListener("click", deal);
  el.playAgain.addEventListener("click", deal);

  deal();
})();
