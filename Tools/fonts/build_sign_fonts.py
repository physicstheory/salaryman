#!/usr/bin/env python3
"""Build the sign-and-advert font library: Web/art/signfonts/*.woff2 + signfonts.json + LICENSE.txt.

Every shop sign, blade sign, billboard and advert in Tokonto picks its own typeface from this library, so no two
streets look alike. All faces are from the google/fonts repository under the SIL Open Font License 1.1 or the
Apache License 2.0, so they can ship inside the game.

Each face is subset to the characters the game actually prints (ASCII, Latin-1, Latin Extended-A, every kana, CJK
punctuation, full-width forms, plus every other character found in Web/ and the level sources) and renamed to a
neutral in-game family ("Konto Sign <id>") so a modified (subset) font never carries a Reserved Font Name.
Characters a face lacks fall back, glyph by glyph, to Konto Sans in the browser.

Run again after adding signs or adverts with new kanji:   python3 Tools/fonts/build_sign_fonts.py
Needs: pip install fonttools brotli
"""
import glob, json, os, sys, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "Web", "art", "signfonts")
CACHE = os.path.expanduser("~/.cache/salaryman-signfonts")
SRC = "https://raw.githubusercontent.com/google/fonts/main/"

# id, path in google/fonts, script (jp = has kana/kanji, latin = Latin only), CSS weight, genres
# genres steer the picker: a ramen shop leans brush/heavy, a clinic leans gothic/round, a bar leans script/neon...
FONTS = [
    ("dela",      "ofl/delagothicone/DelaGothicOne-Regular.ttf",          "jp", 400, ["heavy", "gothic", "display"]),
    ("reggae",    "ofl/reggaeone/ReggaeOne-Regular.ttf",                  "jp", 400, ["pop", "display", "heavy"]),
    ("rocknroll", "ofl/rocknrollone/RocknRollOne-Regular.ttf",            "jp", 400, ["pop", "round"]),
    ("rampart",   "ofl/rampartone/RampartOne-Regular.ttf",                "jp", 400, ["display", "pop", "outline"]),
    ("train",     "ofl/trainone/TrainOne-Regular.ttf",                    "jp", 400, ["display", "outline", "retro"]),
    ("stick",     "ofl/stick/Stick-Regular.ttf",                          "jp", 400, ["retro", "condensed"]),
    ("dot",       "ofl/dotgothic16/DotGothic16-Regular.ttf",              "jp", 400, ["pixel", "retro"]),
    ("potta",     "ofl/pottaone/PottaOne-Regular.ttf",                    "jp", 400, ["brush", "pop", "heavy"]),
    ("mochiy",    "ofl/mochiypopone/MochiyPopOne-Regular.ttf",            "jp", 400, ["pop", "round", "heavy"]),
    ("decol",     "ofl/kaiseidecol/KaiseiDecol-Bold.ttf",                 "jp", 700, ["mincho", "elegant", "retro"]),
    ("shippori",  "ofl/shipporiminchob1/ShipporiMinchoB1-ExtraBold.ttf",  "jp", 800, ["mincho", "elegant", "traditional"]),
    ("syuku",     "ofl/yujisyuku/YujiSyuku-Regular.ttf",                  "jp", 400, ["brush", "traditional"]),
    ("boku",      "ofl/yujiboku/YujiBoku-Regular.ttf",                    "jp", 400, ["brush", "traditional"]),
    ("zenmaru",   "ofl/zenmarugothic/ZenMaruGothic-Black.ttf",            "jp", 900, ["round", "gothic", "heavy"]),
    ("mrounded",  "ofl/mplusrounded1c/MPLUSRounded1c-ExtraBold.ttf",      "jp", 800, ["round", "gothic"]),
    ("antique",   "ofl/zenantique/ZenAntique-Regular.ttf",                "jp", 400, ["mincho", "traditional", "retro"]),
    ("hachimaru", "ofl/hachimarupop/HachiMaruPop-Regular.ttf",            "jp", 400, ["hand", "pop", "cute"]),
    ("yusei",     "ofl/yuseimagic/YuseiMagic-Regular.ttf",                "jp", 400, ["hand", "marker"]),
    ("kiwi",      "ofl/kiwimaru/KiwiMaru-Medium.ttf",                     "jp", 500, ["round", "cute"]),
    ("oldmincho", "ofl/zenoldmincho/ZenOldMincho-Black.ttf",              "jp", 900, ["mincho", "traditional", "heavy"]),
    ("daruma",    "ofl/darumadropone/DarumadropOne-Regular.ttf",          "jp", 400, ["pop", "heavy", "cute"]),
    ("kurenaido", "ofl/zenkurenaido/ZenKurenaido-Regular.ttf",            "jp", 400, ["hand", "brush"]),
    ("tegomin",   "ofl/newtegomin/NewTegomin-Regular.ttf",                "jp", 400, ["mincho", "elegant"]),
    ("bizud",     "ofl/bizudpgothic/BIZUDPGothic-Bold.ttf",               "jp", 700, ["gothic", "corporate"]),
    ("kosugi",    "apache/kosugimaru/KosugiMaru-Regular.ttf",             "jp", 400, ["round", "corporate"]),
    ("zenkaku",   "ofl/zenkakugothicnew/ZenKakuGothicNew-Black.ttf",      "jp", 900, ["gothic", "heavy", "corporate"]),
    ("mplus1p",   "ofl/mplus1p/MPLUS1p-ExtraBold.ttf",                    "jp", 800, ["gothic", "corporate"]),
    ("sawarabi",  "ofl/sawarabimincho/SawarabiMincho-Regular.ttf",        "jp", 400, ["mincho", "elegant", "corporate"]),
    ("yomogi",    "ofl/yomogi/Yomogi-Regular.ttf",                        "jp", 400, ["hand", "cute"]),
    ("bebas",     "ofl/bebasneue/BebasNeue-Regular.ttf",                  "latin", 400, ["condensed", "corporate", "display"]),
    ("anton",     "ofl/anton/Anton-Regular.ttf",                          "latin", 400, ["condensed", "heavy"]),
    ("pacifico",  "ofl/pacifico/Pacifico-Regular.ttf",                    "latin", 400, ["script", "cute"]),
    ("lobster",   "ofl/lobster/Lobster-Regular.ttf",                      "latin", 400, ["script", "retro"]),
    ("righteous", "ofl/righteous/Righteous-Regular.ttf",                  "latin", 400, ["retro", "display", "round"]),
    ("bungee",    "ofl/bungee/Bungee-Regular.ttf",                        "latin", 400, ["display", "heavy", "signage"]),
    ("abril",     "ofl/abrilfatface/AbrilFatface-Regular.ttf",            "latin", 400, ["elegant", "heavy", "serif"]),
    ("monoton",   "ofl/monoton/Monoton-Regular.ttf",                      "latin", 400, ["neon", "retro", "display"]),
    ("marker",    "apache/permanentmarker/PermanentMarker-Regular.ttf",   "latin", 400, ["hand", "marker"]),
    ("russo",     "ofl/russoone/RussoOne-Regular.ttf",                    "latin", 400, ["corporate", "heavy"]),
    ("alfaslab",  "ofl/alfaslabone/AlfaSlabOne-Regular.ttf",              "latin", 400, ["slab", "heavy", "retro"]),
    ("archivo",   "ofl/archivoblack/ArchivoBlack-Regular.ttf",            "latin", 400, ["heavy", "corporate"]),
    ("blackops",  "ofl/blackopsone/BlackOpsOne-Regular.ttf",              "latin", 400, ["stencil", "display"]),
    ("shrikhand", "ofl/shrikhand/Shrikhand-Regular.ttf",                  "latin", 400, ["script", "heavy", "pop"]),
    ("yellowtail","apache/yellowtail/Yellowtail-Regular.ttf",             "latin", 400, ["script", "neon", "retro"]),
    ("bowlby",    "ofl/bowlbyonesc/BowlbyOneSC-Regular.ttf",              "latin", 400, ["heavy", "display"]),
    ("staat",     "ofl/staatliches/Staatliches-Regular.ttf",              "latin", 400, ["condensed", "display"]),
    ("rubikmono", "ofl/rubikmonoone/RubikMonoOne-Regular.ttf",            "latin", 400, ["heavy", "display"]),
    ("bangers",   "ofl/bangers/Bangers-Regular.ttf",                      "latin", 400, ["pop", "display"]),
    ("fjalla",    "ofl/fjallaone/FjallaOne-Regular.ttf",                  "latin", 400, ["condensed", "corporate"]),
    ("limelight", "ofl/limelight/Limelight-Regular.ttf",                  "latin", 400, ["elegant", "retro", "deco"]),
    ("satisfy",   "apache/satisfy/Satisfy-Regular.ttf",                   "latin", 400, ["script", "elegant"]),
    ("kaushan",   "ofl/kaushanscript/KaushanScript-Regular.ttf",          "latin", 400, ["script", "brush"]),
    ("audiowide", "ofl/audiowide/Audiowide-Regular.ttf",                  "latin", 400, ["tech", "display"]),
    ("passion",   "ofl/passionone/PassionOne-Bold.ttf",                   "latin", 700, ["heavy", "pop"]),
    ("ultra",     "apache/ultra/Ultra-Regular.ttf",                       "latin", 400, ["slab", "heavy", "serif"]),
    ("playfairsc","ofl/playfairdisplaysc/PlayfairDisplaySC-Black.ttf",    "latin", 900, ["elegant", "serif"]),
    ("cinzel",    "ofl/cinzeldecorative/CinzelDecorative-Bold.ttf",       "latin", 700, ["elegant", "deco", "serif"]),
    ("vibes",     "ofl/greatvibes/GreatVibes-Regular.ttf",                "latin", 400, ["script", "elegant"]),
    ("oswald",    "ofl/oswald/Oswald%5Bwght%5D.ttf",                      "latin", 600, ["condensed", "corporate"]),
    ("teko",      "ofl/teko/Teko%5Bwght%5D.ttf",                          "latin", 600, ["condensed", "tech"]),
    ("orbitron",  "ofl/orbitron/Orbitron%5Bwght%5D.ttf",                  "latin", 800, ["tech", "display"]),
    ("saira",     "ofl/sairacondensed/SairaCondensed-ExtraBold.ttf",      "latin", 800, ["condensed", "tech"]),
    ("barlow",    "ofl/barlowcondensed/BarlowCondensed-Black.ttf",        "latin", 900, ["condensed", "heavy", "corporate"]),
    ("josefin",   "ofl/josefinsans/JosefinSans%5Bwght%5D.ttf",            "latin", 600, ["elegant", "geometric"]),
]


def charset():
    chars = set(chr(c) for c in range(0x20, 0x7F))
    for a, b in [(0xA0, 0x17F), (0x2010, 0x206F), (0x2190, 0x21FF), (0x2460, 0x24FF), (0x25A0, 0x25FF), (0x2600, 0x26FF),
                 (0x3000, 0x30FF), (0x31F0, 0x31FF), (0xFF00, 0xFFEF)]:
        chars.update(chr(c) for c in range(a, b + 1))
    files = [os.path.join(ROOT, "Web", "konto.html")] + glob.glob(os.path.join(ROOT, "Web", "art", "*.js")) + \
        glob.glob(os.path.join(ROOT, "Web", "game", "*.js")) + glob.glob(os.path.join(ROOT, "Web", "levels", "*", "src", "*.json")) + \
        glob.glob(os.path.join(ROOT, "Engine", "src", "**", "*.js"), recursive=True)
    for f in files:
        with open(f, encoding="utf-8", errors="ignore") as fh:
            chars.update(ch for ch in fh.read() if ord(ch) >= 0x2E80)
    return "".join(sorted(chars))


def fetch(path):
    os.makedirs(CACHE, exist_ok=True)
    dst = os.path.join(CACHE, os.path.basename(path).replace("%5B", "[").replace("%5D", "]"))
    if not os.path.exists(dst):
        print("  download", path)
        urllib.request.urlretrieve(SRC + path, dst)
    return dst


def rename(font, family):
    for rec in font["name"].names:
        if rec.nameID in (1, 4, 16, 18, 21):
            rec.string = family
        elif rec.nameID == 6:
            rec.string = family.replace(" ", "")
        elif rec.nameID == 3:
            rec.string = family + ";subset"


def main():
    os.makedirs(OUT, exist_ok=True)
    text = charset()
    print("subsetting %d faces to %d characters" % (len(FONTS), len(text)))
    manifest, credits = [], []
    for fid, path, script, weight, genres in FONTS:
        src = fetch(path)
        font = TTFont(src)
        orig = font["name"].getDebugName(1) or fid
        copyright_ = font["name"].getDebugName(0) or ""
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["kern", "liga", "palt", "vert", "vrt2", "locl", "ccmp"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        if "%5B" in path:  # variable font: pin to the chosen weight
            from fontTools.varLib import instancer
            font = instancer.instantiateVariableFont(font, {"wght": weight})
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(font)
        family = "Konto Sign " + fid
        rename(font, family)
        font.flavor = "woff2"
        out = os.path.join(OUT, fid + ".woff2")
        font.save(out)
        manifest.append({"id": fid, "family": family, "file": fid + ".woff2", "script": script, "weight": weight,
                         "genres": genres, "source": orig, "license": "Apache-2.0" if path.startswith("apache/") else "OFL-1.1"})
        credits.append("%-11s %s (%s) - %s - https://github.com/google/fonts/tree/main/%s" % (fid, orig, manifest[-1]["license"], copyright_.strip(), os.path.dirname(path)))
        print("  %-11s %6.1f KB  %s" % (fid, os.path.getsize(out) / 1024, orig))
    with open(os.path.join(OUT, "signfonts.json"), "w") as fh:
        json.dump({"note": "generated by Tools/fonts/build_sign_fonts.py; do not edit by hand", "fonts": manifest}, fh, indent=1)
    # the same list as a script, so the game can read it under file:// (Electron) where fetch() of JSON is refused
    with open(os.path.join(OUT, "fonts.js"), "w") as fh:
        fh.write("// generated by Tools/fonts/build_sign_fonts.py; do not edit by hand\nwindow.SIGN_FONT_LIST = " +
                 json.dumps([{k: m[k] for k in ("id", "family", "file", "script", "weight", "genres")} for m in manifest]) + ";\n")
    with open(os.path.join(OUT, "LICENSE.txt"), "w") as fh:
        fh.write("Sign and advert typefaces for Salary Man.\n\n"
                 "Each file is a subset of a font from the google/fonts repository, renamed to 'Konto Sign <id>' because it was\n"
                 "modified (subset). Faces marked OFL-1.1 are under the SIL Open Font License 1.1 (https://openfontlicense.org);\n"
                 "faces marked Apache-2.0 are under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0).\n"
                 "The fonts may be bundled with the game; they may not be sold on their own.\n\n" + "\n".join(credits) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
