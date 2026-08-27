/* Every number in the game: cards, classes, monsters, the floors and the
   permanent unlocks. No DOM in here, so tools/deck-sim.mjs can import it and
   play hundreds of whole runs in Node.

   Card text is generated from the effects rather than written beside them - an
   upgraded or modal card would otherwise be one edit away from lying about
   what it does. */

/* ---------- statuses ---------------------------------------------------- */

export const STATUSES = {
  poison: { name: "Poison", kind: "bad", help: "Loses that much HP when the round ends, then one stack falls off." },
  soften: { name: "Soften", kind: "bad", help: "That much is shaved off your swing this round." },
  thorns: { name: "Thorns", kind: "good", help: "Whatever lands a hit on you takes that much back." },
  edge: { name: "Edge", kind: "good", help: "Starts every round with that much Attack already banked." },
  regen: { name: "Regen", kind: "good", help: "Heals that much when the round ends." },
  flow: { name: "Flow", kind: "good", help: "Adds that much to your pool at the start of every round." },
};

/* ---------- cards -------------------------------------------------------

   No energy. You may play everything in your hand; the deck itself is the
   constraint, the way it is in Dream Quest. What makes a turn a decision is
   the class pool (`cost`, paid from Rage / Mana / Venom, which persists all
   fight), modal cards that ask which half you want, and ordering - Shield
   Bash reads your Defense, so guards first. */

export const CARDS = {
  // --- Knight: Rage, armour, and turning a guard into a swing ------------
  slash: {
    name: "Slash", icon: "sword", type: "attack", cls: "knight",
    effects: [{ kind: "attack", amount: 4 }],
    up: { effects: [{ kind: "attack", amount: 6 }] },
  },
  guard: {
    name: "Guard", icon: "shield", type: "guard", cls: "knight",
    effects: [{ kind: "defense", amount: 4 }],
    up: { effects: [{ kind: "defense", amount: 6 }] },
  },
  rally: {
    name: "Rally", icon: "book", type: "skill", cls: "knight",
    effects: [{ kind: "res", amount: 2 }, { kind: "draw", amount: 1 }],
    up: { effects: [{ kind: "res", amount: 3 }, { kind: "draw", amount: 1 }] },
  },
  hew: {
    name: "Hew", icon: "sword", type: "attack", cls: "knight",
    effects: [{ kind: "attack", amount: 7 }],
    up: { effects: [{ kind: "attack", amount: 10 }] },
  },
  bulwark: {
    name: "Bulwark", icon: "shield", type: "guard", cls: "knight",
    effects: [{ kind: "defense", amount: 8 }],
    up: { effects: [{ kind: "defense", amount: 11 }] },
  },
  sidestep: {
    name: "Sidestep", icon: "shield", type: "skill", cls: "knight",
    modes: [
      { label: "Strike", effects: [{ kind: "attack", amount: 4 }] },
      { label: "Brace", effects: [{ kind: "defense", amount: 6 }] },
    ],
    up: {
      modes: [
        { label: "Strike", effects: [{ kind: "attack", amount: 6 }] },
        { label: "Brace", effects: [{ kind: "defense", amount: 8 }] },
      ],
    },
  },
  warcry: {
    name: "War Cry", icon: "book", type: "skill", cls: "knight",
    effects: [{ kind: "res", amount: 2 }, { kind: "edge", amount: 1 }],
    up: { effects: [{ kind: "res", amount: 3 }, { kind: "edge", amount: 2 }] },
  },
  shieldbash: {
    name: "Shield Bash", icon: "shield", type: "attack", cls: "knight",
    effects: [{ kind: "attack", scale: "defense" }],
    up: { effects: [{ kind: "attack", scale: "defense", bonus: 3 }] },
  },
  cleaver: {
    name: "Cleaver", icon: "sword", type: "attack", cls: "knight", cost: 4,
    effects: [{ kind: "attack", amount: 12 }],
    up: { cost: 3, effects: [{ kind: "attack", amount: 12 }] },
  },
  ironskin: {
    name: "Iron Skin", icon: "shield", type: "guard", cls: "knight",
    effects: [{ kind: "defense", amount: 4 }, { kind: "thorns", amount: 2 }],
    up: { effects: [{ kind: "defense", amount: 5 }, { kind: "thorns", amount: 3 }] },
  },
  laststand: {
    name: "Last Stand", icon: "heart", type: "attack", cls: "knight", cost: 5, rare: true,
    effects: [{ kind: "attack", amount: 9 }, { kind: "heal", amount: 7 }],
    up: { effects: [{ kind: "attack", amount: 12 }, { kind: "heal", amount: 9 }] },
  },
  juggernaut: {
    name: "Juggernaut", icon: "sword", type: "power", cls: "knight", cost: 3, rare: true,
    effects: [{ kind: "edge", amount: 3 }],
    up: { effects: [{ kind: "edge", amount: 4 }] },
  },

  // --- Adept: Mana banked across rounds, spent on the big turn -----------
  spark: {
    name: "Spark", icon: "bolt", type: "attack", cls: "adept",
    effects: [{ kind: "attack", amount: 3 }, { kind: "res", amount: 1 }],
    up: { effects: [{ kind: "attack", amount: 5 }, { kind: "res", amount: 1 }] },
  },
  ward: {
    name: "Ward", icon: "shield", type: "guard", cls: "adept",
    effects: [{ kind: "defense", amount: 4 }],
    up: { effects: [{ kind: "defense", amount: 6 }] },
  },
  study: {
    name: "Study", icon: "book", type: "skill", cls: "adept",
    effects: [{ kind: "draw", amount: 2 }],
    up: { effects: [{ kind: "draw", amount: 2 }, { kind: "res", amount: 1 }] },
  },
  firebolt: {
    name: "Firebolt", icon: "flame", type: "attack", cls: "adept", cost: 2,
    effects: [{ kind: "attack", amount: 10 }],
    up: { effects: [{ kind: "attack", amount: 14 }] },
  },
  frost: {
    name: "Frost", icon: "bolt", type: "attack", cls: "adept", cost: 1,
    effects: [{ kind: "attack", amount: 3 }, { kind: "weaken", amount: 4 }],
    up: { effects: [{ kind: "attack", amount: 4 }, { kind: "weaken", amount: 6 }] },
  },
  channel: {
    name: "Channel", icon: "book", type: "skill", cls: "adept",
    effects: [{ kind: "res", amount: 3 }],
    up: { effects: [{ kind: "res", amount: 4 }, { kind: "draw", amount: 1 }] },
  },
  arcaneshield: {
    name: "Arcane Shield", icon: "shield", type: "guard", cls: "adept",
    effects: [{ kind: "defense", amount: 5 }, { kind: "res", amount: 1 }],
    up: { effects: [{ kind: "defense", amount: 7 }, { kind: "res", amount: 2 }] },
  },
  siphon: {
    name: "Siphon", icon: "flame", type: "attack", cls: "adept", cost: 1,
    effects: [{ kind: "attack", amount: 4 }, { kind: "heal", amount: 4 }],
    up: { effects: [{ kind: "attack", amount: 6 }, { kind: "heal", amount: 5 }] },
  },
  prism: {
    name: "Prism", icon: "book", type: "skill", cls: "adept",
    modes: [
      { label: "Draw the mana", effects: [{ kind: "res", amount: 2 }] },
      { label: "Draw the light", effects: [{ kind: "defense", amount: 6 }] },
    ],
    up: {
      modes: [
        { label: "Draw the mana", effects: [{ kind: "res", amount: 3 }] },
        { label: "Draw the light", effects: [{ kind: "defense", amount: 8 }] },
      ],
    },
  },
  meteor: {
    name: "Meteor", icon: "flame", type: "attack", cls: "adept", cost: 5, rare: true,
    effects: [{ kind: "attack", amount: 22 }],
    up: { cost: 4, effects: [{ kind: "attack", amount: 24 }] },
  },
  leyline: {
    name: "Ley Line", icon: "book", type: "power", cls: "adept", cost: 2, rare: true,
    effects: [{ kind: "flow", amount: 2 }],
    up: { effects: [{ kind: "flow", amount: 3 }] },
  },

  // --- Warden: Venom, thorns, and outlasting the room --------------------
  rake: {
    name: "Rake", icon: "fang", type: "attack", cls: "warden",
    effects: [{ kind: "attack", amount: 4 }],
    up: { effects: [{ kind: "attack", amount: 6 }] },
  },
  bark: {
    name: "Bark", icon: "shield", type: "guard", cls: "warden",
    effects: [{ kind: "defense", amount: 5 }],
    up: { effects: [{ kind: "defense", amount: 7 }] },
  },
  toxin: {
    name: "Toxin", icon: "fang", type: "skill", cls: "warden",
    effects: [{ kind: "poison", amount: 3 }, { kind: "res", amount: 1 }],
    up: { effects: [{ kind: "poison", amount: 5 }, { kind: "res", amount: 1 }] },
  },
  nettle: {
    name: "Nettle", icon: "fang", type: "attack", cls: "warden",
    effects: [{ kind: "attack", amount: 2 }, { kind: "poison", amount: 2 }],
    up: { effects: [{ kind: "attack", amount: 3 }, { kind: "poison", amount: 3 }] },
  },
  venomspray: {
    name: "Venom Spray", icon: "fang", type: "skill", cls: "warden", cost: 2,
    effects: [{ kind: "poison", amount: 7 }],
    up: { effects: [{ kind: "poison", amount: 10 }] },
  },
  thorncoat: {
    name: "Thorn Coat", icon: "shield", type: "guard", cls: "warden",
    effects: [{ kind: "defense", amount: 3 }, { kind: "thorns", amount: 3 }],
    up: { effects: [{ kind: "defense", amount: 4 }, { kind: "thorns", amount: 4 }] },
  },
  regrowth: {
    name: "Regrowth", icon: "heart", type: "power", cls: "warden",
    effects: [{ kind: "regen", amount: 3 }, { kind: "res", amount: 1 }],
    up: { effects: [{ kind: "regen", amount: 4 }, { kind: "res", amount: 1 }] },
  },
  cull: {
    name: "Cull", icon: "fang", type: "attack", cls: "warden",
    effects: [{ kind: "attack", amount: 4, plusIfPoisoned: 5 }],
    up: { effects: [{ kind: "attack", amount: 6, plusIfPoisoned: 6 }] },
  },
  fang: {
    name: "Fang", icon: "fang", type: "skill", cls: "warden",
    modes: [
      { label: "Bite", effects: [{ kind: "attack", amount: 5 }] },
      { label: "Envenom", effects: [{ kind: "poison", amount: 4 }] },
    ],
    up: {
      modes: [
        { label: "Bite", effects: [{ kind: "attack", amount: 7 }] },
        { label: "Envenom", effects: [{ kind: "poison", amount: 6 }] },
      ],
    },
  },
  blight: {
    name: "Blight", icon: "fang", type: "skill", cls: "warden", cost: 4, rare: true,
    effects: [{ kind: "poison", amount: 14 }],
    up: { cost: 3, effects: [{ kind: "poison", amount: 14 }] },
  },
  brambleveil: {
    name: "Bramble Veil", icon: "shield", type: "power", cls: "warden", cost: 2, rare: true,
    effects: [{ kind: "thorns", amount: 4 }, { kind: "regen", amount: 2 }],
    up: { effects: [{ kind: "thorns", amount: 5 }, { kind: "regen", amount: 3 }] },
  },

  // --- neutral: shops and chests deal these to anyone --------------------
  dagger: {
    name: "Dagger", icon: "sword", type: "attack", neutral: true,
    effects: [{ kind: "attack", amount: 4 }],
    up: { effects: [{ kind: "attack", amount: 6 }] },
  },
  buckler: {
    name: "Buckler", icon: "shield", type: "guard", neutral: true,
    effects: [{ kind: "defense", amount: 5 }],
    up: { effects: [{ kind: "defense", amount: 7 }] },
  },
  torch: {
    name: "Torch", icon: "book", type: "skill", neutral: true,
    effects: [{ kind: "draw", amount: 2 }],
    up: { effects: [{ kind: "draw", amount: 3 }] },
  },
  bandage: {
    name: "Bandage", icon: "heart", type: "skill", neutral: true,
    effects: [{ kind: "heal", amount: 5 }],
    up: { effects: [{ kind: "heal", amount: 8 }] },
  },
  whetstone: {
    name: "Whetstone", icon: "sword", type: "power", neutral: true,
    effects: [{ kind: "edge", amount: 1 }],
    up: { effects: [{ kind: "edge", amount: 2 }] },
  },
  tonic: {
    name: "Tonic", icon: "heart", type: "skill", neutral: true,
    modes: [
      { label: "Drink it", effects: [{ kind: "heal", amount: 4 }] },
      { label: "Study it", effects: [{ kind: "draw", amount: 2 }] },
    ],
    up: {
      modes: [
        { label: "Drink it", effects: [{ kind: "heal", amount: 7 }] },
        { label: "Study it", effects: [{ kind: "draw", amount: 3 }] },
      ],
    },
  },
};

/* Applies the `up` patch. Returns a plain card the rest of the game treats
   exactly like a printed one. */
export function cardDef(id, upgraded) {
  const base = CARDS[id];
  if (!base) throw new Error(`unknown card: ${id}`);
  if (!upgraded || !base.up) return base;
  return { ...base, ...base.up, name: `${base.name}+`, upgraded: true };
}

const phrase = (effect, resName) => {
  switch (effect.kind) {
    case "attack":
      if (effect.scale === "defense") {
        return `Attack equal to your Defense${effect.bonus ? ` + ${effect.bonus}` : ""}.`;
      }
      return `Attack ${effect.amount}${effect.plusIfPoisoned ? `, +${effect.plusIfPoisoned} if it is poisoned` : ""}.`;
    case "defense": return `Defense ${effect.amount}.`;
    case "res": return `Gain ${effect.amount} ${resName}.`;
    case "draw": return `Draw ${effect.amount}.`;
    case "heal": return `Heal ${effect.amount}.`;
    case "poison": return `Poison ${effect.amount}.`;
    case "weaken": return `Shave ${effect.amount} off its swing.`;
    case "thorns": return `Thorns ${effect.amount}.`;
    case "edge": return `Edge ${effect.amount}.`;
    case "regen": return `Regen ${effect.amount}.`;
    case "flow": return `Flow ${effect.amount}.`;
    default: return "";
  }
};

export function describe(card, resName = "Rage") {
  const cost = card.cost ? `Costs ${card.cost} ${resName}. ` : "";
  if (card.modes) {
    return cost + card.modes.map((m) => `${m.label}: ${m.effects.map((e) => phrase(e, resName)).join(" ")}`).join(" / ");
  }
  return cost + card.effects.map((e) => phrase(e, resName)).join(" ");
}

/* ---------- classes ----------------------------------------------------- */

export const CLASSES = [
  {
    id: "knight", name: "Knight", sprite: "vanguard",
    resource: "Rage", maxHp: 48, hand: 4,
    blurb: "Rage builds as you take hits. Bank it, then swing something enormous.",
    // Rage banks itself as a fight drags, and faster when you are being hit.
    ragePerRound: true,
    deck: ["slash", "slash", "slash", "slash", "guard", "guard", "guard", "rally"],
    pool: ["hew", "bulwark", "sidestep", "warcry", "shieldbash", "cleaver", "ironskin", "laststand", "juggernaut"],
  },
  {
    id: "adept", name: "Adept", sprite: "adept",
    resource: "Mana", maxHp: 44, hand: 5,
    blurb: "Small hits that print Mana, saved for the round that ends it.",
    deck: ["spark", "spark", "spark", "spark", "ward", "ward", "ward", "study"],
    pool: ["firebolt", "frost", "channel", "arcaneshield", "siphon", "prism", "meteor", "leyline"],
  },
  {
    id: "warden", name: "Warden", sprite: "warden",
    resource: "Venom", maxHp: 46, hand: 5,
    blurb: "Poison does not care about armour. Outlast, and let it work.",
    deck: ["rake", "rake", "rake", "rake", "bark", "bark", "bark", "toxin"],
    pool: ["nettle", "venomspray", "thorncoat", "regrowth", "cull", "fang", "blight", "brambleveil"],
    unlock: "warden",
  },
];

export const NEUTRAL_POOL = ["dagger", "buckler", "torch", "bandage", "whetstone", "tonic"];

/* ---------- monster decks -----------------------------------------------

   A monster is a duellist with a deck, not a script. It draws its hand each
   round and plays the whole thing before you play yours, so you always act on
   what it actually did - and inspecting one shows you the deck it is drawing
   from, which is the real information. */

export const FOE_CARDS = {
  tap: { name: "Tap", effects: [{ kind: "attack", amount: 3 }] },
  nip: { name: "Nip", effects: [{ kind: "attack", amount: 2 }] },
  bite: { name: "Bite", effects: [{ kind: "attack", amount: 5 }] },
  rend: { name: "Rend", effects: [{ kind: "attack", amount: 7 }] },
  smash: { name: "Smash", effects: [{ kind: "attack", amount: 9 }] },
  slam: { name: "Slam", effects: [{ kind: "attack", amount: 6 }] },
  bolt: { name: "Bolt", effects: [{ kind: "attack", amount: 6 }] },
  harden: { name: "Harden", effects: [{ kind: "defense", amount: 3 }] },
  shell: { name: "Shell", effects: [{ kind: "defense", amount: 5 }] },
  spit: { name: "Spit", effects: [{ kind: "poison", amount: 2 }] },
  hex: { name: "Hex", effects: [{ kind: "weaken", amount: 4 }] },
  drain: { name: "Drain", effects: [{ kind: "attack", amount: 4 }, { kind: "heal", amount: 3 }] },
  howl: { name: "Howl", effects: [{ kind: "edge", amount: 1 }] },
  knit: { name: "Knit", effects: [{ kind: "regen", amount: 3 }] },
};

export const FOES = {
  mote: {
    name: "Cinder Mote", sprite: "mote", hp: [14, 17], draws: 2, xp: 5, gold: [4, 7],
    deck: ["tap", "tap", "tap", "harden"],
  },
  imp: {
    name: "Imp", sprite: "imp", hp: [12, 16], draws: 2, xp: 6, gold: [4, 8],
    deck: ["nip", "nip", "spit", "harden"],
  },
  hound: {
    name: "Ash Hound", sprite: "hound", hp: [21, 25], draws: 2, xp: 11, gold: [7, 12],
    deck: ["bite", "bite", "nip", "harden", "harden"],
  },
  hexer: {
    name: "Hexer", sprite: "hexer", hp: [19, 23], draws: 2, xp: 12, gold: [8, 13],
    deck: ["bolt", "hex", "drain", "harden", "spit"],
  },
  revenant: {
    name: "Revenant", sprite: "revenant", hp: [27, 32], draws: 3, xp: 20, gold: [12, 18],
    deck: ["rend", "rend", "drain", "harden", "shell"],
  },
  brute: {
    name: "Slag Brute", sprite: "brute", hp: [34, 40], draws: 2, xp: 24, gold: [14, 20],
    deck: ["smash", "smash", "howl", "shell", "harden"],
  },

  sentinel: {
    name: "The Sentinel", sprite: "sentinel", boss: true, hp: [40, 40], draws: 3, xp: 30, gold: [30, 30],
    deck: ["slam", "slam", "slam", "harden", "shell", "howl"],
  },
  hexlord: {
    name: "Hexlord Vane", sprite: "hexlord", boss: true, hp: [60, 60], draws: 3, xp: 55, gold: [45, 45],
    deck: ["bolt", "bolt", "bolt", "hex", "drain", "shell", "spit"],
  },
  archivist: {
    name: "The Archivist", sprite: "archivist", boss: true, hp: [78, 78], draws: 3, xp: 90, gold: [60, 60],
    deck: ["rend", "rend", "smash", "smash", "shell", "drain", "howl", "knit"],
  },
};

/* ---------- the dungeon -------------------------------------------------

   Three floors. Each is a grid you walk in the fog, and the stairs down are
   underneath the floor's keeper - so how much of a floor you clear before you
   fight it is the whole shape of a run. Tiles are finite, which is what stops
   grinding: there is only so much XP on a floor. */

export const FLOORS = [
  {
    name: "The Cistern", size: 6,
    foes: ["mote", "mote", "imp", "imp", "mote", "imp"], elites: ["hound"],
    boss: "sentinel", walls: 4, chests: 2, shops: 1, altars: 1, fires: 2,
  },
  {
    name: "The Kiln", size: 6,
    foes: ["hound", "hound", "hexer", "hexer", "hound", "imp"], elites: ["revenant"],
    boss: "hexlord", walls: 5, chests: 2, shops: 1, altars: 1, fires: 2,
  },
  {
    name: "The Vault", size: 7,
    foes: ["revenant", "brute", "hexer", "revenant", "hound", "brute"], elites: ["brute"],
    boss: "archivist", walls: 6, chests: 2, shops: 1, altars: 1, fires: 2,
  },
];

/* Elites hit harder than their sprite suggests, and pay for it. */
export const ELITE = { hp: 1.4, xp: 2, gold: 2, draws: 1 };

/* ---------- levelling ----------------------------------------------------

   XP is the reward for a fight, not a card - the card comes from the level it
   buys. That is the Dream Quest loop: kill things to grow, and the growth is
   a draft. */

export const LEVEL_XP = [0, 12, 29, 54, 88, 132, 190, 265, 360, 470];

export const BOONS = [
  { id: "vigour", name: "Vigour", desc: "+7 max HP, and heal that much.", apply: (run) => { run.maxHp += 7; run.hp += 7; } },
  { id: "grip", name: "Wider Grip", desc: "+1 card in every hand.", apply: (run) => { run.hand += 1; } },
  { id: "temper", name: "Temper", desc: "Start every fight with 2 of your resource.", apply: (run) => { run.startRes += 2; } },
  { id: "purge", name: "Purge", desc: "Burn a card out of your deck for good.", pick: "burn" },
];

/* ---------- meta --------------------------------------------------------- */

export const UNLOCKS = [
  { id: "vigor", name: "Vigor", cost: 8, desc: "+6 max HP on every run." },
  { id: "arsenal", name: "Arsenal", cost: 14, desc: "Rare cards start turning up in drafts and shops." },
  { id: "warden", name: "The Warden", cost: 20, desc: "Unlocks a third class: poison and thorns." },
  { id: "purse", name: "Deep Purse", cost: 26, desc: "Begin each run with 40 gold." },
  { id: "grip", name: "Sure Grip", cost: 34, desc: "+1 card in your starting hand size." },
  { id: "scout", name: "Scout", cost: 44, desc: "Each floor begins with its whole map already drawn." },
];

/* Lore is what a run leaves behind: some for each floor reached, more for
   each keeper killed. */
export const LORE = { floor: 3, boss: 5, clear: 10 };

/* Two duellists who cannot hurt each other would stand there for ever, which
   is a soft-lock rather than a hard fight. After this many rounds the dark
   starts pressing on both of them, harder every round. */
export const PATIENCE = 12;

export const SHOP_CARD_PRICES = { common: 28, rare: 52 };
export const SHOP_BURN_PRICE = 32;
export const POTION_PRICE = 22;
