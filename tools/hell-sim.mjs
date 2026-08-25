/* Balance simulator for Petalstorm.

   The bullet-hell engine is DOM-free and takes its rng from outside, so a
   whole four-stage run - every wave, every boss phase, a few thousand bullets
   - plays out in Node in a fraction of a second. A curtain that is fair at 60
   units per second is unsurvivable at 80, and neither number looks different
   on paper, so nothing here gets tuned by eye.

       node tools/hell-sim.mjs                # three thumbs, 60 runs each
       node tools/hell-sim.mjs --runs 200     # more samples, same report
       node tools/hell-sim.mjs --detail       # per-stage table for one run
       node tools/hell-sim.mjs --skill ok     # only one skill level

   What good output looks like, and what these numbers currently say:

     a sharp player clears all four stages most of the time, losing a life or
     two on the way; an average one dies out around stage 3; a clumsy one
     rarely leaves stage 2. Stages run 70-110s including the boss, so a full
     clear is six or seven minutes. Peak bullets stay under ~200, which is
     what the phone has to draw at 60fps.

   The bot dodges by sampling positions around itself and picking the one the
   fewest bullets are about to arrive at. It is not a great player - it has no
   plan, only a next step - so treat its clear rate as a floor, not a target.

   Not part of serving the site - nothing under games/ imports it. */

import { FIELD, TUNING, STAGES, DIFFS, fmtScore } from "../games/petalstorm/data.js";
import * as engine from "../games/petalstorm/engine.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Three thumbs. `look` is how far ahead the bot reads a bullet, `lag` how
   often it changes its mind, `jitter` how badly it aims at the gap. */
const SKILLS = {
  sharp: { look: 0.75, lag: 0.05, jitter: 2, bombAt: 3.2 },
  ok: { look: 0.5, lag: 0.1, jitter: 7, bombAt: 2.2 },
  clumsy: { look: 0.32, lag: 0.19, jitter: 14, bombAt: 1.3 },
};

/* How unpleasant a spot is: every bullet that is about to arrive there counts
   against it, sooner and closer counting for more. */
function danger(run, x, y, look) {
  let total = 0;
  for (const b of run.bullets) {
    const dx = b.x - x;
    const dy = b.y - y;
    if (Math.abs(dx) > 90 || Math.abs(dy) > 90) continue;
    for (let t = 0.08; t <= look; t += 0.12) {
      const d = Math.hypot(dx + b.vx * t, dy + b.vy * t);
      const near = b.r + TUNING.hitR + 9;
      if (d < near) total += ((near - d) / near) * (1 - t / look) * 3;
    }
  }
  for (const e of run.enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < e.r + 10) total += 4;
  }
  if (run.boss && !run.boss.entering) {
    const d = Math.hypot(run.boss.x - x, run.boss.y - y);
    if (d < run.boss.r + 12) total += 6;
  }
  // Corners and the top of the field are where runs end.
  total += Math.max(0, 30 - x) * 0.05 + Math.max(0, x - (FIELD.w - 30)) * 0.05;
  total += Math.max(0, 140 - y) * 0.02;
  return total;
}

function playRun(skill, seed, onStage, diff = "pilot", tally = null) {
  const rng = mulberry(seed);
  const s = SKILLS[skill];
  const run = engine.newRun(0, diff);
  let target = { x: run.player.x, y: run.player.y };
  let think = 0;
  let bomb = false;
  let guard = 0;

  while (run.phase !== "over" && run.phase !== "won" && guard++ < 60 * 60 * 12) {
    think -= engine.STEP;
    if (think <= 0) {
      think = s.lag;
      const p = run.player;
      const here = danger(run, p.x, p.y, s.look);
      let best = { x: p.x, y: p.y, cost: here };
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        for (const step of [14, 30]) {
          const x = Math.max(8, Math.min(FIELD.w - 8, p.x + Math.cos(a) * step));
          const y = Math.max(60, Math.min(FIELD.h - 10, p.y + Math.sin(a) * step));
          let cost = danger(run, x, y, s.look) + step * 0.005;
          // A little pull toward whatever it is shooting at, and toward loose
          // pickups: a bot that only dodges never kills the boss.
          const aimAt = run.boss && !run.boss.entering ? run.boss : run.enemies[0];
          if (aimAt) cost += Math.abs(aimAt.x - x) * 0.03;
          for (const pick of run.pickups) cost += Math.hypot(pick.x - x, pick.y - y) * 0.004;
          if (cost < best.cost) best = { x, y, cost };
        }
      }
      target = {
        x: best.x + (rng() - 0.5) * s.jitter,
        y: best.y + (rng() - 0.5) * s.jitter,
      };
      bomb = here > s.bombAt && run.bloom >= TUNING.bloomFull;
    }

    const before = run.stage;
    const where = `${run.stage + 1}:${run.phase}`;
    engine.step(run, { tx: target.x, ty: target.y, bloom: bomb }, rng, engine.STEP);
    bomb = false;
    if (onStage && run.stage !== before) onStage(run, before);
    for (const event of engine.drainEvents(run)) {
      if (!tally) continue;
      if (event.type !== "die") continue;
      tally.deaths[where] = (tally.deaths[where] || 0) + 1;
      if (run.phase === "wave") {
        const wave = `stage ${run.stage + 1} wave ${run.waveAt}`;
        tally.waves[wave] = (tally.waves[wave] || 0) + 1;
      }
    }
    if (tally) tally.time[where] = (tally.time[where] || 0) + engine.STEP;
  }
  return run;
}

const runs = Number(flag("runs", 60));
const only = flag("skill", null);

/* Which stage, and which half of it, is actually ending runs. A stage that
   kills more in its waves than in its boss is a stage with a pacing problem. */
if (args.includes("--where")) {
  const skill = only || "ok";
  const diff = flag("diff", "pilot");
  const tally = { deaths: {}, time: {}, waves: {} };
  for (let i = 0; i < runs; i++) playRun(skill, 1000 + i * 7919, null, diff, tally);
  console.log(`Where ${runs} ${skill} runs on ${diff} spend their time and their ships:\n`);
  console.log("  stage:phase        seconds each run   deaths each run");
  for (const key of Object.keys(tally.time)) {
    console.log(
      `  ${key.padEnd(20)} ${(tally.time[key] / runs).toFixed(1).padStart(10)}   ` +
        `${((tally.deaths[key] || 0) / runs).toFixed(2).padStart(14)}`
    );
  }
  const worst = Object.entries(tally.waves).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log("\n  deadliest waves (deaths each run)");
  for (const [wave, n] of worst) console.log(`  ${wave.padEnd(20)} ${(n / runs).toFixed(2)}`);
  process.exit(0);
}

if (args.includes("--detail")) {
  const skill = only || "ok";
  console.log(`One ${skill} run, stage by stage:\n`);
  let last = 0;
  const run = playRun(skill, 12345, (r, before) => {
    console.log(
      `  stage ${before + 1} ${STAGES[before].name.padEnd(11)} ` +
        `${(r.time - last).toFixed(0).padStart(3)}s   lives left ${r.lives}   score ${fmtScore(r.score)}`
    );
    last = r.time;
  });
  console.log(
    `  stage ${run.stage + 1} ${STAGES[run.stage].name.padEnd(11)} ` +
      `${(run.time - last).toFixed(0).padStart(3)}s   ended: ${run.phase}   score ${fmtScore(run.score)}`
  );
  console.log(
    `\n  deaths ${run.stats.deaths}   blooms ${run.stats.blooms}   grazes ${run.stats.grazes}   peak bullets ${run.stats.peakBullets}`
  );
  process.exit(0);
}

const diffOnly = flag("diff", null);

console.log(`Petalstorm - ${runs} runs per skill level per difficulty\n`);
console.log("  skill    on        cleared   reached      time   deaths  blooms  grazes   peak   score");

for (const skill of Object.keys(SKILLS)) {
  if (only && skill !== only) continue;
  for (const diff of Object.keys(DIFFS)) {
  if (diffOnly && diff !== diffOnly) continue;
  const stats = { won: 0, stage: 0, time: 0, deaths: 0, blooms: 0, grazes: 0, peak: 0, score: 0 };
  const ends = new Array(STAGES.length).fill(0);
  for (let i = 0; i < runs; i++) {
    const run = playRun(skill, 1000 + i * 7919, null, diff);
    if (run.phase === "won") stats.won++;
    stats.stage += run.stage + 1;
    stats.time += run.time;
    stats.deaths += run.stats.deaths;
    stats.blooms += run.stats.blooms;
    stats.grazes += run.stats.grazes;
    stats.peak = Math.max(stats.peak, run.stats.peakBullets);
    stats.score += engine.scoreOf(run);
    ends[run.stage]++;
  }
  const avg = (n) => n / runs;
  console.log(
    `  ${skill.padEnd(8)} ${diff.padEnd(7)} ${((stats.won / runs) * 100).toFixed(0).padStart(6)}%  ` +
      `${avg(stats.stage).toFixed(1).padStart(6)}  ${avg(stats.time).toFixed(0).padStart(6)}s  ` +
      `${avg(stats.deaths).toFixed(1).padStart(6)}  ${avg(stats.blooms).toFixed(1).padStart(6)}  ` +
      `${avg(stats.grazes).toFixed(0).padStart(6)}  ${String(stats.peak).padStart(5)}  ${fmtScore(avg(stats.score)).padStart(7)}`
  );
  console.log(`                   ended on stage: ${ends.map((n, i) => `${i + 1}:${((n / runs) * 100).toFixed(0)}%`).join("  ")}`);
  }
}
