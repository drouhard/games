/* Pixel art.

   One 16-colour palette (Sweetie-16) for the whole cast, the way an 8-bit
   console would do it - that shared ramp is what makes hand-drawn heroes,
   monsters and card icons look like they belong to the same game.

   Symmetric things are authored as a `half` (half the width) and mirrored at
   load: half the typing, and they come out actually symmetric. Beasts read
   far better in profile, so those give full asymmetric `rows` instead. */

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
  // --- heroes (16x16, facing the viewer) ---------------------------------

  vanguard: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "......02",
      ".....022",
      "....0ddd",
      "....0d0d", // eye slits sit either side of the seam
      "....0ddd",
      "....00dd",
      "..00dddd",
      ".0dddd22", // pauldron, then the red tabard down the middle
      ".0dd0d22",
      "..0d0d22",
      "...0dd22",
      "...0ee22",
      "....0eee",
      "....000.",
    ],
  },

  adept: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "......00",
      ".....099",
      "....0999",
      "...09ddd",
      "...09d0d",
      "...099dd",
      "..099999",
      ".09999bb", // cyan light bleeding out of the robe
      ".0999bbb",
      ".09999bb",
      "..099999",
      "..099999",
      "...09999",
      "...00000",
    ],
  },

  warden: {
    w: 16, h: 16,
    half: [
      "........",
      "......05",
      ".....055",
      "....0556",
      "....066d",
      "...06d0d",
      "...06ddd",
      "....066d",
      "..006666",
      ".0666655",
      ".0666666",
      ".0666667",
      "..066666",
      "..066666",
      "...06666",
      "...00000",
    ],
  },

  // --- floor one ---------------------------------------------------------

  mote: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "........",
      "......00",
      "....00bb",
      "...0bbba",
      "..0bbbaa",
      ".0bbaaaa",
      ".0baaaaa",
      ".0baa00a", // eye
      ".0baaaaa",
      "0baaaaaa",
      "0baaaaaa",
      "09999999",
      "09999999",
      ".0000000",
    ],
  },

  imp: {
    w: 16, h: 16,
    half: [
      "........",
      "....0...", // horn tip, angled out from the head
      "....02..",
      "...0022.",
      "...02222",
      "...02422", // yellow eye
      "...02222",
      "....0222",
      "..000222",
      ".0110222", // membrane wing, folded at the shoulder
      "01110222",
      ".0110222",
      "..000222",
      "....0222",
      "....022.",
      "....00..",
    ],
  },

  // --- floor two ---------------------------------------------------------

  // A four-legged thing reads as a beast only in profile, so the hound gets
  // full rows: muzzle left, tail curling off to the right.
  hound: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "..00.......00...",
      ".0f0......0f30..",
      ".0ff0....0ff30..",
      "0fff0...0fff0...",
      "03ff00000ffff0..",
      "0f3ffffffffff0..",
      "0ffffffffffff0..",
      ".0fffffffffff0..",
      ".0fffffffffff0..",
      "..0ff0ff0ff0f0..",
      "..0f0.0f0.0f0...",
      "..00..00..00....",
      "................",
      "................",
    ],
  },

  hexer: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "......00",
      ".....011",
      "....0111",
      "....01ff",
      "...01f4f", // yellow eye burning under the hood
      "...01fff",
      "..011111",
      "..011111",
      ".0111111",
      ".0111114", // charm at the belt
      ".0111111",
      "..011111",
      "..011111",
      "...00000",
    ],
  },

  // --- floor three -------------------------------------------------------

  revenant: {
    w: 16, h: 16,
    half: [
      "........",
      "....0000",
      "...0cccc",
      "...0c00c", // sockets
      "...0cccc",
      "....0c0c", // teeth
      "..000ccc",
      ".0cccccc",
      "09cc0ccc", // arms outside the ribcage, grave-cloth over the shoulder
      "09cc0c0c",
      "09cc0ccc",
      ".0cc0c0c",
      "..000ccc",
      "....0ccc",
      "....0cc.",
      "....000.",
    ],
  },

  brute: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      ".....000",
      ".....0ee",
      ".....0e3", // furnace glow behind the faceplate
      "....00ee",
      "..00eeee", // slab shoulders
      ".0eeeeee",
      "0ee0eeee", // arms hang clear of the torso
      "0ee0e33e", // slag seam across the chest
      "0ee0eeee",
      "0ee0eeee",
      ".0e0eeee",
      "..000eee",
      "....0eee",
      "....000.",
    ],
  },

  // --- bosses (24x24) ----------------------------------------------------

  sentinel: {
    w: 24, h: 24,
    half: [
      "............",
      "......000000",
      ".....0dddddd",
      ".....0dd4444", // eye band
      ".....0dddddd",
      "....00dddddd",
      "...0dd0ddddd",
      "..0ddd0ddddd",
      ".0dddd0ddddd",
      "0ddddd0ddddd",
      "0dd0dd0ddddd",
      "0dd0dd0d4444", // core
      "0dd0dd0ddddd",
      "0dd0dd0ddddd",
      ".0dddd0ddddd",
      "..0ddd0ddddd",
      "...000000ddd",
      "......0edddd",
      "......0eeddd",
      "......0eeedd",
      "......0eeeee",
      ".....0eeeeee",
      ".....0eee000",
      ".....000....",
    ],
  },

  hexlord: {
    w: 24, h: 24,
    half: [
      "............",
      "..........00",
      ".........011",
      "........0111",
      ".......01111",
      "......011111",
      "......01ffff",
      "......01f22f", // eyes
      "......01ffff",
      ".....0111111",
      "....01111111",
      "...011111111",
      "..0111111111",
      ".01111111114", // the crown he took off somebody
      ".01111111111",
      ".01111111111",
      "..011111111f",
      "..0111111111",
      "...01111111f",
      "...011111111",
      "....0111111f",
      "....01111111",
      ".....0111111",
      ".....0000000",
    ],
  },

  archivist: {
    w: 24, h: 24,
    half: [
      "............",
      "............",
      "........0000",
      ".......07777",
      "......077777",
      "......077bbb", // the mask is all lens
      "......077bbb",
      "......077777",
      ".....0777777",
      "....07777777",
      "...077777777",
      "..0777777777",
      ".07777777777",
      "07777777cccc", // a book chained open at its chest
      "077777770cc0",
      "07777777cccc",
      "0777777bbbbb",
      ".077777bbbbb",
      ".0777777bbbb",
      "..07777777bb",
      "..077777777b",
      "...07777777b",
      "...077777777",
      "....00000000",
    ],
  },
};

/* Card icons are their own little 12x12 alphabet: a card is far too small on
   a phone for a full monster, but one glyph reads at a glance. */
export const ICONS = {
  sword: {
    w: 12, h: 12,
    half: [
      ".....0",
      "....0c",
      "....0c",
      "....0c",
      "....0c",
      "....0c",
      ".00eee", // crossguard
      "....04",
      "....04",
      "....04",
      "...044", // pommel
      ".....0",
    ],
  },
  shield: {
    w: 12, h: 12,
    half: [
      "......",
      ".00000",
      "0ddddd",
      "0ddddd",
      "0dd999",
      "0dd999",
      ".0d999",
      ".0d999",
      "..0999",
      "..0999",
      "...099", // tapers to a point
      "....00",
    ],
  },
  bolt: {
    w: 12, h: 12,
    rows: [
      "......00....",
      ".....04b0...",
      "....04bb0...",
      "...04bb0....",
      "...0bb0.....",
      "..0bbbb0....",
      "...00bb40...",
      ".....0bb40..",
      "......0b40..",
      ".......040..",
      ".......00...",
      "............",
    ],
  },
  flame: {
    w: 12, h: 12,
    half: [
      "......",
      "....00",
      "...032",
      "..0332",
      "..0334",
      ".03344",
      ".03344",
      "033444",
      "033444",
      "033444",
      ".03344",
      "..0000",
    ],
  },
  fang: {
    w: 12, h: 12,
    half: [
      "......",
      "..0000",
      ".05555",
      "056665",
      "056665",
      ".05665",
      "..0555",
      "...0c5",
      "...0cc",
      "....0c",
      "....0c",
      ".....0",
    ],
  },
  book: {
    w: 12, h: 12,
    half: [
      "......",
      "...000",
      "..0111",
      ".01ccc",
      "01cccc",
      "01cccc",
      "01c000",
      "01cccc",
      "01cccc",
      ".01ccc",
      "..0111",
      "...000",
    ],
  },
  chest: {
    w: 12, h: 12,
    half: [
      "......",
      "..0000",
      ".03333",
      "033333",
      "0fffff", // iron band
      "033333",
      "033333",
      "033334", // clasp, gold at the seam
      "033334",
      "033333",
      "000000",
      "......",
    ],
  },
  coin: {
    w: 12, h: 12,
    half: [
      "......",
      "..000.",
      ".03444",
      "034444",
      "034443",
      "034443",
      "034443",
      "034444",
      ".03444",
      "..000.",
      "......",
      "......",
    ],
  },
  // Steps read as steps only if they march in one direction, so no mirror.
  stairs: {
    w: 12, h: 12,
    rows: [
      "............",
      ".........000",
      ".........0dd",
      "......0000dd",
      "......0dddd0",
      "...0000dd000",
      "...0ddddd0..",
      "0000dd0000..",
      "0dddd0......",
      "0dd000......",
      "0000........",
      "............",
    ],
  },
  heart: {
    w: 12, h: 12,
    half: [
      "......",
      "..000.",
      ".02220",
      "022222",
      "023222",
      "032222",
      "032222",
      ".03222",
      ".03222",
      "..0322",
      "...032",
      "....00",
    ],
  },
};

const ALL = { ...SPRITES, ...ICONS };
const cache = new Map();

function expand(sprite) {
  if (sprite.rows) return sprite.rows;
  // Mirror each half row: "..0dd" -> "..0dd" + "dd0.."
  return sprite.half.map((row) => row + [...row].reverse().join(""));
}

/* Draws at native pixel size. Callers scale it up with CSS plus
   image-rendering: pixelated, which keeps the edges hard on a retina screen -
   scaling during the draw would just bake in interpolation. */
export function spriteCanvas(key) {
  const sprite = ALL[key];
  if (!sprite) throw new Error(`unknown sprite: ${key}`);

  // Copy the cached master by drawing it: cloneNode() would hand back an
  // element of the right size with an empty bitmap, because canvas contents
  // don't clone with the node.
  const canvas = document.createElement("canvas");
  canvas.width = sprite.w;
  canvas.height = sprite.h;
  canvas.className = "sprite";
  const ctx = canvas.getContext("2d");
  if (cache.has(key)) {
    ctx.drawImage(cache.get(key), 0, 0);
    return canvas;
  }

  const image = ctx.createImageData(sprite.w, sprite.h);
  const rows = expand(sprite);
  for (let y = 0; y < sprite.h; y++) {
    const row = rows[y] || "";
    for (let x = 0; x < sprite.w; x++) {
      const hex = PALETTE[row[x]];
      if (!hex) continue; // '.' and anything unmapped stays transparent
      const at = (y * sprite.w + x) * 4;
      image.data[at] = parseInt(hex.slice(1, 3), 16);
      image.data[at + 1] = parseInt(hex.slice(3, 5), 16);
      image.data[at + 2] = parseInt(hex.slice(5, 7), 16);
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  cache.set(key, canvas);
  return canvas;
}

/* Row-length and palette check for the hand-authored art. A miscounted row
   would otherwise show up as a silently clipped sprite. Pure, and free of
   any DOM access, so tools/check-sprites.mjs can run it in Node. */
export function validateSprites() {
  const problems = [];
  for (const [key, sprite] of Object.entries(ALL)) {
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
