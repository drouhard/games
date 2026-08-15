# Games

A small collection of web games, built to be played on an iPhone.

Static files only — no back end, no build step, no dependencies. What's in the
repo is exactly what the browser runs.

**Play:** https://drouhard.github.io/games/

## Layout

```
index.html              launcher — a list of game cards
shared/base.css         iOS/Safari foundation, shared by every page
shared/manifest.json    web app manifest (Add to Home Screen)
shared/icons/           app icons
games/memory/           one folder per game, fully self-contained
tools/make-icons.py     one-off icon generator (not part of serving the site)
```

Every game lives in its own folder under `games/` and owns its HTML, CSS and
JS. Games never import each other — the only shared code is `shared/base.css`.

## Adding a game

1. `mkdir games/<name>` and add an `index.html` there.
2. Link `../../shared/base.css` and copy the `<head>` block from
   `games/memory/index.html` (viewport, manifest, and apple-touch-icon tags).
3. Add a `<a class="game-card">` block to the list in the root `index.html`.

All paths are relative, so the site works both at the repo root and under the
`/games/` path GitHub Pages serves it from.

## Running locally

`fetch` isn't used anywhere, so opening `index.html` straight from Finder works.
To match how Pages serves it — and to reach it from a phone on the same Wi-Fi:

```sh
python3 -m http.server 8000
# then http://<your-mac's-LAN-IP>:8000 on the phone
```

## iPhone notes

These are handled once in `shared/base.css` and the shared `<head>` block:

- `viewport-fit=cover` + `env(safe-area-inset-*)` — content clears the notch
  and the home indicator
- `100dvh` instead of `100vh` — Safari's collapsing URL bar makes `vh` overflow
- `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent` —
  no double-tap zoom, no grey flash on tap
- `overscroll-behavior: none` — no rubber-band bounce over the board
- manifest + `apple-mobile-web-app-capable` — **Add to Home Screen** launches
  fullscreen with no browser chrome, which is what makes it feel like a game

Games listen on `pointerdown` rather than `click` so taps register instantly.
