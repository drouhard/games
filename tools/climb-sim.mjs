/* Balance simulator for Stickclimb.

   The fight engine is deliberately DOM-free, so a whole incremental career -
   hundreds of fights, every purchase, several ascensions - can be played out
   in Node in a second. Tuning an exponential ladder by eye does not work: the
   first pass of these numbers stalled every player dead at rung 7, and that
   is invisible from playing the first two.

   Run it after touching anything in data.js or engine.js:

       node tools/climb-sim.mjs             # three skill levels, 40 careers
       node tools/climb-sim.mjs --runs 200  # more samples, same report
       node tools/climb-sim.mjs --detail    # per-rung table for one career
       node tools/climb-sim.mjs --meta      # what each Ascend was worth

   What good output looks like, and what these numbers currently say:

     rung 1 inside 10s, rung 8 in 3-10 min depending on the thumb
     first Ascend around 5-16 min, five or so ascensions in three hours
     rung 55-63 after three hours, sharp thumbs 6 rungs ahead of sloppy ones
     fights 7-30s early, 30-50s on a frontier rung you are only just ready for
     idle gap near 1, so the rung below your best can be farmed hands-off

   The failure modes it exists to catch are both invisible from playing: an
   income multiplier that compounds faster than costs (the climb never walls,
   careers run to rung 500), and a prestige currency that multiplies damage
   and scrap at once (each Ascend doubles your reach instead of adding to it).

   Not part of serving the site - nothing under games/ imports it. */

import { TUNING, UPGRADES, costOf, stats, foeAt, relicsFor, newSave, fmt, fmtTime } from "../games/stickclimb/data.js";
import * as engine from "../games/stickclimb/engine.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};

/* A deterministic RNG so a surprising career can be replayed. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A plausible player: taps Strike off cooldown, keeps Focus running, dumps
   momentum into Heavy, and dodges late - `slop` is the chance of reading a
   hazard wrong, which is what separates a good thumb from a tired one. */
function playFight(save, index, rng, slop, limit = 600) {
  const fight = engine.startFight(save, index);
  const st = stats(save);
  let ruling = null; // a decision already made about the nearest hazard

  while (!fight.over && fight.time < limit) {
    engine.input(fight, save, "focus");
    if (fight.momentum >= 3) engine.input(fight, save, "heavy");
    engine.input(fight, save, "strike");

    const near = fight.hazards.reduce((a, h) => (a && a.p > h.p ? a : h), null);
    if (!near) ruling = null;
    if (near && ruling !== near) {
      ruling = near;
      // Read it now, act on it later: a wrong read stays wrong.
      near.read = rng() < slop ? (near.kind === "low" ? "high" : "low") : near.kind;
      near.panic = rng() < slop * 0.5; // ... or freeze entirely
    }
    if (near && !near.panic && fight.stance === "idle") {
      const want = near.read === "low" ? "jump" : "slide";
      const window = near.read === "low" ? st.airTime : st.slideTime;
      const remaining = (1 - near.p) * fight.foe.travel;
      if (remaining <= window * 0.6) engine.input(fight, save, want);
    }

    engine.step(fight, save, rng);
    engine.drainEvents(fight);
  }
  return fight;
}

/* Cheapest-first, which is what a player without a spreadsheet does. */
function shop(save) {
  let bought = 0;
  for (;;) {
    const best = UPGRADES
      .map((u) => ({ id: u.id, cost: costOf(u.id, save.levels[u.id]) }))
      .filter((o) => isFinite(o.cost) && o.cost <= save.scrap)
      .sort((a, b) => a.cost - b.cost)[0];
    if (!best) return bought;
    save.scrap -= best.cost;
    save.levels[best.id] += 1;
    bought += 1;
  }
}

function career(seed, slop, budget = 3 * 3600) {
  const rng = mulberry(seed);
  const save = newSave();
  const log = [];
  let clock = 0;
  let stubborn = 0; // losses in a row at the frontier
  let deaths = 0;
  let ascends = [];

  while (clock < budget) {
    // Push the frontier, but fall back to farming after a few faceplants -
    // exactly the "go grind the last one for a bit" move a player makes.
    const frontier = save.best + 1;
    const index = stubborn >= 3 && save.best >= 0 ? save.best : frontier;
    save.target = index;

    const fight = playFight(save, index, rng, slop);
    clock += fight.time + TUNING.roundGap;

    if (fight.over === "won") {
      const { firstClear } = engine.resolveWin(save, index);
      if (firstClear) {
        log.push({ rung: index, at: clock, fight: fight.time, deaths, dodged: fight.dodged });
        stubborn = 0;
      } else if (stubborn >= 3) {
        stubborn = save.scrap > costOf("power", save.levels.power) ? 0 : stubborn;
      }
    } else {
      deaths += 1;
      if (index === frontier) stubborn += 1;
      clock += 1.5; // the beat before you tap Retry
    }
    shop(save);

    const relics = relicsFor(save.best);
    if (relics >= Math.max(1, save.relics * 1.6) && save.best + 1 > TUNING.ascendAt) {
      ascends.push({ at: clock, rung: save.best, relics });
      const kept = { relics: save.relics + relics, ascends: save.ascends + 1, kills: save.kills };
      Object.assign(save, newSave(), kept);
      stubborn = 0;
    }
  }

  return { save, log, deaths, ascends, clock };
}

/* Can a player who ignores the fight entirely farm an old rung forever? That
   is what makes the game idle rather than a chore, so it gets measured. */
function idleGap(save) {
  const st = stats(save);
  const regen = st.maxHp * st.regen;
  for (let back = 0; back <= save.best; back++) {
    const foe = foeAt(save.best - back);
    const incoming = foe.hit / foe.period; // never dodging a single hazard
    if (incoming < regen) return back;
  }
  return null;
}

const runs = flag("runs", 40);
const detail = args.includes("--detail");

console.log(`Stickclimb balance - ${runs} careers per skill level, 3 game-hours each\n`);

for (const [label, slop] of [["sharp", 0.05], ["average", 0.16], ["sloppy", 0.32]]) {
  const careers = [];
  for (let i = 0; i < runs; i++) careers.push(career(1000 + i, slop));

  const reached = careers.map((c) => c.save.best + 1 + c.save.ascends * 0.001);
  const rungs = careers.map((c) => c.save.best + 1);
  const deaths = careers.map((c) => c.deaths);
  const firstAscend = careers.filter((c) => c.ascends.length).map((c) => c.ascends[0].at);
  const gaps = careers.map((c) => idleGap(c.save)).filter((g) => g != null);
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  // Time to the first few rungs, averaged over careers that got there.
  const marks = [1, 3, 5, 8, 12].map((rung) => {
    const times = careers.map((c) => c.log.find((l) => l.rung === rung - 1)?.at).filter((t) => t != null);
    return times.length ? `r${rung} ${fmtTime(avg(times))}` : `r${rung} —`;
  });

  const lengths = careers.flatMap((c) => c.log.map((l) => l.fight));
  console.log(
    `${label.padEnd(8)} rungs ${med(rungs)} (min ${Math.min(...rungs)}, max ${Math.max(...rungs)})` +
      `  deaths ${avg(deaths).toFixed(1)}` +
      `  fight ${avg(lengths).toFixed(1)}s` +
      `  ascends ${avg(careers.map((c) => c.ascends.length)).toFixed(1)}` +
      `${firstAscend.length ? ` (first at ${fmtTime(avg(firstAscend))})` : ""}` +
      `  idle gap ${gaps.length ? avg(gaps).toFixed(1) : "—"} rungs`,
  );
  console.log(`         first clears: ${marks.join("  ")}`);
  void reached;
}

if (args.includes("--meta")) {
  const one = career(1000, 0.16);
  console.log(`\nOne average career's ascensions:\n`);
  console.log("  at         rung   relics won   running total");
  let total = 0;
  for (const a of one.ascends) {
    total += a.relics;
    console.log(
      `  ${fmtTime(a.at).padStart(9)}  ${String(a.rung + 1).padStart(5)}   ${String(a.relics).padStart(10)}   ${String(total).padStart(13)}`,
    );
  }
  console.log(`  ended at rung ${one.save.best + 1} with ${one.save.relics} relics`);
}

if (detail) {
  const one = career(1000, 0.16);
  console.log(`\nOne average career, rung by rung:\n`);
  console.log("rung  foe                cleared at   fight   dodges");
  for (const row of one.log) {
    const foe = foeAt(row.rung);
    console.log(
      `${String(row.rung + 1).padStart(4)}  ${foe.name.padEnd(18)} ${fmtTime(row.at).padStart(9)}` +
        `  ${row.fight.toFixed(1).padStart(6)}s  ${String(row.dodged).padStart(6)}`,
    );
  }
  const st = stats(one.save);
  console.log(
    `\nend state: ${fmt(one.save.scrap)} scrap, ${one.save.relics} relics, ` +
      `strike ${fmt(st.strike)}, twin ${fmt(st.autoDps)}/s, hp ${fmt(st.maxHp)}, ` +
      `levels ${UPGRADES.map((u) => `${u.id[0]}${one.save.levels[u.id]}`).join(" ")}`,
  );
}
