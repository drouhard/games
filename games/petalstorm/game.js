/* Everything the browser owns: the canvas, the thumb, the noise and the
   sheets. The rules live in engine.js and never see any of this.

   The field is a 240x360 back buffer. Every sprite is blitted into it at 1:1
   and the whole buffer is scaled up once by CSS with image-rendering:
   pixelated, so nothing is ever resampled mid-draw and the art stays sharp on
   a retina screen at any window size. */

import { FIELD, TUNING, DIFFS, STAGES, BULLETS, fmtScore } from "./data.js";
import * as engine from "./engine.js";
import { PALETTE, SPRITES, sprite, flash } from "./sprites.js";
import * as audio from "./audio.js";

const SAVE_KEY = "petalstorm:v1";
const DRAG_GAIN = 1.3; // the ship travels a little further than the thumb
const LEASH = 34; // how far the drag target may run ahead of the ship

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fieldEl = document.getElementById("field");
const bannerEl = document.getElementById("banner");
const overlayEl = document.getElementById("overlay");
const sheetEl = document.getElementById("sheet");
const scoreEl = document.getElementById("hud-score");
const stageEl = document.getElementById("hud-stage");
const livesEl = document.getElementById("hud-lives");
const powerEl = document.getElementById("hud-power");
const meterEl = document.getElementById("meter");
const meterFill = document.getElementById("meter-fill");
const meterLabel = document.getElementById("meter-label");
const bloomBtn = document.getElementById("btn-bloom");
const pauseBtn = document.getElementById("btn-pause");

/* --- save ---------------------------------------------------------------- */

function load() {
  const blank = { best: { novice: 0, pilot: 0, ace: 0 }, reached: { novice: 1, pilot: 1, ace: 1 }, diff: "pilot" };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!raw) return blank;
    return {
      best: { ...blank.best, ...raw.best },
      reached: { ...blank.reached, ...raw.reached },
      diff: DIFFS[raw.diff] ? raw.diff : "pilot",
    };
  } catch (error) {
    return blank;
  }
}

function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (error) {
    /* private mode: the run just won't be remembered */
  }
}

const save = load();

/* --- view state ---------------------------------------------------------- */

const view = { scale: 1, shake: 0, flashT: 0 };
const aim = { x: FIELD.w / 2, y: FIELD.h - 54 };
const held = new Set();
const particles = [];
const stars = [];
const floats = []; // little rising score/pickup labels

let run = null;
let paused = true;
let sheetOpen = null;
let wantBloom = false;
let last = performance.now();
let carry = 0;
let endTimer = 0;

for (let i = 0; i < 70; i++) {
  const depth = i % 3;
  stars.push({
    x: Math.random() * FIELD.w,
    y: Math.random() * FIELD.h,
    speed: 14 + depth * 26,
    shade: ["#2b3157", "#566c86", "#94b0c2"][depth],
    size: depth === 2 ? 2 : 1,
  });
}

/* --- canvas fit ---------------------------------------------------------- */

function fit() {
  const box = fieldEl.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const scale = Math.min(box.width / FIELD.w, box.height / FIELD.h);
  view.scale = scale;
  canvas.style.width = `${Math.floor(FIELD.w * scale)}px`;
  canvas.style.height = `${Math.floor(FIELD.h * scale)}px`;
}

new ResizeObserver(fit).observe(fieldEl);
addEventListener("orientationchange", () => setTimeout(fit, 120));
fit();

/* --- input --------------------------------------------------------------- */

let drag = null;

function clampAim() {
  aim.x = Math.max(6, Math.min(FIELD.w - 6, aim.x));
  aim.y = Math.max(10, Math.min(FIELD.h - 8, aim.y));
  // Keep the target on a short leash behind the ship. A fast flick asks for
  // more than the ship's top speed can give, and without this the target runs
  // off across the field and the ship keeps flying after the thumb stopped.
  if (!run) return;
  const dx = aim.x - run.player.x;
  const dy = aim.y - run.player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > LEASH) {
    aim.x = run.player.x + (dx / dist) * LEASH;
    aim.y = run.player.y + (dy / dist) * LEASH;
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (paused) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  // Relative dragging, not "put the ship under my finger": on a phone the
  // thumb would otherwise cover the one thing you have to watch.
  const scale = view.scale || 1;
  aim.x += ((event.clientX - drag.x) / scale) * DRAG_GAIN;
  aim.y += ((event.clientY - drag.y) / scale) * DRAG_GAIN;
  drag.x = event.clientX;
  drag.y = event.clientY;
  clampAim();
  event.preventDefault();
});

function endDrag(event) {
  if (drag && event.pointerId === drag.id) drag = null;
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "w", "a", "s", "d"].includes(key)) event.preventDefault();
  held.add(key);
  if (key === " " || key === "z") wantBloom = true;
  if (key === "escape" || key === "p") togglePause();
});
addEventListener("keyup", (event) => held.delete(event.key.toLowerCase()));

function keyboardAim(dt) {
  let dx = 0;
  let dy = 0;
  if (held.has("arrowleft") || held.has("a")) dx -= 1;
  if (held.has("arrowright") || held.has("d")) dx += 1;
  if (held.has("arrowup") || held.has("w")) dy -= 1;
  if (held.has("arrowdown") || held.has("s")) dy += 1;
  if (!dx && !dy) return;
  const len = Math.hypot(dx, dy);
  aim.x += (dx / len) * TUNING.speed * dt;
  aim.y += (dy / len) * TUNING.speed * dt;
  clampAim();
}

bloomBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  wantBloom = true;
});

pauseBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  togglePause();
});

/* --- effects ------------------------------------------------------------- */

function spark(x, y, count, colors, speed = 60, life = 0.5) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.9);
    particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: life * (0.6 + Math.random() * 0.7),
      max: life,
      color: colors[(Math.random() * colors.length) | 0],
      size: Math.random() < 0.3 ? 2 : 1,
    });
  }
}

function float(x, y, text, color) {
  floats.push({ x, y, text, color, life: 0.9 });
}

function banner(text, small, kind) {
  bannerEl.innerHTML = small ? `${text}<small>${small}</small>` : text;
  bannerEl.className = `banner${kind ? ` banner--${kind}` : ""}`;
  bannerEl.hidden = false;
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => {
    bannerEl.hidden = true;
  }, 1900);
}

let grazeTick = 0;

function react(event) {
  switch (event.type) {
    case "shoot":
      audio.shoot(run.time);
      break;
    case "boom":
      if (event.big) {
        spark(event.x, event.y, 60, ["4", "3", "2", "c", "b"], 110, 1.1);
        view.shake = 7;
        view.flashT = 0.18;
        audio.sfx.bigBoom();
      } else {
        spark(event.x, event.y, 12, ["4", "3", "2", "c"], 70, 0.45);
        view.shake = Math.max(view.shake, 2);
        audio.sfx.boom();
      }
      break;
    case "graze":
      if (++grazeTick % 3 === 0) {
        spark(event.x, event.y, 2, ["b", "c"], 30, 0.25);
        audio.sfx.graze();
      }
      break;
    case "bloom":
      view.shake = 5;
      view.flashT = 0.12;
      audio.sfx.bloom();
      break;
    case "die":
      spark(event.x, event.y, 40, ["b", "a", "c", "2"], 95, 0.9);
      view.shake = 9;
      view.flashT = 0.2;
      audio.sfx.die();
      banner("Ship Down", `${run.lives} left`, "danger");
      break;
    case "pickup":
      audio.sfx.pickup();
      if (event.kind === "power") float(event.x, event.y, "POWER", "#ffcd75");
      else if (event.kind === "life") float(event.x, event.y, "1UP", "#ff8ba0");
      else float(event.x, event.y, "+1200", "#73eff7");
      break;
    case "extend":
      audio.sfx.extend();
      banner("Extra Ship", "score bonus");
      break;
    case "stage":
      banner(`Stage ${event.stage + 1}`, STAGES[event.stage].name);
      break;
    case "warn":
      banner("Warning", event.name, "warn");
      audio.sfx.warn();
      break;
    case "bossIn":
      stageEl.textContent = event.name;
      break;
    case "bossPhase":
      view.shake = 4;
      break;
    case "stageClear":
      banner("Stage Clear", "+1 ship");
      audio.sfx.clear();
      break;
    case "won":
      endTimer = 2.4;
      audio.sfx.clear();
      break;
    case "over":
      endTimer = 2;
      audio.sfx.over();
      break;
    default:
      break;
  }
}

/* --- drawing ------------------------------------------------------------- */

/* Draws a sprite at 1:1, with the white damage flash laid over it rather than
   swapped for it: a boss takes ten hits a second, and swapping the art out
   would leave it a solid white slab for the whole fight. */
function blit(key, x, y, hitT = 0) {
  const art = SPRITES[key];
  const dx = Math.round(x - art.w / 2);
  const dy = Math.round(y - art.h / 2);
  ctx.drawImage(sprite(key), dx, dy);
  if (hitT > 0) {
    ctx.globalAlpha = Math.min(0.55, hitT * 7);
    ctx.drawImage(flash(key), dx, dy);
    ctx.globalAlpha = 1;
  }
}

function drawStars(dt) {
  for (const star of stars) {
    star.y += star.speed * dt;
    if (star.y > FIELD.h) {
      star.y -= FIELD.h;
      star.x = Math.random() * FIELD.w;
    }
    ctx.fillStyle = star.shade;
    ctx.fillRect(star.x | 0, star.y | 0, star.size, star.size);
  }
}

function drawParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    ctx.globalAlpha = Math.min(1, p.life / p.max);
    ctx.fillStyle = PALETTE[p.color];
    ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloats(dt) {
  ctx.font = "7px -apple-system, sans-serif";
  ctx.textAlign = "center";
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt;
    if (f.life <= 0) {
      floats.splice(i, 1);
      continue;
    }
    f.y -= 16 * dt;
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function drawBossBar() {
  const boss = run.boss;
  if (!boss || boss.entering) return;
  const frac = Math.max(0, boss.hp / boss.maxHp);
  ctx.fillStyle = "#05060e";
  ctx.fillRect(8, 6, FIELD.w - 16, 5);
  ctx.fillStyle = "#2b3157";
  ctx.fillRect(9, 7, FIELD.w - 18, 3);
  ctx.fillStyle = frac > 0.35 ? "#b13e53" : "#ef7d57";
  ctx.fillRect(9, 7, Math.round((FIELD.w - 18) * frac), 3);
}

function drawPlayer() {
  const p = run.player;
  const blink = p.iframes > 0 && Math.floor(run.time * 20) % 2 === 0;
  if (!blink) {
    const key = p.tilt < -0.4 ? "shipLeft" : p.tilt > 0.4 ? "shipRight" : "ship";
    blit(key, p.x, p.y);
  }
  // The hitbox is two pixels wide and the game says so: in a bullet hell the
  // player has to know exactly what the bullets are aiming at.
  ctx.fillStyle = run.bloom >= TUNING.bloomFull ? "#a7f070" : "#f4f4f4";
  ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
}

function render(dt) {
  ctx.save();
  if (view.shake > 0) {
    view.shake = Math.max(0, view.shake - dt * 26);
    const s = view.shake;
    ctx.translate(Math.round((Math.random() - 0.5) * s), Math.round((Math.random() - 0.5) * s));
  }

  ctx.fillStyle = "#05060e";
  ctx.fillRect(-12, -12, FIELD.w + 24, FIELD.h + 24);
  drawStars(dt);

  if (!run) {
    ctx.restore();
    return;
  }

  // A wash of the stage's colour up from the floor, so the four stages do not
  // all read as the same black. A gradient, not a band: a hard edge across the
  // field reads as a wall the ship ought to be able to hide behind.
  const tint = ["#1a1c2c", "#2b1a3d", "#10333d", "#3a1140"][run.stage] || "#1a1c2c";
  const wash = ctx.createLinearGradient(0, FIELD.h - 150, 0, FIELD.h);
  wash.addColorStop(0, "rgba(0,0,0,0)");
  wash.addColorStop(1, tint);
  ctx.fillStyle = wash;
  ctx.fillRect(0, FIELD.h - 150, FIELD.w, 150);

  for (const pick of run.pickups) {
    const key = pick.kind === "power" ? "powerUp" : pick.kind === "life" ? "lifeUp" : "shardUp";
    blit(key, pick.x, pick.y + Math.sin(pick.t * 6) * 1.5);
  }

  for (const shot of run.shots) blit("shot", shot.x, shot.y);

  for (const e of run.enemies) blit(e.sprite, e.x, e.y, e.hitT);
  if (run.boss) blit(run.boss.sprite, run.boss.x, run.boss.y, run.boss.hitT);

  if (run.wave) {
    const w = run.wave;
    ctx.strokeStyle = "#73eff7";
    ctx.globalAlpha = Math.max(0, 1 - w.r / TUNING.bloomReach);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#a7f070";
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w.x, w.y, Math.max(0, w.r - 9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const b of run.bullets) blit(BULLETS[b.kind].sprite, b.x, b.y);

  if (run.phase !== "over") drawPlayer();
  drawParticles(dt);
  drawFloats(dt);
  drawBossBar();

  if (view.flashT > 0) {
    view.flashT -= dt;
    ctx.globalAlpha = Math.max(0, view.flashT * 2);
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(-12, -12, FIELD.w + 24, FIELD.h + 24);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* --- hud ----------------------------------------------------------------- */

let shownLives = -1;

function drawHud() {
  if (!run) return;
  scoreEl.textContent = fmtScore(engine.scoreOf(run));
  if (run.lives !== shownLives) {
    shownLives = run.lives;
    livesEl.innerHTML = Array.from({ length: Math.max(0, run.lives) }, () => "<i></i>").join("");
  }
  powerEl.textContent = engine.powerOf(run).name;
  const frac = run.bloom / TUNING.bloomFull;
  meterFill.style.right = `${Math.max(0, 100 - frac * 100)}%`;
  const ready = run.bloom >= TUNING.bloomFull;
  meterEl.classList.toggle("meter--full", ready);
  meterLabel.textContent = ready ? "Bloom ready" : `Bloom ${Math.floor(frac * 100)}%`;
  bloomBtn.disabled = !ready || !!run.wave;
  if (run.phase !== "boss") stageEl.textContent = `Stage ${run.stage + 1} · ${STAGES[run.stage].name}`;
}

/* --- loop ---------------------------------------------------------------- */

function tick(dt) {
  keyboardAim(dt);
  engine.step(run, { tx: aim.x, ty: aim.y, bloom: wantBloom }, Math.random, dt);
  wantBloom = false;
  for (const event of engine.drainEvents(run)) react(event);

  if (endTimer > 0) {
    endTimer -= dt;
    if (endTimer <= 0) finish();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  // A backgrounded tab hands back one enormous delta; clamping it means the
  // run resumes rather than fast-forwarding through an unseen death.
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (run && !paused) {
    carry += dt;
    let guard = 0;
    while (carry >= engine.STEP && guard++ < 6) {
      carry -= engine.STEP;
      tick(engine.STEP);
    }
    drawHud();
  }
  render(paused ? Math.min(dt, 1 / 60) * 0.35 : dt);
}

/* --- run lifecycle ------------------------------------------------------- */

function startRun(diff, stageIndex = 0) {
  save.diff = diff;
  persist();
  run = engine.newRun(stageIndex, diff);
  run.practice = stageIndex > 0;
  aim.x = run.player.x;
  aim.y = run.player.y;
  particles.length = 0;
  floats.length = 0;
  shownLives = -1;
  endTimer = 0;
  wantBloom = false;
  carry = 0;
  last = performance.now();
  closeSheet();
  paused = false;
  drawHud();
  for (const event of engine.drainEvents(run)) react(event);
}

function finish() {
  const score = engine.scoreOf(run);
  const won = run.phase === "won";
  paused = true;
  if (!run.practice) {
    save.reached[run.diff] = Math.max(save.reached[run.diff], run.stage + 1);
    if (score > save.best[run.diff]) save.best[run.diff] = score;
    persist();
  }
  openSheet(overSheet(won, score, run.stage, run.diff, run.practice));
}

function togglePause() {
  if (!run || endTimer > 0 || run.phase === "over" || run.phase === "won") return;
  if (paused && sheetOpen !== "pause") return;
  if (paused) {
    paused = false;
    last = performance.now();
    closeSheet();
  } else {
    paused = true;
    openSheet(pauseSheet());
  }
}

addEventListener("visibilitychange", () => {
  if (document.hidden && run && !paused) togglePause();
});

/* --- sheets --------------------------------------------------------------
   Nothing commits on the tap that reveals it: picking a difficulty shows what
   it means and moves a highlight, and a separate labelled button launches. */

function openSheet(sheet) {
  sheetOpen = sheet.id;
  sheetEl.innerHTML = sheet.html;
  overlayEl.hidden = false;
  sheet.wire?.(sheetEl);
}

function closeSheet() {
  sheetOpen = null;
  overlayEl.hidden = true;
}

function on(root, selector, handler) {
  root.querySelector(selector)?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handler(event);
  });
}

function titleSheet() {
  let diff = save.diff;
  const body = () => `
    <h1>Petalstorm</h1>
    <p>Four stages of curtain fire. Drag anywhere to fly, the guns fire
      themselves. <b>Skim</b> bullets to charge Bloom, spend it to wipe the
      screen.</p>
    <div class="picker">
      ${Object.entries(DIFFS)
        .map(([key, d]) => `<button type="button" data-diff="${key}" aria-pressed="${key === diff}">${d.name}</button>`)
        .join("")}
    </div>
    <div class="rows">
      <div class="row"><span>${DIFFS[diff].blurb}</span><b>×${DIFFS[diff].score}</b></div>
      <div class="row"><span>Best on ${DIFFS[diff].name}</span><b>${fmtScore(save.best[diff])}</b></div>
    </div>
    <button class="pill-button" id="go" type="button">Launch</button>
    <button class="ghost" id="how" type="button">How to play</button>
    ${save.reached[diff] > 1 ? `<button class="ghost" id="practice" type="button">Practice stage ${save.reached[diff]}</button>` : ""}
    <button class="ghost" id="sound" type="button">Sound: ${audio.isEnabled() ? "on" : "off"}</button>
  `;

  const wire = (root) => {
    root.querySelectorAll("[data-diff]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        diff = button.dataset.diff;
        save.diff = diff;
        persist();
        openSheet({ id: "title", html: body(), wire });
      });
    });
    on(root, "#go", () => startRun(diff, 0));
    on(root, "#how", () => openSheet(howSheet(() => openSheet({ id: "title", html: body(), wire }))));
    on(root, "#practice", () => startRun(diff, save.reached[diff] - 1));
    on(root, "#sound", () => {
      audio.setEnabled(!audio.isEnabled());
      openSheet({ id: "title", html: body(), wire });
    });
  };

  return { id: "title", html: body(), wire };
}

function howSheet(back) {
  return {
    id: "how",
    html: `
      <h2>How to play</h2>
      <div class="rows">
        <div class="row"><span>Fly</span><b>drag anywhere</b></div>
        <div class="row"><span>Shoot</span><b>automatic</b></div>
        <div class="row"><span>Hitbox</span><b>the bright dot</b></div>
        <div class="row"><span>Charge</span><b>skim bullets</b></div>
        <div class="row"><span>Bloom</span><b>the button</b></div>
        <div class="row"><span>Keyboard</span><b>arrows + space</b></div>
      </div>
      <p>Only the two-pixel dot at the centre of the ship can be hit — the
        wings pass straight through. Passing close to a bullet without being
        hit is <b>grazing</b>: it scores, and it fills the Bloom meter.</p>
      <p>Bloom erases every bullet its wave touches, scores them, and makes
        you briefly untouchable. A shot-down ship costs a power stage and
        drops two capsules to win it straight back.</p>
      <button class="pill-button" id="back" type="button">Back</button>
    `,
    wire: (root) => on(root, "#back", back),
  };
}

function pauseSheet() {
  return {
    id: "pause",
    html: `
      <h2>Paused</h2>
      <div class="rows">
        <div class="row"><span>Score</span><b>${fmtScore(engine.scoreOf(run))}</b></div>
        <div class="row"><span>Stage</span><b>${run.stage + 1} · ${STAGES[run.stage].name}</b></div>
        <div class="row"><span>Ships</span><b>${run.lives}</b></div>
      </div>
      <button class="pill-button" id="resume" type="button">Resume</button>
      <button class="ghost" id="sound" type="button">Sound: ${audio.isEnabled() ? "on" : "off"}</button>
      <button class="ghost" id="quit" type="button">Quit to title</button>
    `,
    wire: (root) => {
      on(root, "#resume", () => togglePause());
      on(root, "#sound", () => {
        audio.setEnabled(!audio.isEnabled());
        openSheet(pauseSheet());
      });
      on(root, "#quit", () => {
        run = null;
        stageEl.textContent = "Petalstorm";
        openSheet(titleSheet());
      });
    },
  };
}

function overSheet(won, score, stage, diff, practice) {
  const best = save.best[diff];
  return {
    id: "over",
    html: `
      <h2>${won ? "Queensreach Cleared" : "Ship Lost"}</h2>
      <p class="final">${fmtScore(score)}</p>
      <div class="rows">
        <div class="row"><span>${won ? "All four stages" : `Reached stage ${stage + 1} · ${STAGES[stage].name}`}</span><b>${DIFFS[diff].name}</b></div>
        <div class="row"><span>${practice ? "Practice run — not banked" : score >= best ? "New best" : "Best"}</span><b>${fmtScore(best)}</b></div>
      </div>
      <button class="pill-button" id="again" type="button">Fly again</button>
      ${stage > 0 && !won ? `<button class="ghost" id="practice" type="button">Practice stage ${stage + 1}</button>` : ""}
      <button class="ghost" id="title" type="button">Title screen</button>
    `,
    wire: (root) => {
      on(root, "#again", () => startRun(diff, 0));
      on(root, "#practice", () => startRun(diff, stage));
      on(root, "#title", () => {
        run = null;
        stageEl.textContent = "Petalstorm";
        openSheet(titleSheet());
      });
    },
  };
}

/* --- go ------------------------------------------------------------------ */

stageEl.textContent = "Petalstorm";
scoreEl.textContent = "0";
openSheet(titleSheet());
requestAnimationFrame(frame);
