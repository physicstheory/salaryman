#!/usr/bin/env bash
# Build the Model Forge's GPU environments on a CUDA 12.4 Ubuntu 22.04 machine (the Dockerfile runs this; so can a bare VM).
#
#   /opt/forge/src/<repo>     upstream inference code at pinned commits
#   /opt/forge/venv/hy        torch 2.5.1: Hunyuan3D 2.1 (shape + PBR paint), Hunyuan3D 2.0/2mv shape, TripoSG, FLUX.1 schnell
#   /opt/forge/venv/tr2       torch 2.6.0: TRELLIS.2 (flash-attn, nvdiffrast, CuMesh, FlexGEMM, O-Voxel)
#   /opt/forge/venv/server    FastAPI front end (no torch)
#
# Weights are NOT baked in here: download.py fetches them once onto the models volume.
# Needs no GPU to build (TORCH_CUDA_ARCH_LIST below covers A10/A100/L4/L40S/H100/RTX 30-50).
set -euo pipefail

FORGE=${FORGE:-/opt/forge}
PY=${PY:-python3.10}
ONLY=${ONLY:-"hy tr2 server"}
export TORCH_CUDA_ARCH_LIST=${TORCH_CUDA_ARCH_LIST:-"8.0;8.6;8.9;9.0"}
export CUDA_HOME=${CUDA_HOME:-/usr/local/cuda}
export MAX_JOBS=${MAX_JOBS:-8}
mkdir -p "$FORGE/src" "$FORGE/venv"

pin() {  # pin <github repo> <commit> <dir>
  local d="$FORGE/src/$3"
  if [ ! -d "$d/.git" ]; then git clone --filter=blob:none "https://github.com/$1" "$d"; fi
  git -C "$d" fetch -q origin "$2" 2>/dev/null || true
  git -C "$d" checkout -q "$2"
}
pin Tencent-Hunyuan/Hunyuan3D-2.1 82920d643c0dc2f7bfd7255f45f62d386edfe60c Hunyuan3D-2.1
pin Tencent-Hunyuan/Hunyuan3D-2   f8db63096c8282cb27354314d896feba5ba6ff8a Hunyuan3D-2
pin VAST-AI-Research/TripoSG       fc5c40990181e2a756c4e0b1c2f4d6b5202faf8c TripoSG
pin microsoft/TRELLIS.2            75fbf0183001ed9876c8dbb35de6b68552ee08bd TRELLIS.2
git -C "$FORGE/src/TRELLIS.2" submodule update --init --recursive -q || true

venv() { [ -x "$FORGE/venv/$1/bin/python" ] || $PY -m venv "$FORGE/venv/$1"; "$FORGE/venv/$1/bin/pip" install -q -U pip wheel setuptools; }

# ---- server ---------------------------------------------------------------------------------------------------------------------------
if [[ " $ONLY " == *" server "* ]]; then
  venv server
  "$FORGE/venv/server/bin/pip" install -q "fastapi==0.115.12" "uvicorn[standard]==0.34.3" "huggingface_hub==0.30.2" "modelscope==1.25.0" numpy pillow
fi

# ---- hy: Hunyuan family, TripoSG, FLUX -----------------------------------------------------------------------------------------------
if [[ " $ONLY " == *" hy "* ]]; then
  venv hy
  P="$FORGE/venv/hy/bin/pip"
  $P install -q torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
  # Hunyuan3D-2.1's own list, minus the training/demo-only parts (gradio, deepspeed, tensorboard, cupy) and the Chinese mirrors
  grep -v -E '^(--extra-index-url|gradio|deepspeed|tb_nightly|cupy|pythreejs|open3d)' "$FORGE/src/Hunyuan3D-2.1/requirements.txt" > /tmp/hy-req.txt
  $P install -q -r /tmp/hy-req.txt
  $P install -q "peft==0.13.2" jaxtyping typeguard sentencepiece protobuf "onnxruntime-gpu==1.19.2"
  $P install -q --no-build-isolation diso
  ( cd "$FORGE/src/Hunyuan3D-2.1/hy3dpaint/custom_rasterizer" && $P install -q --no-build-isolation -e . )
  ( cd "$FORGE/src/Hunyuan3D-2.1/hy3dpaint/DifferentiableRenderer" && PATH="$FORGE/venv/hy/bin:$PATH" bash compile_mesh_painter.sh )
  ( cd "$FORGE/src/Hunyuan3D-2" && $P install -q --no-deps -e . )   # hy3dgen: 2.0 / 2mv / Turbo shape models + FlashVDM
  cp "$FORGE/src/Hunyuan3D-2.1/torchvision_fix.py" "$FORGE/src/Hunyuan3D-2.1/hy3dpaint/" 2>/dev/null || true
fi

# ---- tr2: TRELLIS.2 ------------------------------------------------------------------------------------------------------------------
if [[ " $ONLY " == *" tr2 "* ]]; then
  venv tr2
  P="$FORGE/venv/tr2/bin/pip"
  $P install -q torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
  $P install -q imageio imageio-ffmpeg tqdm easydict opencv-python-headless ninja trimesh "transformers>=4.56" pandas lpips zstandard kornia timm \
      safetensors huggingface_hub pillow numpy
  $P install -q "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8"
  $P install -q flash-attn==2.7.3 --no-build-isolation
  X=/tmp/forge-ext; mkdir -p $X
  [ -d $X/nvdiffrast ] || git clone -q -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git $X/nvdiffrast
  $P install -q --no-build-isolation $X/nvdiffrast
  [ -d $X/nvdiffrec ] || git clone -q -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git $X/nvdiffrec
  $P install -q --no-build-isolation $X/nvdiffrec
  [ -d $X/CuMesh ] || git clone -q --recursive https://github.com/JeffreyXiang/CuMesh.git $X/CuMesh
  $P install -q --no-build-isolation $X/CuMesh
  [ -d $X/FlexGEMM ] || git clone -q --recursive https://github.com/JeffreyXiang/FlexGEMM.git $X/FlexGEMM
  $P install -q --no-build-isolation $X/FlexGEMM
  $P install -q --no-build-isolation "$FORGE/src/TRELLIS.2/o-voxel"
  rm -rf $X
fi
echo "forge environments ready in $FORGE/venv"
