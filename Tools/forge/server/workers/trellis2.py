"""TRELLIS.2 worker (venv "tr2": torch 2.6 / CUDA 12.4, flash-attn, nvdiffrast, CuMesh, FlexGEMM, O-Voxel).

Microsoft TRELLIS.2-4B makes shape and PBR material together from one image (O-Voxel, up to 1536^3). Weights come from our own
disk (download.py fetched microsoft/TRELLIS.2-4B and the helpers its pipeline.json names), so the hub calls inside the library
resolve offline.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, ".."), os.path.join(HERE, "..", "..")]
from common import SRC, free_cuda, load_rgba, log, serve  # noqa: E402

os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
sys.path.insert(0, os.path.join(SRC, "TRELLIS.2"))

import torch  # noqa: E402

M = {}


def pipe():
    if "p" not in M:
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        p = Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B")
        p.cuda()
        M["p"] = p
    return M["p"]


def generate(job):
    import o_voxel
    out_dir = job["out"]
    os.makedirs(out_dir, exist_ok=True)
    views = job.get("images") or {}
    if isinstance(views, list):
        views = {"front": views[0]} if views else {}
    if "front" not in views:
        raise ValueError("no input image")
    im = load_rgba(views["front"])
    im.save(os.path.join(out_dir, "input_front.png"))
    p = pipe()
    res = int(job.get("octree", 1024))
    ptype = {512: "512", 1024: "1024_cascade", 1536: "1536_cascade"}.get(res, "1024_cascade")
    log("trellis2:", ptype)
    mesh = p.run(im, seed=int(job.get("seed", 42)), pipeline_type=ptype)[0]
    mesh.simplify(16777216)
    faces = int(job.get("faces", 60000))
    glb = o_voxel.postprocess.to_glb(
        vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs, coords=mesh.coords, attr_layout=mesh.layout,
        voxel_size=mesh.voxel_size, aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
        decimation_target=faces, texture_size=int(job.get("tex_size", 2048)), remesh=True, remesh_band=1, remesh_project=0, verbose=False)
    out = os.path.join(out_dir, "model.glb")
    glb.export(out)  # PNG textures (the game's three.js r128 and the AAA gate both read PNG/JPEG)
    del mesh
    free_cuda()
    return {"model": out}


if __name__ == "__main__":
    serve({"generate": generate})
