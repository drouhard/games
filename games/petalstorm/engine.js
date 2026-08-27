/* The rules. No DOM, no timers, no randomness of its own - a run is a plain
   object you push fixed 1/60s steps into, with the player's intent and an rng
   handed in from outside. That is what lets tools/hell-sim.mjs play several
   hundred complete runs in Node in a few seconds; tuning a bullet hell by eye
   does not work, because the difference between "tense" and "impossible" is a
   dozen units of bullet speed.

   Input is a target position, not a direction: the browser turns a drag into
   somewhere the ship would like to be, the simulator's bot picks the same
   thing from where the bullets aren't, and the engine is what caps how fast
   either of them can actually get there. */

import { FIELD, TUNING, POWER, BULLETS, GUNS, ENEMIES, BOSSES, STAGES, DIFFS } from "./data.js";

export const STEP = 1 / 60;

const RAD = Math.PI / 180;

export function newRun(stageIndex = 0, diff = "pilot") {
  const run = {
    diff,
    stage: stageIndex,
    stageT: 0,
    waveAt: 0,
    time: 0,
    pending: [], // craft waiting out their stagger before they fly in
    player: { x: FIELD.w / 2, y: FIELD.h - 54, power: stageIndex > 0 ? 2 : 1, iframes: 1.2 },
    lives: DIFFS[diff].lives,
    score: 0,
    bloom: 0,
    wave: null, // the expanding bloom shockwave, when one is out
    enemies: [],
    bullets: [],
    shots: [],
    pickups: [],
    boss: null,
    shotT: 0,
    extendAt: 0,
    phase: "wave", // wave | warn | boss | clear | over | won
    phaseT: 0,
    events: [],
    stats: { deaths: 0, blooms: 0, grazes: 0, kills: 0, peakBullets: 0, stageTimes: [] },
  };
  emit(run, { type: "stage", stage: stageIndex });
  return run;
}

function emit(run, event) {
  run.events.push(event);
}

export function drainEvents(run) {
  const out = run.events;
  run.events = [];
  return out;
}

export function stageOf(run) {
  return STAGES[run.stage];
}

export function diffOf(run) {
  return DIFFS[run.diff];
}

/* The banked score: the raw one is what the engine counts, the difficulty
   multiplier is what the board records. */
export function scoreOf(run) {
  return Math.floor(run.score * DIFFS[run.diff].score);
}

export function powerOf(run) {
  return POWER[Math.min(run.player.power, POWER.length - 1)];
}

/* ---- bullet patterns ---------------------------------------------------
   Each takes the firing craft and its gun and pushes bullets. `spin` is kept
   on the craft, so a spiral keeps turning between volleys instead of
   restarting at the same angle every time. */

function addBullet(run, x, y, angle, speed, kind) {
  if (run.bullets.length >= TUNING.bulletCap) return;
  const def = BULLETS[kind];
  run.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: def.r,
    kind,
    grazed: false,
  });
}

function aimAt(src, player) {
  return Math.atan2(player.y - src.y, player.x - src.x);
}

const PATTERNS = {
  aimed(run, src, gun, speed, rng) {
    const base = aimAt(src, run.player);
    const spread = (gun.spread || 0) * RAD;
    for (let i = 0; i < gun.count; i++) {
      const t = gun.count === 1 ? 0 : i / (gun.count - 1) - 0.5;
      addBullet(run, src.x, src.y, base + t * spread, speed, gun.bullet);
    }
  },

  ring(run, src, gun, speed, rng) {
    const step = (Math.PI * 2) / gun.count;
    for (let i = 0; i < gun.count; i++) {
      addBullet(run, src.x, src.y, src.spin + i * step, speed, gun.bullet);
    }
  },

  /* Same ring, fired on a short period with a big spin between volleys, so
     the arms draw a curve instead of a series of rings - the flower the game
     is named for. */
  spiral(run, src, gun, speed, rng) {
    PATTERNS.ring(run, src, gun, speed, rng);
  },

  spray(run, src, gun, speed, rng) {
    const base = aimAt(src, run.player);
    const spread = (gun.spread || 40) * RAD;
    for (let i = 0; i < gun.count; i++) {
      addBullet(run, src.x, src.y, base + (rng() - 0.5) * spread, speed * (0.85 + rng() * 0.3), gun.bullet);
    }
  },

  /* A curtain across the field with exactly one hole in it. The hole walks
     sideways volley by volley, so the answer is to move, not to sit still. */
  wall(run, src, gun, speed, rng) {
    const width = gun.spread || 150;
    const left = Math.max(8, Math.min(FIELD.w - 8 - width, src.x - width / 2));
    const gapAt = Math.max(0, Math.min(gun.count - 1, Math.round(src.wallGap ?? Math.floor(rng() * gun.count))));
    for (let i = 0; i < gun.count; i++) {
      if (i === gapAt) continue;
      addBullet(run, left + (width / (gun.count - 1)) * i, src.y, Math.PI / 2, speed, gun.bullet);
    }
    src.wallGap = gapAt + (gun.drift || 1);
    if (src.wallGap < 0 || src.wallGap > gun.count - 1) src.wallGap = gapAt - (gun.drift || 1);
  },
};

function fire(run, src, gunKey, rng) {
  const gun = GUNS[gunKey];
  const speed = gun.speed * stageOf(run).speed * diffOf(run).speed;
  PATTERNS[gun.pattern](run, src, gun, speed, rng);
  if (gun.spin) src.spin += gun.spin * RAD;
  emit(run, { type: "enemyFire", x: src.x, y: src.y, gun: gunKey });
}

/* Runs one craft's trigger finger: the volley timer plus the stutter that
   `burst` turns a single volley into. */
function tickGun(run, src, gunKey, dt, rng) {
  // Nothing shoots before it is on screen, and nothing shoots once it has
  // dived into the player's own strip of the field: a point-blank aimed shot
  // fired from below is not a bullet anyone can dodge, it is just a tax.
  if (!gunKey || src.y < -6 || src.y > FIELD.h * 0.72) return;
  const gun = GUNS[gunKey];
  if (src.burstLeft > 0) {
    src.burstT -= dt;
    if (src.burstT <= 0) {
      src.burstLeft--;
      src.burstT = gun.burstGap || 0.12;
      fire(run, src, gunKey, rng);
    }
    return;
  }
  src.gunT -= dt;
  if (src.gunT > 0) return;
  src.gunT = gun.period * diffOf(run).period;
  fire(run, src, gunKey, rng);
  if (gun.burst > 1) {
    src.burstLeft = gun.burst - 1;
    src.burstT = gun.burstGap || 0.12;
  }
}

/* ---- craft -------------------------------------------------------------- */

function spawnCraft(run, spec) {
  const def = ENEMIES[spec.type];
  const gun = spec.gun || def.gun;
  run.enemies.push({
    kind: spec.type,
    sprite: def.sprite,
    hp: def.hp,
    maxHp: def.hp,
    r: def.r,
    score: def.score,
    drop: def.drop,
    path: def.path,
    speed: def.speed,
    amp: def.amp,
    freq: def.freq,
    stay: def.stay,
    park: spec.park ?? 60,
    x: spec.x,
    y: spec.y,
    x0: spec.x,
    vx: 0,
    vy: 0,
    t: 0,
    gun,
    gunT: GUNS[gun] ? GUNS[gun].first ?? GUNS[gun].period : 99,
    burstLeft: 0,
    burstT: 0,
    spin: 0,
    hitT: 0,
    // Lancers pick their line on the way in and commit to it, which is what
    // makes them readable: they never home once they are moving.
    aim: null,
    parked: 0,
    leaving: false,
  });
}

function moveEnemy(run, e, dt) {
  e.t += dt;
  if (e.hitT > 0) e.hitT -= dt;

  if (e.path === "dive") {
    e.y += e.speed * dt;
  } else if (e.path === "sine") {
    e.y += e.speed * dt;
    e.x = e.x0 + Math.sin(e.t * e.freq) * e.amp;
  } else if (e.path === "swoop") {
    if (!e.aim) {
      const dx = run.player.x - e.x;
      const dy = Math.max(60, run.player.y - e.y);
      const len = Math.hypot(dx, dy);
      e.aim = { x: dx / len, y: dy / len };
    }
    e.x += e.aim.x * e.speed * dt;
    e.y += e.aim.y * e.speed * dt;
  } else if (e.path === "park") {
    if (!e.leaving && e.y < e.park) {
      e.y = Math.min(e.park, e.y + e.speed * dt);
    } else if (!e.leaving) {
      e.parked += dt;
      // A gentle sway while parked, so a turret is never a stationary pixel.
      e.x = e.x0 + Math.sin(e.t * 0.9) * 10;
      if (e.parked > e.stay) e.leaving = true;
    } else {
      e.y += e.speed * 1.4 * dt;
    }
  }

  e.x = Math.max(-30, Math.min(FIELD.w + 30, e.x));
}

function offField(e) {
  return e.y > FIELD.h + 26 || e.x < -34 || e.x > FIELD.w + 34;
}

/* ---- boss --------------------------------------------------------------- */

function spawnBoss(run, key) {
  const def = BOSSES[key];
  run.boss = {
    key,
    name: def.name,
    sprite: def.sprite,
    w: def.w,
    h: def.h,
    r: def.r,
    hp: def.hp,
    maxHp: def.hp,
    score: def.score,
    x: FIELD.w / 2,
    y: -def.h,
    x0: FIELD.w / 2,
    t: 0,
    phase: 0,
    step: 0,
    stepT: 0,
    gun: null,
    gunT: 0,
    burstLeft: 0,
    burstT: 0,
    spin: 0,
    hitT: 0,
    entering: true,
    move: def.phases[0].move,
    target: FIELD.w / 2,
  };
  emit(run, { type: "bossIn", name: def.name });
}

function bossPhaseFor(def, frac) {
  let index = 0;
  def.phases.forEach((phase, i) => {
    if (frac <= phase.at) index = i;
  });
  return index;
}

function tickBoss(run, dt, rng) {
  const boss = run.boss;
  const def = BOSSES[boss.key];
  boss.t += dt;

  if (boss.entering) {
    boss.y += 46 * dt;
    if (boss.y >= 52) {
      boss.y = 52;
      boss.entering = false;
      boss.stepT = 0;
    }
    return;
  }

  const phase = bossPhaseFor(def, boss.hp / boss.maxHp);
  if (phase !== boss.phase) {
    boss.phase = phase;
    boss.step = 0;
    boss.stepT = 0;
    boss.gun = null;
    boss.move = def.phases[phase].move;
    // A phase change wipes the screen: it reads as a beat of relief and it
    // stops the incoming pattern from being buried under the outgoing one.
    cancelBullets(run, FIELD.w * 2, boss.x, boss.y, 0.35);
    emit(run, { type: "bossPhase", phase });
  }

  const script = def.phases[phase].script;
  if (boss.stepT <= 0) {
    const entry = script[boss.step % script.length];
    boss.step++;
    boss.stepT = entry.dur;
    boss.gun = entry.gun;
    boss.gunT = GUNS[entry.gun].first ?? 0.2;
    boss.burstLeft = 0;
    emit(run, { type: "bossGun", gun: entry.gun });
  }
  boss.stepT -= dt;

  if (boss.move === "sway") {
    boss.x = FIELD.w / 2 + Math.sin(boss.t * 0.7) * (def.sway ?? 62);
    boss.y = 52 + Math.sin(boss.t * 0.45) * 8;
  } else if (boss.move === "drift") {
    if (Math.abs(boss.x - boss.target) < 3) boss.target = 40 + rng() * (FIELD.w - 80);
    boss.x += Math.sign(boss.target - boss.x) * 44 * dt;
    boss.y = 54 + Math.sin(boss.t * 0.8) * 12;
  } else if (boss.move === "charge") {
    // Slides above the player and leans in - the pressure move.
    boss.x += Math.max(-1, Math.min(1, (run.player.x - boss.x) / 40)) * 52 * dt;
    boss.x = Math.max(26, Math.min(FIELD.w - 26, boss.x));
    boss.y = 54 + Math.sin(boss.t * 1.1) * 16;
  }
  if (boss.hitT > 0) boss.hitT -= dt;

  tickGun(run, boss, boss.gun, dt, rng);
}

/* ---- player ------------------------------------------------------------- */

function firePlayer(run, dt) {
  run.shotT -= dt;
  if (run.shotT > 0) return;
  run.shotT = TUNING.shotPeriod;
  const p = run.player;
  for (const [dx, deg, dmg] of powerOf(run).bolts) {
    const angle = -Math.PI / 2 + deg * RAD;
    run.shots.push({
      x: p.x + dx,
      y: p.y - 6,
      vx: Math.cos(angle) * TUNING.shotSpeed,
      vy: Math.sin(angle) * TUNING.shotSpeed,
      dmg,
    });
  }
  emit(run, { type: "shoot" });
}

function cancelBullets(run, radius, x, y, scoreScale = 1) {
  let cancelled = 0;
  run.bullets = run.bullets.filter((b) => {
    if (Math.hypot(b.x - x, b.y - y) > radius) return true;
    cancelled++;
    return false;
  });
  if (cancelled) {
    run.score += cancelled * TUNING.bloomCancelScore * scoreScale;
    emit(run, { type: "cancel", count: cancelled });
  }
  return cancelled;
}

function dropPickup(run, x, y, kind) {
  run.pickups.push({ x, y, kind, vy: TUNING.pickupSpeed, t: 0 });
}

function killEnemy(run, e, rng) {
  run.stats.kills++;
  run.score += e.score;
  emit(run, { type: "boom", x: e.x, y: e.y, big: false });
  if (e.drop === "power") dropPickup(run, e.x, e.y, "power");
  else if (e.drop === "shard") dropPickup(run, e.x, e.y, "shard");
  else if (rng() < 0.16) dropPickup(run, e.x, e.y, rng() < 0.45 ? "power" : "shard");
  run.bloom = Math.min(TUNING.bloomFull, run.bloom + TUNING.killCharge);
}

function hitPlayer(run) {
  const p = run.player;
  if (p.iframes > 0 || run.phase === "over" || run.phase === "won") return;
  run.lives--;
  run.stats.deaths++;
  p.iframes = TUNING.invuln;
  run.bloom = 0;
  // Clear the pocket the player died in, or the respawn is a second death.
  cancelBullets(run, 78, p.x, p.y, 0);
  emit(run, { type: "die", x: p.x, y: p.y });
  if (run.lives <= 0) {
    run.phase = "over";
    run.phaseT = 0;
    emit(run, { type: "over" });
    return;
  }
  // Dying costs a power stage, and hands back the shards to earn it straight
  // back: a death that leaves you unable to kill what killed you is a spiral.
  if (p.power > 0) {
    p.power--;
    dropPickup(run, p.x - 26, Math.max(30, p.y - 90), "power");
    dropPickup(run, p.x + 26, Math.max(30, p.y - 90), "power");
  }
}

/* ---- the step ----------------------------------------------------------- */

export function step(run, input, rng, dt) {
  if (run.phase === "over" || run.phase === "won") {
    run.phaseT += dt;
    stepBullets(run, dt, true);
    return;
  }

  run.time += dt;
  const p = run.player;
  if (p.iframes > 0) p.iframes -= dt;

  // Move toward where the player asked to be, capped by the ship's speed -
  // the same cap for a thumb and for the simulator's bot.
  const tx = Math.max(6, Math.min(FIELD.w - 6, input.tx ?? p.x));
  const ty = Math.max(10, Math.min(FIELD.h - 8, input.ty ?? p.y));
  const dx = tx - p.x;
  const dy = ty - p.y;
  const dist = Math.hypot(dx, dy);
  const reach = TUNING.speed * dt;
  if (dist > reach) {
    p.x += (dx / dist) * reach;
    p.y += (dy / dist) * reach;
  } else {
    p.x = tx;
    p.y = ty;
  }
  p.tilt = Math.max(-1, Math.min(1, dx / 12));

  if (input.bloom && run.bloom >= TUNING.bloomFull && !run.wave) {
    run.bloom -= TUNING.bloomCost;
    run.stats.blooms++;
    run.wave = { x: p.x, y: p.y, r: 6 };
    p.iframes = Math.max(p.iframes, TUNING.bloomReach / TUNING.bloomSpeed + 0.5);
    emit(run, { type: "bloom", x: p.x, y: p.y });
  }

  firePlayer(run, dt);
  stepShots(run, dt);
  stepSpawns(run, dt);

  for (const e of run.enemies) {
    moveEnemy(run, e, dt);
    tickGun(run, e, e.gun, dt, rng);
  }
  run.enemies = run.enemies.filter((e) => !offField(e));

  // Bodies hurt too - a craft flown into is a craft you did not shoot down.
  if (p.iframes <= 0) {
    for (const e of run.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r * 0.7 + TUNING.hitR) {
        hitPlayer(run);
        break;
      }
    }
  }

  if (run.boss) tickBoss(run, dt, rng);
  stepWave(run, dt);
  stepBullets(run, dt, false);
  stepPickups(run, dt);
  stepPhase(run, dt, rng);

  while (run.extendAt < TUNING.extends.length && run.score >= TUNING.extends[run.extendAt]) {
    run.extendAt++;
    run.lives = Math.min(TUNING.maxLives, run.lives + 1);
    emit(run, { type: "extend" });
  }

  run.stats.peakBullets = Math.max(run.stats.peakBullets, run.bullets.length);
}

function stepShots(run, dt) {
  const live = [];
  for (const s of run.shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.y < -8 || s.x < -8 || s.x > FIELD.w + 8) continue;

    let spent = false;
    for (const e of run.enemies) {
      if (Math.abs(s.x - e.x) > e.r + TUNING.shotR || Math.abs(s.y - e.y) > e.r + TUNING.shotR) continue;
      e.hp -= s.dmg;
      e.hitT = 0.08;
      spent = true;
      break;
    }
    if (!spent && run.boss && !run.boss.entering) {
      const b = run.boss;
      if (Math.abs(s.x - b.x) < b.r + TUNING.shotR && Math.abs(s.y - b.y) < b.r + TUNING.shotR) {
        b.hp -= s.dmg;
        b.hitT = 0.06;
        spent = true;
      }
    }
    if (!spent) live.push(s);
  }
  run.shots = live;
}

function stepWave(run, dt) {
  if (!run.wave) return;
  const w = run.wave;
  const prev = w.r;
  w.r += TUNING.bloomSpeed * dt;

  // The front erases bullets and burns whatever craft it sweeps over.
  run.bullets = run.bullets.filter((b) => {
    const d = Math.hypot(b.x - w.x, b.y - w.y);
    if (d > w.r || d < prev - 40) return true;
    run.score += TUNING.bloomCancelScore;
    return false;
  });
  for (const e of run.enemies) {
    if (Math.hypot(e.x - w.x, e.y - w.y) < w.r) {
      e.hp -= TUNING.bloomDps * dt;
      e.hitT = 0.08;
    }
  }
  if (run.boss && !run.boss.entering && Math.hypot(run.boss.x - w.x, run.boss.y - w.y) < w.r) {
    run.boss.hp -= TUNING.bloomDps * 0.55 * dt;
  }
  if (w.r > TUNING.bloomReach) run.wave = null;
}

function stepBullets(run, dt, frozen) {
  const p = run.player;
  const live = [];
  for (const b of run.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const m = TUNING.cullMargin;
    if (b.x < -m || b.x > FIELD.w + m || b.y < -m || b.y > FIELD.h + m) continue;
    if (!frozen) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < b.r + TUNING.hitR) {
        hitPlayer(run);
        continue;
      }
      if (!b.grazed && d < b.r + TUNING.grazeR && p.iframes <= 0) {
        b.grazed = true;
        run.stats.grazes++;
        run.score += TUNING.grazeScore;
        run.bloom = Math.min(TUNING.bloomFull, run.bloom + TUNING.grazeCharge);
        emit(run, { type: "graze", x: b.x, y: b.y });
      }
    }
    live.push(b);
  }
  run.bullets = live;
}

function stepPickups(run, dt) {
  const p = run.player;
  const live = [];
  for (const pick of run.pickups) {
    pick.t += dt;
    const d = Math.hypot(pick.x - p.x, pick.y - p.y);
    if (d < TUNING.magnetR) {
      // Drift toward the ship once it is close: chasing a capsule into a
      // curtain of bullets is not the interesting decision.
      const pull = 150 * dt;
      pick.x += ((p.x - pick.x) / d) * pull;
      pick.y += ((p.y - pick.y) / d) * pull;
    } else {
      pick.y += pick.vy * dt;
    }
    if (d < TUNING.pickupR + 4) {
      if (pick.kind === "power") {
        if (run.player.power < POWER.length - 1) run.player.power++;
        else run.score += 800;
      } else if (pick.kind === "life") {
        run.lives = Math.min(TUNING.maxLives, run.lives + 1);
      } else {
        run.score += 1200;
      }
      emit(run, { type: "pickup", kind: pick.kind, x: pick.x, y: pick.y });
      continue;
    }
    if (pick.y > FIELD.h + 12) continue;
    live.push(pick);
  }
  run.pickups = live;
}

function stepSpawns(run, dt) {
  const stage = stageOf(run);
  if (run.phase === "wave") {
    run.stageT += dt;
    while (run.waveAt < stage.waves.length && stage.waves[run.waveAt].at <= run.stageT) {
      for (const craft of stage.waves[run.waveAt].craft) {
        run.pending.push({ t: craft.delay || 0, craft });
      }
      run.waveAt++;
    }
  }
  const still = [];
  for (const item of run.pending) {
    item.t -= dt;
    if (item.t <= 0) spawnCraft(run, item.craft);
    else still.push(item);
  }
  run.pending = still;
}

function stepPhase(run, dt, rng) {
  run.phaseT += dt;

  // Enemies that ran out of hit points are cleared here rather than inside
  // the shot loop, so one volley can finish several craft in the same step.
  const dead = run.enemies.filter((e) => e.hp <= 0);
  if (dead.length) {
    for (const e of dead) killEnemy(run, e, rng);
    run.enemies = run.enemies.filter((e) => e.hp > 0);
  }

  if (run.phase === "wave") {
    const stage = stageOf(run);
    const done = run.waveAt >= stage.waves.length && !run.enemies.length && !run.pending.length;
    if (done) {
      run.phase = "warn";
      run.phaseT = 0;
      emit(run, { type: "warn", name: BOSSES[stage.boss].name });
    }
    return;
  }

  if (run.phase === "warn") {
    if (run.phaseT > 2.2) {
      run.phase = "boss";
      run.phaseT = 0;
      spawnBoss(run, stageOf(run).boss);
    }
    return;
  }

  if (run.phase === "boss" && run.boss && run.boss.hp <= 0) {
    const boss = run.boss;
    run.score += boss.score;
    run.boss = null;
    run.phase = "clear";
    run.phaseT = 0;
    run.stats.stageTimes.push(run.time);
    cancelBullets(run, FIELD.w * 2, boss.x, boss.y, 1);
    run.lives = Math.min(TUNING.maxLives, run.lives + 1);
    emit(run, { type: "boom", x: boss.x, y: boss.y, big: true });
    emit(run, { type: "stageClear", stage: run.stage });
    return;
  }

  if (run.phase === "clear" && run.phaseT > 3) {
    if (run.stage >= STAGES.length - 1) {
      run.phase = "won";
      run.phaseT = 0;
      emit(run, { type: "won" });
      return;
    }
    run.stage++;
    run.stageT = 0;
    run.waveAt = 0;
    run.phase = "wave";
    run.phaseT = 0;
    run.player.iframes = Math.max(run.player.iframes, 1.2);
    emit(run, { type: "stage", stage: run.stage });
  }
}
