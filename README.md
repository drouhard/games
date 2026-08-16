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
tools/deck-sim.mjs      balance simulator for Deckdelve
tools/balance-sim.mjs   balance simulator for Emberdeep
tools/climb-sim.mjs     balance simulator for Stickclimb
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

### Deckdelve

A deckbuilding roguelike, in the Dream Quest mould: pick a class, take a
ten-card deck down three floors, and build it into something that can kill the
thing at the bottom.

Fights are turn-based over a hand of cards — three or four Energy a turn, Block
that resets, monsters that telegraph exactly what they will do next, so every
turn is a decision with complete information. Each floor is three doors of your
choosing (fight, elite, camp, shrine) and then its keeper. Winning a fight
offers a card; camps heal or upgrade one; shrines add a rare or burn a card out
of the deck for good.

Nothing commits on the tap that shows it to you. Tapping a card zooms it and
spells out its rules; a Play button spends the energy. Tapping a door lists the
monsters behind it, their HP and their whole repertoire; a button walks through
it. Same for classes, card rewards, upgrades and Sanctum unlocks — read first,
decide second, which is how Slay the Spire and Dream Quest handle a screen you
are poking with a thumb.

A run is disposable. Echoes are not: every run banks them, won or lost, and the
Sanctum spends them on permanent unlocks — more HP, rares in the reward pool, a
third class, an upgraded starting card. The whole board is about eight runs of
play.

Two tools, neither of them part of the site:

- `node tools/deck-sim.mjs` plays hundreds of complete careers in Node and
  reports clear rates, fight lengths and where runs end. The fight engine and
  the run state are both DOM-free, which is what makes that possible; the
  numbers in `data.js` are not eyeballable, and the first pass of them cleared
  0% of runs while looking perfectly reasonable in a single fight.
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
