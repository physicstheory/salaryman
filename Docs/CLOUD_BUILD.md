# Building Konto on a cloud machine

What to rent, how to set it up once, and the loop you run after that.

This exists because the build outgrows a laptop before it outgrows anything else. Generating
the island is the expensive part of the project, and it is expensive in memory rather than in
anything a graphics card can help with.

---

## The one thing worth knowing first

**Generating the world needs cores and memory. Looking at it needs a graphics card. They do not
have to be the same machine.**

| | Needs | Costs |
|---|---|---|
| Build the island, the city, the textures | 8+ cores, 32 GB RAM, **no GPU** | ~$0.30–0.60/hr, or free on a trial credit |
| Open the finished scene and play | A GPU, 16 GB RAM | ~$1–2/hr, or ~$45–60/month flat |

So the cheap pattern is: a headless box builds the world and you keep the result; a modest
machine — possibly the one you already have — opens the scene afterwards. The build is a
one-off per seed, not something you repeat every session.

---

## Which machine

**Simplest: a cloud Windows desktop.** Shadow PC Power Pro is about $60/month flat for 28 GB of
RAM and an RTX-class GPU, and it behaves like a PC you remote into. Install Unity on it, work
there. Watch for the 8-hour session cap and the 2-hour idle shutdown — neither matters for a
20-minute build.

**Cheapest: an hourly VM, stopped when you are not using it.** AWS `g6.4xlarge`, Azure NV-series
or GCP G2 all work; 64 GB is available if you want headroom. Set an auto-shutdown on idle, or
you will pay for a machine you forgot about. For *headless* builds only, you do not need the
GPU instance at all — a plain compute instance with 32 GB is a third of the price.

**Free, for a while:** Google Cloud's $300/90 days, Azure's $200/30 days and AWS's ~$100–200
cover a couple of months of evenings. Request GPU quota on day one; new accounts are often
refused it, and Google's trial will not attach a GPU until the account is converted to paid
billing.

---

## First-time setup

This repository is **not** a Unity project — it is the `Assets/SalaryMan` folder that goes
inside one. So the machine needs a project first.

1. **Install Unity Hub**, sign in, and install **Unity 6 (6000.x)**. Add the build-support
   module for whatever you want to ship (Windows is already there on a Windows box).
2. **Create the project**: Hub → New project → **3D (HDRP)**. Call it `Konto`. This is the one
   step that is genuinely easier in the GUI, so it is the one step the script does not do.
3. **Clone this repository** somewhere outside the project:
   ```
   git clone https://github.com/physicstheory/salaryman.git
   ```
4. **Run the script**, which copies the code in and builds the world with no editor window:
   ```powershell
   # Windows
   .\salaryman\Tools\cloud\build-konto.ps1 -ProjectPath C:\Konto -LowMemory
   ```
   ```bash
   # Linux
   ./salaryman/Tools/cloud/build-konto.sh --project ~/Konto --low-memory
   ```
   It pulls, mirrors `Assets/SalaryMan` into the project, and runs the build, printing the
   interesting lines as they happen. Expect 10–30 minutes.

Drop `-LowMemory` / `--low-memory` once you know the machine can take it; it is the difference
between a 16 GB box coping and not, and it costs only the coarseness of the valleys.

**Licence:** sign in to the Hub once on that machine before using batch mode. Unity Personal
allows this; if you destroy and recreate the VM, return the licence from the Hub first or you
will accumulate dead seats.

---

## The loop after that

```
edit code (here, or locally, or through Claude)  ->  git push
on the box:  build-konto.ps1 -ProjectPath C:\Konto      # pulls, copies, rebuilds
open the project, press Play
```

Two things worth doing differently from a local project:

- **Edit code locally, build on the box.** Typing over a streamed desktop is unpleasant; the
  script's `-SkipBuild` / `--skip-build` copies the code across without building, and the GUI
  button (`Tools → SalaryMan → Build Konto`) is still there when you want it.
- **Only rebuild what changed.** `-kontoSteps City` rebuilds the city and leaves the terrain
  alone, which turns 20 minutes into 2:
  ```
  build-konto.sh --project ~/Konto -- -kontoSteps City,Character
  ```
  The step names are the entries of `KontoBuildSteps`: `ConfigureHdrp`, `GroundTextures`,
  `Foliage`, `Terrain`, `Water`, `Environment`, `SpawnPoint`, `City`, `Character`.

---

## Running it with no editor window at all

`KontoBatchBuild` is the command-line entry point. The script calls it, but it is worth knowing
directly, because it is what a build server would use:

```
Unity -quit -batchmode -projectPath <project> \
      -executeMethod SalaryMan.World.EditorTools.KontoBatchBuild.World \
      -kontoLowMemory -logFile -
```

| Switch | Does |
|---|---|
| `-kontoLowMemory` | working resolution 1280, 300k droplets, 512 alphamaps and detail maps, 512 px surfaces |
| `-kontoSeed N` | a different island |
| `-kontoWorking N`, `-kontoDroplets N` | the generator's resolution and erosion budget |
| `-kontoAlphamap N`, `-kontoDetail N` | terrain map resolution — **the biggest single memory item** |
| `-kontoSurfaces N` | edge length of the generated facade textures |
| `-kontoTilesX N`, `-kontoTilesZ N` | a smaller island |
| `-kontoSteps A,B` | build only these steps |
| `-kontoScene PATH` | where to save the scene, and which scene the player build packages |
| `-kontoOutput PATH` | where the packaged player goes |

`KontoBatchBuild.Player` packages a standalone build from the saved scene. Both exit non-zero on
failure, which `-quit` on its own does not do, so a script can tell whether it worked.

If the build dies with a graphics error on a headless Linux box, drop `-nographics` if you added
it, or run under `xvfb-run`. HDRP wants a graphics device for some of what it does even when
nothing is being displayed.

---

## Why low memory works

The defaults are tuned for a 16 GB machine with nothing else running, and the big item is not
the one people expect:

| Item | At default | Why |
|---|---|---|
| Terrain alphamaps | **~1.4 GB** | 11 layers × 1024² floats × 30 tiles |
| Detail (grass) maps | ~1.4 GB | same arithmetic |
| Facade textures while painting | ~470 MB | 28 PBR sets × 4 maps × 1024² |
| The generator's working raster | ~200 MB | 2560 × 2133 floats, several fields |

Halving the first two is a 4× cut on 2.8 GB, and nothing about the island changes — the
splatmap is simply sampled more coarsely, which at terrain scale is invisible from the ground.

---

## Getting the result off the machine

The generated world is **not** in git, on purpose: it is large, binary, and reproducible from
the seed. So either leave it on the box and treat the box as where the project lives, or — if
you want to move it — zip `Assets/SalaryMan/World/Generated` and the scene file together. A
built player is simpler to move than the project: `--player` puts one in `Build/Konto`.

Code changes go back the way they came, through git.
