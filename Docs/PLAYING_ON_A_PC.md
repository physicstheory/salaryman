# Playing it on your laptop

Salary Man runs as a desktop application: a window, a controller, no browser, no
internet. This is how to get one onto a Windows laptop, in the order of how much
work each way is.

---

## The short way: download a build

There is a workflow in the repository that builds the Windows installer in the
cloud, so nothing has to be compiled on your machine. **It needs one click from
you before it will appear**, and this is the one thing about this that is not
obvious:

GitHub only shows a workflow's **Run workflow** button if the workflow file is on
the repository's *default* branch. The game lives on
`claude/friendly-cannon-alnk4v`, and the default branch is still the old
`claude/salary-man-world-base-fngyx5`, which has no workflow on it. So right now
the Actions tab is empty.

**To switch it on, once:**

1. Go to **[Settings → General](https://github.com/physicstheory/salaryman/settings)**.
2. Under **Default branch**, press the pencil, choose
   `claude/friendly-cannon-alnk4v`, and confirm.
3. Go to **[Actions → Build the game](https://github.com/physicstheory/salaryman/actions/workflows/game.yml)**
   and press **Run workflow**.

After about five minutes:

1. Open the run, scroll to **Artifacts**, download **SalaryMan-windows**.
2. Unzip it. Inside is a folder with **Salary Man.exe** in it, next to its
   libraries. Double-click that and the game starts.

### Why this avoids "Windows protected your PC"

That dialog is SmartScreen, and it appears because the build is not code
signed. A certificate costs £200–400 a year, and an ordinary one does not even
silence it straight away — only an Extended Validation certificate does that
immediately. So the build sidesteps it instead.

Windows marks a **downloaded file** with a hidden flag called the mark of the
web, and SmartScreen checks that flag. A downloaded `.exe` carries it. An
`.exe` that you extracted out of a zip usually does not, because the flag
lands on the zip rather than on every file inside it. That is why the build
ships as a zipped folder rather than as an installer: unzip, run the `.exe`
inside, no dialog.

If you ever do see it anyway, two fixes, in order:

1. **Unblock the zip before extracting.** Right-click the downloaded zip →
   **Properties** → tick **Unblock** at the bottom → **OK**, then extract. The
   flag is removed from everything inside.
2. **More info → Run anyway**, as before. It is the same binary either way.

The installer is still built as well, under `SalaryMan-0.5.0-x64.exe`, if you
would rather have a Start-menu entry and are happy to click through the
warning once.

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
git clone -b claude/friendly-cannon-alnk4v https://github.com/physicstheory/salaryman.git
cd salaryman/Game
npm install
npm start
```

The `-b` matters: a plain clone gives you the default branch, which is an older
world with none of the cars, the map, the phone or the controller work on it.

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
