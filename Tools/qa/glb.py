"""Tiny, dependency-free glTF/GLB reader for the AAA gate.

Reads the JSON chunk, the binary chunk, embedded images and enough of the node
hierarchy to work out bone positions. It never decodes meshes beyond what the
accessors' min/max already tell us, which keeps a full scan of every asset fast.
"""
import json
import math
import os
import struct


class GLB:
    def __init__(self, path):
        self.path = path
        with open(path, "rb") as f:
            data = f.read()
        if data[:4] != b"glTF":
            raise ValueError("not a binary glTF (.glb) file")
        self.size = len(data)
        off, self.json, self.bin = 12, None, b""
        while off + 8 <= len(data):
            clen, ctype = struct.unpack("<II", data[off:off + 8])
            chunk = data[off + 8:off + 8 + clen]
            if ctype == 0x4E4F534A:
                self.json = json.loads(chunk.decode("utf-8"))
            elif ctype == 0x004E4942:
                self.bin = chunk
            off += 8 + clen
        if self.json is None:
            raise ValueError("GLB has no JSON chunk")
        j = self.json
        self.materials = j.get("materials", [])
        self.meshes = j.get("meshes", [])
        self.nodes = j.get("nodes", [])
        self.images = j.get("images", [])
        self.textures = j.get("textures", [])
        self.accessors = j.get("accessors", [])
        self.skins = j.get("skins", [])
        self.ext_used = set(j.get("extensionsUsed", []) or [])

    # ---- geometry -------------------------------------------------------------------------
    def triangles(self):
        tris = 0
        for m in self.meshes:
            for p in m.get("primitives", []):
                mode = p.get("mode", 4)
                if mode != 4:
                    continue
                if "indices" in p:
                    tris += self.accessors[p["indices"]]["count"] // 3
                elif "POSITION" in p.get("attributes", {}):
                    tris += self.accessors[p["attributes"]["POSITION"]]["count"] // 3
        return tris

    def mesh_bounds(self):
        """Union of POSITION accessor bounds (model space, bind pose)."""
        lo, hi = [math.inf] * 3, [-math.inf] * 3
        for m in self.meshes:
            for p in m.get("primitives", []):
                a = p.get("attributes", {}).get("POSITION")
                if a is None:
                    continue
                acc = self.accessors[a]
                if "min" in acc and "max" in acc:
                    for i in range(3):
                        lo[i] = min(lo[i], acc["min"][i]); hi[i] = max(hi[i], acc["max"][i])
        if lo[0] == math.inf:
            return None
        return lo, hi

    # ---- node hierarchy ---------------------------------------------------------------------
    def world_positions(self):
        """World-space translation of every node (rest pose)."""
        parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.get("children", []):
                parent[c] = i
        cache = {}

        def mat(n):
            if "matrix" in n:
                m = n["matrix"]
                return [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]], [m[2], m[6], m[10], m[14]], [0, 0, 0, 1]]
            t = n.get("translation", [0, 0, 0]); r = n.get("rotation", [0, 0, 0, 1]); s = n.get("scale", [1, 1, 1])
            x, y, z, w = r
            R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                 [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                 [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
            return [[R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], t[0]],
                    [R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], t[1]],
                    [R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], t[2]], [0, 0, 0, 1]]

        def mul(a, b):
            return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

        def world(i):
            if i in cache:
                return cache[i]
            m = mat(self.nodes[i])
            if i in parent:
                m = mul(world(parent[i]), m)
            cache[i] = m
            return m

        out = {}
        for i, n in enumerate(self.nodes):
            w = world(i)
            out[n.get("name", "#%d" % i)] = (w[0][3], w[1][3], w[2][3])
        return out

    def bone_names(self):
        names = set()
        for s in self.skins:
            for j in s.get("joints", []):
                names.add(self.nodes[j].get("name", ""))
        return names

    # ---- materials / textures --------------------------------------------------------------
    def tex_image(self, texinfo):
        """Image index behind a textureInfo dict (handles EXT_texture_webp / KHR_texture_basisu)."""
        if not texinfo or "index" not in texinfo:
            return None
        t = self.textures[texinfo["index"]] if texinfo["index"] < len(self.textures) else {}
        if "source" in t:
            return t["source"]
        for ext in (t.get("extensions") or {}).values():
            if isinstance(ext, dict) and "source" in ext:
                return ext["source"]
        return None

    def image_bytes(self, idx):
        if idx is None or idx >= len(self.images):
            return None, None
        im = self.images[idx]
        if "bufferView" in im:
            bv = self.json["bufferViews"][im["bufferView"]]
            o = bv.get("byteOffset", 0)
            return self.bin[o:o + bv["byteLength"]], im.get("mimeType", "")
        uri = im.get("uri", "")
        if uri and not uri.startswith("data:"):
            p = os.path.join(os.path.dirname(self.path), uri)
            if os.path.exists(p):
                with open(p, "rb") as f:
                    return f.read(), ""
        return None, None

    def material_maps(self, m):
        pb = m.get("pbrMetallicRoughness", {}) or {}
        return {
            "base": self.tex_image(pb.get("baseColorTexture")),
            "mr": self.tex_image(pb.get("metallicRoughnessTexture")),
            "normal": self.tex_image(m.get("normalTexture")),
            "ao": self.tex_image(m.get("occlusionTexture")),
            "emissive": self.tex_image(m.get("emissiveTexture")),
        }


def image_size(data):
    """(w, h) from PNG / JPEG / WebP headers without decoding."""
    if not data:
        return None
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            seg = struct.unpack(">H", data[i + 2:i + 4])[0]
            i += 2 + seg
        return None
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        fmt = data[12:16]
        if fmt == b"VP8 ":
            w, h = struct.unpack("<HH", data[26:30]); return w & 0x3FFF, h & 0x3FFF
        if fmt == b"VP8L":
            b = data[21:25]
            w = 1 + (((b[1] & 0x3F) << 8) | b[0]); h = 1 + (((b[3] & 0xF) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
            return w, h
        if fmt == b"VP8X":
            w = 1 + int.from_bytes(data[24:27], "little"); h = 1 + int.from_bytes(data[27:30], "little")
            return w, h
    return None
