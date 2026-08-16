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
let aiming = null; // hand index of a card that has been played and wants a target
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

    if (!owned) row.addEventListener("pointerdown", () => openUnlock(unlock, affordable));
    list.append(row);
  }
  ui.showScreen("sanctum");
}

/* Reading what an unlock does must not spend the Echoes for it. */
function openUnlock(unlock, affordable) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(unlock.name, unlock.desc));
    panel.append(ui.el("p", "panel__body", `${unlock.cost} ✦ · you hold ${meta.echoes} ✦`));
    if (affordable) {
      panel.append(button(`Spend ${unlock.cost} ✦`, () => {
        run.buyUnlock(meta, unlock.id);
        run.saveMeta(meta);
        ui.closeAllPanels();
        showSanctum();
      }, "primary"));
    } else {
      panel.append(ui.el("p", "panel__body", "Not enough Echoes yet."));
    }
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
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

    if (!locked) card.addEventListener("pointerdown", () => openClass(cls));
    list.append(card);
  }
  ui.showScreen("pick");
}

/* The starting deck is the whole reason to pick one class over another, so
   the picker shows it before the run begins rather than after. */
function openClass(cls) {
  ui.openPanel((panel) => {
    const maxHp = cls.maxHp + (run.hasUnlock(meta, "vigor") ? 8 : 0);
    panel.append(ui.panelHeader(cls.name, `${maxHp} HP · ${cls.energy || 3} energy a turn`));
    panel.append(ui.el("p", "panel__body", cls.blurb));

    const grid = ui.el("div", "deck-grid");
    const honed = run.hasUnlock(meta, "honing");
    for (const id of cls.deck) {
      grid.append(cardButton(cardDef(id, honed && id === cls.honed), { compact: true }));
    }
    panel.append(ui.el("p", "panel__sub", "Starting deck"));
    panel.append(grid);

    panel.append(button("Begin the descent", () => {
      ui.closeAllPanels();
      startRun(cls.id);
    }, "primary"));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
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
    button.addEventListener("pointerdown", () => openDoor(option));
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

/* What is behind the door, before you walk through it: which monsters, how
   much they have, and what the room is worth. */
function openDoor(option) {
  const info = run.NODE_INFO[option.type];
  ui.openPanel((panel) => {
    const label = option.type === "boss" ? ENEMIES[option.enemies[0]].name : info.label;
    panel.append(ui.panelHeader(label, info.desc));

    if (option.enemies) {
      const list = ui.el("div", "foe-list");
      for (const key of option.enemies) {
        const enemy = ENEMIES[key];
        const row = ui.el("div", "foe-list__row");
        row.append(ui.sprite(enemy.sprite));
        const body = ui.el("div", null);
        body.append(ui.el("b", null, enemy.name));
        const hp = enemy.hp[0] === enemy.hp[1] ? `${enemy.hp[0]}` : `${enemy.hp[0]}-${enemy.hp[1]}`;
        body.append(ui.el("span", "foe-list__hp", ` ${hp} HP`));
        body.append(ui.el("p", "foe-list__moves", moveSummary(enemy)));
        row.append(body);
        list.append(row);
      }
      panel.append(list);
    }

    panel.append(button(option.type === "boss" ? "Face it" : "Go this way", () => {
      ui.closeAllPanels();
      takeNode(option);
    }, "primary"));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

/* The monster's whole repertoire, so a door is a real decision. */
function moveSummary(enemy) {
  return enemy.moves.map((move) => ui.intentWords({
    kind: move.kind, amount: move.amount, times: move.times || 1, status: move.status,
  }).replace(/\.$/, "")).join(" · ");
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
  aiming = null;
  busy = false;
  setLog(option.type === "boss" ? "The keeper turns to face you." : "");
  // Screen first: the hand measures itself when it renders, and a hidden
  // screen measures zero.
  ui.showScreen("battle");
  render();
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
  const needsTarget = aiming != null;
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
      selected: aiming === index,
    });
    element.addEventListener("pointerdown", () => tapCard(index));
    hand.append(element);
  });
  fanHand(hand);

  $("card-detail").textContent = aiming != null
    ? "Tap a monster, or Cancel."
    : "Tap a card to read it.";

  // While a card is waiting on a target, End Turn would be a trap.
  const endTurnButton = $("btn-end-turn");
  endTurnButton.textContent = aiming != null ? "Cancel" : "End Turn";
  endTurnButton.classList.toggle("rpg-button--quiet", aiming != null);
  endTurnButton.classList.toggle("rpg-button--primary", aiming == null);
  endTurnButton.disabled = busy || !!fight.over;

  $("pile-draw").textContent = fight.draw.length;
  $("pile-discard").textContent = fight.discard.length;
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
  if (room <= 0) return; // laid out while hidden - nothing to fit against
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

/* Tapping a card reads it. Nothing is spent until the Play button in the
   zoom is pressed - a fat thumb on a fanned hand must never cost a turn. */
function tapCard(index) {
  if (busy || !fight || fight.over) return;
  // Reaching for a different card while aiming means you changed your mind
  // about the first one, not that you want to cancel and tap again.
  if (aiming != null) stopAiming();

  const card = fight.hand[index];
  const def = combat.defOf(card);
  const affordable = fight.hero.energy >= def.cost;

  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def));
    const mentioned = ui.statusesIn(def);
    if (mentioned.length) panel.append(ui.statusNotes(mentioned));

    if (affordable) {
      const targeted = combat.needsTarget(card) && combat.livingEnemies(fight).length > 1;
      panel.append(button(targeted ? "Play · pick a target" : "Play", () => {
        ui.closeAllPanels();
        beginPlay(index);
      }, "primary"));
    } else {
      panel.append(ui.el("p", "panel__body",
        `Costs ${def.cost}. You have ${fight.hero.energy} energy left this turn.`));
    }
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function beginPlay(index) {
  const card = fight.hand[index];
  if (!card) return;
  if (combat.needsTarget(card)) {
    const alive = combat.livingEnemies(fight);
    if (alive.length > 1) {
      aiming = index;
      setLog(`${combat.defOf(card).name} — pick who it hits.`);
      return render();
    }
    return playCard(index, alive[0]?.uid);
  }
  playCard(index, null);
}

function stopAiming() {
  aiming = null;
  setLog("");
  render();
}

/* Outside of aiming, a monster is something to read: what it has left, what
   it is about to do, and what its statuses mean. */
function tapEnemy(uid) {
  if (busy || !fight || fight.over) return;
  if (aiming != null) {
    const index = aiming;
    aiming = null;
    return playCard(index, uid);
  }

  const enemy = fight.enemies.find((e) => e.uid === uid);
  if (!enemy) return;
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(enemy.name, `${enemy.hp}/${enemy.maxHp} HP`));
    const art = ui.el("div", "zoom-foe");
    art.append(ui.sprite(enemy.sprite));
    panel.append(art);
    panel.append(ui.el("p", "panel__body", ui.intentWords(combat.intentPreview(enemy))));
    if (enemy.block > 0) panel.append(ui.el("p", "panel__body", `Holding ${enemy.block} Block.`));
    const statuses = Object.keys(enemy.statuses).filter((id) => enemy.statuses[id] > 0);
    if (statuses.length) panel.append(ui.statusNotes(statuses));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function playCard(index, targetUid) {
  const card = fight.hand[index];
  if (!card) return render();
  const def = combat.defOf(card);
  const events = combat.playCard(fight, index, targetUid);
  if (!events.length) return render();

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
  if (aiming != null) return stopAiming(); // the button reads Cancel right now
  busy = true;
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
  offerCards({
    title: "Spoils",
    subtitle: "Read them. Take one, or take none.",
    choices: run.rewardChoices(current, meta),
    decline: "Take none",
  });
}

/* One screen for every "pick a card" moment: the row reads, a tap zooms, and
   only the button in the zoom actually adds it to the deck. */
function offerCards({ title, subtitle, choices, decline }) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(title, subtitle));
    const row = ui.el("div", "card-row");
    for (const choice of choices) {
      const def = cardDef(choice.id, choice.upgraded);
      row.append(cardButton(def, {
        onTap: () => openCardOffer(def, choice),
      }));
    }
    panel.append(row);
    // There is always a way out of a card offer. Declining a reward moves the
    // run on; backing out of the shrine's offer returns to the shrine, which
    // still has a Burn and a Leave it alone.
    panel.append(decline
      ? button(decline, () => { ui.closeAllPanels(); afterNode(); }, "quiet")
      : button("Back", () => ui.closePanel(), "quiet"));
  });
}

function openCardOffer(def, choice) {
  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def));
    const mentioned = ui.statusesIn(def);
    if (mentioned.length) panel.append(ui.statusNotes(mentioned));
    panel.append(button("Add to deck", () => {
      run.addCard(current, choice);
      ui.closeAllPanels();
      afterNode();
    }, "primary"));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

/* A card in a list, tappable for a closer look. */
function cardButton(def, { onTap, compact = false } = {}) {
  const element = ui.cardEl(def, { compact });
  element.addEventListener("pointerdown", () => (onTap ? onTap() : openCardLook(def)));
  return element;
}

function openCardLook(def) {
  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def));
    const mentioned = ui.statusesIn(def);
    if (mentioned.length) panel.append(ui.statusNotes(mentioned));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function openCamp() {
  ui.openPanel((panel) => {
    const healed = Math.min(current.maxHp - current.hp, Math.round(current.maxHp * 0.4));
    panel.append(ui.panelHeader("Camp", `${current.hp}/${current.maxHp} HP`));
    panel.append(button(`Rest · heal ${healed}`, () => {
      run.restHeal(current);
      ui.closeAllPanels();
      afterNode();
    }, "primary"));
    panel.append(button("Sharpen · upgrade a card", () => openDeck({
      title: "Upgrade",
      subtitle: "Tap a card to see what it becomes.",
      filter: (card) => run.canUpgrade(card),
      action: "upgrade",
    })));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function openShrine() {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader("Shrine", "The stone wants a trade."));
    panel.append(button("Take a card", () => offerCards({
      title: "Offerings",
      subtitle: "Tap one to read it.",
      choices: run.shrineChoices(current),
    }), "primary"));
    panel.append(button("Burn a card", () => openDeck({
      title: "Burn",
      subtitle: "Tap a card to remove it from the deck for good.",
      action: "burn",
    })));
    panel.append(button("Leave it alone", () => { ui.closeAllPanels(); afterNode(); }, "quiet"));
  });
}

/* The deck list, used for browsing, upgrading and burning. Every card here
   opens for a look first; `action` decides what the button in that look
   offers to do. */
function openDeck({ title = "Deck", subtitle, filter, action } = {}) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(title, subtitle ?? `${current.deck.length} cards`));
    const grid = ui.el("div", "deck-grid");
    current.deck.forEach((card, index) => {
      const def = combat.defOf(card);
      const allowed = !filter || filter(card);
      const element = ui.cardEl(def, { affordable: allowed, compact: true });
      element.addEventListener("pointerdown", () => openDeckCard(index, def, action, allowed));
      grid.append(element);
    });
    panel.append(grid);
    if (!action) panel.append(statusLegend());
    panel.append(button("Close", () => ui.closePanel(), "quiet"));
  });
}

function openDeckCard(index, def, action, allowed = true) {
  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def));

    if (action && !allowed) {
      panel.append(ui.el("p", "panel__body", "This one is already as good as it gets."));
    } else if (action === "upgrade") {
      const card = current.deck[index];
      const better = cardDef(card.id, true);
      panel.append(ui.el("p", "panel__sub", "Becomes"));
      panel.append(ui.zoomCard(better));
      panel.append(button("Upgrade this card", () => {
        run.upgradeCard(current, index);
        ui.closeAllPanels();
        afterNode();
      }, "primary"));
    } else if (action === "burn") {
      panel.append(button("Burn this card", () => {
        run.removeCard(current, index);
        ui.closeAllPanels();
        afterNode();
      }, "primary"));
    } else {
      const mentioned = ui.statusesIn(def);
      if (mentioned.length) panel.append(ui.statusNotes(mentioned));
    }
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

/* The deck screen is the one place with room to say what Vuln actually does,
   so the rules for every status live at the bottom of it. */
function statusLegend() {
  const list = ui.statusNotes(Object.keys(STATUSES));
  list.prepend(ui.el("h3", "legend__title", "Statuses"));
  return list;
}

function openRunOver(cleared, earned) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(
      cleared ? "The Vault opens" : "You fall",
      cleared ? "Three floors, cleared." : `Floor ${current.floor + 1}, ${FLOORS[current.floor].name}.`
    ));
    panel.append(ui.el("p", "panel__body", `${earned} Echoes carried back to the Sanctum.`));
    panel.append(button("To the Sanctum", () => {
      ui.closeAllPanels();
      current = null;
      fight = null;
      showSanctum();
    }, "primary"));
    panel.append(button("Title", () => {
      ui.closeAllPanels();
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
