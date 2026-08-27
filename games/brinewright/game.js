/* Everything that touches the browser: the frame loop, the cards, the two
   dials under your thumb, and the save. The rules live in engine.js and the
   numbers in data.js, and neither knows this file exists.

   The loop feeds real elapsed time to the engine in its own fixed steps, so a
   slow phone or a backgrounded tab changes how smooth the cellar looks but
   never how it ferments - and it is the same code path tools/brine-sim.mjs
   uses to play twelve-hour careers in Node.

   The panel is rebuilt wholesale a few times a second and every tap is handled
   by one delegated listener, so a redraw can never land between a finger going
   down and the handler that was attached to the button it landed on. */

import {
  TUNING, RESOURCES, RES_BY_ID, CULTURES, CULTURE_BY_ID, WILD, VESSELS,
  VESSEL_BY_ID, SYMBIOSES, UPGRADES, MOTHER_UPGRADES, SPORE_UPGRADES, STRAINS,
  SPORE_BY_ID, GENES, newSave, fmt, fmtTime, buildingCost, slotCost, tierCost,
} from "./data.js";
import * as E from "./engine.js";
import { spriteCanvas } from "./sprites.js";

const SAVE_KEY = "brinewright:save";
const $ = (id) => document.getElementById(id);

const dom = {
  larder: $("larder"), strip: $("legacy-strip"), panel: $("panel"), tabs: $("tabs"),
  overlay: $("overlay"), sheet: $("sheet"), yardDot: $("yard-dot"), legacyDot: $("legacy-dot"),
};

/* One colour per living thing, used by the population bars and the gauges so
   that the same organism is the same colour everywhere in the game. */
const TINT = {
  lacto: "#a7f070", sacch: "#ffcd75", aceto: "#73eff7",
  koji: "#f4f4f4", brett: "#c48ae0", wild: "#b13e53",
};

const ui = {
  tab: "cellar",
  sheet: null, // { kind, ... } or null
  drag: null, // an in-progress dial drag
  pendingType: null, // a vessel type swap waiting on its confirm button
  toast: null,
  toastUntil: 0,
};

/* ------------------------------------------------------------------------ */
/* Save                                                                      */
/* ------------------------------------------------------------------------ */

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    // Guard against a save written by an older, differently shaped version.
    if (!save || save.v !== 1 || !save.res || !Array.isArray(save.vessels)) return null;
    return save;
  } catch {
    return null;
  }
}

function store() {
  save.seen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* a full or private-mode localStorage is not worth interrupting play for */
  }
}

let save = load() || newSave(Date.now());

/* ------------------------------------------------------------------------ */
/* Small builders                                                            */
/* ------------------------------------------------------------------------ */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className, text, act, data = {}) {
  const node = el("button", className, text);
  node.type = "button";
  node.dataset.act = act;
  for (const [k, v] of Object.entries(data)) node.dataset[k] = v;
  return node;
}

function costText(cost) {
  return Object.entries(cost)
    .map(([id, amt]) => `${fmt(amt)} ${RES_BY_ID[id].icon}`)
    .join("  ");
}

function costRow(cost) {
  const node = el("div", "row__cost", costText(cost));
  if (!E.canAfford(save, cost)) node.classList.add("row__cost--short");
  return node;
}

function toast(message) {
  ui.toast = message;
  ui.toastUntil = performance.now() + 2200;
}

/* ------------------------------------------------------------------------ */
/* The larder                                                                */
/* ------------------------------------------------------------------------ */

let rateCache = { at: 0, rates: {} };

function currentRates() {
  const now = performance.now();
  // rates() copies the whole cellar and runs a throwaway step, so it is far
  // too expensive for every frame - twice a second is plenty for a readout.
  if (now - rateCache.at > 500) rateCache = { at: now, rates: E.rates(save) };
  return rateCache.rates;
}

function renderLarder() {
  const rates = currentRates();
  dom.larder.replaceChildren(...RESOURCES
    .filter((r) => save.res[r.id] > 0 || save.made[r.id] > 0)
    .map((r) => {
      const node = el("div", "stock");
      node.append(el("span", "stock__icon", r.icon));
      node.append(el("b", "stock__amount", fmt(save.res[r.id])));
      const rate = rates[r.id] || 0;
      const line = el("span", "stock__rate", `${rate >= 0 ? "+" : ""}${fmt(rate)}/s`);
      if (rate < -1e-9) line.classList.add("stock__rate--down");
      node.append(line);
      return node;
    }));

  const bits = [];
  if (save.mothersEver > 0) bits.push(["Mothers", save.mothers, save.mothersEver]);
  if (save.sporesEver > 0) bits.push(["Spores", save.spores, save.sporesEver]);
  if (save.lineageEver > 0) bits.push(["Lineage", save.lineage, save.lineageEver]);
  dom.strip.hidden = bits.length === 0;
  dom.strip.replaceChildren(...bits.map(([name, held, ever]) => {
    const node = el("span", null, `${name} `);
    node.append(el("b", null, fmt(held)));
    node.append(document.createTextNode(` of ${fmt(ever)}`));
    return node;
  }));
}

/* ------------------------------------------------------------------------ */
/* The cellar                                                                */
/* ------------------------------------------------------------------------ */

function vesselCard(vessel, index, mods) {
  const base = E.vesselType(vessel);
  const plan = E.analyse(save, vessel, mods);
  const card = button("vessel", null, "vessel", { i: index });
  if (!vessel.cultures.length) card.classList.add("vessel--empty");

  const art = el("span", "vessel__art");
  art.append(spriteCanvas(base.icon));
  card.append(art);

  card.append(el("b", "vessel__name", `${base.name}${vessel.tier > 1 ? ` ·${vessel.tier}` : ""}`));
  card.append(el("span", "vessel__meta",
    `pH ${vessel.ph.toFixed(2)} · ${vessel.temp.toFixed(0)}°C · ${vessel.salt.toFixed(1)}% salt`));

  // The population bar is the vessel in one glance: who is in there, in what
  // proportion, and how much of the jar is still empty.
  const bar = el("div", "vessel__bar");
  for (const row of plan.rows) {
    const width = plan.cap > 0 ? (row.pop / plan.cap) * 100 : 0;
    if (width < 0.4) continue;
    const seg = el("i");
    seg.style.width = `${Math.min(width, 100)}%`;
    seg.style.background = TINT[row.culture.id] || "#888";
    bar.append(seg);
  }
  card.append(bar);

  const foot = el("div", "vessel__foot");
  const out = Object.entries(vessel.out || {}).filter(([, v]) => v > 0);
  if (!vessel.cultures.length) {
    foot.append(el("span", "vessel__warn", "empty — tap to pitch"));
  } else if (out.length) {
    foot.append(el("span", "vessel__out",
      out.map(([id, v]) => `${fmt(v)}${RES_BY_ID[id].icon}`).join(" ")));
  } else {
    foot.append(el("span", "vessel__warn", starvedNote(plan)));
  }
  if (plan.symbioses.length) {
    foot.append(el("span", "vessel__sym", plan.symbioses.map((s) => s.name).join(" + ")));
  } else if (plan.taint > 0.25) {
    foot.append(el("span", "vessel__warn", `${Math.round(plan.taint * 100)}% spoiled`));
  }
  card.append(foot);
  return card;
}

/* Why a pitched vessel is making nothing. There are only three answers and
   naming the right one is the difference between a puzzle and a shrug. */
function starvedNote(plan) {
  const rows = plan.rows.filter((r) => r.culture.id !== "wild");
  if (!rows.length) return "nothing pitched";
  const worst = rows.reduce((a, b) => (a.fit.total >= b.fit.total ? a : b));
  if (worst.fit.total < 0.08) {
    const parts = [["heat", worst.fit.temp], ["salt", worst.fit.salt],
      ["acidity", worst.fit.ph], ["air", worst.fit.o2]];
    const [name] = parts.reduce((a, b) => (a[1] <= b[1] ? a : b));
    return `wrong ${name}`;
  }
  if (save.res[worst.eats] < 1) return `no ${RES_BY_ID[worst.eats].name.toLowerCase()}`;
  return "starting up";
}

function renderCellar(mods) {
  const frag = [];
  const shelf = el("div", "shelf");
  save.vessels.forEach((vessel, i) => shelf.append(vesselCard(vessel, i, mods)));
  frag.push(shelf);

  if (save.vessels.length < mods.maxSlots) {
    const cost = slotCost(save.vessels.length);
    const row = el("div", "row");
    row.append(el("b", "row__name", "Dig another slot"));
    row.append(el("p", "row__desc", "One more vessel on the shelf. Nothing in this game pays like a whole extra ferment."));
    row.append(costRow(cost));
    const buy = button("buy", "Dig", "slot");
    buy.disabled = !E.canAfford(save, cost);
    row.append(buy);
    frag.push(row);
  } else {
    frag.push(el("p", "hint", "Every slot in the cellar is dug. Deepen the vessels you have, or open the doors to the wild."));
  }

  if (!save.up.autotune) {
    frag.push(el("p", "hint",
      "Tap a vessel to set its temperature and salt. Every culture wants its own, and so does the spoilage you are trying to keep out."));
  }
  return frag;
}

/* ------------------------------------------------------------------------ */
/* The yard                                                                  */
/* ------------------------------------------------------------------------ */

function clickGrain(mods) {
  return mods.clickFive
    ? Math.max(TUNING.clickGrain * mods.grainMult,
      save.buildings.field * TUNING.fieldRate * mods.grainMult * 5)
    : TUNING.clickGrain * mods.grainMult;
}

function buildingRow(id, name, desc, mods) {
  const owned = save.buildings[id];
  const cost = { grain: buildingCost(id, owned) };
  const row = el("div", "row");
  row.append(el("b", "row__name", `${name} · ${owned}`));
  row.append(el("p", "row__desc", desc));
  row.append(costRow(cost));
  const buy = button("buy", "Buy", "building", { id });
  buy.disabled = !E.canAfford(save, cost);
  row.append(buy);
  return row;
}

function renderYard(mods) {
  const frag = [];
  const scatter = button("scatter", null, "scatter");
  scatter.append(el("span", null, "Scatter grain"));
  scatter.append(el("small", null, `+${fmt(clickGrain(mods))} 🌾 a tap`));
  frag.push(scatter);

  frag.push(el("h2", "section__title", "The yard"));
  frag.push(buildingRow("field", "Field", `Grows ${fmt(TUNING.fieldRate * mods.grainMult)} grain a second.`, mods));
  frag.push(buildingRow("mash", "Mash Tun",
    `Turns grain into wort. The tuns work through ${Math.round(TUNING.mashShare * 100)}% of what the fields bring in — never the barn's savings.`, mods));

  const shelf = UPGRADES.filter((u) => E.available(save, u)
    && !(u.kind === "once" && save.up[u.id])
    && !(u.max && (save.up[u.id] || 0) >= u.max));
  if (shelf.length) frag.push(el("h2", "section__title", "The craft"));
  for (const entry of shelf) {
    const level = save.up[entry.id] || 0;
    const cost = E.upgradeCost(save, entry);
    const row = el("div", "row");
    row.append(el("b", "row__name", entry.name + (level ? ` ·${level}` : "")));
    row.append(el("p", "row__desc", entry.desc));
    row.append(costRow(cost));
    const buy = button("buy", entry.kind === "repeat" ? "Buy" : "Learn", "upgrade", { id: entry.id });
    buy.disabled = !E.canAfford(save, cost);
    row.append(buy);
    frag.push(row);
  }
  if (!shelf.length) frag.push(el("p", "hint", "Nothing new on the shelf until the cellar makes something new."));
  return frag;
}

/* ------------------------------------------------------------------------ */
/* Legacy: the three prestige layers                                         */
/* ------------------------------------------------------------------------ */

function prestigeRow(title, blurb, gain, unit, act, ready) {
  const row = el("div", "row");
  row.append(el("b", "row__name", title));
  row.append(el("p", "row__desc", blurb));
  row.append(el("div", "row__cost", ready
    ? `Ready: +${fmt(gain)} ${unit}`
    : `Not yet — keep fermenting`));
  const go = button("buy", "Read", act);
  go.disabled = !ready;
  row.append(go);
  return row;
}

function tokenRow(entry, price, level, held, act, unit) {
  const row = el("div", "row");
  row.append(el("b", "row__name", entry.name + (level ? ` ·${level}` : "")));
  row.append(el("p", "row__desc", entry.desc));
  const maxed = entry.max && level >= entry.max;
  row.append(el("div", `row__cost${held >= price ? "" : " row__cost--short"}`,
    maxed ? "Bought out" : `${price} ${unit}`));
  const buy = button("buy", "Buy", act, { id: entry.id });
  buy.disabled = maxed || held < price;
  row.append(buy);
  return row;
}

function renderLegacy(mods) {
  const frag = [];
  const motherGain = E.motherGain(save, mods);

  frag.push(el("h2", "section__title", "Racking · mothers"));
  frag.push(prestigeRow("Rack the cellar",
    "Pour everything out and keep the mother. You lose the stock, the yard, the slots and the craft; you keep every culture and vessel you have learned, and every mother you have ever kept goes on paying.",
    motherGain, "mothers", "rack:read", motherGain > 0));
  if (save.mothersEver > 0) {
    for (const entry of MOTHER_UPGRADES) {
      const level = save.mup[entry.id] || 0;
      if (entry.kind === "once" && level) continue;
      frag.push(tokenRow(entry, E.motherPrice(save, entry), level, save.mothers, "mother", "mothers"));
    }
  }

  if (save.mothersEver >= 12 || save.sporesEver > 0) {
    const gain = E.sporeGain(save);
    frag.push(el("h2", "section__title", "Blooming · spores"));
    frag.push(prestigeRow("Open the cellar doors",
      "Let the wild in. Every mother you have banked goes back into the air and you keep the spores it leaves behind — and the strains those spores buy do not care what layer you are on.",
      gain, "spores", "bloom:read", gain > 0));
    if (save.sporesEver > 0) {
      for (const entry of SPORE_UPGRADES) {
        const level = save.sup[entry.id] || 0;
        if (entry.kind === "once" && level) continue;
        frag.push(tokenRow(entry, E.sporePrice(save, entry), level, save.spores, "spore", "spores"));
      }
      frag.push(el("h2", "section__title",
        `Wild strains · carrying ${save.equipped.length} of ${mods.strainSlots}`));
      for (const strain of STRAINS) {
        const owned = save.strains[strain.id];
        const on = save.equipped.includes(strain.id);
        const price = E.strainPrice(save, strain, mods);
        const row = el("div", "row");
        row.append(el("b", "row__name", `${strain.icon} ${strain.name}`));
        row.append(el("p", "row__desc", strain.desc));
        row.append(el("div", `row__cost${owned || save.spores >= price ? "" : " row__cost--short"}`,
          owned ? (on ? "Carried" : "Caught, not carried") : `${price} spores`));
        const act = owned ? "equip" : "strain";
        const label = owned ? (on ? "Drop" : "Carry") : "Catch";
        const buy = button("buy", label, act, { id: strain.id });
        buy.disabled = !owned && save.spores < price;
        if (on) buy.classList.add("buy--small");
        row.append(buy);
        frag.push(row);
      }
    }
  }

  if (save.sporesEver >= 8 || save.lineageEver > 0) {
    const gain = E.lineageGain(save);
    frag.push(el("h2", "section__title", "Ascending · lineage"));
    frag.push(prestigeRow("Domesticate the culture",
      "Everything goes: mothers, spores, strains, the lot. What comes back is a lineage that no longer obeys the rules the rest of the game is built on.",
      gain, "lineage", "ascend:read", gain > 0));
    if (save.lineageEver > 0) {
      for (const gene of GENES) {
        if (save.genes[gene.id]) continue;
        const row = el("div", "row");
        row.append(el("b", "row__name", gene.name));
        row.append(el("p", "row__desc", gene.desc));
        row.append(el("div", `row__cost${save.lineage >= gene.cost ? "" : " row__cost--short"}`,
          `${gene.cost} lineage`));
        const buy = button("buy", "Splice", "gene", { id: gene.id });
        buy.disabled = save.lineage < gene.cost;
        row.append(buy);
        frag.push(row);
      }
      const spliced = GENES.filter((g) => save.genes[g.id]);
      if (spliced.length) {
        frag.push(el("p", "hint", `Spliced: ${spliced.map((g) => g.name).join(", ")}.`));
      }
    }
  }
  return frag;
}

/* ------------------------------------------------------------------------ */
/* The book                                                                  */
/* ------------------------------------------------------------------------ */

const BOOK = [
  ["How a vessel works",
    "Everything alive in a vessel shares one capacity, and each population settles at its share of it. Shares are decided by fitness, and fitness is four things multiplied together: how close the temperature is to what the culture likes, how much salt it can take, whether the pH is inside its range, and whether the vessel has the air it wants. Oxygen is fixed by the vessel — that is what choosing a container means — so the two dials are the whole of your control."],
  ["Souring is a weapon",
    "Anything that makes acid drops its own vessel's pH. That eventually throttles the culture doing it, but it kills spoilage long before it inconveniences anything you pitched on purpose. Salt does the same job from the other side. A crock that has soured to pH 3.4 does not need to be watched."],
  ["Two cultures, one vessel",
    "Co-pitching costs you capacity and pays you a named ferment: Sourdough, SCOBY, Miso, Lambic, Solera, Shoyu, and — in three slots — Gueuze. Every one of them needs both cultures actually thriving, which means finding a temperature and a salt level that neither of them hates. That is the game."],
  ["The chain",
    "Fields make grain, tuns make wort, and everything after that is alive. Lactobacillus sours wort. Saccharomyces turns it to alcohol. Acetobacter drinks alcohol and makes vinegar. Kōji eats grain whole and makes umami. Brettanomyces is slow, unkillable and worth more than all of them together."],
  ["Three ways to start again",
    "Rack the cellar for mothers, which pay forever and buy a tree of permanent comforts. Open the doors for spores, which buy wild strains that rewrite what a culture will tolerate. Domesticate for lineage, which deletes the rules outright. Each layer costs you everything the one below it built, and each is worth it a good while before it feels like it."],
  ["While you are away",
    "The cellar keeps fermenting when the tab is shut, at a fraction of live speed and for a limited window. Long Sleep and Deep Time widen both."],
];

function renderBook() {
  const frag = [el("p", "hint", "Brinewright. Tap a vessel to open it.")];
  for (const [title, text] of BOOK) {
    frag.push(el("h2", "section__title", title));
    frag.push(el("p", "hint", text));
  }
  frag.push(el("h2", "section__title", "Starting over"));
  const row = el("div", "row");
  row.append(el("b", "row__name", "Erase this cellar"));
  row.append(el("p", "row__desc", "Wipes the save and starts a new one. There is no way back."));
  row.append(button("buy", "Erase", "wipe:read"));
  frag.push(row);
  return frag;
}

/* ------------------------------------------------------------------------ */
/* Panel                                                                     */
/* ------------------------------------------------------------------------ */

function renderPanel() {
  const mods = E.derive(save);
  const at = dom.panel.scrollTop;
  const parts = ui.tab === "cellar" ? renderCellar(mods)
    : ui.tab === "yard" ? renderYard(mods)
      : ui.tab === "legacy" ? renderLegacy(mods)
        : renderBook();
  if (ui.toast && performance.now() < ui.toastUntil) {
    parts.unshift(el("p", "hint", ui.toast));
  }
  dom.panel.replaceChildren(...parts);
  dom.panel.scrollTop = at;

  const legacyTab = dom.tabs.querySelector('[data-tab="legacy"]');
  legacyTab.hidden = save.mothersEver === 0 && E.motherGain(save, mods) === 0 && save.racks === 0;
  dom.yardDot.hidden = !UPGRADES.some((u) => E.available(save, u)
    && !(u.kind === "once" && save.up[u.id])
    && !(u.max && (save.up[u.id] || 0) >= u.max)
    && E.canAfford(save, E.upgradeCost(save, u)));
  dom.legacyDot.hidden = !(E.motherGain(save, mods) > 0 || E.sporeGain(save) > 0
    || E.lineageGain(save) > 0
    || MOTHER_UPGRADES.some((m) => !(m.kind === "once" && save.mup[m.id])
      && save.mothers >= E.motherPrice(save, m)));
}

/* ------------------------------------------------------------------------ */
/* Sheets                                                                    */
/* ------------------------------------------------------------------------ */

function openSheet(kind, data = {}) {
  ui.sheet = { kind, ...data };
  ui.pendingType = null;
  dom.overlay.hidden = false;
  renderSheet();
}

function closeSheet() {
  ui.sheet = null;
  ui.drag = null;
  dom.overlay.hidden = true;
}

function gauge(label, value) {
  const node = el("span", "gauge");
  node.append(el("span", null, label));
  const track = el("i");
  const fill = el("b");
  fill.style.width = `${Math.max(2, Math.round(value * 100))}%`;
  track.append(fill);
  node.append(track);
  if (value < 0.35) node.classList.add("gauge--poor");
  else if (value < 0.7) node.classList.add("gauge--fair");
  return node;
}

function dial(label, value, min, max, unit, act) {
  const node = el("div", "dial");
  const head = el("div", "dial__head");
  head.append(el("span", null, label));
  head.append(el("b", null, `${value.toFixed(unit === "%" ? 2 : 1)}${unit}`));
  node.append(head);
  const track = el("div", "dial__track");
  track.dataset.act = act;
  track.dataset.min = min;
  track.dataset.max = max;
  const share = (value - min) / (max - min);
  const fill = el("div", "dial__fill");
  fill.style.width = `calc(${(share * 100).toFixed(2)}% - 4px)`;
  track.append(fill);
  const thumb = el("div", "dial__thumb");
  thumb.style.left = `${(share * 100).toFixed(2)}%`;
  track.append(thumb);
  node.append(track);
  return node;
}

function vesselSheet(index) {
  const vessel = save.vessels[index];
  if (!vessel) return [el("p", "hint", "That vessel is gone.")];
  const mods = E.derive(save);
  const base = E.vesselType(vessel);
  const plan = E.analyse(save, vessel, mods);
  const slots = E.cultureSlots(save, vessel, mods);
  const parts = [];

  const head = el("div", "sheet__head");
  const art = el("span", "sheet__art");
  art.append(spriteCanvas(base.icon));
  head.append(art);
  const titles = el("div");
  titles.append(el("h2", "sheet__title", `${base.name}${vessel.tier > 1 ? ` · tier ${vessel.tier}` : ""}`));
  titles.append(el("p", "sheet__sub",
    `${base.note} Capacity ${fmt(plan.cap)}, air ${Math.round(base.o2 * 100)}%, ${slots} culture slot${slots > 1 ? "s" : ""}.`));
  head.append(titles);
  head.append(button("icon-button", "✕", "close"));
  parts.push(head);

  // --- the two dials -----------------------------------------------------
  parts.push(el("h3", null, `Conditions · pH ${vessel.ph.toFixed(2)}`));
  parts.push(dial("Temperature", vessel.temp, TUNING.tempMin, TUNING.tempMax, "°C", "dial:temp"));
  parts.push(dial("Salt", vessel.salt, TUNING.saltMin, TUNING.saltMax, "%", "dial:salt"));
  if (mods.autotune) {
    const actions = el("div", "sheet__actions");
    actions.append(button("pill-button pill-button--ghost", "Tune to the ferment", "tune", { i: index }));
    parts.push(actions);
  }

  // --- who is in there ---------------------------------------------------
  parts.push(el("h3", null, "In the vessel"));
  for (const row of plan.rows) {
    const culture = row.culture;
    const node = el("div", "culture");
    const face = el("span", "culture__art");
    face.append(spriteCanvas(culture.icon));
    node.append(face);
    node.append(el("b", "culture__name", culture.name));
    const share = plan.cap > 0 ? row.pop / plan.cap : 0;
    const pill = el("span", "pill", `${Math.round(share * 100)}% of the vessel`);
    if (culture.id === "wild") pill.classList.add("pill--bad");
    else if (share > 0.25) pill.classList.add("pill--good");
    node.append(pill);
    node.append(el("p", "culture__note", culture.id === "wild"
      ? `Eats your wort and makes nothing. Currently spoiling ${Math.round(plan.taint * 100)}% of this vessel's output.`
      : `${culture.note}${mods.hydrometer ? ` Fitness ${(row.fit.total * 100).toFixed(0)}%, making ${fmt((vessel.out || {})[row.makes] || 0)} ${RES_BY_ID[row.makes]?.icon || ""}/s.` : ""}`));
    const gauges = el("div", "gauges");
    gauges.append(gauge("HEAT", row.fit.temp));
    gauges.append(gauge("SALT", row.fit.salt));
    gauges.append(gauge("ACID", row.fit.ph));
    gauges.append(gauge("AIR", row.fit.o2));
    node.append(gauges);
    if (culture.id !== "wild") {
      const actions = el("div", "chips");
      actions.append(button("chip", "Cull", "cull", { i: index, id: culture.id }));
      node.append(actions);
    }
    parts.push(node);
  }

  if (plan.symbioses.length) {
    for (const sym of plan.symbioses) {
      parts.push(el("p", "hint", `${sym.name} — ${sym.note} `
        + Object.entries(sym.gain).map(([r, m]) => `×${m} ${RES_BY_ID[r].icon}`).join(" ")));
    }
  }

  // --- pitching ----------------------------------------------------------
  const spare = slots - vessel.cultures.length;
  const pitchable = CULTURES.filter((c) => save.cultures[c.id] && !vessel.cultures.includes(c.id));
  if (pitchable.length) {
    parts.push(el("h3", null, spare > 0
      ? `Pitch a culture · ${spare} slot${spare > 1 ? "s" : ""} free`
      : "Pitch a culture · no slots free"));
    for (const culture of pitchable) {
      const node = el("div", "culture");
      const face = el("span", "culture__art");
      face.append(spriteCanvas(culture.icon));
      node.append(face);
      node.append(el("b", "culture__name", culture.name));
      const fit = E.fitness(culture, vessel, mods);
      const pill = el("span", "pill", `${Math.round(fit.total * 100)}% suited`);
      if (fit.total > 0.6) pill.classList.add("pill--good");
      else if (fit.total < 0.2) pill.classList.add("pill--bad");
      node.append(pill);
      node.append(el("p", "culture__note",
        `${culture.note} Likes ${culture.tempOpt}°C and ${culture.saltOpt}% salt, pH ${culture.phMin}–${culture.phMax}.`));
      const chips = el("div", "chips");
      const chip = button("chip", `Pitch ${culture.common}`, "pitch", { i: index, id: culture.id });
      chip.disabled = spare <= 0;
      chips.append(chip);
      node.append(chips);
      parts.push(node);
    }
  }

  // --- the vessel itself -------------------------------------------------
  parts.push(el("h3", null, "The vessel"));
  const cost = tierCost(vessel.type, vessel.tier);
  const deepen = el("div", "row");
  deepen.append(el("b", "row__name", `Deepen to tier ${vessel.tier + 1}`));
  deepen.append(el("p", "row__desc",
    `×${TUNING.tierCapGain} capacity and ×${TUNING.tierRateGain} output, and the ferment carries on undisturbed.`));
  deepen.append(costRow(cost));
  const buyTier = button("buy", "Deepen", "tier", { i: index });
  buyTier.disabled = !E.canAfford(save, cost);
  deepen.append(buyTier);
  parts.push(deepen);

  const owned = VESSELS.filter((v) => save.types[v.id]);
  if (owned.length > 1) {
    parts.push(el("p", "hint", "Repotting empties the vessel: the populations, the pH and the tier all start again."));
    const chips = el("div", "chips");
    for (const type of owned) {
      const chip = button(`chip${type.id === vessel.type ? " chip--on" : ""}`, type.name, "repot", { i: index, id: type.id });
      chip.disabled = type.id === vessel.type;
      chips.append(chip);
    }
    parts.push(chips);
    if (ui.pendingType) {
      const target = VESSEL_BY_ID[ui.pendingType];
      parts.push(el("p", "hint", `${target.note} Everything living in this vessel is lost.`));
      const actions = el("div", "sheet__actions");
      actions.append(button("pill-button pill-button--danger", `Repot into the ${target.name}`, "repot:go", { i: index }));
      actions.append(button("pill-button pill-button--ghost", "Keep it as it is", "repot:cancel"));
      parts.push(actions);
    }
  }
  return parts;
}

function confirmSheet(title, lines, label, act, tone = "") {
  const parts = [];
  const head = el("div", "sheet__head");
  head.append(el("span", "sheet__art"));
  const titles = el("div");
  titles.append(el("h2", "sheet__title", title));
  head.append(titles);
  head.append(button("icon-button", "✕", "close"));
  parts.push(head);
  for (const line of lines) parts.push(el("p", "hint", line));
  const actions = el("div", "sheet__actions");
  actions.append(button(`pill-button${tone}`, label, act));
  actions.append(button("pill-button pill-button--ghost", "Not yet", "close"));
  parts.push(actions);
  return parts;
}

function renderSheet() {
  if (!ui.sheet) return;
  const at = dom.sheet.scrollTop;
  const { kind } = ui.sheet;
  let parts;
  if (kind === "vessel") parts = vesselSheet(ui.sheet.i);
  else if (kind === "rack") {
    const gain = E.motherGain(save);
    parts = confirmSheet("Rack the cellar", [
      `You pour out every vessel and take ${fmt(gain)} mother${gain === 1 ? "" : "s"}.`,
      "Gone: all stock, the yard, the craft ladder, every slot past your first, and every tier you have paid for.",
      "Kept: every culture and vessel type you have learned, and every mother you have ever taken — the passive bonus counts your lifetime, not your balance, so spending them costs you nothing.",
    ], `Rack for ${fmt(gain)} mothers`, "rack:go");
  } else if (kind === "bloom") {
    const gain = E.sporeGain(save);
    parts = confirmSheet("Open the cellar doors", [
      `The wild gets in and leaves ${fmt(gain)} spore${gain === 1 ? "" : "s"} behind.`,
      "Gone: everything a rack takes, and on top of it every mother you have ever banked and everything the mother tree bought.",
      "Kept: your spores, the strains they have caught, and the recipe book.",
      "Strains do not care which layer you are on. They are the only thing in this game that changes what a culture will tolerate.",
    ], `Bloom for ${fmt(gain)} spores`, "bloom:go", " pill-button--danger");
  } else if (kind === "ascend") {
    const gain = E.lineageGain(save);
    parts = confirmSheet("Domesticate the culture", [
      `You take ${fmt(gain)} lineage.`,
      "Gone: mothers, spores, strains, both trees, and the cellar. Everything except the recipe book.",
      "Kept: lineage, and the genes it splices — which do not multiply anything. They delete rules: spoilage, starvation, the offline window, the size of the cellar.",
    ], `Ascend for ${fmt(gain)} lineage`, "ascend:go", " pill-button--danger");
  } else if (kind === "wipe") {
    parts = confirmSheet("Erase this cellar", [
      "The save is deleted and the game starts from one mason jar. Mothers, spores, lineage and the recipe book all go.",
      "There is no way back from this one.",
    ], "Erase everything", "wipe:go", " pill-button--danger");
  } else if (kind === "welcome") {
    parts = confirmSheet("While you were away", ui.sheet.lines, "Back to the cellar", "close");
  } else parts = [el("p", "hint", "…")];
  dom.sheet.replaceChildren(...parts);
  dom.sheet.scrollTop = at;
}

/* ------------------------------------------------------------------------ */
/* Input                                                                     */
/* ------------------------------------------------------------------------ */

/* One delegated listener per surface, on pointerdown rather than click, so a
   tap registers immediately and a redraw between the press and the handler
   cannot lose it. */
function wire(node) {
  node.addEventListener("pointerdown", (event) => {
    const target = event.target.closest("[data-act]");
    if (!target || target.disabled) return;
    if (target.dataset.act.startsWith("dial:")) return startDrag(event, target);
    event.preventDefault();
    act(target.dataset.act, target.dataset);
  });
}

function act(name, data) {
  const i = Number(data.i);
  switch (name) {
    case "scatter":
      save.res.grain += clickGrain(E.derive(save));
      break;
    case "building": E.buyBuilding(save, data.id); break;
    case "upgrade": E.buyUpgrade(save, data.id); break;
    case "slot": E.buySlot(save); break;
    case "vessel": openSheet("vessel", { i }); return;
    case "close": closeSheet(); break;
    case "pitch": E.inoculate(save, i, data.id); break;
    case "cull": E.cull(save, i, data.id); break;
    case "tier": E.buyTier(save, i); break;
    case "tune":
      if (!E.tune(save, i)) toast("Blending Notes has not been written yet.");
      break;
    case "repot": ui.pendingType = data.id; break;
    case "repot:cancel": ui.pendingType = null; break;
    case "repot:go":
      E.setVesselType(save, i, ui.pendingType);
      ui.pendingType = null;
      break;
    case "mother": E.buyMother(save, data.id); break;
    case "spore": E.buySpore(save, data.id); break;
    case "strain": E.buyStrain(save, data.id); break;
    case "equip":
      if (!E.equip(save, data.id)) toast("No room — drop a strain first.");
      break;
    case "gene": E.buyGene(save, data.id); break;
    case "rack:read": openSheet("rack"); return;
    case "bloom:read": openSheet("bloom"); return;
    case "ascend:read": openSheet("ascend"); return;
    case "wipe:read": openSheet("wipe"); return;
    case "rack:go": E.rack(save); closeSheet(); ui.tab = "cellar"; break;
    case "bloom:go": E.bloom(save); closeSheet(); ui.tab = "cellar"; break;
    case "ascend:go": E.ascend(save); closeSheet(); ui.tab = "cellar"; break;
    case "wipe:go":
      localStorage.removeItem(SAVE_KEY);
      save = newSave(Date.now());
      closeSheet();
      ui.tab = "cellar";
      break;
    default: return;
  }
  rateCache.at = 0;
  store();
  renderLarder();
  renderPanel();
  renderSheet();
  syncTabs();
}

/* The dials. The track's rectangle is measured once when the finger lands and
   the move and release are listened for on the window, so the sheet can be
   redrawn mid-drag without the gesture ever being handed back. */
function startDrag(event, track) {
  const rect = track.getBoundingClientRect();
  const which = track.dataset.act.slice(5);
  const min = Number(track.dataset.min);
  const max = Number(track.dataset.max);
  const index = ui.sheet?.i;
  if (index == null) return;
  ui.drag = true;

  const apply = (clientX) => {
    const share = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const value = min + share * (max - min);
    if (which === "temp") E.setTemp(save, index, Math.round(value * 2) / 2);
    else E.setSalt(save, index, Math.round(value * 4) / 4);
    renderSheet();
  };

  const move = (e) => { e.preventDefault(); apply(e.clientX); };
  const up = () => {
    ui.drag = null;
    store();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  apply(event.clientX);
}

function syncTabs() {
  for (const tab of dom.tabs.querySelectorAll(".tab")) {
    tab.classList.toggle("tab--on", tab.dataset.tab === ui.tab);
  }
}

dom.tabs.addEventListener("pointerdown", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (!tab) return;
  event.preventDefault();
  ui.tab = tab.dataset.tab;
  dom.panel.scrollTop = 0;
  syncTabs();
  renderPanel();
});

dom.overlay.addEventListener("pointerdown", (event) => {
  if (event.target === dom.overlay) closeSheet();
});

wire(dom.panel);
wire(dom.sheet);

/* ------------------------------------------------------------------------ */
/* Time away, and the loop                                                   */
/* ------------------------------------------------------------------------ */

(function catchUp() {
  const away = (Date.now() - (save.seen || Date.now())) / 1000;
  if (away < 60) return;
  const report = E.offline(save, away);
  const gained = Object.entries(report.gained);
  if (!gained.length) return;
  openSheet("welcome", {
    lines: [
      `The cellar worked for ${fmtTime(report.seconds)} while the tab was shut, at ${Math.round(E.derive(save).offlineEff * 100)}% of live speed.`,
      gained.map(([id, amt]) => `${fmt(amt)} ${RES_BY_ID[id].icon} ${RES_BY_ID[id].name}`).join(", ") + ".",
    ],
  });
})();

let last = performance.now();

function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 5);
  last = now;
  E.advance(save, elapsed);
  requestAnimationFrame(frame);
}

/* The engine runs on the frame loop; the interface redraws four times a
   second, which is fast enough to feel live and slow enough that eight vessel
   cards are nowhere near a phone's frame budget. */
setInterval(() => {
  renderLarder();
  renderPanel();
  if (ui.sheet && !ui.drag) renderSheet();
}, 250);

setInterval(store, 5000);
window.addEventListener("pagehide", store);
document.addEventListener("visibilitychange", () => { if (document.hidden) store(); });

syncTabs();
renderLarder();
renderPanel();
requestAnimationFrame(frame);
