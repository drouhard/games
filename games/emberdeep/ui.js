/* DOM construction and animation primitives.

   Fighter rows and enemy cards are built once per battle and then mutated in
   place, because the animations (shake, dissolve, floating numbers) need
   stable elements to hang off - rebuilding the markup each tick would restart
   every animation mid-flight. */

import { spriteCanvas } from "./sprites.js";
import { STATUSES } from "./data.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function sprite(key) {
  const canvas = spriteCanvas(key);
  canvas.classList.add("sprite");
  return canvas;
}

export function showScreen(name) {
  for (const screen of document.querySelectorAll(".screen")) {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  }
}

function gauge(kind, value, max, showText) {
  const wrap = el("div", `gauge gauge--${kind}`);
  const fill = el("div", "gauge__fill");
  wrap.append(fill);
  if (showText) wrap.append(el("div", "gauge__text"));
  setGauge(wrap, value, max);
  return wrap;
}

export function setGauge(wrap, value, max) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  wrap.querySelector(".gauge__fill").style.width = `${ratio * 100}%`;
  const text = wrap.querySelector(".gauge__text");
  if (text) text.textContent = `${Math.max(0, Math.round(value))}/${max}`;
  wrap.classList.toggle("is-hurt", ratio <= 0.5 && ratio > 0.2);
  wrap.classList.toggle("is-critical", ratio <= 0.2);
}

function statusChips(container, fighter) {
  container.replaceChildren();
  for (const status of fighter.statuses) {
    const def = STATUSES[status.type];
    const chip = el("span", `chip is-${def.kind}`, `${def.name} ${status.turns}`);
    container.append(chip);
  }
}

/* ---------- party rows ---------- */

/* Used on both the camp screen and in battle. In battle the row is a button so
   it can be tapped as a heal/revive target; in camp it's inert. */
export function memberRow(fighter, { level, interactive } = {}) {
  const row = el(interactive ? "button" : "div", "member");
  if (interactive) row.type = "button";
  row.dataset.uid = fighter.uid || "";

  row.append(sprite(fighter.sprite));

  const body = el("div");
  const name = el("div", "member__name");
  name.append(el("span", null, fighter.name));
  if (level != null) name.append(el("span", "member__level", `Lv ${level}`));
  body.append(name);

  const bars = el("div", "member__bars");
  const hp = gauge("hp", fighter.hp, fighter.maxHp, true);
  const mp = gauge("mp", fighter.mp, fighter.maxMp, true);
  bars.append(hp, mp);
  body.append(bars);

  const chips = el("div", "chips");
  body.append(chips);
  row.append(body);

  row._refs = { hp, mp, chips, name };
  updateMember(row, fighter);
  return row;
}

export function updateMember(row, fighter) {
  setGauge(row._refs.hp, fighter.hp, fighter.maxHp);
  setGauge(row._refs.mp, fighter.mp, fighter.maxMp);
  statusChips(row._refs.chips, fighter);
  row.classList.toggle("is-down", !fighter.alive);
}

/* ---------- enemy cards ---------- */

export function foeCard(fighter) {
  const card = el("button", "foe");
  card.type = "button";
  card.dataset.uid = fighter.uid;
  if (fighter.boss) card.classList.add("is-boss");

  const art = sprite(fighter.sprite);
  const hp = gauge("hp", fighter.hp, fighter.maxHp, false);
  const chips = el("div", "chips");

  card.append(art, el("div", "foe__name", fighter.name), hp, chips);
  card._refs = { hp, chips, art };
  return card;
}

export function updateFoe(card, fighter) {
  setGauge(card._refs.hp, fighter.hp, fighter.maxHp);
  statusChips(card._refs.chips, fighter);
}

/* ---------- feedback ---------- */

export function floatText(anchor, text, kind) {
  if (!anchor) return;
  const node = el("div", `float${kind ? ` is-${kind}` : ""}`, text);
  // The card is position:relative, so the number rides along with any shake.
  anchor.append(node);
  node.addEventListener("animationend", () => node.remove());
}

export function flash(element, className) {
  if (!element) return;
  element.classList.remove(className);
  // Force a reflow so the same animation can retrigger on consecutive hits.
  void element.offsetWidth;
  element.classList.add(className);
  element.addEventListener(
    "animationend",
    () => element.classList.remove(className),
    { once: true }
  );
}

export function setLog(text) {
  document.getElementById("log").textContent = text;
}

/* ---------- overlay ---------- */

const overlay = () => document.getElementById("overlay");

export function openPanel(build) {
  const panel = document.getElementById("panel");
  panel.replaceChildren();
  build(panel);
  overlay().hidden = false;
}

export function closePanel() {
  overlay().hidden = true;
}

export function isPanelOpen() {
  return !overlay().hidden;
}
