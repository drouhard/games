/* Every number in the game lives here: cards, statuses, monsters, the floor
   ladder and the meta unlocks. Nothing in this file touches the DOM, so
   tools/deck-sim.mjs can import it and play hundreds of runs in Node.

   Card text is generated from the effects rather than authored beside them -
   an upgraded card would otherwise be one edit away from lying about what it
   does. */

/* ---------- statuses ----------------------------------------------------

   `decay: 'turn'`  ticks one off at the end of the owner's turn (timers)
   `decay: 'stack'` counts down as it fires (poison)
   `decay: null`    lasts the whole fight (powers) */

export const STATUSES = {
  weak: { name: "Weak", kind: "bad", decay: "turn", help: "Deals 25% less damage." },
  vulnerable: { name: "Vuln", kind: "bad", decay: "turn", help: "Takes 50% more damage." },
  poison: { name: "Poison", kind: "bad", decay: "stack", help: "Loses that much HP at the start of its turn, then one stack falls off." },
  strength: { name: "Strength", kind: "good", decay: null, help: "Adds to the damage of every attack." },
  thorns: { name: "Thorns", kind: "good", decay: null, help: "Attackers take that much damage." },
  regen: { name: "Regen", kind: "good", decay: null, help: "Heals that much at the start of your turn." },
  rampart: { name: "Rampart", kind: "good", decay: null, help: "Gain that much Block at the start of your turn." },
  surge: { name: "Surge", kind: "good", decay: null, help: "Gain that much extra Energy at the start of your turn." },
};

/* ---------- cards -------------------------------------------------------

   effects run in order. `up` is a shallow patch applied when the card is
   upgraded, so an upgrade only restates what actually changes. */

export const CARDS = {
  // --- Vanguard: block, Strength, and turning armour into damage ---------
  strike: {
    name: "Strike", cost: 1, type: "attack", icon: "sword", target: "enemy",
    effects: [{ kind: "damage", amount: 6 }],
    up: { effects: [{ kind: "damage", amount: 9 }] },
  },
  guard: {
    name: "Guard", cost: 1, type: "skill", icon: "shield", target: "self",
    effects: [{ kind: "block", amount: 6 }],
    up: { effects: [{ kind: "block", amount: 9 }] },
  },
  bash: {
    name: "Bash", cost: 2, type: "attack", icon: "sword", target: "enemy",
    effects: [{ kind: "damage", amount: 8 }, { kind: "status", status: "vulnerable", amount: 2 }],
    up: { effects: [{ kind: "damage", amount: 10 }, { kind: "status", status: "vulnerable", amount: 3 }] },
  },
  cleave: {
    name: "Cleave", cost: 1, type: "attack", icon: "sword", target: "all",
    effects: [{ kind: "damage", amount: 7, all: true }],
    up: { effects: [{ kind: "damage", amount: 10, all: true }] },
  },
  bulwark: {
    name: "Bulwark", cost: 2, type: "skill", icon: "shield", target: "self",
    effects: [{ kind: "block", amount: 14 }],
    up: { effects: [{ kind: "block", amount: 19 }] },
  },
  riposte: {
    name: "Riposte", cost: 1, type: "attack", icon: "sword", target: "enemy",
    effects: [{ kind: "block", amount: 5 }, { kind: "damage", amount: 5 }],
    up: { effects: [{ kind: "block", amount: 7 }, { kind: "damage", amount: 8 }] },
  },
  shieldbash: {
    name: "Shield Bash", cost: 1, type: "attack", icon: "shield", target: "enemy",
    effects: [{ kind: "damage", scale: "block" }],
    up: { cost: 1, effects: [{ kind: "damage", scale: "block", bonus: 5 }] },
  },
  warcry: {
    name: "War Cry", cost: 1, type: "power", icon: "book", target: "self",
    effects: [{ kind: "buff", status: "strength", amount: 2 }],
    up: { effects: [{ kind: "buff", status: "strength", amount: 3 }] },
  },
  rampart: {
    name: "Rampart", cost: 2, type: "power", icon: "shield", target: "self",
    effects: [{ kind: "buff", status: "rampart", amount: 4 }],
    up: { effects: [{ kind: "buff", status: "rampart", amount: 6 }] },
  },
  secondwind: {
    name: "Second Wind", cost: 1, type: "skill", icon: "shield", target: "self",
    effects: [{ kind: "block", amount: 6 }, { kind: "draw", amount: 1 }],
    up: { effects: [{ kind: "block", amount: 9 }, { kind: "draw", amount: 2 }] },
  },
  colossus: {
    name: "Colossus", cost: 2, type: "power", icon: "shield", target: "self", rare: true,
    effects: [{ kind: "block", amount: 10 }, { kind: "buff", status: "strength", amount: 2 }],
    up: { effects: [{ kind: "block", amount: 14 }, { kind: "buff", status: "strength", amount: 3 }] },
  },
  whirlwind: {
    name: "Whirlwind", cost: 2, type: "attack", icon: "sword", target: "all", rare: true,
    effects: [{ kind: "damage", amount: 6, times: 2, all: true }],
    up: { effects: [{ kind: "damage", amount: 8, times: 2, all: true }] },
  },

  // --- Adept: energy, draw, and hitting the whole room -------------------
  bolt: {
    name: "Bolt", cost: 1, type: "attack", icon: "bolt", target: "enemy",
    effects: [{ kind: "damage", amount: 6 }],
    up: { effects: [{ kind: "damage", amount: 9 }] },
  },
  ward: {
    name: "Ward", cost: 1, type: "skill", icon: "shield", target: "self",
    effects: [{ kind: "block", amount: 5 }],
    up: { effects: [{ kind: "block", amount: 8 }] },
  },
  insight: {
    name: "Insight", cost: 1, type: "skill", icon: "book", target: "self",
    effects: [{ kind: "draw", amount: 2 }],
    up: { cost: 0, effects: [{ kind: "draw", amount: 2 }] },
  },
  firebolt: {
    name: "Firebolt", cost: 1, type: "attack", icon: "flame", target: "enemy",
    effects: [{ kind: "damage", amount: 11 }], exhaust: true,
    up: { effects: [{ kind: "damage", amount: 15 }] },
  },
  frostbite: {
    name: "Frostbite", cost: 1, type: "attack", icon: "bolt", target: "all",
    effects: [{ kind: "damage", amount: 4, all: true }, { kind: "status", status: "weak", amount: 1, all: true }],
    up: { effects: [{ kind: "damage", amount: 6, all: true }, { kind: "status", status: "weak", amount: 2, all: true }] },
  },
  hex: {
    name: "Hex", cost: 0, type: "skill", icon: "book", target: "enemy",
    effects: [{ kind: "status", status: "vulnerable", amount: 2 }],
    up: { effects: [{ kind: "status", status: "vulnerable", amount: 3 }] },
  },
  channel: {
    name: "Channel", cost: 0, type: "skill", icon: "book", target: "self",
    effects: [{ kind: "energy", amount: 1 }, { kind: "draw", amount: 1 }], exhaust: true,
    up: { effects: [{ kind: "energy", amount: 2 }, { kind: "draw", amount: 1 }] },
  },
  chainlightning: {
    name: "Chain Bolt", cost: 2, type: "attack", icon: "bolt", target: "random",
    effects: [{ kind: "damage", amount: 5, times: 3, random: true }],
    up: { effects: [{ kind: "damage", amount: 5, times: 4, random: true }] },
  },
  siphon: {
    name: "Siphon", cost: 1, type: "attack", icon: "flame", target: "enemy",
    effects: [{ kind: "damage", amount: 6 }, { kind: "heal", amount: 3 }],
    up: { effects: [{ kind: "damage", amount: 8 }, { kind: "heal", amount: 5 }] },
  },
  leyline: {
    name: "Ley Line", cost: 2, type: "power", icon: "book", target: "self", rare: true,
    effects: [{ kind: "buff", status: "surge", amount: 1 }],
    up: { cost: 1, effects: [{ kind: "buff", status: "surge", amount: 1 }] },
  },
  meteor: {
    name: "Meteor", cost: 2, type: "attack", icon: "flame", target: "all", rare: true,
    effects: [{ kind: "damage", amount: 18, all: true }],
    up: { effects: [{ kind: "damage", amount: 24, all: true }] },
  },

  // --- Warden: poison, thorns, and outlasting the room -------------------
  rake: {
    name: "Rake", cost: 1, type: "attack", icon: "fang", target: "enemy",
    effects: [{ kind: "damage", amount: 5 }],
    up: { effects: [{ kind: "damage", amount: 8 }] },
  },
  bark: {
    name: "Bark", cost: 1, type: "skill", icon: "shield", target: "self",
    effects: [{ kind: "block", amount: 5 }],
    up: { effects: [{ kind: "block", amount: 8 }] },
  },
  toxin: {
    name: "Toxin", cost: 1, type: "skill", icon: "fang", target: "enemy",
    effects: [{ kind: "status", status: "poison", amount: 3 }],
    up: { effects: [{ kind: "status", status: "poison", amount: 5 }] },
  },
  nettle: {
    name: "Nettle", cost: 0, type: "attack", icon: "fang", target: "enemy",
    effects: [{ kind: "damage", amount: 3 }, { kind: "status", status: "poison", amount: 2 }],
    up: { effects: [{ kind: "damage", amount: 4 }, { kind: "status", status: "poison", amount: 3 }] },
  },
  venomspray: {
    name: "Venom Spray", cost: 1, type: "skill", icon: "fang", target: "all",
    effects: [{ kind: "status", status: "poison", amount: 3, all: true }],
    up: { effects: [{ kind: "status", status: "poison", amount: 5, all: true }] },
  },
  thorncoat: {
    name: "Thorn Coat", cost: 1, type: "power", icon: "shield", target: "self",
    effects: [{ kind: "buff", status: "thorns", amount: 3 }],
    up: { effects: [{ kind: "buff", status: "thorns", amount: 5 }] },
  },
  regrowth: {
    name: "Regrowth", cost: 1, type: "power", icon: "heart", target: "self",
    effects: [{ kind: "buff", status: "regen", amount: 2 }],
    up: { effects: [{ kind: "buff", status: "regen", amount: 3 }] },
  },
  cull: {
    name: "Cull", cost: 2, type: "attack", icon: "fang", target: "enemy",
    effects: [{ kind: "damage", amount: 9, bonusIfPoisoned: 5 }],
    up: { effects: [{ kind: "damage", amount: 12, bonusIfPoisoned: 7 }] },
  },
  symbiosis: {
    name: "Symbiosis", cost: 1, type: "skill", icon: "heart", target: "self",
    effects: [{ kind: "draw", amount: 2 }, { kind: "heal", amount: 4 }],
    up: { effects: [{ kind: "draw", amount: 2 }, { kind: "heal", amount: 7 }] },
  },
  plague: {
    name: "Plague", cost: 2, type: "skill", icon: "fang", target: "all", rare: true,
    effects: [{ kind: "status", status: "poison", amount: 4, all: true }],
    up: { effects: [{ kind: "status", status: "poison", amount: 6, all: true }] },
  },
  brambleveil: {
    name: "Bramble Veil", cost: 2, type: "power", icon: "shield", target: "self", rare: true,
    effects: [{ kind: "buff", status: "thorns", amount: 3 }, { kind: "buff", status: "regen", amount: 2 }],
    up: { effects: [{ kind: "buff", status: "thorns", amount: 5 }, { kind: "buff", status: "regen", amount: 4 }] },
  },

  // --- neutral: found by every class ------------------------------------
  vault: {
    name: "Vault", cost: 1, type: "attack", icon: "sword", target: "enemy", neutral: true,
    effects: [{ kind: "damage", amount: 6 }, { kind: "block", amount: 4 }],
    up: { effects: [{ kind: "damage", amount: 8 }, { kind: "block", amount: 6 }] },
  },
  steelnerve: {
    name: "Steel Nerve", cost: 0, type: "skill", icon: "shield", target: "self", neutral: true,
    effects: [{ kind: "block", amount: 4 }],
    up: { effects: [{ kind: "block", amount: 6 }] },
  },
  ration: {
    name: "Ration", cost: 0, type: "skill", icon: "heart", target: "self", neutral: true,
    effects: [{ kind: "heal", amount: 7 }], exhaust: true,
    up: { effects: [{ kind: "heal", amount: 11 }] },
  },
  prepare: {
    name: "Prepare", cost: 0, type: "skill", icon: "book", target: "self", neutral: true,
    effects: [{ kind: "draw", amount: 1 }], exhaust: true,
    up: { effects: [{ kind: "draw", amount: 2 }] },
  },
  fury: {
    name: "Fury", cost: 2, type: "attack", icon: "sword", target: "enemy", neutral: true,
    effects: [{ kind: "damage", amount: 14 }],
    up: { effects: [{ kind: "damage", amount: 19 }] },
  },
  adrenaline: {
    name: "Adrenaline", cost: 0, type: "skill", icon: "bolt", target: "self", neutral: true,
    effects: [{ kind: "energy", amount: 1 }], exhaust: true,
    up: { effects: [{ kind: "energy", amount: 1 }, { kind: "draw", amount: 1 }] },
  },
};

/* Applies the `up` patch. Returns a plain card object the rest of the game
   treats exactly like a printed one. */
export function cardDef(id, upgraded) {
  const base = CARDS[id];
  if (!base) throw new Error(`unknown card: ${id}`);
  if (!upgraded || !base.up) return base;
  return { ...base, ...base.up, name: `${base.name}+`, upgraded: true };
}

/* Card text, derived from the effects so it can never drift out of date. */
export function describe(card) {
  const parts = [];
  for (const e of card.effects) {
    const to = e.all ? " to all" : "";
    switch (e.kind) {
      case "damage":
        if (e.scale === "block") {
          parts.push(`Deal damage equal to your Block${e.bonus ? ` + ${e.bonus}` : ""}.`);
        } else {
          const times = e.times > 1 ? ` ${e.times}x` : "";
          const random = e.random ? " at random" : "";
          const extra = e.bonusIfPoisoned ? ` +${e.bonusIfPoisoned} if poisoned.` : "";
          parts.push(`Deal ${e.amount}${times} damage${to}${random}.${extra}`);
        }
        break;
      case "block": parts.push(`Gain ${e.amount} Block.`); break;
      case "draw": parts.push(`Draw ${e.amount}.`); break;
      case "energy": parts.push(`Gain ${e.amount} Energy.`); break;
      case "heal": parts.push(`Heal ${e.amount}.`); break;
      case "status": parts.push(`Apply ${e.amount} ${STATUSES[e.status].name}${to}.`); break;
      case "buff": parts.push(`Gain ${e.amount} ${STATUSES[e.status].name}.`); break;
    }
  }
  if (card.exhaust) parts.push("Exhaust.");
  return parts.join(" ");
}

/* ---------- classes ----------------------------------------------------- */

export const CLASSES = [
  {
    id: "vanguard",
    name: "Vanguard",
    sprite: "vanguard",
    maxHp: 80,
    blurb: "Armour into damage. Stack Block, then swing it.",
    deck: ["strike", "strike", "strike", "strike", "strike", "guard", "guard", "guard", "guard", "bash"],
    honed: "bash", // the card the Honing unlock upgrades at run start
    pool: ["cleave", "bulwark", "riposte", "shieldbash", "warcry", "rampart", "secondwind", "colossus", "whirlwind"],
  },
  {
    id: "adept",
    name: "Adept",
    sprite: "adept",
    maxHp: 62,
    energy: 4, // fewer hit points, but a fourth Energy every single turn
    blurb: "Energy and cards. Small hits, but a lot of them.",
    deck: ["bolt", "bolt", "bolt", "bolt", "bolt", "ward", "ward", "ward", "ward", "insight"],
    honed: "insight",
    pool: ["firebolt", "frostbite", "hex", "channel", "chainlightning", "siphon", "leyline", "meteor"],
  },
  {
    id: "warden",
    name: "Warden",
    sprite: "warden",
    maxHp: 66,
    blurb: "Poison and thorns. Let the room kill itself.",
    deck: ["rake", "rake", "rake", "rake", "rake", "bark", "bark", "bark", "bark", "toxin"],
    honed: "toxin",
    pool: ["nettle", "venomspray", "thorncoat", "regrowth", "cull", "symbiosis", "plague", "brambleveil"],
    unlock: "warden", // gated behind a Sanctum unlock
  },
];

export const NEUTRAL_POOL = ["vault", "steelnerve", "ration", "prepare", "fury", "adrenaline"];

/* ---------- monsters ----------------------------------------------------

   A monster telegraphs its next move, so every turn is a decision with
   complete information. `pattern` cycles through `moves` by index; a monster
   with no pattern rolls a random move each turn. */

export const ENEMIES = {
  mote: {
    name: "Mote", sprite: "mote", hp: [14, 17],
    moves: [
      { kind: "attack", amount: 5 },
      { kind: "block", amount: 5 },
    ],
    pattern: [0, 0, 1],
  },
  imp: {
    name: "Imp", sprite: "imp", hp: [12, 15],
    moves: [
      { kind: "attack", amount: 3, times: 2 },
      { kind: "status", status: "weak", amount: 1 },
    ],
    pattern: [0, 1, 0],
  },
  hound: {
    name: "Ash Hound", sprite: "hound", hp: [26, 30],
    moves: [
      { kind: "attack", amount: 9 },
      { kind: "attack", amount: 4, times: 2 },
      { kind: "buff", status: "strength", amount: 2 },
    ],
    pattern: [0, 2, 1, 0],
  },
  hexer: {
    name: "Hexer", sprite: "hexer", hp: [22, 26],
    moves: [
      { kind: "attack", amount: 7 },
      { kind: "status", status: "vulnerable", amount: 2 },
      { kind: "block", amount: 6 },
    ],
    pattern: [1, 0, 2, 0],
  },
  revenant: {
    name: "Revenant", sprite: "revenant", hp: [34, 40],
    moves: [
      { kind: "attack", amount: 10 },
      { kind: "attack", amount: 5, times: 2 },
      { kind: "status", status: "weak", amount: 2 },
    ],
    pattern: [0, 1, 2, 0, 1],
  },
  brute: {
    name: "Slag Brute", sprite: "brute", hp: [46, 52],
    moves: [
      { kind: "attack", amount: 13 },
      { kind: "block", amount: 10 },
      { kind: "buff", status: "strength", amount: 3 },
    ],
    pattern: [2, 0, 1, 0, 0],
  },

  // --- bosses -----------------------------------------------------------
  sentinel: {
    name: "The Sentinel", sprite: "sentinel", boss: true, hp: [80, 80],
    moves: [
      { kind: "attack", amount: 11 },
      { kind: "attack", amount: 5, times: 3 },
      { kind: "block", amount: 10 },
      { kind: "buff", status: "strength", amount: 2 },
    ],
    pattern: [0, 2, 1, 3, 0, 1],
  },
  hexlord: {
    name: "Hexlord Vane", sprite: "hexlord", boss: true, hp: [100, 100],
    moves: [
      { kind: "attack", amount: 13 },
      { kind: "attack", amount: 6, times: 3 },
      { kind: "status", status: "vulnerable", amount: 2 },
      { kind: "status", status: "weak", amount: 2 },
    ],
    pattern: [2, 0, 1, 3, 0, 1, 0],
  },
  archivist: {
    name: "The Archivist", sprite: "archivist", boss: true, hp: [124, 124],
    moves: [
      { kind: "attack", amount: 14 },
      { kind: "attack", amount: 6, times: 3 },
      { kind: "buff", status: "strength", amount: 3 },
      { kind: "block", amount: 12 },
    ],
    pattern: [2, 0, 1, 3, 0, 1, 0, 1],
  },
};

/* ---------- the ladder --------------------------------------------------

   Three floors. Each floor is three chosen nodes and then its boss, so a run
   is nine to twelve fights depending on how much you rest. */

export const FLOORS = [
  {
    name: "The Cistern",
    fights: [["mote", "mote"], ["imp", "imp"], ["mote", "imp"], ["imp", "imp", "mote"]],
    elites: [["hound"], ["hexer", "imp"]],
    boss: "sentinel",
  },
  {
    name: "The Kiln",
    fights: [["hound"], ["hexer", "mote"], ["hound", "imp"], ["hexer", "imp", "imp"]],
    elites: [["revenant"], ["hound", "hexer"]],
    boss: "hexlord",
  },
  {
    name: "The Vault",
    fights: [["revenant"], ["hexer", "hound"], ["revenant", "imp"], ["hound", "hound"]],
    elites: [["brute"], ["revenant", "hexer"]],
    boss: "archivist",
  },
];

export const NODES_PER_FLOOR = 3;

/* ---------- meta progression -------------------------------------------

   Echoes are the only thing a run leaves behind. Costs are tuned against
   tools/deck-sim.mjs: a losing run pays about 5, a winning one about 17, so
   the whole board is roughly eight runs of play. */

export const UNLOCKS = [
  { id: "vigor", name: "Vigor", cost: 8, desc: "+8 max HP on every run." },
  { id: "arsenal", name: "Arsenal", cost: 14, desc: "Rare cards start appearing in rewards." },
  { id: "warden", name: "The Warden", cost: 20, desc: "Unlocks a third class: poison and thorns." },
  { id: "honing", name: "Honing", cost: 26, desc: "Your signature starting card begins upgraded." },
  { id: "reserve", name: "Reserve", cost: 34, desc: "Draw an extra card on the first turn of every fight." },
  { id: "insight", name: "Foresight", cost: 44, desc: "Card rewards offer four choices instead of three." },
];

export const REWARDS = {
  fight: 1,
  elite: 2,
  boss: 2,
  clear: 5,
};

export const HAND_SIZE = 5;
export const MAX_ENERGY = 3;
