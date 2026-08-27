/* Every number in Brinewright, and nothing else. The engine reads this file,
   the interface reads this file, and tools/brine-sim.mjs reads this file - so
   the whole game can be retuned without touching a line of logic.

   The shape of this incremental is a chain of live cultures competing for one
   vessel. Grain feeds the mash, the mash feeds sugar, and sugar is fought over
   by microbes whose growth depends on temperature, salt, pH and oxygen. Every
   number below is either a knob on that competition or a price on the ladder
   that widens it. */

/* ------------------------------------------------------------------------ */
/* Global constants                                                          */
/* ------------------------------------------------------------------------ */

export const TUNING = {
  // --- the yard ----------------------------------------------------------
  // The onramp: a tap makes grain, fields make it while you are away, and the
  // mash converts it. The mash deliberately eats more grain than it makes
  // sugar, so over-buying tuns starves them - the first real decision.
  clickGrain: 2,
  fieldRate: 0.6,
  fieldCost: 15,
  fieldGrowth: 1.16,
  mashEats: 1.2,
  mashMakes: 0.75,
  // The tuns work through four fifths of what the fields bring in and never
  // touch the barn's savings, so a fifth of every harvest always piles up.
  // Without that reserve a yard whose tuns out-eat its fields can never afford
  // another field, and the game deadlocks at whatever size it happened to
  // reach - which is exactly what the first pass of these numbers did.
  mashShare: 0.8,
  mashCost: 60,
  mashGrowth: 1.19,

  // --- the ecology -------------------------------------------------------
  // A vessel is a logistic race. Every population shares one capacity, so a
  // culture that fits the conditions better does not merely out-produce its
  // neighbour, it crowds it out. That single shared term is what makes
  // temperature and salt worth thinking about.
  seedPop: 0.02, // an inoculation never quite dies; it can always come back
  seedShare: 0.015, // ...and it holds at least this share of the vessel, so a
  wildCeiling: 0.75, // badly tuned vessel is always recoverable, never lost
  /* How sharply the vessel is divided between the things living in it. Each
     population settles at its share of capacity, and shares go as fitness to
     this power - so 1 is a gentle split and 4 is nearly winner-take-all.
     A plain shared-capacity logistic, which is what a textbook would give
     you, is exactly winner-take-all: competitive exclusion means the fitter
     culture takes the entire vessel and the other dies. True of real chemostats,
     ruinous for a game whose whole subject is two cultures in one crock. */
  competition: 1.8,
  wildSeed: 0.012, // spoilage drifts in from the air, forever, for free
  wildTaint: 0.85, // share of output a fully spoiled vessel loses
  phBase: 6.2, // what an unfermented vessel sits at
  phFloor: 2.5,
  phCeil: 7.2,
  phPerAcid: 1.4, // pH points dropped per unit of acidity per unit capacity
  phDrift: 0.03, // per second, back toward phBase
  phSoft: 0.8, // pH points outside a culture's range before it is dead
  tempMin: 4,
  tempMax: 40,
  saltMin: 0,
  saltMax: 12,

  // --- vessels -----------------------------------------------------------
  maxSlots: 8,
  slotCostGrowth: 4.0,
  /* Every repeatable ladder in this game obeys one rule: ln(gain) over
     ln(cost growth) must stay small, because those ratios ADD across ladders.
     Five of them at a comfortable-looking 0.3 each sum to 1.5, and any sum
     over 1.0 is an economy that outruns its own prices - which is how the
     first pass of these numbers reached fifty trillion a second in three
     hours with no prestige at all. These add to about 0.6. */
  tierCapGain: 1.22, // per tier, on the base capacity
  tierRateGain: 1.08,
  tierCostGrowth: 4.6,
  symbiosisFloor: 0.12, // share of capacity a partner needs for the bonus

  // --- time --------------------------------------------------------------
  step: 0.25, // the fixed step the engine advances in, seconds
  offlineCap: 4 * 3600,
  offlineBase: 0.45, // fraction of live speed while the tab is shut

  // --- prestige ----------------------------------------------------------
  // All three layers read one number: the value of everything fermented since
  // that layer last reset. Value is weighted by resource (see RESOURCES), so
  // reaching a deeper link in the chain is worth more than piling up sugar.
  /* The exponent is the safety catch. A run's income grows as roughly T^3.5,
     which means any flat multiplier the prestige tree hands back is amplified
     to its 4.5th power by the ladder underneath it. Mothers per rack therefore
     have to grow slower than the 1/4.5 power of the bonus they buy, or racks
     compound into each other and the game is over on the fifth one. */
  motherDiv: 1.0e2,
  motherExp: 0.2,
  motherReq: 1.5e5,
  sporeDiv: 1.0e6,
  sporeExp: 0.25,
  sporeReq: 1.2e9,
  lineageDiv: 5.0e8,
  lineageExp: 0.22,
  lineageReq: 5.0e12,
  motherBonus: 0.06, // +6% to every vessel's output per mother held
  sporeBonus: 0.11,
  lineageBonus: 0.25,
  strainSlots: 2,
};

/* ------------------------------------------------------------------------ */
/* Resources                                                                 */
/* ------------------------------------------------------------------------ */

/* `value` is the whole economy in one column: it decides what a prestige is
   worth, and therefore what is worth fermenting. Each link down the chain is
   worth several times the one above it, which is what stops a wall of sugar
   from being a winning strategy. */
export const RESOURCES = [
  { id: "grain", name: "Grain", icon: "🌾", value: 1, hue: 44 },
  { id: "sugar", name: "Wort", icon: "🍯", value: 4, hue: 36 },
  { id: "acid", name: "Sour", icon: "🥬", value: 22, hue: 96 },
  { id: "booze", name: "Alcohol", icon: "🍺", value: 30, hue: 28 },
  { id: "vinegar", name: "Vinegar", icon: "🍶", value: 190, hue: 12 },
  { id: "umami", name: "Umami", icon: "🍚", value: 340, hue: 268 },
  { id: "funk", name: "Funk", icon: "🍇", value: 2600, hue: 312 },
];

export const RES_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r]));

/* ------------------------------------------------------------------------ */
/* Cultures                                                                  */
/* ------------------------------------------------------------------------ */

/* Each culture is a bell curve in temperature, a bell curve in salt, a window
   in pH and a preference for oxygen. Where those four overlap is where it
   lives; where two cultures' curves overlap is where a symbiosis is possible.

   `acidify` is the feedback loop the whole game turns on: acid-makers drop
   their own vessel's pH, which eventually strangles them - and strangles the
   spoilage that would otherwise eat the vessel first. Souring is both the
   product and the preservative, exactly as it is in a real crock. */
export const CULTURES = [
  {
    id: "lacto",
    name: "Lactobacillus",
    common: "the souring bacteria",
    icon: "lacto",
    eats: "sugar", makes: "acid", inputPer: 2.0,
    rate: 0.105, growth: 0.30, decay: 0.16,
    tempOpt: 22, tempW: 9,
    saltOpt: 3.5, saltW: 5.5,
    phMin: 3.2, phMax: 6.9,
    o2: 0.15, o2W: 1.35,
    acidify: 1.0,
    note: "Loves salt, hates nothing much, and sours itself to a standstill below pH 3.2.",
  },
  {
    id: "sacch",
    name: "Saccharomyces",
    common: "brewer's yeast",
    icon: "sacch",
    eats: "sugar", makes: "booze", inputPer: 2.2,
    rate: 0.118, growth: 0.26, decay: 0.18,
    tempOpt: 20, tempW: 7,
    saltOpt: 0, saltW: 2.4,
    phMin: 3.4, phMax: 6.5,
    o2: 0.20, o2W: 0.55,
    acidify: 0.12,
    note: "Wants a sealed vessel, cool and unsalted. Salt above 3% stops it dead.",
  },
  {
    id: "aceto",
    name: "Acetobacter",
    common: "the vinegar mother",
    icon: "aceto",
    eats: "booze", makes: "vinegar", inputPer: 1.5,
    rate: 0.075, growth: 0.21, decay: 0.16,
    tempOpt: 28, tempW: 6.5,
    saltOpt: 0, saltW: 2.2,
    phMin: 2.6, phMax: 6.0,
    o2: 0.95, o2W: 0.75,
    acidify: 0.55,
    note: "Breathes. It needs an open vessel, warmth, and alcohol somebody else made.",
  },
  {
    id: "koji",
    name: "Aspergillus oryzae",
    common: "kōji mould",
    icon: "koji",
    eats: "grain", makes: "umami", inputPer: 4.5,
    rate: 0.062, growth: 0.17, decay: 0.14,
    tempOpt: 30, tempW: 5,
    saltOpt: 1.5, saltW: 4,
    phMin: 4.6, phMax: 7.2,
    o2: 0.85, o2W: 0.45,
    acidify: 0.04,
    note: "Hot, airy and sweet. The one culture that eats grain directly — and the one acid kills.",
  },
  {
    id: "brett",
    name: "Brettanomyces",
    common: "the wild yeast",
    icon: "brett",
    eats: "booze", makes: "funk", inputPer: 3.0,
    rate: 0.0155, growth: 0.095, decay: 0.07,
    tempOpt: 24, tempW: 10,
    saltOpt: 1.0, saltW: 4.5,
    phMin: 2.4, phMax: 5.8,
    o2: 0.35, o2W: 0.75,
    acidify: 0.3,
    note: "Slow, unkillable, and worth more than everything above it put together.",
  },
];

export const CULTURE_BY_ID = Object.fromEntries(CULTURES.map((c) => [c.id, c]));

/* Spoilage is a culture too, and deliberately a good one: it grows faster than
   anything you own, tolerates any temperature, and eats your wort for nothing.
   Its two weaknesses are the two sliders - it cannot take salt, and it cannot
   take acid. That is the entire defensive game. */
export const WILD = {
  id: "wild",
  name: "Spoilage",
  common: "whatever got in",
  icon: "wild",
  eats: "sugar", makes: null, inputPer: 1.4,
  rate: 0.09, growth: 0.34, decay: 0.10,
  tempOpt: 26, tempW: 14,
  saltOpt: 0, saltW: 3.2,
  phMin: 4.4, phMax: 7.2,
  o2: 0.6, o2W: 0.95,
  acidify: 0.05,
};

/* ------------------------------------------------------------------------ */
/* Vessels                                                                   */
/* ------------------------------------------------------------------------ */

/* Oxygen is fixed per vessel, not a slider, because it is the one condition a
   fermenter picks once by choosing the container. That makes the vessel type a
   real decision rather than a bigger number: an airlocked carboy is worthless
   to Acetobacter no matter how you set the other two knobs. */
export const VESSELS = [
  {
    id: "jar", name: "Mason Jar", icon: "jar",
    cap: 12, o2: 0.55, slots: 1, mult: 1.0,
    cost: null, // the one you start with
    affinity: {},
    note: "One culture, a loose lid, and room-temperature air.",
  },
  {
    id: "crock", name: "Stone Crock", icon: "crock",
    cap: 30, o2: 0.35, slots: 2, mult: 1.15,
    cost: { sugar: 900, acid: 120 },
    affinity: { lacto: 1.5 },
    note: "Heavy, half-sealed, and built for salt. Lactobacillus doubles down in one.",
  },
  {
    id: "carboy", name: "Glass Carboy", icon: "carboy",
    cap: 46, o2: 0.08, slots: 2, mult: 1.3,
    cost: { acid: 2400, booze: 900 },
    affinity: { sacch: 1.55, brett: 1.2 },
    note: "An airlock. Nothing that breathes can live here — which is the point.",
  },
  {
    id: "barrel", name: "Oak Barrel", icon: "barrel",
    cap: 66, o2: 0.9, slots: 2, mult: 1.45,
    cost: { booze: 5000, vinegar: 150 },
    affinity: { aceto: 1.5, brett: 1.85 },
    note: "Porous oak: all the air in the world, and the only home Brett really wants.",
  },
  {
    id: "tray", name: "Kōji Tray", icon: "tray",
    cap: 58, o2: 0.88, slots: 2, mult: 1.4,
    cost: { vinegar: 3000, umami: 220 },
    affinity: { koji: 2.0 },
    note: "Cedar, shallow and warm. Mould wants surface area, not depth.",
  },
  {
    id: "tank", name: "Cellar Tank", icon: "tank",
    cap: 155, o2: 0.5, slots: 3, mult: 1.85,
    cost: { umami: 9000, funk: 260 },
    affinity: { lacto: 1.2, sacch: 1.2, aceto: 1.2, koji: 1.2, brett: 1.2 },
    note: "Three cultures, cellar air, and more capacity than the rest of the shelf combined.",
  },
];

export const VESSEL_BY_ID = Object.fromEntries(VESSELS.map((v) => [v.id, v]));

/* ------------------------------------------------------------------------ */
/* Symbioses                                                                 */
/* ------------------------------------------------------------------------ */

/* The reason to crowd two cultures into one vessel despite the shared
   capacity. Every pair here is a ferment that really works this way, and each
   one demands a temperature and salt setting that suits both halves - which is
   the puzzle. A member has to hold `symbiosisFloor` of the capacity to count,
   so a token smear of yeast does not buy the bonus. */
export const SYMBIOSES = [
  { id: "sourdough", name: "Sourdough", members: ["lacto", "sacch"], gain: { acid: 1.7, booze: 1.7 },
    note: "Cool and unsalted: the bacteria sour it, the yeast lifts it." },
  { id: "scoby", name: "SCOBY", members: ["sacch", "aceto"], gain: { booze: 1.25, vinegar: 1.9 },
    note: "Kombucha's raft. The yeast makes the alcohol the bacteria drinks." },
  { id: "miso", name: "Miso", members: ["koji", "lacto"], gain: { acid: 1.3, umami: 2.0 },
    note: "Salt high enough for the mould to survive its neighbours." },
  { id: "lambic", name: "Lambic", members: ["brett", "lacto"], gain: { acid: 1.25, funk: 2.3 },
    note: "Sour first, funky forever. Brett is the only thing still eating at pH 3." },
  { id: "solera", name: "Solera", members: ["aceto", "brett"], gain: { vinegar: 1.6, funk: 1.7 },
    note: "A warm open barrel where both of them just keep going." },
  { id: "shoyu", name: "Shoyu", members: ["koji", "aceto"], gain: { vinegar: 1.5, umami: 1.5 },
    note: "Mould and vinegar bacteria want the same hot, airy vessel." },
  { id: "gueuze", name: "Gueuze", members: ["lacto", "sacch", "brett"], gain: { acid: 2.4, booze: 2.4, funk: 2.8 },
    note: "Three cultures, one carboy, and the finest thing in the cellar." },
];

/* ------------------------------------------------------------------------ */
/* The craft ladder — upgrades bought with product                           */
/* ------------------------------------------------------------------------ */

/* No coin. Every upgrade is paid for in the things you fermented, so a price
   in vinegar is a gate that says "get a barrel working first" far more clearly
   than a number ever could.

   `kind: "repeat"` climbs forever at `growth` per level; `kind: "once"` is a
   rule or an unlock. `req` is read by engine.available(). */
export const UPGRADES = [
  // --- the yard ----------------------------------------------------------
  { id: "sow", name: "Broader Sowing", kind: "repeat", growth: 1.9, cost: { grain: 60 },
    desc: "+10% grain from fields and from your own hands." },
  { id: "mill", name: "Finer Milling", kind: "repeat", growth: 1.9, cost: { sugar: 55 },
    desc: "+10% wort from every mash tun.", req: { building: ["mash", 1] } },
  { id: "handful", name: "Two Hands", kind: "once", cost: { grain: 400 },
    desc: "A tap is worth five seconds of your fields instead of a fixed scoop." },

  // --- the ecology -------------------------------------------------------
  { id: "starter", name: "Kept Starter", kind: "repeat", growth: 1.9, max: 15, cost: { acid: 40 },
    desc: "+20% growth rate for every culture.", req: { res: ["acid", 20] } },
  { id: "cellar", name: "Deeper Shelves", kind: "repeat", growth: 1.9, cost: { acid: 90, sugar: 400 },
    desc: "+10% capacity in every vessel.", req: { res: ["acid", 60] } },
  { id: "yield", name: "Practised Hand", kind: "repeat", growth: 1.9, cost: { booze: 150 },
    desc: "+10% output from every vessel.", req: { res: ["booze", 60] } },
  { id: "sanitation", name: "Scalded Vessels", kind: "repeat", growth: 2.2, max: 12, cost: { vinegar: 45 },
    desc: "−14% spoilage growth, compounding.", req: { res: ["vinegar", 20] } },
  { id: "tolerance", name: "Hardened Strains", kind: "repeat", growth: 2.2, max: 12, cost: { umami: 40 },
    desc: "+10% width on every temperature and salt curve.", req: { res: ["umami", 20] } },
  { id: "thrift", name: "Full Conversion", kind: "repeat", growth: 2.4, max: 10, cost: { funk: 6 },
    desc: "−8% input eaten per unit made, compounding.", req: { res: ["funk", 3] } },

  // --- cultures ----------------------------------------------------------
  { id: "have:sacch", name: "Pitch Brewer's Yeast", kind: "once", cost: { sugar: 250 },
    desc: "Unlocks Saccharomyces: wort into alcohol, sealed and cool.", req: { res: ["sugar", 120] } },
  { id: "have:aceto", name: "Beg a Vinegar Mother", kind: "once", cost: { booze: 400 },
    desc: "Unlocks Acetobacter: alcohol into vinegar, warm and open to the air.", req: { res: ["booze", 150] } },
  { id: "have:koji", name: "Buy Kōji Spores", kind: "once", cost: { vinegar: 400, sugar: 12000 },
    desc: "Unlocks Aspergillus: grain straight into umami, hot and dry.", req: { res: ["vinegar", 120] } },
  { id: "have:brett", name: "Catch a Wild Yeast", kind: "once", cost: { umami: 2600, vinegar: 4000 },
    desc: "Unlocks Brettanomyces: slow, sour-proof, and the source of all funk.", req: { res: ["umami", 900] } },

  // --- vessels -----------------------------------------------------------
  { id: "type:crock", name: "Throw a Stone Crock", kind: "once", cost: VESSEL_BY_ID.crock.cost,
    desc: "Unlocks the Stone Crock: two cultures, salt-friendly, half-sealed.", req: { res: ["acid", 60] } },
  { id: "type:carboy", name: "Blow a Glass Carboy", kind: "once", cost: VESSEL_BY_ID.carboy.cost,
    desc: "Unlocks the Glass Carboy: airlocked, cool, and lethal to anything that breathes.", req: { culture: "sacch" } },
  { id: "type:barrel", name: "Coop an Oak Barrel", kind: "once", cost: VESSEL_BY_ID.barrel.cost,
    desc: "Unlocks the Oak Barrel: porous, airy, and the only real home for Brett.", req: { culture: "aceto" } },
  { id: "type:tray", name: "Build a Kōji Tray", kind: "once", cost: VESSEL_BY_ID.tray.cost,
    desc: "Unlocks the Kōji Tray: shallow cedar, hot and open.", req: { culture: "koji" } },
  { id: "type:tank", name: "Sink a Cellar Tank", kind: "once", cost: VESSEL_BY_ID.tank.cost,
    desc: "Unlocks the Cellar Tank: three culture slots and a cavernous capacity.", req: { culture: "brett" } },

  // --- instruments and rules ---------------------------------------------
  { id: "thermostat", name: "Cellar Thermostat", kind: "once", cost: { booze: 2500, acid: 6000 },
    desc: "Every temperature curve is 25% wider. Nothing is quite as fussy again.", req: { res: ["booze", 800] } },
  { id: "pellicle", name: "Pellicle Cap", kind: "once", cost: { vinegar: 2200 },
    desc: "A skin over the surface: spoilage taints half as much of what a vessel makes.", req: { res: ["vinegar", 700] } },
  { id: "hydrometer", name: "Hydrometer", kind: "once", cost: { acid: 3000, sugar: 20000 },
    desc: "Shows the exact fitness, pH and crowding behind every population bar.", req: { res: ["acid", 1200] } },
  { id: "autotune", name: "Blending Notes", kind: "once", cost: { umami: 1800, booze: 40000 },
    desc: "A Tune button that sets a vessel's temperature and salt to the best compromise for what is in it.", req: { culture: "koji" } },
  { id: "backslop", name: "Backslopping", kind: "once", cost: { funk: 40, umami: 9000 },
    desc: "Every inoculation starts at a fifth of capacity instead of a smear.", req: { res: ["funk", 15] } },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/* ------------------------------------------------------------------------ */
/* Layer 1 — Mothers                                                         */
/* ------------------------------------------------------------------------ */

/* Racking dumps the cellar and keeps the mother: the living culture you carry
   from one batch to the next. Mothers are both a flat multiplier and the
   currency for this tree, so there is a real choice between banking them for
   the passive and spending them on structure. */
export const MOTHER_UPGRADES = [
  { id: "m:mult", name: "Thicker Mother", kind: "repeat", cost: 1, growth: 1,
    desc: "+12% output from every vessel, per level." },
  { id: "m:soil", name: "Manured Fields", kind: "repeat", cost: 2, growth: 1.35,
    desc: "×2 grain and wort, per level." },
  { id: "m:slot", name: "Wider Cellar", kind: "repeat", cost: 4, growth: 2.4, max: 4,
    desc: "Start every rack with one more cellar slot already dug." },
  { id: "m:seed", name: "Living Larder", kind: "once", cost: 3,
    desc: "Keep a rack's worth of starting stock: 5,000 grain and 2,000 wort on every rack." },
  { id: "m:cslot", name: "Mixed Ferments", kind: "once", cost: 12,
    desc: "+1 culture slot in every vessel, jar included." },
  { id: "m:deep", name: "Cold Store", kind: "repeat", cost: 6, growth: 1.8,
    desc: "+40% capacity in every vessel, per level." },
  { id: "m:patience", name: "Long Sleep", kind: "repeat", cost: 5, growth: 2.0, max: 3,
    desc: "+25 percentage points of offline speed, and +4h to the offline window." },
  { id: "m:keep", name: "Written Recipes", kind: "once", cost: 20,
    desc: "Racking keeps half of every repeatable craft level, rounded down." },
  { id: "m:auto", name: "Standing Orders", kind: "once", cost: 30,
    desc: "Racking re-digs your slots, re-buys your vessel tiers where affordable, and re-pitches every culture at its old settings." },
  { id: "m:rich", name: "Mother of Mothers", kind: "repeat", cost: 45, growth: 2.6, max: 5,
    desc: "+15% mothers from every future rack, per level." },
];

export const MOTHER_BY_ID = Object.fromEntries(MOTHER_UPGRADES.map((u) => [u.id, u]));

/* ------------------------------------------------------------------------ */
/* Layer 2 — Terroir and wild strains                                        */
/* ------------------------------------------------------------------------ */

/* Opening the cellar to the air costs every mother you ever banked and pays in
   spores. Spores buy strains, but you can only carry a few at once, so this
   layer is a loadout rather than a ladder - the collection grows monotonically
   and the decision is which pair of them the run actually wants. */
export const STRAINS = [
  { id: "thermo", name: "Thermophile", cost: 1, icon: "🔥",
    desc: "Temperature curves are 70% wider. Two cultures that disagree by ten degrees can share a vessel." },
  { id: "halo", name: "Halophile", cost: 1, icon: "🧂",
    desc: "Salt curves are 90% wider. Salt stops being a cost and becomes free spoilage control." },
  { id: "acido", name: "Acidophile", cost: 2, icon: "🍋",
    desc: "Every culture tolerates 1.0 more pH point of sourness at the bottom of its range." },
  { id: "bloom", name: "Bloom", cost: 2, icon: "🌱",
    desc: "×2.2 growth rate. Vessels reach their ceiling in a third of the time." },
  { id: "floc", name: "Flocculent", cost: 3, icon: "🫧",
    desc: "+90% capacity in every vessel." },
  { id: "killer", name: "Killer Factor", cost: 3, icon: "🛡️",
    desc: "Spoilage grows 70% slower and taints 60% less." },
  { id: "ester", name: "Ester Bomb", cost: 4, icon: "🍐",
    desc: "×2.6 alcohol and ×2.6 vinegar." },
  { id: "diastatic", name: "Diastatic", cost: 4, icon: "🌾",
    desc: "×6 grain and wort from the yard." },
  { id: "symbiont", name: "Obligate Symbiont", cost: 6, icon: "🤝",
    desc: "Every symbiosis bonus is 80% stronger." },
  { id: "thrifty", name: "Osmotolerant", cost: 6, icon: "💧",
    desc: "Cultures eat 45% less input for the same output." },
  { id: "feral", name: "Feral", cost: 9, icon: "🐺",
    desc: "Spoilage stops tainting and starts working: it makes funk at a tenth of Brett's rate." },
  { id: "solera", name: "Solera Stack", cost: 12, icon: "🛢️",
    desc: "×4 funk and ×4 umami." },
];

export const STRAIN_BY_ID = Object.fromEntries(STRAINS.map((s) => [s.id, s]));

/* Spores also buy the racks the strains sit in, and a handful of structural
   permanents that survive a rack but not a bloom. */
export const SPORE_UPGRADES = [
  { id: "s:slot", name: "Another Petri Dish", kind: "repeat", cost: 4, growth: 3.2, max: 4,
    desc: "+1 strain you can carry at once." },
  { id: "s:head", name: "Head Start", kind: "repeat", cost: 3, growth: 2.2, max: 5,
    desc: "Begin every rack with one craft level in Broader Sowing, Finer Milling, Kept Starter, Deeper Shelves and Practised Hand, per level." },
  { id: "s:mother", name: "Perennial Mother", kind: "repeat", cost: 6, growth: 2.6, max: 6,
    desc: "+30% mothers from every rack, per level." },
  { id: "s:known", name: "Kept Instruments", kind: "once", cost: 10,
    desc: "Racking keeps your thermostat, pellicle, hydrometer, blending notes and backslopping." },
];

export const SPORE_BY_ID = Object.fromEntries(SPORE_UPGRADES.map((u) => [u.id, u]));

/* ------------------------------------------------------------------------ */
/* Layer 3 — Lineage                                                         */
/* ------------------------------------------------------------------------ */

/* The last layer does not sell multipliers, it sells rules. Each gene deletes
   a constraint the first two layers spent their whole length working around,
   which is what makes a bloom feel like a different game rather than a faster
   one. */
export const GENES = [
  { id: "g:domestic", name: "Domesticated", cost: 1,
    desc: "No culture's fitness ever falls below 0.35. Even a badly set vessel keeps working." },
  { id: "g:pasteur", name: "Pasteurised Cellar", cost: 2,
    desc: "Spoilage never appears again. Salt and acid become purely offensive tools." },
  { id: "g:omni", name: "Omnivore", cost: 3,
    desc: "A starving culture falls back to any other resource in the cellar at 60% efficiency." },
  { id: "g:compound", name: "Compound Interest", cost: 4,
    desc: "+4% output per mother currently held, on top of what mothers already give." },
  { id: "g:deep", name: "Deep Time", cost: 5,
    desc: "Offline runs at full speed, for up to 24 hours." },
  { id: "g:cellar", name: "Vaulted Cellar", cost: 6,
    desc: "+2 cellar slots beyond the eight, and +1 culture slot in every vessel." },
  { id: "g:strain", name: "Polyculture", cost: 8,
    desc: "+2 strains carried at once, and strains cost half as many spores." },
  { id: "g:remember", name: "Ancestral Memory", cost: 10,
    desc: "A bloom keeps every strain you have ever caught, and an ascent keeps them too." },
  { id: "g:autorack", name: "Standing Cellar", cost: 14,
    desc: "Racks itself the moment a rack would pay at least ten mothers, rebuilding everything as it goes." },
  { id: "g:overdrive", name: "Runaway Ferment", cost: 20,
    desc: "×3 output, and every prestige currency you hold counts double toward its passive bonus." },
];

export const GENE_BY_ID = Object.fromEntries(GENES.map((g) => [g.id, g]));

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function fmt(n) {
  if (n == null || !isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n < 1000) {
    if (n === 0) return "0";
    if (n < 10) return sign + (Math.round(n * 100) / 100).toString();
    if (n < 100) return sign + (Math.round(n * 10) / 10).toString();
    return sign + Math.floor(n).toString();
  }
  let tier = 0;
  while (n >= 1000 && tier < SUFFIX.length - 1) { n /= 1000; tier++; }
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0;
  return sign + n.toFixed(digits) + SUFFIX[tier];
}

export function fmtTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/* Cost of the next level of a repeatable, in every resource it asks for. */
export function costOf(entry, level) {
  const out = {};
  const scale = Math.pow(entry.growth ?? 1, level);
  for (const [res, base] of Object.entries(entry.cost || {})) out[res] = base * scale;
  return out;
}

export function buildingCost(id, owned) {
  if (id === "field") return TUNING.fieldCost * Math.pow(TUNING.fieldGrowth, owned);
  return TUNING.mashCost * Math.pow(TUNING.mashGrowth, owned);
}

/* A new cellar slot, and a tier inside one. Both are priced in the deepest
   resource the player is plausibly making by then, which is what keeps the
   chain worth extending rather than just widening. */
export function slotCost(owned) {
  const scale = Math.pow(TUNING.slotCostGrowth, owned - 1);
  return { sugar: 600 * scale, acid: 90 * scale };
}

export function tierCost(vesselId, tier) {
  const base = VESSEL_BY_ID[vesselId] || VESSELS[0];
  const scale = Math.pow(TUNING.tierCostGrowth, tier - 1) * (1 + base.cap / 24);
  return { sugar: 1800 * scale, acid: 260 * scale, booze: 90 * scale };
}

export function newVessel(type = "jar") {
  return { type, tier: 1, cultures: [], pop: {}, wild: 0, ph: TUNING.phBase, temp: 22, salt: 0 };
}

/* The jar you begin with is already pitched and already salted to suit it -
   an empty vessel with two sliders and no explanation is a worse first screen
   than a jar of sauerkraut quietly working. */
function starterVessel() {
  const v = newVessel("jar");
  v.cultures = ["lacto"];
  v.pop = { lacto: TUNING.seedPop };
  v.temp = 22;
  v.salt = 3.5;
  return v;
}

export function newSave(now = 0) {
  const res = {};
  for (const r of RESOURCES) res[r.id] = 0;
  return {
    v: 1,
    res,
    value: 0, // fermented value since the last rack
    valueRun: 0, // since the last bloom of the cellar (terroir)
    valueEver: 0,
    made: Object.fromEntries(RESOURCES.map((r) => [r.id, 0])),
    buildings: { field: 0, mash: 0 },
    vessels: [starterVessel()],
    up: {},
    cultures: { lacto: true },
    types: { jar: true },
    mothers: 0, mothersEver: 0, mup: {},
    spores: 0, sporesEver: 0, strains: {}, equipped: [], sup: {},
    lineage: 0, lineageEver: 0, genes: {},
    racks: 0, blooms: 0, ascents: 0,
    t: 0,
    seen: now,
    seenTabs: {},
  };
}
