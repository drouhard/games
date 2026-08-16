/* Pixel art. Same Sweetie-16 ramp the other games in this repo use, so the
   chrome and the cast read as one piece of hardware.

   The hero is a stick figure in profile facing right, which means every pose
   is authored as full asymmetric `rows` - a mirrored half would give him two
   fronts. Foes that face you (blobs, ghosts, rocks) are authored as a `half`
   and mirrored at load; foes that face the hero are full rows too. */

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
  // --- the stick figure, facing right -------------------------------------

  heroIdle: {
    w: 16, h: 16,
    rows: [
      "................",
      "......2222......", // headband, the one bit of colour on him
      "......cccc......",
      "......cccc......",
      ".......cc.......",
      "......cccc......",
      ".....c.cc.c.....",
      ".....c.cc.c.....",
      ".....c.cc.c.....",
      ".......cc.c.....",
      "......cccc......",
      ".....cc..cc.....",
      ".....cc..cc.....",
      "....cc....cc....",
      "....cc....cc....",
      "...ccc....ccc...",
    ],
  },

  heroStrike: {
    w: 16, h: 16,
    rows: [
      "................",
      ".......2222.....",
      ".......cccc.....",
      ".......cccc.....",
      "........cc......",
      "......cccc......",
      ".....c.ccccccc..", // lead arm out straight
      "......c.cc......",
      ".......ccc......",
      "......cccc......",
      ".....cc..cc.....",
      "....cc....cc....",
      "...cc......cc...",
      "..cc.......cc...",
      "..cc.......cc...",
      ".ccc.......ccc..",
    ],
  },

  heroAir: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "......2222......",
      "......cccc......",
      "......cccc......",
      "....c..cc..c....", // arms up, knees tucked
      "....c.cccc.c....",
      ".....cccccc.....",
      "......cccc......",
      ".....cc..cc.....",
      "....cc....cc....",
      "....cc....cc....",
      ".....cc..cc.....",
      "......cccc......",
      "................",
      "................",
    ],
  },

  heroSlide: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".........2222...",
      ".........cccc...",
      ".......cccccc...",
      "....cccccccc....",
      "..cccccccc......",
      ".ccc..cc........",
      "cc..............",
      "................",
    ],
  },

  heroHurt: {
    w: 16, h: 16,
    rows: [
      "................",
      ".....2222.......",
      ".....cccc.......",
      ".....cccc.......",
      "......cc........",
      "....cccc........",
      "...c..cc..c.....",
      "..c...cc...c....",
      "......cc........",
      "......cc........",
      ".....cccc.......",
      "....cc...cc.....",
      "...cc.....cc....",
      "...cc......cc...",
      "..cc.......cc...",
      "..cc.......ccc..",
    ],
  },

  // --- the ladder ---------------------------------------------------------

  blob: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "........",
      "......00",
      "....0055",
      "..005555",
      ".0555555",
      ".0550055",
      ".0555555",
      "05555555",
      "05556666",
      "05666666",
      "06666666",
      "06666666",
      ".0666666",
      ".0000000",
    ],
  },

  flitter: {
    w: 16, h: 16,
    rows: [
      "................",
      "......0000......",
      ".....011110.....",
      "....01c11c10....",
      "....01111110....",
      "..001111111100..",
      ".01111111111110.",
      ".01111111111110.",
      "..011111111110..",
      "....01111110....",
      "......0000......",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },

  bruiser: {
    w: 16, h: 16,
    rows: [
      "................",
      "....2222........",
      "...222222.......",
      "...220222.......",
      "....2222........",
      "..222222222.....",
      ".22222222222....",
      ".22222222222....",
      "..222222222.....",
      "...2222222......",
      "...22...22......",
      "..222...222.....",
      "..222...222.....",
      ".2222...2222....",
      ".2222...2222....",
      "................",
    ],
  },

  skitter: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "..8..........8..",
      "...8........8...",
      "....88888888....",
      ".8.8888888888.8.",
      "..888888888888..",
      "..822888888888..",
      "..888888888888..",
      "...8888888888...",
      "....88888888....",
      "..8..8....8..8..",
      ".8...8....8...8.",
      "8....8....8....8",
      "................",
      "................",
    ],
  },

  wisp: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "......0b",
      "....0bbb",
      "...0bbbb",
      "..0bbbbb",
      "..0bb00b",
      "..0bbbbb",
      "..0bbaaa",
      "..0aaaaa",
      "..0aaaaa",
      "...0aaaa",
      "...0aaaa",
      "....0aaa",
      "....0.0a",
      "........",
    ],
  },

  slab: {
    w: 16, h: 16,
    half: [
      "........",
      "........",
      "....0000",
      "..00dddd",
      ".0dddddd",
      ".0dd00dd",
      ".0dddddd",
      ".0dddddd",
      ".0deeeee",
      ".0eeeeee",
      ".0eeeeee",
      ".0eeeeee",
      ".0eeeeee",
      ".00eeeee",
      "..000000",
      "........",
    ],
  },

  coil: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "..3333..........",
      ".330033.........",
      ".3333333........",
      "..333334444.....",
      ".....44444444...",
      "...444444444444.",
      "..4444....444444",
      ".4444......44444",
      ".444........4444",
      ".444........4444",
      ".4444......4444.",
      "..44444444444...",
      "....4444444.....",
      "................",
    ],
  },

  warden: {
    w: 16, h: 16,
    rows: [
      "................",
      "....0000........",
      "...099990.......",
      "...09cc90.......",
      "...099990.......",
      "..09999990......",
      ".0999aa99990....",
      ".0999aa99990....",
      ".09999999990....",
      "..099999990.....",
      "..0999..9990....",
      "..0999..9990....",
      "..0990..0990....",
      "..0990..0990....",
      ".09990..09990...",
      ".00000..00000...",
    ],
  },
};

const cache = new Map();

function expand(sprite) {
  if (sprite.rows) return sprite.rows;
  // "..0555" -> "..0555" + "5550.."
  return sprite.half.map((row) => row + [...row].reverse().join(""));
}

/* Draws at native pixel size. Callers scale it up with CSS plus
   image-rendering: pixelated, which keeps the edges hard on a retina screen -
   scaling during the draw would bake in interpolation instead. */
export function spriteCanvas(key) {
  const sprite = SPRITES[key];
  if (!sprite) throw new Error(`unknown sprite: ${key}`);

  // Copy the cached master by drawing it: cloneNode() hands back an element
  // of the right size with an empty bitmap, because canvas contents don't
  // clone with the node.
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
   would otherwise show up as a silently clipped sprite. Pure and DOM-free, so
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
