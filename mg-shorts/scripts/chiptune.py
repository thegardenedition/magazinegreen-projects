#!/usr/bin/env python3
"""「구근의 모험」 8비트 사운드 — 음악 + 효과음을 src/arcade/timeline.json 하나로 만든다.

화면과 소리가 같은 이벤트 목록을 읽으므로 점프·타격·코인 소리가 프레임 단위로 맞는다.
파형은 사각파(펄스 폭 12.5/25/50%) · 삼각파(베이스) · 노이즈(드럼)만 쓴다 — 옛 아케이드 음원 칩의 재료.
모든 선율은 이 파일에서 새로 쓴 것이다(기존 게임 음악을 옮기지 않음).

사용: python3 scripts/chiptune.py  → public/arcade.wav (48kHz 16bit stereo)
"""
import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "src/arcade/timeline.json").read_text())
SR = 48000
FPS = TL["fps"]
BEAT = 60 / TL["bpm"]  # 0.5s
BAR = BEAT * 4
TOTAL = TL["total"] / FPS
rng = np.random.default_rng(7)

music = np.zeros(int(SR * (TOTAL + 1)))
sfx = np.zeros_like(music)


def note_hz(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.004, d=0.06, s=0.6, r=0.04):
    t = np.arange(n) / SR
    e = np.ones(n) * s
    ai = int(a * SR)
    di = int(d * SR)
    ri = int(r * SR)
    if ai:
        e[:ai] = np.linspace(0, 1, ai)
    if di:
        e[ai : ai + di] = np.linspace(1, s, len(e[ai : ai + di]))
    if ri and n > ri:
        e[-ri:] *= np.linspace(1, 0, ri)
    return e


def pulse(freq, dur, duty=0.25, vol=0.2, **k):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq if np.ndim(freq) else np.full(n, freq)
    ph = np.cumsum(f) / SR % 1.0
    return np.where(ph < duty, 1.0, -1.0) * vol * env(n, **k)


def tri(freq, dur, vol=0.3, **k):
    n = int(dur * SR)
    f = freq if np.ndim(freq) else np.full(n, freq)
    ph = np.cumsum(f) / SR % 1.0
    return (4 * np.abs(ph - 0.5) - 1) * vol * env(n, **k)


def noise(dur, vol=0.2, hp=False, **k):
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    # 옛 칩의 노이즈처럼 샘플을 몇 개씩 붙잡아 거칠게(높을수록 짧게 붙잡음)
    hold = 2 if hp else 6
    x = np.repeat(x[::hold], hold)[:n]
    return x * vol * env(n, **k)


def put(buf, t, x):
    i = int(t * SR)
    j = min(len(buf), i + len(x))
    if i < len(buf) and j > i:
        buf[i:j] += x[: j - i]


# ---------------- 음악 ----------------
CH = {
    "C": [60, 64, 67], "F": [53, 57, 60], "G": [55, 59, 62], "Am": [57, 60, 64],
    "Em": [52, 55, 59], "E": [52, 56, 59],
}
# 화음 구성음 번호(0,1,2=근·3·5, 3,4,5=한 옥타브 위) 리듬 패턴, -1 은 쉼표
PAT = {
    "title": ([0, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 3, 4, 5, 4, 3], 16, 0.125, 0.10),
    "s1": ([3, -1, 4, 3, 2, -1, 3, 1, 3, -1, 4, 5, 4, 3, 2, -1], 16, 0.25, 0.11),
    "s2": ([0, -1, -1, 2, -1, -1, 1, -1], 8, 0.5, 0.08),
    "s3": ([3, 4, 5, 4, 3, 4, 5, 6, 5, 4, 3, 4, 5, 4, 3, 2], 16, 0.125, 0.10),
    "s4": ([5, 4, 3, 4, 5, 6, 5, 4, 3, 4, 5, 6, 7, 6, 5, 4], 16, 0.25, 0.09),
    "end": ([3, -1, -1, -1, 2, -1, -1, -1], 8, 0.5, 0.07),
}


def tone(chord, i):
    base = CH[chord]
    return base[i % 3] + 12 * (i // 3)


for bar, (chord, style) in enumerate(zip(TL["chords"], TL["styles"])):
    t0 = bar * BAR
    if t0 >= TOTAL:
        break
    pat, steps, duty, vol = PAT[style]
    step = BAR / steps
    lead_oct = 12 if style != "s2" else 0
    for k, idx in enumerate(pat):
        if idx < 0:
            continue
        n = tone(chord, idx) + lead_oct
        put(music, t0 + k * step, pulse(note_hz(n), step * 0.9, duty, vol, d=0.05, s=0.55, r=0.02))
    # 베이스: 삼각파, 겨울은 2분음표, 나머지는 4분음표에 옥타브 튕김
    root = CH[chord][0] - 12
    beats = 2 if style in ("s2", "end") else 4
    for b in range(beats):
        n = root + (12 if (b % 2 and style not in ("s2", "end")) else 0)
        put(music, t0 + b * BAR / beats, tri(note_hz(n), BAR / beats * 0.92, 0.28, d=0.1, s=0.8, r=0.03))
    # 드럼
    if style in ("s1", "s3", "s4", "title"):
        for b in range(4):
            tb = t0 + b * BEAT
            if b in (0, 2):  # 킥: 음높이가 떨어지는 삼각파
                put(music, tb, tri(np.linspace(160, 40, int(0.12 * SR)), 0.12, 0.55, d=0.1, s=0.0))
            if b in (1, 3) and style != "title":  # 스네어
                put(music, tb, noise(0.12, 0.22, d=0.1, s=0.0))
            sub = 4 if style == "s4" else 2
            for h in range(sub):
                put(music, tb + h * BEAT / sub, noise(0.03, 0.07, hp=True, d=0.02, s=0.0))
    elif style == "s2":
        put(music, t0, tri(np.linspace(120, 40, int(0.15 * SR)), 0.15, 0.4, d=0.12, s=0.0))
        for b in range(4):
            put(music, t0 + b * BEAT + BEAT / 2, noise(0.02, 0.05, hp=True, d=0.015, s=0.0))

# 엔딩 마지막 마디는 잦아든다
fade_from = int(SR * (TOTAL - 3))
music[fade_from:] *= np.linspace(1, 0, len(music) - fade_from)


# ---------------- 효과음 ----------------
def arp(notes, each, duty=0.25, vol=0.16):
    return np.concatenate([pulse(note_hz(n), each, duty, vol, d=0.03, s=0.7, r=0.01) for n in notes])


def sweep(f0, f1, dur, duty=0.5, vol=0.16):
    return pulse(np.linspace(f0, f1, int(dur * SR)), dur, duty, vol, d=dur, s=0.0)


S = {
    "coin": np.concatenate([pulse(note_hz(83), 0.07, 0.5, 0.15, s=0.9), pulse(note_hz(88), 0.32, 0.5, 0.15, d=0.3, s=0.0)]),
    "start": arp([72, 76, 79, 84, 88, 91], 0.06, 0.25, 0.17),
    "ready": pulse(note_hz(76), 0.12, 0.5, 0.13, d=0.1, s=0.0),
    "go": arp([84, 91], 0.09, 0.5, 0.15),
    "hop": sweep(330, 760, 0.12, 0.5, 0.12),
    "plunge": sweep(900, 180, 0.35, 0.5, 0.14),
    "dig": noise(0.09, 0.22, d=0.08, s=0.0),
    "planted": arp([67, 72, 76], 0.07, 0.5, 0.14),
    "blip": pulse(note_hz(81), 0.06, 0.5, 0.12, d=0.05, s=0.0),
    "frost": np.concatenate([noise(0.04, 0.16, hp=True, d=0.04, s=0.0), sweep(1400, 700, 0.1, 0.125, 0.1)]),
    "powerup": arp([60, 64, 67, 72, 76, 79, 84, 88, 91, 96], 0.045, 0.25, 0.15),
    "collect": arp([84, 91], 0.06, 0.25, 0.14),
    "burst": noise(0.45, 0.3, d=0.4, s=0.0),
    "clear": np.concatenate([arp([72, 76, 79], 0.12, 0.5, 0.15), arp([84], 0.5, 0.5, 0.15)]),
    "light": pulse(note_hz(96), 0.05, 0.125, 0.09, d=0.04, s=0.0),
    "oneup": arp([79, 84, 88, 91, 96], 0.05, 0.25, 0.15),
    "count": pulse(note_hz(69), 0.1, 0.5, 0.13, d=0.09, s=0.0),
}

ev = []
f2t = lambda fr: fr / FPS
ev += [(TL["coin"], "coin"), (TL["start"], "start"), (TL["plunge"], "plunge"), (TL["planted"], "planted"),
       (TL["powerup"], "powerup"), (TL["burst"], "burst"), (TL["clear"], "clear")]
for k, (r, g) in TL["ready"].items():
    ev += [(r, "ready"), (g, "go")]
ev += [(h, "hop") for h in TL["hops"]] + [(d, "dig") for d in TL["digs"]] + [(r, "blip") for r in TL["ruler"]]
ev += [(f, "frost") for f in TL["frost"]] + [(d, "collect") for d in TL["drops"]]
ev += [(l, "light") for l in TL["lights"]] + [(o, "oneup") for o in TL["oneups"]] + [(c, "count") for c in TL["count"]]
for fr, name in ev:
    put(sfx, f2t(fr), S[name])

mix = music * 0.55 + sfx * 0.85
mix = mix[: int(SR * TOTAL)]
mix /= max(1e-9, np.abs(mix).max()) / 0.89  # 피크 −1 dBFS (라우드니스는 납품 때 loudnorm 으로)
# 아주 살짝 좌우를 벌린다: 효과음은 가운데, 음악은 미세 지연
left = mix
right = np.concatenate([np.zeros(24), mix[:-24]]) * 0.6 + mix * 0.4
st = (np.stack([left, right], axis=1) * 32767).astype(np.int16)
out = ROOT / "public/arcade.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(st.tobytes())
print(f"wrote {out} {len(mix)/SR:.2f}s, {len(ev)} sfx events")
