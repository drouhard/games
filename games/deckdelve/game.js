/* The controller: screens, taps and timing.

   Everything with a rule in it lives in combat.js, dungeon.js and run.js;
   this file only decides what is on screen and what a tap means.

   The tap rule: nothing commits on the tap that shows it to you. Walking onto
   bare stone is the one exception - it costs nothing and you can walk back -
   but a monster, a chest, a shopkeeper, the stairs and every card go through
   an inspector with a labelled button. */

import { CLASSES, FLOORS, FOES, PATIENCE, STATUSES, UNLOCKS, cardDef } from "./data.js";
import * as combat from "./combat.js";
import * as dungeon from "./dungeon.js";
import * as run from "./run.js";
import * as ui from "./ui.js";

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let meta = run.loadMeta();
let current = null; // the run in progress
let fight = null; // the duel, while one is on
let tile = null; // the tile the duel belongs to
let busy = false; // true while a round is resolving
let stock = null; // the pedlar's stock, rolled once per visit

/* ---------- title -------------------------------------------------------- */

function showTitle() {
  $("btn-continue").hidden = !run.loadRun();
  ui.showScreen("title");
}

function buildTitleArt() {
  $("title-art").replaceChildren(...CLASSES.map((cls) => ui.sprite(cls.sprite)));
}

/* ---------- sanctum ------------------------------------------------------ */

function showSanctum() {
  $("sanctum-lore").textContent = meta.lore;
  $("sanctum-stats").textContent = meta.runs
    ? `${meta.runs} run${meta.runs === 1 ? "" : "s"}, ${meta.wins} cleared. Lore is spent here and never lost.`
    : "Lore comes back from every run, won or lost. Spend it here.";

  const list = $("unlock-list");
  list.replaceChildren();
  for (const unlock of UNLOCKS) {
    const owned = run.hasUnlock(meta, unlock.id);
    const affordable = meta.lore >= unlock.cost;
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

function openUnlock(unlock, affordable) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(unlock.name, unlock.desc));
    panel.append(ui.el("p", "panel__body", `${unlock.cost} ✦ · you hold ${meta.lore} ✦`));
    if (affordable) {
      panel.append(button(`Spend ${unlock.cost} ✦`, () => {
        run.buyUnlock(meta, unlock.id);
        run.saveMeta(meta);
        ui.closeAllPanels();
        showSanctum();
      }, "primary"));
    } else {
      panel.append(ui.el("p", "panel__body", "Not enough Lore yet."));
    }
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

/* ---------- choosing a delver -------------------------------------------- */

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
      : `${cls.maxHp + (run.hasUnlock(meta, "vigor") ? 6 : 0)} HP · ${cls.resource}`));
    body.append(head);
    body.append(ui.el("p", "pick__blurb", cls.blurb));
    card.append(body);
    if (!locked) card.addEventListener("pointerdown", () => openClass(cls));
    list.append(card);
  }
  ui.showScreen("pick");
}

function openClass(cls) {
  ui.openPanel((panel) => {
    const maxHp = cls.maxHp + (run.hasUnlock(meta, "vigor") ? 6 : 0);
    const hand = cls.hand + (run.hasUnlock(meta, "grip") ? 1 : 0);
    panel.append(ui.panelHeader(cls.name, `${maxHp} HP · ${hand} cards a round · ${cls.resource}`));
    panel.append(ui.el("p", "panel__body", cls.blurb));
    panel.append(ui.el("p", "panel__sub", "Starting deck"));

    const grid = ui.el("div", "deck-grid");
    for (const id of cls.deck) {
      const def = cardDef(id, false);
      const element = ui.cardEl(def, { compact: true, resName: cls.resource });
      element.addEventListener("pointerdown", () => openCardLook(def, cls.resource));
      grid.append(element);
    }
    panel.append(grid);
    panel.append(button("Begin the descent", () => {
      ui.closeAllPanels();
      current = run.newRun(cls.id, meta);
      run.saveRun(current);
      setLog(`${FLOORS[0].name}. Something is sitting on the stairs.`);
      showMap();
    }, "primary"));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

/* ---------- the floor ---------------------------------------------------- */

const resName = () => run.classById(current.classId).resource;

function heroView() {
  const cls = run.classById(current.classId);
  return {
    name: cls.name, sprite: cls.sprite,
    hp: current.hp, maxHp: current.maxHp,
    gold: current.gold, statuses: {},
    xp: run.xpBar(current),
  };
}

function setLog(text) {
  $("map-log").textContent = text;
}

function showMap() {
  const floor = current.floor;
  const left = dungeon.remaining(floor);
  $("map-title").textContent = `${floor.name} · floor ${current.floorIndex + 1}`;
  $("map-left").textContent = `${left.foes} left · ${left.unknown} dark`;
  $("deck-count").textContent = current.deck.length;
  $("potion-count").textContent = current.potions;
  $("btn-potion").disabled = current.potions <= 0 || current.hp >= current.maxHp;
  $("map-hero").replaceChildren(ui.heroStrip(heroView(), { level: `Level ${current.level}` }));

  const grid = $("grid");
  grid.style.setProperty("--cols", floor.size);
  grid.replaceChildren();
  for (const row of floor.tiles) {
    for (const spot of row) {
      const here = spot.x === floor.x && spot.y === floor.y;
      const element = ui.tileEl(spot, {
        hero: here,
        steppable: dungeon.canStep(floor, spot),
        foeSprite: spot.content?.foe ? FOES[spot.content.foe].sprite : null,
      });
      if (here) element.append(ui.sprite(run.classById(current.classId).sprite, "tile__hero"));
      element.addEventListener("pointerdown", () => tapTile(spot));
      grid.append(element);
    }
  }
  run.saveRun(current);
  ui.showScreen("map");
}

function tapTile(spot) {
  if (ui.panelOpen()) return;
  const floor = current.floor;
  if (spot.x === floor.x && spot.y === floor.y) return openHere();

  if (dungeon.canStep(floor, spot)) {
    // Bare stone is not a decision: stepping costs nothing and you can step
    // back. Anything with something on it goes through the inspector.
    if (spot.type === "floor") {
      dungeon.step(floor, spot);
      setLog("");
      return showMap();
    }
    return openTile(spot, true);
  }
  if (spot.known && spot.type !== "floor") openTile(spot, false);
}

function openHere() {
  const here = dungeon.heroTile(current.floor);
  const last = current.floorIndex === FLOORS.length - 1;

  ui.openPanel((panel) => {
    // Killing a keeper leaves you standing on the stairs it was sitting on,
    // so this is the only place the descent can be offered.
    if (here.type === "stairs") {
      panel.append(ui.panelHeader(last ? "The way out" : "Stairs down",
        last ? "Out of the Vault, with everything you are carrying." : `Down to floor ${current.floorIndex + 2}. You will heal on the way.`));
      panel.append(button(last ? "Climb out" : "Take the stairs", () => {
        ui.closeAllPanels();
        takeStairs();
      }, "primary"));
      panel.append(button("Not yet", () => ui.closePanel(), "quiet"));
      return;
    }
    panel.append(ui.panelHeader("You are here", `${current.hp}/${current.maxHp} HP · ${current.gold} gold`));
    panel.append(ui.el("p", "panel__body",
      `Level ${current.level}${run.xpToNext(current) == null ? "" : `, ${run.xpToNext(current)} XP to the next`}.`));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

/* Everything on the floor is readable before it is walked into: what the
   monster's deck holds, what the room does, what the stairs cost. */
function openTile(spot, adjacent) {
  const info = dungeon.TILES[spot.type];
  ui.openPanel((panel) => {
    if (spot.content?.foe) {
      const def = FOES[spot.content.foe];
      const label = spot.type === "boss" ? def.name : spot.type === "elite" ? `Dire ${def.name}` : def.name;
      panel.append(ui.panelHeader(label, info.desc));
      const art = ui.el("div", "zoom-foe");
      art.append(ui.sprite(def.sprite));
      panel.append(art);
      const hp = spot.type === "elite" ? `${Math.round(def.hp[0] * 1.4)}-${Math.round(def.hp[1] * 1.4)}` :
        def.hp[0] === def.hp[1] ? `${def.hp[0]}` : `${def.hp[0]}-${def.hp[1]}`;
      panel.append(ui.el("p", "panel__body",
        `${hp} HP · plays ${def.draws + (spot.type === "elite" ? 1 : 0)} cards a round · worth ${def.xp} XP`));
      panel.append(ui.el("p", "panel__sub", "Its deck"));
      panel.append(ui.foeDeck(combat.foeDeckList({ key: spot.content.foe })));
    } else {
      panel.append(ui.panelHeader(info.label, info.desc));
      if (spot.type === "stairs") {
        panel.append(ui.el("p", "panel__body", `Down to floor ${current.floorIndex + 2}. You will heal on the way.`));
      }
    }
    if (adjacent) {
      panel.append(button(enterLabel(spot), () => {
        ui.closeAllPanels();
        dungeon.step(current.floor, spot);
        enterTile(spot);
      }, "primary"));
    }
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function enterLabel(spot) {
  switch (spot.type) {
    case "foe": case "elite": return "Fight it";
    case "boss": return "Face it";
    case "stairs": return "Take the stairs";
    case "chest": return "Open it";
    case "shop": return "Trade";
    case "altar": return "Approach";
    case "fire": return "Sit down";
    default: return "Step there";
  }
}

function enterTile(spot) {
  tile = spot;
  switch (spot.type) {
    case "foe": case "elite": case "boss": return startDuel(spot);
    case "chest": return openChest();
    case "shop": return openShop();
    case "altar": return openAltar();
    case "fire": return openFire();
    case "stairs": return takeStairs();
    default: showMap();
  }
}

/* ---------- rooms -------------------------------------------------------- */

function finishRoom() {
  dungeon.clearTile(current.floor, tile);
  ui.closeAllPanels();
  showMap();
}

function openFire() {
  ui.openPanel((panel) => {
    const healed = Math.min(current.maxHp - current.hp, Math.round(current.maxHp * 0.35));
    panel.append(ui.panelHeader("Campfire", "It will not burn twice."));
    panel.append(ui.el("p", "panel__body", `${current.hp}/${current.maxHp} HP. Resting mends ${healed}.`));
    panel.append(button(`Rest · heal ${healed}`, () => {
      run.restAtFire(current);
      setLog(`You rest. +${healed} HP.`);
      finishRoom();
    }, "primary"));
    panel.append(button("Leave it", () => { ui.closeAllPanels(); showMap(); }, "quiet"));
  });
}

function openChest() {
  const loot = run.chestLoot(current, meta);
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader("Chest", "Coin, or something to shuffle in."));
    panel.append(button(`Take the gold · ${loot.gold}`, () => {
      current.gold += loot.gold;
      setLog(`+${loot.gold} gold.`);
      finishRoom();
    }, "primary"));
    panel.append(ui.el("p", "panel__sub", "Or take one of these"));
    panel.append(cardRow(loot.cards, (id) => openCardOffer(cardDef(id, false), () => {
      run.addCard(current, { id });
      setLog(`${cardDef(id, false).name} joins the deck.`);
      finishRoom();
    })));
  });
}

function openShop() {
  // Rolled once for the visit: buying a card must not reshuffle the shelf.
  if (!stock) stock = run.shopStock(current, meta);
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader("Pedlar", `${current.gold} gold in your purse.`));
    if (stock.cards.length) {
      panel.append(ui.el("p", "panel__sub", "Cards"));
      const row = ui.el("div", "card-row");
      stock.cards.forEach((item, index) => {
        const def = cardDef(item.id, false);
        const wrap = ui.el("div", "buy");
        wrap.append(ui.cardEl(def, { affordable: current.gold >= item.price, resName: resName() }));
        wrap.append(ui.el("span", "buy__price", `${item.price}g`));
        wrap.addEventListener("pointerdown", () => openCardOffer(def, () => {
          if (!run.spend(current, item.price)) return;
          run.addCard(current, { id: item.id });
          stock.cards.splice(index, 1);
          ui.closeAllPanels();
          openShop();
        }, `Buy · ${item.price}g`, current.gold >= item.price));
        row.append(wrap);
      });
      panel.append(row);
    }

    const potion = button(`Potion · ${stock.potion}g`, () => {
      if (!run.spend(current, stock.potion)) return;
      current.potions += 1;
      ui.closeAllPanels();
      openShop();
    });
    potion.disabled = current.gold < stock.potion;
    panel.append(potion);

    const burn = button(`Burn a card · ${stock.burn}g`, () => openDeck({
      title: "Burn",
      subtitle: `${stock.burn} gold to lose a card for good.`,
      action: "burn",
      price: stock.burn,
      then: () => { ui.closeAllPanels(); openShop(); },
    }));
    burn.disabled = current.gold < stock.burn;
    panel.append(burn);

    panel.append(button("Done", () => { stock = null; finishRoom(); }, "quiet"));
  });
}

function openAltar() {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader("Altar", "One offering, then the stone goes quiet."));
    panel.append(button("Temper a card", () => openDeck({
      title: "Temper",
      subtitle: "Tap a card to see what it becomes.",
      filter: (card) => run.canUpgrade(card),
      action: "upgrade",
    }), "primary"));
    panel.append(button("Burn a card", () => openDeck({
      title: "Burn",
      subtitle: "Tap a card to lose it for good.",
      action: "burn",
    })));
    panel.append(button("Leave it alone", () => { ui.closeAllPanels(); showMap(); }, "quiet"));
  });
}

function takeStairs() {
  const floor = run.descend(current, meta);
  if (current.over === "cleared") {
    const lore = run.bankRun(meta, current);
    run.saveMeta(meta);
    run.clearRun();
    return openRunOver(true, lore);
  }
  setLog(`${floor.name}. You feel better for the walk.`);
  showMap();
}

/* ---------- the duel ----------------------------------------------------- */

function startDuel(spot) {
  const spec = dungeon.foeFor(spot);
  const foe = combat.makeFoe(spec.key, spec);
  fight = combat.startCombat({ hero: run.heroFor(current), deck: current.deck, foe });
  busy = false;
  ui.showScreen("duel");
  renderDuel();
}

function renderDuel() {
  if (!fight) return;
  const cls = run.classById(current.classId);
  $("duel-title").textContent = fight.foe.name;
  $("duel-round").textContent = fight.round;
  $("duel-round").classList.toggle("is-late", fight.round > PATIENCE - 3);

  const foeCard = $("foe-card");
  foeCard.replaceChildren(ui.foeFace(fight.foe, { big: fight.foe.boss }));
  $("foe-tell").textContent = fight.foe.played.length
    ? `It played ${fight.foe.played.join(", ")}.`
    : "It is holding back.";

  $("scales").replaceChildren(ui.scales(fight));

  const heroView = {
    name: cls.name, sprite: cls.sprite,
    hp: fight.hero.hp, maxHp: fight.hero.maxHp,
    statuses: fight.hero.statuses,
    attack: fight.hero.attack, defense: fight.hero.defense,
    resource: { name: cls.resource, value: fight.hero.res },
  };
  $("duel-hero").replaceChildren(ui.heroStrip(heroView, { pools: true }));

  const hand = $("hand");
  hand.replaceChildren();
  fight.hand.forEach((card, index) => {
    const def = combat.defOf(card);
    const element = ui.cardEl(def, {
      affordable: (def.cost || 0) <= fight.hero.res,
      resName: cls.resource,
    });
    element.addEventListener("pointerdown", () => tapCard(index));
    hand.append(element);
  });
  fanHand(hand);

  $("card-detail").textContent = fight.hand.length ? "Tap a card to read it." : "Nothing left in hand.";
  $("pile-draw").textContent = fight.draw.length;
  $("pile-discard").textContent = fight.discard.length;
  $("btn-end-round").disabled = busy || !!fight.over;
}

/* Overlaps the cards just enough that the whole hand fits the screen. */
function fanHand(hand) {
  hand.style.removeProperty("--card-w");
  hand.style.setProperty("--overlap", "0px");
  const count = hand.children.length;
  if (count < 2) return;
  const gap = parseFloat(getComputedStyle(hand).columnGap) || 0;
  const room = hand.clientWidth;
  if (room <= 0) return; // laid out while hidden - nothing to fit against
  const span = (width) => count * width + (count - 1) * gap;

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
  const card = fight.hand[index];
  const def = combat.defOf(card);
  const cost = def.cost || 0;
  const affordable = cost <= fight.hero.res;

  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def, resName()));
    const mentioned = ui.statusesIn(def);
    if (mentioned.length) panel.append(ui.statusNotes(mentioned));

    if (!affordable) {
      panel.append(ui.el("p", "panel__body",
        `Costs ${cost} ${resName()}. You have ${fight.hero.res}.`));
    } else if (def.modes) {
      def.modes.forEach((mode, i) => {
        panel.append(button(mode.label, () => {
          ui.closeAllPanels();
          play(index, i);
        }, i === 0 ? "primary" : undefined));
      });
    } else {
      panel.append(button("Play", () => {
        ui.closeAllPanels();
        play(index, 0);
      }, "primary"));
    }
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function play(index, mode) {
  const events = combat.playCard(fight, index, mode);
  if (!events.length) return renderDuel();
  renderDuel();
  for (const event of events) {
    if (event.t === "heal") ui.floatText($("duel-hero"), `+${event.amount}`, "heal");
  }
}

function openFoe() {
  if (busy || !fight) return;
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(fight.foe.name, `${fight.foe.hp}/${fight.foe.maxHp} HP`));
    const art = ui.el("div", "zoom-foe");
    art.append(ui.sprite(fight.foe.sprite));
    panel.append(art);
    panel.append(ui.el("p", "panel__body",
      `Attack ${fight.foe.attack} · Defense ${fight.foe.defense} · draws ${fight.foe.draws} a round.`));
    const statuses = Object.keys(fight.foe.statuses).filter((id) => fight.foe.statuses[id] > 0);
    if (statuses.length) panel.append(ui.statusNotes(statuses));
    panel.append(ui.el("p", "panel__sub", "Its deck"));
    panel.append(ui.foeDeck(combat.foeDeckList(fight.foe)));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

async function endRound() {
  if (busy || !fight || fight.over) return;
  busy = true;
  renderDuel();

  const events = combat.endRound(fight);
  for (const event of events) {
    if (event.t === "swing") {
      const who = event.side === "hero" ? "You swing" : "It swings";
      $("card-detail").textContent = event.landed
        ? `${who} for ${event.landed}.`
        : `${who} — ${event.raw ? "all armour." : "nothing."}`;
      await wait(320);
    } else if (event.t === "hit") {
      ui.floatText(event.side === "hero" ? $("duel-hero") : $("foe-card"),
        `-${event.amount}`, event.pierce ? "poison" : "hit");
      syncDuel();
      await wait(220);
    } else if (event.t === "heal") {
      ui.floatText(event.side === "hero" ? $("duel-hero") : $("foe-card"), `+${event.amount}`, "heal");
      syncDuel();
      await wait(200);
    } else if (event.t === "press") {
      $("card-detail").textContent = `The dark presses in. ${event.amount} to both of you.`;
      await wait(320);
    }
  }

  busy = false;
  if (fight.over) return finishDuel();
  renderDuel();
}

/* Updates the bars in place: a full re-render would rebuild the elements and
   take the floating numbers with them. */
function syncDuel() {
  const foeBox = $("foe-card").querySelector(".foe-face");
  if (foeBox) {
    foeBox.querySelector(".gauge")?.replaceWith(ui.gauge(fight.foe.hp, fight.foe.maxHp, { kind: "hp" }));
    foeBox.querySelector(".chips")?.replaceWith(ui.chips(fight.foe.statuses));
  }
  const heroBox = $("duel-hero").querySelector(".hero-strip");
  if (heroBox) {
    heroBox.querySelector(".gauge")?.replaceWith(ui.gauge(fight.hero.hp, fight.hero.maxHp, { kind: "hp" }));
  }
}

function finishDuel() {
  const won = fight.over === "win";
  current.hp = fight.hero.hp;
  const foe = fight.foe;

  if (!won) {
    run.loseRun(current);
    const lore = run.bankRun(meta, current);
    run.saveMeta(meta);
    run.clearRun();
    return setTimeout(() => openRunOver(false, lore, foe.name), 600);
  }

  const gain = run.grantKill(current, foe);
  const wasKeeper = tile.type === "boss";
  fight = null;
  dungeon.clearTile(current.floor, tile);
  setLog(wasKeeper
    ? `${foe.name} falls. The stairs are open beneath you.`
    : `${foe.name} falls. +${gain.xp} XP, +${gain.gold} gold.`);
  run.saveRun(current);
  setTimeout(() => (current.pendingLevels > 0 ? openLevelUp() : showMap()), 450);
}

/* ---------- levelling ---------------------------------------------------- */

function openLevelUp() {
  const options = run.levelOptions(current, meta);
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(`Level ${current.level}`, "Take one."));
    const row = ui.el("div", "card-row");
    for (const option of options) {
      if (option.kind === "card") {
        const def = cardDef(option.id, false);
        const card = ui.cardEl(def, { resName: resName() });
        card.addEventListener("pointerdown", () => openCardOffer(def, () => takeLevel(option)));
        row.append(card);
      } else {
        const boon = run.boonById(option.boon);
        const node = ui.el("button", "boon");
        node.type = "button";
        node.append(ui.el("b", null, boon.name));
        node.append(ui.el("span", null, boon.desc));
        node.addEventListener("pointerdown", () => openBoon(boon, option));
        row.append(node);
      }
    }
    panel.append(row);
  });
}

function openBoon(boon, option) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(boon.name, boon.desc));
    panel.append(button("Take it", () => {
      if (boon.pick === "burn") {
        ui.closeAllPanels();
        return openDeck({
          title: "Purge",
          subtitle: "Tap a card to lose it for good.",
          action: "burn",
          then: afterLevel,
        });
      }
      run.takeLevelOption(current, option);
      afterLevel();
    }, "primary"));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function takeLevel(option) {
  run.takeLevelOption(current, option);
  afterLevel();
}

function afterLevel() {
  current.pendingLevels -= 1;
  ui.closeAllPanels();
  run.saveRun(current);
  if (current.pendingLevels > 0) return openLevelUp();
  showMap();
}

/* ---------- shared panels ------------------------------------------------ */

function cardRow(ids, onTap) {
  const row = ui.el("div", "card-row");
  for (const id of ids) {
    const def = cardDef(id, false);
    const card = ui.cardEl(def, { resName: resName() });
    card.addEventListener("pointerdown", () => onTap(id));
    row.append(card);
  }
  return row;
}

function openCardOffer(def, take, label = "Add to deck", enabled = true) {
  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def, resName()));
    const mentioned = ui.statusesIn(def);
    if (mentioned.length) panel.append(ui.statusNotes(mentioned));
    if (enabled) panel.append(button(label, take, "primary"));
    else panel.append(ui.el("p", "panel__body", "Not enough gold."));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function openCardLook(def) {
  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def, resName()));
    const mentioned = ui.statusesIn(def);
    if (mentioned.length) panel.append(ui.statusNotes(mentioned));
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function openDeck({ title = "Deck", subtitle, filter, action, price = 0, then = null } = {}) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(title, subtitle ?? `${current.deck.length} cards`));
    const grid = ui.el("div", "deck-grid");
    current.deck.forEach((card, index) => {
      const def = combat.defOf(card);
      const allowed = !filter || filter(card);
      const element = ui.cardEl(def, { affordable: allowed, compact: true, resName: resName() });
      element.addEventListener("pointerdown", () => openDeckCard(index, def, action, allowed, price, then));
      grid.append(element);
    });
    panel.append(grid);
    if (!action) panel.append(statusLegend());
    panel.append(button("Close", () => ui.closePanel(), "quiet"));
  });
}

function openDeckCard(index, def, action, allowed, price, then) {
  ui.openPanel((panel) => {
    panel.append(ui.zoomCard(def, resName()));
    if (action && !allowed) {
      panel.append(ui.el("p", "panel__body", "This one is already as good as it gets."));
    } else if (action === "upgrade") {
      const better = cardDef(current.deck[index].id, true);
      panel.append(ui.el("p", "panel__sub", "Becomes"));
      panel.append(ui.zoomCard(better, resName()));
      panel.append(button("Temper it", () => {
        run.upgradeCard(current, index);
        setLog(`${better.name}.`);
        if (then) return then();
        finishRoom();
      }, "primary"));
    } else if (action === "burn") {
      panel.append(button(price ? `Burn it · ${price}g` : "Burn it", () => {
        if (price && !run.spend(current, price)) return;
        run.removeCard(current, index);
        setLog(`${def.name} is ash.`);
        if (then) return then();
        finishRoom();
      }, "primary"));
    } else {
      const mentioned = ui.statusesIn(def);
      if (mentioned.length) panel.append(ui.statusNotes(mentioned));
    }
    panel.append(button("Back", () => ui.closePanel(), "quiet"));
  });
}

function statusLegend() {
  const list = ui.statusNotes(Object.keys(STATUSES));
  list.prepend(ui.el("h3", "legend__title", "Statuses"));
  return list;
}

function openRunOver(cleared, lore, killer) {
  ui.openPanel((panel) => {
    panel.append(ui.panelHeader(
      cleared ? "The Vault opens" : "You fall",
      cleared ? "Three floors, cleared." : `${killer} finished it, on floor ${current.floorIndex + 1}.`
    ));
    panel.append(ui.el("p", "panel__body",
      `Level ${current.level} · ${current.kills} kills · ${lore} Lore carried back.`));
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

/* ---------- wiring ------------------------------------------------------- */

buildTitleArt();
showTitle();

$("btn-new").addEventListener("pointerdown", showPick);
$("btn-sanctum").addEventListener("pointerdown", showSanctum);
$("btn-continue").addEventListener("pointerdown", () => {
  const saved = run.loadRun();
  if (!saved) return showTitle();
  current = saved;
  setLog("");
  showMap();
});
$("btn-deck").addEventListener("pointerdown", () => openDeck({}));
$("btn-legend").addEventListener("pointerdown", () => ui.openPanel((panel) => {
  panel.append(ui.panelHeader("Statuses", "What the chips mean."));
  panel.append(ui.statusNotes(Object.keys(STATUSES)));
  panel.append(button("Back", () => ui.closePanel(), "quiet"));
}));
$("btn-potion").addEventListener("pointerdown", () => {
  const healed = run.drinkPotion(current);
  if (healed) setLog(`Potion. +${healed} HP.`);
  showMap();
});
$("btn-end-round").addEventListener("pointerdown", endRound);
$("foe-card").addEventListener("pointerdown", openFoe);

// Rotating the phone changes how much room the hand has.
window.addEventListener("resize", () => { if (fight && !busy) renderDuel(); });

for (const back of document.querySelectorAll("[data-back]")) {
  back.addEventListener("pointerdown", () => {
    meta = run.loadMeta();
    showTitle();
  });
}
