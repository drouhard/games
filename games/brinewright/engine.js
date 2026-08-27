/* The rules. No DOM, no timers, no randomness at all - a cellar is a plain
   object you push fixed steps into, so tools/brine-sim.mjs can play a whole
   twelve-hour career in Node in under a second.

   A vessel is a logistic race between the cultures you pitched and the
   spoilage that arrives on its own. All of them share one capacity, so the
   fitter culture does not just out-produce its neighbour, it crowds it out.
   Fitness is the product of four terms - temperature, salt, pH and oxygen -
   and the only two of those the player sets directly are the two sliders.

   The loop that makes the game: acid-makers drop their own vessel's pH, which
   eventually throttles them, and which kills spoilage outright long before it
   inconveniences them. Souring is the product and the preservative at once. */

import {
  TUNING, RESOURCES, CULTURES, CULTURE_BY_ID, WILD, VESSELS, VESSEL_BY_ID,
  SYMBIOSES, UPGRADES, UPGRADE_BY_ID, MOTHER_BY_ID, STRAIN_BY_ID, SPORE_BY_ID,
  GENE_BY_ID, costOf, buildingCost, slotCost, tierCost, newVessel,
} from "./data.js";

const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
const lvl = (bag, id) => bag?.[id] || 0;

/* ------------------------------------------------------------------------ */
/* Derived modifiers                                                         */
/* ------------------------------------------------------------------------ */

/* Everything the three prestige layers and the craft ladder do, folded into
   one object once per step. Recomputing it every step rather than caching it
   is what keeps the simulator and the browser honest: there is no stale-flag
   bug available to write. */
export function derive(save) {
  const up = save.up, mup = save.mup, sup = save.sup, genes = save.genes;
  const has = (id) => !!up[id];
  const gene = (id) => !!genes[id];
  const strain = (id) => save.equipped.includes(id) && save.strains[id];

  const head = lvl(sup, "s:head");
  const craft = (id) => lvl(up, id) + (["sow", "mill", "starter", "cellar", "yield"].includes(id) ? head : 0);

  const overdrive = gene("g:overdrive");
  const stackWeight = overdrive ? 2 : 1;

  // Every passive counts what you have ever cultured, not what is still
  // unspent. Reading the held balance instead makes spending a prestige
  // currency shrink the bonus it pays, so a careful player hoards and never
  // opens the tree - which is how the first pass produced twenty-five
  // identical racks in a row.
  const motherPass = 1 + save.mothersEver * TUNING.motherBonus * stackWeight;
  const sporePass = 1 + save.sporesEver * TUNING.sporeBonus * stackWeight;
  const lineagePass = 1 + save.lineageEver * TUNING.lineageBonus * stackWeight;
  const compound = gene("g:compound") ? 1 + save.mothersEver * 0.04 : 1;

  const yardBase = Math.pow(1.10, craft("sow")) * Math.pow(2, lvl(mup, "m:soil"))
    * (strain("diastatic") ? 6 : 1);

  const mods = {
    grainMult: yardBase,
    sugarMult: yardBase * Math.pow(1.10, craft("mill")),
    clickFive: has("handful"),

    growthMult: Math.pow(1.2, craft("starter")) * (strain("bloom") ? 2.2 : 1),
    capMult: Math.pow(1.10, craft("cellar")) * Math.pow(1.4, lvl(mup, "m:deep"))
      * (strain("floc") ? 1.9 : 1),
    outMult: Math.pow(1.10, craft("yield")) * Math.pow(1.12, lvl(mup, "m:mult"))
      * motherPass * sporePass * lineagePass * compound * (overdrive ? 3 : 1),

    wildGrowth: Math.pow(0.86, lvl(up, "sanitation")) * (strain("killer") ? 0.3 : 1),
    wildTaint: TUNING.wildTaint * (has("pellicle") ? 0.5 : 1) * (strain("killer") ? 0.4 : 1),
    noWild: gene("g:pasteur"),
    feral: !!strain("feral"),

    tempW: Math.pow(1.1, lvl(up, "tolerance")) * (has("thermostat") ? 1.25 : 1)
      * (strain("thermo") ? 1.7 : 1),
    saltW: Math.pow(1.1, lvl(up, "tolerance")) * (strain("halo") ? 1.9 : 1),
    phShift: strain("acido") ? 1.0 : 0,
    inputMult: Math.pow(0.92, lvl(up, "thrift")) * (strain("thrifty") ? 0.55 : 1),
    symbMult: strain("symbiont") ? 1.8 : 1,

    fitFloor: gene("g:domestic") ? 0.35 : 0,
    omni: gene("g:omni"),

    cultureSlots: (mup["m:cslot"] ? 1 : 0) + (gene("g:cellar") ? 1 : 0),
    maxSlots: TUNING.maxSlots + (gene("g:cellar") ? 2 : 0),
    strainSlots: TUNING.strainSlots + lvl(sup, "s:slot") + (gene("g:strain") ? 2 : 0),
    strainDiscount: gene("g:strain") ? 0.5 : 1,

    offlineEff: gene("g:deep") ? 1 : TUNING.offlineBase + 0.25 * lvl(mup, "m:patience"),
    offlineCap: gene("g:deep") ? 24 * 3600 : TUNING.offlineCap + 4 * 3600 * lvl(mup, "m:patience"),

    motherGainMult: Math.pow(1.15, lvl(mup, "m:rich")) * Math.pow(1.3, lvl(sup, "s:mother")),
    seedPop: has("backslop") ? 0.2 : 0,
    autotune: has("autotune"),
    hydrometer: has("hydrometer"),
    keepCraft: !!mup["m:keep"],
    keepTools: !!sup["s:known"],
    rememberAll: gene("g:remember"),
    autoRack: gene("g:autorack"),
    startStock: mup["m:seed"] ? { grain: 5000, sugar: 2000 } : null,
    startSlots: 1 + lvl(mup, "m:slot"),
    headLevels: head,
  };

  // Per-resource multipliers ride on top of the global one.
  mods.resMult = {};
  for (const r of RESOURCES) mods.resMult[r.id] = 1;
  if (strain("ester")) { mods.resMult.booze *= 2.6; mods.resMult.vinegar *= 2.6; }
  if (strain("solera")) { mods.resMult.funk *= 4; mods.resMult.umami *= 4; }

  return mods;
}

/* ------------------------------------------------------------------------ */
/* Vessel geometry                                                           */
/* ------------------------------------------------------------------------ */

export function vesselType(vessel) {
  return VESSEL_BY_ID[vessel.type] || VESSELS[0];
}

export function capacityOf(save, vessel, mods = derive(save)) {
  const base = vesselType(vessel);
  return base.cap * Math.pow(TUNING.tierCapGain, vessel.tier - 1) * mods.capMult;
}

export function cultureSlots(save, vessel, mods = derive(save)) {
  return vesselType(vessel).slots + mods.cultureSlots;
}

/* The four fitness terms, kept separate because the interface draws them
   separately - a player who can see which one is zero can fix it. */
export function fitness(culture, vessel, mods) {
  const base = vesselType(vessel);
  const tw = culture.tempW * mods.tempW;
  const sw = culture.saltW * mods.saltW;
  const temp = Math.exp(-Math.pow((vessel.temp - culture.tempOpt) / tw, 2));
  const salt = Math.exp(-Math.pow((vessel.salt - culture.saltOpt) / sw, 2));
  const o2 = clamp(1 - Math.abs(base.o2 - culture.o2) / culture.o2W, 0, 1);

  const lo = culture.phMin - mods.phShift;
  let ph = 1;
  if (vessel.ph < lo) ph = clamp(1 - (lo - vessel.ph) / TUNING.phSoft, 0, 1);
  else if (vessel.ph > culture.phMax) ph = clamp(1 - (vessel.ph - culture.phMax) / TUNING.phSoft, 0, 1);

  const total = temp * salt * o2 * ph;
  return { temp, salt, o2, ph, total: Math.max(total, culture.id === "wild" ? 0 : mods.fitFloor) };
}

/* Which named ferments are live in this vessel right now. A member has to hold
   a real share of the capacity, so a dying smear of yeast does not buy the
   Sourdough bonus for a crock that is really just sauerkraut. */
export function symbiosesIn(save, vessel, mods = derive(save)) {
  const cap = capacityOf(save, vessel, mods);
  const floor = cap * TUNING.symbiosisFloor;
  return SYMBIOSES.filter((s) => s.members.every((m) => (vessel.pop[m] || 0) >= floor));
}

/* One vessel's whole story: who is in it, how well each of them is doing, what
   they want to eat and what they would make if they got it. tick() and the
   interface both read this, so what the bars show is what the engine does. */
export function analyse(save, vessel, mods = derive(save)) {
  const base = vesselType(vessel);
  const cap = capacityOf(save, vessel, mods);
  const tierRate = Math.pow(TUNING.tierRateGain, vessel.tier - 1);

  const rows = [];
  let occupied = 0;
  const list = vessel.cultures.map((id) => CULTURE_BY_ID[id]).filter(Boolean);
  if (!mods.noWild) list.push(WILD);

  for (const culture of list) {
    const pop = culture.id === "wild" ? vessel.wild : vessel.pop[culture.id] || 0;
    occupied += pop;
    const fit = fitness(culture, vessel, mods);
    const makes = culture.id === "wild" && mods.feral ? "funk" : culture.makes;
    const rate = culture.id === "wild" && mods.feral ? culture.rate * 0.1 * 0.155 : culture.rate;
    // Base output before any multiplier: this is what acidifies the vessel, so
    // that the equilibrium pH is the same at ten units of output and at ten
    // billion. Biology does not scale with the upgrade tree.
    const raw = pop * rate * fit.total;
    rows.push({
      culture, pop, fit, raw, makes,
      eats: culture.eats,
      demand: raw * culture.inputPer * mods.inputMult,
      sat: 1,
    });
  }

  const symbioses = symbiosesIn(save, vessel, mods);
  const symbGain = {};
  for (const s of symbioses) {
    for (const [res, mult] of Object.entries(s.gain)) {
      symbGain[res] = (symbGain[res] || 1) * (1 + (mult - 1) * mods.symbMult);
    }
  }

  const own = occupied - (mods.noWild ? 0 : vessel.wild);
  const taint = mods.feral || occupied <= 0 ? 0 : mods.wildTaint * (vessel.wild / occupied);

  return {
    cap, occupied, rows, symbioses, symbGain, taint,
    crowd: cap > 0 ? clamp(occupied / cap, 0, 1) : 1,
    own,
    outMult: (res) => base.mult * tierRate * (base.affinity[res] || 1) * mods.outMult
      * mods.resMult[res] * (symbGain[res] || 1) * (1 - taint),
  };
}

/* The per-culture affinity lives on the vessel type but is keyed by culture,
   not by resource, so resolve it here rather than in the hot loop above. */
function affinityFor(base, cultureId) {
  return base.affinity[cultureId] || 1;
}

/* ------------------------------------------------------------------------ */
/* The step                                                                  */
/* ------------------------------------------------------------------------ */

/* One fixed step. Demand is gathered from every vessel and the mash first,
   against the balances at the top of the step, and then rationed in
   proportion - so which vessel happens to sit first in the list never decides
   who starves, and a step is the same however the cellar is ordered. */
export function step(save, dt, mods = derive(save)) {
  const res = save.res;
  const demand = {};
  const want = (id, amt) => { if (amt > 0) demand[id] = (demand[id] || 0) + amt; };

  // --- the yard ----------------------------------------------------------
  const grainRate = save.buildings.field * TUNING.fieldRate * mods.grainMult;
  const grainIn = grainRate * dt;
  const mashWant = Math.min(
    save.buildings.mash * TUNING.mashEats,
    grainRate * TUNING.mashShare,
  ) * dt;
  want("grain", mashWant);

  // --- gather every vessel's appetite ------------------------------------
  const plans = [];
  for (const vessel of save.vessels) {
    const plan = analyse(save, vessel, mods);
    plans.push(plan);
    for (const row of plan.rows) want(row.eats, row.demand * dt);
  }

  // --- ration ------------------------------------------------------------
  const share = {};
  for (const [id, amt] of Object.entries(demand)) {
    share[id] = amt <= 0 ? 1 : clamp((res[id] + (id === "grain" ? grainIn : 0)) / amt, 0, 1);
  }
  const ration = (id) => (share[id] === undefined ? 1 : share[id]);

  res.grain += grainIn;
  addMade(save, "grain", grainIn);

  // --- mash --------------------------------------------------------------
  const mashAte = mashWant * ration("grain");
  if (mashAte > 0) {
    res.grain -= mashAte;
    const wort = (mashAte / TUNING.mashEats) * TUNING.mashMakes * mods.sugarMult;
    res.sugar += wort;
    addMade(save, "sugar", wort);
  }

  // --- ferment -----------------------------------------------------------
  save.vessels.forEach((vessel, i) => {
    const plan = plans[i];
    const base = vesselType(vessel);
    let acidPressure = 0;
    // What this vessel actually made this step, per second. Recorded rather
    // than recomputed, so the number on the card is the number the cellar
    // banked - including the part where it ran out of wort halfway through.
    const out = {};

    for (const row of plan.rows) {
      const { culture } = row;
      let sat = row.demand > 0 ? ration(row.eats) : 1;
      // The Omnivore gene: a starving culture will take anything else in the
      // cellar rather than sit still, at a punitive rate.
      if (mods.omni && sat < 1 && row.demand > 0) {
        const missing = row.demand * dt * (1 - sat);
        let scavenged = 0;
        for (const r of RESOURCES) {
          if (r.id === row.eats || scavenged >= missing) continue;
          const take = Math.min(res[r.id] * 0.25, (missing - scavenged) / 0.6);
          if (take <= 0) continue;
          res[r.id] -= take;
          scavenged += take * 0.6;
        }
        sat = clamp(sat + scavenged / (row.demand * dt), 0, 1);
      }
      row.sat = sat;

      const ate = row.demand * dt * sat;
      if (ate > 0 && row.eats) res[row.eats] -= Math.min(res[row.eats], ate);

      const made = row.raw * sat * dt;
      acidPressure += made * culture.acidify;
      if (row.makes && made > 0) {
        const gained = made * plan.outMult(row.makes) * affinityFor(base, culture.id);
        res[row.makes] += gained;
        addMade(save, row.makes, gained);
        out[row.makes] = (out[row.makes] || 0) + gained / dt;
      }

      row.health = clamp(row.fit.total * sat, 0, 1);
    }

    // Who gets how much of the vessel. Every population settles toward its
    // share of the capacity, and shares go as fitness to a power - so the
    // best-suited culture dominates without ever quite excluding the others,
    // and a vessel that has gone wrong is always recoverable by moving the
    // two sliders rather than by pouring it out.
    let pressure = 0;
    for (const row of plan.rows) {
      row.pressure = Math.pow(row.health, TUNING.competition)
        * (row.culture.id === "wild" ? mods.wildGrowth : 1);
      pressure += row.pressure;
    }

    for (const row of plan.rows) {
      const { culture } = row;
      const target = pressure > 0 ? (plan.cap * row.pressure) / pressure : 0;
      const speed = target > row.pop
        ? culture.growth * mods.growthMult
        : culture.decay;
      let pop = row.pop + (target - row.pop) * clamp(speed * dt, 0, 1);

      if (culture.id === "wild") {
        if (mods.noWild) { vessel.wild = 0; continue; }
        // Spoilage never gets the whole vessel. You are still stirring it.
        vessel.wild = clamp(pop, 0, plan.cap * TUNING.wildCeiling);
      } else {
        vessel.pop[culture.id] = Math.max(pop, floorFor(save, vessel, mods));
      }
    }

    vessel.out = out;

    // pH: normalised by capacity, so a tank and a jar sour at the same pace.
    if (plan.cap > 0) vessel.ph -= (acidPressure * TUNING.phPerAcid) / plan.cap;
    vessel.ph += (TUNING.phBase - vessel.ph) * TUNING.phDrift * dt;
    vessel.ph = clamp(vessel.ph, TUNING.phFloor, TUNING.phCeil);
  });

  save.t += dt;
  if (mods.autoRack && motherGain(save, mods) >= 10) rack(save, mods);
}

function addMade(save, id, amount) {
  if (!(amount > 0)) return;
  save.made[id] = (save.made[id] || 0) + amount;
  const worth = amount * (RESOURCES.find((r) => r.id === id)?.value || 0);
  save.value += worth;
  save.valueRun += worth;
  save.valueEver += worth;
}

/* Advance by any span, in the engine's fixed step, so a 60fps frame and a
   four-hour absence go through exactly the same code. */
export function advance(save, seconds, speed = 1) {
  const mods = derive(save);
  let left = seconds * speed;
  const step_ = TUNING.step;
  let guard = 0;
  while (left > 1e-6 && guard++ < 200000) {
    const dt = Math.min(step_, left);
    step(save, dt, mods);
    left -= dt;
  }
}

/* Time away. Coarser steps than the live loop - a quarter-second step for four
   hours is 57,600 iterations of the whole cellar, which a phone does not need
   to do on launch. The ecology is a settling system, so a two-second step
   lands in the same place. */
export function offline(save, seconds, mods = derive(save)) {
  const capped = Math.min(Math.max(seconds, 0), mods.offlineCap);
  const effective = capped * mods.offlineEff;
  if (effective < 1) return { seconds: capped, effective: 0, gained: {} };

  const before = { ...save.res };
  let left = effective;
  while (left > 1e-6) {
    const dt = Math.min(2, left);
    step(save, dt, mods);
    left -= dt;
  }
  const gained = {};
  for (const r of RESOURCES) {
    const delta = save.res[r.id] - before[r.id];
    if (delta > 0.5) gained[r.id] = delta;
  }
  return { seconds: capped, effective, gained };
}

/* ------------------------------------------------------------------------ */
/* Spending                                                                  */
/* ------------------------------------------------------------------------ */

export function canAfford(save, cost) {
  return Object.entries(cost).every(([id, amt]) => save.res[id] >= amt - 1e-9);
}

export function pay(save, cost) {
  if (!canAfford(save, cost)) return false;
  for (const [id, amt] of Object.entries(cost)) save.res[id] -= amt;
  return true;
}

/* Whether an upgrade is even on the shelf yet. Requirements are data, not
   closures, so data.js stays a file of numbers you can read top to bottom. */
export function available(save, entry) {
  const req = entry.req;
  if (!req) return true;
  if (req.res && save.res[req.res[0]] < req.res[1] && (save.made[req.res[0]] || 0) < req.res[1]) return false;
  if (req.building && save.buildings[req.building[0]] < req.building[1]) return false;
  if (req.culture && !save.cultures[req.culture]) return false;
  if (req.up && !save.up[req.up]) return false;
  return true;
}

export function upgradeCost(save, entry) {
  return costOf(entry, entry.kind === "repeat" ? lvl(save.up, entry.id) : 0);
}

export function buyUpgrade(save, id) {
  const entry = UPGRADE_BY_ID[id];
  if (!entry || !available(save, entry)) return false;
  if (entry.kind === "once" && save.up[id]) return false;
  if (entry.max && lvl(save.up, id) >= entry.max) return false;
  if (!pay(save, upgradeCost(save, entry))) return false;

  save.up[id] = lvl(save.up, id) + 1;
  if (id.startsWith("have:")) save.cultures[id.slice(5)] = true;
  if (id.startsWith("type:")) save.types[id.slice(5)] = true;
  return true;
}

export function buyBuilding(save, id, count = 1) {
  for (let i = 0; i < count; i++) {
    const cost = { grain: buildingCost(id, save.buildings[id]) };
    if (!pay(save, cost)) return i > 0;
    save.buildings[id]++;
  }
  return true;
}

export function buySlot(save, mods = derive(save)) {
  if (save.vessels.length >= mods.maxSlots) return false;
  if (!pay(save, slotCost(save.vessels.length))) return false;
  save.vessels.push(newVessel("jar"));
  return true;
}

export function buyTier(save, index) {
  const vessel = save.vessels[index];
  if (!vessel) return false;
  if (!pay(save, tierCost(vessel.type, vessel.tier))) return false;
  vessel.tier++;
  return true;
}

/* Swapping a vessel's type is free - it is moving a ferment into a different
   container, not buying one - but it costs the ferment: a crock's populations
   do not survive being poured into a barrel. That is the price. */
export function setVesselType(save, index, typeId) {
  const vessel = save.vessels[index];
  if (!vessel || !save.types[typeId]) return false;
  if (vessel.type === typeId) return false;
  const mods = derive(save);
  vessel.type = typeId;
  vessel.pop = {};
  vessel.wild = 0;
  vessel.ph = TUNING.phBase;
  vessel.cultures = vessel.cultures.slice(0, cultureSlots(save, vessel, mods));
  for (const id of vessel.cultures) vessel.pop[id] = seedFor(save, vessel, mods);
  return true;
}

/* What a pitched culture always has in the vessel, however badly it is doing.
   Spoilage taking a vessel has to be a setback you fix with the two sliders,
   not a dead jar you can never get back - and without a floor proportional to
   capacity, a crock full of spoilage is exactly that: no room to grow into, so
   no acid, so nothing to kill the spoilage with. */
function seedFor(save, vessel, mods) {
  const cap = capacityOf(save, vessel, mods);
  return Math.max(TUNING.seedPop, cap * Math.max(TUNING.seedShare, mods.seedPop));
}

/* The smear a pitched culture always keeps, however badly it is doing. Without
   it a vessel that has gone over to spoilage has no room to grow anything back
   into, so it makes no acid, so nothing ever kills the spoilage: a dead jar
   you cannot fix, which is not a setback, it is a bin. */
function floorFor(save, vessel, mods) {
  return Math.max(TUNING.seedPop, capacityOf(save, vessel, mods) * TUNING.seedShare);
}

export function inoculate(save, index, cultureId) {
  const vessel = save.vessels[index];
  const mods = derive(save);
  if (!vessel || !save.cultures[cultureId]) return false;
  if (vessel.cultures.includes(cultureId)) return false;
  if (vessel.cultures.length >= cultureSlots(save, vessel, mods)) return false;
  vessel.cultures.push(cultureId);
  vessel.pop[cultureId] = seedFor(save, vessel, mods);
  return true;
}

export function cull(save, index, cultureId) {
  const vessel = save.vessels[index];
  if (!vessel) return false;
  const at = vessel.cultures.indexOf(cultureId);
  if (at === -1) return false;
  vessel.cultures.splice(at, 1);
  delete vessel.pop[cultureId];
  return true;
}

export function setTemp(save, index, value) {
  const vessel = save.vessels[index];
  if (vessel) vessel.temp = clamp(value, TUNING.tempMin, TUNING.tempMax);
}

export function setSalt(save, index, value) {
  const vessel = save.vessels[index];
  if (vessel) vessel.salt = clamp(value, TUNING.saltMin, TUNING.saltMax);
}

/* The Blending Notes upgrade. A coarse search rather than a solve: it scores
   the whole grid on the product of what every pitched culture would actually
   make, which is the same thing a player does by dragging and watching, only
   without the dragging. */
export function bestSettings(save, index, mods = derive(save)) {
  const vessel = save.vessels[index];
  if (!vessel || !vessel.cultures.length) return null;
  const probe = { ...vessel, pop: { ...vessel.pop } };
  let best = { temp: vessel.temp, salt: vessel.salt, score: -1 };
  for (let t = TUNING.tempMin; t <= TUNING.tempMax; t += 0.5) {
    for (let s = TUNING.saltMin; s <= TUNING.saltMax; s += 0.25) {
      probe.temp = t; probe.salt = s;
      // Score the equilibrium, not the curve. Two things the naive version
      // gets wrong and a player never does: settings where a culture is
      // perfectly happy and still loses the vessel to spoilage that is
      // happier, and settings that maximise one pitched culture by starving
      // the other - which throws away both the partner's product and the
      // symbiosis that was the reason to co-pitch them.
      const fits = vessel.cultures.map((id) => fitness(CULTURE_BY_ID[id], probe, mods).total);
      const sum = fits.reduce((a, b) => a + b, 0);
      if (sum <= 0) continue;
      const live = new Set();
      vessel.cultures.forEach((id, k) => { if (fits[k] / sum >= TUNING.symbiosisFloor) live.add(id); });
      const bonus = {};
      for (const sym of SYMBIOSES) {
        if (!sym.members.every((m) => live.has(m))) continue;
        for (const [r, mult] of Object.entries(sym.gain)) {
          bonus[r] = (bonus[r] || 1) * (1 + (mult - 1) * mods.symbMult);
        }
      }
      let score = 0;
      let ownFit = 0;
      vessel.cultures.forEach((id, k) => {
        const culture = CULTURE_BY_ID[id];
        const value = RESOURCES.find((r) => r.id === culture.makes)?.value || 1;
        score += fits[k] * culture.rate * value * (bonus[culture.makes] || 1);
        ownFit = Math.max(ownFit, fits[k]);
      });
      if (!mods.noWild) {
        const wildFit = fitness(WILD, probe, mods).total;
        const share = ownFit + wildFit > 0 ? ownFit / (ownFit + wildFit) : 1;
        score *= share * (1 - mods.wildTaint * (1 - share));
      }
      if (score > best.score) best = { temp: t, salt: s, score };
    }
  }
  return best;
}

export function tune(save, index) {
  const mods = derive(save);
  const best = bestSettings(save, index, mods);
  if (!best || !mods.autotune) return false;
  setTemp(save, index, best.temp);
  setSalt(save, index, best.salt);
  return true;
}

/* ------------------------------------------------------------------------ */
/* Layer 1 — racking                                                         */
/* ------------------------------------------------------------------------ */

export function motherGain(save, mods = derive(save)) {
  if (save.value < TUNING.motherReq) return 0;
  return Math.floor(Math.pow(save.value / TUNING.motherDiv, TUNING.motherExp) * mods.motherGainMult);
}

export function rack(save, mods = derive(save)) {
  const gain = motherGain(save, mods);
  if (gain <= 0) return 0;

  const keptCraft = {};
  if (mods.keepCraft) {
    for (const u of UPGRADES) {
      if (u.kind !== "repeat") continue;
      const half = Math.floor(lvl(save.up, u.id) / 2);
      if (half > 0) keptCraft[u.id] = half;
    }
  }
  // Knowledge survives a rack. Forgetting how to pitch yeast because you
  // poured the crocks out is not a prestige loop, it is a punishment - the
  // first pass did exactly that and every rack was a net loss.
  const keptCultures = { ...save.cultures };
  const keptTypes = { ...save.types };
  const oldVessels = save.vessels.map((v) => ({ type: v.type, tier: v.tier, cultures: [...v.cultures], temp: v.temp, salt: v.salt }));

  save.mothers += gain;
  save.mothersEver += gain;
  save.racks++;

  resetCellar(save, keptCraft, keptCultures, keptTypes, mods.keepTools);
  // Standing Orders (and the gene that racks for you) put the cellar back.
  if (save.mup["m:auto"] || mods.autoRack) rebuild(save, oldVessels, derive(save));
  return gain;
}

/* Instruments a rack may keep, if Kept Instruments has been bought with
   spores. They are one-off quality-of-life rather than raw output, so keeping
   them shortens the dull part of a rack without shortening the game. */
const INSTRUMENTS = ["handful", "thermostat", "pellicle", "hydrometer", "autotune", "backslop"];

function resetCellar(save, keptCraft, keptCultures, keptTypes, keepTools = false) {
  for (const r of RESOURCES) { save.res[r.id] = 0; save.made[r.id] = 0; }
  save.value = 0;
  save.buildings = { field: 0, mash: 0 };
  save.up = { ...keptCraft };
  if (keepTools) for (const id of INSTRUMENTS) if (save.up[id]) keptCraft[id] = 1;
  save.up = { ...keptCraft };
  for (const id of Object.keys(keptCultures)) if (id !== "lacto") save.up[`have:${id}`] = 1;
  for (const id of Object.keys(keptTypes)) if (id !== "jar") save.up[`type:${id}`] = 1;
  save.cultures = keptCultures;
  save.types = keptTypes;

  const mods = derive(save);
  const slots = Math.min(mods.startSlots, mods.maxSlots);
  save.vessels = [];
  for (let i = 0; i < slots; i++) save.vessels.push(newVessel("jar"));
  if (mods.startStock) for (const [id, amt] of Object.entries(mods.startStock)) save.res[id] += amt;
  for (const v of save.vessels) {
    v.cultures = ["lacto"];
    v.pop = { lacto: seedFor(save, v, mods) };
    v.temp = 22; v.salt = 3.5;
  }
}

/* Standing Orders: put the cellar back the way it was, as far as the fresh
   balance stretches. It buys slots and tiers in the order they were bought
   before and stops at the first thing it cannot pay for, which is exactly
   what a player does on the first minute after a rack. */
function rebuild(save, oldVessels, mods) {
  while (save.vessels.length < oldVessels.length && save.vessels.length < mods.maxSlots) {
    if (!buySlot(save, mods)) break;
  }
  save.vessels.forEach((vessel, i) => {
    const old = oldVessels[i];
    if (!old) return;
    if (save.types[old.type]) setVesselType(save, i, old.type);
    while (vessel.tier < old.tier && buyTier(save, i)) { /* as far as it goes */ }
    vessel.cultures = [];
    vessel.pop = {};
    for (const id of old.cultures) inoculate(save, i, id);
    vessel.temp = old.temp;
    vessel.salt = old.salt;
  });
}

export function buyMother(save, id) {
  const entry = MOTHER_BY_ID[id];
  if (!entry) return false;
  const level = lvl(save.mup, id);
  if (entry.kind === "once" && level) return false;
  if (entry.max && level >= entry.max) return false;
  const price = Math.ceil(entry.cost * Math.pow(entry.growth ?? 1, level));
  if (save.mothers < price) return false;
  save.mothers -= price;
  save.mup[id] = level + 1;
  return true;
}

export function motherPrice(save, entry) {
  return Math.ceil(entry.cost * Math.pow(entry.growth ?? 1, lvl(save.mup, entry.id)));
}

/* ------------------------------------------------------------------------ */
/* Layer 2 — blooming the cellar                                             */
/* ------------------------------------------------------------------------ */

export function sporeGain(save) {
  if (save.valueRun < TUNING.sporeReq) return 0;
  return Math.floor(Math.pow(save.valueRun / TUNING.sporeDiv, TUNING.sporeExp));
}

export function bloom(save) {
  const gain = sporeGain(save);
  if (gain <= 0) return 0;
  const mods = derive(save);
  const keptStrains = mods.rememberAll ? { ...save.strains } : {};
  const keptEquip = mods.rememberAll ? [...save.equipped] : [];
  // A bloom keeps the recipe book but nothing else: the cellar, the mothers
  // and everything they bought all go back into the air.
  const keptCultures = { ...save.cultures };
  const keptTypes = { ...save.types };

  save.spores += gain;
  save.sporesEver += gain;
  save.blooms++;
  save.mothers = 0;
  save.mothersEver = 0;
  save.mup = {};
  save.racks = 0;
  save.strains = keptStrains;
  save.equipped = keptEquip;
  save.valueRun = 0;
  resetCellar(save, {}, keptCultures, keptTypes);
  return gain;
}

export function strainPrice(save, strain, mods = derive(save)) {
  return Math.max(1, Math.ceil(strain.cost * mods.strainDiscount));
}

export function buyStrain(save, id) {
  const strain = STRAIN_BY_ID[id];
  if (!strain || save.strains[id]) return false;
  const price = strainPrice(save, strain);
  if (save.spores < price) return false;
  save.spores -= price;
  save.strains[id] = true;
  const mods = derive(save);
  if (save.equipped.length < mods.strainSlots) save.equipped.push(id);
  return true;
}

export function equip(save, id) {
  const mods = derive(save);
  if (!save.strains[id]) return false;
  const at = save.equipped.indexOf(id);
  if (at !== -1) { save.equipped.splice(at, 1); return true; }
  if (save.equipped.length >= mods.strainSlots) return false;
  save.equipped.push(id);
  return true;
}

export function buySpore(save, id) {
  const entry = SPORE_BY_ID[id];
  if (!entry) return false;
  const level = lvl(save.sup, id);
  if (entry.kind === "once" && level) return false;
  if (entry.max && level >= entry.max) return false;
  const price = Math.ceil(entry.cost * Math.pow(entry.growth ?? 1, level));
  if (save.spores < price) return false;
  save.spores -= price;
  save.sup[id] = level + 1;
  return true;
}

export function sporePrice(save, entry) {
  return Math.ceil(entry.cost * Math.pow(entry.growth ?? 1, lvl(save.sup, entry.id)));
}

/* ------------------------------------------------------------------------ */
/* Layer 3 — lineage                                                         */
/* ------------------------------------------------------------------------ */

export function lineageGain(save) {
  if (save.valueEver < TUNING.lineageReq) return 0;
  const owed = Math.floor(Math.pow(save.valueEver / TUNING.lineageDiv, TUNING.lineageExp));
  return Math.max(0, owed - save.lineageEver);
}

export function ascend(save) {
  const gain = lineageGain(save);
  if (gain <= 0) return 0;
  const mods = derive(save);
  const keptCultures = { ...save.cultures };
  const keptTypes = { ...save.types };

  save.lineage += gain;
  save.lineageEver += gain;
  save.ascents++;
  save.mothers = 0; save.mothersEver = 0; save.mup = {};
  save.spores = 0; save.sup = {};
  if (!mods.rememberAll) { save.strains = {}; save.equipped = []; save.sporesEver = 0; }
  save.racks = 0; save.blooms = 0;
  save.valueRun = 0;
  resetCellar(save, {}, keptCultures, keptTypes);
  return gain;
}

export function buyGene(save, id) {
  const gene = GENE_BY_ID[id];
  if (!gene || save.genes[id]) return false;
  if (save.lineage < gene.cost) return false;
  save.lineage -= gene.cost;
  save.genes[id] = true;
  return true;
}

/* ------------------------------------------------------------------------ */
/* Readouts for the interface and the simulator                              */
/* ------------------------------------------------------------------------ */

/* Per-second rates as the cellar currently stands. Measured, not derived: it
   runs one throwaway step on a copy and reads the difference, so it can never
   drift from what the game actually does. */
export function rates(save) {
  const copy = JSON.parse(JSON.stringify(save));
  const before = { ...copy.res };
  step(copy, 1);
  const out = {};
  for (const r of RESOURCES) out[r.id] = copy.res[r.id] - before[r.id];
  out.value = copy.value - save.value;
  return out;
}
