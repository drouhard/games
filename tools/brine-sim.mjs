/* Balance simulator for Brinewright.

   The cellar is a DOM-free object and the whole game advances in fixed steps,
   so a twelve-hour career - every purchase, several racks, a bloom, an ascent -
   plays out in Node in about a second. An incremental with three prestige
   layers cannot be tuned by eye: what a layer is worth only shows up in where
   the *next* one lands, and that is two hours of play away.

       node tools/brine-sim.mjs                 # one 12h career, milestones
       node tools/brine-sim.mjs --hours 24      # longer
       node tools/brine-sim.mjs --curve         # value/s every ten minutes
       node tools/brine-sim.mjs --cellar        # what the cellar ended up as
       node tools/brine-sim.mjs --racks         # what every rack paid

   What good output looks like, and what these numbers currently say:

     first sour inside a minute, first alcohol around five
     first rack 25-40 min, and racks two to six in the half hour after it
     first bloom around 2-3h, first ascent around 6-8h
     no flat stretch longer than about fifteen minutes anywhere in twelve hours

   The failure mode it exists to catch is the one you cannot see from a
   session: a prestige currency whose passive bonus feeds the formula that
   mints it, which turns the third layer into an unbounded loop. It caught
   exactly that here - mothers multiplying output while output set the mother
   price meant rack four paid more than racks one to three combined, forever.

   Not part of serving the site - nothing under games/ imports it. */

import {
  TUNING, RESOURCES, CULTURES, UPGRADES, MOTHER_UPGRADES, SPORE_UPGRADES,
  STRAINS, GENES, VESSELS, fmt, fmtTime, buildingCost, slotCost, tierCost,
} from "../games/brinewright/data.js";
import * as E from "../games/brinewright/engine.js";
import { newSave } from "../games/brinewright/data.js";

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const num = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};

const HOURS = num("hours", 12);
const TICK = 5; // the simulated player looks at the cellar this often

/* ------------------------------------------------------------------------ */
/* Recipes the simulated player knows                                        */
/* ------------------------------------------------------------------------ */

/* Each entry is a ferment worth running, the cultures it needs, the vessels it
   wants in order of preference, and whether it feeds the cellar (turns wort
   into something) or eats from it (turns alcohol into something better). The
   planner balances those two roles, because a cellar of nothing but barrels
   full of Brett starves in about a minute. */
const RECIPES = [
  { id: "kraut", cultures: ["lacto"], vessels: ["crock", "tank", "carboy", "jar"], role: "feed" },
  { id: "beer", cultures: ["sacch"], vessels: ["carboy", "crock", "tank"], role: "feed" },
  { id: "sourdough", cultures: ["lacto", "sacch"], vessels: ["carboy", "crock", "tank"], role: "feed" },
  { id: "gueuze", cultures: ["lacto", "sacch", "brett"], vessels: ["carboy", "tank"], role: "feed", slots: 3 },
  { id: "vinegar", cultures: ["aceto"], vessels: ["barrel", "tray", "jar"], role: "eat" },
  { id: "scoby", cultures: ["sacch", "aceto"], vessels: ["jar", "tank"], role: "feed" },
  { id: "koji", cultures: ["koji"], vessels: ["tray", "barrel"], role: "grain" },
  { id: "miso", cultures: ["koji", "lacto"], vessels: ["tray", "barrel"], role: "grain" },
  { id: "lambic", cultures: ["brett", "lacto"], vessels: ["barrel", "tank", "crock"], role: "eat" },
  { id: "solera", cultures: ["aceto", "brett"], vessels: ["barrel", "tray"], role: "eat" },
];

const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

function usable(save, recipe, slots) {
  if (!recipe.cultures.every((c) => save.cultures[c])) return false;
  if (!recipe.vessels.some((v) => save.types[v])) return false;
  return recipe.cultures.length <= slots;
}

function vesselFor(save, recipe) {
  return recipe.vessels.find((v) => save.types[v]) || "jar";
}

/* The cellar plan: the best feeder available, the best eater available, and a
   ratio between them that the run adjusts as it goes. Alcohol running dry
   converts an eater back into a feeder, alcohol piling up does the reverse. */
function planCellar(save, state) {
  const mods = E.derive(save);
  const slots = (typeId) => (VESSELS.find((v) => v.id === typeId)?.slots || 1) + mods.cultureSlots;
  const best = (role) => {
    const options = RECIPES.filter((r) => r.role === role
      && usable(save, r, slots(vesselFor(save, r))));
    return options.length ? options[options.length - 1] : null;
  };
  const feed = best("feed") || RECIPE_BY_ID.kraut;
  const eat = best("eat");
  const grain = best("grain");

  // Feeders first, eaters last, and never an eater in slot one: a cellar whose
  // only vessel is a barrel of Brett has nothing making the alcohol it lives
  // on, and sits there at zero for the whole run.
  const n = save.vessels.length;
  const eaters = eat ? Math.min(n - 1, Math.round(n / state.feedEvery)) : 0;
  const grainAt = grain && n >= 4 ? n - eaters - 1 : -1;
  const wanted = [];
  for (let i = 0; i < n; i++) {
    if (i >= n - eaters) wanted.push(eat);
    else if (i === grainAt) wanted.push(grain);
    else wanted.push(feed);
  }
  return wanted;
}

function applyPlan(save, state) {
  const wanted = planCellar(save, state);
  save.vessels.forEach((vessel, i) => {
    const recipe = wanted[i];
    if (!recipe) return;
    const type = vesselFor(save, recipe);
    const sameCultures = recipe.cultures.length === vessel.cultures.length
      && recipe.cultures.every((c) => vessel.cultures.includes(c));
    if (vessel.type === type && sameCultures) return;
    if (vessel.type !== type) E.setVesselType(save, i, type);
    for (const id of [...vessel.cultures]) if (!recipe.cultures.includes(id)) E.cull(save, i, id);
    for (const id of recipe.cultures) E.inoculate(save, i, id);
    retune(save, i);
  });
}

/* The simulated player always tunes optimally. That is deliberate: it measures
   the ceiling of the design, and the gap between it and a real thumb is the
   thing sliders are supposed to be worth. */
function retune(save, i) {
  const best = E.bestSettings(save, i);
  if (!best) return;
  E.setTemp(save, i, best.temp);
  E.setSalt(save, i, best.salt);
}

/* ------------------------------------------------------------------------ */
/* Spending                                                                  */
/* ------------------------------------------------------------------------ */

const MOTHER_ORDER = ["m:slot", "m:soil", "m:seed", "m:cslot", "m:deep", "m:mult", "m:keep", "m:auto", "m:patience", "m:rich"];
const SPORE_ORDER = ["s:head", "s:slot", "s:known", "s:mother"];
const STRAIN_ORDER = ["bloom", "floc", "thermo", "halo", "acido", "killer", "thrifty", "ester", "symbiont", "diastatic", "solera", "feral"];
const GENE_ORDER = ["g:domestic", "g:pasteur", "g:cellar", "g:compound", "g:deep", "g:strain", "g:omni", "g:remember", "g:autorack", "g:overdrive"];

function spend(save, state) {
  const mods = E.derive(save);

  // Yard: fields first, then just enough tuns to drink what they grow, with
  // headroom because kōji eats raw grain too.
  for (let guard = 0; guard < 60; guard++) {
    const grainRate = save.buildings.field * TUNING.fieldRate * mods.grainMult;
    const mashPull = save.buildings.mash * TUNING.mashEats;
    const wantMash = mashPull < grainRate * TUNING.mashShare;
    const id = wantMash ? "mash" : "field";
    const cost = buildingCost(id, save.buildings[id]);
    if (save.res.grain < cost * 1.5) break;
    E.buyBuilding(save, id);
  }

  // Structure beats multipliers: a slot is a whole extra ferment.
  while (save.vessels.length < mods.maxSlots) {
    const cost = slotCost(save.vessels.length);
    if (!affordableAt(save, cost, 1.2)) break;
    if (!E.buySlot(save, mods)) break;
    applyPlan(save, state);
  }

  // Unlocks, cheapest first - every one of them opens a strictly better vessel
  // or culture, so there is nothing to weigh up.
  for (const u of UPGRADES) {
    if (u.kind !== "once" || save.up[u.id] || !E.available(save, u)) continue;
    if (affordableAt(save, E.upgradeCost(save, u), 1)) {
      E.buyUpgrade(save, u.id);
      applyPlan(save, state);
    }
  }

  // Repeatables, only when they cost well under what is in hand, so the run
  // never spends itself out of a purchase that matters more.
  for (let pass = 0; pass < 40; pass++) {
    let bought = false;
    for (const u of UPGRADES) {
      if (u.kind !== "repeat" || !E.available(save, u)) continue;
      if (!affordableAt(save, E.upgradeCost(save, u), 2.5)) continue;
      bought = E.buyUpgrade(save, u.id) || bought;
    }
    if (!bought) break;
  }

  // Tiers: always the shallowest vessel, so the cellar deepens evenly.
  for (let guard = 0; guard < 40; guard++) {
    let lowest = -1;
    save.vessels.forEach((v, i) => { if (lowest === -1 || v.tier < save.vessels[lowest].tier) lowest = i; });
    if (lowest === -1) break;
    const cost = tierCost(save.vessels[lowest].type, save.vessels[lowest].tier);
    if (!affordableAt(save, cost, 3)) break;
    if (!E.buyTier(save, lowest)) break;
  }

  for (const id of MOTHER_ORDER) {
    const entry = MOTHER_UPGRADES.find((m) => m.id === id);
    while (save.mothers >= E.motherPrice(save, entry) && E.buyMother(save, id)) { /* keep going */ }
  }
  for (const id of SPORE_ORDER) {
    const entry = SPORE_UPGRADES.find((s) => s.id === id);
    while (save.spores >= E.sporePrice(save, entry) && E.buySpore(save, id)) { /* keep going */ }
  }
  for (const id of STRAIN_ORDER) if (!save.strains[id]) E.buyStrain(save, id);
  equipBest(save);
  for (const id of GENE_ORDER) if (!save.genes[id]) E.buyGene(save, id);
}

function affordableAt(save, cost, ratio) {
  return Object.entries(cost).every(([id, amt]) => save.res[id] >= amt * ratio);
}

/* Carry the strongest strains that are owned, in the order they were listed as
   worth having. Re-equipping is free, so there is no reason not to. */
function equipBest(save) {
  const mods = E.derive(save);
  const want = STRAIN_ORDER.filter((id) => save.strains[id]).slice(-mods.strainSlots);
  for (const id of [...save.equipped]) if (!want.includes(id)) E.equip(save, id);
  for (const id of want) if (!save.equipped.includes(id)) E.equip(save, id);
}

/* ------------------------------------------------------------------------ */
/* One career                                                                */
/* ------------------------------------------------------------------------ */

function run(hours) {
  const save = newSave();
  const state = { feedEvery: 3 };
  const log = { racks: [], blooms: [], ascents: [], firsts: {}, curve: [], starved: {} };
  const total = hours * 3600;
  let sinceLook = 0;

  for (let t = 0; t < total; t += TUNING.step) {
    // A tap on the compost heap, roughly as often as a thumb manages, and only
    // while the fields are not yet doing the work.
    if (save.buildings.field < 6 && t % 1 < TUNING.step) {
      save.res.grain += TUNING.clickGrain * E.derive(save).grainMult
        * (E.derive(save).clickFive ? 1 : 1);
    }
    E.step(save, TUNING.step);
    sinceLook += TUNING.step;
    if (sinceLook < TICK) continue;
    sinceLook = 0;

    // Alcohol dry means too many eaters; alcohol piling up means too few.
    if (save.res.booze < 1 && state.feedEvery > 2) { state.feedEvery--; applyPlan(save, state); }
    else if (save.res.booze > 5e4 && state.feedEvery < 6) { state.feedEvery++; applyPlan(save, state); }

    for (const r of RESOURCES) if (save.res[r.id] < 1e-6) log.starved[r.id] = (log.starved[r.id] || 0) + TICK;
    for (const r of RESOURCES) {
      if (!log.firsts[r.id] && save.made[r.id] > 0) log.firsts[r.id] = t;
    }

    spend(save, state);
    applyPlan(save, state);
    for (let i = 0; i < save.vessels.length; i++) retune(save, i);

    // Racking is only worth it when it moves the needle: a rack that pays one
    // mother costs more in rebuilding than it returns.
    const gain = E.motherGain(save);
    const ripe = t - (log.racks.length ? log.racks[log.racks.length - 1].t : 0) > 150;
    if (!has("solo") && gain >= Math.max(3, save.mothersEver * 0.2) && ripe) {
      log.racks.push({ t, gain, mothers: save.mothers + gain, value: save.value });
      E.rack(save);
      applyPlan(save, state);
    }
    // Blooming trades every mother you have banked for spores, so it is only
    // worth doing when the spores are a real fraction of what you already own.
    const spores = has("solo") ? 0 : E.sporeGain(save);
    const bloomRipe = t - (log.blooms.length ? log.blooms[log.blooms.length - 1].t : 0) > 1200;
    if (spores >= Math.max(3, save.sporesEver * 0.3) && bloomRipe) {
      log.blooms.push({ t, gain: spores, spores: save.spores + spores });
      E.bloom(save);
      applyPlan(save, state);
    }
    const line = has("solo") ? 0 : E.lineageGain(save);
    if (line >= Math.max(1, save.lineageEver * 0.3)) {
      log.ascents.push({ t, gain: line, lineage: save.lineage + line });
      E.ascend(save);
      applyPlan(save, state);
    }

    if (t % 600 < TICK) log.curve.push({ t, value: E.rates(save).value, ever: save.valueEver });
  }
  return { save, log };
}

/* ------------------------------------------------------------------------ */
/* Report                                                                    */
/* ------------------------------------------------------------------------ */

const { save, log } = run(HOURS);

console.log(`\nBrinewright — ${HOURS}h career, optimally tuned\n`);

console.log("first of each product");
for (const r of RESOURCES) {
  const at = log.firsts[r.id];
  console.log(`  ${r.name.padEnd(8)} ${at === undefined ? "never" : fmtTime(at)}`);
}

console.log(`\nprestige`);
console.log(`  racks   ${log.racks.length.toString().padStart(3)}   first ${log.racks[0] ? fmtTime(log.racks[0].t) : "never"}`
  + `   mothers ever ${fmt(save.mothersEver)}`);
console.log(`  blooms  ${log.blooms.length.toString().padStart(3)}   first ${log.blooms[0] ? fmtTime(log.blooms[0].t) : "never"}`
  + `   spores ever  ${fmt(save.sporesEver)}`);
console.log(`  ascents ${log.ascents.length.toString().padStart(3)}   first ${log.ascents[0] ? fmtTime(log.ascents[0].t) : "never"}`
  + `   lineage ever ${fmt(save.lineageEver)}`);

console.log(`\nlifetime value ${fmt(save.valueEver)}   final value/s ${fmt(E.rates(save).value)}`);
const starved = Object.entries(log.starved).filter(([, s]) => s > 60);
console.log(`starved     ${starved.length ? starved.map(([id, s]) => `${id} ${fmtTime(s)}`).join("  ") : "nothing for long"}`);

if (has("racks")) {
  console.log("\nevery rack");
  for (const r of log.racks) console.log(`  ${fmtTime(r.t).padStart(8)}  +${fmt(r.gain).padStart(7)} mothers  (held ${fmt(r.mothers)})  value ${fmt(r.value)}`);
  for (const b of log.blooms) console.log(`  ${fmtTime(b.t).padStart(8)}  BLOOM +${fmt(b.gain)} spores (held ${fmt(b.spores)})`);
  for (const a of log.ascents) console.log(`  ${fmtTime(a.t).padStart(8)}  ASCENT +${fmt(a.gain)} lineage (held ${fmt(a.lineage)})`);
}

if (has("curve")) {
  console.log("\nvalue per second, every ten minutes");
  let line = "";
  for (const p of log.curve) {
    line += `${fmtTime(p.t).padStart(7)} ${fmt(p.value).padStart(8)}   `;
    if (line.length > 90) { console.log("  " + line); line = ""; }
  }
  if (line) console.log("  " + line);
}

if (has("cellar")) {
  console.log("\nthe cellar as it ended");
  const mods = E.derive(save);
  save.vessels.forEach((v, i) => {
    const plan = E.analyse(save, v, mods);
    const pops = v.cultures.map((c) => `${c} ${fmt(v.pop[c] || 0)}`).join(" ");
    console.log(`  ${String(i + 1).padStart(2)}. ${v.type.padEnd(7)} t${v.tier}  ${v.temp.toFixed(1)}°C  ${v.salt.toFixed(2)}%  pH ${v.ph.toFixed(2)}`
      + `  cap ${fmt(plan.cap)}  wild ${fmt(v.wild)}  [${pops}]`
      + (plan.symbioses.length ? `  <${plan.symbioses.map((s) => s.name).join(", ")}>` : ""));
  });
  const r = E.rates(save);
  console.log(`  yard     ${save.buildings.field} fields, ${save.buildings.mash} tuns`
    + `   stock ${RESOURCES.map((x) => `${x.id} ${fmt(save.res[x.id])}`).join(" ")}`);
  console.log(`  rates    ${RESOURCES.map((x) => `${x.id} ${fmt(r[x.id])}/s`).join("  ")}`);
  console.log(`  next slot ${JSON.stringify(Object.fromEntries(Object.entries(slotCost(save.vessels.length)).map(([k, v]) => [k, fmt(v)])))}`);
  console.log(`  strains  ${save.equipped.join(", ") || "none"}   (owned ${Object.keys(save.strains).length}/${STRAINS.length})`);
  console.log(`  genes    ${Object.keys(save.genes).join(", ") || "none"} (${Object.keys(save.genes).length}/${GENES.length})`);
  console.log(`  craft    ${Object.entries(save.up).map(([k, n]) => `${k}${n > 1 ? "×" + n : ""}`).join(" ")}`);
}

console.log("");
