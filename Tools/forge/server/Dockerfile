# Model Forge GPU image. Build from the repo root:
#   docker build -f Tools/forge/server/Dockerfile -t salaryman-forge Tools/forge
# Run on any NVIDIA GPU host (48 GB+ recommended, 24 GB works for TRELLIS.2 / Turbo):
#   docker run --gpus all -p 8000:8000 -v forge-models:/models -e FORGE_TOKEN=... salaryman-forge
# Weights are downloaded into /models on first use (or ahead of time: docker run ... python3 server/download.py).
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PYOPENGL_PLATFORM=egl \
    FORGE_MODELS=/models HF_HOME=/models/hf HY3DGEN_MODELS=/models/hy3dgen U2NET_HOME=/models/u2net \
    FORGE_SRC=/opt/forge/src FORGE_VENVS=/opt/forge/venv

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.10 python3.10-venv python3.10-dev python3-dev python3-pip git git-lfs curl wget ca-certificates build-essential ninja-build cmake \
      libgl1 libegl1 libgles2 libglvnd0 libglx0 libegl1-mesa-dev libgl1-mesa-dev libglib2.0-0 libsm6 libxrender1 libxext6 \
      libeigen3-dev libjpeg-dev pkg-config && rm -rf /var/lib/apt/lists/*

COPY server/install.sh /opt/forge/app/server/install.sh
# one layer per environment, so a failure in a later one does not rebuild the earlier ones
RUN ONLY=server bash /opt/forge/app/server/install.sh && rm -rf /root/.cache/pip
RUN ONLY=hy bash /opt/forge/app/server/install.sh && rm -rf /root/.cache/pip
RUN ONLY=tr2 bash /opt/forge/app/server/install.sh && rm -rf /root/.cache/pip

COPY . /opt/forge/app
WORKDIR /opt/forge/app/server
EXPOSE 8000
CMD ["/opt/forge/venv/server/bin/uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
