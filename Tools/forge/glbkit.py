"""A small binary glTF (.glb) reader/writer with nothing but numpy and Pillow.

Used on both sides of the forge: the GPU workers assemble their PBR result with build_glb(), and the finisher (forge_finish.py)
reads what comes back, fixes the maps, rescales it and writes the game copy. Kept dependency-light on purpose so it also runs
inside the AAA gate's environment and on a plain GitHub runner.
"""
import io
import json
import struct

import numpy as np

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

_CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class Glb:
    def __init__(self, gltf, binary=b""):
        self.j = gltf
        self.bin = bytearray(binary)

    # ---- io ------------------------------------------------------------------------------------------------------------------------------
    @classmethod
    def load(cls, path_or_bytes):
        data = path_or_bytes if isinstance(path_or_bytes, (bytes, bytearray)) else open(path_or_bytes, "rb").read()
        magic, ver, length = struct.unpack_from("<III", data, 0)
        if magic != GLB_MAGIC:
            raise ValueError("not a .glb file")
        off, j, b = 12, None, b""
        while off < length:
            clen, ctype = struct.unpack_from("<II", data, off)
            chunk = data[off + 8: off + 8 + clen]
            if ctype == CHUNK_JSON:
                j = json.loads(chunk.decode("utf-8"))
            elif ctype == CHUNK_BIN:
                b = bytes(chunk)
            off += 8 + clen
        if j is None:
            raise ValueError("glb has no JSON chunk")
        return cls(j, b)

    def to_bytes(self):
        self.repack()
        js = json.dumps(self.j, separators=(",", ":")).encode("utf-8")
        js += b" " * ((4 - len(js) % 4) % 4)
        bn = bytes(self.bin) + b"\0" * ((4 - len(self.bin) % 4) % 4)
        out = io.BytesIO()
        total = 12 + 8 + len(js) + (8 + len(bn) if bn else 0)
        out.write(struct.pack("<III", GLB_MAGIC, 2, total))
        out.write(struct.pack("<II", len(js), CHUNK_JSON)); out.write(js)
        if bn:
            out.write(struct.pack("<II", len(bn), CHUNK_BIN)); out.write(bn)
        return out.getvalue()

    def save(self, path):
        with open(path, "wb") as f:
            f.write(self.to_bytes())

    # ---- buffer views ----------------------------------------------------------------------------------------------------------------------
    def view_bytes(self, vi):
        v = self.j["bufferViews"][vi]
        if v.get("buffer", 0) != 0:
            raise ValueError("external buffers are not supported")
        o = v.get("byteOffset", 0)
        return bytes(self.bin[o:o + v["byteLength"]])

    def add_view(self, data, target=None):
        pad = (4 - len(self.bin) % 4) % 4
        self.bin += b"\0" * pad
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            v["target"] = target
        self.bin += data
        self.j.setdefault("bufferViews", []).append(v)
        self._sync_buffer()
        return len(self.j["bufferViews"]) - 1

    def _sync_buffer(self):
        bufs = self.j.setdefault("buffers", [{}])
        if not bufs:
            bufs.append({})
        bufs[0]["byteLength"] = len(self.bin)
        bufs[0].pop("uri", None)

    def repack(self):
        """Drop bytes no view uses any more (replaced images) and lay the views out again."""
        views = self.j.get("bufferViews", [])
        if not views:
            self._sync_buffer()
            return
        parts, nb = [], bytearray()
        for v in views:
            d = self.view_bytes(len(parts))
            parts.append(d)
        for v, d in zip(views, parts):
            nb += b"\0" * ((4 - len(nb) % 4) % 4)
            v["byteOffset"] = len(nb)
            v["byteLength"] = len(d)
            nb += d
        self.bin = nb
        self._sync_buffer()

    # ---- accessors -------------------------------------------------------------------------------------------------------------------------
    def accessor(self, ai):
        a = self.j["accessors"][ai]
        n, ct = _NC[a["type"]], _CT[a["componentType"]]
        if "bufferView" not in a:
            return np.zeros((a["count"], n), ct)
        v = self.j["bufferViews"][a["bufferView"]]
        raw = self.view_bytes(a["bufferView"])
        off = a.get("byteOffset", 0)
        item = np.dtype(ct).itemsize * n
        stride = v.get("byteStride") or item
        if stride == item:
            arr = np.frombuffer(raw, ct, a["count"] * n, off).reshape(a["count"], n)
        else:
            arr = np.stack([np.frombuffer(raw, ct, n, off + i * stride) for i in range(a["count"])])
        return arr.copy()

    def add_accessor(self, arr, kind, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        ct = {np.dtype(np.float32): 5126, np.dtype(np.uint32): 5125, np.dtype(np.uint16): 5123, np.dtype(np.uint8): 5121}[arr.dtype]
        vi = self.add_view(arr.tobytes(), target)
        a = {"bufferView": vi, "componentType": ct, "count": int(arr.shape[0]), "type": kind}
        if minmax:
            a["min"] = [float(x) for x in arr.reshape(arr.shape[0], -1).min(0)]
            a["max"] = [float(x) for x in arr.reshape(arr.shape[0], -1).max(0)]
        self.j.setdefault("accessors", []).append(a)
        return len(self.j["accessors"]) - 1

    # ---- images ----------------------------------------------------------------------------------------------------------------------------
    def image_bytes(self, ii):
        im = self.j["images"][ii]
        if "bufferView" not in im:
            raise ValueError("image %d is external (%s)" % (ii, im.get("uri", "?")[:40]))
        return self.view_bytes(im["bufferView"]), im.get("mimeType", "")

    def set_image(self, ii, data, mime):
        im = self.j["images"][ii]
        im["bufferView"] = self.add_view(data)
        im["mimeType"] = mime
        im.pop("uri", None)

    def add_image(self, data, mime, name=None):
        im = {"bufferView": self.add_view(data), "mimeType": mime}
        if name:
            im["name"] = name
        self.j.setdefault("images", []).append(im)
        return len(self.j["images"]) - 1

    def add_texture(self, image_index):
        if not self.j.get("samplers"):
            self.j["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
        self.j.setdefault("textures", []).append({"source": image_index, "sampler": 0})
        return len(self.j["textures"]) - 1

    def texture_image(self, ti):
        t = self.j["textures"][ti]
        src = t.get("source")
        ext = t.get("extensions") or {}
        for k in ("EXT_texture_webp", "KHR_texture_basisu", "MSFT_texture_dds"):
            if src is None and k in ext:
                src = ext[k]["source"]
        return src

    # ---- scene -----------------------------------------------------------------------------------------------------------------------------
    def node_mats(self):
        """World matrix of every node reached from the default scene."""
        nodes = self.j.get("nodes", [])
        out = {}

        def local(n):
            if "matrix" in n:
                return np.array(n["matrix"], np.float64).reshape(4, 4).T
            t = np.array(n.get("translation", [0, 0, 0]), np.float64)
            x, y, z, w = n.get("rotation", [0, 0, 0, 1])
            s = np.array(n.get("scale", [1, 1, 1]), np.float64)
            r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            m = np.eye(4)
            m[:3, :3] = r * s
            m[:3, 3] = t
            return m

        def walk(i, parent):
            m = parent @ local(nodes[i])
            out[i] = m
            for c in nodes[i].get("children", []):
                walk(c, m)

        sc = self.j.get("scenes", [{"nodes": list(range(len(nodes)))}])[self.j.get("scene", 0)]
        for r in sc.get("nodes", []):
            walk(r, np.eye(4))
        return out

    def world_points(self):
        pts = []
        for ni, m in self.node_mats().items():
            n = self.j["nodes"][ni]
            if "mesh" not in n:
                continue
            for p in self.j["meshes"][n["mesh"]]["primitives"]:
                if "POSITION" not in p["attributes"]:
                    continue
                v = self.accessor(p["attributes"]["POSITION"]).astype(np.float64)
                pts.append(v @ m[:3, :3].T + m[:3, 3])
        return np.concatenate(pts) if pts else np.zeros((0, 3))

    def triangles(self):
        t = 0
        for ni in self.node_mats():
            n = self.j["nodes"][ni]
            if "mesh" not in n:
                continue
            for p in self.j["meshes"][n["mesh"]]["primitives"]:
                if p.get("mode", 4) != 4:
                    continue
                if "indices" in p:
                    t += self.j["accessors"][p["indices"]]["count"] // 3
                else:
                    t += self.j["accessors"][p["attributes"]["POSITION"]]["count"] // 3
        return t

    def wrap_root(self, matrix, name="root"):
        """Put the whole default scene under one new node carrying `matrix` (4x4, column vectors)."""
        sc = self.j["scenes"][self.j.get("scene", 0)]
        node = {"name": name, "children": list(sc.get("nodes", [])),
                "matrix": [float(x) for x in np.asarray(matrix, np.float64).T.reshape(-1)]}
        self.j.setdefault("nodes", []).append(node)
        sc["nodes"] = [len(self.j["nodes"]) - 1]


def build_glb(vertices, faces, uvs, normals=None, base=None, mr=None, normal=None, name="model", base_mime="image/jpeg",
              mr_mime="image/jpeg", normal_mime="image/png", metallic_factor=1.0, roughness_factor=1.0):
    """One mesh, one PBR material. `base`, `mr` and `normal` are encoded image bytes (or None). UVs are glTF convention (v down)."""
    g = Glb({"asset": {"version": "2.0", "generator": "Salary Man Model Forge"}, "scene": 0, "scenes": [{"nodes": [0]}],
             "nodes": [{"name": name, "mesh": 0}], "buffers": [{"byteLength": 0}]})
    v = np.asarray(vertices, np.float32)
    f = np.asarray(faces, np.uint32).reshape(-1)
    attrs = {"POSITION": g.add_accessor(v, "VEC3", 34962, minmax=True)}
    if normals is not None:
        attrs["NORMAL"] = g.add_accessor(np.asarray(normals, np.float32), "VEC3", 34962)
    if uvs is not None:
        attrs["TEXCOORD_0"] = g.add_accessor(np.asarray(uvs, np.float32), "VEC2", 34962)
    idx = g.add_accessor(f.reshape(-1, 1), "SCALAR", 34963)
    g.j["accessors"][idx]["type"] = "SCALAR"
    mat = {"name": name + "_pbr", "pbrMetallicRoughness": {"metallicFactor": metallic_factor, "roughnessFactor": roughness_factor}}
    if base:
        mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": g.add_texture(g.add_image(base, base_mime, name + "_base"))}
    if mr:
        ti = g.add_texture(g.add_image(mr, mr_mime, name + "_orm"))
        mat["pbrMetallicRoughness"]["metallicRoughnessTexture"] = {"index": ti}
        mat["occlusionTexture"] = {"index": ti}
    if normal:
        mat["normalTexture"] = {"index": g.add_texture(g.add_image(normal, normal_mime, name + "_normal"))}
    g.j["materials"] = [mat]
    g.j["meshes"] = [{"name": name, "primitives": [{"attributes": attrs, "indices": idx, "material": 0}]}]
    return g
