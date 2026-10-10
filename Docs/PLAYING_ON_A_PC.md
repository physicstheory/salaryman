# Playing it on your laptop

Salary Man runs as a desktop application: a window, a controller, no browser, no
internet. This is how to get one onto a Windows laptop, in the order of how much
work each way is.

---

## The short way: download a build

Every build is made in the cloud and left on GitHub, so nothing has to be
compiled on your machine.

1. Go to **[the Actions tab](https://github.com/physicstheory/salaryman/actions/workflows/game.yml)**.
2. Pick the newest run with a green tick, scroll to **Artifacts**, and download
   **SalaryMan-windows**.
3. Unzip it. There are two files in it and they do the same thing:
   - `SalaryMan-0.5.0-x64.exe` — the installer. Installs to your user folder, makes
     a desktop shortcut, and shows up in Add or Remove Programs.
   - the portable `.exe` — double-click it, no install, nothing left behind.
4. Windows will say *"Windows protected your PC"*, because the build is not code
   signed. **More info → Run anyway.** Signing costs a few hundred pounds a year
   and is the only thing standing between you and that dialog.

If there is no run with a green tick, go to the workflow page, press **Run
workflow**, wait about five minutes, and the artifact will be there.

**What it needs:** 64-bit Windows 10 or 11, 8 GB of RAM, and a graphics card made
after about 2015 — including the integrated one in a laptop CPU. The first thing
it does is generate the island, which takes **15 to 40 seconds** depending on the
machine. It does that every time, from the same seed, so it is the same island.

---

## Plugging in the controller

Pair the Xbox controller over Bluetooth the way you normally would — hold the
pairing button on the top of the pad until the Xbox button flashes quickly, then
Windows → **Settings → Bluetooth & devices → Add device → Everything else → Xbox
Wireless Controller**. A wired USB cable works too and has no latency.

The game picks the pad up on its own; press a button once after the window is
open. The map screen tells you which pad it found.

### The controls, which are GTA V's

**On foot**

| | |
|---|---|
| Left stick | walk — how far you push it is how fast he walks |
| Right stick | look |
| **X** (hold) | sprint |
| **A** | jump |
| **Y** | get into whatever you are standing next to — a car, or a train at a platform |
| **D-pad up** | the phone |
| **D-pad down** | switch between Seiko and the free camera |
| **Menu** (☰) | the map |
| **View** (⧉) | close whatever is open |

**Driving**

| | |
|---|---|
| **RT** | accelerate |
| **LT** | brake, then reverse |
| Left stick | steer |
| **A** | handbrake |
| **Y** | get out |
| Right stick | look around |

**On the map**

| | |
|---|---|
| Left stick | pan |
| **LT / RT** | zoom out and in |
| **A** | drop a waypoint where the crosshair is |
| **D-pad up/down** | move down the menu |
| **X** | choose |
| **B** or **Menu** | close |

**On the phone**

D-pad moves around the apps, **B** puts it away. The apps do nothing yet.

### If you would rather use the keyboard

WASD walks, shift sprints, space jumps, drag the mouse to look. **F** gets in and
out, **G** swaps between Seiko and the free camera, **P** is the phone, **M** or
**Esc** is the map. On the map: arrows pan, `+` and `−` zoom, click or press
Enter to drop a waypoint.

---

## The longer way: run it from the source

Worth doing if you want to change something and see it immediately.

```
git clone https://github.com/physicstheory/salaryman.git
cd salaryman/Game
npm install
npm start
```

`npm start` stages the engine out of `Web/` into `Game/app/` and opens it in
Electron. Edit `Web/konto.html`, press **Ctrl+R**, and the change is there.

To build an installer for yourself:

```
npm run dist:win      # on Windows
npm run dist:linux    # on Linux
```

The result lands in `Game/dist`.

**Needs:** Node 18 or newer. On Windows, install it from
[nodejs.org](https://nodejs.org) and use PowerShell.

---

## Or just open the page

`Web/konto.html` is the same engine and runs in any browser, which is the
fastest way to look at something without installing anything:

```
python3 -m http.server 8000 --directory Web
```

Then open `http://localhost:8000/konto.html`. The controller works there too —
browsers have had the Gamepad API for years. What you lose is the proper window,
the offline start and the frame rate: a tab is throttled in ways an application
is not.

---

## If it runs badly

In order of how much they buy you:

1. **Turn the shadows off** — the map screen has the switch. On a laptop with
   integrated graphics this is usually worth 30–50%.
2. **Make the window smaller**, or leave it windowed rather than fullscreen.
   Every pixel is a pixel the GPU has to shade.
3. **Plug the laptop in.** Windows caps the GPU hard on battery, and the
   difference is often a factor of two.
4. **Check it is using the real graphics card.** Windows → Settings → System →
   Display → Graphics → find Salary Man → Options → **High performance**.

The island generation is single-threaded arithmetic and is not affected by any
of this — it is the same 15 to 40 seconds whatever you do.
