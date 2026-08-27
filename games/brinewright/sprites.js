/* Pixel art for Brinewright, on the same Sweetie-16 ramp the other games in
   this repo use, so the whole shelf reads as one piece of hardware.

   Two kinds of thing live here. The vessels are seen straight on and are
   symmetric, so they are authored as an 8-wide left half and mirrored - half
   the typing, and a jar that cannot come out lopsided. The cultures are
   creatures and are authored as full 16-wide rows, because a budding yeast
   and a chain of rods only read as different organisms if they are allowed to
   be asymmetric.

   Everything is drawn at its native 16x16 and scaled by CSS with
   image-rendering: pixelated, so a sprite is never resampled during the draw. */

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
  // --- vessels, mirrored halves -------------------------------------------

  jar: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "...0eeee",
      "...0eeee",
      "..0ddddd",
      "..0d4444",
      "..0d4444",
      "..0d4544",
      "..0d5444",
      "..0d4444",
      "..0d4454",
      "..0d4444",
      "..0d4444",
      "..0ddddd",
      "...00000",
      "........",
    ],
  },

  crock: {
    w: 16, h: 16,
    half: [
      "........",
      "...0000e",
      "..0eeeee",
      ".0e55555",
      ".0e55655",
      ".0efffff",
      ".0efffff",
      ".0effeff",
      ".0efffff",
      ".0efffff",
      ".0effeff",
      ".0efffff",
      ".0efffff",
      "..0eeeee",
      "..000000",
      "........",
    ],
  },

  carboy: {
    w: 16, h: 16,
    half: [
      "....0b..",
      "....0b..",
      "...0bb..",
      "....0a..",
      "...0aaa.",
      "..0aaaaa",
      ".0aa3333",
      "0a333333",
      "0a333333",
      "0a333333",
      "0a333333",
      "0a333333",
      ".0a33333",
      "..0aaaaa",
      "...00000",
      "........",
    ],
  },

  barrel: {
    w: 16, h: 16,
    half: [
      "........",
      "..000000",
      ".0333333",
      "0eeeeeee",
      "03333333",
      "03133133",
      "03133133",
      "0eeeeeee",
      "03133133",
      "03133133",
      "03133133",
      "0eeeeeee",
      ".0333333",
      "..000000",
      "........",
      "........",
    ],
  },

  tray: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "........",
      "..000000",
      ".0cccccc",
      ".0c5cccc",
      ".0ccc5cc",
      ".0c5cc5c",
      ".0cccccc",
      ".0333333",
      ".0311133",
      ".0333333",
      "..000000",
      "........",
      "........",
      "........",
    ],
  },

  tank: {
    w: 16, h: 16,
    half: [
      "..000000",
      ".0eeeeee",
      "0edddddd",
      "0ed11111",
      "0ed11111",
      "0ed11111",
      "0eddddd1",
      "0ed11111",
      "0ed11111",
      "0ed11111",
      "0ed11111",
      "0eddddd1",
      "0ed11111",
      "0eeeeeee",
      ".0000000",
      "..0ee...",
    ],
  },

  // --- cultures, full rows ------------------------------------------------

  // Rod-shaped bacilli in a short chain, which is what Lactobacillus looks
  // like down a microscope and nothing else here does.
  lacto: {
    w: 16, h: 16,
    rows: [
      "................",
      ".000000.........",
      ".055550.........",
      ".055550.........",
      ".055550.........",
      ".055550.........",
      ".055550.........",
      ".000000..000000.",
      ".........055550.",
      ".........055550.",
      ".........055550.",
      ".........055550.",
      ".........055550.",
      ".........055550.",
      ".........000000.",
      "................",
    ],
  },

  // A round cell with a bud coming off it: the one shape everybody recognises
  // as yeast.
  sacch: {
    w: 16, h: 16,
    rows: [
      "................",
      "......0000......",
      "....00cccc00....",
      "...0cccccccc0...",
      "...0cccccccc0...",
      "..0cccccccccc0..",
      "..0cccc44cccc0..",
      "..0cccc44cccc0..",
      "..0cccccccccc0..",
      "...0cccccccc0...",
      "...0cccccccc0.00",
      "....00cccc00.0c0",
      ".....000000.0cc0",
      "...........0cc0.",
      "............00..",
      "................",
    ],
  },

  // Rods again, but sitting on the pellicle raft they build on the surface -
  // the mat is the tell.
  aceto: {
    w: 16, h: 16,
    rows: [
      "................",
      "..000......000..",
      ".0eee0....0eee0.",
      ".0eee0....0eee0.",
      ".0eee0....0eee0.",
      "..000......000..",
      "................",
      ".....000........",
      "....0eee0.......",
      "....0eee0.......",
      "....0eee0.......",
      ".....000........",
      "................",
      "0333333333333330",
      "0333333333333330",
      "................",
    ],
  },

  // A conidial head on a stalk: a mould, not a single cell, which is exactly
  // the point of the one culture that eats grain whole.
  koji: {
    w: 16, h: 16,
    rows: [
      "................",
      ".....0000.......",
      "....055550......",
      "...05555550.....",
      "...05555550.....",
      "....055550......",
      ".....0550.......",
      "......00........",
      "......cc........",
      "......cc........",
      "......cc........",
      "......cc........",
      "......cc........",
      "....00cc00......",
      "...01111110.....",
      "................",
    ],
  },

  // Brettanomyces is famously ogival - pointed at one end - and slower and
  // stranger than its domesticated cousin, so it gets the odd silhouette.
  brett: {
    w: 16, h: 16,
    rows: [
      "................",
      "..........00....",
      ".........0110...",
      "........011110..",
      ".......0111110..",
      "......01111110..",
      ".....011111110..",
      "....0111111110..",
      "....0111c11110..",
      "....01111c1110..",
      ".....011111110..",
      "......0111110...",
      ".......01110....",
      "........000.....",
      "................",
      "................",
    ],
  },

  // Whatever got in. Deliberately shapeless: a fuzzy irregular colony with no
  // structure worth naming.
  wild: {
    w: 16, h: 16,
    rows: [
      "................",
      "....00....00....",
      "...0221022220...",
      "..02222222220...",
      ".0222122222220..",
      ".0222222212220..",
      "02221222222220..",
      "0222222122222220",
      "0222222212222220",
      ".0222122222220..",
      ".0222222122220..",
      "..02212222220...",
      "...022222220....",
      "....00....00....",
      "................",
      "................",
    ],
  },
};

/* Left half plus its mirror, or the full rows as authored. */
function expand(sprite) {
  if (sprite.rows) return sprite.rows;
  return sprite.half.map((row) => row + [...row].reverse().join(""));
}

const cache = new Map();

function paint(key) {
  const sprite = SPRITES[key];
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
      image.data[at] = parseInt(hex.slice(1, 3), 16);
      image.data[at + 1] = parseInt(hex.slice(3, 5), 16);
      image.data[at + 2] = parseInt(hex.slice(5, 7), 16);
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/* A fresh canvas holding a copy of the cached master. It is drawn with
   drawImage rather than cloned, because cloneNode() hands back an element of
   the right size with an empty bitmap - a canvas's contents do not clone. */
export function spriteCanvas(key) {
  const sprite = SPRITES[key];
  if (!sprite) throw new Error(`unknown sprite: ${key}`);
  if (!cache.has(key)) cache.set(key, paint(key));
  const canvas = document.createElement("canvas");
  canvas.width = sprite.w;
  canvas.height = sprite.h;
  canvas.className = "sprite";
  canvas.getContext("2d").drawImage(cache.get(key), 0, 0);
  return canvas;
}

/* Row-length and palette check for the hand-authored art. A miscounted row
   silently clips a sprite in the browser, which is a miserable thing to debug
   from a screenshot, so the check runs in Node against the same data the game
   loads. Pure and DOM-free on purpose. */
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
