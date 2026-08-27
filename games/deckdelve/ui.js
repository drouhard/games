/* Rendering helpers. Everything here builds DOM and knows nothing about the
   rules - it is handed plain values and returns elements, which keeps game.js
   readable and keeps the engine free of any of this. */

import { STATUSES, describe } from "./data.js";
import { spriteCanvas } from "./sprites.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function sprite(key, className) {
  const canvas = spriteCanvas(key);
  if (className) canvas.className = `sprite ${className}`;
  return canvas;
}

export function showScreen(name) {
  for (const screen of document.querySelectorAll(".screen")) {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  }
}

/* ---------- bars and chips ----------------------------------------------- */

export function gauge(value, max, { kind = "hp", label } = {}) {
  const wrap = el("div", `gauge gauge--${kind}`);
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (kind === "hp") {
    if (ratio <= 0.25) wrap.classList.add("is-critical");
    else if (ratio <= 0.5) wrap.classList.add("is-hurt");
  }
  const fill = el("div", "gauge__fill");
  fill.style.width = `${Math.round(ratio * 100)}%`;
  wrap.append(fill, el("span", "gauge__text", label ?? `${Math.max(0, value)}/${max}`));
  return wrap;
}

export function chips(statuses) {
  const row = el("div", "chips");
  for (const [status, amount] of Object.entries(statuses || {})) {
    if (!amount) continue;
    const info = STATUSES[status];
    if (!info) continue;
    row.append(el("span", `chip is-${info.kind}`, `${info.name} ${amount}`));
  }
  return row;
}

export function statusesIn(def) {
  const effects = def.modes ? def.modes.flatMap((m) => m.effects) : def.effects;
  return effects.map((e) => e.kind).filter((kind) => STATUSES[kind]);
}

/* Spells out what Thorns or Soften actually do, right where they are named. */
export function statusNotes(ids) {
  const list = el("div", "legend");
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id) || !STATUSES[id]) continue;
    seen.add(id);
    const row = el("p", "legend__row");
    row.append(el("b", `chip is-${STATUSES[id].kind}`, STATUSES[id].name));
    row.append(el("span", null, ` ${STATUSES[id].help}`));
    list.append(row);
  }
  return list;
}

/* ---------- cards -------------------------------------------------------- */

const TAG = {
  attack: (e) => (e.scale === "defense" ? `ATK =DEF${e.bonus ? `+${e.bonus}` : ""}` : `ATK ${e.amount}`),
  defense: (e) => `DEF ${e.amount}`,
  res: (e) => `+${e.amount} POOL`,
  draw: (e) => `DRAW ${e.amount}`,
  heal: (e) => `HEAL ${e.amount}`,
  poison: (e) => `PSN ${e.amount}`,
  weaken: (e) => `-${e.amount} SWING`,
  thorns: (e) => `THORN ${e.amount}`,
  edge: (e) => `EDGE ${e.amount}`,
  regen: (e) => `REGEN ${e.amount}`,
  flow: (e) => `FLOW ${e.amount}`,
};

/* The rules will not fit on a card the width of a thumb, so the face carries
   the punchline and the inspector carries the sentence. Both come off the
   same effects list. */
function shortTokens(def) {
  if (def.modes) return def.modes.map((m) => (TAG[m.effects[0].kind] || (() => "?"))(m.effects[0]));
  return def.effects.map((e) => (TAG[e.kind] || (() => "?"))(e)).slice(0, 2);
}

export function cardEl(def, { affordable = true, compact = false, resName = "" } = {}) {
  const node = el("button", `card card--${def.type}`);
  node.type = "button";
  if (!affordable) node.classList.add("is-spent");
  if (def.upgraded) node.classList.add("is-upgraded");
  if (compact) node.classList.add("card--compact");
  if (def.modes) node.classList.add("card--modal");

  if (def.cost) {
    const pip = el("span", "card__cost", def.cost);
    pip.title = resName;
    node.append(pip);
  }
  node.append(sprite(def.icon, "card__icon"));
  node.append(el("span", "card__name", def.name));

  const lines = el("span", "card__lines");
  const tokens = shortTokens(def);
  lines.append(el("span", "card__line", def.modes ? tokens.join(" / ") : tokens[0] || ""));
  if (!def.modes && tokens[1]) lines.append(el("span", "card__line", tokens[1]));
  node.append(lines);
  return node;
}

/* A card at a size you can actually read, for the inspect-before-you-commit
   panels. */
export function zoomCard(def, resName) {
  const wrap = el("div", "zoom-card");
  wrap.append(cardEl(def, { resName }));
  const body = el("div", "zoom-card__body");
  body.append(el("h3", "zoom-card__name", def.name));
  body.append(el("p", "zoom-card__kind", def.cost ? `${def.cost} ${resName} · ${def.type}` : def.type));
  body.append(el("p", "zoom-card__text", describe(def, resName)));
  wrap.append(body);
  return wrap;
}

/* ---------- the monster -------------------------------------------------- */

export function foeFace(foe, { big = false } = {}) {
  const wrap = el("div", `foe-face${big ? " foe-face--big" : ""}`);
  const art = el("span", "foe__art");
  art.append(sprite(foe.sprite));
  wrap.append(art);
  wrap.append(el("span", "foe__name", foe.name));
  wrap.append(gauge(foe.hp, foe.maxHp, { kind: "hp" }));
  wrap.append(pools(foe.attack, foe.defense));
  wrap.append(chips(foe.statuses));
  return wrap;
}

/* Attack and Defense are the two numbers a round turns on, so they are always
   on screen for both sides rather than hidden behind an icon. */
export function pools(attack, defense, resource) {
  const row = el("div", "pools");
  row.append(pool("ATK", attack, "atk"));
  row.append(pool("DEF", defense, "def"));
  if (resource) row.append(pool(resource.name.slice(0, 5).toUpperCase(), resource.value, "res"));
  return row;
}

function pool(label, value, kind) {
  const box = el("span", `pool pool--${kind}${value ? " is-live" : ""}`);
  box.append(el("b", null, value));
  box.append(el("span", "pool__label", label));
  return box;
}

/* Its whole deck, which is the only honest way to show a duellist's hand. */
export function foeDeck(list) {
  const wrap = el("div", "foe-deck");
  for (const entry of list) {
    const row = el("div", "foe-deck__row");
    row.append(el("b", null, entry.n > 1 ? `${entry.n}× ${entry.name}` : entry.name));
    row.append(el("span", null, entry.effects.map(effectWords).join(", ")));
    wrap.append(row);
  }
  return wrap;
}

const effectWords = (e) => {
  switch (e.kind) {
    case "attack": return `Attack ${e.amount}`;
    case "defense": return `Defense ${e.amount}`;
    case "poison": return `Poison ${e.amount}`;
    case "heal": return `heals ${e.amount}`;
    case "weaken": return `shaves ${e.amount} off your swing`;
    case "edge": return `Edge ${e.amount}`;
    case "regen": return `Regen ${e.amount}`;
    default: return e.kind;
  }
};

/* ---------- the hero ----------------------------------------------------- */

export function heroStrip(view, { pools: showPools = false, level = null } = {}) {
  const node = el("div", "hero-strip");
  node.append(sprite(view.sprite, "hero-strip__art"));

  const body = el("div", "hero-strip__body");
  const name = el("div", "hero-strip__name");
  name.append(el("span", null, view.name));
  if (level) name.append(el("span", "hero-strip__note", level));
  body.append(name);
  body.append(gauge(view.hp, view.maxHp, { kind: "hp" }));
  if (view.xp) body.append(gauge(view.xp.value, 1, { kind: "xp", label: `XP ${view.xp.label}` }));
  body.append(chips(view.statuses));
  node.append(body);

  if (showPools) node.append(pools(view.attack, view.defense, view.resource));
  else if (view.gold != null) node.append(el("div", "purse", `${view.gold}g`));
  return node;
}

/* The whole round in one line: what your swing does to it, and what its swing
   does to you, with the armour already subtracted. */
export function scales(state) {
  const wrap = el("div", "scales");
  const yours = Math.max(0, state.hero.attack - (state.hero.statuses.soften || 0));
  const lands = Math.max(0, yours - state.foe.defense);
  const theirs = Math.max(0, state.foe.attack - state.hero.defense);

  // Room for the sum, not a sentence: "8−3" beside the number it produced.
  wrap.append(scale(lands, "to it", `${yours}−${state.foe.defense}`,
    lands >= state.foe.hp ? "kills it" : null, "out"));
  wrap.append(scale(theirs, "to you", `${state.foe.attack}−${state.hero.defense}`,
    theirs >= state.hero.hp ? "kills you" : null, "in"));
  return wrap;
}

function scale(value, label, math, warning, kind) {
  const box = el("div", `scale scale--${kind}${warning ? " is-lethal" : ""}`);
  box.append(el("b", null, value));
  box.append(el("span", "scale__label", warning || label));
  box.append(el("span", "scale__math", math));
  return box;
}

/* ---------- the map ------------------------------------------------------ */

export const TILE_ICON = {
  chest: "chest", shop: "coin", altar: "book", fire: "flame", stairs: "stairs",
};

export function tileEl(tile, { hero = false, steppable = false, foeSprite = null }) {
  const node = el("button", `tile tile--${tile.known ? tile.type : "fog"}`);
  node.type = "button";
  node.dataset.x = tile.x;
  node.dataset.y = tile.y;
  if (steppable) node.classList.add("is-near");
  if (hero) node.classList.add("is-hero");

  if (tile.known) {
    if (foeSprite) node.append(sprite(foeSprite, "tile__art"));
    else if (TILE_ICON[tile.type]) node.append(sprite(TILE_ICON[tile.type], "tile__art"));
  }
  return node;
}

/* ---------- feedback ----------------------------------------------------- */

export function floatText(target, text, kind = "hit") {
  if (!target) return;
  const note = el("span", `floater floater--${kind}`, text);
  target.append(note);
  note.addEventListener("animationend", () => note.remove());
  target.classList.add("is-struck");
  setTimeout(() => target.classList.remove("is-struck"), 260);
}

/* ---------- overlay panels -----------------------------------------------

   Panels stack. Inspecting a card from the draft pushes a second panel, and
   backing out of it lands you on the draft again rather than committing you
   to something you only wanted to read. */

const overlay = document.getElementById("overlay");
const panel = document.getElementById("panel");
const stack = [];

function paint() {
  panel.replaceChildren();
  const build = stack[stack.length - 1];
  if (!build) {
    overlay.hidden = true;
    return;
  }
  build(panel);
  overlay.hidden = false;
  panel.scrollTop = 0;
}

export function openPanel(build) {
  stack.push(build);
  paint();
}

export function closePanel() {
  stack.pop();
  paint();
}

export function closeAllPanels() {
  stack.length = 0;
  paint();
}

export const panelOpen = () => stack.length > 0;

export function panelHeader(title, subtitle) {
  const head = el("div", "panel__head");
  head.append(el("h2", "panel__title", title));
  if (subtitle) head.append(el("p", "panel__sub", subtitle));
  return head;
}
