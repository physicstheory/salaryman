#!/usr/bin/env bash
# Model Forge on any rented GPU box (RunPod pod, Vast.ai, Lambda, Paperspace, a GCP/AWS GPU VM, or a PC with an NVIDIA card).
# Ubuntu 22.04 with an NVIDIA driver for CUDA 12.4+. As root:
#
#   curl -fsSL https://raw.githubusercontent.com/physicstheory/salaryman/claude/friendly-cannon-alnk4v/Tools/forge/deploy/bootstrap.sh -o bootstrap.sh
#   FORGE_TOKEN=<long random string> bash bootstrap.sh            (private repo: copy Tools/forge over with scp and run it from there)
#
# Then the server listens on :8000 (expose that port on RunPod, or put it behind a tunnel) and survives reboots (systemd).
# Models download to $FORGE_MODELS (default /workspace/models on RunPod's persistent volume, else /models).
set -euo pipefail
: "${FORGE_TOKEN:?set FORGE_TOKEN to a long random string; clients send it as a bearer token}"
HERE=$(cd "$(dirname "$0")/.." && pwd)
[ -d /workspace ] && DEF=/workspace/models || DEF=/models
export FORGE_MODELS=${FORGE_MODELS:-$DEF}

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  python3.10 python3.10-venv python3.10-dev python3-dev git curl wget build-essential ninja-build cmake libgl1 libegl1 libgles2 libglib2.0-0 \
  libsm6 libxrender1 libxext6 libeigen3-dev libjpeg-dev pkg-config
if ! command -v nvcc >/dev/null && [ ! -x /usr/local/cuda/bin/nvcc ]; then
  wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb && dpkg -i cuda-keyring_1.1-1_all.deb
  apt-get update && apt-get install -y cuda-toolkit-12-4
fi
mkdir -p /opt/forge && rm -rf /opt/forge/app && cp -r "$HERE" /opt/forge/app
bash /opt/forge/app/server/install.sh
mkdir -p "$FORGE_MODELS"

cat > /etc/systemd/system/forge.service <<EOF
[Unit]
Description=Salary Man Model Forge
After=network-online.target
[Service]
Environment=FORGE_TOKEN=$FORGE_TOKEN FORGE_MODELS=$FORGE_MODELS HF_HOME=$FORGE_MODELS/hf HY3DGEN_MODELS=$FORGE_MODELS/hy3dgen U2NET_HOME=$FORGE_MODELS/u2net FORGE_SRC=/opt/forge/src FORGE_VENVS=/opt/forge/venv PYOPENGL_PLATFORM=egl ${HF_TOKEN:+HF_TOKEN=$HF_TOKEN}
WorkingDirectory=/opt/forge/app/server
ExecStart=/opt/forge/venv/server/bin/uvicorn app:app --host 0.0.0.0 --port 8000
Restart=always
[Install]
WantedBy=multi-user.target
EOF
if command -v systemctl >/dev/null && systemctl list-units >/dev/null 2>&1; then
  systemctl daemon-reload && systemctl enable --now forge
else  # containers without systemd (RunPod pods): run it in the background and add it to the pod's start command
  cd /opt/forge/app/server && FORGE_TOKEN=$FORGE_TOKEN nohup /opt/forge/venv/server/bin/uvicorn app:app --host 0.0.0.0 --port 8000 > /var/log/forge.log 2>&1 &
fi
echo "Model Forge is starting on port 8000. Prefetch every model now with:"
echo "  FORGE_MODELS=$FORGE_MODELS /opt/forge/venv/server/bin/python /opt/forge/app/server/download.py"
