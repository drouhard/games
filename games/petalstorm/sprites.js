/* Pixel art for Petalstorm, on the same Sweetie-16 ramp the other games in
   this repo use, so the whole shelf reads as one piece of hardware.

   Everything here is seen from directly above, so almost every craft is
   symmetric and is authored as a mirrored half - half the typing and
   guaranteed symmetry. The two banked poses of the player's ship are the
   exception: a bank is asymmetric by definition, so those are full rows.

   The game draws into a 240x360 back buffer and the browser scales that whole
   buffer up with image-rendering: pixelated, so every sprite here is drawn at
   its native size and never scaled during the draw. */

export const PALETTE = {
  "0": "#1a1c2c", // near-black, outlines
  "1": "#5d275d", // dark purple
  "2": "#b13e53", // red
  "3": "#ef7d57", // orange
  "4": "#ffcd75", // yellow
  "5": "#a7f070", // light green
  "6": "#38b764", // green
  "7": "#257179", // dark teal
  "8": "#29366f", // dark blue
  "9": "#3b5dc9", // blue
  a: "#41a6f6", // light blue
  b: "#73eff7", // cyan
  c: "#f4f4f4", // white
  d: "#94b0c2", // light grey
  e: "#566c86", // grey
  f: "#333c57", // dark grey
};

export const SPRITES = {
  // --- the player's ship ---------------------------------------------------

  ship: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      ".......0",
      "......0b",
      "......0b",
      ".....0bb",
      ".....0ab",
      "....0aab",
      "....0aab",
      "...0aaab",
      "..00aa9b",
      ".0b9aa9b",
      "0b99aa9b",
      "00a9aa9b",
      "....0b4b",
      "......44",
    ],
  },

  // Banked left and right. Full rows, because a bank is not symmetric - the
  // near wing lifts and the far one drops, and mirroring one would just give
  // the ship two near wings.
  shipLeft: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "................",
      ".......0b0......",
      ".......0b0......",
      "......0bb0......",
      "......0ab0......",
      "......0aab0.....",
      ".....0aaab0.....",
      "....0aaaab0.....",
      "...00aa9ab0.....",
      "..0b9aa99ab0....",
      "..0b99aa9ab0....",
      "...0a9aa9ab0....",
      ".....0b44b0.....",
      "......044.......",
    ],
  },

  shipRight: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "................",
      "......0b0.......",
      "......0b0.......",
      "......0bb0......",
      "......0ba0......",
      ".....0baa0......",
      ".....0baaa0.....",
      ".....0baaaa0....",
      ".....0ba9aa00...",
      "....0ba99aa9b0..",
      "....0ba9aa99b0..",
      "....0ba9aa9a0...",
      ".....0b44b0.....",
      ".......440......",
    ],
  },

  // --- fodder --------------------------------------------------------------

  drone: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "........",
      "....0000",
      "..000222",
      ".0022222",
      "0e222222",
      "0e2222cc",
      "0e2222cc",
      ".0e22222",
      "..0e2222",
      "...0e222",
      "....0e22",
      ".....002",
      "......00",
      "........",
    ],
  },

  weaver: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "........",
      "......00",
      ".....011",
      "...00111",
      ".00111c1",
      "01111cc1",
      "011111c1",
      ".0011111",
      "...00111",
      ".....011",
      "......00",
      "........",
      "........",
      "........",
    ],
  },

  turret: {
    w: 16, h: 16,
    half: [
      "........",
      "....0000",
      "..00eeee",
      ".0eeeeee",
      ".0eddddd",
      "0edd0000",
      "0ed03333",
      "0ed03334",
      "0ed03334",
      "0ed03333",
      "0edd0000",
      ".0eddddd",
      ".0eeeeee",
      "..00eeee",
      "....0000",
      "........",
    ],
  },

  lancer: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "......00",
      "......0d",
      ".....0dd",
      ".....0dd",
      "0....0dd",
      "00...0dd",
      "0d0..0dd",
      "0dd00ddd",
      "0dddddd2",
      ".0dd222c",
      "...02222",
      ".....022",
      "......02",
      ".......0",
    ],
  },

  bloom: {
    w: 16, h: 16,
    half: [
      "........",
      "....0000",
      "..006666",
      ".0666655",
      ".0666555",
      "06655555",
      "06655545",
      "06655444",
      "06655444",
      "06655545",
      "06655555",
      ".0666555",
      ".0666655",
      "..006666",
      "....0000",
      "........",
    ],
  },

  spinner: {
    w: 16, h: 16,
    half: [
      "b.......",
      "7b......",
      "77b.....",
      ".77b....",
      "..77b...",
      "...77bb.",
      "....77bb",
      "....07cc",
      "....07cc",
      "....77bb",
      "...77bb.",
      "..77b...",
      ".77b....",
      "77b.....",
      "7b......",
      "b.......",
    ],
  },

  // --- bosses --------------------------------------------------------------

  sentinel: {
    w: 32, h: 32,
    half: [
      "................",
      "................",
      ".............000",
      "...........00999",
      ".........009999a",
      ".......0099999aa",
      ".....00999999aaa",
      "...009999999aaaa",
      ".00999999999aaaa",
      "099999999999aaaa",
      "09aaa9999999aaaa",
      "09aaa9999999cccc",
      "09aaa999999ccbbc",
      "099999999999ccbc",
      "0999999999999ccc",
      "00999999999999cc",
      ".0099999999999cc",
      "..00999999999ccc",
      "...0099999999ccc",
      ".....00999999ccc",
      ".......0099999cc",
      ".........009999c",
      "..........009999",
      "...........00999",
      "............0099",
      ".............009",
      "..............00",
      "...............0",
      "................",
      "................",
      "................",
      "................",
    ],
  },

  hive: {
    w: 32, h: 32,
    half: [
      "................",
      "...........00000",
      "........00001000",
      ".......000110000",
      "......0000000011",
      ".....00100000011",
      "....000001110006",
      "...0000001116555",
      "..00100001665555",
      "..00111005555556",
      "..00111155555566",
      ".000111055555556",
      ".0001005566655cc",
      ".011000556666ccc",
      ".00011055666cc44",
      ".00011655555cc44",
      ".00011655555cc44",
      ".00011055666cc44",
      ".011000556666ccc",
      ".0001005566655cc",
      ".000111055555556",
      "..00111155555566",
      "..00111005555556",
      "..00100001665555",
      "...0000001116555",
      "....000001110006",
      ".....00100000011",
      "......0000000011",
      ".......000110000",
      "........00001000",
      "...........00000",
      "................",
    ],
  },

  warlance: {
    w: 32, h: 32,
    half: [
      "..............00",
      ".............07c",
      "............07bc",
      "...........07bbc",
      "..........07bbbc",
      ".........07bbbbc",
      "........07bbbbbc",
      ".......07bbbbbbc",
      "......07777bbbbc",
      ".....07777777bbc",
      "....077777777bbc",
      "...0777777777bbc",
      "..07777777777bbc",
      ".077777722277bbc",
      ".07777722222777c",
      "07777222c2227777",
      "07777222c2227777",
      ".07777722222777c",
      ".077777722277bbc",
      "..07777777777bbc",
      "...0777777777bbc",
      "....077777777bbc",
      ".....07777777bbc",
      "......07777bbbbc",
      ".......07bbbbbbc",
      "........07bbbbbc",
      ".........07bbbbc",
      "..........07bbbc",
      "...........07bbc",
      "............07bc",
      ".............07c",
      "..............00",
    ],
  },

  queen: {
    w: 48, h: 40,
    half: [
      "......................00",
      "....................0000",
      "...................00001",
      "...................00111",
      "..................001111",
      "........000000....011111",
      "......0000000000..011222",
      "......00011111110.011222",
      "......001111111110012222",
      "......001111222221012255",
      "......001112222222212555",
      "......001112222222222555",
      ".......0111222555552255c",
      "........01122255555555cc",
      ".........01122555cccc5cc",
      ".....000000112555ccccccc",
      "..000011111221255cccccc4",
      ".00011112222225555cc4444",
      "0001111222225555cccc4444",
      "000111122225555cccc44444",
      "000111122225555cccc44444",
      "0001111222225555cccc4444",
      ".00011112222225555cc4444",
      "..000011111221255cccccc4",
      ".....000000112555ccccccc",
      ".........01122555cccc5cc",
      "........01122255555555cc",
      ".......0111222555552255c",
      "......001112222222222555",
      "......001112222222212555",
      "......001111222221012255",
      "......001111111110012222",
      "......00011111110.011222",
      "......0000000000..011222",
      "........000000....011111",
      "..................001111",
      "...................00111",
      "...................00001",
      "....................0000",
      "......................00",
    ],
  },

  // --- ordnance ------------------------------------------------------------
  // Bullets are read at a glance or not at all, so each kind gets its own
  // silhouette as well as its own colour: round, needle, flower, star.

  pellet: {
    w: 8, h: 8,
    half: [
      "....",
      "....",
      "..02",
      ".022",
      ".02c",
      "..02",
      "....",
      "....",
    ],
  },

  orb: {
    w: 8, h: 8,
    half: [
      "....",
      "...0",
      "..09",
      ".09a",
      ".09a",
      ".09b",
      "..09",
      "...0",
    ],
  },

  petal: {
    w: 8, h: 8,
    half: [
      "....",
      "...0",
      "..05",
      ".056",
      ".05c",
      "..05",
      "...0",
      "....",
    ],
  },

  shard: {
    w: 8, h: 8,
    half: [
      "....",
      "...c",
      "..0c",
      "..0c",
      "..0c",
      "..0c",
      "...c",
      "....",
    ],
  },

  star: {
    w: 8, h: 8,
    half: [
      "....",
      "...3",
      "...4",
      ".034",
      "0344",
      ".034",
      "...4",
      "...3",
    ],
  },

  shot: {
    w: 8, h: 8,
    half: [
      "....",
      "...b",
      "...b",
      "...c",
      "...c",
      "...b",
      "...b",
      "....",
    ],
  },

  // --- pickups -------------------------------------------------------------

  powerUp: {
    w: 12, h: 12,
    half: [
      "......",
      "..0000",
      ".03333",
      "0334ff",
      "034fcc",
      "034fcc",
      "034fcc",
      "034fcc",
      "0334ff",
      ".03333",
      "..0000",
      "......",
    ],
  },

  shardUp: {
    w: 12, h: 12,
    half: [
      "......",
      "...00.",
      "..07b0",
      ".07bbb",
      "07bbbc",
      "07bbbc",
      "07bbbc",
      "07bbbc",
      ".07bbb",
      "..07bb",
      "...00.",
      "......",
    ],
  },

  lifeUp: {
    w: 12, h: 12,
    half: [
      "......",
      ".000..",
      "022200",
      "022222",
      "0222c2",
      "022222",
      ".02222",
      "..0222",
      "...022",
      "....02",
      ".....0",
      "......",
    ],
  },
};

const cache = new Map();
const flashCache = new Map();

function expand(sprite) {
  if (sprite.rows) return sprite.rows;
  // "..0555" -> "..0555" + "5550.."
  return sprite.half.map((row) => row + [...row].reverse().join(""));
}

function paint(key, white) {
  const sprite = SPRITES[key];
  if (!sprite) throw new Error(`unknown sprite: ${key}`);
  const canvas = document.createElement("canvas");
  canvas.width = sprite.w;
  canvas.height = sprite.h;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(sprite.w, sprite.h);
  const rows = expand(sprite);
  for (let y = 0; y < sprite.h; y++) {
    const row = rows[y] || "";
    for (let x = 0; x < sprite.w; x++) {
      const hex = PALETTE[row[x]];
      if (!hex) continue; // '.' and anything unmapped stays transparent
      const at = (y * sprite.w + x) * 4;
      if (white) {
        image.data[at] = 255;
        image.data[at + 1] = 255;
        image.data[at + 2] = 255;
      } else {
        image.data[at] = parseInt(hex.slice(1, 3), 16);
        image.data[at + 1] = parseInt(hex.slice(3, 5), 16);
        image.data[at + 2] = parseInt(hex.slice(5, 7), 16);
      }
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/* The cached master for a sprite. Callers draw it with drawImage at 1:1 -
   cloneNode() would hand back a canvas of the right size and an empty bitmap,
   because a canvas's contents do not clone with its node. */
export function sprite(key) {
  if (!cache.has(key)) cache.set(key, paint(key, false));
  return cache.get(key);
}

/* The same shape in flat white, for the frame after something is hit. */
export function flash(key) {
  if (!flashCache.has(key)) flashCache.set(key, paint(key, true));
  return flashCache.get(key);
}

/* Row-length and palette check for the hand-authored art. A miscounted row
   would otherwise show up as a silently clipped sprite in the browser, which
   is a miserable thing to debug from a screenshot. Pure and DOM-free, so
   tools/check-sprites.mjs can run it in Node. */
export function validateSprites() {
  const problems = [];
  for (const [key, sprite] of Object.entries(SPRITES)) {
    const source = sprite.rows || sprite.half;
    const want = sprite.rows ? sprite.w : sprite.w / 2;
    if (source.length !== sprite.h) {
      problems.push(`${key}: ${source.length} rows, expected ${sprite.h}`);
    }
    source.forEach((row, y) => {
      if (row.length !== want) {
        problems.push(`${key} row ${y}: ${row.length} chars, expected ${want}`);
      }
      for (const ch of row) {
        if (ch !== "." && !PALETTE[ch]) {
          problems.push(`${key} row ${y}: '${ch}' is not in the palette`);
        }
      }
    });
  }
  return problems;
}
