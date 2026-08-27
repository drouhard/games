/* Everything the Wildermark is made of: the terrain, the things that live on
   it, the towns, the dungeons and the five wardens.

   Numbers only - no rules live here. tools/wild-sim.mjs reads this file to
   play whole careers in Node, so nothing in it may touch the DOM. */

import { COLOR_KEYS, COLORS } from "./cards.js";

/* ---------- terrain ------------------------------------------------------

   Each colour owns a landscape, and the landscape is where its creatures
   live - so walking into the crags is choosing to meet Ember. `cost` is how
   many ticks a step takes: rough ground gives the wandering monsters two
   moves to your one, which is what makes a shortcut through the mire a
   decision rather than a shape. */

export const TERRAIN = {
  downs: { name: "Downs", color: "sun", cost: 1, tint: "#c9b06a", tint2: "#b39a55" },
  shallows: { name: "Shallows", color: "tide", cost: 1, tint: "#3f7fa8", tint2: "#356d92" },
  mire: { name: "Mire", color: "rot", cost: 2, tint: "#5d5470", tint2: "#4c4560" },
  crags: { name: "Crags", color: "ember", cost: 2, tint: "#8a5340", tint2: "#754537" },
  wood: { name: "Wood", color: "bramble", cost: 2, tint: "#3d7a4a", tint2: "#33663e" },
  sea: { name: "Sea", color: "tide", cost: 0, blocked: true, tint: "#1d4a6b", tint2: "#18405d" },
};

/* ---------- decks --------------------------------------------------------

   A monster's deck is the monster. Write it as counts; `deckList` flattens it
   and pads the mana base so a two-colour list still casts its own spells. */

const D = (lands, spells) => ({ lands, spells });

export function deckList(recipe) {
  const out = [];
  for (const [color, n] of Object.entries(recipe.lands)) {
    const id = color === "any" ? "confluence" : COLORS[color].land;
    for (let i = 0; i < n; i++) out.push(id);
  }
  for (const [id, n] of Object.entries(recipe.spells)) for (let i = 0; i < n; i++) out.push(id);
  return out;
}

export const DECKS = {
  /* --- Sun ------------------------------------------------------------- */
  sun1: D({ sun: 10 }, { lanternward: 4, shieldbearer: 4, mendwounds: 2, dawnpriest: 3, wanderersblade: 2 }),
  sun2: D({ sun: 11 }, { lanternward: 3, shieldbearer: 4, dawnpriest: 3, gildedsentry: 3, rankandfile: 2, bindinglight: 2, hostcaller: 2 }),
  sun3: D({ sun: 11, any: 1 }, { shieldbearer: 3, dawnpriest: 3, gildedsentry: 3, hostcaller: 3, bindinglight: 3, rankandfile: 2, seraphofnoon: 2 }),

  /* --- Tide ------------------------------------------------------------ */
  tide1: D({ tide: 10 }, { mistdarter: 4, tidereader: 4, gloomfog: 3, siltstalker: 2, wanderersblade: 2 }),
  tide2: D({ tide: 11 }, { mistdarter: 3, tidereader: 3, siltstalker: 4, saltglassdrake: 3, undertow: 2, gloomfog: 2, scrying: 2 }),
  tide3: D({ tide: 11, any: 1 }, { mistdarter: 3, tidereader: 3, siltstalker: 3, saltglassdrake: 4, undertow: 2, scrying: 2, wavebreak: 2, deepcallkraken: 1 }),

  /* --- Rot ------------------------------------------------------------- */
  rot1: D({ rot: 10 }, { gravegnat: 4, boneculler: 4, gnawingdoubt: 3, mirelurker: 2, wanderersblade: 2 }),
  rot2: D({ rot: 11 }, { gravegnat: 3, boneculler: 3, mirelurker: 4, wastingtouch: 3, siphonyears: 2, plaguebearer: 2, gnawingdoubt: 2 }),
  rot3: D({ rot: 11, any: 1 }, { gravegnat: 3, mirelurker: 4, plaguebearer: 3, wastingtouch: 3, siphonyears: 2, ruinousedict: 2, barrowlich: 2 }),

  /* --- Ember ----------------------------------------------------------- */
  ember1: D({ ember: 10 }, { emberling: 4, cragrunner: 4, scorch: 3, forgehound: 2, wanderersblade: 2 }),
  ember2: D({ ember: 11 }, { emberling: 3, cragrunner: 4, forgehound: 3, scorch: 3, fury: 2, slagtitan: 2, emberfall: 2 }),
  ember3: D({ ember: 11, any: 1 }, { emberling: 3, cragrunner: 3, forgehound: 3, slagtitan: 3, scorch: 3, cinderlance: 2, ashwyrm: 2 }),

  /* --- Bramble --------------------------------------------------------- */
  bramble1: D({ bramble: 10 }, { thornwhelp: 4, rootspeaker: 3, antlerbeast: 3, wildgrowth: 3, claybound: 2 }),
  bramble2: D({ bramble: 11 }, { thornwhelp: 3, rootspeaker: 3, antlerbeast: 4, bramblewarden: 3, hornedcharge: 2, wildgrowth: 2, greatwyrm: 1 }),
  bramble3: D({ bramble: 11, any: 1 }, { rootspeaker: 3, antlerbeast: 4, bramblewarden: 3, hornedcharge: 2, quellthesky: 2, seasonofteeth: 2, greatwyrm: 3 }),

  /* --- wardens: two colours, and the best of both ---------------------- */
  wardenSun: D({ sun: 9, bramble: 3 }, { shieldbearer: 3, dawnpriest: 3, gildedsentry: 3, hostcaller: 2, bindinglight: 3, rankandfile: 2, daybreak: 1, seraphofnoon: 2 }),
  wardenTide: D({ tide: 9, rot: 3 }, { mistdarter: 3, tidereader: 3, siltstalker: 3, saltglassdrake: 3, undertow: 3, wavebreak: 2, scrying: 2, deepcallkraken: 2 }),
  wardenRot: D({ rot: 9, ember: 3 }, { gravegnat: 3, mirelurker: 4, plaguebearer: 3, wastingtouch: 3, siphonyears: 2, ruinousedict: 3, barrowlich: 2, scorch: 2 }),
  wardenEmber: D({ ember: 9, bramble: 3 }, { cragrunner: 3, forgehound: 3, slagtitan: 3, scorch: 3, fury: 2, cinderlance: 3, ashwyrm: 3, antlerbeast: 2 }),
  wardenBramble: D({ bramble: 9, sun: 3 }, { rootspeaker: 3, antlerbeast: 4, bramblewarden: 3, quellthesky: 2, hornedcharge: 2, seasonofteeth: 2, greatwyrm: 3, gildedsentry: 2 }),

  /* --- and the thing on the Spire, which plays all five ---------------- */
  shardlord: D({ any: 6, sun: 2, tide: 2, rot: 2, ember: 2, bramble: 2 }, {
    seraphofnoon: 2, deepcallkraken: 2, barrowlich: 2, ashwyrm: 2, greatwyrm: 2,
    cinderlance: 2, ruinousedict: 2, bindinglight: 2, wavebreak: 1, daybreak: 1,
    planarcompass: 2, runeengine: 2,
  }),
};

/* ---------- the things that wander --------------------------------------

   `skill` is how well the bot plays this one: a bog shambler drops blocks and
   swings into walls, a warden does not. `ante` is what it is willing to
   stake - beat it and the card is yours. */

const foe = (key, name, color, tier, life, skill, gold, deck, art, ante) =>
  ({ key, name, color, tier, life, skill, gold, deck, art, ante });

export const FOES = {
  // --- tier 1: the roadside ---------------------------------------------
  pilgrim: foe("pilgrim", "Lost Pilgrim", "sun", 1, 9, 0.45, [24, 38], "sun1", "lanternward", ["lanternward", "mendwounds", "shieldbearer"]),
  reefimp: foe("reefimp", "Reef Imp", "tide", 1, 9, 0.45, [24, 38], "tide1", "mistdarter", ["mistdarter", "gloomfog", "tidereader"]),
  bogthing: foe("bogthing", "Bog Thing", "rot", 1, 10, 0.42, [24, 38], "rot1", "gravegnat", ["gravegnat", "boneculler", "gnawingdoubt"]),
  cinderimp: foe("cinderimp", "Cinder Imp", "ember", 1, 9, 0.45, [24, 38], "ember1", "emberling", ["emberling", "scorch", "cragrunner"]),
  bristleboar: foe("bristleboar", "Bristle Boar", "bramble", 1, 10, 0.42, [24, 38], "bramble1", "thornwhelp", ["thornwhelp", "rootspeaker", "wildgrowth"]),

  // --- tier 2: the deep country -----------------------------------------
  sunblade: foe("sunblade", "Sunblade Errant", "sun", 2, 13, 0.7, [52, 78], "sun2", "shieldbearer", ["gildedsentry", "bindinglight", "rankandfile", "dawnpriest"]),
  corsair: foe("corsair", "Salt Corsair", "tide", 2, 13, 0.7, [52, 78], "tide2", "siltstalker", ["saltglassdrake", "undertow", "scrying", "siltstalker"]),
  gravewarden: foe("gravewarden", "Grave Warden", "rot", 2, 14, 0.68, [52, 78], "rot2", "boneculler", ["plaguebearer", "wastingtouch", "siphonyears", "mirelurker"]),
  cragraider: foe("cragraider", "Crag Raider", "ember", 2, 13, 0.7, [52, 78], "ember2", "cragrunner", ["slagtitan", "fury", "emberfall", "forgehound"]),
  thornstalker: foe("thornstalker", "Thorn Stalker", "bramble", 2, 14, 0.68, [52, 78], "bramble2", "antlerbeast", ["bramblewarden", "hornedcharge", "antlerbeast"]),

  // --- tier 3: the wardens' own -----------------------------------------
  choirmaster: foe("choirmaster", "Choirmaster", "sun", 3, 16, 0.86, [110, 150], "sun3", "hostcaller", ["seraphofnoon", "hostcaller", "daybreak", "gildedsentry"]),
  tidecaller: foe("tidecaller", "Tidecaller", "tide", 3, 16, 0.86, [110, 150], "tide3", "tidereader", ["deepcallkraken", "wavebreak", "saltglassdrake"]),
  plagueabbot: foe("plagueabbot", "Plague Abbot", "rot", 3, 17, 0.84, [110, 150], "rot3", "plaguebearer", ["barrowlich", "ruinousedict", "plaguebearer"]),
  forgetyrant: foe("forgetyrant", "Forge Tyrant", "ember", 3, 16, 0.86, [110, 150], "ember3", "slagtitan", ["ashwyrm", "cinderlance", "slagtitan"]),
  treewalker: foe("treewalker", "Elder Treewalker", "bramble", 3, 17, 0.84, [110, 150], "bramble3", "bramblewarden", ["greatwyrm", "seasonofteeth", "bramblewarden"]),

  // --- the five, and the one above them ---------------------------------
  wardenSun: foe("wardenSun", "Iolane of the Noon Terrace", "sun", 4, 23, 0.92, [300, 380], "wardenSun", "wardenSun", ["seraphofnoon", "daybreak", "gildedsentry"]),
  wardenTide: foe("wardenTide", "Nerith of the Glass Reef", "tide", 4, 23, 0.92, [300, 380], "wardenTide", "wardenTide", ["deepcallkraken", "wavebreak", "saltglassdrake"]),
  wardenRot: foe("wardenRot", "Cassivell of the Weeping Barrow", "rot", 4, 24, 0.92, [300, 380], "wardenRot", "wardenRot", ["barrowlich", "ruinousedict", "plaguebearer"]),
  wardenEmber: foe("wardenEmber", "Hakkor of the Ashen Stair", "ember", 4, 23, 0.92, [300, 380], "wardenEmber", "wardenEmber", ["ashwyrm", "cinderlance", "slagtitan"]),
  wardenBramble: foe("wardenBramble", "Ymreth of the Green Hollow", "bramble", 4, 24, 0.92, [300, 380], "wardenBramble", "wardenBramble", ["greatwyrm", "seasonofteeth", "bramblewarden"]),
  shardlord: foe("shardlord", "The Shardlord", "shard", 5, 30, 1, [0, 0], "shardlord", "shardlord", ["planarcompass", "runeengine"]),
};

export const FOES_BY = (color, tier) =>
  Object.values(FOES).filter((f) => f.color === color && f.tier === tier);

/* Each warden is the boss of one colour, and every one of that colour's
   creatures you put down out in the world is one life it does not have when
   you finally walk into its keep. That is the whole reason to hunt. */
export const WARDENS = COLOR_KEYS.map((color) => ({
  color,
  key: `warden${color[0].toUpperCase()}${color.slice(1)}`,
  keep: {
    sun: "The Noon Terrace",
    tide: "The Glass Reef",
    rot: "The Weeping Barrow",
    ember: "The Ashen Stair",
    bramble: "The Green Hollow",
  }[color],
}));

export const WARDEN_LIFE_FLOOR = 12;

/* ---------- towns -------------------------------------------------------- */

export const TOWN_NAMES = [
  "Ashquay", "Little Hallow", "Mirrowend", "Cantle", "Thornrest", "Highfen", "Gallowgate",
];

export const DUNGEON_NAMES = [
  "The Sunken Chancel", "Barrowmaw", "The Kiln", "Wyrmthroat", "The Drowned Library",
];

export const SHRINE_NAMES = ["A weathered shrine", "A cracked obelisk", "A ring of stones", "A drowned altar"];

/* ---------- prices ------------------------------------------------------- */

export const PRICES = {
  // A leyline is a permanent point of life. They get dearer as you collect
  // them, which is what stops the first town from selling you the whole game.
  leyline: (n) => 55 + n * 45,
  // A night at an inn is a flat price, not a price per wound. Charging by the
  // point made the whole economy collapse into buying your own life back one
  // hit at a time, and left nothing for cards - which are the actual game.
  inn: (leylines) => 25 + leylines * 6,
  restock: 25,    // gold to make a merchant lay out fresh stock
  sellShare: 0.4, // what a merchant will give you for a card
};

export const HERO_START_LIFE = 16;
export const HERO_MAX_LIFE = 30;
export const LEYLINE_LIFE = 2;  // a leyline is worth two points, not one
export const REGEN_TICKS = 4;   // ticks of walking per point of life
export const DECK_MIN = 24;
export const DECK_MAX_COPIES = 4;

/* ---------- wildmagic ----------------------------------------------------

   Shandalar's world magic, ours: five powers, each bought with sigils of its
   own colour and each one changing how you move through the map rather than
   how you duel. Two are always on; three are spent. */

export const WILDMAGIC = {
  sun: {
    name: "Sanctuary", color: "sun", cost: 2, passive: true,
    help: "Walking into a town restores you to full life, free.",
  },
  tide: {
    name: "Tidewalk", color: "tide", cost: 2, passive: false,
    help: "Spend a Tide sigil to step straight to any town you have already seen.",
  },
  rot: {
    name: "Grave Tithe", color: "rot", cost: 2, passive: true,
    help: "Losing a duel costs you gold instead of the card you staked.",
  },
  ember: {
    name: "Emberstride", color: "ember", cost: 2, passive: false,
    help: "Spend an Ember sigil and nothing on the map moves for 30 ticks.",
  },
  bramble: {
    name: "Wildpaths", color: "bramble", cost: 2, passive: true,
    help: "Wood, mire and crag stop slowing you, and you mend twice as fast.",
  },
};

/* ---------- quests -------------------------------------------------------

   A town wants one thing, and it is always something you were going to be
   doing anyway - which is the point. The reward is a sigil, and sigils are
   the only way to wildmagic. */

export const QUEST_KINDS = [
  { kind: "hunt", text: (q) => `Put down ${q.need} ${COLORS[q.color].name} creatures out in the wilds.` },
  { kind: "delve", text: (q) => `Come back having cleared ${q.need} room${q.need > 1 ? "s" : ""} of a dungeon.` },
  { kind: "purse", text: (q) => `The tithe stands at ${q.need} gold. Bring it and it is spent on your behalf.` },
];

export const STARTER = {
  // A scrappy two-colour pile, the way you arrive in the Wildermark: mostly
  // junk, one thing worth building around - but it can always make a turn-two
  // play, because a pile that cannot is not a starting position, it is a
  // punishment.
  lands: 11,
  creatures: 6,
  spells: 3,
  uncommons: 2,
  splash: 3,
};
