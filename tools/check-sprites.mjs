/* Validates the hand-authored pixel art in every game that has some, and
   prints it to the terminal.

       node tools/check-sprites.mjs                 # just the row/palette check
       node tools/check-sprites.mjs --show          # also draw every sprite
       node tools/check-sprites.mjs --show petalstorm   # only one game

   A miscounted row silently clips a sprite in the browser, which is a
   miserable thing to debug from a screenshot, so the check runs in Node
   against the same data the game loads.

   Not part of serving the site - nothing under games/ imports it. */

import * as brinewright from "../games/brinewright/sprites.js";
import * as deckdelve from "../games/deckdelve/sprites.js";
import * as petalstorm from "../games/petalstorm/sprites.js";
import * as stickclimb from "../games/stickclimb/sprites.js";

const GAMES = { brinewright, deckdelve, petalstorm, stickclimb };

const args = process.argv.slice(2);
const show = args.includes("--show");
const only = args.filter((a) => !a.startsWith("--"));

let failed = false;

for (const [name, mod] of Object.entries(GAMES)) {
  if (only.length && !only.includes(name)) continue;

  const problems = mod.validateSprites();
  const all = { ...mod.SPRITES, ...(mod.ICONS || {}) };

  if (problems.length) {
    failed = true;
    console.error(`${name}: ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    continue;
  }
  console.log(`${name}: ${Object.keys(all).length} sprites, all rows and palette characters check out`);

  if (!show) continue;
  // 24-bit terminal colour, two spaces per pixel so they come out square.
  const block = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `\x1b[48;2;${r};${g};${b}m  \x1b[0m`;
  };
  for (const [key, sprite] of Object.entries(all)) {
    const rows = sprite.rows || sprite.half.map((r) => r + [...r].reverse().join(""));
    console.log(`\n${name}/${key} (${sprite.w}x${sprite.h})`);
    for (const row of rows) {
      console.log([...row].map((ch) => (mod.PALETTE[ch] ? block(mod.PALETTE[ch]) : "  ")).join(""));
    }
  }
}

if (failed) process.exit(1);
