/* All game content lives here: heroes, skills, statuses, items, gear, the
   bestiary and the encounter ladder. Nothing in this file knows how a battle
   is run - combat.js reads these as data, so tuning the game means editing
   numbers here and nothing else. */

export const MAX_LEVEL = 12;

// XP required to *reach* each level. Index 0 is unused; level 1 starts at 0.
/* Tuned against the ladder's total XP (~620 for a clean run) so a player who
   clears every stage arrives at the boss around level 11 - high enough to have
   actually been taught Inferno and Blessing. Repeating a stage after a wipe
   grants XP again, which doubles as the difficulty valve. */
export const XP_CURVE = [0, 0, 12, 34, 58, 86, 128, 188, 250, 325, 412, 560, 780];

export const ELEMENT_NAMES = {
  fire: "Fire",
  ice: "Ice",
  bolt: "Bolt",
  holy: "Holy",
};

/* Status effects. `mod` values are proportional: -0.3 atk means 30% weaker.
   `tick` fires at end of round, as a fraction of max HP. */
export const STATUSES = {
  poison: { name: "Poison", kind: "bad", tick: "damage", pct: 0.07 },
  sleep: { name: "Sleep", kind: "bad", skipsTurn: true, wakesOnHit: true },
  weaken: { name: "Weaken", kind: "bad", mod: { atk: -0.3 } },
  guard: { name: "Guard", kind: "good", mod: { def: 0.6 } },
  might: { name: "Might", kind: "good", mod: { atk: 0.4 } },
  regen: { name: "Regen", kind: "good", tick: "heal", pct: 0.08 },
};

/* Skills, shared by heroes and monsters.
   target: enemy | enemies | ally | allies | self | ko
   kind:   physical | magic | heal | buff | debuff | revive */
export const SKILLS = {
  // Knight
  bulwark: {
    name: "Bulwark", mp: 4, target: "allies", kind: "buff",
    status: "guard", turns: 3, blurb: "Party takes less damage for 3 rounds.",
  },
  cleave: {
    name: "Cleave", mp: 6, target: "enemies", kind: "physical",
    power: 0.8, blurb: "Sweeping hit on every enemy.",
  },
  sunder: {
    name: "Sunder", mp: 5, target: "enemy", kind: "physical",
    power: 1.45, status: "weaken", turns: 3, chance: 0.7,
    blurb: "Heavy blow that may Weaken.",
  },
  vengeance: {
    name: "Vengeance", mp: 8, target: "enemy", kind: "physical",
    power: 1.0, scaleMissingHp: true,
    blurb: "Hits harder the more HP you're missing.",
  },

  // Mage
  ember: {
    name: "Ember", mp: 3, target: "enemy", kind: "magic",
    element: "fire", power: 1.25, blurb: "Fire damage to one enemy.",
  },
  frost: {
    name: "Frost", mp: 3, target: "enemy", kind: "magic",
    element: "ice", power: 1.25, blurb: "Ice damage to one enemy.",
  },
  spark: {
    name: "Spark", mp: 7, target: "enemies", kind: "magic",
    element: "bolt", power: 0.9, blurb: "Bolt damage to every enemy.",
  },
  slumber: {
    name: "Slumber", mp: 5, target: "enemy", kind: "debuff",
    status: "sleep", turns: 3, chance: 0.75,
    blurb: "Puts one enemy to sleep. Damage wakes it.",
  },
  inferno: {
    name: "Inferno", mp: 12, target: "enemies", kind: "magic",
    element: "fire", power: 1.55, blurb: "Heavy fire damage to every enemy.",
  },

  // Cleric
  mend: {
    name: "Mend", mp: 3, target: "ally", kind: "heal",
    power: 1.7, blurb: "Restores HP to one ally.",
  },
  smite: {
    name: "Smite", mp: 4, target: "enemy", kind: "magic",
    element: "holy", power: 1.3, blurb: "Holy damage. Undead hate it.",
  },
  renew: {
    name: "Renew", mp: 6, target: "allies", kind: "buff",
    status: "regen", turns: 4, blurb: "Party regenerates for 4 rounds.",
  },
  revive: {
    name: "Revive", mp: 10, target: "ko", kind: "revive",
    power: 0.5, blurb: "Returns a fallen ally at half HP.",
  },
  blessing: {
    name: "Blessing", mp: 8, target: "allies", kind: "buff",
    status: "might", turns: 3, blurb: "Party hits harder for 3 rounds.",
  },

  // Monster-only
  venomBite: {
    name: "Venom Bite", mp: 0, target: "enemy", kind: "physical",
    power: 0.9, status: "poison", turns: 4, chance: 0.6,
  },
  shriek: {
    name: "Shriek", mp: 0, target: "enemy", kind: "debuff",
    status: "weaken", turns: 3, chance: 0.65,
  },
  howl: {
    name: "Howl", mp: 0, target: "allies", kind: "buff",
    status: "might", turns: 3,
  },
  slam: {
    name: "Slam", mp: 0, target: "enemy", kind: "physical", power: 1.4,
  },
  drain: {
    name: "Drain", mp: 0, target: "enemy", kind: "magic",
    element: "ice", power: 1.0, drain: true,
  },
  fireBreath: {
    name: "Fire Breath", mp: 0, target: "enemies", kind: "magic",
    element: "fire", power: 1.05,
  },
  wingBuffet: {
    name: "Wing Buffet", mp: 0, target: "enemies", kind: "physical", power: 0.75,
  },
};

export const HEROES = [
  {
    id: "bran", name: "Bran", role: "Knight", sprite: "knight",
    base: { hp: 48, mp: 8, atk: 12, def: 11, mag: 3, res: 5, spd: 7 },
    growth: { hp: 8.5, mp: 1.1, atk: 2.3, def: 1.9, mag: 0.3, res: 0.8, spd: 0.7 },
    learns: [
      { level: 1, id: "bulwark" }, { level: 3, id: "cleave" },
      { level: 5, id: "sunder" }, { level: 8, id: "vengeance" },
    ],
  },
  {
    id: "sable", name: "Sable", role: "Mage", sprite: "mage",
    base: { hp: 30, mp: 22, atk: 5, def: 5, mag: 13, res: 9, spd: 9 },
    growth: { hp: 4.6, mp: 3.4, atk: 0.5, def: 0.8, mag: 2.6, res: 1.4, spd: 1.0 },
    learns: [
      { level: 1, id: "ember" }, { level: 2, id: "frost" },
      { level: 4, id: "spark" }, { level: 6, id: "slumber" },
      { level: 9, id: "inferno" },
    ],
  },
  {
    id: "wren", name: "Wren", role: "Cleric", sprite: "cleric",
    base: { hp: 36, mp: 18, atk: 7, def: 7, mag: 10, res: 11, spd: 8 },
    growth: { hp: 5.8, mp: 2.8, atk: 1.0, def: 1.2, mag: 2.0, res: 1.7, spd: 0.9 },
    learns: [
      { level: 1, id: "mend" }, { level: 3, id: "smite" },
      { level: 5, id: "renew" }, { level: 7, id: "revive" },
      { level: 10, id: "blessing" },
    ],
  },
];

export const ITEMS = {
  potion: { name: "Potion", price: 24, kind: "heal", power: 60, target: "ally", blurb: "Restores 60 HP." },
  hipotion: { name: "Hi-Potion", price: 70, kind: "heal", power: 180, target: "ally", blurb: "Restores 180 HP." },
  ether: { name: "Ether", price: 60, kind: "mp", power: 30, target: "ally", blurb: "Restores 30 MP." },
  salts: { name: "Revive Salts", price: 90, kind: "revive", power: 0.5, target: "ko", blurb: "Revives a fallen ally." },
  antidote: { name: "Antidote", price: 18, kind: "cure", status: "poison", target: "ally", blurb: "Cures Poison." },
};

/* Equipment. Tier 0 is what everyone starts with, so it isn't sold. */
export const GEAR = {
  bran: {
    weapon: [
      { name: "Iron Sword", atk: 0, price: 0 },
      { name: "Steel Sword", atk: 7, price: 130 },
      { name: "Runeblade", atk: 16, price: 380 },
    ],
    armor: [
      { name: "Leather Mail", def: 0, price: 0 },
      { name: "Chain Mail", def: 6, price: 120 },
      { name: "Dragonplate", def: 14, price: 360 },
    ],
  },
  sable: {
    weapon: [
      { name: "Ash Staff", mag: 0, price: 0 },
      { name: "Emberwood Rod", mag: 7, price: 140 },
      { name: "Starcaller", mag: 16, price: 390 },
    ],
    armor: [
      { name: "Cloth Robe", def: 0, price: 0 },
      { name: "Warded Robe", def: 4, res: 4, price: 115 },
      { name: "Archmage Robe", def: 9, res: 10, price: 350 },
    ],
  },
  wren: {
    weapon: [
      { name: "Oak Cudgel", mag: 0, price: 0 },
      { name: "Blessed Mace", mag: 6, atk: 3, price: 135 },
      { name: "Dawnbringer", mag: 14, atk: 6, price: 370 },
    ],
    armor: [
      { name: "Acolyte Wrap", def: 0, price: 0 },
      { name: "Temple Vestments", def: 5, res: 3, price: 118 },
      { name: "Saint's Raiment", def: 11, res: 8, price: 355 },
    ],
  },
};

/* Bestiary. `weak` takes 1.6x, `resist` takes 0.5x.
   `ai` is a weighted action list; `null` means a plain attack. */
export const ENEMIES = {
  slime: {
    name: "Slime", sprite: "slime",
    hp: 34, atk: 9, def: 7, mag: 4, res: 6, spd: 4, xp: 7, gold: 5,
    weak: ["fire"], resist: ["ice"],
    ai: [{ skill: null, weight: 4 }],
  },
  rat: {
    name: "Giant Rat", sprite: "rat",
    hp: 30, atk: 9, def: 4, mag: 2, res: 3, spd: 12, xp: 8, gold: 6,
    weak: ["fire"], resist: [],
    ai: [{ skill: null, weight: 3 }, { skill: "venomBite", weight: 1 }],
  },
  bat: {
    name: "Cave Bat", sprite: "bat",
    hp: 28, atk: 10, def: 5, mag: 4, res: 6, spd: 15, xp: 9, gold: 7,
    weak: ["bolt"], resist: [],
    ai: [{ skill: null, weight: 3 }, { skill: "shriek", weight: 1 }],
  },
  goblin: {
    name: "Goblin", sprite: "goblin",
    hp: 78, atk: 14, def: 9, mag: 3, res: 5, spd: 9, xp: 14, gold: 12,
    weak: [], resist: [],
    ai: [{ skill: null, weight: 3 }, { skill: "slam", weight: 1 }],
  },
  skeleton: {
    name: "Skeleton", sprite: "skeleton",
    hp: 96, atk: 15, def: 12, mag: 4, res: 6, spd: 8, xp: 18, gold: 14,
    weak: ["holy"], resist: ["ice"],
    ai: [{ skill: null, weight: 3 }, { skill: "slam", weight: 1 }],
  },
  wolf: {
    name: "Dire Wolf", sprite: "wolf",
    hp: 80, atk: 14, def: 9, mag: 3, res: 5, spd: 14, xp: 20, gold: 15,
    weak: ["fire"], resist: [],
    ai: [{ skill: null, weight: 4 }, { skill: "howl", weight: 1 }],
  },
  orc: {
    name: "Orc Brute", sprite: "orc",
    hp: 210, atk: 22, def: 14, mag: 3, res: 7, spd: 7, xp: 34, gold: 28,
    weak: ["ice"], resist: [],
    ai: [{ skill: null, weight: 2 }, { skill: "slam", weight: 2 }],
  },
  wraith: {
    name: "Wraith", sprite: "wraith",
    hp: 185, atk: 12, def: 10, mag: 20, res: 16, spd: 11, xp: 38, gold: 32,
    weak: ["holy"], resist: ["ice", "fire"],
    ai: [{ skill: "drain", weight: 3 }, { skill: "shriek", weight: 2 }],
  },
  golem: {
    name: "Stone Golem", sprite: "golem",
    hp: 290, atk: 24, def: 26, mag: 4, res: 12, spd: 4, xp: 52, gold: 44,
    weak: ["bolt"], resist: ["fire", "ice"],
    ai: [{ skill: null, weight: 2 }, { skill: "slam", weight: 3 }],
  },
  dragon: {
    name: "Emberwyrm", sprite: "dragon", boss: true,
    hp: 1150, atk: 26, def: 20, mag: 22, res: 18, spd: 10, xp: 200, gold: 250,
    weak: ["ice"], resist: ["fire"],
    ai: [
      { skill: null, weight: 3 },
      { skill: "fireBreath", weight: 3 },
      { skill: "wingBuffet", weight: 2 },
      { skill: "slam", weight: 2 },
    ],
    // Below half HP it stops holding back.
    enrage: { at: 0.5, atk: 1.3, mag: 1.3, message: "The Emberwyrm's scales blaze white-hot!" },
  },
};

/* The ladder. Each stage is one fight; `intro` sets the scene in the log. */
export const STAGES = [
  { name: "The Mouth", enemies: ["slime", "slime"], intro: "Something wet stirs in the dark." },
  { name: "Ratways", enemies: ["rat", "rat", "rat"], intro: "Claws skitter over stone." },
  { name: "Dripstone", enemies: ["slime", "bat", "bat"], intro: "Wings snap somewhere above you." },
  { name: "The Warrens", enemies: ["goblin", "goblin"], intro: "Firelight. Voices. An ambush." },
  { name: "Bonefall", enemies: ["skeleton", "skeleton", "bat"], intro: "The bones down here do not lie still." },
  { name: "The Howl", enemies: ["wolf", "wolf", "wolf"], intro: "Three sets of eyes, low to the ground." },
  { name: "Brute Hall", enemies: ["orc", "goblin", "goblin"], intro: "Something enormous blocks the way." },
  { name: "The Weeping Gallery", enemies: ["wraith", "wraith"], intro: "The cold here is not weather." },
  { name: "Foundation", enemies: ["golem", "skeleton", "skeleton"], intro: "The walls themselves stand up." },
  { name: "Emberdeep", enemies: ["dragon"], intro: "The heat is unbearable. It has been waiting." },
];
