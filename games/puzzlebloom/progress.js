/* Petals, stars and what is unlocked. No DOM, no localStorage in the rules
   themselves - `load` and `save` are the only two functions that touch
   storage, so tools/bloom-sim.mjs can run whole careers of this in Node.

   The one rule that shaped all of it: losing a Journey must never leave a
   player worse off than they were before they started it. So petals are a
   lifetime count that is only ever added to, unlocks are thresholds on that
   count rather than a price you pay, and a Journey that ends three questions
   in still banks everything earned in those three questions. There is nothing
   here a bad run can take away. */

import { KINDS } from "./puzzles.js";

export const SAVE_KEY = "puzzlebloom:save:1";

export const JOURNEY_LENGTH = 10;
export const HEARTS = 6;
export const PETALS_PER_CORRECT = 2;
export const PETALS_PERFECT_BONUS = 6;
export const PETALS_PER_PRACTICE = 1;

/* The first four puzzles are free; the rest arrive as the lifetime petal count
   passes these. Nothing is deducted when one opens. */
export const UNLOCK_AT = [8, 18, 30, 46, 66, 90, 118, 150, 186];
export const FREE_KINDS = KINDS.length - UNLOCK_AT.length;

/* Stars per puzzle, on the longest run of right answers in a row. */
export const STAR_STREAKS = [3, 6, 10];

/* A Journey does not walk a fixed ladder, it follows the player: two right in a
   row and the puzzles get harder, a miss and they ease off. A fixed ramp is
   either too easy for the child who is enjoying it or a wall for the one who
   is not, and there is no setting that is right for both. Practice uses the
   same rule, so a level means the same thing everywhere. */
export const START_LEVEL = 2;
export const MAX_LEVEL = 5;

/* `streak` counts right answers in a row when positive and wrong ones when
   negative. Two in a row either way moves the level, which settles a player
   where they are getting about half of them - hard enough to be worth doing,
   not so hard that a Journey ends on question four. Dropping a level on every
   single miss was tried first and drifted everyone down to the easy end. */
export function stepLevel(level, streak, right) {
  const s = right ? Math.max(0, streak) + 1 : Math.min(0, streak) - 1;
  if (s >= 2) return { level: Math.min(MAX_LEVEL, level + 1), streak: 0 };
  if (s <= -2) return { level: Math.max(1, level - 1), streak: 0 };
  return { level, streak: s };
}

export function newSave() {
  return {
    v: 1,
    petals: 0,
    kinds: {}, // id -> { played, right, streak, bestStreak }
    journeys: 0,
    bestJourney: 0,
    lastSeenUnlocks: FREE_KINDS,
  };
}

function kindRecord(save, id) {
  if (!save.kinds[id]) save.kinds[id] = { played: 0, right: 0, streak: 0, bestStreak: 0 };
  const rec = save.kinds[id];
  // Backfill, so a save written before levels were remembered still loads.
  if (typeof rec.level !== "number") rec.level = START_LEVEL;
  if (typeof rec.ladder !== "number") rec.ladder = 0;
  return rec;
}

/* Where this player has settled on this puzzle. Remembered across Journeys and
   across days: ten questions is not enough to climb from the bottom, so
   forgetting it every run would mean a child who has mastered a puzzle keeps
   being handed the easy version of it forever. */
export function levelFor(save, id) {
  return kindRecord(save, id).level;
}

/* --- unlocks -------------------------------------------------------------- */

export function unlockedCount(save) {
  let n = FREE_KINDS;
  for (const at of UNLOCK_AT) if (save.petals >= at) n += 1;
  return Math.min(KINDS.length, n);
}

export function unlockedKinds(save) {
  return KINDS.slice(0, unlockedCount(save));
}

export function nextUnlock(save) {
  const n = unlockedCount(save);
  if (n >= KINDS.length) return null;
  return { kind: KINDS[n], at: UNLOCK_AT[n - FREE_KINDS], togo: UNLOCK_AT[n - FREE_KINDS] - save.petals };
}

/* Petals earned across a session can open more than one host at once, so this
   returns a list, and clears the marker as it goes. */
export function takeNewUnlocks(save) {
  const now = unlockedCount(save);
  const before = Math.min(save.lastSeenUnlocks ?? FREE_KINDS, now);
  save.lastSeenUnlocks = now;
  return KINDS.slice(before, now);
}

/* --- stars ---------------------------------------------------------------- */

export function starsFor(save, id) {
  const best = save.kinds[id]?.bestStreak || 0;
  return STAR_STREAKS.filter((s) => best >= s).length;
}

export function totalStars(save) {
  return KINDS.reduce((sum, k) => sum + starsFor(save, k.id), 0);
}

/* --- playing -------------------------------------------------------------- */

/* Every answer in the game goes through here, in Journey and in Practice
   alike, which is what keeps a streak meaning the same thing everywhere. */
export function recordAnswer(save, id, right) {
  const rec = kindRecord(save, id);
  rec.played += 1;
  if (right) {
    rec.right += 1;
    rec.streak += 1;
    rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
  } else {
    rec.streak = 0;
  }
  return rec;
}

export function awardPetals(save, n) {
  save.petals += n;
  return save.petals;
}

/* Which puzzles a Journey will ask, in order. Kinds are dealt from a shuffled
   bag that refills when it empties, so a short unlock list repeats evenly
   instead of clumping. The level is not decided here - it is whatever the
   player has climbed to by the time each one comes round. */
export function journeyPlan(save, next) {
  const pool = unlockedKinds(save).map((k) => k.id);
  const rounds = [];
  let bag = [];
  for (let i = 0; i < JOURNEY_LENGTH; i++) {
    if (bag.length === 0) {
      bag = pool.slice();
      for (let j = bag.length - 1; j > 0; j--) {
        const s = Math.floor(next() * (j + 1));
        [bag[j], bag[s]] = [bag[s], bag[j]];
      }
      // Never open a fresh bag with the puzzle that closed the last one.
      if (rounds.length && bag.length > 1 && bag[0] === rounds[rounds.length - 1]) {
        [bag[0], bag[1]] = [bag[1], bag[0]];
      }
    }
    rounds.push(bag.shift());
  }
  return rounds;
}

/* Petals are banked the moment they are earned rather than at the end of a
   run, so walking out of a Journey half way - or running out of hearts on
   question nine - keeps everything already won. */
export function bankAnswer(save, id, right, mode = "journey") {
  const rec = recordAnswer(save, id, right);
  const stepped = stepLevel(rec.level, rec.ladder, right);
  rec.level = stepped.level;
  rec.ladder = stepped.streak;
  if (!right) return 0;
  const petals = mode === "journey" ? PETALS_PER_CORRECT : PETALS_PER_PRACTICE;
  awardPetals(save, petals);
  return petals;
}

/* Only the clean-sweep bonus is left to pay at the end. */
export function finishJourney(save, correct, total) {
  const bonus = correct === total ? PETALS_PERFECT_BONUS : 0;
  awardPetals(save, bonus);
  save.journeys += 1;
  save.bestJourney = Math.max(save.bestJourney, correct);
  return bonus;
}

/* --- storage -------------------------------------------------------------- */

/* localStorage throws outright in some private-browsing modes, so a missing or
   broken save must never be the thing that stops the game loading. */
export function load(storage) {
  try {
    // Reading globalThis.localStorage is itself what throws in some private
    // modes, so even that goes inside the try.
    const raw = (storage || globalThis.localStorage).getItem(SAVE_KEY);
    if (!raw) return newSave();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return newSave();
    return { ...newSave(), ...parsed, kinds: parsed.kinds || {} };
  } catch (error) {
    return newSave();
  }
}

export function store(save, storage) {
  try {
    (storage || globalThis.localStorage).setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (error) {
    return false;
  }
}
