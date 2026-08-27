/* The floor you walk.

   A floor is a small grid in the fog. Stepping onto a tile lights the ring
   around it, so you always see what is next to you before you commit to it -
   and the stairs down are underneath the floor's keeper, so the run's real
   decision is how much of the grid you clear before you go and fight it.

   Tiles are finite. That is the only thing stopping you from grinding: there
   is exactly this much XP on this floor. No DOM in here either. */

import { ELITE, FLOORS } from "./data.js";

export const TILES = {
  floor: { label: "Empty", desc: "Bare stone." },
  wall: { label: "Rubble", desc: "No way through." },
  foe: { label: "Monster", desc: "It has not noticed you yet." },
  elite: { label: "Dire monster", desc: "Bigger, meaner, worth more." },
  boss: { label: "Keeper", desc: "It is sitting on the stairs down." },
  chest: { label: "Chest", desc: "Gold, or something better." },
  shop: { label: "Pedlar", desc: "Cards and cures, for coin." },
  altar: { label: "Altar", desc: "Burn a card, or temper one." },
  fire: { label: "Campfire", desc: "Somewhere to bleed less." },
  stairs: { label: "Stairs down", desc: "The way on." },
};

const inBounds = (floor, x, y) => x >= 0 && y >= 0 && x < floor.size && y < floor.size;
export const tileAt = (floor, x, y) => (inBounds(floor, x, y) ? floor.tiles[y][x] : null);
export const heroTile = (floor) => tileAt(floor, floor.x, floor.y);

function neighbours(floor, x, y, diagonal = true) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!diagonal && dx && dy) continue;
      if (inBounds(floor, x + dx, y + dy)) out.push(floor.tiles[y + dy][x + dx]);
    }
  }
  return out;
}

/* Every content tile has to be walkable-to, or a floor can hide its own
   stairs behind a wall of rubble. */
function reachable(floor, fromX, fromY) {
  const seen = new Set([`${fromX},${fromY}`]);
  const queue = [[fromX, fromY]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const tile of neighbours(floor, x, y, false)) {
      const key = `${tile.x},${tile.y}`;
      if (seen.has(key) || tile.type === "wall") continue;
      seen.add(key);
      queue.push([tile.x, tile.y]);
    }
  }
  return seen;
}

export function makeFloor(index, rng = Math.random, { scouted = false } = {}) {
  const plan = FLOORS[index];
  for (let attempt = 0; attempt < 40; attempt++) {
    const floor = layout(index, plan, rng);
    const seen = reachable(floor, floor.x, floor.y);
    const blocked = floor.tiles.flat().some((t) => t.type !== "wall" && t.type !== "floor" && !seen.has(`${t.x},${t.y}`));
    if (blocked) continue;
    if (scouted) for (const tile of floor.tiles.flat()) tile.known = true;
    else reveal(floor, floor.x, floor.y);
    return floor;
  }
  throw new Error("could not lay out a floor"); // 40 tries of pure floor plans
}

function layout(index, plan, rng) {
  const size = plan.size;
  const tiles = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) row.push({ x, y, type: "floor", known: false, content: null });
    tiles.push(row);
  }
  const floor = { index, name: plan.name, size, tiles, x: 0, y: 0, cleared: 0 };

  // Start on an edge; put the keeper as far from it as the grid allows.
  const edge = [];
  for (let i = 0; i < size; i++) edge.push([i, 0], [i, size - 1], [0, i], [size - 1, i]);
  const [sx, sy] = edge[Math.floor(rng() * edge.length)];
  floor.x = sx;
  floor.y = sy;

  const spots = tiles.flat().filter((t) => t.x !== sx || t.y !== sy);
  const far = spots.slice().sort((a, b) =>
    (Math.abs(b.x - sx) + Math.abs(b.y - sy)) - (Math.abs(a.x - sx) + Math.abs(a.y - sy)));
  const boss = far[Math.floor(rng() * Math.min(3, far.length))];
  boss.type = "boss";
  boss.content = { foe: plan.boss };

  const open = () => {
    const free = spots.filter((t) => t.type === "floor");
    return free.length ? free[Math.floor(rng() * free.length)] : null;
  };

  for (const key of plan.foes) {
    const tile = open();
    if (!tile) break;
    tile.type = "foe";
    tile.content = { foe: key };
  }
  for (const key of plan.elites) {
    const tile = open();
    if (!tile) break;
    tile.type = "elite";
    tile.content = { foe: key, elite: true };
  }
  for (const [type, count] of [["chest", plan.chests], ["shop", plan.shops], ["altar", plan.altars], ["fire", plan.fires]]) {
    for (let i = 0; i < count; i++) {
      const tile = open();
      if (!tile) break;
      tile.type = type;
    }
  }
  for (let i = 0; i < plan.walls; i++) {
    const tile = open();
    if (!tile) break;
    tile.type = "wall";
  }
  return floor;
}

export function reveal(floor, x, y) {
  const here = tileAt(floor, x, y);
  if (here) here.known = true;
  for (const tile of neighbours(floor, x, y)) tile.known = true;
}

export const isWalkable = (tile) => tile && tile.type !== "wall";

/* Adjacent, known, and not rubble - the only places a tap can take you. */
export function canStep(floor, tile) {
  if (!tile || !tile.known || tile.type === "wall") return false;
  const dx = Math.abs(tile.x - floor.x);
  const dy = Math.abs(tile.y - floor.y);
  return dx + dy === 1;
}

export function step(floor, tile) {
  floor.x = tile.x;
  floor.y = tile.y;
  reveal(floor, tile.x, tile.y);
  return tile;
}

/* A tile is used up once you have dealt with it. */
export function clearTile(floor, tile) {
  if (tile.type === "boss") {
    tile.type = "stairs";
    tile.content = null;
    return;
  }
  tile.type = "floor";
  tile.content = null;
  floor.cleared += 1;
}

export function foeFor(tile, rng = Math.random) {
  if (!tile.content?.foe) return null;
  return { key: tile.content.foe, elite: !!tile.content.elite, scale: ELITE, rng };
}

/* What is left on this floor, for the map header - the count is the whole
   pressure: every monster you skip is XP the next floor assumes you have. */
export function remaining(floor) {
  const flat = floor.tiles.flat();
  return {
    foes: flat.filter((t) => t.type === "foe" || t.type === "elite").length,
    rooms: flat.filter((t) => ["chest", "shop", "altar", "fire"].includes(t.type)).length,
    unknown: flat.filter((t) => !t.known).length,
  };
}
