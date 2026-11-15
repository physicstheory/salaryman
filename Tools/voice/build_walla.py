#!/usr/bin/env python3
"""A crowd made of real voices: Web/audio/amb/walla.ogg, a seamless 40 s stereo loop.

    python3 Tools/voice/build_walla.py

Takes the street's own recorded lines (the bark clips from build_voices.py, chat, phone calls, greetings, plus some floor talk), and
layers about 140 of them at random times, distances and sides: near voices a little clearer, far ones dull and low, with a touch of
room. Nobody can be made out, which is what a crowd is. The loop's tail is folded over its head so it never clicks.
Run it after build_voices.py; cityaudio.js plays it under the city and lets the synthesised murmur (soundscape.js) step back.
"""
import json, os, random, subprocess, tempfile
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VOICE = os.path.join(ROOT, "Web", "audio", "voice")
OUT = os.path.join(ROOT, "Web", "audio", "amb")
SR, LEN = 24000, 40.0

def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s = a * s + (1 - a) * x[i]; y[i] = s
    return y

def main():
    man = json.load(open(os.path.join(VOICE, "index.json")))["lines"]
    keys = [k for k in man if k.startswith("~")] + [k for k in man if k.split("|")[0] in ("Mori", "Nakano", "Ishikawa", "Fujita", "Kimura", "Satō", "Ogawa")]
    random.seed(7)
    random.shuffle(keys)
    n = int(SR * LEN)
    mix = np.zeros((2, n), dtype=np.float32)
    used = 0
    for k in keys[:220]:
        try: x = decode(os.path.join(ROOT, "Web", man[k]["src"]))
        except Exception: continue
        if len(x) < SR * 0.3: continue
        dist = random.uniform(2.5, 18)
        x = lowpass(x, 5200 / (1 + dist / 6)) * (0.9 / dist ** 0.85) * random.uniform(0.6, 1.0)
        pan = random.uniform(-0.9, 0.9)
        at = random.randint(0, n - 1)
        for ch, g in ((0, np.sqrt(0.5 * (1 - pan))), (1, np.sqrt(0.5 * (1 + pan)))):
            end = at + len(x)
            if end <= n: mix[ch, at:end] += x * g
            else: mix[ch, at:] += x[: n - at] * g; mix[ch, : end - n] += x[n - at:] * g          # wraps round: the loop is seamless
        used += 1
    # a little room: two short reflections
    for d, g in ((int(SR * 0.023), 0.25), (int(SR * 0.041), 0.15)):
        mix += np.roll(mix, d, axis=1) * g
    mix /= max(1e-6, np.percentile(np.abs(mix), 99.9)) / 0.5
    mix = np.clip(mix, -0.98, 0.98)
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        raw = os.path.join(td, "w.f32"); mix.T.astype(np.float32).tofile(raw)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", raw, "-af", "highpass=f=140,loudnorm=I=-23:TP=-3",
                        "-ar", "48000", "-c:a", "libopus", "-b:a", "48k", os.path.join(OUT, "walla.ogg")], check=True)
    print(used, "voices in", os.path.join(OUT, "walla.ogg"), round(os.path.getsize(os.path.join(OUT, "walla.ogg")) / 1e3), "kB")

if __name__ == "__main__":
    main()
