#!/usr/bin/env python3
"""Akio Sotiyama, the boss of SOTI: a big, heavy man.

Takes a Rocketbox businessman from Web/people/real and rebuilds the body as an overweight one: a belly that leads, a thick waist and chest,
a short thick neck, jowls, heavy arms and thighs. The skeleton, weights, UVs and PBR maps are untouched, so every animation, the lip sync
and the character shader work as before. Each vertex is pushed out from the axis of the bones it is skinned to, by an amount per bone,
so the seams between body parts stay closed.

    python3 Tools/characters/build_boss.py            # salaryman_04.glb -> boss_akio.glb, and the cast index entry
"""
import json, struct, sys, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.normpath(os.path.join(HERE, "../../Web/people/real"))
SRC, OUT, NAME = "salaryman_04.glb", "boss_akio.glb", "boss_akio"

# how far each bone's skin moves out from the bone (1 = twice as thick), front bias for the belly
TORSO = {"Bip01 Pelvis": (0.34, 0.30), "Bip01 Spine": (0.50, 0.85), "Bip01 Spine1": (0.44, 0.62), "Bip01 Spine2": (0.26, 0.22), "Bip01 Neck": (0.36, 0.10)}
LIMB = {"Thigh": 0.24, "Calf": 0.10, "UpperArm": 0.26, "Forearm": 0.12, "Clavicle": 0.14}
CTYPE = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(path):
    d = open(path, "rb").read()
    off, js, bn = 12, None, b""
    while off + 8 <= len(d):
        n, t = struct.unpack("<II", d[off:off + 8]); c = d[off + 8:off + 8 + n]
        if t == 0x4E4F534A: js = json.loads(c.decode("utf-8"))
        elif t == 0x004E4942: bn = bytearray(c)
        off += 8 + n
    return js, bn


def view(js, bn, ai):
    a = js["accessors"][ai]; bv = js["bufferViews"][a["bufferView"]]
    fmt, size = CTYPE[a["componentType"]]; n = NCOMP[a["type"]]
    stride = bv.get("byteStride") or size * n
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    arr = np.ndarray((a["count"], n), dtype=np.dtype("<" + fmt), buffer=bn, offset=start, strides=(stride, size))
    return a, arr


def main():
    js, bn = load(os.path.join(REAL, SRC))
    nodes, skin = js["nodes"], js["skins"][0]
    joints = skin["joints"]; names = [nodes[j].get("name", "") for j in joints]
    _, ibm = view(js, bn, skin["inverseBindMatrices"])
    bind = np.array([np.linalg.inv(m.reshape(4, 4).T)[:3, 3] for m in ibm.astype(np.float64)])     # each joint's place in the mesh's bind space
    at = {n: bind[i] for i, n in enumerate(names)}
    child = {}
    for j in joints:
        for c in nodes[j].get("children", []):
            if c in joints: child.setdefault(nodes[j]["name"], nodes[c]["name"])
    up = at["Bip01 Head"] - at["Bip01 Pelvis"]; ax = int(np.argmax(np.abs(up))); upv = np.zeros(3); upv[ax] = np.sign(up[ax])
    height = abs(up[ax])
    fwd = at["Bip01 MNose"] - at["Bip01 Head"]; fwd -= upv * fwd.dot(upv); fwd /= np.linalg.norm(fwd)
    side = np.cross(upv, fwd)
    jaw_h, eye_h = at["Bip01 MJaw"].dot(upv), at["Bip01 REye"].dot(upv)
    head_w = np.array([1.0 if n in ("Bip01 Head",) or n.startswith("Bip01 M") or "Cheek" in n or "Masseter" in n or "Mouth" in n or "lip" in n.lower() or "Caninus" in n else 0.0 for n in names])
    torso_k = np.array([TORSO.get(n, (0, 0))[0] for n in names]); torso_f = np.array([TORSO.get(n, (0, 0))[1] for n in names])
    limb = [(i, n, next(v for k, v in LIMB.items() if n.endswith(k))) for i, n in enumerate(names) if any(n.endswith(k) for k in LIMB)]
    moved = 0
    for mesh in js["meshes"]:
        for prim in mesh["primitives"]:
            A = prim["attributes"]
            pa, pos = view(js, bn, A["POSITION"]); _, jn = view(js, bn, A["JOINTS_0"]); wa, w = view(js, bn, A["WEIGHTS_0"])
            P = pos.astype(np.float64); J = jn.astype(np.int64); W = w.astype(np.float64)
            if wa["componentType"] != 5126: W /= (255.0 if wa["componentType"] == 5121 else 65535.0)
            W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
            D = np.zeros_like(P)
            # the trunk: out from the spine, and the belly out in front
            root = at["Bip01 Spine"]
            rel = P - root; rad = rel - np.outer(rel.dot(upv), upv)
            front = np.clip(rad.dot(fwd) / (0.11 * height / 0.6), -1, 1)
            k = (W * torso_k[J]).sum(1); kf = (W * torso_f[J]).sum(1)
            D += rad * k[:, None] * (1 + 0.25 * np.maximum(front, 0))[:, None]
            D += np.outer(kf * np.maximum(front, 0) ** 1.5 * 0.085 * height / 0.6, fwd)
            D -= np.outer(kf * np.maximum(front, 0) ** 1.5 * 0.018 * height / 0.6, upv)        # and it hangs a little
            # limbs: out from their own bone
            for i, n, kk in limb:
                wi = (W * (J == i)).sum(1)
                if not wi.any(): continue
                a = at[n]; b = at.get(child.get(n, ""), a + upv * 0.1); d = b - a; L = np.linalg.norm(d) or 1; d /= L
                r = P - a; t = np.clip(r.dot(d), 0, L); perp = r - np.outer(t, d)
                taper = 1 - 0.55 * (t / L)                                                        # heavier at the top of the limb
                D += perp * (wi * kk * taper)[:, None]
            # the face: jowls and a double chin below the eyes
            hw = (W * head_w[J]).sum(1)
            if hw.any():
                h = P.dot(upv); low = np.clip((eye_h - h) / max(1e-6, eye_h - jaw_h), 0, 1.6)
                r = P - at["Bip01 Head"]; lat = r.dot(side)
                D += np.outer(hw * low * 0.13 * lat, side)
                under = np.clip((jaw_h - h) / (0.05 * height / 0.6) + 0.4, 0, 1) * np.clip(r.dot(fwd) / (0.05 * height / 0.6), 0, 1)
                D += np.outer(hw * under * 0.016 * height / 0.6, fwd) - np.outer(hw * under * 0.012 * height / 0.6, upv)
            pos[:] = (P + D).astype(pos.dtype)
            pa["min"] = [float(x) for x in pos.min(0)]; pa["max"] = [float(x) for x in pos.max(0)]
            moved += int((np.abs(D).sum(1) > 1e-6).sum())
    for m in js.get("materials", []): m["name"] = m["name"]
    jb = json.dumps(js, separators=(",", ":")).encode("utf-8"); jb += b" " * (-len(jb) % 4); bn += b"\0" * (-len(bn) % 4)
    out = os.path.join(REAL, OUT)
    with open(out, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(jb) + 8 + len(bn)))
        f.write(struct.pack("<II", len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack("<II", len(bn), 0x004E4942)); f.write(bn)
    ixp = os.path.join(REAL, "index.json"); ix = json.load(open(ixp))
    base = next(e for e in ix["people"] if e["file"] == SRC)
    ix["people"] = [e for e in ix["people"] if e["file"] != OUT]
    e = dict(base); e.update({"file": OUT, "name": NAME, "identity": "Akio Sotiyama, the boss of SOTI", "bytes": os.path.getsize(out), "story": True, "build": "heavy"})
    ix["people"].append(e)
    json.dump(ix, open(ixp, "w"), indent=1, ensure_ascii=False)
    print("boss: %d vertices moved, up axis %d, height pelvis-head %.3f -> %s (%d bytes)" % (moved, ax, height, OUT, os.path.getsize(out)))


if __name__ == "__main__":
    main()
