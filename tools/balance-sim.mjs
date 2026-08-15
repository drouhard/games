/* Balance simulator for Emberdeep.

   The combat engine is deliberately DOM-free, so a whole run can be played
   thousands of times in Node. Tuning by eye does not work: the first pass of
   these numbers produced 1.8-round fights and a boss that wiped the party
   thirteen times a run, and neither was visible from playing a stage or two.

   Run it after touching anything in data.js or the damage formula:

       node tools/balance-sim.mjs

   What good output looks like: trash fights 2-4 rounds, the boss 6-10, wipe
   rates climbing from 0% early to ~25% mid-ladder, every run clearing
   eventually, and the party finishing around level 11 (so the level 9-10
   skills actually get taught before the dragon).

   Not part of serving the site - nothing under games/ imports it. */

import { SKILLS, ITEMS, GEAR, STAGES, ENEMIES } from '../games/emberdeep/data.js';
import * as combat from '../games/emberdeep/combat.js';
import * as progress from '../games/emberdeep/progress.js';

// A reasonable-but-not-optimal player: heal when hurt, exploit weaknesses,
// AoE when it's worth it, buy gear when affordable.
function chooseCommand(fighter, state, run) {
  const foes = combat.living(state.enemies);
  const allies = combat.living(state.allies);
  const down = state.allies.filter(a => !a.alive);
  const skills = fighter.skills;
  const has = id => skills.includes(id) && fighter.mp >= SKILLS[id].mp;
  const weakest = foes.slice().sort((a, b) => a.hp - b.hp)[0];
  const hurt = allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

  if (fighter.heroId === 'wren') {
    if (down.length && has('revive')) return { type: 'skill', skillId: 'revive', targetUid: down[0].uid };
    if (hurt.hp / hurt.maxHp < 0.5 && has('mend')) return { type: 'skill', skillId: 'mend', targetUid: hurt.uid };
    if (down.length && run.inventory.salts > 0) return { type: 'item', itemId: 'salts', targetUid: down[0].uid };
    if (hurt.hp / hurt.maxHp < 0.4 && run.inventory.potion > 0) return { type: 'item', itemId: 'potion', targetUid: hurt.uid };
    const undead = foes.find(f => f.weak.includes('holy'));
    if (undead && has('smite')) return { type: 'skill', skillId: 'smite', targetUid: undead.uid };
    if (has('smite')) return { type: 'skill', skillId: 'smite', targetUid: weakest.uid };
  }

  if (fighter.heroId === 'sable') {
    if (foes.length >= 3 && has('inferno')) return { type: 'skill', skillId: 'inferno', targetUid: null };
    if (foes.length >= 2 && has('spark')) return { type: 'skill', skillId: 'spark', targetUid: null };
    for (const [id, elem] of [['ember','fire'], ['frost','ice'], ['spark','bolt']]) {
      const target = foes.find(f => f.weak.includes(elem));
      if (target && has(id)) return { type: 'skill', skillId: id, targetUid: target.uid };
    }
    if (has('ember')) return { type: 'skill', skillId: 'ember', targetUid: weakest.uid };
  }

  if (fighter.heroId === 'bran') {
    if (foes.length >= 3 && has('cleave')) return { type: 'skill', skillId: 'cleave', targetUid: null };
    if (has('sunder')) return { type: 'skill', skillId: 'sunder', targetUid: weakest.uid };
  }

  if (fighter.mp < 3 && fighter.maxMp > 10 && Math.random() < 0.3) return { type: 'defend' };
  return { type: 'attack', targetUid: weakest.uid };
}

function shop(run) {
  // Keep a few potions, then upgrade gear cheapest-first.
  while ((run.inventory.potion || 0) < 4 && run.gold >= ITEMS.potion.price) {
    run.gold -= ITEMS.potion.price; progress.addItem(run, 'potion');
  }
  if ((run.inventory.salts || 0) < 1 && run.gold >= ITEMS.salts.price + 60) {
    run.gold -= ITEMS.salts.price; progress.addItem(run, 'salts');
  }
  for (;;) {
    const options = [];
    for (const m of run.party) for (const slot of ['weapon', 'armor']) {
      const next = GEAR[m.id][slot][m[slot] + 1];
      if (next && run.gold >= next.price) options.push({ m, slot, price: next.price });
    }
    if (!options.length) break;
    options.sort((a, b) => a.price - b.price);
    const buy = options[0];
    run.gold -= buy.price; buy.m[buy.slot] += 1;
  }
}

function playRun() {
  const run = progress.newRun();
  const log = [];
  let attempts = 0;

  while (run.stage < STAGES.length) {
    attempts++;
    if (attempts > 60) return { cleared: false, reason: 'stuck', log };

    const allies = run.party.map(m => {
      const stats = progress.statsFor(m.id, m.level, m);
      return combat.makeHeroFighter(progress.heroById(m.id), {
        ...stats, hp: Math.min(m.hp, stats.maxHp), mp: Math.min(m.mp, stats.maxMp),
        skills: progress.skillsFor(m.id, m.level),
      });
    });
    const state = combat.startBattle(allies, STAGES[run.stage].enemies);

    let rounds = 0;
    while (!state.over && rounds < 60) {
      rounds++;
      const commands = {};
      for (const ally of combat.living(state.allies)) {
        if (combat.hasStatus(ally, 'sleep')) continue;
        commands[ally.uid] = chooseCommand(ally, state, run);
      }
      const { spent } = combat.resolveRound(state, commands, run.inventory);
      for (const [id, n] of Object.entries(spent)) progress.removeItem(run, id, n);
    }

    for (const f of state.allies) {
      const m = run.party.find(p => p.id === f.heroId);
      m.hp = f.hp; m.mp = f.mp;
    }

    if (state.over === 'victory') {
      const xp = state.enemies.reduce((s, e) => s + e.xp, 0);
      const gold = state.enemies.reduce((s, e) => s + e.gold, 0);
      run.gold += gold;
      progress.grantXp(run, xp);
      log.push({ stage: run.stage + 1, name: STAGES[run.stage].name, rounds,
                 lv: run.party.map(m => m.level).join('/'), gold: run.gold });
      run.stage++;
    } else {
      log.push({ stage: run.stage + 1, name: STAGES[run.stage].name, rounds, wiped: true });
      run.gold = Math.round(run.gold * 0.8);
      progress.rest(run);
    }

    // Rest + shop between fights, as a player would.
    const cost = progress.restCost(run);
    if (run.gold >= cost) { run.gold -= cost; progress.rest(run); }
    shop(run);
  }
  return { cleared: true, log, party: run.party };
}

const N = 300;
let cleared = 0, totalWipes = 0;
const wipesByStage = {}, roundsByStage = {}, finalLevels = [];
for (let i = 0; i < N; i++) {
  const r = playRun();
  if (r.cleared) cleared++;
  for (const e of r.log) {
    if (e.wiped) { totalWipes++; wipesByStage[e.stage] = (wipesByStage[e.stage] || 0) + 1; }
    else { (roundsByStage[e.stage] ||= []).push(e.rounds); }
  }
  if (r.party) finalLevels.push(r.party.map(m => m.level).join('/'));
}
console.log(`cleared ${cleared}/${N} runs`);
console.log(`wipes per run: ${(totalWipes / N).toFixed(2)}`);
console.log('\nstage                     avg rounds   wipe rate');
for (let s = 1; s <= STAGES.length; s++) {
  const rounds = roundsByStage[s] || [];
  const avg = rounds.length ? (rounds.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1) : '-';
  const wipeRate = ((wipesByStage[s] || 0) / N * 100).toFixed(0);
  console.log(`${String(s).padStart(2)} ${STAGES[s-1].name.padEnd(22)} ${String(avg).padStart(6)}   ${String(wipeRate).padStart(6)}%`);
}
const common = {};
finalLevels.forEach(l => common[l] = (common[l] || 0) + 1);
console.log('\nend-of-run levels (Bran/Sable/Wren):',
  Object.entries(common).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} x${v}`).join('  '));
