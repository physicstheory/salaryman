"""Crops the rendered hands to what is drawn, saves them as Web/art/hud/hand_<outfit>.png and writes hands.json with the phone's
rectangle in each picture (in pixels), which Web/game/phone-hand.js fits to the game's phone."""
import json, glob, os
from PIL import Image
out = {}
os.makedirs("Web/art/hud", exist_ok=True)
for f in sorted(glob.glob("/tmp/hudhand_*.png")):
    m = os.path.basename(f)[8:-4]
    im = Image.open(f).convert("RGBA")
    r = json.load(open(f[:-4] + ".json"))["rect"]
    bb = im.getbbox()
    x0, y0 = min(bb[0], int(r[0])), min(bb[1], int(r[1]))
    x1, y1 = max(bb[2], int(r[2]) + 1), max(bb[3], int(r[3]) + 1)
    im = im.crop((x0, y0, x1, y1))
    # half size is plenty for a HUD (the phone is ~250 px wide on screen)
    im = im.resize((im.width * 3 // 4, im.height * 3 // 4), Image.LANCZOS)
    name = "hand_" + m.replace("seiko_", "") + ".png"
    im.save("Web/art/hud/" + name, optimize=True)
    k = 0.75
    out[m + ".glb"] = {"img": "art/hud/" + name, "size": [im.width, im.height], "phone": [round((r[0] - x0) * k, 1), round((r[1] - y0) * k, 1), round((r[2] - x0) * k, 1), round((r[3] - y0) * k, 1)]}
json.dump(out, open("Web/art/hud/hands.json", "w"), indent=1)
print(len(out), "hands")
