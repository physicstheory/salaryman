"""Download the forge's open weights onto our own disk, once.

    python download.py                 # every pipeline in the catalogue
    python download.py hunyuan21 trellis2
    python download.py --list          # what is installed, with sizes

Weights land in $FORGE_MODELS (default /models):
    /models/hf/...              the Hugging Face cache layout (HF_HOME), so libraries that ask for "tencent/Hunyuan3D-2.1"
                                find it locally and never call out (the server runs with HF_HUB_OFFLINE=1)
    /models/hy3dgen/<repo>      links Hunyuan's own loaders look in (HY3DGEN_MODELS)
    /models/ckpt, /models/u2net small files fetched by URL

This is the only step that talks to the internet. The Hugging Face hub is used purely as a file server for the weight files
(the same as `git lfs pull`); if it is unreachable, Hunyuan falls back to its ModelScope mirror. Gated repos (DINOv3, used by
TRELLIS.2) need HF_TOKEN set for the download, never afterwards.
"""
import json
import os
import re
import shutil
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.environ.get("FORGE_CATALOG") or next(p for p in (os.path.join(HERE, "catalog.json"), os.path.join(HERE, "..", "catalog.json")) if os.path.exists(p))
ROOT = os.environ.get("FORGE_MODELS", "/models")
os.environ.setdefault("HF_HOME", os.path.join(ROOT, "hf"))
os.environ.pop("HF_HUB_OFFLINE", None)  # this script is the one place that may download


def cat():
    with open(CATALOG) as f:
        return json.load(f)


def marker(key):
    return os.path.join(ROOT, ".done", key)


def done(key):
    return os.path.exists(marker(key))


def mark(key, info):
    os.makedirs(os.path.dirname(marker(key)), exist_ok=True)
    with open(marker(key), "w") as f:
        json.dump(info, f)


def hf_get(repo, include=None):
    from huggingface_hub import snapshot_download
    tok = os.environ.get("HF_TOKEN") or None
    try:
        return snapshot_download(repo_id=repo, allow_patterns=include, token=tok)
    except Exception as e:
        print("  hub download failed for %s: %s" % (repo, e), flush=True)
        raise


def ms_get(repo, include):
    from modelscope import snapshot_download as ms_dl
    d = os.path.join(ROOT, "modelscope", repo)
    ms_dl(repo, local_dir=d, allow_patterns=include)
    return d


def link_hy3dgen(repo, path):
    dst = os.path.join(ROOT, "hy3dgen", repo)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.islink(dst) or os.path.exists(dst):
        if os.path.realpath(dst) == os.path.realpath(path):
            return
        if os.path.islink(dst):
            os.unlink(dst)
        else:
            shutil.rmtree(dst)
    os.symlink(path, dst)


def repos_in_pipeline_json(path):
    """TRELLIS.2's pipeline.json names its helper models (image encoder, background remover, shared decoders) as hub ids."""
    found = set()
    for fn in ("pipeline.json",):
        p = os.path.join(path, fn)
        if not os.path.exists(p):
            continue
        txt = open(p).read()
        for m in re.finditer(r'"([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)(?:/[^"]*)?"', txt):
            rid = m.group(1)
            if rid.startswith(("ckpts", "./")) or rid.count("/") != 1:
                continue
            found.add(rid)
    return sorted(found)


def fetch(key, w):
    if done(key):
        print("= %s already installed" % key, flush=True)
        return
    print("+ %s (about %s GB)" % (key, w.get("gb", "?")), flush=True)
    info = {"key": key}
    if "url" in w:
        dst = os.path.join(ROOT, w["to"])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        tmp = dst + ".part"
        urllib.request.urlretrieve(w["url"], tmp)
        os.replace(tmp, dst)
        info["path"] = dst
    else:
        try:
            path = hf_get(w["hf"], w.get("include"))
        except Exception:
            if not w.get("ms"):
                raise
            print("  trying the ModelScope mirror", flush=True)
            path = ms_get(w["ms"], w.get("include"))
        info["path"] = path
        if w.get("link_hy3dgen"):
            link_hy3dgen(w["hf"], path)
        if w.get("follow_pipeline_json"):
            extra = [r for r in repos_in_pipeline_json(path) if r != w["hf"]]
            for r in extra:
                print("  helper %s" % r, flush=True)
                try:
                    hf_get(r)
                except Exception as e:
                    if r in w.get("gated_helpers", []) and not os.environ.get("HF_TOKEN"):
                        raise SystemExit("%s is a gated model: accept its licence on its model page, then set HF_TOKEN (a read token) "
                                         "for this download step only." % r) from e
                    raise
            info["helpers"] = extra
    mark(key, info)


def size_of(p):
    t = 0
    for d, _, fs in os.walk(p, followlinks=False):
        for f in fs:
            try:
                t += os.path.getsize(os.path.join(d, f))
            except OSError:
                pass
    return t


def main(argv):
    c = cat()
    if "--list" in argv:
        for k in c["weights"]:
            print("%-14s %s" % (k, "installed" if done(k) else "-"))
        print("disk used: %.1f GB" % (size_of(ROOT) / 1e9))
        return
    names = [a for a in argv if not a.startswith("-")] or list(c["pipelines"]) + list(c["text_to_image"])
    keys = []
    for n in names:
        entry = c["pipelines"].get(n) or c["text_to_image"].get(n)
        if entry is None and n in c["weights"]:
            entry = {"weights": [n]}
        if entry is None:
            raise SystemExit("unknown model %r (pick from: %s)" % (n, ", ".join(list(c["pipelines"]) + list(c["text_to_image"]))))
        for k in entry["weights"]:
            if k not in keys:
                keys.append(k)
    os.makedirs(ROOT, exist_ok=True)
    for k in keys:
        fetch(k, c["weights"][k])
    print("all weights ready in %s" % ROOT, flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
