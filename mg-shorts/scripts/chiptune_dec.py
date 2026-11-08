#!/usr/bin/env python3
"""정원 오락실 STAGE 2 「낙엽 이불」 8비트 사운드 — src/arcade/dec.json 하나로 음악과 효과음을 만든다.

사각파 · 삼각파 · 노이즈만. 선율은 새로 쓴 것.
장면 결: calm(잠든 밤) · warn(경고) · tense(서릿발) · hero(기사단 출격) · boss(북풍) · calm2(겨울 손님) · end(미션)
사용: python3 scripts/chiptune_dec.py → public/leaf-blanket.wav
"""
import json
import wave
from pathlib import Path

import numpy as np

from holds import apply_holds

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "src/arcade/dec.json").read_text())
SR = 48000
FPS = TL["fps"]
BEAT = 60 / TL["bpm"]
BAR = BEAT * 4
TOTAL = TL["total"] / FPS
rng = np.random.default_rng(12)
music = np.zeros(int(SR * (TOTAL + 1)))
sfx = np.zeros_like(music)


def hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.004, d=0.06, s=0.6, r=0.04):
    e = np.ones(n) * s
    ai, di, ri = int(a * SR), int(d * SR), int(r * SR)
    if ai:
        e[:ai] = np.linspace(0, 1, ai)
    if di:
        e[ai : ai + di] = np.linspace(1, s, len(e[ai : ai + di]))
    if ri and n > ri:
        e[-ri:] *= np.linspace(1, 0, ri)
    return e


def pulse(f, dur, duty=0.25, vol=0.2, **k):
    n = int(dur * SR)
    f = f if np.ndim(f) else np.full(n, f)
    ph = np.cumsum(f) / SR % 1.0
    return np.where(ph < duty, 1.0, -1.0) * vol * env(n, **k)


def tri(f, dur, vol=0.3, **k):
    n = int(dur * SR)
    f = f if np.ndim(f) else np.full(n, f)
    ph = np.cumsum(f) / SR % 1.0
    return (4 * np.abs(ph - 0.5) - 1) * vol * env(n, **k)


def noise(dur, vol=0.2, hold=6, **k):
    n = int(dur * SR)
    x = np.repeat(rng.uniform(-1, 1, n // hold + 1), hold)[:n]
    return x * vol * env(n, **k)


def put(buf, t, x):
    i = int(t * SR)
    j = min(len(buf), i + len(x))
    if 0 <= i < len(buf) and j > i:
        buf[i:j] += x[: j - i]


CH = {"C": [60, 64, 67], "F": [53, 57, 60], "G": [55, 59, 62], "Am": [57, 60, 64], "Em": [52, 55, 59], "E": [52, 56, 59], "Dm": [50, 53, 57]}
PAT = {
    "calm": ([2, -1, 1, -1, 0, -1, -1, -1], 8, 0.5, 0.06, 12),
    "warn": ([0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 1, 4, 1, 4], 16, 0.125, 0.07, 0),
    "tense": ([0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 2, 1, -1], 16, 0.25, 0.07, 0),
    "hero": ([3, -1, 4, 5, 6, -1, 5, 4, 3, -1, 4, 5, 4, 3, 2, -1], 16, 0.25, 0.1, 12),
    "boss": ([0, 3, 1, 4, 2, 5, 1, 4, 0, 3, 1, 4, 2, 5, 3, 6], 16, 0.125, 0.09, 12),
    "calm2": ([2, -1, 1, -1, 3, -1, 2, -1], 8, 0.5, 0.06, 12),
    "end": ([3, -1, -1, -1, 2, -1, 4, -1], 8, 0.5, 0.07, 12),
}


def tone(ch, i):
    b = CH[ch]
    return b[i % 3] + 12 * (i // 3)


for bar, (ch, st) in enumerate(zip(TL["chords"], TL["styles"])):
    t0 = bar * BAR
    pat, steps, duty, vol, octv = PAT[st]
    step = BAR / steps
    for k, idx in enumerate(pat):
        if idx >= 0:
            put(music, t0 + k * step, pulse(hz(tone(ch, idx) + octv), step * 0.9, duty, vol, d=0.05, s=0.55, r=0.02))
    root = CH[ch][0] - 12
    if st in ("calm", "calm2", "end"):
        put(music, t0, tri(hz(root), BAR * 0.95, 0.24, d=0.3, s=0.7, r=0.2))
        for b in range(4):
            put(music, t0 + b * BEAT + BEAT / 2, noise(0.02, 0.035, hold=2, d=0.015, s=0.0))
        continue
    per = 8 if st == "boss" else 4
    for b in range(per):
        n = root + (12 if b % 2 else 0)
        put(music, t0 + b * BAR / per, tri(hz(n), BAR / per * 0.9, 0.28, d=0.08, s=0.8, r=0.02))
    for b in range(4):
        tb = t0 + b * BEAT
        if b in (0, 2) or st == "boss":
            put(music, tb, tri(np.linspace(160, 40, int(0.12 * SR)), 0.12, 0.55, d=0.1, s=0.0))
        if b in (1, 3) and st != "warn":
            put(music, tb, noise(0.12, 0.2, d=0.1, s=0.0))
        sub = 4 if st == "boss" else 2
        for h in range(sub):
            put(music, tb + h * BEAT / sub, noise(0.03, 0.06, hold=2, d=0.02, s=0.0))



def arp(ns, each, duty=0.25, vol=0.15):
    return np.concatenate([pulse(hz(n), each, duty, vol, d=0.03, s=0.7, r=0.01) for n in ns])


def sweep(f0, f1, dur, duty=0.5, vol=0.15):
    return pulse(np.linspace(f0, f1, int(dur * SR)), dur, duty, vol, d=dur, s=0.0)


S = {
    "siren": np.concatenate([pulse(880, 0.12, 0.5, 0.13, s=0.9), pulse(660, 0.12, 0.5, 0.13, s=0.9)]),
    "heave": np.concatenate([noise(0.05, 0.25, hold=2, d=0.05, s=0.0), tri(np.linspace(120, 50, int(0.18 * SR)), 0.18, 0.5, d=0.15, s=0.0)]),
    "hurt": sweep(700, 220, 0.16, 0.5, 0.12),
    "launch": np.concatenate([sweep(300, 1200, 0.18, 0.25, 0.12), arp([72, 76, 79, 84], 0.06, 0.25, 0.14)]),
    "block": np.concatenate([noise(0.03, 0.18, hold=2, d=0.03, s=0.0), pulse(hz(91), 0.05, 0.125, 0.1, d=0.04, s=0.0)]),
    "layer": arp([79, 84, 88], 0.06, 0.5, 0.13),
    "bossIn": np.concatenate([noise(0.6, 0.22, hold=10, d=0.6, s=0.0), sweep(400, 90, 0.5, 0.5, 0.12)]),
    "volley": noise(0.14, 0.16, hold=3, d=0.13, s=0.0) + np.pad(sweep(1600, 900, 0.1, 0.125, 0.08), (0, int(0.04 * SR))),
    "rage": sweep(160, 60, 0.45, 0.5, 0.18),
    "retreat": sweep(1200, 200, 0.9, 0.5, 0.12),
    "clear": np.concatenate([arp([72, 76, 79], 0.12, 0.5, 0.15), arp([84], 0.5, 0.5, 0.15)]),
    "reveal": arp([88, 84], 0.06, 0.25, 0.1),
    "tick": pulse(hz(81), 0.05, 0.5, 0.09, d=0.04, s=0.0),
    "mission": np.concatenate([noise(0.06, 0.25, hold=8, d=0.06, s=0.0), arp([72, 79, 84], 0.08, 0.25, 0.14)]),
}
ev = [(w, "siren") for w in TL["warning"]] + [(h, "heave") for h in TL["heave"]] + [(h + 3, "hurt") for h in TL["heave"]]
ev += [(TL["launch"], "launch")] + [(b, "block") for b in TL["blocks"]] + [(l, "layer") for l in TL["layers"]]
ev += [(TL["bossIn"], "bossIn")] + [(v, "volley") for v in TL["volleys"]] + [(TL["rage"], "rage"), (TL["retreat"], "retreat"), (TL["clear"], "clear")]
ev += [(r, "reveal") for r in TL["reveal"]] + [(d, "tick") for d in TL["decay"]] + [(TL["mission"], "mission")]
for fr, name in ev:
    put(sfx, fr / FPS, S[name])

# 읽기 멈춤: 원본 길이로 자른 뒤 멈춤 구간을 끼워 넣고, 엔딩 페이드는 늘어난 길이 끝에 건다
N = int(SR * TOTAL)
music, sfx = apply_holds(music[:N], sfx[:N], TL.get("holds", []), FPS, BAR, SR)
fade_from = len(music) - int(SR * 2.5)
music[fade_from:] *= np.linspace(1, 0, len(music) - fade_from)
mix = music * 0.55 + sfx * 0.85
mix /= max(1e-9, np.abs(mix).max()) / 0.89
right = np.concatenate([np.zeros(24), mix[:-24]]) * 0.6 + mix * 0.4
st = (np.stack([mix, right], axis=1) * 32767).astype(np.int16)
out = ROOT / "public/leaf-blanket.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(st.tobytes())
print(f"wrote {out} {len(mix)/SR:.2f}s, {len(ev)} sfx events")
