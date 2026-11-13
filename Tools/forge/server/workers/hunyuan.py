"""Hunyuan-family worker (venv "hy": torch 2.5.1 / CUDA 12.4).

Runs, all from weights on our own disk:
  hunyuan21      Hunyuan3D-2.1 DiT shape  -> Hunyuan3D-2.1 PBR paint
  hunyuan2mv     Hunyuan3D-2mv shape from front/left/back(/right) views -> 2.1 PBR paint
  hunyuan2turbo  Hunyuan3D-2.0 Turbo + FlashVDM shape -> 2.1 PBR paint
  triposg        TripoSG shape -> 2.1 PBR paint
  flux-schnell   text -> reference image (op "t2i")

Every shape is cleaned (floaters, degenerate faces), reduced to the requested face budget, UV-unwrapped and painted with
albedo + metallic + roughness, then written as a GLB with an ORM map. The finisher on the game side adds the detail normal map,
scales it to metres and files it in Web/props.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, ".."), os.path.join(HERE, "..", "..")]
from common import ROOT, SRC, free_cuda, has_alpha_cutout, load_rgba, log, serve, write_pbr_glb  # noqa: E402

HY21 = os.path.join(SRC, "Hunyuan3D-2.1")
sys.path[:0] = [os.path.join(HY21, "hy3dshape"), os.path.join(HY21, "hy3dpaint"), os.path.join(SRC, "Hunyuan3D-2"), os.path.join(SRC, "TripoSG")]

import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402

try:
    from torchvision_fix import apply_fix  # Hunyuan's shim for torchvision >= 0.17 (basicsr imports a removed module)
    apply_fix()
except Exception:
    pass

M = {}  # loaded models stay resident between jobs


def rembg():
    if "rembg" not in M:
        from hy3dshape.rembg import BackgroundRemover
        M["rembg"] = BackgroundRemover()
    return M["rembg"]


def cutout(path):
    im = load_rgba(path)
    if not has_alpha_cutout(im):
        im = rembg()(im.convert("RGB"))
    return im


def flat_on_white(im):
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.getchannel("A"))
    return bg


# ---- text -> image ---------------------------------------------------------------------------------------------------------------------------
def t2i(job):
    if "flux" not in M:
        drop_heavy(keep=("flux",))
        from diffusers import FluxPipeline
        p = FluxPipeline.from_pretrained("black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16)
        p.enable_model_cpu_offload()  # lives in RAM, only the active block sits in VRAM next to the 3D models
        M["flux"] = p
    p = M["flux"]
    g = torch.Generator("cpu").manual_seed(int(job.get("seed", 0)))
    n = int(job.get("count", 1))
    outs = []
    for i in range(n):
        im = p(job["prompt"], guidance_scale=0.0, num_inference_steps=int(job.get("steps", 4)), max_sequence_length=256,
               height=1024, width=1024, generator=g).images[0]
        path = os.path.join(job["out"], "reference%s.png" % ("" if i == 0 else "_%d" % i))
        im.save(path)
        outs.append(path)
    return {"images": outs}


# ---- shapes ----------------------------------------------------------------------------------------------------------------------------------
def shape_pipe(kind):
    key = "shape:" + kind
    if key in M:
        return M[key]
    drop_heavy(keep=(key, "paint"))
    if kind == "hunyuan21":
        from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
        p = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2.1")
    elif kind == "hunyuan2mv":
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline as P2
        p = P2.from_pretrained("tencent/Hunyuan3D-2mv", subfolder="hunyuan3d-dit-v2-mv", variant="fp16")
    elif kind == "hunyuan2turbo":
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline as P2
        p = P2.from_pretrained("tencent/Hunyuan3D-2", subfolder="hunyuan3d-dit-v2-0-turbo", variant="fp16")
        p.enable_flashvdm()
    elif kind == "triposg":
        from triposg.pipelines.pipeline_triposg import TripoSGPipeline
        from huggingface_hub import snapshot_download
        p = TripoSGPipeline.from_pretrained(snapshot_download("VAST-AI/TripoSG")).to("cuda", torch.float16)
    else:
        raise ValueError("unknown shape model %s" % kind)
    M[key] = p
    return p


def drop_heavy(keep=()):
    for k in [k for k in M if k not in keep and k != "rembg" and (k.startswith("shape:") or k == "flux")]:
        log("unloading", k)
        del M[k]
    free_cuda()


def make_shape(job, imgs):
    kind = job["pipeline"]
    p = shape_pipe(kind)
    seed = int(job.get("seed", 1234))
    gen = torch.Generator("cuda").manual_seed(seed)
    octree = int(job.get("octree", 384))
    if kind == "triposg":
        im = flat_on_white(imgs["front"])
        out = p(image=im, generator=gen, num_inference_steps=int(job.get("steps", 50)), guidance_scale=float(job.get("guidance", 7.0))).samples[0]
        import trimesh
        return trimesh.Trimesh(out[0].astype(np.float32), np.ascontiguousarray(out[1]))
    if kind == "hunyuan2mv":
        image = {k: v for k, v in imgs.items() if k in ("front", "left", "back", "right")}
        steps = int(job.get("steps", 50))
    else:
        image = imgs["front"]
        steps = int(job.get("steps", 5 if kind == "hunyuan2turbo" else 50))
    return p(image=image, num_inference_steps=steps, octree_resolution=octree, num_chunks=20000, generator=gen, output_type="trimesh")[0]


def clean(mesh, faces):
    from hy3dshape.postprocessors import DegenerateFaceRemover, FaceReducer, FloaterRemover
    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)
    if faces and len(mesh.faces) > faces:
        mesh = FaceReducer()(mesh, max_facenum=faces)
    return mesh


# ---- paint -------------------------------------------------------------------------------------------------------------------------------------
def paint_pipe(views, res):
    key = (views, res)
    if M.get("paint_key") == key:
        return M["paint"]
    M.pop("paint", None)
    free_cuda()
    from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
    c = Hunyuan3DPaintConfig(views, res)
    c.multiview_cfg_path = os.path.join(HY21, "hy3dpaint", "cfgs", "hunyuan-paint-pbr.yaml")
    c.custom_pipeline = os.path.join(HY21, "hy3dpaint", "hunyuanpaintpbr")
    c.realesrgan_ckpt_path = os.path.join(ROOT, "ckpt", "RealESRGAN_x4plus.pth")
    M["paint"] = Hunyuan3DPaintPipeline(c)
    M["paint_key"] = key
    return M["paint"]


def paint(job, shape_path, ref_img, out_dir, faces):
    import trimesh
    p = paint_pipe(int(job.get("views", 8)), int(job.get("tex_res", 768)))
    import utils.simplify_mesh_utils as smu
    # the paint step remeshes to 40k faces by default: follow the job's budget instead
    orig = smu.mesh_simplify_trimesh
    smu.mesh_simplify_trimesh = lambda i, o, target_count=40000: orig(i, o, target_count=max(4000, faces or 40000))
    try:
        obj = os.path.join(out_dir, "textured.obj")
        p(mesh_path=shape_path, image_path=ref_img, output_mesh_path=obj, use_remesh=True, save_glb=False)
    finally:
        smu.mesh_simplify_trimesh = orig
    base = os.path.splitext(obj)[0]
    m = trimesh.load(obj, process=False, force="mesh")
    uv = np.asarray(m.visual.uv, np.float32).copy()
    uv[:, 1] = 1.0 - uv[:, 1]  # OBJ v-up -> glTF v-down
    alb = np.asarray(Image.open(base + ".jpg").convert("RGB"))
    met = np.asarray(Image.open(base + "_metallic.jpg").convert("L")) if os.path.exists(base + "_metallic.jpg") else None
    rou = np.asarray(Image.open(base + "_roughness.jpg").convert("L")) if os.path.exists(base + "_roughness.jpg") else None
    out = os.path.join(out_dir, "model.glb")
    write_pbr_glb(out, m.vertices, m.faces, uv, m.vertex_normals, alb, met, rou, name=job.get("name", "forge"))
    return out


def generate(job):
    out_dir = job["out"]
    os.makedirs(out_dir, exist_ok=True)
    views = job.get("images") or {}
    if isinstance(views, list):
        views = dict(zip(("front", "left", "back", "right"), views))
    if not views:
        raise ValueError("no input image (the server makes one from the prompt first)")
    imgs = {k: cutout(v) for k, v in views.items()}
    for k, im in imgs.items():
        im.save(os.path.join(out_dir, "input_%s.png" % k))
    faces = int(job.get("faces", 60000))
    log("shape:", job["pipeline"], "octree", job.get("octree", 384))
    mesh = make_shape(job, imgs)
    mesh = clean(mesh, faces * 4 if job.get("texture", True) else faces)  # keep detail for the paint step's own remesh
    shape = os.path.join(out_dir, "shape.glb")
    mesh.export(shape)
    res = {"shape": shape, "shape_faces": int(len(mesh.faces))}
    if job.get("texture", True):
        log("paint: views", job.get("views", 8), "res", job.get("tex_res", 768))
        if torch.cuda.get_device_properties(0).total_memory < 40e9:
            drop_heavy(keep=())  # on a 24-32 GB card the paint models need the VRAM the shape model was using
        ref = flat_on_white(imgs["front"])
        res["model"] = paint(job, shape, ref, out_dir, faces)
    else:
        res["model"] = shape
    return res


if __name__ == "__main__":
    serve({"generate": generate, "t2i": t2i})
