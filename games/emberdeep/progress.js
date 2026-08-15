/* Run state: levels, XP, gold, inventory, equipment, and the localStorage
   save. Stat totals are always derived from level + gear rather than stored,
   so retuning the growth curves in data.js re-tunes existing saves too. */

import { HEROES, GEAR, XP_CURVE, MAX_LEVEL } from "./data.js";

const SAVE_KEY = "emberdeep:run";

export function heroById(id) {
  return HEROES.find((h) => h.id === id);
}

export function statsFor(heroId, level, gearTiers) {
  const hero = heroById(heroId);
  const gear = GEAR[heroId];
  const weapon = gear.weapon[gearTiers?.weapon ?? 0];
  const armor = gear.armor[gearTiers?.armor ?? 0];
  const steps = level - 1;

  const grow = (key) => Math.floor(hero.base[key] + hero.growth[key] * steps);
  const bonus = (key) => (weapon[key] || 0) + (armor[key] || 0);

  return {
    maxHp: grow("hp") + bonus("hp"),
    maxMp: grow("mp") + bonus("mp"),
    atk: grow("atk") + bonus("atk"),
    def: grow("def") + bonus("def"),
    mag: grow("mag") + bonus("mag"),
    res: grow("res") + bonus("res"),
    spd: grow("spd") + bonus("spd"),
    weapon,
    armor,
  };
}

export function skillsFor(heroId, level) {
  return heroById(heroId)
    .learns.filter((l) => l.level <= level)
    .map((l) => l.id);
}

export function xpToNext(level) {
  if (level >= MAX_LEVEL) return null;
  return XP_CURVE[level + 1];
}

export function newRun() {
  return {
    stage: 0,
    gold: 80,
    cleared: false,
    party: HEROES.map((hero) => {
      const stats = statsFor(hero.id, 1, { weapon: 0, armor: 0 });
      return {
        id: hero.id, level: 1, xp: 0,
        hp: stats.maxHp, mp: stats.maxMp,
        weapon: 0, armor: 0,
      };
    }),
    inventory: { potion: 3, antidote: 1 },
  };
}

/* Awards XP to everyone, including the fallen - a wipe-recovery tax on top of
   revive costs would just mean more grinding. Returns per-hero level-up
   summaries so the UI can show what was gained. */
export function grantXp(run, amount) {
  const results = [];
  for (const member of run.party) {
    if (member.level >= MAX_LEVEL) continue;
    member.xp += amount;

    const gained = [];
    while (member.level < MAX_LEVEL && member.xp >= XP_CURVE[member.level + 1]) {
      const before = statsFor(member.id, member.level, member);
      const beforeSkills = skillsFor(member.id, member.level);
      member.level += 1;
      const after = statsFor(member.id, member.level, member);
      const learned = skillsFor(member.id, member.level).filter((s) => !beforeSkills.includes(s));

      // Levelling tops you up by the amount your maximum grew, so it feels
      // like a reward mid-run without being a free full heal.
      member.hp = Math.min(after.maxHp, member.hp + (after.maxHp - before.maxHp));
      member.mp = Math.min(after.maxMp, member.mp + (after.maxMp - before.maxMp));

      gained.push({
        level: member.level,
        hp: after.maxHp - before.maxHp,
        mp: after.maxMp - before.maxMp,
        atk: after.atk - before.atk,
        def: after.def - before.def,
        mag: after.mag - before.mag,
        learned,
      });
    }
    if (gained.length) results.push({ id: member.id, name: heroById(member.id).name, gained });
  }
  return results;
}

export function restCost(run) {
  const missing = run.party.reduce((sum, m) => {
    const stats = statsFor(m.id, m.level, m);
    return sum + (stats.maxHp - m.hp) + (stats.maxMp - m.mp) * 2 + (m.hp <= 0 ? 40 : 0);
  }, 0);
  return Math.max(10, Math.round(missing * 0.6));
}

export function rest(run) {
  for (const member of run.party) {
    const stats = statsFor(member.id, member.level, member);
    member.hp = stats.maxHp;
    member.mp = stats.maxMp;
  }
}

export function addItem(run, itemId, count = 1) {
  run.inventory[itemId] = (run.inventory[itemId] || 0) + count;
}

export function removeItem(run, itemId, count = 1) {
  if (!run.inventory[itemId]) return;
  run.inventory[itemId] -= count;
  if (run.inventory[itemId] <= 0) delete run.inventory[itemId];
}

// localStorage throws in some private-browsing modes; a run that can't be
// saved should still be playable.
export function save(run) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));
  } catch (error) {
    /* run continues unsaved */
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    // Guard against a save written by an older, differently-shaped version.
    if (!run?.party?.length || typeof run.stage !== "number") return null;
    return run;
  } catch (error) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    /* nothing to do */
  }
}
