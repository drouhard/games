/* Everything that touches the browser: the frame loop, the sprites on the
   stage, the thumbs on the buttons, and the save. The rules live in
   engine.js and the numbers in data.js, and neither knows this file exists.

   The loop runs the engine in fixed 1/60 steps and renders once per frame, so
   a stutter or a slow phone changes how smooth the fight looks but never how
   it plays - and it is the same step count tools/climb-sim.mjs uses. */

import { TUNING, UPGRADES, costOf, stats, foeAt, relicsFor, newSave, fmt, fmtTime } from "./data.js";
import * as engine from "./engine.js";
import { spriteCanvas } from "./sprites.js";

const SAVE_KEY = "stickclimb:save";
const $ = (id) => document.getElementById(id);

const dom = {
  rung: $("hud-rung"), scrap: $("hud-scrap"), relics: $("hud-relics"), relicCount: $("hud-relic-count"),
  shopReady: $("shop-ready"), foeName: $("foe-name"), foeBar: $("foe-bar"), foeHp: $("foe-hp"),
  heroBar: $("hero-bar"), heroHp: $("hero-hp"), heroPlate: document.querySelector(".bar--hero"),
  momentum: $("momentum"), stage: $("stage"), hero: $("hero"), foe: $("foe"),
  hazards: $("hazards"), floaters: $("floaters"), banner: $("banner"),
  overlay: $("overlay"), sheet: $("sheet"),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------- save --------------------------------------------------------- */

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    // Guard against a save written by an older, differently-shaped version.
    if (typeof save?.best !== "number" || !save.levels) return null;
    return { ...newSave(), ...save, levels: { ...newSave().levels, ...save.levels } };
  } catch (error) {
    return null;
  }
}

// localStorage throws in some private-browsing modes; the climb should still
// be playable, it just won't be there tomorrow.
function persist() {
  save.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (error) {
    /* play on, unsaved */
  }
}

const stored = load();
const save = stored ?? newSave();

/* ---------- the cast ----------------------------------------------------- */

const POSES = ["heroIdle", "heroStrike", "heroAir", "heroSlide", "heroHurt"];
const poseNodes = {};
for (const key of POSES) {
  const canvas = spriteCanvas(key);
  dom.hero.append(canvas);
  poseNodes[key] = canvas;
}
poseNodes.heroIdle.classList.add("is-on");
let shownPose = "heroIdle";

let foeSprite = null;
function dressFoe(index) {
  const key = foeAt(index).sprite;
  if (foeSprite === key) return;
  foeSprite = key;
  dom.foe.replaceChildren(spriteCanvas(key));
  dom.foe.firstChild.classList.add("is-on");
}

for (let i = 0; i < TUNING.momentumCap; i++) dom.momentum.append(el("b"));

/* ---------- rounds ------------------------------------------------------- */

let fight = null;
let gap = 0; // seconds until the next foe steps in
let pending = null; // what to do when the gap runs out
let paused = false; // a sheet is open

function beginRound(index = save.target) {
  save.target = index;
  dressFoe(index);
  fight = engine.startFight(save, index);
  dom.foeName.textContent = `${index + 1} · ${fight.foe.name}`;
  dom.banner.hidden = true;
  dom.hazards.replaceChildren();
  hazardNodes.clear();
  gap = 0;
  pending = null;
}

function endRound(outcome) {
  if (outcome === "won") {
    const { gain, firstClear } = engine.resolveWin(save, fight.foe.index);
    banner(`${fight.foe.name} down · <b>+${fmt(gain)}</b> scrap`);
    if (firstClear && save.best + 1 === TUNING.ascendAt + 1) {
      // Ascend has just unlocked; say so once rather than hiding it in a menu.
      banner(`Rung ${save.best + 1} cleared · <b>Ascend</b> unlocked`);
    }
    pending = save.target; // resolveWin moves the target on after a first clear
    gap = TUNING.roundGap;
  } else {
    banner("Down. Shake it off — you keep everything.");
    pending = fight.foe.index;
    gap = TUNING.roundGap * 1.4;
  }
  persist();
}

function banner(html) {
  dom.banner.innerHTML = html;
  dom.banner.hidden = false;
}

/* ---------- the loop ----------------------------------------------------- */

let carry = 0;
let last = performance.now();
let sinceSave = 0;

function tick(dt) {
  if (gap > 0) {
    gap -= dt;
    if (gap <= 0) beginRound(pending ?? save.target);
    return;
  }
  engine.step(fight, save, Math.random, dt);
  for (const event of engine.drainEvents(fight)) react(event);
  if (fight.over) endRound(fight.over);
}

function frame(now) {
  requestAnimationFrame(frame);
  // A backgrounded tab hands back one enormous delta; clamping it means the
  // fight resumes rather than fast-forwarding through an unseen death.
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) {
    carry += dt;
    let guard = 0;
    while (carry >= engine.STEP && guard++ < 8) {
      carry -= engine.STEP;
      tick(engine.STEP);
    }
    sinceSave += dt;
    if (sinceSave > 5) {
      sinceSave = 0;
      persist();
    }
  }
  render();
}

/* ---------- reactions ---------------------------------------------------- */

function react(event) {
  if (event.type === "hit" && event.source === "strike") {
    dom.foe.classList.remove("is-struck");
    void dom.foe.offsetWidth; // restart the flash even on back-to-back hits
    dom.foe.classList.add("is-struck");
    floater(fmt(event.amount), "hit", 0.72);
  } else if (event.type === "hit" && event.source === "heavy") {
    floater(fmt(event.amount), "heavy", 0.72);
  } else if (event.type === "hurt") {
    floater(`-${fmt(event.amount)}`, "hurt", 0.13);
  } else if (event.type === "dodge") {
    floater("dodge!", "dodge", 0.13);
  }
}

function floater(text, kind, atX) {
  const node = el("span", `floater floater--${kind}`, text);
  node.style.left = `${atX * 100}%`;
  node.style.bottom = `calc(var(--ground) + var(--figure) * 0.7)`;
  node.addEventListener("animationend", () => node.remove());
  dom.floaters.append(node);
}

/* ---------- render ------------------------------------------------------- */

const hazardNodes = new Map();

function pose(key) {
  if (key === shownPose) return;
  poseNodes[shownPose].classList.remove("is-on");
  poseNodes[key].classList.add("is-on");
  shownPose = key;
}

function render() {
  const st = stats(save);

  dom.rung.textContent = save.target + 1;
  dom.scrap.textContent = fmt(save.scrap);
  dom.relics.hidden = save.relics === 0;
  dom.relicCount.textContent = save.relics;
  dom.shopReady.hidden = !UPGRADES.some((u) => save.scrap >= costOf(u.id, save.levels[u.id]));

  const foeRatio = fight ? fight.foe.hp / fight.foe.maxHp : 0;
  dom.foeBar.style.transform = `scaleX(${Math.max(0, foeRatio)})`;
  dom.foeHp.textContent = fight ? `${fmt(fight.foe.hp)} / ${fmt(fight.foe.maxHp)}` : "";

  const heroRatio = fight ? fight.hp / fight.maxHp : 1;
  dom.heroBar.style.transform = `scaleX(${Math.max(0, heroRatio)})`;
  dom.heroHp.textContent = fight ? `${fmt(fight.hp)} / ${fmt(fight.maxHp)}` : "";
  dom.heroPlate.classList.toggle("is-hurt", heroRatio <= 0.5 && heroRatio > 0.25);
  dom.heroPlate.classList.toggle("is-critical", heroRatio <= 0.25);

  const pips = dom.momentum.children;
  for (let i = 0; i < pips.length; i++) {
    pips[i].classList.toggle("is-lit", fight ? i < fight.momentum : false);
  }

  if (!fight) return;

  // --- the figure ---
  const stageHeight = dom.stage.clientHeight;
  let lift = 0;
  if (fight.stance === "air") {
    pose("heroAir");
    const through = 1 - fight.stanceT / st.airTime;
    lift = Math.sin(Math.max(0, Math.min(1, through)) * Math.PI) * stageHeight * 0.24;
  } else if (fight.stance === "slide") {
    pose("heroSlide");
  } else if (fight.stance === "hurt") {
    pose("heroHurt");
  } else {
    pose(fight.swing > 0 ? "heroStrike" : "heroIdle");
  }
  const shove = fight.stance === "hurt" ? -stageHeight * 0.03 : 0;
  dom.hero.style.transform = `translate(${shove}px, ${-lift}px)`;

  // --- hazards ---
  const width = dom.stage.clientWidth;
  const seen = new Set();
  for (const hazard of fight.hazards) {
    seen.add(hazard);
    let node = hazardNodes.get(hazard);
    if (!node) {
      node = el("div", `hazard hazard--${hazard.kind}`);
      hazardNodes.set(hazard, node);
      dom.hazards.append(node);
    }
    // p is 0 at the foe and 1 at the hero; the slab spans that gap.
    const x = width * (0.72 - hazard.p * 0.58);
    node.style.transform = `translateX(${x}px)`;
  }
  for (const [hazard, node] of hazardNodes) {
    if (!seen.has(hazard)) {
      node.remove();
      hazardNodes.delete(hazard);
    }
  }

  // --- buttons ---
  paint("strike", fight.cd.strike / TUNING.strikeCd, false);
  paint("heavy", fight.cd.heavy / TUNING.heavyCd, fight.momentum > 0 && fight.cd.heavy <= 0);
  paint("focus", fight.cd.focus / TUNING.focusCd, fight.focusT > 0);
}

const actButtons = {};
for (const button of document.querySelectorAll(".act")) actButtons[button.dataset.act] = button;

function paint(act, cooldown, live) {
  const button = actButtons[act];
  button.firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, cooldown))})`;
  button.classList.toggle(act === "heavy" ? "is-ready" : "is-live", live);
  button.classList.toggle("is-spent", act === "heavy" && fight && fight.momentum === 0);
}

/* ---------- input -------------------------------------------------------- */

function act(kind) {
  if (!fight || paused || gap > 0) return;
  engine.input(fight, save, kind);
  for (const event of engine.drainEvents(fight)) react(event);
}

for (const button of document.querySelectorAll("[data-act]")) {
  // pointerdown, not click: a dodge decided on the release of a tap is a
  // dodge that already failed.
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    act(button.dataset.act);
  });
}

const KEYS = {
  ArrowUp: "jump", w: "jump", W: "jump",
  ArrowDown: "slide", s: "slide", S: "slide",
  " ": "strike", j: "strike", J: "strike",
  k: "heavy", K: "heavy",
  l: "focus", L: "focus",
};

addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const kind = KEYS[event.key];
  if (!kind) return;
  event.preventDefault();
  act(kind);
});

/* ---------- sheets ------------------------------------------------------- */

let redrawSheet = null;

function openSheet(build) {
  paused = true;
  redrawSheet = () => {
    // Buying redraws the whole sheet; without carrying the scroll across, the
    // list snaps back to the top under your thumb after every purchase.
    const was = dom.sheet.querySelector(".sheet__list")?.scrollTop ?? 0;
    dom.sheet.replaceChildren(...build());
    const list = dom.sheet.querySelector(".sheet__list");
    if (list) list.scrollTop = was;
  };
  redrawSheet();
  dom.overlay.hidden = false;
}

function closeSheet() {
  dom.overlay.hidden = true;
  redrawSheet = null;
  paused = false;
  last = performance.now(); // don't credit the engine for time spent shopping
  carry = 0;
}

dom.overlay.addEventListener("pointerdown", (event) => {
  if (event.target === dom.overlay) closeSheet();
});

function sheetBar(title, extra) {
  const bar = el("div", "sheet__bar");
  bar.append(el("span", "sheet__title", title));
  if (extra) bar.append(extra);
  const close = el("button", "icon-button", "✕");
  close.type = "button";
  close.addEventListener("pointerdown", closeSheet);
  bar.append(close);
  return bar;
}

function gearSheet() {
  const list = el("div", "sheet__list");
  for (const up of UPGRADES) {
    const level = save.levels[up.id];
    const cost = costOf(up.id, level);
    const maxed = !isFinite(cost);
    const row = el("button", "buy");
    row.type = "button";
    row.disabled = maxed || save.scrap < cost;
    row.classList.toggle("is-affordable", !maxed && save.scrap >= cost);

    const body = el("span");
    body.append(el("span", "buy__name", up.name), el("span", "buy__blurb", up.blurb));
    if (level > 0 || maxed) body.append(el("span", "buy__level", maxed ? `maxed · lv ${level}` : `lv ${level}`));
    for (const child of body.children) child.style.display = "block";

    row.append(el("span", "buy__icon", up.icon), body, el("span", "buy__cost", maxed ? "—" : fmt(cost)));
    row.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (row.disabled) return;
      save.scrap -= cost;
      save.levels[up.id] += 1;
      // Health bought mid-fight lands in this fight, not the next one, and it
      // arrives full: paying for ribs and getting a longer empty bar would
      // read as the purchase having done nothing.
      if (fight) {
        const grown = stats(save).maxHp;
        fight.hp += grown - fight.maxHp;
        fight.maxHp = grown;
      }
      persist();
      redrawSheet();
    });
    list.append(row);
  }

  const parts = [sheetBar("Gear", el("span", "sheet__scrap", `${fmt(save.scrap)} scrap`)), list];

  const relicsWaiting = relicsFor(save.best);
  if (relicsWaiting > 0 || save.relics > 0) {
    const ascend = el("button", "big-button big-button--go", `Ascend · +${relicsWaiting} ◈`);
    ascend.type = "button";
    ascend.disabled = relicsWaiting <= 0;
    ascend.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!ascend.disabled) openSheet(ascendSheet);
    });
    parts.push(ascend);
  }

  const back = el("a", "link-back", "‹ All games");
  back.href = "../../";
  parts.push(back);
  return parts;
}

function foesSheet() {
  const list = el("div", "sheet__list");
  const frontier = save.best + 1;
  for (let index = 0; index <= frontier; index++) {
    const foe = foeAt(index);
    const row = el("button", "rung");
    row.type = "button";
    row.classList.toggle("is-current", index === save.target);
    row.classList.toggle("is-frontier", index === frontier);

    const art = el("span", "rung__art");
    art.append(spriteCanvas(foe.sprite));
    const body = el("span");
    body.append(
      el("span", "rung__name", `${index + 1} · ${foe.name}`),
      el("span", "rung__stat", `${fmt(foe.maxHp)} hp · hits for ${fmt(foe.hit)}`),
    );
    for (const child of body.children) child.style.display = "block";

    const pay = fmt(foe.bounty * stats(save).scrapMult);
    row.append(art, body, el("span", "rung__pay", index === frontier && index > save.best ? "new" : `${pay} ⌁`));
    row.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      closeSheet();
      beginRound(index);
    });
    list.append(row);
  }
  // The newest rung pays best, so the list opens at the bottom.
  queueMicrotask(() => { list.scrollTop = list.scrollHeight; });

  return [
    sheetBar("Ladder"),
    list,
    el("p", "sheet__note", "Any rung you have cleared can be fought again for its scrap. The deeper the rung, the better it pays."),
  ];
}

function ascendSheet() {
  const gain = relicsFor(save.best);
  const note = el("p", "sheet__note");
  note.textContent =
    `Give up your scrap, your gear and the whole ladder for ${gain} relic${gain === 1 ? "" : "s"}. ` +
    `Relics are permanent: each one adds 35% to every scrap drop, for good. ` +
    `You would restart at rung 1 with ${save.relics + gain} relic${save.relics + gain === 1 ? "" : "s"} — ` +
    `worth ${fmt(1 + TUNING.relicBonus * (save.relics + gain))}x scrap on every kill.`;

  const go = el("button", "big-button big-button--go", `Ascend · +${gain} ◈`);
  go.type = "button";
  go.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const kept = { relics: save.relics + gain, ascends: save.ascends + 1, kills: save.kills };
    Object.assign(save, newSave(), kept);
    persist();
    closeSheet();
    beginRound(0);
    banner(`Ascended · <b>${save.relics} ◈</b>`);
  });

  const back = el("button", "big-button", "Not yet");
  back.type = "button";
  back.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    openSheet(gearSheet);
  });

  const actions = el("div", "sheet__actions");
  actions.append(back, go);
  return [sheetBar("Ascend"), note, actions];
}

function welcomeSheet(gains) {
  const note = el("p", "sheet__note");
  note.textContent =
    `Your Shadow Twin kept working for ${fmtTime(gains.seconds)}: ${fmt(gains.kills)} ` +
    `${gains.foe.name}${gains.kills === 1 ? "" : "s"} put down, ${fmt(gains.scrap)} scrap banked.`;
  const go = el("button", "big-button big-button--go", "Carry on");
  go.type = "button";
  go.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    closeSheet();
  });
  return [sheetBar("While you were out"), note, go];
}

function introSheet() {
  const note = el("p", "sheet__note");
  note.innerHTML =
    "Foes throw two things at you. A <b style='color:var(--low)'>low</b> slab is jumped; " +
    "a <b style='color:var(--high)'>high</b> slab is slid under. The buttons wear the same colours.<br><br>" +
    "Every clean dodge banks a point of momentum, and <b>Heavy</b> spends the lot in one punch. " +
    "Losing costs you nothing but the time — you keep every upgrade and retry at full health.";
  const go = el("button", "big-button big-button--go", "Climb");
  go.type = "button";
  go.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    closeSheet();
  });
  return [sheetBar("Stickclimb"), note, go];
}

$("btn-shop").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  openSheet(gearSheet);
});
$("btn-foes").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  openSheet(foesSheet);
});

/* ---------- coming and going --------------------------------------------- */

/* rAF stops in a backgrounded tab, so time away is settled up here rather
   than simulated: the twin grinds the rung you left it on, at a discount. */
function settleTimeAway() {
  if (!save.lastSeen) return;
  const away = (Date.now() - save.lastSeen) / 1000;
  const gains = engine.offlineGains(save, away);
  if (!gains) return;
  save.scrap += gains.scrap;
  save.kills += gains.kills;
  persist();
  openSheet(() => welcomeSheet(gains));
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    persist();
  } else {
    settleTimeAway();
    last = performance.now();
    carry = 0;
  }
});

addEventListener("pagehide", persist);

beginRound(Math.min(save.target, save.best + 1));
requestAnimationFrame(frame);

if (!stored) openSheet(introSheet);
else settleTimeAway();
