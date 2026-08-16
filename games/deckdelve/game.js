/* The controller: screens, input, and animation timing.

   Everything with a rule in it lives in combat.js and run.js; this file only
   decides what is on screen and what a tap means. */

import { CLASSES, ENEMIES, FLOORS, NODES_PER_FLOOR, STATUSES, UNLOCKS, cardDef } from "./data.js";
import * as combat from "./combat.js";
import * as run from "./run.js";
import * as ui from "./ui.js";

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let meta = run.loadMeta();
let current = null; // the run in progress
let fight = null; // the combat state, while a fight is on
let node = null; // which path node this fight belongs to
let selected = null; // index into the hand
let busy = false; // true while the monsters are taking their turn

const fighterNodes = new Map();

/* ---------- title -------------------------------------------------------- */

function showTitle() {
  const saved = run.loadRun();
  $("btn-continue").hidden = !saved;
  ui.showScreen("title");
}

function buildTitleArt() {
  const art = $("title-art");
  art.replaceChildren(...CLASSES.map((cls) => ui.sprite(cls.sprite)));
}

/* ---------- sanctum ------------------------------------------------------ */

function showSanctum() {
  $("sanctum-echoes").textContent = meta.echoes;
  $("sanctum-stats").textContent = meta.runs
    ? `${meta.runs} run${meta.runs === 1 ? "" : "s"}, ${meta.wins} cleared. Echoes are spent here and never lost.`
    : "Echoes come back from every run, won or lost. Spend them here.";

  const list = $("unlock-list");
  list.replaceChildren();
  for (const unlock of UNLOCKS) {
    const owned = run.hasUnlock(meta, unlock.id);
    const affordable = meta.echoes >= unlock.cost;
    const row = ui.el("button", "unlock");
    row.type = "button";
    if (owned) row.classList.add("is-owned");
    else if (!affordable) row.classList.add("is-locked");

    const head = ui.el("div", "unlock__head");
    head.append(ui.el("span", "unlock__name", unlock.name));
    head.append(ui.el("span", "unlock__cost", owned ? "held" : `${unlock.cost} ✦`));
    row.append(head);
    row.append(ui.el("p", "unlock__desc", unlock.desc));

    if (!owned) {
      row.addEventListener("pointerdown", () => {
        if (!run.buyUnlock(meta, unlock.id)) return;
        run.saveMeta(meta);
        showSanctum();
      });
    }
    list.append(row);
  }
  ui.showScreen("sanctum");
}

/* ---------- choosing a class --------------------------------------------- */

function showPick() {
  const list = $("class-list");
  list.replaceChildren();

  for (const cls of CLASSES) {
    const locked = run.classIsLocked(cls, meta);
    const card = ui.el("button", "pick");
    card.type = "button";
    if (locked) card.classList.add("is-locked");
    card.append(ui.sprite(cls.sprite, "pick__art"));

    const body = ui.el("div", "pick__body");
    const head = ui.el("div", "pick__head");
    head.append(ui.el("span", "pick__name", cls.name));
    head.append(ui.el("span", "pick__stat", locked
      ? `Locked · ${run.unlockCost(cls.unlock)} ✦`
      : `${cls.maxHp + (run.hasUnlock(meta, "vigor") ? 8 : 0)} HP · ${cls.energy || 3} energy`));
    body.append(head);
    body.append(ui.el("p", "pick__blurb", cls.blurb));
    card.append(body);

    if (!locked) card.addEventListener("pointerdown", () => startRun(cls.id));
    list.append(card);
  }
  ui.showScreen("pick");
}

function startRun(classId) {
  current = run.newRun(classId, meta);
  run.saveRun(current);
  showPath();
}

/* ---------- the path ----------------------------------------------------- */

function heroView() {
  const cls = run.classById(current.classId);
  return { name: cls.name, sprite: cls.sprite, hp: current.hp, maxHp: current.maxHp, statuses: {}, block: 0 };
}

function showPath() {
  if (!current.options) run.rollOptions(current);
  run.saveRun(current);

  const floor = FLOORS[current.floor];
  $("path-title").textContent = `${floor.name} · ${Math.min(current.node + 1, NODES_PER_FLOOR + 1)}/${NODES_PER_FLOOR + 1}`;
  $("deck-count").textContent = current.deck.length;
  $("path-hero").replaceChildren(ui.heroStrip(heroView(), { note: `Floor ${current.floor + 1}` }));

  const boss = current.options.length === 1;
  $("path-prompt").textContent = boss ? "Nothing left but the keeper." : "Two ways on. Pick one.";

  const options = $("path-options");
  options.replaceChildren();
  for (const option of current.options) {
    const info = run.NODE_INFO[option.type];
    const button = ui.el("button", `door door--${option.type}`);
    button.type = "button";
    button.append(ui.el("span", "door__icon", info.icon));

    const body = ui.el("span", "door__body");
    const label = option.type === "boss" ? ENEMIES[option.enemies[0]].name : info.label;
    body.append(ui.el("span", "door__label", label));
    // Name the monsters rather than repeating "a room with monsters in it" -
    // knowing it is two Motes and not a Hexer is the whole choice.
    body.append(ui.el("span", "door__desc", option.enemies ? foeList(option.enemies) : info.desc));
    button.append(body);

    if (option.enemies) {
      const foes = ui.el("span", "door__foes");
      for (const key of option.enemies) foes.append(ui.sprite(ENEMIES[key].sprite));
      button.append(foes);
    }
    button.addEventListener("pointerdown", () => takeNode(option));
    options.append(button);
  }
  ui.showScreen("path");
}

function foeList(keys) {
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  return [...counts]
    .map(([key, n]) => (n > 1 ? `${n}× ${ENEMIES[key].name}` : ENEMIES[key].name))
    .join(", ");
}

function takeNode(option) {
  node = option;
  if (option.type === "rest") return openCamp();
  if (option.type === "shrine") return openShrine();
  startFight(option);
}

/* ---------- fights ------------------------------------------------------- */

function startFight(option) {
  const cls = run.classById(current.classId);
  fight = combat.startCombat({
    hero: {
      name: cls.name, sprite: cls.sprite,
      hp: current.hp, maxHp: current.maxHp, maxEnergy: current.energy,
    },
    deck: current.deck,
    enemies: option.enemies,
    extraDraw: run.hasUnlock(meta, "reserve") ? 1 : 0,
  });
  selected = null;
  busy = false;
  setLog(option.type === "boss" ? "The keeper turns to face you." : "");
  render();
  ui.showScreen("battle");
}

function setLog(text) {
  $("battle-log").textContent = text;
}

function render() {
  if (!fight) return;
  fighterNodes.clear();

  const floor = FLOORS[current.floor];
  $("battle-title").textContent = node.type === "boss" ? floor.name : run.NODE_INFO[node.type].label;
  $("battle-turn").textContent = fight.turn;

  const row = $("enemy-row");
  row.replaceChildren();
  const needsTarget = selected != null && combat.needsTarget(fight.hand[selected]);
  for (const enemy of fight.enemies) {
    if (!enemy.alive) continue;
    const element = ui.foeEl(enemy, combat.intentPreview(enemy), { targetable: needsTarget });
    element.addEventListener("pointerdown", () => tapEnemy(enemy.uid));
    fighterNodes.set(enemy.uid, element);
    row.append(element);
  }

  const heroNode = ui.heroStrip(fight.hero, { energy: fight.hero.energy, maxEnergy: fight.hero.maxEnergy });
  fighterNodes.set("hero", heroNode);
  $("battle-hero").replaceChildren(heroNode);

  const hand = $("hand");
  hand.replaceChildren();
  fight.hand.forEach((card, index) => {
    const def = combat.defOf(card);
    const element = ui.cardEl(def, {
      affordable: fight.hero.energy >= def.cost,
      selected: selected === index,
    });
    element.addEventListener("pointerdown", () => tapCard(index));
    hand.append(element);
  });
  fanHand(hand);

  $("card-detail").textContent = selected != null
    ? ui.cardText(combat.defOf(fight.hand[selected]))
    : "";
  $("pile-draw").textContent = fight.draw.length;
  $("pile-discard").textContent = fight.discard.length;
  $("btn-end-turn").disabled = busy || !!fight.over;
}

/* Overlaps the cards just enough that the whole hand fits the screen. Ten
   cards on a 375px phone is a real hand, not an edge case - Insight and
   Prepare draw into one routinely. */
function fanHand(hand) {
  hand.style.removeProperty("--card-w");
  hand.style.setProperty("--overlap", "0px");
  const count = hand.children.length;
  if (count < 2) return;

  const gap = parseFloat(getComputedStyle(hand).columnGap) || 0;
  const room = hand.clientWidth;
  const span = (width) => count * width + (count - 1) * gap;

  // Narrow the cards first, down to a floor where the cost pip and the icon
  // are still legible, and only overlap for whatever is left over.
  let width = hand.children[0].offsetWidth;
  if (span(width) > room) {
    width = Math.max(44, Math.floor((room - (count - 1) * gap) / count));
    hand.style.setProperty("--card-w", `${width}px`);
  }
  const spill = span(width) - room;
  if (spill > 0) hand.style.setProperty("--overlap", `-${Math.ceil(spill / (count - 1))}px`);
}

function tapCard(index) {
  if (busy || !fight || fight.over) return;
  if (selected === index) { selected = null; return render(); }

  const card = fight.hand[index];
  if (!combat.canPlay(fight, card)) {
    selected = null;
    setLog("Not enough energy.");
    return render();
  }

  if (combat.needsTarget(card)) {
    const alive = combat.livingEnemies(fight);
    selected = index;
    // One monster left means there is nothing to choose - just swing.
    if (alive.length === 1) return playSelected(alive[0].uid);
    render();
    return;
  }
  selected = index;
  playSelected(null);
}

function tapEnemy(uid) {
  if (busy || selected == null) return;
  if (!combat.needsTarget(fight.hand[selected])) return;
  playSelected(uid);
}

function playSelected(targetUid) {
  const index = selected;
  const def = combat.defOf(fight.hand[index]);
  const events = combat.playCard(fight, index, targetUid);
  if (!events.length) { selected = null; return render(); }

  selected = null;
  setLog(`${def.name}.`);
  render();
  showEvents(events);
  if (fight.over) finishFight();
}

/* Floats every number in a batch of events onto whoever it happened to.
   Called after a re-render, so the elements are the current ones. */
function showEvents(events) {
  for (const event of events) {
    const target = fighterNodes.get(event.uid);
    if (!target) continue;
    if (event.t === "hit") {
      const text = event.amount - Math.min(event.blocked, event.amount) === 0
        ? `⛨${event.amount}`
        : `-${event.amount - event.blocked}`;
      ui.floatText(target, text, event.blocked >= event.amount ? "block" : "hit");
    } else if (event.t === "heal") {
      ui.floatText(target, `+${event.amount}`, "heal");
    } else if (event.t === "block") {
      ui.floatText(target, `⛨${event.amount}`, "block");
    }
  }
}

async function endTurn() {
  if (busy || !fight || fight.over) return;
  busy = true;
  selected = null;
  render();

  const events = combat.endTurn(fight);
  for (const event of events) {
    if (event.t === "act") {
      setLog(actionLine(event));
      await wait(320);
      continue;
    }
    const target = fighterNodes.get(event.uid);
    if (target && ["hit", "heal", "block", "status"].includes(event.t)) {
      showEvents([event]);
      syncFighter(event.uid);
      await wait(180);
    }
    if (event.t === "die") {
      syncFighter(event.uid);
      await wait(200);
    }
  }

  busy = false;
  if (fight.over) return finishFight();
  setLog("");
  render();
}

function actionLine(event) {
  const enemy = fight.enemies.find((e) => e.uid === event.uid);
  const move = event.move;
  const name = enemy?.name ?? "It";
  switch (move.kind) {
    case "attack": return `${name} attacks.`;
    case "block": return `${name} braces.`;
    case "buff": return `${name} swells with power.`;
    case "status": return `${name} curses you.`;
    default: return `${name} acts.`;
  }
}

/* Updates one fighter's bars in place. A full render() would rebuild the
   element and take the floating number with it. */
function syncFighter(uid) {
  const element = fighterNodes.get(uid);
  if (!element) return;
  const fighter = uid === "hero" ? fight.hero : fight.enemies.find((e) => e.uid === uid);
  if (!fighter) return;
  element.querySelector(".gauge")?.replaceWith(ui.gauge(fighter.hp, fighter.maxHp, { kind: "hp" }));
  element.querySelector(".chips")?.replaceWith(ui.chips(fighter.statuses, fighter.block));
  if (!fighter.alive) element.classList.add("is-dead");
}

function finishFight() {
  const won = fight.over === "victory";
  current.hp = fight.hero.hp;

  if (!won) {
    run.loseRun(current);
    const earned = run.bankRun(meta, current);
    run.saveMeta(meta);
    run.clearRun();
    return setTimeout(() => openRunOver(false, earned), 700);
  }

  run.winFight(current, node.type);
  run.saveRun(current);
  setTimeout(() => openReward(), 500);
}

/* ---------- panels ------------------------------------------------------- */

function openReward() {
  const choices = run.rewardChoices(current, meta);
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader("Spoils", "Take one card, or take none."));
    const row = ui.el("div", "card-row");
    for (const choice of choices) {
      const def = cardDef(choice.id, choice.upgraded);
      const card = ui.cardEl(def);
      const wrap = ui.el("div", "card-pick");
      wrap.append(card, ui.el("p", "card-pick__text", ui.cardText(def)));
      wrap.addEventListener("pointerdown", () => {
        run.addCard(current, choice);
        ui.closePanel();
        afterNode();
      });
      row.append(wrap);
    }
    panel.append(row);
    panel.append(button("Take none", () => { ui.closePanel(); afterNode(); }, "quiet"));
  });
}

function openCamp() {
  ui.openPanel((panel) => {
    const healed = Math.round(current.maxHp * 0.4);
    panel.append(ui.panelHeader("Camp", `${current.hp}/${current.maxHp} HP`));
    panel.append(button(`Rest · heal ${healed}`, () => {
      run.restHeal(current);
      ui.closePanel();
      afterNode();
    }, "primary"));
    panel.append(button("Sharpen · upgrade a card", () => openDeck({
      title: "Upgrade",
      subtitle: "Pick a card to improve, permanently.",
      filter: (card) => run.canUpgrade(card),
      onPick: (index) => {
        run.upgradeCard(current, index);
        ui.closePanel();
        afterNode();
      },
    })));
  });
}

function openShrine() {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader("Shrine", "The stone wants a trade."));
    panel.append(button("Take a card", () => {
      const choices = run.shrineChoices(current);
      ui.openPanel((inner) => {
        inner.append(ui.panelHeader("Offerings", "One of these joins your deck."));
        const row = ui.el("div", "card-row");
        for (const choice of choices) {
          const def = cardDef(choice.id, choice.upgraded);
          const wrap = ui.el("div", "card-pick");
          wrap.append(ui.cardEl(def), ui.el("p", "card-pick__text", ui.cardText(def)));
          wrap.addEventListener("pointerdown", () => {
            run.addCard(current, choice);
            ui.closePanel();
            afterNode();
          });
          row.append(wrap);
        }
        inner.append(row);
      });
    }, "primary"));
    panel.append(button("Burn a card", () => openDeck({
      title: "Burn",
      subtitle: "Pick a card to remove from the deck for good.",
      onPick: (index) => {
        run.removeCard(current, index);
        ui.closePanel();
        afterNode();
      },
    })));
    panel.append(button("Leave it alone", () => { ui.closePanel(); afterNode(); }, "quiet"));
  });
}

/* The deck list, used for browsing, upgrading and burning. */
function openDeck({ title = "Deck", subtitle, filter, onPick } = {}) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(title, subtitle ?? `${current.deck.length} cards`));
    const grid = ui.el("div", "deck-grid");
    current.deck.forEach((card, index) => {
      const def = combat.defOf(card);
      const allowed = !filter || filter(card);
      const element = ui.cardEl(def, { affordable: allowed, compact: true });
      if (onPick && allowed) element.addEventListener("pointerdown", () => onPick(index));
      grid.append(element);
    });
    panel.append(grid);
    if (!onPick) panel.append(statusLegend());
    panel.append(button("Close", () => {
      // Backing out of a camp choice must not eat the node.
      ui.closePanel();
      if (onPick) reopenNode();
    }, "quiet"));
  });
}

/* The deck screen is the one place with room to say what Vuln actually does,
   so the rules for every status live at the bottom of it. */
function statusLegend() {
  const list = ui.el("div", "legend");
  list.append(ui.el("h3", "legend__title", "Statuses"));
  for (const [id, status] of Object.entries(STATUSES)) {
    const row = ui.el("p", "legend__row");
    row.append(ui.el("b", `chip is-${status.kind}`, status.name));
    row.append(ui.el("span", null, ` ${status.help}`));
    list.append(row);
  }
  return list;
}

function reopenNode() {
  if (node?.type === "rest") openCamp();
  else if (node?.type === "shrine") openShrine();
}

function openRunOver(cleared, earned) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(
      cleared ? "The Vault opens" : "You fall",
      cleared ? "Three floors, cleared." : `Floor ${current.floor + 1}, ${FLOORS[current.floor].name}.`
    ));
    panel.append(ui.el("p", "panel__body", `${earned} Echoes carried back to the Sanctum.`));
    panel.append(button("To the Sanctum", () => {
      ui.closePanel();
      current = null;
      fight = null;
      showSanctum();
    }, "primary"));
    panel.append(button("Title", () => {
      ui.closePanel();
      current = null;
      fight = null;
      showTitle();
    }, "quiet"));
  });
}

function button(label, onTap, variant) {
  const element = ui.el("button", `rpg-button${variant ? ` rpg-button--${variant}` : ""}`, label);
  element.type = "button";
  element.addEventListener("pointerdown", onTap);
  return element;
}

/* ---------- moving on ---------------------------------------------------- */

function afterNode() {
  fight = null;
  run.advance(current);
  if (current.over === "cleared") {
    const earned = run.bankRun(meta, current);
    run.saveMeta(meta);
    run.clearRun();
    return openRunOver(true, earned);
  }
  run.saveRun(current);
  showPath();
}

/* ---------- wiring ------------------------------------------------------- */

buildTitleArt();
showTitle();

$("btn-new").addEventListener("pointerdown", showPick);
$("btn-sanctum").addEventListener("pointerdown", showSanctum);
$("btn-continue").addEventListener("pointerdown", () => {
  const saved = run.loadRun();
  if (!saved) return showTitle();
  current = saved;
  showPath();
});
$("btn-deck").addEventListener("pointerdown", () => openDeck({}));
$("btn-end-turn").addEventListener("pointerdown", endTurn);

// Rotating the phone changes how much room the hand has.
window.addEventListener("resize", () => { if (fight && !busy) render(); });

for (const back of document.querySelectorAll("[data-back]")) {
  back.addEventListener("pointerdown", () => {
    meta = run.loadMeta();
    showTitle();
  });
}
