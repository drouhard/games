/* Rendering helpers. Everything here builds DOM and knows nothing about the
   rules - it is handed plain values and returns elements, which keeps game.js
   readable and keeps combat.js free of any of this. */

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

/* ---------- bars and chips ---------------------------------------------- */

export function gauge(value, max, { kind = "hp", label } = {}) {
  const wrap = el("div", `gauge gauge--${kind}`);
  const ratio = max > 0 ? Math.max(0, value) / max : 0;
  if (kind === "hp") {
    if (ratio <= 0.25) wrap.classList.add("is-critical");
    else if (ratio <= 0.5) wrap.classList.add("is-hurt");
  }
  const fill = el("div", "gauge__fill");
  fill.style.width = `${Math.round(ratio * 100)}%`;
  wrap.append(fill, el("span", "gauge__text", label ?? `${Math.max(0, value)}/${max}`));
  return wrap;
}

export function chips(statuses, block) {
  const row = el("div", "chips");
  if (block > 0) row.append(el("span", "chip chip--block", `⛨ ${block}`));
  for (const [status, amount] of Object.entries(statuses || {})) {
    if (!amount) continue;
    const info = STATUSES[status];
    row.append(el("span", `chip is-${info.kind}`, `${info.name} ${amount}`));
  }
  return row;
}

/* ---------- cards -------------------------------------------------------- */

const STATUS_TAG = {
  weak: "WEAK", vulnerable: "VULN", poison: "PSN", strength: "STR",
  thorns: "THN", regen: "REG", rampart: "RMPT", surge: "SURGE",
};

/* The whole rules text will not fit on a card the width of a thumb, so the
   face carries the punchline and the detail line under the hand carries the
   sentence. Both come off the same effects list. */
function shortTokens(def) {
  const tokens = [];
  for (const e of def.effects) {
    switch (e.kind) {
      case "damage":
        tokens.push(
          e.scale === "block"
            ? `DMG =⛨${e.bonus ? `+${e.bonus}` : ""}`
            : `DMG ${e.amount}${e.times > 1 ? `×${e.times}` : ""}${e.all ? " ALL" : ""}`
        );
        break;
      case "block": tokens.push(`BLOCK ${e.amount}`); break;
      case "draw": tokens.push(`DRAW ${e.amount}`); break;
      case "energy": tokens.push(`+${e.amount} NRG`); break;
      case "heal": tokens.push(`HEAL ${e.amount}`); break;
      case "status": tokens.push(`${STATUS_TAG[e.status]} ${e.amount}${e.all ? " ALL" : ""}`); break;
      case "buff": tokens.push(`${STATUS_TAG[e.status]} +${e.amount}`); break;
    }
  }
  return tokens.slice(0, 2);
}

export function cardEl(def, { affordable = true, selected = false, compact = false } = {}) {
  const node = el("button", `card card--${def.type}`);
  node.type = "button";
  if (!affordable) node.classList.add("is-spent");
  if (selected) node.classList.add("is-selected");
  if (def.upgraded) node.classList.add("is-upgraded");
  if (compact) node.classList.add("card--compact");

  node.append(el("span", "card__cost", def.cost));
  node.append(sprite(def.icon, "card__icon"));
  node.append(el("span", "card__name", def.name));

  const lines = el("span", "card__lines");
  for (const token of shortTokens(def)) lines.append(el("span", "card__line", token));
  if (def.exhaust) lines.append(el("span", "card__line card__line--quiet", "EXHAUST"));
  node.append(lines);
  return node;
}

export const cardText = (def) => describe(def);

/* ---------- monsters ----------------------------------------------------- */

const INTENT_ICON = { attack: "sword", block: "shield", status: "fang", buff: "flame" };

export function foeEl(enemy, intent, { targetable = false } = {}) {
  const node = el("button", "foe");
  node.type = "button";
  node.dataset.uid = enemy.uid;
  if (enemy.boss) node.classList.add("is-boss");
  if (targetable) node.classList.add("is-targetable");
  if (!enemy.alive) node.classList.add("is-dead");

  const tell = el("span", "intent");
  if (intent) {
    tell.append(sprite(INTENT_ICON[intent.kind] || "book", "intent__icon"));
    if (intent.kind === "attack") {
      tell.append(el("b", null, `${intent.amount}${intent.times > 1 ? `×${intent.times}` : ""}`));
    } else if (intent.kind === "block") {
      tell.append(el("b", null, intent.amount));
    } else {
      const status = STATUSES[intent.status];
      tell.append(el("b", null, status ? `${status.name} ${intent.amount}` : "?"));
    }
  }
  node.append(tell);

  const art = el("span", "foe__art");
  art.append(sprite(enemy.sprite));
  node.append(art);
  node.append(el("span", "foe__name", enemy.name));
  node.append(gauge(enemy.hp, enemy.maxHp, { kind: "hp" }));
  node.append(chips(enemy.statuses, enemy.block));
  return node;
}

/* ---------- the hero strip ----------------------------------------------- */

export function heroStrip(hero, { energy, maxEnergy, note } = {}) {
  const node = el("div", "hero-strip");
  node.append(sprite(hero.sprite, "hero-strip__art"));

  const body = el("div", "hero-strip__body");
  const name = el("div", "hero-strip__name");
  name.append(el("span", null, hero.name));
  if (note) name.append(el("span", "hero-strip__note", note));
  body.append(name);
  body.append(gauge(hero.hp, hero.maxHp, { kind: "hp" }));
  body.append(chips(hero.statuses, hero.block));
  node.append(body);

  if (energy != null) {
    node.append(el("div", "orb", `${energy}/${maxEnergy}`));
  }
  return node;
}

/* ---------- feedback ----------------------------------------------------- */

/* A number that floats off whoever it happened to. Cheap, and it is the only
   way a phone-sized fight reads as cause and effect rather than numbers
   quietly changing. */
export function floatText(target, text, kind = "hit") {
  if (!target) return;
  const note = el("span", `floater floater--${kind}`, text);
  target.append(note);
  note.addEventListener("animationend", () => note.remove());
  target.classList.add("is-struck");
  setTimeout(() => target.classList.remove("is-struck"), 260);
}

/* ---------- overlay panels ----------------------------------------------- */

const overlay = document.getElementById("overlay");
const panel = document.getElementById("panel");

export function openPanel(build) {
  panel.replaceChildren();
  build(panel);
  overlay.hidden = false;
  overlay.classList.add("is-open");
}

export function closePanel() {
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  panel.replaceChildren();
}

export function panelHeader(title, subtitle) {
  const head = el("div", "panel__head");
  head.append(el("h2", "panel__title", title));
  if (subtitle) head.append(el("p", "panel__sub", subtitle));
  return head;
}
