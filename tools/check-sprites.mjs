/* Validates Deckdelve's hand-authored pixel art and prints it to the terminal.

       node tools/check-sprites.mjs          # just the row/palette check
       node tools/check-sprites.mjs --show   # also draw every sprite as text

   A miscounted row silently clips a sprite in the browser, which is a
   miserable thing to debug from a screenshot, so the check runs in Node
   against the same data the game loads.

   Not part of serving the site - nothing under games/ imports it. */

import { ICONS, PALETTE, SPRITES, validateSprites } from "../games/deckdelve/sprites.js";

const problems = validateSprites();
if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const all = { ...SPRITES, ...ICONS };
console.log(`${Object.keys(all).length} sprites, all rows and palette characters check out`);

if (process.argv.includes("--show")) {
  // 24-bit terminal colour, two spaces per pixel so they come out square.
  const block = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `\x1b[48;2;${r};${g};${b}m  \x1b[0m`;
  };
  for (const [key, sprite] of Object.entries(all)) {
    const rows = sprite.rows || sprite.half.map((r) => r + [...r].reverse().join(""));
    console.log(`\n${key} (${sprite.w}x${sprite.h})`);
    for (const row of rows) {
      console.log([...row].map((ch) => (PALETTE[ch] ? block(PALETTE[ch]) : "  ")).join(""));
    }
  }
}
