"""Salary Man Model Forge: a self-hosted image/text-to-3D server for our own GPU.

    uvicorn app:app --host 0.0.0.0 --port 8000        (FORGE_TOKEN=... to require a bearer token)

It keeps a catalogue of open-weight 3D generators (catalog.json: Hunyuan3D 2.1 / 2mv / 2.0 Turbo, TRELLIS.2, TripoSG, and FLUX.1
schnell for text prompts), downloads their weights once to its own disk, and runs them in long-lived GPU workers. One GPU, one job
at a time, in order. Nothing is sent to Hugging Face Spaces or any hosted inference service.

    GET  /                       a small web page to make models by hand
    GET  /health                 GPU, installed weights, queue
    GET  /models                 the catalogue with what is installed
    POST /models/{name}/install  download a pipeline's weights (background)
    POST /jobs                   JSON {prompt | images[{name,data(base64)}] | image_urls[], pipeline, name, seed, faces, octree,
                                 views, tex_res, texture} -> {id}
    GET  /jobs                   recent jobs
    GET  /jobs/{id}              status, timings, log tail, files
    GET  /jobs/{id}/files/{f}    model.glb, shape.glb, reference.png, input_front.png ...
"""
import base64
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
import uuid

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG_PATH = os.environ.get("FORGE_CATALOG") or next(p for p in (os.path.join(HERE, "catalog.json"), os.path.join(HERE, "..", "catalog.json")) if os.path.exists(p))
ROOT = os.environ.get("FORGE_MODELS", "/models")
JOBS = os.environ.get("FORGE_JOBS", os.path.join(ROOT, "jobs"))
VENVS = os.environ.get("FORGE_VENVS", "/opt/forge/venv")
TOKEN = os.environ.get("FORGE_TOKEN", "")
FAKE = os.environ.get("FORGE_FAKE") == "1"  # CPU-only test mode: workers/fake.py stands in for the GPU models
os.makedirs(JOBS, exist_ok=True)
MODAL_VOLUME = None  # set by deploy/modal_app.py so finished jobs are committed to the Volume


def catalog():
    with open(CATALOG_PATH) as f:
        return json.load(f)


def installed(key):
    return os.path.exists(os.path.join(ROOT, ".done", key))


# ---- workers -----------------------------------------------------------------------------------------------------------------------------
class Worker:
    def __init__(self, name, venv):
        self.name, self.venv = name, venv
        py = os.path.join(VENVS, venv, "bin", "python")
        if FAKE or not os.path.exists(py):
            if not FAKE:
                raise RuntimeError("the %s environment is not installed (%s)" % (venv, py))
            py, script = sys.executable, os.path.join(HERE, "workers", "fake.py")
        else:
            script = os.path.join(HERE, "workers", name + ".py")
        self.log_path = None
        self.p = subprocess.Popen([py, "-u", script], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, bufsize=1, env=dict(os.environ, FORGE_MODELS=ROOT))
        self.lines = []
        threading.Thread(target=self._pump, daemon=True).start()
        first = self.p.stdout.readline()
        if not first:
            raise RuntimeError("worker %s died on start:\n%s" % (name, "".join(self.lines[-40:])))

    def _pump(self):
        for line in self.p.stderr:
            self.lines.append(line)
            del self.lines[:-400]
            if self.log_path:
                with open(self.log_path, "a") as f:
                    f.write(line)

    def call(self, job, log_path):
        self.log_path = log_path
        self.p.stdin.write(json.dumps(job) + "\n")
        self.p.stdin.flush()
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError("worker %s crashed:\n%s" % (self.name, "".join(self.lines[-40:])))
        r = json.loads(line)
        if not r.get("ok"):
            raise RuntimeError(r.get("error", "worker failed"))
        return r

    def stop(self):
        try:
            self.p.kill()
            self.p.wait(10)
        except Exception:
            pass


WORKERS = {}


def worker(name, venv):
    w = WORKERS.get(name)
    if w and w.p.poll() is None:
        return w
    for other in list(WORKERS):  # one model family in VRAM at a time
        if other != name:
            WORKERS.pop(other).stop()
    WORKERS[name] = Worker(name, venv)
    return WORKERS[name]


# ---- jobs ---------------------------------------------------------------------------------------------------------------------------------
Q = queue.Queue()
LOCK = threading.Lock()


def jdir(jid):
    if not re.fullmatch(r"[a-z0-9-]{6,64}", jid or ""):
        raise HTTPException(404, "no such job")
    return os.path.join(JOBS, jid)


def jload(jid):
    p = os.path.join(jdir(jid), "job.json")
    if not os.path.exists(p):
        raise HTTPException(404, "no such job")
    with open(p) as f:
        return json.load(f)


def jsave(j):
    d = jdir(j["id"])
    os.makedirs(d, exist_ok=True)
    tmp = os.path.join(d, "job.json.tmp")
    with open(tmp, "w") as f:
        json.dump(j, f, indent=1)
    os.replace(tmp, os.path.join(d, "job.json"))


def jlog(j, msg):
    with open(os.path.join(jdir(j["id"]), "log.txt"), "a") as f:
        f.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), msg))


def run_job(j):
    c = catalog()
    d = jdir(j["id"])
    pl = c["pipelines"][j["pipeline"]]
    missing = [k for k in pl["weights"] if not installed(k)]
    if j.get("prompt") and not j["images"]:
        t2i = c["text_to_image"][c["default_text_to_image"]]
        missing += [k for k in t2i["weights"] if not installed(k)]
    if missing and not FAKE:
        j["state"] = "installing"; jsave(j); jlog(j, "downloading weights first: " + ", ".join(missing))
        subprocess.run([sys.executable, os.path.join(HERE, "download.py"), j["pipeline"]] + (["flux-schnell"] if j.get("prompt") and not j["images"] else []),
                       check=True, stdout=open(os.path.join(d, "log.txt"), "a"), stderr=subprocess.STDOUT)
    log = os.path.join(d, "log.txt")
    if j.get("prompt") and not j["images"]:
        j["state"] = "imagining"; jsave(j)
        t2i = c["text_to_image"][c["default_text_to_image"]]
        prompt = t2i["prompt_template"].format(prompt=j["prompt"])
        jlog(j, "reference image: " + prompt)
        r = worker(t2i["worker"], t2i["venv"]).call({"op": "t2i", "prompt": prompt, "seed": j["seed"], "out": d}, log)
        j["images"] = {"front": r["images"][0]}
        j["timings"]["reference"] = r["seconds"]
    j["state"] = "generating"; jsave(j)
    jlog(j, "generating with %s" % pl["name"])
    job = {k: j[k] for k in ("pipeline", "seed", "faces", "octree", "views", "tex_res", "texture", "steps", "name") if j.get(k) is not None}
    job.update({"op": "generate", "images": j["images"], "out": d})
    r = worker(pl["worker"], pl["venv"]).call(job, log)
    j["timings"]["generate"] = r["seconds"]
    j["files"] = sorted(f for f in os.listdir(d) if re.search(r"\.(glb|png|jpg|obj)$", f))
    j["state"] = "done"


def loop():
    while True:
        jid = Q.get()
        try:
            j = jload(jid)
        except Exception:
            continue
        t0 = time.time()
        j["started"] = t0
        try:
            run_job(j)
        except Exception as e:
            j["state"], j["error"] = "failed", str(e)[-4000:]
            try:
                jlog(j, traceback.format_exc())
            except Exception:
                pass
        j["finished"] = time.time()
        j["timings"]["total"] = round(j["finished"] - t0, 1)
        jsave(j)
        # on Modal the jobs folder is a Volume: commit so another container (or a later one) sees the result
        if MODAL_VOLUME is not None:
            try:
                MODAL_VOLUME.commit()
            except Exception:
                pass


def requeue():
    """After a restart, pick up jobs that never finished."""
    for jid in sorted(os.listdir(JOBS)):
        p = os.path.join(JOBS, jid, "job.json")
        if os.path.exists(p):
            try:
                j = json.load(open(p))
                if j.get("state") in ("queued", "installing", "imagining", "generating"):
                    j["state"] = "queued"; jsave(j); Q.put(jid)
            except Exception:
                pass


# ---- http ---------------------------------------------------------------------------------------------------------------------------------
app = FastAPI(title="Salary Man Model Forge")
_started = False


@app.on_event("startup")
def _start():
    global _started
    if not _started:
        _started = True
        requeue()
        threading.Thread(target=loop, daemon=True).start()


@app.middleware("http")
async def auth(request: Request, call_next):
    if TOKEN and request.url.path not in ("/", "/favicon.ico"):
        got = request.headers.get("authorization", "")
        if got != "Bearer " + TOKEN and request.query_params.get("token") != TOKEN:
            return JSONResponse({"error": "missing or wrong token"}, status_code=401)
    return await call_next(request)


def safe_name(s):
    s = re.sub(r"[^a-z0-9_]+", "_", (s or "").lower()).strip("_")
    return s[:48] or "model"


@app.get("/health")
def health():
    gpu = None
    try:
        gpu = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader"], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        pass
    c = catalog()
    return {"ok": True, "gpu": gpu, "fake": FAKE, "queue": Q.qsize(), "workers": list(WORKERS),
            "installed": [k for k in c["weights"] if installed(k)]}


@app.get("/models")
def models():
    c = catalog()
    out = {}
    for k, p in list(c["pipelines"].items()) + list(c["text_to_image"].items()):
        out[k] = {kk: p[kk] for kk in ("name", "licence", "vram_gb", "quality", "does") if kk in p}
        out[k]["installed"] = all(installed(w) for w in p["weights"])
        out[k]["download_gb"] = round(sum(c["weights"][w].get("gb", 0) for w in p["weights"] if not installed(w)), 1)
    return {"default": c["default_pipeline"], "models": out}


INSTALLS = {}


@app.post("/models/{name}/install")
def install(name: str):
    c = catalog()
    if name not in c["pipelines"] and name not in c["text_to_image"]:
        raise HTTPException(404, "unknown model")
    t = INSTALLS.get(name)
    if t and t.poll() is None:
        return {"state": "downloading"}
    logf = open(os.path.join(ROOT, "install-%s.log" % name), "a")
    INSTALLS[name] = subprocess.Popen([sys.executable, os.path.join(HERE, "download.py"), name], stdout=logf, stderr=subprocess.STDOUT)
    return {"state": "started", "log": "install-%s.log" % name}


def _fetch_url(url, dst):
    if not re.match(r"^https://", url):
        raise HTTPException(400, "image_urls must be https")
    req = urllib.request.Request(url, headers={"User-Agent": "model-forge"})
    with urllib.request.urlopen(req, timeout=60) as r, open(dst, "wb") as f:
        shutil.copyfileobj(r, f, 32 << 20)


@app.post("/jobs")
def create_job(body: dict = Body(...)):
    c = catalog()
    pipeline = body.get("pipeline") or c["default_pipeline"]
    if pipeline not in c["pipelines"]:
        raise HTTPException(400, "pipeline must be one of " + ", ".join(c["pipelines"]))
    jid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    d = os.path.join(JOBS, jid)
    os.makedirs(d)
    views = {}
    order = ["front", "left", "back", "right"]
    for i, im in enumerate(body.get("images") or []):
        view = im.get("view") or order[min(i, 3)]
        p = os.path.join(d, "upload_%s.png" % view)
        with open(p, "wb") as f:
            f.write(base64.b64decode(im["data"]))
        views[view] = p
    for i, url in enumerate(body.get("image_urls") or []):
        view = order[min(len(views), 3)]
        p = os.path.join(d, "upload_%s.img" % view)
        _fetch_url(url, p)
        views[view] = p
    prompt = (body.get("prompt") or "").strip()
    if not views and not prompt:
        shutil.rmtree(d)
        raise HTTPException(400, "give a prompt or at least one image")
    def num(k, lo, hi, dflt):
        v = body.get(k, dflt)
        try:
            return max(lo, min(hi, int(v)))
        except Exception:
            return dflt
    j = {"id": jid, "state": "queued", "created": time.time(), "pipeline": pipeline, "name": safe_name(body.get("name") or prompt[:40]),
         "prompt": prompt, "images": views, "seed": num("seed", 0, 2 ** 31 - 1, 1234), "faces": num("faces", 2000, 2000000, 60000),
         "octree": num("octree", 256, 1536, 1024 if pipeline == "trellis2" else 384), "views": num("views", 6, 9, 8),
         "tex_res": num("tex_res", 512, 768, 768), "texture": bool(body.get("texture", True)), "timings": {}}
    if body.get("steps"):
        j["steps"] = num("steps", 1, 100, 50)
    jsave(j)
    Q.put(jid)
    return {"id": jid, "state": "queued", "position": Q.qsize()}


@app.get("/jobs")
def list_jobs(limit: int = 30):
    ids = sorted(os.listdir(JOBS), reverse=True)[:max(1, min(200, limit))]
    out = []
    for jid in ids:
        try:
            j = jload(jid)
            out.append({k: j.get(k) for k in ("id", "state", "pipeline", "name", "prompt", "created", "timings", "error")})
        except Exception:
            pass
    return out


@app.get("/jobs/{jid}")
def get_job(jid: str):
    j = jload(jid)
    try:
        with open(os.path.join(jdir(jid), "log.txt")) as f:
            j["log"] = f.read()[-6000:]
    except Exception:
        j["log"] = ""
    j["images"] = {k: os.path.basename(v) for k, v in (j.get("images") or {}).items()}
    return j


@app.get("/jobs/{jid}/files/{fname}")
def get_file(jid: str, fname: str):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", fname):
        raise HTTPException(404)
    p = os.path.join(jdir(jid), fname)
    if not os.path.isfile(p):
        raise HTTPException(404)
    return FileResponse(p)


@app.get("/", response_class=HTMLResponse)
def ui():
    with open(os.path.join(HERE, "ui.html")) as f:
        return f.read()
