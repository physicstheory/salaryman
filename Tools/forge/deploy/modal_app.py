"""Model Forge on Modal: our own serverless GPU, scale-to-zero (you pay per second only while a model is being made).

One-time setup (or let .github/workflows/forge.yml do it with the MODAL_TOKEN_ID / MODAL_TOKEN_SECRET repo secrets):
    pip install modal && modal token new
    modal secret create salaryman-forge FORGE_TOKEN=<long random string> [HF_TOKEN=<read token, only for the gated DINOv3>]
    modal deploy Tools/forge/deploy/modal_app.py           # prints https://<workspace>--salaryman-forge-serve.modal.run
    modal run Tools/forge/deploy/modal_app.py::download     # optional: fetch every model's weights now (~100 GB, once)

Weights live on the Modal Volume "salaryman-forge-models", so they are downloaded once, not per start. The GPU type is set by
FORGE_GPU at deploy time (default L40S, 48 GB: fits Hunyuan3D 2.1 shape + PBR paint together; A100-80GB / H100 also work).
"""
import os

import modal

HERE = os.path.dirname(os.path.abspath(__file__))
FORGE_DIR = os.path.abspath(os.path.join(HERE, ".."))
GPU = os.environ.get("FORGE_GPU", "L40S")

image = (
    modal.Image.from_dockerfile(os.path.join(FORGE_DIR, "server", "Dockerfile"), context_dir=FORGE_DIR)
    .env({"FORGE_MODELS": "/models", "FORGE_JOBS": "/models/jobs"})
)
models = modal.Volume.from_name("salaryman-forge-models", create_if_missing=True)
secret = modal.Secret.from_name("salaryman-forge")
app = modal.App("salaryman-forge")


@app.function(image=image, gpu=GPU, volumes={"/models": models}, secrets=[secret], timeout=3600, scaledown_window=600, max_containers=1)
@modal.concurrent(max_inputs=32)
@modal.asgi_app()
def serve():
    import sys
    sys.path.insert(0, "/opt/forge/app/server")
    import app as forge
    forge.MODAL_VOLUME = models
    forge.VENVS = "/opt/forge/venv"
    return forge.app


@app.function(image=image, volumes={"/models": models}, secrets=[secret], timeout=6 * 3600, cpu=4, memory=16384)
def download(names: str = ""):
    """Fetch weights onto the Volume without paying for a GPU: modal run modal_app.py::download --names "hunyuan21 trellis2"."""
    import subprocess
    subprocess.run(["/opt/forge/venv/server/bin/python", "/opt/forge/app/server/download.py"] + names.split(), check=True)
    models.commit()
