/* The duel screen.

   duel.js never asks for input - it publishes `step` and `priority` and waits.
   This file is the half that asks: it reads that pair, decides what the player
   is allowed to touch, and turns taps back into engine calls. The monster's
   half of the same loop is ai.botAct on a timer, one action at a time, so you
   can watch it play rather than being shown a finished board.

   The repo rule that shapes every control here: a tap reveals, a labelled
   button commits. Tapping a card opens it and nothing else; casting it takes
   a second, named press. Choosing attackers and blockers is a selection you
   can undo right up until you press the button that spends it. */

import { CARDS, COLORS, KEYWORDS, cardText, costLabel } from "./cards.js";
import * as duel from "./duel.js";
import * as ai from "./ai.js";
import { spriteCanvas } from "./sprites.js";

const { power, toughness, has, creatures } = duel;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const BOT_PAUSE = 420;

/* Three letters each, because a 52-pixel chip cannot hold "Deathtouch" and
   "Deat" reads like a typo. Tapping the creature spells them out in full. */
const ABBR = {
  flying: "fly", reach: "rch", haste: "hst", vigilance: "vig", trample: "trm",
  lifelink: "lif", deathtouch: "dth", firststrike: "1st", defender: "def",
};

let S = null; // { state, foeDef, onDone, mode, ... }

/* ---------- little views shared with the deck builder -------------------- */

export function cardArt(id) {
  const def = CARDS[id];
  if (def?.art) return spriteCanvas(def.art);
  // Spells have no portrait: a coloured rune reads better than a stock icon,
  // and it keeps the sprite sheet honest instead of padded with filler.
  const rune = el("span", "rune", def?.color ? COLORS[def.color].glyph : "◇");
  rune.style.cssText =
    `width:40px;height:40px;display:grid;place-items:center;font-size:1.4rem;border-radius:50%;` +
    `background:rgba(255,255,255,0.05);color:${def?.color ? COLORS[def.color].tint : "#9a9ab8"}`;
  return rune;
}

export function cardEl(id, { small = false } = {}) {
  const def = CARDS[id];
  const node = el("button", `card card--${def.color || "relic"}${def.type === "land" ? " card--land" : ""}`);
  node.type = "button";
  node.appendChild(el("span", "card__name", def.name));
  node.appendChild(cardArt(id));
  if (!small && def.kw?.length) {
    node.appendChild(el("span", "card__tag", def.kw.map((k) => KEYWORDS[k].name).join(" · ")));
  }
  // Cost on the left, body on the right, both on one line under the art: the
  // badge used to float over the title and clip every long name.
  const foot = el("span", "card__foot");
  foot.appendChild(el("span", "card__cost", def.type === "land" ? "—" : costLabel(id)));
  foot.appendChild(el("span", "card__pt", def.type === "creature"
    ? `${def.power}/${def.toughness}`
    : def.type === "land" ? "land" : def.type));
  node.appendChild(foot);
  return node;
}

function unitEl(perm) {
  const node = el("button", "unit");
  node.type = "button";
  node.dataset.uid = perm.uid;
  if (perm.tapped) node.classList.add("is-tapped");
  if (perm.sick && perm.kind === "creature") node.classList.add("is-sick");
  const art = perm.art || CARDS[perm.id]?.art;
  node.appendChild(art ? spriteCanvas(art) : cardArt(perm.id));
  if (perm.kind === "creature") {
    node.appendChild(el("span", "unit__pt", `${power(perm)}/${Math.max(0, toughness(perm) - perm.damage)}`));
    const kw = [...perm.kw, ...perm.tempKw];
    node.appendChild(el("span", "unit__kw", kw.map((k) => ABBR[k]).join(" ")));
  } else {
    node.appendChild(el("span", "unit__pt", COLORS[perm.color]?.glyph || "◇"));
    node.appendChild(el("span", "unit__kw", ""));
  }
  return node;
}

/* ---------- the overlay, reused for every "read this then decide" -------- */

function sheet(build) {
  const overlay = $("overlay");
  const panel = $("panel");
  panel.replaceChildren();
  build(panel, () => { overlay.hidden = true; });
  overlay.hidden = false;
}
const closeSheet = () => { $("overlay").hidden = true; };

/* ---------- starting a duel ---------------------------------------------- */

export function startDuel({ hero, foe, foeDef, ante, rng, heroFirst = true, onDone }) {
  const state = duel.newDuel({ hero, foe, rng, heroFirst, ante });
  S = { state, foeDef, ante, onDone, mode: "mulligan", attackers: new Set(), blocks: {}, focus: null, cast: null };
  ai.botMulligan(state, 1);
  render();
  return state;
}

/* ---------- rendering ----------------------------------------------------- */

function render() {
  const { state } = S;
  const me = state.players[0];
  const them = state.players[1];

  $("foe-name").textContent = them.name;
  $("foe-life").textContent = them.life;
  $("foe-hand").textContent = `✋${them.hand.length}`;
  $("foe-deck").textContent = `⌸${them.library.length}`;
  $("my-life").textContent = me.life;
  $("my-deck").textContent = `⌸${me.library.length}`;

  const portrait = $("foe-portrait");
  portrait.replaceChildren(spriteCanvas(them.sprite || "gravegnat"));
  $("my-portrait").replaceChildren(spriteCanvas("hero"));

  drawMana($("foe-mana"), them);
  drawMana($("my-mana"), me);
  drawBoard($("foe-board"), them, 1);
  drawBoard($("my-board"), me, 0);
  drawHand();
  drawActions();

  const last = state.log[state.log.length - 1];
  const log = $("duel-log");
  log.textContent = last ? last.text : "";
  log.className = `duel-log ${last?.kind === "good" || last?.kind === "bad" ? last.kind : ""}`;

  $("foe-portrait").parentElement.classList.toggle(
    "is-target",
    S.mode === "target" && S.cast?.legal.some((t) => t.isPlayer),
  );
}

function drawMana(host, player) {
  host.replaceChildren();
  for (const perm of player.board) {
    if (!duel.isManaSource(perm)) continue;
    const dot = el("span", `mana ${perm.tapped ? "is-spent" : "is-open"}`);
    const color = perm.any ? null : perm.color;
    dot.style.background = perm.tapped
      ? "rgba(255,255,255,0.08)"
      : color ? COLORS[color].tint : "linear-gradient(135deg,#ffd66b,#56b0f0,#b98ee0)";
    host.appendChild(dot);
  }
}

function drawBoard(host, player, side) {
  host.replaceChildren();
  for (const perm of player.board) {
    if (perm.kind !== "creature") continue;
    const node = unitEl(perm);
    if (S.attackers.has(perm.uid)) node.classList.add("is-attacking");
    if (state_isAttacking(perm)) node.classList.add("is-attacking");
    const blockedBy = Object.entries(S.blocks).find(([, list]) => list.includes(perm.uid));
    if (blockedBy) node.classList.add("is-blocking");
    if (S.focus === perm.uid) node.classList.add("is-picked");
    if (S.mode === "target" && S.cast?.legal.some((t) => t.uid === perm.uid)) node.classList.add("is-target");
    if (S.mode === "block" && side === 1 && S.state.combat?.attackers.includes(perm.uid)) {
      const n = (S.blocks[perm.uid] || []).length;
      if (n) node.appendChild(el("span", "unit__badge", `×${n}`));
    }
    node.addEventListener("click", () => onUnit(perm, side));
    host.appendChild(node);
  }
}

const state_isAttacking = (perm) => !!S.state.combat?.attackers.includes(perm.uid);

function drawHand() {
  const host = $("hand");
  host.replaceChildren();
  if (S.mode === "watch" || S.mode === "over") return;
  // While a spell is looking for its target the hand is inert: opening a
  // second card mid-aim would silently throw away the first one's choices.
  const aiming = S.mode === "target";
  for (const card of S.state.players[0].hand) {
    const node = cardEl(card.id);
    const playable = !aiming && duel.castable(S.state, 0, card);
    if (!playable) node.classList.add("is-dead");
    if (!aiming) node.addEventListener("click", () => openCard(card, playable));
    host.appendChild(node);
  }
}

function button(label, cls, fn) {
  const b = el("button", `rune-button ${cls || ""}`, label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}

function drawActions() {
  const host = $("duel-actions");
  host.replaceChildren();
  const { state } = S;

  if (S.mode === "over") {
    host.appendChild(button(state.over.winner === 0 ? "Take the spoils" : "Come to", "rune-button--go", finish));
    return;
  }
  if (S.mode === "mulligan") {
    host.appendChild(button("Keep", "rune-button--go", () => { duel.keepHands(state); S.mode = "main"; render(); pump(); }));
    if (!state.players[0].mulliganed) {
      host.appendChild(button("Mulligan", "", () => { duel.mulligan(state, 0); render(); }));
    }
    return;
  }
  if (S.mode === "target") {
    host.appendChild(el("span", "pip", `Choose ${targetWord(S.cast.spec[S.cast.chosen.length])}`));
    host.appendChild(button("Cancel", "", cancelCast));
    return;
  }
  if (S.mode === "attack") {
    host.appendChild(button(`Swing with ${S.attackers.size}`, "rune-button--go", confirmAttack));
    host.appendChild(button("Back", "", () => { S.attackers.clear(); S.mode = "main"; render(); }));
    return;
  }
  if (S.mode === "block") {
    const n = Object.values(S.blocks).reduce((a, l) => a + l.length, 0);
    host.appendChild(button(n ? `Block with ${n}` : "Take it", "rune-button--go", confirmBlocks));
    return;
  }
  if (S.mode === "trick") {
    host.appendChild(button("Strike", "rune-button--go", () => { duel.resolveCombat(state); after(); }));
    return;
  }
  if (S.mode === "main") {
    const ready = state.players[0].board.filter(duel.canAttack);
    if (!state.combatDone && ready.length) {
      host.appendChild(button("Attack", "", () => { S.mode = "attack"; render(); }));
    }
    host.appendChild(button("End Turn", "rune-button--go", () => { duel.endTurn(state); after(); }));
  }
}

const targetWord = (kind) => ({
  any: "a creature or the enemy",
  creature: "a creature",
  theirs: "an enemy creature",
  theirsFlying: "an enemy flier",
  yours: "one of yours",
}[kind] || "a target");

/* ---------- taps ---------------------------------------------------------- */

function openCard(card, playable) {
  const def = CARDS[card.id];
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, def.name));
    panel.appendChild(el("p", "lead", `${def.type === "land" ? "Land" : `${costLabel(card.id)} · ${def.type}`}${def.type === "creature" ? ` · ${def.power}/${def.toughness}` : ""}`));
    panel.appendChild(el("p", null, cardText(card.id)));
    if (playable) {
      panel.appendChild(button(def.type === "land" ? "Play it" : "Cast it", "rune-button--go", () => {
        close();
        if (def.type === "land") { duel.playLand(S.state, card); after(); return; }
        beginCast(card);
      }));
    } else {
      panel.appendChild(el("p", null, whyNot(card)));
    }
    panel.appendChild(button("Close", "", close));
  });
}

function whyNot(card) {
  const def = CARDS[card.id];
  const me = S.state.players[0];
  if (def.type === "land") return me.landPlayed ? "One land a turn." : "Not on their turn.";
  if (!duel.canPay(me, card.id)) return "Not enough open mana.";
  if (duel.targetSpec(card.id).some((kind) => !duel.legalTargets(S.state, 0, kind).length)) {
    return "There is nothing to aim it at.";
  }
  if (def.type === "reflex") return "A reflex waits for combat — cast it while blockers are being declared.";
  return "Not right now.";
}

function beginCast(card) {
  const spec = duel.targetSpec(card.id);
  if (!spec.length) { duel.castSpell(S.state, 0, card, []); after(); return; }
  S.cast = { card, spec, chosen: [], legal: duel.legalTargets(S.state, 0, spec[0]) };
  if (!S.cast.legal.length) { S.cast = null; flash("Nothing to aim it at."); return; }
  S.mode = "target";
  render();
}

function cancelCast() { S.cast = null; S.mode = modeForStep(); render(); }

function takeTarget(target) {
  const c = S.cast;
  c.chosen.push(target);
  if (c.chosen.length < c.spec.length) {
    c.legal = duel.legalTargets(S.state, 0, c.spec[c.chosen.length]);
    render();
    return;
  }
  const card = c.card;
  const chosen = c.chosen;
  S.cast = null;
  S.mode = modeForStep();
  duel.castSpell(S.state, 0, card, chosen);
  after();
}

function onUnit(perm, side) {
  if (S.mode === "target") {
    if (S.cast.legal.some((t) => t.uid === perm.uid)) takeTarget(perm);
    return;
  }
  if (S.mode === "attack" && side === 0) {
    if (!duel.canAttack(perm)) { flash(perm.sick ? "It only just arrived." : "It cannot attack."); return; }
    S.attackers.has(perm.uid) ? S.attackers.delete(perm.uid) : S.attackers.add(perm.uid);
    render();
    return;
  }
  if (S.mode === "block") {
    if (side === 1) {
      S.focus = S.state.combat.attackers.includes(perm.uid) ? perm.uid : null;
      render();
      return;
    }
    // One of mine: assign it to the attacker in focus, or take it back off.
    const already = Object.entries(S.blocks).find(([, l]) => l.includes(perm.uid));
    if (already) {
      S.blocks[already[0]] = S.blocks[already[0]].filter((u) => u !== perm.uid);
      if (!S.blocks[already[0]].length) delete S.blocks[already[0]];
      render();
      return;
    }
    if (!S.focus) { flash("Tap the attacker you want to stop first."); return; }
    const atk = S.state.players[1].board.find((p) => p.uid === S.focus);
    if (perm.tapped) { flash("It is tapped."); return; }
    if (!duel.canBlock(atk, perm)) { flash(`${atk.name} is flying.`); return; }
    (S.blocks[S.focus] ||= []).push(perm.uid);
    render();
    return;
  }
  inspect(perm);
}

function inspect(perm) {
  const def = CARDS[perm.id];
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, perm.name));
    if (perm.kind === "creature") {
      panel.appendChild(el("p", "lead", `${power(perm)}/${Math.max(0, toughness(perm) - perm.damage)}${perm.tapped ? " · tapped" : ""}${perm.sick ? " · just arrived" : ""}`));
    }
    const kw = [...perm.kw, ...perm.tempKw];
    for (const k of kw) panel.appendChild(el("p", null, `${KEYWORDS[k].name} — ${KEYWORDS[k].help}`));
    if (def) panel.appendChild(el("p", null, cardText(perm.id)));
    panel.appendChild(button("Close", "", close));
  });
}

function flash(text) {
  const banner = $("duel-banner");
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { banner.hidden = true; }, 1100);
}

/* ---------- committing ---------------------------------------------------- */

function confirmAttack() {
  if (!S.attackers.size) { S.mode = "main"; S.state.combatDone = true; render(); return; }
  duel.declareAttackers(S.state, [...S.attackers]);
  S.attackers.clear();
  after();
}

function confirmBlocks() {
  duel.declareBlockers(S.state, S.blocks);
  S.blocks = {};
  S.focus = null;
  after();
}

/* ---------- the loop ------------------------------------------------------ */

function modeForStep() {
  const { state } = S;
  if (state.over) return "over";
  if (state.step === "mulligan") return "mulligan";
  if (state.priority !== 0) return "watch";
  if (state.step === "blockers") return "block";
  if (state.step === "tricks") return "trick";
  return "main";
}

/* Called after anything the player did. Works out whose turn it is now, then
   either hands control back or starts the monster ticking. */
function after() {
  S.mode = modeForStep();
  render();
  pump();
}

function pump() {
  const { state } = S;
  if (state.over) { S.mode = "over"; render(); return; }
  if (state.priority === 0) { S.mode = modeForStep(); render(); return; }
  S.mode = "watch";
  render();
  setTimeout(() => {
    if (!S) return;
    const acted = ai.botAct(state, S.foeDef.skill);
    if (!acted && state.priority !== 0) { duel.endTurn(state); }
    after();
  }, BOT_PAUSE);
}

function finish() {
  const { state, onDone } = S;
  const win = state.over.winner === 0;
  const lifeLeft = Math.max(1, state.players[0].life);
  S = null;
  closeSheet();
  onDone({ win, lifeLeft, turns: state.turn });
}

export function abandonDuel() { S = null; closeSheet(); }
