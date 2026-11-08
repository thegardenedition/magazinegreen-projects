#!/usr/bin/env python3
"""1화 삽입 「PLANT DATA · 구근」 6초 사운드 — src/arcade/dex.json 으로.
1화 타이틀 음악(C·F·G, 120 BPM)에서 이어지고, 다음 STAGE 1 의 C 화음으로 넘어간다.
사용: python3 scripts/chiptune_dex.py → public/dex.wav
"""
import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "src/arcade/dex.json").read_text())
SR = 48000
FPS = TL["fps"]
BAR = 60 / TL["bpm"] * 4
TOTAL = TL["total"] / FPS
rng = np.random.default_rng(3)
out = np.zeros(int(SR * TOTAL))


def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.004, d=0.06, s=0.6, r=0.03):
    e = np.ones(n) * s
    ai, di, ri = int(a * SR), int(d * SR), int(r * SR)
    e[:ai] = np.linspace(0, 1, ai)
    e[ai : ai + di] = np.linspace(1, s, len(e[ai : ai + di]))
    e[-ri:] *= np.linspace(1, 0, ri)
    return e


def pulse(f, dur, duty=0.25, vol=0.1, **k):
    n = int(dur * SR)
    ph = np.cumsum(np.full(n, f)) / SR % 1.0
    return np.where(ph < duty, 1.0, -1.0) * vol * env(n, **k)


def tri(f, dur, vol=0.25, **k):
    n = int(dur * SR)
    ph = np.cumsum(np.full(n, f)) / SR % 1.0
    return (4 * np.abs(ph - 0.5) - 1) * vol * env(n, **k)


def put(t, x, buf=out):
    i = int(t * SR)
    j = min(len(buf), i + len(x))
    if i < len(buf):
        buf[i:j] += x[: j - i]


CH = {"C": [60, 64, 67], "F": [53, 57, 60], "G": [55, 59, 62]}
pat = [0, 2, 1, 3, 2, 4, 3, 5]  # 차분한 8분음표 분산화음(도감을 읽는 속도)
for bar, ch in enumerate(TL["chords"]):
    t0 = bar * BAR
    base = CH[ch]
    for k, i in enumerate(pat):
        n = base[i % 3] + 12 * (i // 3) + 12
        put(t0 + k * BAR / 8, pulse(hz(n), BAR / 8 * 0.85, 0.25, 0.085, d=0.05, s=0.5, r=0.02))
    put(t0, tri(hz(base[0] - 12), BAR * 0.5, 0.24, d=0.1, s=0.8))
    put(t0 + BAR / 2, tri(hz(base[0] - 12), BAR * 0.5, 0.24, d=0.1, s=0.8))
    for b in range(4):
        x = np.repeat(rng.uniform(-1, 1, int(0.03 * SR) // 2 + 1), 2)[: int(0.03 * SR)] * 0.05 * env(int(0.03 * SR), d=0.02, s=0.0)
        put(t0 + b * BAR / 4 + BAR / 8, x)

blip = lambda n: np.concatenate([pulse(hz(n), 0.05, 0.5, 0.12, d=0.04, s=0.0, r=0.01), pulse(hz(n + 7), 0.06, 0.5, 0.1, d=0.05, s=0.0, r=0.01)])
for fr in TL["labels"]:
    put(fr / FPS, blip(84))
for fr in TL["rows"]:
    put(fr / FPS, blip(79))
put(TL["vs"] / FPS, np.concatenate([pulse(hz(72), 0.08, 0.5, 0.13, s=0.9), pulse(hz(79), 0.16, 0.5, 0.13, d=0.15, s=0.0)]))
put(TL["onion"] / FPS, blip(88))

out /= max(1e-9, np.abs(out).max()) / 0.85
right = np.concatenate([np.zeros(24), out[:-24]]) * 0.6 + out * 0.4
st = (np.stack([out, right], axis=1) * 32767).astype(np.int16)
p = ROOT / "public/dex.wav"
with wave.open(str(p), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(st.tobytes())
print(f"wrote {p} {len(out)/SR:.2f}s")
