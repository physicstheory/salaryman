# Web builds: play in a browser, polished and prototype

Every build is also a website, so the game can be played by opening a link: no download, no install.

| Channel | URL | What it is |
|---|---|---|
| Landing | `https://physicstheory.github.io/salaryman/` | both builds, plus the desktop downloads |
| Polished | `https://physicstheory.github.io/salaryman/play/` | the latest-build release's commit (same as the desktop zip), AAA gated |
| Prototype | `https://physicstheory.github.io/salaryman/prototype/` | unpolished experiments; not gated; has a PROTOTYPE badge |

## How builds get there (`.github/workflows/web.yml`)

- **Polished** refreshes after every successful `game.yml` run ("Build the game"). It uses the commit written in the
  `latest-build` release, so `/play/` is always exactly what the desktop download is.
- **Prototype** is replaced by:
  - a push to a branch named `prototype` or `prototype/<anything>`, or
  - a hand run: Actions → Web builds → Run workflow → `prototype_ref` = any branch, tag or commit
    (`gh workflow run web.yml -f prototype_ref=claude/project-thread-xyz`).
- Each deploy rebuilds both channels and keeps the one it was not asked to change (read back from `/status.json`).

The site builder is `Tools/web/build-site.js`. `/prototype/` stores only the files that differ from `/play/`; its service
worker (`Tools/web/proto-sw.js`) serves everything else from `/play/`, which keeps both builds inside GitHub Pages' 1 GB.
three.js is served from `Game/vendor` (same copy as the desktop app), not the CDN.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions.** Pages on a private repository needs
a paid GitHub plan (Pro or above), and the published site is public to anyone with the link.

## Prototype mode in the code (`Web/game/channel.js`)

`window.KONTO_CHANNEL.name` is `polished` (website /play/, desktop app), `prototype` (website /prototype/) or `dev`
(Web/ served directly). Experimental code can sit on the main branch and still never reach the polished build:

```js
KONTO_PROTO.feature("night-markets", () => { /* the experiment */ });  // runs only in prototype and dev
if (KONTO_PROTO.on) { /* same, inline */ }
```

`?proto=1` / `?proto=0` force it on or off anywhere; `?channel=prototype` pretends to be the prototype build.
In the prototype build every localStorage key and Cache name gets a `proto:` prefix, so prototype saves never touch the
polished saves (both builds share one origin). The desktop app is stamped `polished` by `Game/tools/stage.js`
(`KONTO_CHANNEL=prototype npm run dist` stages a prototype desktop build).

## Local test

```sh
node Tools/web/build-site.js --polished . --polished-sha $(git rev-parse HEAD) \
     --proto . --proto-sha $(git rev-parse HEAD) --proto-ref local --out /tmp/site/salaryman
cd /tmp/site && python3 -m http.server 8765   # open http://localhost:8765/salaryman/
```
