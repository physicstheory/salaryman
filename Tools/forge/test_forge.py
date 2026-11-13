"""End-to-end test of the Model Forge without a GPU: server (FORGE_FAKE=1) -> client -> finisher -> props folder.

    python3 Tools/forge/test_forge.py        (needs fastapi + uvicorn + numpy + pillow)
"""
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from glbkit import Glb  # noqa: E402


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def main():
    from PIL import Image
    tmp = tempfile.mkdtemp(prefix="forge-test-")
    port = free_port()
    env = dict(os.environ, FORGE_FAKE="1", FORGE_MODELS=os.path.join(tmp, "models"), FORGE_TOKEN="t0k")
    os.makedirs(env["FORGE_MODELS"])
    srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "app:app", "--port", str(port)], cwd=os.path.join(HERE, "server"), env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    made_before = set(os.listdir(os.path.join(HERE, "made"))) if os.path.isdir(os.path.join(HERE, "made")) else set()
    try:
        url = "http://127.0.0.1:%d" % port
        for _ in range(60):
            try:
                urllib.request.urlopen(url + "/", timeout=1)
                break
            except Exception:
                time.sleep(0.25)
        try:
            urllib.request.urlopen(url + "/health", timeout=5)
            raise AssertionError("health answered without a token")
        except urllib.error.HTTPError as e:
            assert e.code == 401, e.code
        props = os.path.join(tmp, "props")
        os.makedirs(props)
        img = os.path.join(tmp, "photo.png")
        Image.new("RGB", (800, 600), (255, 255, 255)).save(img)
        im = Image.open(img); px = im.load()
        for x in range(200, 600):
            for y in range(100, 560):
                px[x, y] = (150 + (x * 7 % 40), 60, 40 + (y * 3 % 50))
        im.save(img)
        spec = [{"id": "zz_forge_test_text", "prompt": "a test vending machine", "height": 1.8, "out": props},
                {"id": "zz_forge_test_photo", "images": [img], "width": 0.75, "yaw": 90, "out": props, "pipeline": "trellis2"}]
        sp = os.path.join(tmp, "spec.json")
        json.dump(spec, open(sp, "w"))
        cenv = dict(os.environ, FORGE_URL=url, FORGE_TOKEN="t0k")
        r = subprocess.run([sys.executable, os.path.join(HERE, "forge.py"), "batch", sp], env=cenv, capture_output=True, text=True, timeout=300)
        print(r.stdout)
        assert r.returncode == 0, r.stderr[-2000:]
        ix = json.load(open(os.path.join(props, "index.json")))
        for s in spec:
            e = ix[s["id"]]
            g = Glb.load(os.path.join(props, e["file"]))
            want = s.get("height") or s.get("width")
            got = e["size"][1] if "height" in s else e["size"][0]
            assert abs(got - want) < 1e-3, (s["id"], e["size"])
            pts = g.world_points()
            assert abs(pts[:, 1].min()) < 1e-4, "not stood on the ground"
            for m in g.j["materials"]:
                pb = m["pbrMetallicRoughness"]
                for ref, kind in ((pb.get("baseColorTexture"), "base"), (pb.get("metallicRoughnessTexture"), "orm"), (m.get("normalTexture"), "normal")):
                    assert ref, "%s map missing" % kind
                    data, mime = g.image_bytes(g.texture_image(ref["index"]))
                    t = Image.open(io.BytesIO(data))
                    assert max(t.size) >= 1024 and t.size[0] & (t.size[0] - 1) == 0, (kind, t.size)
                    if kind == "normal":
                        import numpy as np
                        a = np.asarray(t.convert("RGB"), float)
                        assert a[..., 2].mean() > 150 and a[..., 0].std() > 1.5, "normal map flat or not tangent-space"
            assert e["forge"]["job"], "no job record"
        print("forge test: OK (%d models)" % len(spec))
    finally:
        srv.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
        made = os.path.join(HERE, "made")
        for d in set(os.listdir(made)) - made_before if os.path.isdir(made) else []:
            if d.startswith("zz_forge_test"):
                shutil.rmtree(os.path.join(made, d), ignore_errors=True)


if __name__ == "__main__":
    main()
