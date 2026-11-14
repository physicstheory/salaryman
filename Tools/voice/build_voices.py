#!/usr/bin/env python3
"""Voice-over for every cutscene line: Kokoro neural TTS + phoneme-timed lip sync.

    pip install kokoro-onnx soundfile onnx
    python3 Tools/voice/build_voices.py --models <dir with kokoro-v1.0.onnx + voices-v1.0.bin> [--only Akio] [--force]

What it does
  1. Scans the cutscene scripts (Web/konto.html, Web/game/*.js) for subtitle lines `[time, "Speaker", "text"]` and every string literal
     a line can resolve to (both sides of a ternary). Lines built at run time from variables are left to subtitles.
  2. Speaks each one with Kokoro-82M (Apache-2.0), a voice per character from CAST below.
  3. Asks the model for its own per-phoneme durations (the duration predictor is exposed as an extra graph output), so the mouth shapes
     land exactly when each sound is spoken instead of being guessed from loudness. The phonemes become mouth poses (jaw, wide,
     round, press, tuck), coarticulated and shaped by the loudness envelope, stored at 30 fps.
  4. Loudness-normalises (EBU R128, -16 LUFS), trims and encodes to Ogg Opus. Station announcements get a PA-speaker band-pass.
  5. Writes Web/audio/voice/index.json: { "Speaker|text": {src, dur, fps, m: "<5 base-36 chars per frame>"} }.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Web", "audio", "voice")
SOURCES = ["Web/konto.html", "Web/game/career-office.js", "Web/game/afterhours.js", "Web/game/career.js", "Web/game/career-commute.js", "Web/game/saga-content.js", "Web/game/saga-content2.js", "Web/game/yakuza-content.js"]

# voice: a Kokoro voice name or a blend {name: weight}; speed; fx: optional ffmpeg filter; look: the cast file whose jaw moves
CAST = {
    "Seiko":        {"voice": {"am_puck": 0.65, "am_michael": 0.35}, "speed": 1.0, "look": "seiko"},
    "Mother":       {"voice": "af_heart", "speed": 0.98, "look": "woman_05"},
    "Father":       {"voice": {"bm_george": 0.7, "am_onyx": 0.3}, "speed": 0.88, "look": "salaryman_03"},
    "Sister":       {"voice": "af_bella", "speed": 1.1, "look": "woman_02"},
    "Akio":         {"voice": {"am_fenrir": 0.75, "bm_george": 0.25}, "speed": 0.93, "look": "boss_akio"},
    "Receptionist": {"voice": "af_aoede", "speed": 1.02, "look": "officelady_02"},
    "Driver":       {"voice": {"am_michael": 0.5, "bm_lewis": 0.5}, "speed": 1.04},
    "Gondō":        {"voice": {"am_michael": 0.6, "am_onyx": 0.4}, "speed": 0.97, "look": "salaryman_07"},
    "Mori":         {"voice": "af_kore", "speed": 1.0, "look": "officelady_01"},
    "Nakano":       {"voice": "af_nicole", "speed": 1.06, "look": "officelady_03"},
    "Takeda":       {"voice": "af_sarah", "speed": 1.04, "look": "officelady_04"},
    "Ishikawa":     {"voice": {"am_puck": 0.4, "bm_fable": 0.6}, "speed": 0.95, "look": "salaryman_02"},
    "Fujita":       {"voice": "am_eric", "speed": 1.0, "look": "salaryman_05"},
    "Ōtsuka":       {"voice": {"bm_george": 0.6, "am_fenrir": 0.4}, "speed": 0.92, "look": "salaryman_08"},
    "Everyone":     {"voice": {"am_michael": 0.34, "af_heart": 0.33, "am_fenrir": 0.33}, "speed": 1.0},
    "":             {"voice": "bf_emma", "speed": 0.95},                                   # the narrator
    "PA":           {"voice": "af_kore", "speed": 0.92, "fx": "highpass=f=380,lowpass=f=3400,aecho=0.8:0.55:70|140:0.28|0.16"},
}
# what a name sounds like (espeak reads romaji badly)
SAY = [
    (r"\bGondō\b", "Gondoh"), (r"\bŌtsuka\b", "Ohtsuka"), (r"\bTōkonto\b", "Tohkonto"), (r"-buchō\b", " boochoh"),
    (r"\bOnii-chan\b", "Oh-nee chan"), (r"\bSotiyama-sama\b", "Sohtiyama sama"), (r"\bSotiyama\b", "Sohtiyama"), (r"-sama\b", " sama"),
    (r"\bSeiko-san\b", "Say-ko san"), (r"\bSeiko-kun\b", "Say-ko kun"), (r"\bSeiko\b", "Say-ko"), (r"-san\b", " san"),
    (r"M-moushiwake gozaimasen", "Moh, mooshi-wakeh go-zai-mah-sen"), (r"Seiko desu\.", "Say-ko dess."),
    (r"Yoroshiku onegaishimasu", "Yoh-roh-shkoo oh-neh-gai-shee-mahss"), (r"\bHai\b", "Hi"), (r"\bKanpai\b", "Kahn-pie"),
    (r"\bMizuho\b", "Mee-zoo-hoh"), (r"\bSOTI\b", "Sohtee"), (r"\b3F\b", "third floor"), (r"\bHQ\b", "H Q"), (r"\bOkaeri\b", "Oh-kah-eh-ree"),
    (r"F-floor", "F— floor"), (r"\bkonbini\b", "kohnbini"),
]

def literal_strings(expr):
    """String literals an expression can evaluate to, skipping any glued to a + (built at run time)."""
    out, i = [], 0
    toks = list(re.finditer(r'"((?:[^"\\]|\\.)*)"', expr))
    for m in toks:
        before = expr[:m.start()].rstrip(); after = expr[m.end():].lstrip()
        if before.endswith("+") or after.startswith("+"): continue
        out.append(json.loads('"' + m.group(1) + '"'))
    return out

def scan():
    found = {}
    pat = re.compile(r'\[\s*\d+(?:\.\d+)?\s*,\s*("(?:[^"\\]|\\.)*"|[\w.]+)\s*,\s*')
    for rel in SOURCES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p): continue
        src = open(p, encoding="utf-8").read()
        for m in pat.finditer(src):
            if not m.group(1).startswith('"'): continue
            spk = json.loads(m.group(1))
            j, depth = m.end(), 0
            while j < len(src):
                c = src[j]
                if c == '"':
                    j += 1
                    while src[j] != '"': j += 2 if src[j] == "\\" else 1
                elif c in "([{": depth += 1
                elif c in ")]}":
                    if depth == 0: break
                    depth -= 1
                j += 1
            for text in literal_strings(src[m.end():j]):
                found[spk + "|" + text] = (spk, text)
    return found

SKIP = {"This part of Seiko's story is being written. It arrives in the next update."}

def voiced(spk, text):
    t = text.strip()
    if not t or not re.search(r"[A-Za-z]{2}", t): return False
    if t in SKIP: return False
    if spk: return not t.startswith("♪")                                     # sung lines stay subtitles
    if t.startswith("♪"): return True                                        # station announcements
    if re.match(r"^(\*|Chapter|Respect|Peek)", t) or "·" in t or "—" in t: return False
    return len(re.findall(r"[A-Za-z']+", t)) >= 3

def speaker_of(spk, text):
    if spk == "" and re.match(r"^\s*♪", text): return "PA"
    if spk == "" and text.strip() in ("Please stand behind the yellow line.",): return "PA"
    if spk == "" and re.match(r"^\s*\(", text): return "Seiko"                 # his own thought
    return spk if spk in CAST else None

def spoken_text(spk, text):
    t = re.sub(r"♪", "", text)
    t = re.sub(r"[　-ヿ一-鿿]+[。、]?", "", t)                 # kana/kanji: the PA says the English half
    t = re.sub(r"^\s*\((?:whispering|muttering|quietly|coughing)\)\s*", "", t)
    t = re.sub(r"^\s*\((.*)\)\s*$", r"\1", t)                                 # a thought in brackets is still said, softly
    t = t.replace("“", "").replace("”", "").replace("…", "... ").replace("—", ", ")
    for a, b in SAY: t = re.sub(a, b, t)
    return re.sub(r"\s+", " ", t).strip()

def gender_fallback(spk):
    return {"voice": "am_michael", "speed": 1.0}

# ---- phonemes to mouth -------------------------------------------------------------------------------------------------------------
# pose = (jaw, wide, round, press, tuck): jaw open 0..1, lip corners spread, lips rounded/pushed, lips pressed shut, lower lip under teeth
P_REST = (0.0, 0.0, 0.0, 0.0, 0.0)
VIS = {}
def setv(chars, pose):
    for c in chars: VIS[c] = pose
setv("pbm", (0.0, 0.0, 0.1, 1.0, 0.0))          # lips together
setv("fv", (0.12, 0.1, 0.0, 0.0, 1.0))          # lower lip to teeth
setv("θð", (0.18, 0.15, 0.0, 0.0, 0.0))
setv("wʍ", (0.12, 0.0, 1.0, 0.2, 0.0))
setv("uʊ", (0.22, 0.0, 0.9, 0.0, 0.0))
setv("oɔ", (0.45, 0.0, 0.75, 0.0, 0.0))
setv("ɑaɒ", (0.85, 0.2, 0.0, 0.0, 0.0))
setv("æ", (0.7, 0.55, 0.0, 0.0, 0.0))
setv("ʌə", (0.45, 0.15, 0.0, 0.0, 0.0))
setv("ɛe", (0.5, 0.5, 0.0, 0.0, 0.0))
setv("ɪi", (0.25, 0.8, 0.0, 0.0, 0.0))
setv("ɜɚɝ", (0.35, 0.1, 0.35, 0.0, 0.0))
setv("ɹr", (0.25, 0.0, 0.45, 0.0, 0.0))
setv("ʃʒʧʤ", (0.2, 0.0, 0.6, 0.0, 0.0))
setv("sztdnlɾ", (0.2, 0.45, 0.0, 0.0, 0.0))
setv("kɡŋhjxç", (0.3, 0.25, 0.0, 0.0, 0.0))
setv("ᵻ", (0.25, 0.6, 0.0, 0.0, 0.0))

def mouth_track(phon_chars, durs, audio, sr, fps=30):
    """per-frame mouth poses from the model's own phoneme timing, eased between targets and opened up by the loudness envelope."""
    frame_s = 600 / 24000.0
    n = int(np.ceil(len(audio) / sr * fps)) + 1
    targets = np.zeros((n, 5)); weight = np.zeros(n)
    t = durs[0] * frame_s                       # the leading pad token
    for ch, d in zip(phon_chars, durs[1:]):
        dur = d * frame_s
        pose = VIS.get(ch)
        if pose is not None and dur > 0:
            a, b = int(t * fps), max(int(t * fps) + 1, int((t + dur) * fps))
            mid = (a + b) / 2
            for f in range(a, min(b + 1, n)):
                w = 1.0 - abs(f - mid) / ((b - a) / 2 + 1) * 0.5
                w *= 1.6 if pose[3] > 0.5 or pose[4] > 0.5 else 1.0   # closures must read: weight them up
                targets[f] += np.array(pose) * w; weight[f] += w
        t += dur
    has = weight > 0
    targets[has] /= weight[has, None]
    # loudness envelope (RMS per frame) scales the jaw so stressed syllables open wider and pauses close
    hop = sr // fps
    rms = np.array([np.sqrt(np.mean(audio[i * hop:(i + 1) * hop] ** 2) + 1e-9) if i * hop < len(audio) else 0.0 for i in range(n)])
    rms = rms / (np.percentile(rms, 95) + 1e-6)
    env = np.clip(rms, 0, 1.2)
    targets[:, 0] *= 0.55 + 0.6 * env
    targets[~has] = P_REST
    targets[env < 0.06] *= 0.25
    # coarticulation: a critically damped follow towards the target, ~45 ms, run forwards then backwards (anticipation)
    k = 1 - np.exp(-1 / (fps * 0.045))
    f1 = targets.copy()
    for i in range(1, n): f1[i] = f1[i - 1] + (targets[i] - f1[i - 1]) * k
    f2 = f1.copy()
    for i in range(n - 2, -1, -1): f2[i] = f2[i + 1] + (f1[i] - f2[i + 1]) * k
    out = 0.5 * (f1 + f2)
    # closures snap: a p/b/m holds the lips shut even after smoothing
    out[:, 3] = np.maximum(out[:, 3], targets[:, 3] * 0.85)
    return np.clip(out, 0, 1)

B36 = "0123456789abcdefghijklmnopqrstuvwxyz"
def enc(track):
    return "".join(B36[int(round(v * 35))] for row in track for v in row)

# ---- main -------------------------------------------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--only"); ap.add_argument("--force", action="store_true"); ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    lines = {k: v for k, v in scan().items() if voiced(*v) and speaker_of(*v) is not None}
    if a.list:
        for k in sorted(lines): print(k)
        print(len(lines), "lines"); return
    import onnx, onnxruntime as ort, soundfile as sf
    from kokoro_onnx import Kokoro
    onnx_path = os.path.join(a.models, "kokoro-v1.0.onnx")
    k = Kokoro(onnx_path, os.path.join(a.models, "voices-v1.0.bin"))
    dur_path = os.path.join(a.models, "kokoro-v1.0.dur.onnx")
    if not os.path.exists(dur_path):                      # expose the duration predictor's integer frames as a second output
        m = onnx.load(onnx_path)
        m.graph.output.append(onnx.helper.make_tensor_value_info("/encoder/Gather_output_0", onnx.TensorProto.INT64, None))
        onnx.save(m, dur_path)
    sess = ort.InferenceSession(dur_path)
    vocab = k.tokenizer.vocab if hasattr(k.tokenizer, "vocab") else None
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, "index.json")
    man = json.load(open(man_path)) if os.path.exists(man_path) else {"lines": {}, "cast": {}}
    man["cast"] = {s: c.get("look") for s, c in CAST.items() if c.get("look")}
    keep = set()
    for key, (spk, text) in sorted(lines.items()):
        who = speaker_of(spk, text)
        if a.only and who != a.only: continue
        c = CAST.get(who) or gender_fallback(who)
        h = hashlib.sha1((key + json.dumps(c, sort_keys=True)).encode()).hexdigest()[:12]
        name = re.sub(r"[^a-z]", "", (who or "narrator").lower().encode("ascii", "ignore").decode()) or "narrator"
        fn = f"{name}_{h}.ogg"; keep.add(fn)
        if not a.force and key in man["lines"] and man["lines"][key]["src"].endswith(fn) and os.path.exists(os.path.join(OUT, fn)): continue
        say = spoken_text(spk, text)
        ph = k.tokenizer.phonemize(say, "en-us" if who not in ("Father", "Akio", "Ōtsuka", "", "Ishikawa") else "en-gb")
        chars = [ch for ch in ph if ch in k.tokenizer.vocab] if hasattr(k.tokenizer, "vocab") else list(ph)
        tok = k.tokenizer.tokenize("".join(chars))
        assert len(tok) == len(chars), (len(tok), len(chars))
        v = c["voice"]
        style_bank = sum(k.get_voice_style(n) * w for n, w in v.items()) if isinstance(v, dict) else k.get_voice_style(v)
        style = style_bank[len(tok)]
        audio, durs = sess.run(None, {"tokens": np.array([[0, *tok, 0]], dtype=np.int64), "style": style,
                                      "speed": np.array([c.get("speed", 1.0)], dtype=np.float32)})
        audio = audio.astype(np.float32)
        thought = bool(re.match(r"^\s*\(", text))
        with tempfile.TemporaryDirectory() as td:
            wav = os.path.join(td, "a.wav"); sf.write(wav, audio, 24000)
            fx = []                                    # no trimming: the mouth track is timed from sample 0
            if c.get("fx"): fx.append(c["fx"])
            if thought: fx.append("lowpass=f=6000,aecho=0.7:0.4:40:0.2")
            fx.append("loudnorm=I=%d:TP=-1.5:LRA=7" % (-20 if thought else -16))
            fx.append("apad=pad_dur=0.12")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", ",".join(fx), "-ar", "48000", "-ac", "1",
                            "-c:a", "libopus", "-b:a", "40k", os.path.join(OUT, fn)], check=True)
            trimmed = len(audio) / 24000.0
        track = mouth_track(chars, [int(x) for x in durs], audio, 24000)
        if who == "PA" or who == "" or thought: track = None    # nobody on screen is saying it
        man["lines"][key] = {"src": "audio/voice/" + fn, "dur": round(trimmed + 0.12, 3), "who": who, "fps": 30,
                             **({"m": enc(track)} if track is not None else {})}
        print(f"{who:12s} {trimmed:5.2f}s  {text[:70]}", flush=True)
    if not a.only:
        man["lines"] = {k2: v2 for k2, v2 in man["lines"].items() if k2 in lines}
        for f in os.listdir(OUT):
            if f.endswith(".ogg") and f not in keep: os.remove(os.path.join(OUT, f))
    man["note"] = "Generated by Tools/voice/build_voices.py (Kokoro-82M TTS, Apache-2.0). Do not edit by hand."
    json.dump(man, open(man_path, "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(len(man["lines"]), "lines in", man_path)

if __name__ == "__main__":
    main()
