#!/usr/bin/env python3
"""Model Forge client: ask our own GPU server for a 3D model and put it in the game.

    python3 Tools/forge/forge.py make "a weathered white Japanese drink vending machine" --id vending_drinks_02 --height 1.83
    python3 Tools/forge/forge.py make --image front.jpg --image left.jpg --image back.jpg --id shrine_lantern --height 2.1
    python3 Tools/forge/forge.py batch Tools/forge/requests/street_set.json
    python3 Tools/forge/forge.py models | jobs | health | install trellis2 | get <job-id> --id ... --height ...

Server address and token come from FORGE_URL / FORGE_TOKEN, or from Tools/forge/forge.env (not committed):
    FORGE_URL=https://<your-workspace>--salaryman-forge-serve.modal.run
    FORGE_TOKEN=<the long random token you set on the server>

`make` waits for the job, downloads model.glb and the reference image, runs forge_finish.py (PBR maps, real-world size,
Web/props/<id>.glb + index.json) and keeps the reference and job record in Tools/forge/made/<id>/. Only the standard library
plus numpy and Pillow (for the finish step) are needed.
"""
import argparse
import base64
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MADE = os.path.join(HERE, "made")


def env():
    e = {}
    p = os.path.join(HERE, "forge.env")
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                e[k.strip()] = v.strip()
    url = os.environ.get("FORGE_URL") or e.get("FORGE_URL")
    tok = os.environ.get("FORGE_TOKEN") or e.get("FORGE_TOKEN", "")
    if not url:
        raise SystemExit("Set FORGE_URL (and FORGE_TOKEN) or write them in Tools/forge/forge.env. See Tools/forge/README.md.")
    return url.rstrip("/"), tok


def call(path, body=None, raw=False, timeout=120):
    url, tok = env()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, method="POST" if data else "GET",
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json", "User-Agent": "model-forge-client"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read() if raw else json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:600]
            if e.code in (502, 503, 504) and attempt < 5:  # cold start: the GPU container is waking up
                time.sleep(10 * (attempt + 1))
                continue
            raise SystemExit("forge server said %d: %s" % (e.code, msg))
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 5:
                time.sleep(10 * (attempt + 1))
                continue
            raise SystemExit("cannot reach the forge server at %s (%s)" % (url, e))


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def wait(jid, quiet=False):
    seen, last = 0, None
    while True:
        j = call("/jobs/" + jid, timeout=60)
        log = j.get("log", "")
        if not quiet and len(log) > seen:
            sys.stderr.write(log[seen:] if seen else log[-1500:])
            seen = len(log)
        if j["state"] != last and not quiet:
            print("  %s" % j["state"], flush=True)
            last = j["state"]
        if j["state"] in ("done", "failed"):
            return j
        time.sleep(8)


def fetch(jid, name, dst):
    data = call("/jobs/%s/files/%s" % (jid, name), raw=True, timeout=600)
    with open(dst, "wb") as f:
        f.write(data)
    return dst


def collect(j, spec):
    """Download a finished job and file it in the game."""
    pid = spec["id"]
    d = os.path.join(MADE, pid)
    os.makedirs(d, exist_ok=True)
    raw = fetch(j["id"], "model.glb", os.path.join(d, "raw.glb"))
    for f in j.get("files", []):
        if f.startswith(("reference", "input_front")) and f.endswith(".png"):
            fetch(j["id"], f, os.path.join(d, f))
    rec = {k: j.get(k) for k in ("id", "pipeline", "prompt", "seed", "faces", "octree", "views", "tex_res", "timings")}
    rec["spec"] = spec
    with open(os.path.join(d, "job.json"), "w") as f:
        json.dump(rec, f, indent=1)
    _shrink_refs(d)
    sys.path.insert(0, HERE)
    from forge_finish import finish
    import datetime
    meta = {k: j.get(k) for k in ("pipeline", "prompt", "seed", "faces") if j.get(k) not in (None, "")}
    meta.update({"job": j["id"], "made": datetime.date.today().isoformat()})
    dst, e = finish(raw, pid, spec.get("height"), spec.get("width"), spec.get("length"), float(spec.get("yaw", 0)), int(spec.get("tex", 2048)), meta,
                    spec.get("out"))
    os.remove(raw)  # the raw generator output is large; the job keeps it on the server
    print("✓ %s -> %s  (%.2f x %.2f x %.2f m, %d tris)" % (pid, os.path.relpath(dst, REPO), *e["size"], e["tris"]))
    return dst


def _shrink_refs(d):
    try:
        from PIL import Image
    except ImportError:
        return
    for f in os.listdir(d):
        if f.endswith(".png"):
            p = os.path.join(d, f)
            im = Image.open(p)
            im.thumbnail((768, 768))
            im.convert("RGB").save(p[:-4] + ".jpg", "JPEG", quality=88)
            os.remove(p)


def submit(spec):
    body = {k: spec[k] for k in ("prompt", "pipeline", "seed", "faces", "octree", "views", "tex_res", "steps", "texture") if k in spec}
    body["name"] = spec["id"]
    imgs = spec.get("images") or []
    body["images"] = [{"view": v, "data": b64(p)} for v, p in zip(("front", "left", "back", "right"), imgs) if not p.startswith("https://")]
    body["image_urls"] = [p for p in imgs if p.startswith("https://")]
    if len(imgs) > 1 and body.get("pipeline", "hunyuan21") == "hunyuan21":
        body["pipeline"] = "hunyuan2mv"
    r = call("/jobs", body)
    print("job %s queued for %s (%s)" % (r["id"], spec["id"], body.get("pipeline", "default model")), flush=True)
    return r["id"]


def make(spec):
    jid = submit(spec)
    j = wait(jid)
    if j["state"] != "done":
        raise SystemExit("job %s failed: %s" % (jid, j.get("error")))
    return collect(j, spec)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("make", help="generate one model and add it to the game")
    m.add_argument("prompt", nargs="?", default="")
    m.add_argument("--id", required=True)
    m.add_argument("--image", action="append", default=[], help="photo or render (repeat: front, left, back, right)")
    m.add_argument("--pipeline", help="hunyuan21 (default), hunyuan2mv, hunyuan2turbo, trellis2, triposg")
    for k in ("height", "width", "length", "yaw"):
        m.add_argument("--" + k, type=float)
    for k in ("faces", "seed", "octree", "views", "tex_res", "steps", "tex"):
        m.add_argument("--" + k, type=int)
    b = sub.add_parser("batch", help="make every model in a JSON list of specs")
    b.add_argument("file")
    g = sub.add_parser("get", help="collect a finished job")
    g.add_argument("job")
    g.add_argument("--id", required=True)
    for k in ("height", "width", "length", "yaw"):
        g.add_argument("--" + k, type=float)
    i = sub.add_parser("install", help="download a model's weights onto the server")
    i.add_argument("name")
    sub.add_parser("models")
    sub.add_parser("jobs")
    sub.add_parser("health")
    a = ap.parse_args()

    if a.cmd == "make":
        spec = {k: v for k, v in vars(a).items() if v not in (None, "", []) and k != "cmd"}
        if "image" in spec:
            spec["images"] = spec.pop("image")
        if not spec.get("prompt") and not spec.get("images"):
            raise SystemExit("give a description or at least one --image")
        make(spec)
    elif a.cmd == "batch":
        specs = json.load(open(a.file))
        specs = specs.get("models", specs) if isinstance(specs, dict) else specs
        base = os.path.dirname(os.path.abspath(a.file))
        for s in specs:
            s["images"] = [p if p.startswith("https://") or os.path.isabs(p) else os.path.join(base, p) for p in s.get("images", [])]
        ids = [(s, submit(s)) for s in specs]  # queue them all: the server works through them back to back
        failed = []
        for s, jid in ids:
            j = wait(jid, quiet=True)
            if j["state"] == "done":
                collect(j, s)
            else:
                failed.append(s["id"])
                print("✗ %s: %s" % (s["id"], (j.get("error") or "")[:400]))
        if failed:
            raise SystemExit("failed: " + ", ".join(failed))
    elif a.cmd == "get":
        spec = {k: v for k, v in vars(a).items() if v is not None and k not in ("cmd", "job")}
        collect(call("/jobs/" + a.job), spec)
    elif a.cmd == "install":
        print(json.dumps(call("/models/%s/install" % a.name, {}), indent=1))
    else:
        print(json.dumps(call("/" + a.cmd), indent=1))


if __name__ == "__main__":
    main()
