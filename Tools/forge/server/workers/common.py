"""Shared plumbing for the forge's GPU workers.

A worker is a long-lived process started by the server inside its own Python environment (each model family pins different
torch/diffusers versions, the way Modly gives every extension its own venv). It keeps its models in VRAM between jobs, reads
one JSON job per line on stdin and answers one JSON line on stdout. Everything else it prints goes to stderr (the job log).
"""
import json
import os
import sys
import time
import traceback

ROOT = os.environ.get("FORGE_MODELS", "/models")
SRC = os.environ.get("FORGE_SRC", "/opt/forge/src")
# never reach out at run time: every weight was fetched by download.py
os.environ.setdefault("HF_HOME", os.path.join(ROOT, "hf"))
os.environ.setdefault("HY3DGEN_MODELS", os.path.join(ROOT, "hy3dgen"))
os.environ.setdefault("U2NET_HOME", os.path.join(ROOT, "u2net"))
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

_out = sys.stdout
sys.stdout = sys.stderr  # libraries that print go to the log, not the protocol


def log(*a):
    print("[%s]" % time.strftime("%H:%M:%S"), *a, file=sys.stderr, flush=True)


def reply(obj):
    _out.write(json.dumps(obj) + "\n")
    _out.flush()


def serve(handlers):
    reply({"ready": True, "pid": os.getpid()})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
        except Exception as e:
            reply({"ok": False, "error": "bad job json: %s" % e})
            continue
        t0 = time.time()
        try:
            op = job.get("op", "generate")
            if op == "ping":
                reply({"ok": True, "pong": True})
                continue
            if op not in handlers:
                raise ValueError("this worker has no op %r" % op)
            res = handlers[op](job) or {}
            res.update({"ok": True, "seconds": round(time.time() - t0, 1)})
            reply(res)
        except Exception as e:
            log(traceback.format_exc())
            reply({"ok": False, "error": "%s: %s" % (type(e).__name__, e), "seconds": round(time.time() - t0, 1)})


def free_cuda():
    try:
        import gc
        import torch
        gc.collect()
        torch.cuda.empty_cache()
    except Exception:
        pass


def load_rgba(path):
    from PIL import Image
    im = Image.open(path)
    im.load()
    return im.convert("RGBA") if im.mode != "RGBA" else im


def has_alpha_cutout(im):
    import numpy as np
    a = np.asarray(im.getchannel("A"))
    return (a < 250).mean() > 0.02


def encode(im, fmt="JPEG", quality=92):
    import io
    b = io.BytesIO()
    if fmt == "JPEG":
        im.convert("RGB").save(b, "JPEG", quality=quality, subsampling=0)
    else:
        im.save(b, fmt)
    return b.getvalue()


def write_pbr_glb(path, vertices, faces, uvs, normals, albedo, metallic=None, roughness=None, name="model"):
    """Assemble the worker's result: albedo, plus an ORM image (R occlusion = white, G roughness, B metallic)."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from glbkit import build_glb
    import numpy as np
    from PIL import Image
    alb = Image.fromarray(albedo) if not isinstance(albedo, Image.Image) else albedo
    mr = None
    if roughness is not None or metallic is not None:
        size = alb.size
        r = np.asarray(Image.fromarray(roughness).convert("L").resize(size)) if roughness is not None else np.full(size[::-1], 200, np.uint8)
        m = np.asarray(Image.fromarray(metallic).convert("L").resize(size)) if metallic is not None else np.zeros(size[::-1], np.uint8)
        o = np.full_like(r, 255)
        mr = encode(Image.fromarray(np.stack([o, r, m], -1)))
    g = build_glb(vertices, faces, uvs, normals, base=encode(alb), mr=mr, name=name)
    g.save(path)
    return path
