# Games

A small collection of web games, built to be played on an iPhone.

**Play: https://drouhard.github.io/games/**

Static files only — no back end, no build step, no dependencies. GitHub Pages
serves the `main` branch from the repo root, so what's committed is exactly what
the browser runs, and merging to `main` is the whole deploy.

## Layout

```
index.html              launcher — a list of game cards
shared/base.css         iOS/Safari foundation, shared by every page
shared/manifest.json    web app manifest (Add to Home Screen)
shared/icons/           app icons
games/memory/           one folder per game, fully self-contained
tools/make-icons.py     regenerates the icons; not part of serving the site
tools/wild-sim.mjs      balance simulator for Wildermark
tools/deck-sim.mjs      balance simulator for Deckdelve
tools/balance-sim.mjs   balance simulator for Emberdeep
tools/climb-sim.mjs     balance simulator for Stickclimb
tools/hell-sim.mjs      balance simulator for Petalstorm
tools/brine-sim.mjs     balance simulator for Brinewright
tools/bloom-sim.mjs     puzzle checker and simulator for Puzzlebloom
tools/check-sprites.mjs sprite validator, for every game that has sprites
```

Every game lives in its own folder under `games/` and owns its HTML, CSS and JS.
Games never import each other — the only shared code is `shared/base.css`.

All paths are relative, which matters: Pages serves this repo under `/games/`,
not at the domain root, so a leading `/` in an `href` or `src` would 404.

## Adding a game

1. `mkdir games/<name>` and add an `index.html` there.
2. Link `../../shared/base.css` and copy the `<head>` block from
   `games/memory/index.html` (viewport, manifest and apple-touch-icon tags).
3. Add an `<a class="game-card">` block to the list in the root `index.html`.
4. Merge to `main` — that publishes it.

## Games

### Puzzlebloom

Thirteen brain teasers for a nine-year-old, hosted by thirteen chibi animals
painted in watercolour. Nothing in it looks or plays like anything else in this
repo: no combat, no numbers going up, no pixels.

The rule every puzzle in it has to pass is that it cannot be answered by
noticing something. Spotting the odd colour and counting the ducks are
recognition, and a nine-year-old beats them without thinking. So: continue a
number sequence, complete an analogy, solve three simultaneous equations
written in fruit, fill the gap in a pyramid of bricks that are each the two
under them added together, work out who is lying on an island of liars and
truth-tellers, cross off a logic grid, cross a word ladder one letter at a
time, count every square hiding inside a figure, break a shift cipher, fold a
paper net into a cube in your head and say which face lands opposite, tell a
mirrored shape from a turned one, and solve word problems with a snail in a
well and a clock that strikes.

**Two thirds of them are answered on a keypad, not from four cards** — a typed
number cannot be guessed at, and that single decision is most of what makes it
hard.

The difficulty is **remembered per puzzle and per player**. Two right in a row
on a puzzle and it moves up a level; two wrong and it eases off, settling
wherever that child is getting about half of them. It is kept in the save, not
reset each run, because ten questions is not enough to climb from the bottom
and a child who has mastered a puzzle should never be handed the easy version
of it again. A modelled bright player ends up at level 4-5 on the puzzles they
are good at and level 3 on the ones they are not.

**Two taps a puzzle.** Pick or type, then Check — and a right answer shows the
tick, says why in one line and moves on by itself. Only a wrong answer waits,
because that is the one worth reading, and then anywhere on the screen
continues. Nothing is ever scored on the tap that selects it.

**Journey** is ten puzzles and six hearts; **Practice** is one host, endlessly.
Petals are banked the instant they are earned, so running out of hearts on
question nine — or simply walking out — keeps everything already won. Petals
are a lifetime count and hosts unlock at thresholds on it: nothing is ever
spent and a bad run can never take anything away.

The art is watercolour, not pixels: no image files, no sprite grids. Every
creature and token is built in `art.js` out of wobbled point loops painted in
three stacked washes — a pale bleed, the body of the colour, and the rim where
pigment pools at a wet edge — multiplying onto a paper ground. The wobble comes
from a seeded RNG so a token looks the same each time it is drawn.

`tools/bloom-sim.mjs` is why generated puzzles can be trusted. The generator
*builds* a situation forwards; the checker *solves it backwards* from the words
and pictures the player is actually shown, and the two never share a formula.
The liar puzzle is re-solved from its printed sentences, the logic grid from
its printed clues, the cipher re-decoded from the example it prints, the cube
re-folded by rolling a labelled die instead of tracking face normals, every
word problem re-solved from the numbers in its own sentence, and every
sequence re-read by a differencing solver that must reach the same next number.
Anything with two defensible answers is thrown away before it is ever shown.

It has earned its keep: it caught word grids where a palindrome gave two right
answers, a spot counter that wrapped mid-row, a "flower" that was really a
six-pointed star, counting questions whose answer was none, and an analogy that
offered the same word on two different cards. Over 26,000 puzzles it now
reports no faults, the answer lands in each of the four slots about a quarter
of the time, and every difficulty proxy climbs from level 1 to level 5.

### Wildermark

A card-game RPG on the shape of MicroProse's *Shandalar*: an overworld with
towns and dungeons and monsters walking around on it, and a real trading-card
duel every time you meet one.

The rule the whole game hangs off is the one that made Shandalar what it is —
**your life total does not reset between duels**. Damage you take out in the
crags is still gone when the next thing finds you. It comes back slowly on
foot, or all at once for coin at an inn, and deciding how far to push before
you turn back is the entire overworld.

Five colours, five landscapes, five wardens: Sun holds ground and gains life,
Tide flies and bounces, Rot drains and decays, Ember burns, Bramble lands the
biggest bodies early. Each colour owns a region of the map and a keep at the
far end of it, and — the other Shandalar idea — every creature of a colour you
put down out in the world takes two life off that colour's warden before you
ever knock on its door. A warden you have hunted properly opens on 12 instead
of 23. Beat all five and the Spire opens.

Duels are Magic-shaped and cut to fit a phone: one land a turn, coloured mana
with pips, creatures that arrive tired, an attack step where the defender
assigns blocks, and one window for combat tricks. There is deliberately no
mana pool — a spell taps the lands it needs at the moment you cast it, so mana
can never be floating and lost — and no priority ping-pong: instants exist as
`reflex` cards, castable only while blockers are being declared.

Every duel is played for ante. Win and you take a card off the loser; lose and
you lose a spare of yours, or gold if you have no spare. That "spare" is doing
real work: staking a card you own only one of used to dismantle the deck a
card at a time over a run of bad duels, and nothing you won ever caught up.
You can also waive your winnings for coin and a rumour about where a dungeon
is.

Gold buys cards from town markets, nights at an inn, and **leylines** — two
points of maximum life each, forever, getting dearer every time. Quests,
shrines and the bottoms of dungeons pay **sigils**, and two sigils of a colour
teach you that colour's **wildmagic**: Sanctuary heals you free on walking
into a town, Tidewalk steps you to any town you have seen, Grave Tithe pays
your ante in gold, Emberstride freezes everything on the map, Wildpaths makes
rough ground cost nothing.

Losing takes the stake and a walk home and nothing else — you wake at the
nearest town on full life. Backing out of a fight costs coin, never health.
Both of those are the same rule: a retry has to be at least as survivable as
the fight that beat you.

`tools/wild-sim.mjs` plays whole careers in Node — walking, hunting, shopping,
binding leylines, delving, and kicking in keep doors — because the duel, the
map and the career are all DOM-free. Over 400 careers the bot wins about 70%
of roadside duels, 37% in the deep country, 32% against a warden, and sweeps
the whole plane one career in five. It plays worse than a person does.

### Brinewright

An incremental about fermentation, three prestige layers deep. Fields make
grain, tuns make wort, and everything after that is alive.

A vessel is not a building with a number on it — it is an ecology. Everything
in it shares one capacity and settles at its share, and shares are decided by
fitness: how close the temperature is to what a culture likes, how much salt it
tolerates, whether the pH is inside its range, and whether the vessel has the
air it wants. Oxygen is fixed by the container, which is what makes choosing
between a sealed carboy and a porous oak barrel a real decision; the other
three you steer with two dials and the consequences of what you pitched.

The loop the whole game turns on is real fermentation chemistry: anything that
makes acid sours its own vessel, which eventually throttles the culture doing
it and kills the spoilage that would otherwise eat your wort for nothing. Salt
does the same job from the other side. A crock that has soured to pH 3.4 does
not need watching. One that has not will fill with rot.

Co-pitching two cultures costs capacity and pays a named ferment — Sourdough,
SCOBY, Miso, Lambic, Solera, Shoyu, and in three slots Gueuze — but only while
both halves are genuinely thriving, so every symbiosis is a temperature and a
salinity that neither culture hates. Nothing is ever lost for good: a pitched
culture always keeps a smear of the vessel and spoilage never takes all of it,
so a jar that has gone wrong is a puzzle for the two dials, not a bin.

Three ways to start over, each costing everything the layer below it built.
**Rack** for mothers, which pay forever and buy a tree of permanent comforts.
**Bloom** for spores, which buy wild strains that rewrite what a culture will
tolerate — 70% wider heat curves, an extra pH point of sourness, spoilage that
works for you instead of against you. **Ascend** for lineage, whose genes do not
multiply anything: they delete rules, including spoilage itself, starvation,
the offline window and the size of the cellar. Every passive counts what you
have *ever* cultured rather than what is still unspent, so opening a tree never
costs you the bonus that paid for it.

`node tools/brine-sim.mjs` plays twelve-hour careers in Node and reports when
each product first appears, what every rack paid, and where the value curve
goes. It is the only reason the tuning is defensible, and it earned its keep
three times over: it caught a yard whose tuns ate the whole harvest so no
player could ever save up for another field (a permanent deadlock, invisible in
the first five minutes); it caught five multiplier ladders whose gain-over-cost
ratios summed to 2.9 and produced fifty trillion a second in three hours with
no prestige at all; and it caught prestige passives reading the *held* balance,
which made spending a currency shrink the bonus it paid and produced
twenty-five identical racks in a row.

One thing the simulator could not catch, and a browser did: a plain shared
capacity is competitive exclusion, so the fitter culture takes the entire
vessel and its partner dies. True of real chemostats, ruinous for a game about
two cultures in one crock — hence the fitness-proportional shares.

### Stickclimb

An incremental brawler. One screen, two stick figures, an endless ladder of
foes whose health, damage and bounty all climb exponentially.

A fight is a duel you play with your thumbs: the foe throws slabs that travel
across the screen, low ones jumped and high ones slid under, colour-matched to
the two dodge buttons. Every clean dodge banks momentum; **Heavy** spends the
whole stack in one punch, so reading the attacks is what makes the numbers
move. Strike and Focus are on cooldowns underneath.

Scrap buys six upgrades, all exponential in both cost and effect. **Shadow
Twin** keeps swinging while the tab is closed, which is what turns time away
into a lump of scrap on your return. Any rung you have cleared can be refought
for its bounty, and the deeper rung always pays better. Clear ten and **Ascend**
opens: give up the scrap, the gear and the whole ladder for relics, each worth
+35% scrap forever.

Losing costs nothing but the time. You keep every upgrade and retry at full
health — a defeat that left you weaker than the retry needs would just be a
spiral.

`node tools/climb-sim.mjs` plays three-hour careers in Node at three skill
levels and reports where the climb walls, what each Ascend is worth, and how
long a rung takes. It earns its keep: it caught an income upgrade compounding
faster than costs (careers ran to rung 500 with no wall in sight) and a
prestige currency that doubled your reach every reset. Neither is visible from
playing a rung or two.

### Petalstorm

A top-down bullet hell. Four stages, four bosses, and a hitbox two pixels
wide.

Drag anywhere on the field to fly — the ship tracks your thumb rather than
sitting under it, so your hand never covers the thing you are trying to
watch — and the guns fire themselves. Only the bright dot at the centre of the
ship can be hit; the wings pass through everything, which is what makes the
curtains readable instead of merely wide.

Skimming a bullet without being hit is a **graze**: it scores, and it fills
the Bloom meter. **Bloom** throws out a shockwave that erases every bullet it
touches, scores each one, burns whatever craft it sweeps over and leaves you
briefly untouchable — the panic button you have to earn by flying close to
the thing you are afraid of. Losing a ship costs one power stage and
immediately drops two capsules to win it back, so a death never leaves you
weaker than the retry needs.

Three difficulties, each with its own high score: Novice slows every bullet
and hands you five ships, Pilot is the fight as designed, Ace is faster and
denser for two. Die past stage 1 and you can practise the stage you died on;
practice runs don't touch the board.

The field is a fixed 240×360 buffer scaled up by CSS with
`image-rendering: pixelated`, so sprites are always blitted at 1:1 and the art
stays hard-edged at any size — and the rules never depend on the screen. The
bosses are hand-authored mirrored halves; the Petal Queen is eight petals of
one 16-colour palette.

`node tools/hell-sim.mjs` plays complete runs in Node — three thumb qualities
against all three difficulties — and reports clear rates, where runs end, and
what the peak bullet count on screen was. It is the only reason the tuning is
defensible: the first pass killed the average player in stage 1 two ships at a
time, all of it from divers that carried on firing point-blank *from below*
after they had passed you, which is invisible when you are the one dodging.
`--where` breaks a difficulty down by stage, phase and wave, which is how the
stage-2 boss got found sitting on a 1.0-ships-per-run wall.

### Deckdelve

A deckbuilding roguelike in the Dream Quest mould — which means it is a
*dungeon crawl*, not a card gauntlet with a map drawn on it.

You walk a floor in the fog, one tile at a time, lighting the ring around you
as you go. There are monsters, chests, a pedlar, an altar, campfires, and the
stairs down — with the floor's keeper sitting on them. The tiles are finite, so
how much of a floor you clear before you go and fight the keeper is the whole
shape of a run.

Fights are duels. The monster has a deck too: each round it draws its hand and
plays the whole thing face up, and only then do you draw and play — so you act
on what it has already committed to, not on a guessed intent. Attack and
Defense are pools that empty every round; you swing first, so killing it
outright means never being hit. Tap the monster to read its entire deck.

There is no energy. You can play your whole hand, and the constraint is the
deck itself: your class resource — the Knight's Rage, the Adept's Mana, the
Warden's Venom — persists across the fight and gates the big cards, so banking
it is the decision. Modal cards ask which half you want. Ordering matters:
Shield Bash reads the Defense you have already stacked.

Cards do not fall out of winning a fight. Kills give XP, XP gives levels, and a
level is a draft: two cards from your class pool or a boon (max HP, a wider
hand, a card burned out of the deck). Gold buys cards, potions and a burning at
the pedlar; the altar tempers a card or destroys one.

A run is disposable. Lore is not: every run banks it, won or lost, and the
Sanctum spends it on permanent unlocks — max HP, rares in the pool, a third
class, a starting purse, a wider hand, and a map that starts drawn.

Nothing commits on the tap that shows it to you. Tapping a card zooms it and
spells out its rules; a Play button (or one button per mode) is the decision.
Tapping a tile shows what is on it — a monster's HP, how many cards it plays a
round, and its whole deck — before a button walks you into it. The one
exception is walking onto bare stone, which costs nothing and can be walked
back.

Three tools, none of them part of the site:

- `node tools/deck-sim.mjs` plays hundreds of whole careers in Node: walking
  the fog, duelling, levelling, shopping, three keepers. The duel, the dungeon
  and the run state are all DOM-free, which is what makes that possible. The
  numbers are not eyeballable — an early pass had every class dying on floor
  one, and a later one had bosses so armoured that duels could not be won or
  lost at all, which is why the report counts stalemates.
- `node tools/check-sprites.mjs --show` validates every hand-authored sprite's
  row widths and palette characters and draws them in the terminal.

### Emberdeep

A turn-based dungeon descent. Three heroes (Knight, Mage, Cleric) against a
ten-stage ladder ending in a dragon.

You queue commands for the whole party, then everything resolves in speed
order — so SPD matters and each round is a plan you commit to rather than a
reaction. Physical and magic damage, crits, four elements with per-monster
weaknesses, six status effects, shared XP across twelve levels with skills
unlocking as you go, gold, consumables, and three tiers of gear per hero.
Autosaves to `localStorage` after every fight.

Sprites are palette-indexed text rows in `sprites.js`, all drawn from one
16-colour palette (Sweetie-16). Symmetric creatures are authored as an 8-wide
half and mirrored at load — half the typing, and guaranteed symmetry. Sound is
synthesised from oscillators, so there are no binary assets at all.

The combat engine (`combat.js`) has no DOM access: it takes commands and
returns a list of events that the UI replays with animation. That's what makes
`tools/balance-sim.mjs` possible — it plays hundreds of complete runs in Node
and reports fight lengths and wipe rates. Re-run it after changing anything in
`data.js`; the tuning is not eyeballable.

### Memory Match

Six emoji pairs on a 3×4 grid. Tap two cards; matches stay face up, everything
else flips back. Tracks moves and elapsed time, and remembers your fewest-moves
run in `localStorage`.

## iPhone notes

Handled once in `shared/base.css` and the shared `<head>` block, so each game
inherits them:

- `viewport-fit=cover` + `env(safe-area-inset-*)` — content clears the notch and
  the home indicator
- `100dvh` instead of `100vh` — Safari's collapsing URL bar makes `vh` overflow
- `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent` —
  no double-tap zoom, no grey flash on tap
- `overscroll-behavior: none` — no rubber-band bounce over the board
- manifest + `apple-mobile-web-app-capable` — **Add to Home Screen** launches
  fullscreen with no browser chrome, which is what makes it feel like a game

Games listen on `pointerdown` rather than `click` so taps register instantly.

A note on sizing the play area: `aspect-ratio` only derives the dimension you
*don't* set, so a fixed `width` plus `max-height` will overflow in landscape.
The board instead folds height into the width — `width: min(100%, 26rem, 75cqh)`
— with a plain `min(100%, 26rem)` declared first for Safari before 16.
