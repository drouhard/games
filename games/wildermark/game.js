/* Wildermark: the shell.

   Screens, the overworld canvas, the towns, the deck builder and the save.
   Every rule lives in world.js / duel.js / ai.js; this file only ever asks
   them questions and draws the answers, which is what lets the same career be
   played headlessly by tools/wild-sim.mjs.

   Two conventions from the repo run through all of it. Nothing scrolls except
   a `.scroller`. And a tap reveals, a labelled button commits - the one
   exception being a step onto open ground, which costs nothing and can be
   walked back. */

import { CARDS, COLORS, COLOR_KEYS, cardText, costLabel, isLand } from "./cards.js";
import { DECK_MAX_COPIES, FOES, HERO_MAX_LIFE, PRICES, QUEST_KINDS, TERRAIN, WILDMAGIC } from "./data.js";
import * as world from "./world.js";
import { spriteCanvas } from "./sprites.js";
import { cardArt, cardEl, startDuel } from "./duelui.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, cls, fn) => {
  const b = el("button", `rune-button ${cls || ""}`, label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
};

let career = null;
let setup = { main: "ember", splash: "bramble" };
let deckTab = "deck";
let pendingFight = null; // what walking into something turned up
let deckReturn = "map";  // where "Done" in the deck builder goes back to

/* ---------- screens ------------------------------------------------------- */

function show(name) {
  for (const screen of document.querySelectorAll(".screen")) {
    screen.classList.toggle("is-active", screen.dataset.screen === name);
  }
  if (name === "map") requestAnimationFrame(drawMap);
  if (name === "deck") drawDeck();
}

function sheet(build) {
  const overlay = $("overlay");
  const panel = $("panel");
  panel.replaceChildren();
  build(panel, () => { overlay.hidden = true; });
  overlay.hidden = false;
}
const closeSheet = () => { $("overlay").hidden = true; };

/* ---------- save ---------------------------------------------------------- */

/* Writing the save is also the moment anything changed, so it is the one
   place that repaints the bar behind whatever panel is open. Binding a leyline
   from inside a town used to leave the HUD reading your old life total until
   you walked somewhere. */
const save = () => {
  try { localStorage.setItem(world.SAVE_KEY, world.serialize(career)); } catch { /* private mode */ }
  if (career && document.querySelector('[data-screen="map"].is-active')) refreshMap();
};
const load = () => {
  try { return world.deserialize(localStorage.getItem(world.SAVE_KEY) || ""); } catch { return null; }
};
const wipe = () => { try { localStorage.removeItem(world.SAVE_KEY); } catch { /* ignore */ } };

/* ---------- title --------------------------------------------------------- */

function buildTitle() {
  const art = $("title-art");
  art.replaceChildren(...["wardenSun", "wardenTide", "shardlord", "wardenEmber", "wardenBramble"].map(spriteCanvas));
  const saved = load();
  $("btn-continue").hidden = !saved;
  $("btn-continue").onclick = () => {
    career = load();
    if (!career) return;
    show(career.dungeon ? "dungeon" : "map");
    if (career.dungeon) drawDungeon(); else refreshMap();
  };
}

$("btn-new").onclick = () => { buildSetup(); show("setup"); };
$("btn-how").onclick = howToPlay;
$("btn-end-new").onclick = () => { wipe(); buildSetup(); show("setup"); };
for (const b of document.querySelectorAll("[data-back]")) {
  b.addEventListener("click", () => {
    let to = b.dataset.back;
    if (to === "map" && career?.dungeon && deckReturn === "dungeon") { show("dungeon"); drawDungeon(); return; }
    if (to === "map" && career) refreshMap();
    show(to);
  });
}

function howToPlay() {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, "The Wildermark"));
    panel.appendChild(el("p", "lead", "Five wardens hold five keeps. Beat all five and the Spire opens."));
    panel.appendChild(el("h3", null, "Your life does not reset"));
    panel.appendChild(el("p", null, "Damage you take in a duel is still gone on the next one. It comes back slowly as you walk, or all at once for coin at an inn. Deciding how far to push before you turn back is the whole overworld."));
    panel.appendChild(el("h3", null, "Duels"));
    panel.appendChild(el("p", null, "One land a turn. Tap a card to read it, then press Cast. Creatures cannot attack the turn they arrive unless they have Haste. Reflex cards are combat tricks: they only cast while blockers are being declared."));
    panel.appendChild(el("h3", null, "Ante"));
    panel.appendChild(el("p", null, "Every duel is played for a card. Win and you take theirs; lose and you lose a spare of yours, or gold if you have no spare. You can waive your winnings for coin and a rumour instead."));
    panel.appendChild(el("h3", null, "Bleeding a warden"));
    panel.appendChild(el("p", null, "Every creature of a colour you put down out in the world takes two life off that colour's warden before you ever knock on its door. Leylines, bought in towns, raise your own."));
    panel.appendChild(button("Close", "", close));
  });
}

/* ---------- setup --------------------------------------------------------- */

const COLOR_BLURB = {
  sun: "Ranks that hold, and life you get back.",
  tide: "Fliers, and the tempo to keep them alive.",
  rot: "Drain, decay, and creatures that hurt to kill.",
  ember: "Burn, haste, and damage that goes anywhere.",
  bramble: "The biggest bodies, and the mana to land them early.",
};

function buildSetup() {
  const paint = (host, key) => {
    host.replaceChildren();
    for (const color of COLOR_KEYS) {
      const node = el("button", `color-pick ${setup[key] === color ? "is-on" : ""}`);
      node.type = "button";
      node.style.color = COLORS[color].tint;
      node.appendChild(el("i", null, COLORS[color].glyph));
      const text = el("span", null, COLORS[color].name);
      text.appendChild(el("small", null, COLOR_BLURB[color]));
      node.appendChild(text);
      node.addEventListener("click", () => {
        setup[key] = color;
        if (setup.main === setup.splash) {
          setup[key === "main" ? "splash" : "main"] = COLOR_KEYS.find((c) => c !== color);
        }
        buildSetup();
      });
      host.appendChild(node);
    }
  };
  paint($("setup-main"), "main");
  paint($("setup-splash"), "splash");
}

$("btn-begin").onclick = () => {
  career = world.newCareer({ seed: Math.floor(Math.random() * 1e9), main: setup.main, splash: setup.splash });
  save();
  show("map");
  refreshMap();
};

/* ---------- the overworld canvas ------------------------------------------ */

const canvas = $("map");
const ctx = canvas.getContext("2d");
let tileSize = 14;

const SITE_GLYPH = { town: "⌂", keep: "♜", dungeon: "▼", shrine: "▲", spire: "✦" };

function drawMap() {
  if (!career) return;
  const wrap = canvas.parentElement;
  const box = wrap.getBoundingClientRect();
  const avail = { w: box.width - 4, h: box.height - 4 };
  tileSize = Math.max(7, Math.floor(Math.min(avail.w / world.MAP_W, avail.h / world.MAP_H)));
  const w = tileSize * world.MAP_W;
  const h = tileSize * world.MAP_H;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < world.MAP_H; y++) {
    for (let x = 0; x < world.MAP_W; x++) {
      const t = TERRAIN[world.terrainAt(career, x, y)];
      // A cheap deterministic dither so the ground has grain without noise
      // that crawls every frame.
      const speck = ((x * 73856093) ^ (y * 19349663)) & 3;
      ctx.fillStyle = speck === 0 ? t.tint2 : t.tint;
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }

  for (const site of career.sites) {
    if (site.kind === "spire" && site.hidden) continue;
    const cx = site.x * tileSize;
    const cy = site.y * tileSize;
    ctx.fillStyle = "rgba(10,10,18,0.65)";
    ctx.fillRect(cx, cy, tileSize, tileSize);
    ctx.fillStyle = site.kind === "town" ? "#e8e6df" : (COLORS[site.color]?.tint || "#e8e6df");
    ctx.font = `${Math.round(tileSize * 0.82)}px ui-rounded, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(SITE_GLYPH[site.kind], cx + tileSize / 2, cy + tileSize / 2 + 1);
    if (site.kind === "keep" && career.wardens[site.color]) {
      ctx.strokeStyle = "rgba(232,230,223,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy + 2); ctx.lineTo(cx + tileSize - 2, cy + tileSize - 2);
      ctx.moveTo(cx + tileSize - 2, cy + 2); ctx.lineTo(cx + 2, cy + tileSize - 2);
      ctx.stroke();
    }
  }

  for (const m of career.monsters) {
    const art = FOES[m.foe].art;
    ctx.drawImage(spriteCanvas(art), m.x * tileSize, m.y * tileSize, tileSize, tileSize);
    if (m.tier >= 2) {
      ctx.fillStyle = m.tier === 3 ? "#e2564a" : "#ffd66b";
      ctx.fillRect(m.x * tileSize, m.y * tileSize, Math.max(2, tileSize * 0.22), Math.max(2, tileSize * 0.22));
    }
  }

  ctx.strokeStyle = "#ffd66b";
  ctx.lineWidth = 2;
  ctx.strokeRect(career.x * tileSize + 1, career.y * tileSize + 1, tileSize - 2, tileSize - 2);
  ctx.drawImage(spriteCanvas("hero"), career.x * tileSize, career.y * tileSize, tileSize, tileSize);
}

/* Every tap is a direction, not a destination: tap anywhere and you take one
   step that way. On a phone that is far more forgiving than asking for a
   thumb on one 14-pixel tile. */
canvas.addEventListener("click", (event) => {
  if (!career) return;
  const box = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - box.left) / box.width) * world.MAP_W);
  const y = Math.floor(((event.clientY - box.top) / box.height) * world.MAP_H);
  if (x === career.x && y === career.y) { lookHere(); return; }
  step(Math.sign(x - career.x), Math.sign(y - career.y));
});

$("dpad").addEventListener("click", (event) => {
  const target = event.target.closest("[data-dir]");
  if (!target || !career) return;
  const [dx, dy] = target.dataset.dir.split(",").map(Number);
  if (!dx && !dy) { lookHere(); return; }
  step(dx, dy);
});

function step(dx, dy) {
  if (!dx && !dy) return;
  const result = world.walk(career, dx, dy);
  if (result.kind === "blocked") { note("The sea stops you."); refreshMap(); return; }
  refreshMap();
  save();
  if (result.kind === "monster") meetMonster(result.monster, result.ambush);
  else if (result.kind === "site") arrive(result.site);
}

function lookHere() {
  const site = world.siteAt(career, career.x, career.y);
  if (site) { arrive(site); return; }
  const t = TERRAIN[world.terrainAt(career, career.x, career.y)];
  const near = career.monsters
    .filter((m) => Math.max(Math.abs(m.x - career.x), Math.abs(m.y - career.y)) <= 3)
    .map((m) => FOES[m.foe].name);
  note(near.length ? `${t.name}. You can hear ${near[0].toLowerCase()} close by.` : `${t.name}. Nothing moving.`);
}

function refreshMap() {
  if (!career) return;
  drawMap();
  $("hud-life").innerHTML = `♥ <b>${career.life}</b><i>/${career.maxLife}</i>`;
  $("hud-gold").innerHTML = `◎ <b>${career.gold}</b>`;
  const sig = $("hud-sigils");
  sig.replaceChildren();
  for (const color of COLOR_KEYS) {
    const span = el("span", career.sigils[color] ? "has" : "", `${COLORS[color].glyph}${career.sigils[color]}`);
    span.style.color = COLORS[color].tint;
    sig.appendChild(span);
  }
  $("deck-count").textContent = career.deck.length;
  const last = career.log[career.log.length - 1];
  const log = $("map-log");
  log.textContent = last ? last.text : "";
  log.className = `log ${last?.kind === "good" || last?.kind === "bad" ? last.kind : ""}`;
  const here = world.siteAt(career, career.x, career.y);
  $("map-place").textContent = here && !(here.kind === "spire" && here.hidden)
    ? here.name
    : TERRAIN[world.terrainAt(career, career.x, career.y)].name;
}

function note(text, kind = "info") {
  career.log.push({ text, kind });
  if (career.log.length > 60) career.log.shift();
  refreshMap();
}

window.addEventListener("resize", () => { if (career) drawMap(); });
window.addEventListener("orientationchange", () => setTimeout(() => career && drawMap(), 250));

/* ---------- meeting something --------------------------------------------- */

function meetMonster(monster, ambush) {
  const def = FOES[monster.foe];
  const rng = world.rngOf(career);
  const ante = world.anteFor(career, monster.foe, rng);
  world.saveRng(career, rng);
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, def.name));
    const strip = el("div", "shelf");
    strip.appendChild(portraitOf(def.art));
    panel.appendChild(strip);
    panel.appendChild(el("p", "lead", `${ambush ? "It comes at you out of the " : "It is standing in the "}${TERRAIN[world.terrainAt(career, monster.x, monster.y)].name.toLowerCase()}. ${COLORS[def.color].name}, ${["", "roadside", "deep country", "warden's own"][def.tier] || ""}. ${def.life} life.`));
    panel.appendChild(el("p", null, `It stakes ${CARDS[ante.theirs].name}. You stake ${ante.mine ? CARDS[ante.mine].name : `${world.FLEE_COST + 15} gold — you have no spare card`}.`));
    panel.appendChild(button("Duel it", "rune-button--go", () => {
      close();
      pendingFight = { kind: "wild", foeKey: monster.foe, monsterId: monster.id, ante };
      launchDuel(monster.foe, ante);
    }));
    panel.appendChild(button(`Back away (${world.FLEE_COST} gold)`, "", () => {
      close();
      world.flee(career, monster);
      save();
      refreshMap();
    }));
  });
}

const portraitOf = (art) => {
  const box = el("div", "portrait");
  box.appendChild(spriteCanvas(art));
  return box;
};

function arrive(site) {
  if (site.kind === "town") { world.arriveTown(career, site); save(); townPanel(site); return; }
  if (site.kind === "shrine") { shrinePanel(site); return; }
  if (site.kind === "keep") { keepPanel(site); return; }
  if (site.kind === "dungeon") { dungeonPanel(site); return; }
  if (site.kind === "spire" && !site.hidden) { spirePanel(site); return; }
}

/* ---------- duels launched from the world --------------------------------- */

function launchDuel(foeKey, ante) {
  const rng = world.rngOf(career);
  const heroFirst = rng() < 0.5;
  world.saveRng(career, rng);
  show("duel");
  startDuel({
    hero: world.heroPlayer(career),
    foe: world.foePlayer(career, foeKey),
    foeDef: FOES[foeKey],
    ante,
    rng: world.rngOf(career),
    heroFirst,
    onDone: (result) => finishDuel(foeKey, ante, result),
  });
}

function finishDuel(foeKey, ante, result) {
  const job = pendingFight;
  pendingFight = null;

  if (!result.win) {
    const loss = world.loseDuel(career, foeKey, ante);
    save();
    sheet((panel, close) => {
      panel.appendChild(el("h2", null, "Beaten"));
      panel.appendChild(el("p", "lead", loss.lost
        ? `${CARDS[loss.lost].name} goes into their satchel. You wake on the road to ${loss.town.name}, whole.`
        : `They take ${loss.tithe} gold and leave your deck alone. You wake on the road to ${loss.town.name}, whole.`));
      panel.appendChild(button("Get up", "rune-button--go", () => { close(); show("map"); refreshMap(); }));
    });
    return;
  }

  if (job?.kind === "dungeon") {
    const step = world.clearRoom(career, result.lifeLeft);
    save();
    if (step?.done) {
      sheet((panel, close) => {
        panel.appendChild(el("h2", null, "Cleared"));
        panel.appendChild(el("p", "lead", `${CARDS[step.prize].name}, a ${COLORS[step.sigil].name} sigil and ${step.gold} gold.`));
        panel.appendChild(cardShelf([step.prize]));
        panel.appendChild(button("Climb out", "rune-button--go", () => { close(); show("map"); refreshMap(); }));
      });
    } else {
      show("dungeon");
      drawDungeon();
    }
    return;
  }

  // Out in the world: the ante is a real choice, so it gets a real prompt.
  const spoils = () => {
    if (job?.monsterId) career.monsters = career.monsters.filter((m) => m.id !== job.monsterId);
  };
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, "Won"));
    panel.appendChild(el("p", "lead", `You walk away on ${result.lifeLeft} life. It does not come back on its own quickly.`));
    panel.appendChild(cardShelf([ante.theirs]));
    panel.appendChild(button(`Take ${CARDS[ante.theirs].name}`, "rune-button--go", () => {
      spoils();
      const got = world.winDuel(career, foeKey, ante, { takeAnte: true, lifeLeft: result.lifeLeft });
      save();
      close();
      afterWorldWin(foeKey, `${CARDS[got.prize].name} and ${got.gold} gold.`);
    }));
    panel.appendChild(button("Waive it for coin and a rumour", "", () => {
      spoils();
      world.winDuel(career, foeKey, ante, { takeAnte: false, lifeLeft: result.lifeLeft });
      save();
      close();
      afterWorldWin(foeKey, career.log[career.log.length - 1]?.text || "");
    }));
  });
}

function afterWorldWin(foeKey, line) {
  if (career.won) { endScreen(true); return; }
  show("map");
  refreshMap();
  if (line) note(line, "good");
  if (FOES[foeKey].tier === 4) save();
}

function cardShelf(ids) {
  const shelf = el("div", "shelf");
  for (const id of ids) {
    const node = cardEl(id);
    node.addEventListener("click", () => readCard(id));
    shelf.appendChild(node);
  }
  return shelf;
}

function readCard(id) {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, CARDS[id].name));
    panel.appendChild(el("p", "lead", CARDS[id].type === "land" ? "Land" : `${costLabel(id)} · ${CARDS[id].type}`));
    panel.appendChild(el("p", null, cardText(id)));
    panel.appendChild(button("Close", "", close));
  });
}

/* ---------- towns ---------------------------------------------------------- */

function townPanel(site) {
  const q = site.quest;
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, site.name));
    panel.appendChild(el("p", null, `A ${COLORS[site.color].name} town. ${career.gold} gold in your purse, ${career.life} of ${career.maxLife} life in you.`));

    const inn = PRICES.inn(career.leylines);
    const rest = button(
      career.life >= career.maxLife ? "You need no bed" : `Sleep until dawn (${inn} gold)`,
      "",
      () => { world.restAtInn(career); save(); close(); townPanel(site); },
    );
    rest.disabled = career.life >= career.maxLife || career.gold < inn;
    panel.appendChild(rest);

    const leyCost = PRICES.leyline(career.leylines);
    const ley = button(
      career.maxLife >= HERO_MAX_LIFE ? "The leylines have nothing left for you" : `Bind a leyline · +2 life forever (${leyCost} gold)`,
      "",
      () => { world.bindLeyline(career); save(); close(); townPanel(site); },
    );
    ley.disabled = career.gold < leyCost || career.maxLife >= HERO_MAX_LIFE;
    panel.appendChild(ley);

    panel.appendChild(button("Market", "", () => { close(); marketPanel(site); }));

    panel.appendChild(el("h3", null, "The board outside"));
    if (career.quest && !career.quest.done && career.quest.town === site.id) {
      const kind = QUEST_KINDS.find((k) => k.kind === career.quest.kind);
      panel.appendChild(el("p", "lead", kind.text(career.quest)));
      const ready = world.questReady(career);
      panel.appendChild(el("p", null, career.quest.kind === "purse"
        ? `You hold ${career.gold} of ${career.quest.need}.`
        : `${career.quest.progress} of ${career.quest.need} done.`));
      const hand = button(ready ? "Hand it in" : "Not yet", "rune-button--go", () => {
        const got = world.turnInQuest(career, site);
        save();
        close();
        if (got) note(`A ${COLORS[got.sigil].name} sigil${got.gold ? ` and ${got.gold} gold` : ""}.`, "good");
        townPanel(site);
      });
      hand.disabled = !ready;
      panel.appendChild(hand);
    } else if (career.quest && !career.quest.done) {
      const kind = QUEST_KINDS.find((k) => k.kind === career.quest.kind);
      panel.appendChild(el("p", null, `You are already carrying work: ${kind.text(career.quest)}`));
    } else {
      const kind = QUEST_KINDS.find((k) => k.kind === q.kind);
      panel.appendChild(el("p", "lead", kind.text(q)));
      panel.appendChild(el("p", null, "Pays a sigil. Sigils buy wildmagic."));
      panel.appendChild(button("Take it on", "", () => { world.takeQuest(career, site); save(); close(); townPanel(site); }));
    }

    panel.appendChild(button("Back to the road", "", () => { close(); show("map"); refreshMap(); }));
  });
}

function marketPanel(site) {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, `${site.name} market`));
    panel.appendChild(el("p", null, `${career.gold} gold.`));

    const shelf = el("div", "shelf");
    for (const id of site.stock || []) {
      const wrap = el("div", null);
      wrap.style.cssText = "display:flex;flex-direction:column;gap:2px;align-items:center";
      const node = cardEl(id);
      node.addEventListener("click", () => readCard(id));
      wrap.appendChild(node);
      const buy = el("button", "chip-button", `${CARDS[id].price || 40} ◎`);
      buy.type = "button";
      buy.disabled = career.gold < (CARDS[id].price || 40);
      if (buy.disabled) buy.style.opacity = "0.4";
      buy.addEventListener("click", () => {
        if (world.buyCard(career, site, id)) { save(); close(); marketPanel(site); }
      });
      wrap.appendChild(buy);
      shelf.appendChild(wrap);
    }
    if (!(site.stock || []).length) panel.appendChild(el("p", null, "The stalls are bare. Come back after a few days on the road."));
    panel.appendChild(shelf);

    const landId = COLORS[site.color].land;
    const rowA = el("div", "panel-row");
    rowA.appendChild(button(`5 × ${CARDS[landId].name} (${site.landPrice * 5} ◎)`, "", () => {
      if (world.buyLand(career, site, 5)) { save(); close(); marketPanel(site); }
    }));
    rowA.appendChild(button(`Fresh stock (${PRICES.restock} ◎)`, "", () => {
      if (world.restock(career, site)) { save(); close(); marketPanel(site); }
    }));
    panel.appendChild(rowA);

    panel.appendChild(el("h3", null, "Sell your spares"));
    // Lands never go on the block: eight gold for a Sunfield is a trap, and
    // selling your mana base is the one mistake you cannot buy your way out of.
    const spares = Object.keys(career.collection)
      .filter((id) => career.collection[id] >= 2 && !isLand(id))
      .sort((a, b) => (CARDS[b].price || 0) - (CARDS[a].price || 0))
      .slice(0, 8);
    if (!spares.length) panel.appendChild(el("p", null, "You have nothing you could stand to lose."));
    const sellShelf = el("div", "shelf");
    for (const id of spares) {
      const wrap = el("div", null);
      wrap.style.cssText = "display:flex;flex-direction:column;gap:2px;align-items:center";
      wrap.appendChild(cardEl(id, { small: true }));
      const price = Math.max(4, Math.round((CARDS[id].price || 20) * PRICES.sellShare));
      wrap.appendChild(button(`sell ${price} ◎`, "chip-button", () => {
        world.sellCard(career, id);
        save(); close(); marketPanel(site);
      }));
      sellShelf.appendChild(wrap);
    }
    panel.appendChild(sellShelf);

    panel.appendChild(button("Back to town", "", () => { close(); townPanel(site); }));
  });
}

/* ---------- shrines, keeps, the Spire -------------------------------------- */

function shrinePanel(site) {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, site.name));
    if (site.taken) {
      panel.appendChild(el("p", "lead", "You have already taken what it had."));
    } else {
      panel.appendChild(el("p", "lead", `${COLORS[site.color].name} mana pools in the cracks. There is a sigil in there.`));
      panel.appendChild(button("Take the sigil", "rune-button--go", () => {
        world.takeShrine(career, site);
        save(); close(); show("map"); refreshMap();
      }));
    }
    panel.appendChild(button("Leave it", "", () => { close(); show("map"); refreshMap(); }));
  });
}

function keepPanel(site) {
  const def = FOES[site.foe];
  const beaten = career.wardens[site.color];
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, site.name));
    const shelf = el("div", "shelf");
    shelf.appendChild(portraitOf(def.art));
    panel.appendChild(shelf);
    if (beaten) {
      panel.appendChild(el("p", "lead", `${def.name} is already down. The keep is quiet.`));
      panel.appendChild(button("Leave", "", () => { close(); show("map"); refreshMap(); }));
      return;
    }
    const life = world.foeLife(career, site.foe);
    panel.appendChild(el("p", "lead", `${def.name} waits inside on ${life} life.`));
    panel.appendChild(el("p", null, `You have put down ${career.kills[site.color]} ${COLORS[site.color].name} creatures. Each one took two life off it before you got here — from ${def.life} down to ${life}, and it stops falling at 14.`));
    panel.appendChild(el("p", null, `You are on ${career.life} of ${career.maxLife}. Nothing in there heals you.`));
    const rng = world.rngOf(career);
    const ante = world.anteFor(career, site.foe, rng);
    world.saveRng(career, rng);
    panel.appendChild(button("Knock", "rune-button--go", () => {
      close();
      pendingFight = { kind: "keep", foeKey: site.foe, ante };
      launchDuel(site.foe, ante);
    }));
    panel.appendChild(button("Come back stronger", "", () => { close(); show("map"); refreshMap(); }));
  });
}

function spirePanel(site) {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, "The Spire"));
    const shelf = el("div", "shelf");
    shelf.appendChild(portraitOf("shardlord"));
    panel.appendChild(shelf);
    panel.appendChild(el("p", "lead", "All five colours, and it holds every one of them at once. 30 life, and no warden left to bleed it for you."));
    panel.appendChild(el("p", null, `You are on ${career.life} of ${career.maxLife}.`));
    const rng = world.rngOf(career);
    const ante = world.anteFor(career, "shardlord", rng);
    world.saveRng(career, rng);
    panel.appendChild(button("Climb it", "rune-button--go", () => {
      close();
      pendingFight = { kind: "spire", foeKey: "shardlord", ante };
      launchDuel("shardlord", ante);
    }));
    panel.appendChild(button("Not yet", "", () => { close(); show("map"); refreshMap(); }));
  });
}

/* ---------- dungeons -------------------------------------------------------- */

function dungeonPanel(site) {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, site.name));
    if (site.cleared) {
      panel.appendChild(el("p", "lead", "Empty. You took everything worth taking."));
      panel.appendChild(button("Leave", "", () => { close(); show("map"); refreshMap(); }));
      return;
    }
    panel.appendChild(el("p", "lead", `${site.rooms} rooms of ${COLORS[site.color].name}. Nothing heals between them and nothing follows you out — but the prize only lands if you clear the last one.`));
    panel.appendChild(el("p", null, `You are on ${career.life} of ${career.maxLife}.`));
    panel.appendChild(button("Go down", "rune-button--go", () => {
      world.enterDungeon(career, site);
      save(); close(); show("dungeon"); drawDungeon();
    }));
    panel.appendChild(button("Not today", "", () => { close(); show("map"); refreshMap(); }));
  });
}

function drawDungeon() {
  const d = career.dungeon;
  if (!d) { show("map"); refreshMap(); return; }
  $("dungeon-name").textContent = d.name;
  $("dungeon-room").textContent = `${d.at + 1} of ${d.rooms.length} · ♥ ${career.life}`;
  const host = $("dungeon-rooms");
  host.replaceChildren();
  d.rooms.forEach((key, i) => {
    const def = FOES[key];
    const node = el("div", `room ${i < d.at ? "is-done" : i === d.at ? "is-now" : ""}`);
    node.appendChild(spriteCanvas(def.art));
    node.appendChild(el("span", null, i < d.at ? "down" : def.name));
    host.appendChild(node);
  });
  const next = d.at < d.rooms.length ? FOES[d.rooms[d.at]] : null;
  $("dungeon-note").textContent = next
    ? `${next.name} is behind this one, on ${next.life} life. You carry ${career.life} of ${career.maxLife} in, and nothing down here will give any of it back.`
    : "";
  $("dungeon-prize").textContent =
    `At the bottom: a ${COLORS[d.color].name} sigil, coin, and something rare. Climb out early and none of it is yours — but every room you clear pays on its own and bleeds the ${COLORS[d.color].name} warden.`;
  $("dungeon-art").replaceChildren(next ? spriteCanvas(next.art) : spriteCanvas("hero"));
  $("btn-dungeon-next").onclick = () => {
    const key = d.rooms[d.at];
    const rng = world.rngOf(career);
    const ante = world.anteFor(career, key, rng);
    world.saveRng(career, rng);
    pendingFight = { kind: "dungeon", foeKey: key, ante };
    launchDuel(key, ante);
  };
  $("btn-dungeon-deck").onclick = () => { deckReturn = "dungeon"; show("deck"); };
  $("btn-dungeon-leave").onclick = () => {
    world.leaveDungeon(career);
    save();
    show("map");
    refreshMap();
  };
}

/* ---------- the deck builder ------------------------------------------------ */

$("btn-deck").onclick = () => { deckReturn = "map"; show("deck"); };
$("btn-deck-done").onclick = () => {
  save();
  if (deckReturn === "dungeon" && career.dungeon) { show("dungeon"); drawDungeon(); return; }
  show("map");
  refreshMap();
};
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    deckTab = tab.dataset.tab;
    for (const other of document.querySelectorAll(".tab")) other.classList.toggle("is-on", other === tab);
    drawDeck();
  });
}

const deckCount = (id) => career.deck.filter((c) => c === id).length;

function drawDeck() {
  if (!career) return;
  const host = $("deck-list");
  host.replaceChildren();
  const owned = Object.keys(career.collection).sort((a, b) => {
    const ca = CARDS[a], cb = CARDS[b];
    return (ca.type === "land" ? -1 : 0) - (cb.type === "land" ? -1 : 0)
      || (ca.cost || 0) - (cb.cost || 0)
      || ca.name.localeCompare(cb.name);
  });

  for (const id of owned) {
    const inDeck = deckCount(id);
    if (deckTab === "deck" && !inDeck) continue;
    if (deckTab === "rest" && inDeck >= career.collection[id]) continue;
    host.appendChild(deckRow(id, inDeck));
  }
  if (!host.children.length) {
    host.appendChild(el("p", "blurb", deckTab === "deck" ? "Nothing in the deck yet." : "Everything you own is already in the deck."));
  }

  const problems = world.deckProblems(career.deck);
  $("deck-warn").textContent = problems[0] || "";
  $("btn-deck-done").disabled = problems.length > 0;
  $("deck-meta").textContent = `${career.deck.length} cards`;
  const lands = career.deck.filter(isLand).length;
  const curve = [0, 0, 0, 0];
  for (const id of career.deck) {
    if (isLand(id)) continue;
    const c = CARDS[id].cost;
    curve[c <= 2 ? 0 : c === 3 ? 1 : c === 4 ? 2 : 3] += 1;
  }
  $("deck-curve").textContent = `${lands} land · 1-2: ${curve[0]} · 3: ${curve[1]} · 4: ${curve[2]} · 5+: ${curve[3]}`;
}

function deckRow(id, inDeck) {
  const def = CARDS[id];
  const row = el("div", "row");
  row.appendChild(cardArt(id));
  const text = el("div");
  text.appendChild(el("div", "row__name", `${def.name}${def.type === "land" ? "" : `  ${costLabel(id)}`}`));
  text.appendChild(el("div", "row__text", cardText(id)));
  row.appendChild(text);
  row.appendChild(el("span", "row__count", `${inDeck}/${career.collection[id]}`));
  const btns = el("div", "row__btns");
  const minus = el("button", null, "−");
  minus.type = "button";
  minus.addEventListener("click", () => {
    const at = career.deck.lastIndexOf(id);
    if (at >= 0) career.deck.splice(at, 1);
    drawDeck();
  });
  const plus = el("button", null, "+");
  plus.type = "button";
  plus.addEventListener("click", () => {
    if (inDeck >= career.collection[id]) return;
    if (def.type !== "land" && inDeck >= DECK_MAX_COPIES) return;
    career.deck.push(id);
    drawDeck();
  });
  btns.append(minus, plus);
  row.appendChild(btns);
  row.addEventListener("click", (event) => { if (!event.target.closest("button")) readCard(id); });
  return row;
}

/* ---------- journal and wildmagic -------------------------------------------- */

$("btn-journal").onclick = () => {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, "Journal"));
    panel.appendChild(el("h3", null, "The five"));
    for (const color of COLOR_KEYS) {
      const key = `warden${color[0].toUpperCase()}${color.slice(1)}`;
      const kv = el("div", "kv");
      const name = el("span", null, `${COLORS[color].glyph} ${FOES[key].name.split(" of ")[0]}`);
      name.style.color = COLORS[color].tint;
      kv.appendChild(name);
      kv.appendChild(el("b", career.wardens[color] ? "tick" : "cross",
        career.wardens[color] ? "beaten" : `${world.foeLife(career, key)} life · ${career.kills[color]} bled`));
      panel.appendChild(kv);
    }
    panel.appendChild(el("h3", null, "You"));
    panel.appendChild(el("p", null, `${career.leylines} leylines bound. ${career.stats.wins} duels won, ${career.stats.losses} lost. ${career.stats.rooms} dungeon rooms cleared. ${Object.values(career.collection).reduce((a, b) => a + b, 0)} cards in the satchel.`));
    panel.appendChild(el("h3", null, "Places you have seen"));
    panel.appendChild(el("p", null, career.sites.filter((s) => career.seen.includes(s.id)).map((s) => s.name).join(", ") || "Only the road."));
    panel.appendChild(button("How to play", "", () => { close(); howToPlay(); }));
    panel.appendChild(button("Abandon this journey", "", () => {
      close();
      sheet((p2, c2) => {
        p2.appendChild(el("h2", null, "Abandon it?"));
        p2.appendChild(el("p", "lead", "The map, the deck and everything in the satchel go with it."));
        p2.appendChild(button("Yes, start again", "rune-button--go", () => { wipe(); career = null; c2(); buildTitle(); show("title"); }));
        p2.appendChild(button("No", "", c2));
      });
    }));
    panel.appendChild(button("Close", "", close));
  });
};

$("btn-wild").onclick = () => {
  sheet((panel, close) => {
    panel.appendChild(el("h2", null, "Wildmagic"));
    panel.appendChild(el("p", null, "Two sigils of a colour teaches you its magic. Sigils come from quests, shrines and the bottom of dungeons."));
    for (const color of COLOR_KEYS) {
      const w = WILDMAGIC[color];
      const known = career.wildmagic[color];
      panel.appendChild(el("h3", null, `${COLORS[color].glyph} ${w.name} — ${career.sigils[color]} sigil${career.sigils[color] === 1 ? "" : "s"}`));
      panel.appendChild(el("p", null, w.help));
      if (!known) {
        const learn = button(`Learn it (2 ${COLORS[color].name} sigils)`, "", () => {
          world.learnWildmagic(career, color);
          save(); close(); $("btn-wild").click();
        });
        learn.disabled = career.sigils[color] < 2;
        panel.appendChild(learn);
      } else if (color === "ember") {
        const use = button(career.emberstride > 0 ? `Holding for ${career.emberstride} ticks` : "Spend a sigil — freeze the map", "", () => {
          world.useEmberstride(career);
          save(); close(); refreshMap();
        });
        use.disabled = career.sigils.ember < 1 || career.emberstride > 0;
        panel.appendChild(use);
      } else if (color === "tide") {
        const seen = career.sites.filter((s) => s.kind === "town" && career.seen.includes(s.id));
        const row = el("div", "panel-row");
        for (const site of seen) {
          const go = button(site.name, "", () => {
            if (world.tidewalk(career, site.id)) { save(); close(); show("map"); refreshMap(); }
          });
          go.disabled = career.sigils.tide < 1 || (site.x === career.x && site.y === career.y);
          row.appendChild(go);
        }
        panel.appendChild(row);
      } else {
        panel.appendChild(el("p", "lead", "Known. It is always on."));
      }
    }
    panel.appendChild(button("Close", "", close));
  });
};

/* ---------- the end ---------------------------------------------------------- */

function endScreen(won) {
  $("end-title").textContent = won ? "THE SPIRE FALLS" : "THE ROAD ENDS";
  $("end-note").textContent = won
    ? `Five keeps, the Spire, ${career.stats.wins} duels won and ${career.leylines} leylines bound.`
    : "";
  $("end-art").replaceChildren(spriteCanvas("hero"), spriteCanvas("shardlord"));
  wipe();
  show("end");
}

/* ---------- go ---------------------------------------------------------------- */

buildTitle();
buildSetup();
show("title");
