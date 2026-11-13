# Model Forge

Our own image/text-to-3D generator for Salary Man, in the spirit of Modly: a catalogue of open-weight 3D models whose weights we
**download once onto our own cloud GPU** and run there. No Meshy, no Tripo credits, and nothing runs on Hugging Face Spaces or any
hosted inference API (the hub is only used as a file server for the one-time weight download, with Tencent's ModelScope mirror as a
fallback).

```
"a weathered white drink vending machine"           Hunyuan3D 2.1 shape        Hunyuan3D 2.1 PBR paint       forge_finish.py
  or photos (front/left/back/right)   ──► FLUX.1  ──► (or 2mv / Turbo / TripoSG / ──► albedo+metal+rough  ──►  normal + ORM, metres,
                                          schnell     TRELLIS.2)                                               Web/props/<id>.glb
                                          ref image                                                            + props/index.json
```

## Models

| id | what | VRAM | licence |
|---|---|---|---|
| `hunyuan21` (default) | Tencent Hunyuan3D 2.1: shape + PBR texture (albedo, metallic, roughness) | 29 GB | Tencent Hunyuan Community: not licensed in the EU, UK or South Korea |
| `hunyuan2mv` | Hunyuan3D 2mv shape from several views (front/left/back/right), 2.1 paint | 29 GB | same |
| `hunyuan2turbo` | Hunyuan3D 2.0 Turbo + FlashVDM: fast drafts, 2.1 paint | 24 GB | same |
| `trellis2` | Microsoft TRELLIS.2 4B: shape + PBR in one pass, up to 1536³ | 24 GB | MIT (DINOv3 helper is gated: needs HF_TOKEN once) |
| `triposg` | VAST TripoSG 1.5B: crisp hard-surface shape, 2.1 paint | 29 GB | MIT shape |
| `flux-schnell` | FLUX.1 schnell: text prompt to a clean reference photo | (offloaded) | Apache 2.0 |

The catalogue is `catalog.json`. Adding a model = an entry there + a worker in `server/workers/`.

## How Claude uses it

Ask in the project: *"make a rusty bicycle, 1.7 m long"*. Claude runs

```
gh workflow run forge.yml --ref claude/friendly-cannon-alnk4v -f action=make \
   -f prompt="an old rusty Japanese mamachari bicycle with a front basket" -f id=bicycle_rusty_01 -f size=length=1.7
```

The workflow calls the forge on our GPU, waits, finishes the model, runs the AAA gate and commits `Web/props/bicycle_rusty_01.glb`
to the branch. Many at once: `-f action=batch -f spec=Tools/forge/requests/<file>.json` (see `requests/example.json`).
From any computer with Python: `python3 Tools/forge/forge.py make "..." --id ... --height ...` (FORGE_URL/FORGE_TOKEN in
`Tools/forge/forge.env`).

In the game, dial **555-3674** (cheat FORGE) to drop the newest forged models in front of Seiko; from code,
`propPut(parent, "bicycle_rusty_01", x, y, z, yaw)`.

## Setting it up (once)

The forge runs on [Modal](https://modal.com): a serverless GPU that is off (and free) when idle and starts in about a minute
when a model is asked for. An L40S (48 GB) costs about $2 an hour while running; one model takes roughly 2-4 minutes, so
around 10-15 cents each. Modal's Starter plan includes monthly free credit.

1. Make a Modal account, then **Settings > API Tokens > New Token**. Copy the token id and secret.
2. In GitHub: **physicstheory/salaryman > Settings > Secrets and variables > Actions > New repository secret**, add
   `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`. That is all the workflow needs: the password between GitHub and the forge is
   derived from the Modal secret. To use the forge's web page yourself, also add a `FORGE_TOKEN` secret of your own choosing
   (any long random string) and deploy again; that string is then the page's token.
3. Optional, for TRELLIS.2 only: accept the licence on the `facebook/dinov3-vitl16-pretrain-lvd1689m` model page and add a
   read token as `HF_TOKEN`.
4. Run **Actions > Model Forge > Run workflow** with `action = deploy` (or ask Claude). The first deploy builds the GPU image
   (about 40-60 minutes, once) and downloads Hunyuan3D 2.1 and FLUX weights onto the forge's own volume.

**Not Modal?** The same server runs on any NVIDIA GPU box (RunPod pod, Vast.ai, Lambda, a cloud VM, a PC with a 24 GB+ card):
`FORGE_TOKEN=... bash Tools/forge/deploy/bootstrap.sh`, or the Docker image (`Tools/forge/server/Dockerfile`). Then set the
`FORGE_URL` secret to its address and the workflow uses it instead of Modal.

## Files

- `server/app.py` FastAPI job server (queue, one GPU job at a time, web page at `/`, bearer-token auth)
- `server/download.py` one-time weight downloader into `$FORGE_MODELS`; `server/install.sh` builds the two GPU environments
  (`hy`: torch 2.5.1 for Hunyuan/TripoSG/FLUX, `tr2`: torch 2.6 for TRELLIS.2)
- `server/workers/*.py` long-lived GPU workers (models stay in VRAM between jobs); `fake.py` is a CPU stand-in for tests
- `deploy/modal_app.py` Modal app (GPU via `FORGE_GPU`, Volume `salaryman-forge-models`); `deploy/bootstrap.sh` any GPU VM
- `forge.py` client, `forge_finish.py` game finisher, `glbkit.py` dependency-free GLB reader/writer
- `made/<id>/` reference image + job record for every model (raw outputs stay on the server)
- `.github/workflows/forge.yml` deploy / download / make / batch / health
- Test without a GPU: `python3 Tools/forge/test_forge.py`

## Writing good requests

Describe **one object**, its real material and age: *"a dented aluminium Japanese street rubbish bin with a burnable-waste
sticker, slightly grimy"*. The forge adds "single object, photoreal product photo, white background" itself. Real photos or
ChatGPT images of the object on a plain background give the most faithful results; several views → `hunyuan2mv`.
Characters come out unrigged: rig them before they go in `Web/people/real` (see `docs/AAA_GATE.md`).
