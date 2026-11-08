"""읽기 멈춤(holds) — 화면이 대화 상자에서 멈춘 동안의 소리.

timeline JSON 의 "holds": [[원본 프레임, 멈출 프레임 수], ...] (src/arcade/engine.tsx 의 srcFrame 과 같은 규칙).
멈춘 동안 음악은 멈춘 자리 직전 한 마디를 되풀이하고(박자 위상이 그대로라 이음매가 들리지 않는다),
효과음은 쉰다. 이음매마다 2ms 페이드로 딸깍 소리를 막는다. 길이는 샘플 단위로 정확히 맞춘다.
"""
import numpy as np


def _edge(x, k):
    x = x.copy()
    k = min(k, len(x) // 2)
    if k:
        x[:k] *= np.linspace(0, 1, k)
        x[-k:] *= np.linspace(1, 0, k)
    return x


def apply_holds(music, sfx, holds, fps, bar_s, sr, k=96):
    bar = int(round(bar_s * sr))
    m, s, prev = [], [], 0
    for at, n in sorted(holds):
        reps = n / (bar_s * fps)
        assert reps == int(reps), f"hold {at}: {n}f 는 한 마디의 배수가 아니다"
        i = int(round(at / fps * sr))
        assert i >= bar, f"hold {at}: 앞에 한 마디가 없다"
        m.append(_edge(music[prev:i], k))
        s.append(_edge(sfx[prev:i], k))
        m += [_edge(music[i - bar : i], k)] * int(reps)
        s.append(np.zeros(bar * int(reps)))
        prev = i
    m.append(_edge(music[prev:], k))
    s.append(_edge(sfx[prev:], k))
    return np.concatenate(m), np.concatenate(s)
