"""Download the photoscanned PBR sets the Foundry material library asks for (Poly Haven, CC0) into
Tools/foundry/cache/scan/<id>/ as diff/nor_gl/rough/ao/arm .jpg. The cloud build runs this before building; locally
(no internet) the library falls back to its procedural maps.

    python3 Tools/foundry/fetch_textures.py [--res 2k] [ids...]
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
SCAN = os.path.join(HERE, "cache", "scan")
UA = {"User-Agent": "SalaryMan-Foundry/1.0 (game asset build)"}
WANT = {"Diffuse": "diff", "nor_gl": "nor_gl", "Rough": "rough", "AO": "ao", "arm": "arm"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def scan_ids():
    import ast
    src = open(os.path.join(HERE, "lib", "mats.py")).read()
    ids = set()
    for line in src.splitlines():
        if 'scan="' in line:
            ids.add(line.split('scan="')[1].split('"')[0])
    for f in os.listdir(os.path.join(HERE, "gen")):
        if f.endswith(".py"):
            for line in open(os.path.join(HERE, "gen", f)):
                if 'scan="' in line:
                    ids.add(line.split('scan="')[1].split('"')[0])
    return sorted(ids)


def fetch(sid, res):
    d = os.path.join(SCAN, sid)
    if os.path.exists(os.path.join(d, "ok")):
        return "cached"
    files = json.loads(get("https://api.polyhaven.com/files/" + sid))
    os.makedirs(d, exist_ok=True)
    n = 0
    for k, short in WANT.items():
        node = files.get(k, {}).get(res) or files.get(k, {}).get("1k")
        if not node:
            continue
        f = node.get("jpg") or node.get("png")
        if not f:
            continue
        ext = ".jpg" if "jpg" in node else ".png"
        open(os.path.join(d, short + ext), "wb").write(get(f["url"]))
        n += 1
    if n >= 2:
        open(os.path.join(d, "ok"), "w").write(res)
        return "%d maps" % n
    return "no maps"


def main(argv):
    res = "2k"
    if "--res" in argv:
        i = argv.index("--res"); res = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    ids = argv or scan_ids()
    ok = 0
    for sid in ids:
        try:
            r = fetch(sid, res); ok += 1
        except Exception as e:
            r = "FAILED (%s); the procedural fallback will be used" % e
        print("  %-28s %s" % (sid, r))
    print("%d/%d photoscan sets ready in %s" % (ok, len(ids), SCAN))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
