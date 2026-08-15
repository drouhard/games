/* Pixel art.

   Every sprite indexes into one shared 16-colour palette (Sweetie-16), the way
   an 8-bit console would - which is what keeps a hand-drawn cast looking like
   it belongs to the same game.

   Symmetric creatures are authored as an 8-wide (or 12-wide) `half` and
   mirrored at load. Half the typing, and they come out actually symmetric.
   Asymmetric sprites give full-width `rows` instead. */

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
  // --- heroes (16x16, drawn facing the viewer) ---------------------------

  knight: {
    w: 16,
    h: 16,
    half: [
      "........",
      ".....000",
      "....0edd",
      "....0ed0", // visor slit lands on the mirror seam
      "....0edd",
      ".....0dd",
      "...00999",
      "..09999c",
      "..09999c",
      "..099999",
      "...09999",
      "...0999f",
      "....0eef",
      "....0ee0",
      "....000.",
      "........",
    ],
  },

  mage: {
    w: 16,
    h: 16,
    half: [
      "........",
      "......00",
      ".....011",
      "....0111",
      "...01111",
      "..011111",
      "....0ddc",
      "....0d00",
      ".....0dd",
      "...00111",
      "..01111b",
      "..011111",
      "..011111",
      "..011111",
      "...00111",
      "....0000",
    ],
  },

  cleric: {
    w: 16,
    h: 16,
    half: [
      "........",
      ".....000",
      "....0ccc",
      "....0cd0",
      "....0cdd",
      ".....0cc",
      "...00444",
      "..044444",
      "..04444c", // white cross down the seam
      "..044ccc",
      "..044ccc",
      "..04444c",
      "...0444c",
      "...04444",
      "....0ee0",
      "....000.",
    ],
  },

  // --- enemies (16x16, mirrored halves) -----------------------------------

  slime: {
    w: 16,
    h: 16,
    half: [
      "........",
      "........",
      "......00",
      "....0055",
      "...05566",
      "..055666",
      ".0556666",
      ".0566666",
      ".0566cc6",
      ".0566006",
      ".0566666",
      ".0566666",
      "05666666",
      "05666666",
      "05555555",
      ".0000000",
    ],
  },

  // Beasts read far better in profile than mirrored head-on, so the rat gets
  // full asymmetric rows - ears left, tail curling off to the right.
  rat: {
    w: 16,
    h: 16,
    rows: [
      "................",
      "................",
      "................",
      "....00..........",
      "...0ee0......00.",
      "..0eeee0....0ee0",
      ".0eeeeee0..0ee0.",
      "0e2eeeeeee0ee0..",
      "0eeeeeeeeeeee0..",
      "0ddeeeeeeeeee0..",
      ".0ddeeeeeeeee0..",
      "..0eeeeeeeeee0..",
      "...0eeeeeeee0...",
      "...0e00ee00e0...",
      "...00..00..00...",
      "................",
    ],
  },

  bat: {
    w: 16,
    h: 16,
    half: [
      "........",
      "0.......",
      "00......",
      "0f0.....",
      "0ff0..00",
      "0fff0011",
      "0ffff111",
      "00fff111",
      ".0ff1121",
      "..011111",
      "...01111",
      "....0111",
      ".....011",
      "......01",
      "........",
      "........",
    ],
  },

  skeleton: {
    w: 16,
    h: 16,
    half: [
      "........",
      "....0000",
      "...0cccc",
      "...0c00c", // eye sockets
      "...0c00c",
      "...0cccc",
      "....0c0c", // teeth
      ".....0cc",
      "..0ccccc",
      ".0cc0ccc", // arms hang outside the ribcage
      ".0cc0c0c",
      ".0cc0ccc",
      "..000c0c",
      "....0cc.",
      "....0cc.",
      "....000.",
    ],
  },

  goblin: {
    w: 16,
    h: 16,
    half: [
      "........",
      "........",
      "0.......", // pointed ear, sticking out well past the head
      "00......",
      "060....0",
      "0660..06",
      "06660066",
      ".0666666",
      "..064066", // yellow eye
      "..066666",
      "..0666c6", // tusk
      "...06666",
      "..066666",
      "..0f6666",
      "..0ff660",
      "...00.0.",
    ],
  },

  wolf: {
    w: 16,
    h: 16,
    half: [
      "........",
      "........",
      "0.......",
      "00...000",
      "0f0.0fff",
      "0ff0ffff",
      "0fffffff",
      "00ffffff",
      ".0ff30ff",
      ".0ffffff",
      ".0fddfff",
      "..0fffff",
      "..0fffff",
      "..0ff0ff",
      "..0f0.0f",
      "..00...0",
    ],
  },

  orc: {
    w: 16,
    h: 16,
    half: [
      "........",
      "....0000",
      "...07777",
      "...07777",
      "...07007",
      "...07777",
      "..0077cc",
      ".0777777",
      "07777777",
      "07777777",
      "00777777",
      ".0777777",
      "..077777",
      "..0fffff",
      "..0ff0ff",
      "...00.00",
    ],
  },

  wraith: {
    w: 16,
    h: 16,
    half: [
      "........",
      "......00",
      ".....011",
      "....01ff",
      "....01ff",
      "...01fbf",
      "...01fff",
      "..01ffff",
      "..01ffff",
      ".01fffff",
      ".01fffff",
      "..01ffff",
      "...01fff",
      "....011f",
      ".....011",
      "......0.",
    ],
  },

  golem: {
    w: 16,
    h: 16,
    half: [
      "........",
      "........",
      "...00000",
      "...0eeee",
      "...0e3ee", // glowing eye
      "...0eeee",
      "0000eeee", // slab shoulders, squared off
      "0eeeeeee",
      "0eeeeeee",
      "0eee0eee", // chest seam
      "0eeeeeee",
      "0eeeeeee",
      "0000eeee",
      "...0eeee",
      "...0ee0.",
      "...000..",
    ],
  },

  // --- boss (24x24, mirrored 12-wide half) --------------------------------

  dragon: {
    w: 24,
    h: 24,
    half: [
      "............",
      "..........00",
      ".........022",
      "0........022",
      "00......0221",
      "020.....0221",
      "0220...02211",
      "02220.022111",
      "022220221111",
      "022220211111",
      "022220224111",
      "022220221111",
      ".02220221111",
      "..022221111.",
      "...02221110.",
      "....0221110.",
      "....0221110.",
      "...02211110.",
      "...022111110",
      "...02211110.",
      "...0221110..",
      "...022110...",
      "...00110....",
      "....000.....",
    ],
  },
};

const cache = new Map();

function expand(sprite) {
  if (sprite.rows) return sprite.rows;
  // Mirror each half row: "..0ee" -> "..0ee" + "ee0.."
  return sprite.half.map((row) => row + [...row].reverse().join(""));
}

/* Draws a sprite at its native pixel size. Callers scale it up with CSS plus
   image-rendering: pixelated, which keeps edges hard on a retina screen -
   scaling here would just bake in interpolation. */
export function spriteCanvas(key) {
  const sprite = SPRITES[key];
  if (!sprite) throw new Error(`unknown sprite: ${key}`);

  // Copy the cached master by drawing it. cloneNode() would give back an
  // element of the right size with an empty bitmap - canvas contents don't
  // clone with the node.
  const canvas = document.createElement("canvas");
  canvas.width = sprite.w;
  canvas.height = sprite.h;
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

/* Length check for the hand-authored art - a miscounted row would otherwise
   show up as a silently clipped sprite. Used by the test page. */
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
