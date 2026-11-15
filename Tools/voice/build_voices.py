#!/usr/bin/env python3
"""Every line of dialogue in the game, spoken: Kokoro neural TTS, a consistent voice per character, and phoneme-timed lip sync.

    pip install kokoro-onnx soundfile onnx
    python3 Tools/voice/build_voices.py --models <dir with kokoro-v1.0.onnx + voices-v1.0.bin> [--only Akio] [--force] [--list] [--jobs N]

What it voices
  Tools/voice/extract_lines.mjs reads Web/konto.html and Web/game/*.js with a JavaScript parser and returns every spoken line with its
  speaker: cutscenes, conversations (talk menus, floor incidents, after-hours topics), Care Desk calls (the caller and Seiko's answers),
  phone calls, quoted speech in notices ("Gondō: “…”"), the radio hosts, and the street (PED_LINES and the bark table in
  Web/game/barks.js). Seiko says the answers you pick, as in any modern open-world game. Lines glued together at run time are voiced
  in pieces, with a names bank (stations, venues, numbers) for what goes between them; Web/game/voice-all.js stitches them.

How
  1. Kokoro-82M (Apache-2.0) speaks each line with the speaker's voice from CAST (main cast, hand-picked blends) or a voice made for them
     from their name (a stable blend of two voices of their sex, with their own pace), so a character sounds the same everywhere.
  2. The model's own per-phoneme durations (its duration predictor exposed as a graph output) become a 5-channel mouth track at 30 fps.
  3. EBU R128 loudness (-16 LUFS), Ogg Opus. The PA gets a speaker band-pass; phone and radio colouring is done at run time, so one
     recording serves both a face-to-face scene and a call.
  4. Web/audio/voice/index.json: { lines: { "Speaker|text": { src, dur, who, fps, m? } }, cast: { speaker: look }, sex: { speaker: m|f } }.
     Keys for lines with nobody named: "?m|text" / "?f|text"; street barks: "~m0|text" .. "~f2|text"; pieces "Speaker|piece|text";
     names "Speaker|name|text".
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Web", "audio", "voice")

M_POOL = ["am_michael", "am_fenrir", "am_puck", "am_onyx", "am_eric", "am_liam", "am_adam", "am_echo", "bm_george", "bm_lewis", "bm_daniel", "bm_fable"]
F_POOL = ["af_heart", "af_bella", "af_nicole", "af_sarah", "af_aoede", "af_kore", "af_jessica", "af_nova", "af_river", "af_sky", "af_alloy", "bf_emma", "bf_isabella", "bf_alice", "bf_lily"]

# voice: a Kokoro voice or a blend {name: weight}; speed; fx: ffmpeg filter baked in; look: the cast file whose jaw moves; sex
CAST = {
    "Seiko":        {"voice": {"am_puck": 0.65, "am_michael": 0.35}, "speed": 1.0, "look": "seiko", "sex": "m"},
    "Mother":       {"voice": "af_heart", "speed": 0.98, "look": "woman_05", "sex": "f"},
    "Father":       {"voice": {"bm_george": 0.7, "am_onyx": 0.3}, "speed": 0.88, "look": "salaryman_03", "sex": "m"},
    "Sister":       {"voice": "af_bella", "speed": 1.1, "look": "woman_02", "sex": "f"},
    "Akio":         {"voice": {"am_fenrir": 0.75, "bm_george": 0.25}, "speed": 0.93, "look": "boss_akio", "sex": "m"},
    "Receptionist": {"voice": "af_aoede", "speed": 1.02, "look": "officelady_02", "sex": "f"},
    "Driver":       {"voice": {"am_michael": 0.5, "bm_lewis": 0.5}, "speed": 1.04, "sex": "m"},
    "Gondō":        {"voice": {"am_michael": 0.6, "am_onyx": 0.4}, "speed": 0.97, "look": "salaryman_07", "sex": "m"},
    "Mori":         {"voice": "af_kore", "speed": 1.0, "look": "officelady_01", "sex": "f"},
    "Nakano":       {"voice": "af_nicole", "speed": 1.06, "look": "officelady_03", "sex": "f"},
    "Takeda":       {"voice": "af_sarah", "speed": 1.04, "look": "officelady_04", "sex": "f"},
    "Ishikawa":     {"voice": {"am_puck": 0.4, "bm_fable": 0.6}, "speed": 0.95, "look": "salaryman_02", "sex": "m"},
    "Fujita":       {"voice": "am_eric", "speed": 1.0, "look": "salaryman_05", "sex": "m"},
    "Ōtsuka":       {"voice": {"bm_george": 0.6, "am_fenrir": 0.4}, "speed": 0.92, "look": "salaryman_08", "sex": "m"},
    "Reiko":        {"voice": {"bf_emma": 0.6, "af_kore": 0.4}, "speed": 0.94, "look": "woman_04", "sex": "f"},
    "Sotiyama Reiko": {"same": "Reiko"},
    "Kuroda":       {"voice": {"bm_lewis": 0.7, "am_onyx": 0.3}, "speed": 0.95, "look": "salaryman_10", "sex": "m"},
    "Secretary":    {"voice": {"bf_isabella": 0.7, "af_aoede": 0.3}, "speed": 1.0, "look": "officelady_05", "sex": "f"},
    "Akio's secretary": {"same": "Secretary"},
    "Kurogane Jūzō": {"voice": {"am_onyx": 0.7, "bm_george": 0.3}, "speed": 0.86, "sex": "m"},
    "Jūzō":         {"same": "Kurogane Jūzō"},
    "Everyone":     {"voice": {"am_michael": 0.34, "af_heart": 0.33, "am_fenrir": 0.33}, "speed": 1.0, "sex": "m"},
    "Board":        {"voice": {"bm_george": 0.5, "bm_daniel": 0.5}, "speed": 0.95, "look": "salaryman_06", "sex": "m"},
    "":             {"voice": "bf_emma", "speed": 0.95, "sex": "f"},                                   # the narrator
    "PA":           {"voice": "af_kore", "speed": 0.92, "fx": "highpass=f=380,lowpass=f=3400,aecho=0.8:0.55:70|140:0.28|0.16", "sex": "f"},
    # the radio
    "Dai":          {"voice": {"am_echo": 0.6, "am_puck": 0.4}, "speed": 1.04, "sex": "m"},
    "Dee":          {"voice": {"af_nova": 0.7, "af_bella": 0.3}, "speed": 1.06, "sex": "f"},
    "Kenji":        {"voice": {"am_onyx": 0.6, "bm_daniel": 0.4}, "speed": 0.9, "sex": "m"},
    "Mr Sato":      {"voice": {"bm_george": 0.5, "am_adam": 0.5}, "speed": 0.9, "sex": "m"},
    "Caller":       {"voice": {"af_river": 0.6, "af_jessica": 0.4}, "speed": 1.0, "sex": "f"},
    # nobody named: a man and a woman, and the street's six passers-by
    "?m":           {"voice": {"am_eric": 0.5, "am_echo": 0.5}, "speed": 1.0, "sex": "m"},
    "?f":           {"voice": {"af_sarah": 0.5, "af_alloy": 0.5}, "speed": 1.0, "sex": "f"},
    "~m0":          {"voice": {"am_echo": 0.6, "am_liam": 0.4}, "speed": 1.05, "sex": "m"},
    "~m1":          {"voice": {"bm_daniel": 0.7, "am_michael": 0.3}, "speed": 1.0, "sex": "m"},
    "~m2":          {"voice": {"am_adam": 0.5, "am_onyx": 0.5}, "speed": 0.94, "sex": "m"},
    "~f0":          {"voice": {"af_nova": 0.7, "af_sky": 0.3}, "speed": 1.06, "sex": "f"},
    "~f1":          {"voice": {"af_river": 0.6, "bf_lily": 0.4}, "speed": 1.0, "sex": "f"},
    "~f2":          {"voice": {"af_jessica": 0.6, "bf_alice": 0.4}, "speed": 0.96, "sex": "f"},
}
BARK_VOICES = ["~m0", "~m1", "~m2", "~f0", "~f1", "~f2"]
# everyone else: their sex (and an age for the pace); their voice is made from their name
PEOPLE = {
    "Satō": "m", "Kimura": "f", "Hayashi": "m", "Inoue": "f", "Katō": "m", "Ogawa": "m",
    "Officer Endō": "m", "\"Officer\" Endō": "m", "Security": "m", "Assistant": "f", "Owner": "m",
    "The man in the white suit": "m:old", "Hirata": "m:old", "Aizawa": "m", "Ōnishi": "m", "Shimizu": "m:old", "Hasegawa": "m", "Genji": "m",
    "The mechanic": "m", "The housekeeper": "f:old", "The old chef": "m:old", "Sakamoto": "m", "The stage manager": "f", "Ueda": "m",
    "Fukuda": "m:old", "Ōba": "m:old", "Shirai": "m", "Kobayashi-san": "f:old", "Ishida": "m", "Tanabe": "m", "The man from Osaka": "m",
    "Kawada": "m", "Benzō": "m", "Mrs Hirose": "f:old", "The courier": "m", "Priest Ōmura": "m:old", "Chef Morikawa": "m", "Skipper Ono": "m:old",
    "Ryūzaki": "m", "The night guard": "m:old", "Hide": "m", "Kirara ✦": "f", "Kirara": "f", "Mr Saitō": "m:old",
    "Tanaka Michiko": "f", "Yamamoto Kenji": "m", "Kobayashi Fumiko": "f:old", "Watanabe Sora": "f", "Ishii Kaito": "m:young",
    "Hayashi Daichi": "m", "Matsumoto Rina": "f", "Okada Takeshi": "m", "Nishimura Kaede": "f",
    "Clerk": "f", "Officer": "m", "Station staff": "m", "Cop": "m",
}
# what a name sounds like (espeak reads romaji badly)
SAY = [
    (r"\bGondō\b", "Gondoh"), (r"\bŌtsuka\b", "Ohtsuka"), (r"\bTōkonto\b", "Tohkonto"), (r"-buchō\b", " boochoh"), (r"\bbuchō\b", "boochoh"),
    (r"\bOnii-chan\b", "Oh-nee chan"), (r"\bSotiyama-sama\b", "Sohtiyama sama"), (r"\bSotiyama\b", "Sohtiyama"), (r"-sama\b", " sama"),
    (r"\bSeiko-san\b", "Say-ko san"), (r"\bSeiko-kun\b", "Say-ko kun"), (r"\bSeiko-chan\b", "Say-ko chan"), (r"Seiko-saaan", "Say-ko saaahn"), (r"\bSeiko\b", "Say-ko"), (r"-san\b", " san"),
    (r"-kun\b", " kun"), (r"-chan\b", " chan"), (r"\bShachō\b", "Shah-choh"), (r"\bshachō\b", "shah-choh"),
    (r"M-moushiwake gozaimasen", "Moh, mooshi-wakeh go-zai-mah-sen"), (r"Seiko desu\.", "Say-ko dess."), (r"\bdesu\b", "dess"),
    (r"Yoroshiku onegaishimasu", "Yoh-roh-shkoo oh-neh-gai-shee-mahss"), (r"\bHai\b", "Hi"), (r"\bKanpai\b", "Kahn-pie"), (r"\bkanpai\b", "kahn-pie"),
    (r"\bMizuho\b", "Mee-zoo-hoh"), (r"\bSOTI\b", "Sohtee"), (r"\b3F\b", "third floor"), (r"\b58F\b", "fifty-eighth floor"), (r"\bHQ\b", "H Q"), (r"\bOkaeri\b", "Oh-kah-eh-ree"),
    (r"F-floor", "F— floor"), (r"\bkonbini\b", "kohnbini"), (r"\bMoshi moshi\b", "Moshee moshee"), (r"\bmoshi moshi\b", "moshee moshee"),
    (r"\bTasukete\b", "Tahs-keh-teh"), (r"\bIrasshaimase\b", "Ee-rah-shy-mah-seh"), (r"\bIrasshai\b", "Ee-rah-shy"), (r"\bArigatō gozaimashita\b", "Ah-ree-gah-toh go-zai-mahsh-tah"),
    (r"\bArigatō gozaimasu\b", "Ah-ree-gah-toh go-zai-mahss"), (r"\bArigatō\b", "Ah-ree-gah-toh"), (r"\bSumimasen\b", "Soo-mee-mah-sen"), (r"\bAbunai\b", "Ah-boo-nai"),
    (r"\bOhayō gozaimasu\b", "Oh-hah-yoh go-zai-mahss"), (r"\bOhayō\b", "Oh-hah-yoh"), (r"\bOtsukaresama desu\b", "Ots-kah-reh-sah-mah dess"), (r"\bOtsukaresama\b", "Ots-kah-reh-sah-mah"),
    (r"\bDōmo\b", "Doh-moh"), (r"\bKonbanwa\b", "Kohn-bahn-wah"), (r"\bKonnichiwa\b", "Kohn-nee-chee-wah"), (r"\bOyabun\b", "Oh-yah-boon"), (r"\bKurogane-kai\b", "Kuro-gah-neh kai"),
    (r"\bKurogane\b", "Kuro-gah-neh"), (r"\bJūzō\b", "Joo-zoh"), (r"\bBenzō\b", "Ben-zoh"), (r"\bRyūzaki\b", "Ryoo-zah-kee"), (r"\bŌmura\b", "Oh-moo-rah"),
    (r"\bŌnishi\b", "Oh-nee-shee"), (r"\bŌba\b", "Oh-bah"), (r"\bSatō\b", "Sah-toh"), (r"\bKatō\b", "Kah-toh"), (r"\bEndō\b", "En-doh"), (r"\bSaitō\b", "Sai-toh"),
    (r"\bŌsaka\b", "Oh-sah-kah"), (r"\bShinkansen\b", "Sheen-kahn-sen"), (r"\bsakazuki\b", "sah-kah-zoo-kee"), (r"\bSaisho wa guu\b", "Sai-sho wa goo"), (r"\bjan, ken\b", "jahn, ken"),
    (r"\bSo24\b", "So twenty-four"), (r"\bE-104\b", "E one oh four"), (r"¥([\d,]+)", r"\1 yen"), (r"\bkun\b", "koon"),
    (r"ō", "oh"), (r"Ō", "Oh"), (r"ū", "oo"), (r"Ū", "Oo"), (r"ā", "ah"), (r"ē", "eh"),
]

def run_extract():
    out = subprocess.run(["node", os.path.join(ROOT, "Tools/voice/extract_lines.mjs"), "--out", "/dev/stdout"], capture_output=True, text=True, check=True)
    return json.loads(out.stdout[out.stdout.index("["):])

def barks():
    """the street's lines: Web/game/barks.js exports BARKS = { context: [line, ...] } as plain JSON between markers"""
    p = os.path.join(ROOT, "Web/game/barks.js")
    if not os.path.exists(p): return {}
    src = open(p, encoding="utf-8").read()
    m = re.search(r"/\*BARKS\*/(.*?)/\*END\*/", src, re.S)
    return json.loads(m.group(1)) if m else {}

SKIP = {"This part of Seiko's story is being written. It arrives in the next update."}
def voiced(spk, text):
    t = text.strip()
    if not t or not re.search(r"[A-Za-z]{2}", t) or t in SKIP: return False
    if spk: return not t.startswith("♪")                                     # sung lines stay subtitles
    if t.startswith("♪"): return True                                        # station announcements
    if re.match(r"^(\*|Chapter|Respect|Peek)", t) or "·" in t or "—" in t: return False
    return len(re.findall(r"[A-Za-z']+", t)) >= 3

def speaker_of(spk, text):
    if spk == "" and re.match(r"^\s*♪", text): return "PA"
    if spk == "" and text.strip() in ("Please stand behind the yellow line.",): return "PA"
    if spk == "" and re.match(r"^\s*\(", text): return "Seiko"                 # his own thought
    return spk

def spoken_text(spk, text):
    t = re.sub(r"♪", "", text)
    t = re.sub(r"[　-ヿ一-鿿]+[。、！？]?", "", t)                # kana/kanji: the PA says the English half
    t = re.sub(r"\*[^*]{1,24}\*", " ", t)                                    # *click*, *bzzt*: sound effects, not words
    t = re.sub(r"^\s*\((.*)\)\s*$", r"\1", t)                                 # a thought in brackets is still said, softly
    t = re.sub(r"\([^)]{0,90}\)", " ", t)                                    # (coughing), (He swirls his whisky.): stage directions
    t = t.replace("“", "").replace("”", "").replace("…", "... ").replace("—", ", ").replace("✦", "")
    for a, b in SAY: t = re.sub(a, b, t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^[.,… ]+", "", t)
    return t

def h01(s, salt):
    return int(hashlib.sha1((salt + s).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF

def cast_for(name):
    """the voice for a speaker: theirs from CAST, else one made from their name and sex"""
    c = CAST.get(name)
    if c and "same" in c: return cast_for(c["same"])
    if c: return c
    tag = PEOPLE.get(name) or PEOPLE.get(name.split(" ")[0]) or ("f" if re.search(r"(ko|mi|na|ka|yo|ri|ho|e|ki|Mrs|Ms|woman|lady|girl)\b", name) else "m")
    sex, age = (tag.split(":") + [""])[:2]
    pool = M_POOL if sex == "m" else F_POOL
    a = pool[int(h01(name, "a") * len(pool))]
    b = pool[int(h01(name, "b") * len(pool))]
    if b == a: b = pool[(pool.index(a) + 3) % len(pool)]
    w = round(0.55 + 0.3 * h01(name, "w"), 2)
    speed = round(0.94 + 0.12 * h01(name, "s") - (0.08 if age == "old" else 0) + (0.05 if age == "young" else 0), 3)
    return {"voice": {a: w, b: round(1 - w, 2)}, "speed": speed, "sex": sex}

def plan():
    """[(key, voice-speaker, text, kind, track?)] for every line, piece and name"""
    jobs = {}
    def put(key, who, text, kind, track=True):
        if key not in jobs: jobs[key] = (who, text, kind, track)
    lines = run_extract()
    for l in lines:
        spk = l["spk"]
        if l.get("dyn"):
            for piece in l["dyn"]:
                if isinstance(piece, str) and re.search(r"[A-Za-z]{2}", piece) and len(re.findall(r"[A-Za-z']+", piece)) >= 1:
                    for who in (l.get("cands") or ([spk] if spk != "?" else ["?m", "?f"])):
                        if who == "" : continue
                        put(f"{who}|piece|{piece.strip()}", l.get("as") or who, piece, "piece")
            continue
        text = l["text"]
        if l["kind"].startswith("bark"):
            for v in BARK_VOICES: put(f"{v}|{text}", v, text, "bark")
            continue
        if not voiced(spk, text): continue
        who = speaker_of(spk, text)
        if who == "?":
            for c in (l.get("cands") or ["?m", "?f"]): put(f"{c}|{text}", c, text, l["kind"])
            continue
        put(f"{spk}|{text}", l.get("as") or who, text, l["kind"], track=not l.get("phone") and who not in ("PA", "") and not re.match(r"^\s*\(", text))
    for ctx, arr in barks().items():
        for text in arr:
            for v in BARK_VOICES: put(f"{v}|{text}", v, text, "bark")
    # the names bank: what the pieces are glued around (Tools/voice/names.json, written by the game's own data dump)
    np_ = os.path.join(ROOT, "Tools/voice/names.json")
    if os.path.exists(np_):
        names = json.load(open(np_, encoding="utf-8"))
        for who, arr in names.items():
            for n in arr: put(f"{who}|name|{n}", who, n, "name", track=False)
    return jobs
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
    ap.add_argument("--models")
    ap.add_argument("--only"); ap.add_argument("--force", action="store_true"); ap.add_argument("--list", action="store_true")
    ap.add_argument("--shard", default="0/1", help="i/n: voice every n-th line from i (run n of these side by side, then once with --merge)")
    ap.add_argument("--merge", action="store_true", help="only rebuild index.json from the shards' parts")
    a = ap.parse_args()
    jobs = plan()
    if a.list:
        by = {}
        for k, (who, text, kind, tr) in sorted(jobs.items()):
            print(f"{who:18s} {kind:9s} {text[:110]}"); by[kind] = by.get(kind, 0) + 1
        print(len(jobs), "clips", by); return
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, "index.json")
    man = json.load(open(man_path)) if os.path.exists(man_path) else {"lines": {}}
    si, sn = (int(x) for x in a.shard.split("/"))
    part_path = os.path.join(OUT, f".part{si}.json")
    if not a.merge:
        import onnx, onnxruntime as ort, soundfile as sf
        from kokoro_onnx import Kokoro
        onnx_path = os.path.join(a.models, "kokoro-v1.0.onnx")
        k = Kokoro(onnx_path, os.path.join(a.models, "voices-v1.0.bin"))
        dur_path = os.path.join(a.models, "kokoro-v1.0.dur.onnx")
        if not os.path.exists(dur_path):                      # expose the duration predictor's integer frames as a second output
            m = onnx.load(onnx_path)
            m.graph.output.append(onnx.helper.make_tensor_value_info("/encoder/Gather_output_0", onnx.TensorProto.INT64, None))
            onnx.save(m, dur_path)
        so = ort.SessionOptions(); so.intra_op_num_threads = max(1, (os.cpu_count() or 4) // sn)
        sess = ort.InferenceSession(dur_path, so)
        part = json.load(open(part_path)) if os.path.exists(part_path) else {}
        cache = dict(man["lines"])                            # every clip already made, by any shard, can be reused
        for f in os.listdir(OUT):
            if f.startswith(".part") and f.endswith(".json"):
                try: cache.update(json.load(open(os.path.join(OUT, f))))
                except Exception: pass
        for i, (key, (who, text, kind, want_track)) in enumerate(sorted(jobs.items())):
            if i % sn != si: continue
            if a.only and who != a.only: continue
            c = cast_for(who)
            h = hashlib.sha1((key + json.dumps(c, sort_keys=True) + kind).encode()).hexdigest()[:12]
            name = re.sub(r"[^a-z0-9]", "", (who or "narrator").lower().replace("~", "street").replace("?", "anyone").encode("ascii", "ignore").decode()) or "narrator"
            fn = f"{name}_{h}.ogg"
            old = part.get(key) or cache.get(key)
            if not a.force and old and old["src"].endswith(fn) and os.path.exists(os.path.join(OUT, fn)): part[key] = old; continue
            say = spoken_text(who, text)
            if not re.search(r"[A-Za-z]", say): continue
            lang = "en-gb" if (isinstance(c["voice"], str) and c["voice"].startswith("b")) or (isinstance(c["voice"], dict) and max(c["voice"], key=c["voice"].get).startswith("b")) else "en-us"
            ph = k.tokenizer.phonemize(say, lang)
            chars = [ch for ch in ph if ch in k.tokenizer.vocab] if hasattr(k.tokenizer, "vocab") else list(ph)
            chars = chars[:500]
            tok = k.tokenizer.tokenize("".join(chars))
            if len(tok) != len(chars) or not tok: print("skip (tokens)", key); continue
            v = c["voice"]
            style_bank = sum(k.get_voice_style(n) * w for n, w in v.items()) if isinstance(v, dict) else k.get_voice_style(v)
            style = style_bank[len(tok)]
            audio, durs = sess.run(None, {"tokens": np.array([[0, *tok, 0]], dtype=np.int64), "style": style,
                                          "speed": np.array([c.get("speed", 1.0)], dtype=np.float32)})
            audio = audio.astype(np.float32).reshape(-1)
            thought = bool(re.match(r"^\s*\(", text)) and who == "Seiko"
            with tempfile.TemporaryDirectory() as td:
                wav = os.path.join(td, "a.wav"); sf.write(wav, audio, 24000)
                fx = []                                    # no trimming at the start: the mouth track is timed from sample 0
                if c.get("fx"): fx.append(c["fx"])
                if thought: fx.append("lowpass=f=6000,aecho=0.7:0.4:40:0.2")
                if kind in ("piece", "name"): fx.append("areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse")  # pieces butt up
                fx.append("loudnorm=I=%d:TP=-1.5:LRA=7" % (-20 if thought else -16))
                if kind not in ("piece", "name"): fx.append("apad=pad_dur=0.12")
                br = "40k" if kind not in ("bark", "piece", "name") else "32k"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", ",".join(fx), "-ar", "48000", "-ac", "1",
                                "-c:a", "libopus", "-b:a", br, os.path.join(OUT, fn)], check=True)
                secs = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(OUT, fn)], capture_output=True, text=True).stdout.strip() or len(audio) / 24000)
            track = mouth_track(chars, [int(x) for x in np.array(durs).reshape(-1)], audio, 24000) if want_track and kind not in ("piece", "name") else None
            part[key] = {"src": "audio/voice/" + fn, "dur": round(secs, 3), "who": who, "fps": 30, **({"m": enc(track)} if track is not None else {})}
            print(f"[{si}] {who:14s} {secs:5.2f}s  {text[:70]}", flush=True)
            if len(part) % 25 == 0: json.dump(part, open(part_path, "w"), ensure_ascii=False)
        json.dump(part, open(part_path, "w"), ensure_ascii=False)
        if sn > 1: return
    # merge: every shard's part, the cast and each speaker's sex
    lines = {}
    for f in sorted(os.listdir(OUT)):
        if f.startswith(".part") and f.endswith(".json"): lines.update(json.load(open(os.path.join(OUT, f))))
    lines = {k2: v2 for k2, v2 in lines.items() if k2 in jobs}
    keep = {v2["src"].split("/")[-1] for v2 in lines.values()}
    if not a.only:
        for f in os.listdir(OUT):
            if f.endswith(".ogg") and f not in keep: os.remove(os.path.join(OUT, f))
    speakers = {k2.split("|")[0] for k2 in lines} | {who for (who, _, _, _) in jobs.values()}
    man = {"lines": lines,
           "cast": {s: cast_for(s).get("look") for s in speakers if cast_for(s).get("look")},
           "sex": {s: cast_for(s).get("sex", "m") for s in speakers},
           "barkVoices": BARK_VOICES,
           "note": "Generated by Tools/voice/build_voices.py (Kokoro-82M TTS, Apache-2.0). Do not edit by hand."}
    json.dump(man, open(man_path, "w"), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    for f in os.listdir(OUT):
        if f.startswith(".part"): os.remove(os.path.join(OUT, f))
    print(len(lines), "lines in", man_path, "·", round(sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1e6, 1), "MB")

if __name__ == "__main__":
    main()
