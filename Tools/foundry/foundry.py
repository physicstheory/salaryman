"""The Foundry: every game model rebuilt in Blender, headless.

    python3 Tools/foundry/foundry.py list
    python3 Tools/foundry/foundry.py build trains            # a whole category
    python3 Tools/foundry/foundry.py build commuter_end      # one model
    python3 Tools/foundry/foundry.py build all

Needs Blender's Python module (pip install bpy==5.3.0, Python 3.13) or run inside Blender:
    blender -b -P Tools/foundry/foundry.py -- build trains
Output: Web/foundry/<category>/<id>.glb + Web/foundry/index.json. Docs: Tools/foundry/README.md.
"""
import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
sys.path.insert(0, os.path.join(HERE, "gen"))

CATEGORIES = ["trains", "props", "station", "buildings", "interiors", "cars", "people"]


def modules():
    out = {}
    for c in CATEGORIES:
        try:
            out[c] = importlib.import_module(c)
        except ModuleNotFoundError as e:
            if e.name != c:
                raise
    return out


def main(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    mods = modules()
    if argv[0] == "list":
        for c, m in mods.items():
            print(c + ": " + " ".join(m.TARGETS))
        return 0
    if argv[0] == "build":
        want = argv[1:] or ["all"]
        jobs = []
        for w in want:
            for c, m in mods.items():
                if w in ("all", c):
                    jobs += [(m, t) for t in m.TARGETS]
                elif w in m.TARGETS:
                    jobs.append((m, w))
        if not jobs:
            print("nothing matches %s" % want); return 1
        import core
        fails = []
        for m, t in jobs:
            t0 = time.time()
            print("[foundry] %s" % t)
            core.reset()
            import mats; mats._made.clear()
            try:
                m.build(t)
            except Exception as e:
                import traceback; traceback.print_exc()
                fails.append(t)
            print("[foundry] %s done in %.0fs" % (t, time.time() - t0))
        if fails:
            print("[foundry] FAILED: " + " ".join(fails)); return 1
        return 0
    print(__doc__); return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
