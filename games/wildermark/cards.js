/* Every card in the Wildermark, and the rules for reading one.

   Five colours, one relic slot, and a land for each colour. A card is data
   only: cost, a body if it is a creature, and a list of effects. Rules text is
   *generated* from those effects by `cardText()` rather than written beside
   them, so a card can never end up lying about what it does - the same reason
   Deckdelve does it.

   No DOM in here. tools/wild-sim.mjs imports this file and plays with it. */

/* ---------- colours ------------------------------------------------------

   Our own five, not theirs. Each one owns a terrain on the overworld, a
   warden, a wildmagic, and a way of winning a duel:

     Sun     ranks that hold ground and gain life
     Tide    fliers, bounce and cards
     Rot     drain, decay and creatures that hurt to kill
     Ember   burn, haste, and damage that goes anywhere
     Bramble the biggest bodies and the mana to cast them early          */

export const COLORS = {
  sun: { name: "Sun", glyph: "☀", tint: "#ffcd75", land: "sunfield", terrain: "downs" },
  tide: { name: "Tide", glyph: "≈", tint: "#41a6f6", land: "tidepool", terrain: "shallows" },
  rot: { name: "Rot", glyph: "☠", tint: "#a06fd0", land: "rotmire", terrain: "mire" },
  ember: { name: "Ember", glyph: "✦", tint: "#ef7d57", land: "emberpeak", terrain: "crags" },
  bramble: { name: "Bramble", glyph: "❦", tint: "#38b764", land: "bramblewood", terrain: "wood" },
};

export const COLOR_KEYS = Object.keys(COLORS);

/* ---------- keywords ----------------------------------------------------- */

export const KEYWORDS = {
  flying: { name: "Flying", help: "Only blockers with Flying or Reach can stop it." },
  reach: { name: "Reach", help: "Can block a flier." },
  haste: { name: "Haste", help: "Can attack the turn it lands." },
  vigilance: { name: "Vigilance", help: "Attacking does not tap it." },
  trample: { name: "Trample", help: "Damage past a blocker's toughness hits the player." },
  lifelink: { name: "Lifelink", help: "Damage it deals is life you gain." },
  deathtouch: { name: "Deathtouch", help: "Any damage from it destroys a creature." },
  firststrike: { name: "First Strike", help: "Deals its damage before anything strikes back." },
  defender: { name: "Defender", help: "It can block, but it cannot attack." },
};

/* ---------- the cards ----------------------------------------------------

   `cost` is the total mana; `pips` is how much of that must be the card's own
   colour, so a 4/1 splash card is castable off a couple of borrowed lands and
   a double-pip card is not. Relics have no colour and no pips: any mana casts
   them, which is what holds a two-colour deck together.

   `type` is creature, sorcery (your main phase only) or reflex (a combat
   trick - castable while blockers are being declared, by either side).

   Effect targets:
     any        a creature on either side, or the enemy player
     creature   any creature on either side
     theirs     an enemy creature      yours      one of your own
     player     the enemy player       self       you
     allTheirs / allYours / allCreatures                                   */

export const CARDS = {
  /* ===== lands ========================================================== */
  sunfield: { name: "Sunfield", type: "land", color: "sun", art: "landSun" },
  tidepool: { name: "Tidepool", type: "land", color: "tide", art: "landTide" },
  rotmire: { name: "Rotmire", type: "land", color: "rot", art: "landRot" },
  emberpeak: { name: "Emberpeak", type: "land", color: "ember", art: "landEmber" },
  bramblewood: { name: "Bramblewood", type: "land", color: "bramble", art: "landBramble" },
  confluence: {
    name: "Confluence", type: "land", color: null, any: true, entersTapped: true,
    art: "landAny", rarity: 2, price: 90,
    note: "Taps for any colour. Enters tapped.",
  },

  /* ===== Sun ============================================================ */
  lanternward: {
    name: "Lanternward", type: "creature", color: "sun", cost: 1, pips: 1,
    power: 1, toughness: 2, kw: ["lifelink"], art: "lanternward", rarity: 1, price: 30,
  },
  shieldbearer: {
    name: "Shieldbearer", type: "creature", color: "sun", cost: 2, pips: 1,
    power: 2, toughness: 3, kw: ["vigilance"], art: "shieldbearer", rarity: 1, price: 45,
  },
  dawnpriest: {
    name: "Dawn Priest", type: "creature", color: "sun", cost: 3, pips: 1,
    power: 2, toughness: 2, kw: ["flying"], art: "dawnpriest", rarity: 1, price: 65,
    enter: [{ k: "heal", amount: 3 }],
  },
  gildedsentry: {
    name: "Gilded Sentry", type: "creature", color: "sun", cost: 4, pips: 2,
    power: 3, toughness: 5, kw: ["vigilance", "firststrike"], art: "gildedsentry", rarity: 2, price: 110,
  },
  hostcaller: {
    name: "Host-Caller", type: "creature", color: "sun", cost: 5, pips: 2,
    power: 3, toughness: 3, art: "hostcaller", rarity: 2, price: 130,
    enter: [{ k: "token", count: 2, name: "Acolyte", power: 1, toughness: 1 }],
  },
  seraphofnoon: {
    name: "Seraph of Noon", type: "creature", color: "sun", cost: 6, pips: 2,
    power: 4, toughness: 5, kw: ["flying", "lifelink"], art: "seraph", rarity: 3, price: 220,
  },
  mendwounds: {
    name: "Mend Wounds", type: "sorcery", color: "sun", cost: 1, pips: 1, rarity: 1, price: 25,
    fx: [{ k: "heal", amount: 4 }],
  },
  bindinglight: {
    name: "Binding Light", type: "sorcery", color: "sun", cost: 3, pips: 1, rarity: 1, price: 70,
    fx: [{ k: "exile", to: "theirs" }],
  },
  rankandfile: {
    name: "Rank and File", type: "reflex", color: "sun", cost: 2, pips: 1, rarity: 1, price: 60,
    fx: [{ k: "pump", power: 1, toughness: 2, to: "allYours" }],
  },
  daybreak: {
    name: "Daybreak", type: "sorcery", color: "sun", cost: 5, pips: 2, rarity: 3, price: 190,
    fx: [{ k: "wrath", spare: "yours" }],
  },

  /* ===== Tide =========================================================== */
  mistdarter: {
    name: "Mist Darter", type: "creature", color: "tide", cost: 1, pips: 1,
    power: 1, toughness: 1, kw: ["flying"], art: "mistdarter", rarity: 1, price: 30,
  },
  tidereader: {
    name: "Tide Reader", type: "creature", color: "tide", cost: 2, pips: 1,
    power: 2, toughness: 3, art: "tidereader", rarity: 1, price: 55,
    enter: [{ k: "draw", amount: 1 }],
  },
  saltglassdrake: {
    name: "Saltglass Drake", type: "creature", color: "tide", cost: 4, pips: 2,
    power: 3, toughness: 4, kw: ["flying"], art: "drake", rarity: 1, price: 105,
  },
  deepcallkraken: {
    name: "Deepcall Kraken", type: "creature", color: "tide", cost: 6, pips: 2,
    power: 6, toughness: 6, art: "kraken", rarity: 3, price: 230,
    enter: [{ k: "freeze", to: "allTheirs" }],
  },
  undertow: {
    name: "Undertow", type: "reflex", color: "tide", cost: 2, pips: 1, rarity: 1, price: 55,
    fx: [{ k: "bounce", to: "creature" }],
  },
  scrying: {
    name: "Scrying Pool", type: "sorcery", color: "tide", cost: 3, pips: 1, rarity: 1, price: 65,
    fx: [{ k: "draw", amount: 3 }],
  },
  gloomfog: {
    name: "Gloomfog", type: "reflex", color: "tide", cost: 1, pips: 1, rarity: 1, price: 40,
    fx: [{ k: "freeze", to: "theirs" }],
  },
  wavebreak: {
    name: "Wavebreak", type: "sorcery", color: "tide", cost: 4, pips: 2, rarity: 2, price: 120,
    fx: [{ k: "bounce", to: "allTheirs" }],
  },
  siltstalker: {
    name: "Silt Stalker", type: "creature", color: "tide", cost: 3, pips: 1,
    power: 3, toughness: 2, kw: ["flying"], art: "siltstalker", rarity: 2, price: 85,
  },

  /* ===== Rot ============================================================ */
  gravegnat: {
    name: "Gravegnat", type: "creature", color: "rot", cost: 1, pips: 1,
    power: 1, toughness: 1, kw: ["flying"], art: "gravegnat", rarity: 1, price: 28,
    dies: [{ k: "drain", amount: 1 }],
  },
  boneculler: {
    name: "Bone Culler", type: "creature", color: "rot", cost: 2, pips: 1,
    power: 2, toughness: 2, art: "boneculler", rarity: 1, price: 45,
    enter: [{ k: "discard", amount: 1 }],
  },
  mirelurker: {
    name: "Mirelurker", type: "creature", color: "rot", cost: 3, pips: 1,
    power: 3, toughness: 2, kw: ["deathtouch"], art: "mirelurker", rarity: 1, price: 80,
  },
  plaguebearer: {
    name: "Plague-Bearer", type: "creature", color: "rot", cost: 4, pips: 2,
    power: 3, toughness: 3, art: "plaguebearer", rarity: 2, price: 105,
    enter: [{ k: "wither", power: -2, toughness: -2, to: "allTheirs" }],
  },
  barrowlich: {
    name: "Barrow Lich", type: "creature", color: "rot", cost: 6, pips: 2,
    power: 5, toughness: 4, kw: ["deathtouch"], art: "lich", rarity: 3, price: 215,
    attacks: [{ k: "drain", amount: 2 }],
  },
  wastingtouch: {
    name: "Wasting Touch", type: "sorcery", color: "rot", cost: 2, pips: 1, rarity: 1, price: 60,
    fx: [{ k: "wither", power: -3, toughness: -3, to: "theirs" }],
  },
  siphonyears: {
    name: "Siphon Years", type: "sorcery", color: "rot", cost: 3, pips: 1, rarity: 1, price: 70,
    fx: [{ k: "drain", amount: 3 }],
  },
  ruinousedict: {
    name: "Ruinous Edict", type: "sorcery", color: "rot", cost: 4, pips: 2, rarity: 2, price: 125,
    fx: [{ k: "destroy", to: "theirs" }, { k: "heal", amount: 2 }],
  },
  gnawingdoubt: {
    name: "Gnawing Doubt", type: "reflex", color: "rot", cost: 1, pips: 1, rarity: 1, price: 38,
    fx: [{ k: "wither", power: -1, toughness: -1, to: "allTheirs" }],
  },

  /* ===== Ember ========================================================== */
  emberling: {
    name: "Emberling", type: "creature", color: "ember", cost: 1, pips: 1,
    power: 2, toughness: 1, kw: ["haste"], art: "emberling", rarity: 1, price: 30,
  },
  cragrunner: {
    name: "Crag Runner", type: "creature", color: "ember", cost: 2, pips: 1,
    power: 3, toughness: 1, kw: ["haste"], art: "cragrunner", rarity: 1, price: 45,
  },
  forgehound: {
    name: "Forgehound", type: "creature", color: "ember", cost: 3, pips: 1,
    power: 3, toughness: 3, art: "forgehound", rarity: 1, price: 70,
    attacks: [{ k: "damage", amount: 1, to: "player" }],
  },
  ashwyrm: {
    name: "Ash Wyrm", type: "creature", color: "ember", cost: 5, pips: 2,
    power: 5, toughness: 3, kw: ["flying", "trample"], art: "ashwyrm", rarity: 3, price: 200,
  },
  scorch: {
    name: "Scorch", type: "reflex", color: "ember", cost: 1, pips: 1, rarity: 1, price: 35,
    fx: [{ k: "damage", amount: 3, to: "any" }],
  },
  emberfall: {
    name: "Emberfall", type: "sorcery", color: "ember", cost: 3, pips: 1, rarity: 1, price: 80,
    fx: [{ k: "damage", amount: 2, to: "allTheirs" }, { k: "damage", amount: 2, to: "player" }],
  },
  fury: {
    name: "Fury", type: "reflex", color: "ember", cost: 1, pips: 1, rarity: 1, price: 40,
    fx: [{ k: "pump", power: 3, toughness: 0, to: "yours" }, { k: "grant", kw: "trample", to: "yours" }],
  },
  cinderlance: {
    name: "Cinder Lance", type: "sorcery", color: "ember", cost: 4, pips: 2, rarity: 2, price: 130,
    fx: [{ k: "damage", amount: 6, to: "any" }],
  },
  slagtitan: {
    name: "Slag Titan", type: "creature", color: "ember", cost: 4, pips: 2,
    power: 5, toughness: 4, kw: ["trample"], art: "slagtitan", rarity: 2, price: 115,
  },

  /* ===== Bramble ======================================================== */
  thornwhelp: {
    name: "Thorn Whelp", type: "creature", color: "bramble", cost: 1, pips: 1,
    power: 1, toughness: 2, kw: ["reach"], art: "thornwhelp", rarity: 1, price: 28,
  },
  rootspeaker: {
    name: "Rootspeaker", type: "creature", color: "bramble", cost: 2, pips: 1,
    power: 1, toughness: 3, art: "rootspeaker", rarity: 1, price: 55,
    ramp: 1,
  },
  antlerbeast: {
    name: "Antler Beast", type: "creature", color: "bramble", cost: 3, pips: 1,
    power: 4, toughness: 3, art: "antlerbeast", rarity: 1, price: 80,
  },
  bramblewarden: {
    name: "Bramble Warden", type: "creature", color: "bramble", cost: 4, pips: 2,
    power: 3, toughness: 5, kw: ["reach", "vigilance"], art: "bramblewarden", rarity: 2, price: 110,
  },
  greatwyrm: {
    name: "Greatwyrm", type: "creature", color: "bramble", cost: 6, pips: 2,
    power: 6, toughness: 6, kw: ["trample"], art: "greatwyrm", rarity: 3, price: 225,
  },
  wildgrowth: {
    name: "Wildgrowth", type: "sorcery", color: "bramble", cost: 2, pips: 1, rarity: 1, price: 50,
    fx: [{ k: "growth", amount: 1 }, { k: "draw", amount: 1 }],
  },
  hornedcharge: {
    name: "Horned Charge", type: "reflex", color: "bramble", cost: 2, pips: 1, rarity: 1, price: 55,
    fx: [{ k: "pump", power: 3, toughness: 3, to: "yours" }],
  },
  quellthesky: {
    name: "Quell the Sky", type: "reflex", color: "bramble", cost: 2, pips: 1, rarity: 1, price: 60,
    fx: [{ k: "destroy", to: "theirsFlying" }],
  },
  seasonofteeth: {
    name: "Season of Teeth", type: "sorcery", color: "bramble", cost: 5, pips: 2, rarity: 2, price: 150,
    fx: [{ k: "counters", amount: 2, to: "allYours" }],
  },

  /* ===== relics (colourless: any mana casts them) ======================= */
  wanderersblade: {
    name: "Wanderer's Blade", type: "creature", color: null, cost: 2, pips: 0,
    power: 2, toughness: 2, art: "blade", rarity: 1, price: 55,
    note: "A relic, so any mana casts it.",
  },
  claybound: {
    name: "Claybound Sentinel", type: "creature", color: null, cost: 3, pips: 0,
    power: 2, toughness: 4, kw: ["defender", "reach"], art: "claybound", rarity: 1, price: 65,
  },
  runeengine: {
    name: "Rune Engine", type: "creature", color: null, cost: 5, pips: 0,
    power: 4, toughness: 4, art: "runeengine", rarity: 2, price: 150,
    attacks: [{ k: "draw", amount: 1 }],
  },
  travellersstone: {
    name: "Traveller's Stone", type: "sorcery", color: null, cost: 2, pips: 0, rarity: 1, price: 60,
    fx: [{ k: "growth", amount: 1 }, { k: "heal", amount: 2 }],
  },
  shatterspike: {
    name: "Shatterspike", type: "reflex", color: null, cost: 3, pips: 0, rarity: 2, price: 95,
    fx: [{ k: "damage", amount: 4, to: "creature" }],
  },
  planarcompass: {
    name: "Planar Compass", type: "sorcery", color: null, cost: 3, pips: 0, rarity: 2, price: 100,
    fx: [{ k: "draw", amount: 2 }, { k: "heal", amount: 3 }],
  },
};

export const CARD_KEYS = Object.keys(CARDS);

export const LAND_OF = Object.fromEntries(COLOR_KEYS.map((c) => [c, COLORS[c].land]));
export const isLand = (id) => CARDS[id].type === "land";
export const isSpell = (id) => !isLand(id);

/* ---------- rules text, generated ---------------------------------------- */

const TARGET_WORDS = {
  any: "a creature or the enemy",
  creature: "a creature",
  theirs: "an enemy creature",
  theirsFlying: "an enemy flier",
  yours: "one of your creatures",
  player: "the enemy",
  self: "you",
  allTheirs: "every enemy creature",
  allYours: "each of your creatures",
  allCreatures: "every creature",
};

const word = (to) => TARGET_WORDS[to] || "it";
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

function effectText(fx) {
  switch (fx.k) {
    case "damage": return `Deal ${fx.amount} damage to ${word(fx.to)}.`;
    case "heal": return `Gain ${fx.amount} life.`;
    case "drain": return `The enemy loses ${fx.amount} life and you gain ${fx.amount}.`;
    case "draw": return `Draw ${fx.amount} card${fx.amount > 1 ? "s" : ""}.`;
    case "discard": return `The enemy discards ${fx.amount}.`;
    case "pump": return `${word(fx.to)} gets ${signed(fx.power)}/${signed(fx.toughness)} until end of turn.`;
    case "wither": return `${word(fx.to)} gets ${signed(fx.power)}/${signed(fx.toughness)} until end of turn.`;
    case "counters": return `Put ${fx.amount} +1/+1 counters on ${word(fx.to)}.`;
    case "grant": return `${word(fx.to)} gains ${KEYWORDS[fx.kw].name}.`;
    case "destroy": return `Destroy ${word(fx.to)}.`;
    case "exile": return `Banish ${word(fx.to)}.`;
    case "bounce": return `Return ${word(fx.to)} to its owner's hand.`;
    case "freeze": return `Tap ${word(fx.to)}; it does not untap next turn.`;
    case "wrath": return "Destroy every creature but your own.";
    case "growth": return `Put ${fx.amount} land from your deck onto the field.`;
    case "token": return `Create ${fx.count} ${fx.power}/${fx.toughness} ${fx.name} token${fx.count > 1 ? "s" : ""}.`;
    default: return "";
  }
}

/* One card's full rules text: keywords, then triggers, then spell effects. */
export function cardText(id) {
  const card = CARDS[id];
  const lines = [];
  if (card.type === "land") {
    lines.push(card.any ? "Taps for one mana of any colour." : `Taps for one ${COLORS[card.color].name} mana.`);
    if (card.entersTapped) lines.push("Enters tapped.");
    return lines.join(" ");
  }
  if (card.kw?.length) lines.push(card.kw.map((k) => KEYWORDS[k].name).join(", ") + ".");
  if (card.ramp) lines.push(`Taps for ${card.ramp} mana of any colour.`);
  if (card.enter) lines.push("Arrives: " + card.enter.map(effectText).join(" "));
  if (card.attacks) lines.push("Attacks: " + card.attacks.map(effectText).join(" "));
  if (card.dies) lines.push("Dies: " + card.dies.map(effectText).join(" "));
  if (card.fx) lines.push(card.fx.map(effectText).join(" "));
  if (card.note) lines.push(card.note);
  return lines.join(" ");
}

/* The mana pips a card wants, spelled out for the cost badge: "3☀" reads as
   three mana, one of which must be Sun. */
export function costLabel(id) {
  const card = CARDS[id];
  if (card.type === "land") return "";
  const glyph = card.color ? COLORS[card.color].glyph : "◇";
  return `${card.cost}${glyph.repeat(card.pips || 0)}`;
}

/* A blunt power rating, used by the shop, the ante and the bot's draft. It is
   deliberately crude - a person reads synergy, so anything tuned against this
   number is being tuned against a floor. */
export function cardValue(id) {
  const card = CARDS[id];
  if (!card) return 2; // a token: worth a body, worth nothing to lose
  if (card.type === "land") return card.any ? 3 : 1;
  let score = (card.cost || 0) * 1.2 + (card.rarity || 1) * 1.5;
  if (card.type === "creature") {
    score += (card.power + card.toughness) * 0.6 + (card.kw?.length || 0) * 1.2;
    if (card.enter || card.attacks || card.dies) score += 2;
  } else {
    score += 3;
  }
  return Math.round(score * 10) / 10;
}
