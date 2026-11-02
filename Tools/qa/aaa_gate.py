#!/usr/bin/env python3
"""Salary Man AAA gate: the quality check every push must pass (Claude, ChatGPT/Codex, anyone).

    python3 Tools/qa/aaa_gate.py                 run every check (about 5-40 s)
    python3 Tools/qa/aaa_gate.py --only pbr,cars run some categories
    python3 Tools/qa/aaa_gate.py --ratchet       drop fixed items from the known-debt list (always allowed)
    python3 Tools/qa/aaa_gate.py --json out.json machine-readable report

Exit code 0 = pass, 1 = fail. A failure prints numbered instructions: do them, re-run, then push.
Read docs/AAA_GATE.md for the rules, the debt baseline and what is never allowed.
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

RULES = os.path.join(HERE, "rules.json")
BASELINE = os.path.join(HERE, "baseline.json")
CACHE = os.path.join(ROOT, ".qa-cache")

CAT_TITLE = {"pbr": "PBR textures", "characters": "Realistic characters", "cars": "Cars", "buildings": "Buildings",
             "street": "Street detail", "lived_in": "Lived-in world"}


class Ctx:
    def __init__(self, root, rules, tex):
        self.root, self.rules, self.tex = root, rules, tex
        self.findings, self.info = [], {}
        self._glb, self._txt = {}, {}

    def fail(self, cat, key, where, problem, fix):
        self.findings.append({"sev": "FAIL", "cat": cat, "key": key, "where": where, "problem": problem, "fix": fix})

    def warn(self, cat, key, where, problem, fix):
        self.findings.append({"sev": "WARN", "cat": cat, "key": key, "where": where, "problem": problem, "fix": fix})

    def glb(self, path):
        from glb import GLB
        if path not in self._glb:
            self._glb[path] = GLB(path)
        return self._glb[path]

    def read(self, rel):
        if rel not in self._txt:
            p = os.path.join(self.root, rel)
            try:
                with open(p, encoding="utf-8", errors="replace") as f:
                    self._txt[rel] = f.read()
            except OSError:
                self._txt[rel] = ""
        return self._txt[rel]


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def git_show(ref, rel):
    try:
        out = subprocess.run(["git", "-C", ROOT, "show", "%s:%s" % (ref, rel)], capture_output=True, timeout=20)
        if out.returncode == 0:
            return json.loads(out.stdout.decode("utf-8"))
    except Exception:
        pass
    return None


# ---- loosening guard: the gate may only get stricter unless Duncan approves ------------------

def loosened(old, new, path=""):
    """List the ways `new` is laxer than `old` (rules.json semantics)."""
    out = []
    if isinstance(old, dict):
        if not isinstance(new, dict):
            return ["%s was replaced" % path]
        for k, v in old.items():
            if k.startswith("_"):
                continue
            p = path + "." + k if path else k
            if k not in new:
                out.append("%s was removed" % p)
            else:
                out += loosened(v, new[k], p)
    elif isinstance(old, bool) or isinstance(old, str):
        pass
    elif isinstance(old, (int, float)):
        if isinstance(new, (int, float)):
            leaf = path.split(".")[-1]
            looser = new > old if leaf.startswith("max") or leaf == "budget_seconds" else new < old
            if looser:
                out.append("%s went from %s to %s" % (path, old, new))
    elif isinstance(old, list):
        if isinstance(new, list):
            gone = [x for x in old if x not in new]
            if gone:
                out.append("%s lost %s" % (path, ", ".join(map(str, gone))))
    return out


def guard(ref):
    """Compare rules.json and baseline.json against `ref`. Returns a list of problems."""
    probs = []
    old_rules = git_show(ref, "Tools/qa/rules.json")
    if old_rules:
        probs += ["rules.json: " + x for x in loosened(old_rules, load_json(RULES, {}))]
    old_base = git_show(ref, "Tools/qa/baseline.json")
    if old_base is not None:
        added = sorted(set(load_json(BASELINE, {}).get("debt", {})) - set(old_base.get("debt", {})))
        if added:
            probs.append("baseline.json: %d new problem(s) were written into the known-debt list instead of being fixed (e.g. %s)" % (len(added), added[0]))
    return probs


# ---- report --------------------------------------------------------------------------------

def wrap(s, ind, width=100):
    words, lines, cur = s.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width - len(ind):
            lines.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return ("\n" + ind).join(lines)


def main():
    ap = argparse.ArgumentParser(description="Salary Man AAA quality gate")
    ap.add_argument("--only", help="comma list of categories: " + ",".join(CAT_TITLE))
    ap.add_argument("--json", help="write the full report as JSON here")
    ap.add_argument("--ratchet", action="store_true", help="remove fixed items from baseline.json (never adds)")
    ap.add_argument("--init-baseline", action="store_true", help="record every current failure as known debt (first install only; Duncan-approved)")
    ap.add_argument("--against", help="git ref to compare rules/baseline with; fails if the gate was loosened")
    ap.add_argument("--allow-loosen", action="store_true", help="Duncan approved loosening the gate for this push")
    ap.add_argument("--all", action="store_true", help="list every known-debt item, not just the top ones")
    a = ap.parse_args()

    try:
        import numpy  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        print("AAA GATE: cannot run, Python needs Pillow and numpy.\n  Fix: python3 -m pip install pillow numpy   (then push again)")
        return 1

    import checks
    t0 = time.time()
    rules = load_json(RULES, None)
    if rules is None:
        print("AAA GATE: Tools/qa/rules.json is missing or invalid. Restore it from git."); return 1
    base = load_json(BASELINE, {"debt": {}})
    debt = base.get("debt", {})
    tex = checks.TexCache(os.path.join(CACHE, "textures.json"))
    ctx = Ctx(ROOT, rules, tex)
    only = set(a.only.split(",")) if a.only else None
    timings = {}
    for cat, fn in checks.ALL:
        if only and cat not in only:
            continue
        t = time.time()
        try:
            fn(ctx)
        except Exception as e:  # a broken check must not let things through silently
            import traceback
            ctx.fail(cat, "check-crashed:" + cat, "Tools/qa/checks.py", "the %s check crashed: %r" % (cat, e),
                     "Fix the check or the data it reads; traceback:\n" + traceback.format_exc(limit=3))
        timings[cat] = time.time() - t
    tex.save()
    elapsed = time.time() - t0

    fails = [f for f in ctx.findings if f["sev"] == "FAIL"]
    warns = [f for f in ctx.findings if f["sev"] == "WARN"]
    new = [f for f in fails if f["key"] not in debt]
    old = [f for f in fails if f["key"] in debt]
    prio = {"characters": 0, "street": 1, "lived_in": 2, "buildings": 3, "cars": 4, "pbr": 5}
    old.sort(key=lambda f: (prio.get(f["cat"], 9), f["key"].startswith("code-bare")))
    new.sort(key=lambda f: (prio.get(f["cat"], 9), f["key"].startswith("code-bare")))
    fail_keys = {f["key"] for f in fails}
    ran = {c for c, _ in checks.ALL if not only or c in only}
    fixed = [k for k, v in debt.items() if k not in fail_keys and v.get("cat") in ran]

    if a.init_baseline:
        base = {"_about": "Known AAA debt recorded when the gate was installed. Items here don't block pushes, but nothing new may be added (CI checks). Fix them and run --ratchet.",
                "debt": {f["key"]: {"cat": f["cat"], "where": f["where"], "problem": f["problem"]} for f in fails}}
        with open(BASELINE, "w", encoding="utf-8") as fh:
            json.dump(base, fh, indent=1, sort_keys=True, ensure_ascii=False); fh.write("\n")
        print("Recorded %d known-debt items in Tools/qa/baseline.json" % len(fails))
        return 0
    if a.ratchet and fixed:
        for k in fixed:
            debt.pop(k, None)
        base["debt"] = debt
        with open(BASELINE, "w", encoding="utf-8") as fh:
            json.dump(base, fh, indent=1, sort_keys=True, ensure_ascii=False); fh.write("\n")

    guard_probs = guard(a.against) if a.against else []
    if guard_probs and a.allow_loosen:
        guard_probs = []

    over = elapsed > rules.get("budget_seconds", 60)
    ok = not new and not guard_probs

    # ---- print -------------------------------------------------------------------------
    P = print
    P("=" * 100)
    P(" SALARY MAN  AAA GATE   %s   (%.1f s)" % ("PASS" if ok else "FAIL", elapsed))
    P("=" * 100)
    for cat in [c for c, _ in checks.ALL if c in ran]:
        n = sum(1 for f in new if f["cat"] == cat); d = sum(1 for f in old if f["cat"] == cat); w = sum(1 for f in warns if f["cat"] == cat)
        mark = "FAIL" if n else ("debt" if d else " ok ")
        P(" [%s] %-22s new problems: %-3d known debt: %-3d advice: %-3d %5.1fs" % (mark, CAT_TITLE[cat], n, d, w, timings.get(cat, 0)))
    if ctx.info.get("code_waivers"):
        P("        (%d colour-only materials carry an aaa-ok waiver comment)" % ctx.info["code_waivers"])
    if fixed:
        P("\n Fixed since the baseline: %d item(s).%s" % (len(fixed), " Removed from baseline.json." if a.ratchet else " Run: python3 Tools/qa/aaa_gate.py --ratchet  and commit Tools/qa/baseline.json to lock that in."))
    if over:
        P("\n Note: took %.0f s, over the %d s budget. Run again (the texture cache makes repeats fast)." % (elapsed, rules["budget_seconds"]))

    if guard_probs:
        P("\n" + "-" * 100)
        P(" THE GATE WAS LOOSENED. This push is blocked:")
        for g in guard_probs:
            P("   - " + g)
        P(" Undo those edits. Problems must be fixed, not written into baseline.json or rules.json.")
        P(" Only Duncan can approve loosening (commit message tag [aaa-loosen-approved]).")

    if new:
        P("\n" + "-" * 100)
        P(" BLOCKING: %d new problem(s). Instructions for ChatGPT / Claude, do every one, re-run, then push:" % len(new))
        P("-" * 100)
        for i, f in enumerate(new, 1):
            P("\n %d. [%s] %s" % (i, CAT_TITLE[f["cat"]], f["where"]))
            P("    Problem: " + wrap(f["problem"], "             "))
            P("    Fix:     " + wrap(f["fix"], "             "))

    if old:
        P("\n" + "-" * 100)
        P(" Known AAA debt (%d items, not blocking; fixing any of these is the best next work):" % len(old))
        show = old if a.all else old[:12]
        for f in show:
            P("   - [%s] %s: %s" % (CAT_TITLE[f["cat"]], f["where"], f["problem"]))
        if len(old) > len(show):
            P("   ... and %d more (python3 Tools/qa/aaa_gate.py --all)" % (len(old) - len(show)))
    if warns and (new or a.all):
        P("\n Advice (%d, not blocking): run with --all to list it." % len(warns) if not a.all else "\n Advice:")
        if a.all:
            for f in warns:
                P("   - [%s] %s: %s  ->  %s" % (CAT_TITLE[f["cat"]], f["where"], f["problem"], f["fix"]))
    P("\n" + ("PASS: OK to push." if ok else "FAIL: do not push until this passes. Never bypass it (no --no-verify, no editing rules.json/baseline.json)."))

    report = {"ok": ok, "seconds": round(elapsed, 2), "new": new, "debt": old, "advice": warns, "fixed": fixed, "guard": guard_probs, "timings": timings}
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, "last-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=1)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
