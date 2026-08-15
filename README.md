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
