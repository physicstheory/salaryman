#!/usr/bin/env python3
"""Build Web/phonelab.html from the game.

The phone lab is not a copy of the phones: it is the game's own phone code,
lifted out of Web/konto.html by name and wrapped in a page with a control panel.
Run this after changing anything about the phones and the lab follows.

    python3 -I Web/tools/build_phonelab.py
"""
import os, re, io, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import phonelab_extract as X

ROOT = os.path.dirname(HERE)
GAME = os.path.join(ROOT, "konto.html")
SHELL = os.path.join(HERE, "phonelab.shell.html")
OUT = os.path.join(ROOT, "phonelab.html")

# What the phone code is built from, and where it stops: these names are the
# game's own world (and a few common words that only look like names), and the
# shell stands in for each of them.
ROOTS = ["drawPhone", "updatePhone", "equipPhone", "applyDeviceSkin", "phoneMove", "phoneAct", "phoneBack",
         "setPhone", "homeApps", "PHONE_SCREENS", "islandBusy", "DEVICES", "PEAR_WALLPAPERS", "PEAR_ACCENTS",
         "PAINTS", "clamp", "mixHex", "DEVICE_ORDER", "updateMyNet"]
CUT = set("""clock nav garage drive home vitals deliveries purse spotify frameGrab say ownCar hailTaxi spotifyLogin
spotifyTransport spotifyLoad spotifySave takePhotograph setMapOpen wantFrame grabFrame placeAt phoneTime title post
world player traffic renderer scene camera shops wheel TIME gameMinutes
R N V T Tx arcRnd arcade ARC radio sound wanted tolls tvui mall parcels updateTolls enterMall enterTV
enterConsole updateRadio radioSet radioNext sunLight skyDome frameGrab mnContext seikoPortrait ski rail emergencyDispatch""".split())

def main():
    script = X.script_of(GAME)
    decls = X.declarations(script)
    names = X.closure(decls, ROOTS, CUT)
    ordered = sorted(names, key=lambda n: decls[n][0])
    game_js = "\n\n".join(decls[n][2] for n in ordered)

    html = io.open(GAME, encoding="utf-8").read()
    a = html.index("PHONE-CSS-BEGIN")
    a = html.index("\n", a) + 1
    b = html.index("/* PHONE-CSS-END */")
    css = html[a:b]
    f0 = html.index("/* GRAND-HOTEL-BEGIN")
    css += "\n" + html[f0:html.index("/* GRAND-HOTEL-END */", f0) + len("/* GRAND-HOTEL-END */")] + "\n"

    shell = io.open(SHELL, encoding="utf-8").read()
    assert "/*__PHONE_CSS__*/" in shell and "/*__GAME_JS__*/" in shell
    out = shell.replace("/*__PHONE_CSS__*/", css).replace("/*__GAME_JS__*/", game_js)
    io.open(OUT, "w", encoding="utf-8").write(out)
    print("built", OUT, "-", len(out) // 1024, "KB,", len(names), "declarations from the game")

if __name__ == "__main__":
    main()
