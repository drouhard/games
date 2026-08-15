/* Game flow: title -> camp -> battle -> camp, plus the shop and the overlays.

   Command entry is written as a plain async loop (await a menu choice, await a
   target) rather than a callback state machine. Backing out is then just
   `continue`, and stepping back to the previous hero is `index--`. */

import { SKILLS, ITEMS, GEAR, STAGES, ENEMIES, MAX_LEVEL } from "./data.js";
import * as combat from "./combat.js";
import * as progress from "./progress.js";
import * as audio from "./audio.js";
import {
  el, sprite, showScreen, memberRow, updateMember, foeCard, updateFoe,
  floatText, flash, setLog, openPanel, closePanel,
} from "./ui.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dom = {
  commands: document.getElementById("commands"),
  enemyRow: document.getElementById("enemy-row"),
  battleParty: document.getElementById("battle-party"),
  campParty: document.getElementById("camp-party"),
  campGold: document.getElementById("camp-gold"),
  battleTitle: document.getElementById("battle-title"),
  battleRound: document.getElementById("battle-round"),
  nextName: document.getElementById("next-name"),
  nextIntro: document.getElementById("next-intro"),
  nextFoes: document.getElementById("next-foes"),
};

let run = null;
let battle = null;
const cards = new Map(); // uid -> element, for both foes and party rows

/* ---------- helpers ---------- */

function memberFor(fighter) {
  return run.party.find((m) => m.id === fighter.heroId);
}

function buildParty() {
  return run.party.map((member) => {
    const stats = progress.statsFor(member.id, member.level, member);
    const hero = progress.heroById(member.id);
    return combat.makeHeroFighter(hero, {
      ...stats,
      hp: Math.min(member.hp, stats.maxHp),
      mp: Math.min(member.mp, stats.maxMp),
      skills: progress.skillsFor(member.id, member.level),
    });
  });
}

// Battle results are the source of truth for HP/MP once a fight ends.
function syncPartyToRun() {
  for (const fighter of battle.allies) {
    const member = memberFor(fighter);
    member.hp = fighter.hp;
    member.mp = fighter.mp;
  }
}

function inventoryList() {
  return Object.entries(run.inventory).filter(([, count]) => count > 0);
}

/* ---------- title ---------- */

function initTitle() {
  const art = document.getElementById("title-art");
  art.replaceChildren(sprite("knight"), sprite("mage"), sprite("cleric"));

  const saved = progress.load();
  const continueButton = document.getElementById("btn-continue");
  continueButton.hidden = !saved;
  continueButton.addEventListener("click", () => {
    audio.play("select");
    run = progress.load();
    if (run) showCamp();
  });

  document.getElementById("btn-new").addEventListener("click", () => {
    audio.play("select");
    run = progress.newRun();
    progress.save(run);
    showCamp();
  });

  const soundButton = document.getElementById("btn-sound");
  const paintSound = () => {
    soundButton.textContent = `Sound: ${audio.isEnabled() ? "On" : "Off"}`;
    soundButton.setAttribute("aria-pressed", String(audio.isEnabled()));
  };
  soundButton.addEventListener("click", () => {
    audio.setEnabled(!audio.isEnabled());
    paintSound();
    audio.play("select");
  });
  paintSound();

  document.getElementById("camp-back").addEventListener("click", () => {
    audio.play("select");
    showScreen("title");
    document.getElementById("btn-continue").hidden = !progress.load();
  });

  document.getElementById("btn-descend").addEventListener("click", () => {
    audio.play("select");
    startBattle();
  });
  document.getElementById("btn-shop").addEventListener("click", () => {
    audio.play("select");
    openShop();
  });
  document.getElementById("btn-rest").addEventListener("click", () => {
    audio.play("select");
    openRest();
  });
}

/* ---------- camp ---------- */

function showCamp() {
  progress.save(run);
  renderCamp();
  showScreen("camp");
}

function renderCamp() {
  dom.campGold.textContent = run.gold;

  const stage = STAGES[run.stage];
  dom.nextName.textContent = `${run.stage + 1}. ${stage.name}`;
  dom.nextIntro.textContent = stage.intro;
  dom.nextFoes.replaceChildren(
    ...stage.enemies.map((key) => sprite(ENEMIES[key].sprite))
  );

  dom.campParty.replaceChildren(
    ...run.party.map((member) => {
      const stats = progress.statsFor(member.id, member.level, member);
      const hero = progress.heroById(member.id);
      const row = memberRow(
        {
          name: hero.name, sprite: hero.sprite,
          hp: member.hp, maxHp: stats.maxHp,
          mp: member.mp, maxMp: stats.maxMp,
          statuses: [], alive: member.hp > 0,
        },
        { level: member.level }
      );

      const next = progress.xpToNext(member.level);
      const line = el(
        "div", "member__level",
        next == null ? `${hero.role} · MAX` : `${hero.role} · ${next - member.xp} xp to go`
      );
      row.querySelector(".member__bars").after(line);
      return row;
    })
  );
}

function openRest() {
  const cost = progress.restCost(run);
  const affordable = run.gold >= cost;
  openPanel((panel) => {
    panel.append(el("h2", null, "Rest"));
    panel.append(el("p", null,
      "Sleep off the descent. Restores everyone's HP and MP, and brings back the fallen."));
    const costRow = el("div", "reward");
    costRow.append(el("span", null, "Cost"), el("b", null, `${cost}g`));
    const purseRow = el("div", "reward");
    purseRow.append(el("span", null, "You have"), el("b", null, `${run.gold}g`));
    panel.append(costRow, purseRow);

    const actions = el("div", "panel__actions");
    const confirm = el("button", "rpg-button rpg-button--primary",
      affordable ? "Rest" : "Not enough gold");
    confirm.type = "button";
    confirm.disabled = !affordable;
    confirm.addEventListener("click", () => {
      run.gold -= cost;
      progress.rest(run);
      progress.save(run);
      audio.play("heal");
      closePanel();
      renderCamp();
    });
    const cancel = el("button", "rpg-button", "Back");
    cancel.type = "button";
    cancel.addEventListener("click", closePanel);
    actions.append(confirm, cancel);
    panel.append(actions);
  });
}

/* ---------- shop ---------- */

function openShop() {
  let tab = "items";

  const render = () => {
    openPanel((panel) => {
      panel.append(el("h2", null, "Shop"));
      panel.append(el("p", null, `Purse: ${run.gold}g`));

      const tabs = el("div", "shop-tabs");
      for (const [id, label] of [["items", "Supplies"], ["gear", "Gear"]]) {
        const button = el("button", "rpg-button", label);
        button.type = "button";
        button.setAttribute("aria-selected", String(tab === id));
        button.addEventListener("click", () => {
          tab = id;
          audio.play("select");
          render();
        });
        tabs.append(button);
      }
      panel.append(tabs);

      const list = el("div", "command-list");
      if (tab === "items") {
        for (const [id, item] of Object.entries(ITEMS)) {
          list.append(buyRow(
            item.name, `${item.blurb} (have ${run.inventory[id] || 0})`, item.price,
            () => {
              run.gold -= item.price;
              progress.addItem(run, id);
            }
          ));
        }
      } else {
        for (const member of run.party) {
          const hero = progress.heroById(member.id);
          for (const slot of ["weapon", "armor"]) {
            const tiers = GEAR[member.id][slot];
            const nextTier = tiers[member[slot] + 1];
            if (!nextTier) {
              list.append(buyRow(
                `${hero.name}: ${tiers[member[slot]].name}`, "Best available", null, null
              ));
              continue;
            }
            const gains = ["atk", "def", "mag", "res"]
              .filter((k) => nextTier[k])
              .map((k) => `+${nextTier[k]} ${k.toUpperCase()}`)
              .join(" ");
            list.append(buyRow(
              `${hero.name}: ${nextTier.name}`, gains, nextTier.price,
              () => {
                run.gold -= nextTier.price;
                member[slot] += 1;
              }
            ));
          }
        }
      }
      panel.append(list);

      const actions = el("div", "panel__actions");
      const done = el("button", "rpg-button rpg-button--primary", "Done");
      done.type = "button";
      done.addEventListener("click", () => {
        progress.save(run);
        closePanel();
        renderCamp();
      });
      actions.append(done);
      panel.append(actions);
    });
  };

  const buyRow = (title, subtitle, price, onBuy) => {
    const button = el("button", "rpg-button");
    button.type = "button";
    const label = el("span");
    label.append(document.createTextNode(title), el("small", null, subtitle ? ` ${subtitle}` : ""));
    button.append(label, el("span", "cost", price == null ? "—" : `${price}g`));
    button.disabled = price == null || run.gold < price;
    if (onBuy) {
      button.addEventListener("click", () => {
        onBuy();
        audio.play("coin");
        progress.save(run);
        render();
      });
    }
    return button;
  };

  render();
}

/* ---------- battle setup ---------- */

function startBattle() {
  const stage = STAGES[run.stage];
  battle = combat.startBattle(buildParty(), stage.enemies);
  cards.clear();

  dom.battleTitle.textContent = stage.name;
  dom.battleRound.textContent = "1";

  dom.enemyRow.replaceChildren(
    ...battle.enemies.map((enemy) => {
      const card = foeCard(enemy);
      cards.set(enemy.uid, card);
      return card;
    })
  );

  dom.battleParty.replaceChildren(
    ...battle.allies.map((ally) => {
      const member = memberFor(ally);
      const row = memberRow(ally, { level: member.level, interactive: true });
      cards.set(ally.uid, row);
      return row;
    })
  );

  setLog(stage.intro);
  showScreen("battle");
  roundLoop();
}

function refreshAll() {
  for (const enemy of battle.enemies) {
    const card = cards.get(enemy.uid);
    updateFoe(card, enemy);
    card.classList.toggle("is-dead", !enemy.alive);
  }
  for (const ally of battle.allies) {
    updateMember(cards.get(ally.uid), ally);
  }
}

/* ---------- command entry ---------- */

function clearTargeting() {
  for (const card of cards.values()) {
    card.classList.remove("is-targetable");
    card.onclick = null;
  }
}

function setActiveRow(fighter) {
  for (const ally of battle.allies) {
    cards.get(ally.uid).classList.toggle("is-active", ally.uid === fighter?.uid);
  }
}

function commandHead(title, onBack) {
  const head = el("div", "command-head");
  head.append(el("span", null, title));
  const back = el("button", "rpg-button rpg-button--quiet", "Back");
  back.type = "button";
  if (onBack) back.addEventListener("click", () => { audio.play("select"); onBack(); });
  else back.disabled = true;
  head.append(back);
  return head;
}

/* Renders the four top-level commands and resolves with the chosen one. */
function menuChoice(fighter, canGoBack) {
  return new Promise((resolve) => {
    dom.commands.replaceChildren();
    dom.commands.append(commandHead(fighter.name, canGoBack ? () => resolve("back") : null));

    const grid = el("div", "command-grid");
    for (const [id, label] of [
      ["attack", "Attack"], ["skill", "Skill"], ["item", "Item"], ["defend", "Defend"],
    ]) {
      const button = el("button", "rpg-button", label);
      button.type = "button";
      if (id === "skill" && !fighter.skills.length) button.disabled = true;
      if (id === "item" && !inventoryList().length) button.disabled = true;
      button.addEventListener("click", () => { audio.play("select"); resolve(id); });
      grid.append(button);
    }
    dom.commands.append(grid);
  });
}

function skillChoice(fighter) {
  return new Promise((resolve) => {
    dom.commands.replaceChildren();
    dom.commands.append(commandHead("Skill", () => resolve(null)));

    const list = el("div", "command-list");
    for (const id of fighter.skills) {
      const skill = SKILLS[id];
      const button = el("button", "rpg-button");
      button.type = "button";
      const label = el("span");
      label.append(document.createTextNode(skill.name), el("small", null, ` ${skill.blurb || ""}`));
      button.append(label, el("span", "cost", `${skill.mp} MP`));
      button.disabled = fighter.mp < skill.mp;
      button.addEventListener("click", () => { audio.play("select"); resolve(id); });
      list.append(button);
    }
    dom.commands.append(list);
  });
}

function itemChoice() {
  return new Promise((resolve) => {
    dom.commands.replaceChildren();
    dom.commands.append(commandHead("Item", () => resolve(null)));

    const list = el("div", "command-list");
    for (const [id, count] of inventoryList()) {
      const item = ITEMS[id];
      const button = el("button", "rpg-button");
      button.type = "button";
      const label = el("span");
      label.append(document.createTextNode(item.name), el("small", null, ` ${item.blurb}`));
      button.append(label, el("span", "cost", `x${count}`));
      button.addEventListener("click", () => { audio.play("select"); resolve(id); });
      list.append(button);
    }
    dom.commands.append(list);
  });
}

/* Highlights valid targets and resolves with the tapped fighter, or null if
   the player backs out. */
function pickTarget(kind) {
  const candidates =
    kind === "enemy" ? combat.living(battle.enemies)
      : kind === "ko" ? battle.allies.filter((a) => !a.alive)
        : combat.living(battle.allies);

  if (!candidates.length) return Promise.resolve(null);
  if (candidates.length === 1 && kind !== "enemy") return Promise.resolve(candidates[0]);

  return new Promise((resolve) => {
    dom.commands.replaceChildren();
    dom.commands.append(commandHead("Choose a target", () => {
      clearTargeting();
      resolve(null);
    }));

    for (const fighter of candidates) {
      const card = cards.get(fighter.uid);
      card.classList.add("is-targetable");
      card.onclick = () => {
        audio.play("select");
        clearTargeting();
        resolve(fighter);
      };
    }
  });
}

async function commandFor(fighter, canGoBack) {
  for (;;) {
    const choice = await menuChoice(fighter, canGoBack);
    if (choice === "back") return "back";

    if (choice === "defend") return { type: "defend" };

    if (choice === "attack") {
      const target = await pickTarget("enemy");
      if (!target) continue;
      return { type: "attack", targetUid: target.uid };
    }

    if (choice === "skill") {
      const skillId = await skillChoice(fighter);
      if (!skillId) continue;
      const skill = SKILLS[skillId];
      const needsPick = ["enemy", "ally", "ko"].includes(skill.target);
      let targetUid = null;
      if (needsPick) {
        const target = await pickTarget(skill.target);
        if (!target) continue;
        targetUid = target.uid;
      }
      return { type: "skill", skillId, targetUid };
    }

    if (choice === "item") {
      const itemId = await itemChoice();
      if (!itemId) continue;
      const item = ITEMS[itemId];
      const target = await pickTarget(item.target === "ko" ? "ko" : "ally");
      if (!target) continue;
      return { type: "item", itemId, targetUid: target.uid };
    }
  }
}

/* ---------- the round ---------- */

async function roundLoop() {
  while (!battle.over) {
    const order = combat.living(battle.allies);
    const commands = {};

    let index = 0;
    while (index < order.length) {
      const fighter = order[index];
      setActiveRow(fighter);

      // Asleep heroes don't get a command; the engine skips them anyway.
      if (combat.hasStatus(fighter, "sleep")) {
        setLog(`${fighter.name} is fast asleep.`);
        index += 1;
        continue;
      }

      const result = await commandFor(fighter, index > 0);
      if (result === "back") {
        index -= 1;
        delete commands[order[index].uid];
        continue;
      }
      commands[fighter.uid] = result;
      index += 1;
    }

    setActiveRow(null);
    dom.commands.replaceChildren(el("div", "busy", "Resolving…"));

    const { events, spent } = combat.resolveRound(battle, commands, run.inventory);
    for (const [itemId, count] of Object.entries(spent)) {
      progress.removeItem(run, itemId, count);
    }

    await playEvents(events);
  }
}

function anchorFor(uid) {
  return cards.get(uid);
}

async function playEvents(events) {
  for (const event of events) {
    switch (event.t) {
      case "act": {
        const actor = combat.findFighter(battle, event.uid);
        flash(anchorFor(event.uid), "is-acting");
        setLog(`${actor.name} — ${event.label}`);
        if (event.kind === "magic") audio.play("magic");
        await wait(360);
        break;
      }

      case "damage": {
        const target = combat.findFighter(battle, event.uid);
        const card = anchorFor(event.uid);
        flash(card, "is-hit");
        const kind = event.crit ? "crit" : event.effective === "weak" ? "weak"
          : event.effective === "resist" ? "resist" : null;
        const suffix = event.crit ? " CRIT" : event.effective === "weak" ? " WEAK" : "";
        floatText(card, `${event.amount}${suffix}`, kind);
        audio.play(event.crit ? "crit" : "hit");
        if (target.side === "ally") updateMember(card, target);
        else updateFoe(card, target);
        await wait(280);
        break;
      }

      case "heal": {
        const target = combat.findFighter(battle, event.uid);
        const card = anchorFor(event.uid);
        floatText(card, `+${event.amount}`, "heal");
        audio.play("heal");
        if (target.side === "ally") updateMember(card, target);
        else updateFoe(card, target);
        await wait(260);
        break;
      }

      case "mp": {
        const target = combat.findFighter(battle, event.uid);
        if (event.amount > 0) floatText(anchorFor(event.uid), `+${event.amount} MP`, "mp");
        if (target.side === "ally") updateMember(anchorFor(event.uid), target);
        await wait(event.amount > 0 ? 200 : 60);
        break;
      }

      case "status": {
        const target = combat.findFighter(battle, event.uid);
        const card = anchorFor(event.uid);
        if (target.side === "ally") updateMember(card, target);
        else updateFoe(card, target);
        await wait(event.expired ? 60 : 220);
        break;
      }

      case "tick": {
        setLog(`${combat.findFighter(battle, event.uid).name} suffers ${event.status}.`);
        await wait(160);
        break;
      }

      case "ko": {
        const target = combat.findFighter(battle, event.uid);
        const card = anchorFor(event.uid);
        audio.play("ko");
        setLog(`${target.name} falls!`);
        if (target.side === "ally") updateMember(card, target);
        else card.classList.add("is-dead");
        await wait(420);
        break;
      }

      case "revive": {
        const target = combat.findFighter(battle, event.uid);
        updateMember(anchorFor(event.uid), target);
        setLog(`${target.name} is back on their feet.`);
        audio.play("heal");
        await wait(400);
        break;
      }

      case "enrage": {
        setLog(event.text);
        flash(anchorFor(event.uid), "is-acting");
        await wait(700);
        break;
      }

      case "message":
        setLog(event.text);
        await wait(600);
        break;

      case "round":
        dom.battleRound.textContent = event.round;
        refreshAll();
        await wait(200);
        break;

      case "victory":
        await finishVictory(event);
        return;

      case "defeat":
        await finishDefeat();
        return;

      default:
        break;
    }
  }
}

/* ---------- outcomes ---------- */

async function finishVictory(event) {
  syncPartyToRun();
  audio.play("victory");
  setLog("The way is clear.");
  await wait(500);

  run.gold += event.gold;
  const levelUps = progress.grantXp(run, event.xp);
  if (levelUps.length) audio.play("levelup");

  const lastStage = run.stage >= STAGES.length - 1;
  if (lastStage) run.cleared = true;
  run.stage = lastStage ? 0 : run.stage + 1; // clearing loops back for a stronger second run
  progress.save(run);

  openPanel((panel) => {
    panel.append(el("h2", null, lastStage ? "Emberdeep is yours" : "Victory"));
    if (lastStage) {
      panel.append(el("p", null,
        "The Emberwyrm falls. The descent resets, but your levels and gear are yours to keep."));
    }

    const xpRow = el("div", "reward");
    xpRow.append(el("span", null, "XP"), el("b", null, `+${event.xp}`));
    const goldRow = el("div", "reward");
    goldRow.append(el("span", null, "Gold"), el("b", null, `+${event.gold}`));
    panel.append(xpRow, goldRow);

    for (const entry of levelUps) {
      const box = el("div", "levelup");
      const top = entry.gained[entry.gained.length - 1];
      box.append(el("b", null, `${entry.name} reached level ${top.level}!`));
      const totals = entry.gained.reduce(
        (sum, g) => ({
          hp: sum.hp + g.hp, mp: sum.mp + g.mp,
          atk: sum.atk + g.atk, def: sum.def + g.def, mag: sum.mag + g.mag,
        }),
        { hp: 0, mp: 0, atk: 0, def: 0, mag: 0 }
      );
      // Only list stats that actually moved - "+0 MAG" on a knight is noise.
      const summary = [["HP", totals.hp], ["MP", totals.mp], ["ATK", totals.atk],
      ["DEF", totals.def], ["MAG", totals.mag]]
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `+${value} ${label}`)
        .join("  ");
      box.append(el("div", null, summary));
      const learned = entry.gained.flatMap((g) => g.learned);
      if (learned.length) {
        box.append(el("div", "learned",
          `Learned ${learned.map((id) => SKILLS[id].name).join(", ")}`));
      }
      panel.append(box);
    }

    const actions = el("div", "panel__actions");
    const onward = el("button", "rpg-button rpg-button--primary", "Back to camp");
    onward.type = "button";
    onward.addEventListener("click", () => {
      closePanel();
      showCamp();
    });
    actions.append(onward);
    panel.append(actions);
  });
}

async function finishDefeat() {
  audio.play("defeat");
  setLog("Darkness takes you.");
  await wait(700);

  /* Losing costs gold, never progress or health. Sending the party back at a
     fraction of their HP reads as fair but compounds: they lose, retry weaker,
     lose again, and a player short of rest money gets stuck in a spiral they
     cannot escape. Full restore keeps the retry winnable. */
  const lost = Math.round(run.gold * 0.2);
  run.gold -= lost;
  progress.rest(run);
  progress.save(run);

  openPanel((panel) => {
    panel.append(el("h2", null, "Defeat"));
    panel.append(el("p", null,
      `The party is dragged back to camp, ${lost}g lighter. ${STAGES[run.stage].name} still waits.`));
    const actions = el("div", "panel__actions");
    const back = el("button", "rpg-button rpg-button--primary", "Back to camp");
    back.type = "button";
    back.addEventListener("click", () => {
      closePanel();
      showCamp();
    });
    actions.append(back);
    panel.append(actions);
  });
}

/* ---------- boot ---------- */

initTitle();
showScreen("title");

// Exposed purely so the automated playthrough can drive a run headlessly.
window.__emberdeep = {
  state: () => ({ run, battle }),
  setRun: (next) => { run = next; },
  progress, combat, MAX_LEVEL,
};
