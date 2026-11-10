"""Higgsfield 클립(기존 영상)과 실측 모션그래픽을 내레이션 시간축에 맞춰 엮는다.

시간축은 최종본 대본(../메덩골정원_반전쇼츠_최종본.md)의 0~60초를 따르고,
자막은 ../화면자막.srt(큰 글씨)와 ../하단캡션.srt(작은 글씨)를 그대로 얹는다.
모션그래픽은 site_blueprint.py 의 Renderer 를 원하는 시각으로 직접 불러 그리므로
느리게 늘인 구간도 프레임 복제 없이 매끄럽다.

Clip 02 의 3.3~5.5초에는 사람이 담을 차는 동작이 있어 쓰지 않는다(사용자 지시).
AI 생성 클립 위에는 'AI 생성 영상' 표기를 단다.

사용:
  python3 compose_weave.py --out medeonggol_weave.mp4
  python3 compose_weave.py --still 15 --still 20 --out check.png
"""

import argparse
import glob
import math
import os
import re
import subprocess
import urllib.request

import numpy as np
from PIL import Image, ImageDraw

import site_blueprint as sb

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
W, H, FPS = sb.W, sb.H, sb.FPS

CLIPS = {
    "clip01": "https://d8j0ntlcm91z4.cloudfront.net/user_3KcRqK6RIUPy2RaaLRBKDHuTOIw/"
              "hf_20261024_171201_6ba4a145-b365-41e1-b38e-272fa811dd5a.mp4",
    "clip02": "https://d8j0ntlcm91z4.cloudfront.net/user_3KcRqK6RIUPy2RaaLRBKDHuTOIw/"
              "hf_20261024_172117_945fc268-9a4d-4af6-93e9-8f2d153605cb.mp4",
}

# (출력 시작, 출력 끝, 종류, 원본 시작, 원본 끝, HUD 라벨)
TIMELINE = [
    (0.0, 2.0, "clip01", 0.0, 2.0, "FOOTAGE · 백 년 된 숲?"),
    (2.0, 8.0, "before", 0.0, 1.0, "PHOTO · 조성 전 실제 모습"),
    (8.0, 14.0, "motion", 2.5, 9.0, None),
    (14.0, 19.0, "clip02", 0.0, 3.0, "FOOTAGE · 반듯한 담"),
    (19.0, 19.4, "glitch", 3.0, 6.0, None),
    (19.4, 21.4, "clip02", 6.0, 8.0, "FOOTAGE · 허물다"),
    (21.4, 30.0, "motion", 36.0, 38.45, None),
    (30.0, 34.0, "motion", 28.6, 32.6, None),
    (34.0, 46.0, "motion", 38.5, 43.9, None),
    (46.0, 52.0, "motion", 17.2, 23.0, None),
    (52.0, 58.5, "motion", 44.0, 48.99, None),
    (58.5, 65.5, "motion", 49.0, 56.0, None),
]
DURATION = TIMELINE[-1][1]


def fetch_clip(name):
    os.makedirs(CACHE, exist_ok=True)
    mp4 = os.path.join(CACHE, f"{name}.mp4")
    if not os.path.exists(mp4):
        urllib.request.urlretrieve(CLIPS[name], mp4)
    fdir = os.path.join(CACHE, name)
    if not os.path.isdir(fdir) or not glob.glob(os.path.join(fdir, "*.jpg")):
        os.makedirs(fdir, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-vf", f"scale={W}:{H}", "-q:v", "2",
                        os.path.join(fdir, "f%04d.jpg")], check=True)
    frames = sorted(glob.glob(os.path.join(fdir, "*.jpg")))
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate",
                          "-of", "csv=p=0", mp4], capture_output=True, text=True).stdout.strip()
    a, b = out.split("/")
    return frames, float(a) / float(b)


def parse_srt(path):
    txt = open(path, encoding="utf-8").read().strip()
    subs = []
    for block in re.split(r"\n\s*\n", txt):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        m = re.match(r"(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)", lines[1])
        g = [int(x) for x in m.groups()]
        a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        b = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        subs.append((a, b, "\n".join(lines[2:])))
    return subs


class Weaver:
    def __init__(self, args):
        ns = argparse.Namespace(data=os.path.join(HERE, "site_data.json"), font=args.font, logo=None, no_captions=True)
        self.r = sb.Renderer(ns)
        self.clips = {n: fetch_clip(n) for n in CLIPS}
        # 조성 전 실제 사진(사용자 제공). 저장소에는 넣지 않고 경로로 받는다.
        self.before = None
        if args.before:
            im = Image.open(args.before).convert("RGB")
            s = max(W / im.width, H / im.height)
            im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
            x, y = (im.width - W) // 2, (im.height - H) // 2
            self.before = im.crop((x, y, x + W, y + H))
        root = os.path.abspath(os.path.join(HERE, ".."))
        self.big = parse_srt(os.path.join(root, "화면자막.srt"))
        self.small = parse_srt(os.path.join(root, "하단캡션.srt"))

    def clip_frame(self, name, t):
        frames, fps = self.clips[name]
        i = min(int(t * fps), len(frames) - 1)
        return Image.open(frames[i]).convert("RGB")

    def footage(self, name, src_t, label, t):
        img = self.clip_frame(name, src_t).convert("RGBA")
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)
        # 실사 위 HUD: 주사선 + 모서리 + 라벨
        for y in range(0, H, 6):
            dr.line([(0, y), (W, y)], fill=(0, 0, 0, 26))
        self.r.hud(dr, t, label)
        tag = "AI 생성 영상"
        tw = dr.textlength(tag, font=self.r.f_small)
        dr.rectangle((W - 40 - tw - 26, 104, W - 40, 140), fill=(0, 0, 0, 140))
        dr.text((W - 40 - tw - 13, 109), tag, font=self.r.f_small, fill=(255, 255, 255, 220))
        return Image.alpha_composite(img, ov).convert("RGB")

    def glitch(self, u, t):
        a = np.array(self.clip_frame("clip02", 2.9 + u * 0.1)).astype(np.int16)
        b = np.array(self.clip_frame("clip02", 6.0)).astype(np.int16)
        base = (a * (1 - u) + b * u).astype(np.int16)
        rng = np.random.default_rng(int(t * 100))
        out = base.copy()
        shift = int(30 * math.sin(u * math.pi))
        out[..., 0] = np.roll(base[..., 0], shift, axis=1)
        out[..., 2] = np.roll(base[..., 2], -shift, axis=1)
        for _ in range(14):
            y = rng.integers(0, H - 60)
            h = rng.integers(8, 60)
            out[y:y + h] = np.roll(out[y:y + h], rng.integers(-120, 120), axis=1)
        flash = math.sin(u * math.pi) * 0.35
        out = out * (1 - flash) + np.array(sb.HUD) * flash
        img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
        dr = ImageDraw.Draw(img, "RGBA")
        self.r.hud(dr, t, "SIGNAL · COLLAPSE")
        return img

    def subtitles(self, img, t):
        if t >= 60.0:
            return img
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)
        for a, b, text in self.big:
            if a <= t < b:
                al = min(sb.ease(sb.ph(t, (a, a + 0.3))), 1 - sb.ease(sb.ph(t, (b - 0.25, b))))
                self.r.caption(dr, text, None, alpha=al, y=1500)
        for a, b, text in self.small:
            if a <= t < b:
                al = min(sb.ease(sb.ph(t, (a, a + 0.3))), 1 - sb.ease(sb.ph(t, (b - 0.25, b))))
                y = 1700
                for ln in text.split("\n"):
                    tw = dr.textlength(ln, font=self.r.f_sub)
                    pad = 14
                    dr.rectangle(((W - tw) / 2 - pad, y - 6, (W + tw) / 2 + pad, y + 44), fill=(0, 0, 0, int(150 * al)))
                    dr.text(((W - tw) / 2, y), ln, font=self.r.f_sub, fill=(255, 255, 255, int(240 * al)))
                    y += 52
        return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

    def before_photo(self, u, label, t):
        """조성 전 실제 사진: 천천히 다가가며, 끝부분에 빨간 측량 격자가 땅 위에 깔린다."""
        if self.before is None:
            return self.footage("clip01", 2.0 + u * 6.0, label, t)
        z = 1.0 + 0.08 * sb.ease(u)
        w, h = int(W / z), int(H / z)
        x, y = (W - w) // 2, int((H - h) * 0.6)
        img = self.before.crop((x, y, x + w, y + h)).resize((W, H), Image.LANCZOS).convert("RGBA")
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)
        for yy in range(0, H, 6):
            dr.line([(0, yy), (W, yy)], fill=(0, 0, 0, 22))
        g = sb.ease(sb.ph(u, (0.55, 0.95)))
        if g > 0:
            a = int(235 * g)
            hz, vx = 790, W / 2  # 지평선(숲 아래 풀밭 경계)과 소실점
            for k in range(-8, 9):
                dr.line([(vx + k * 18, hz), (vx + k * 260, H)], fill=sb.RED + (a,), width=3)
            yy = hz
            step = 12
            while yy < H:
                dr.line([(0, yy), (W, yy)], fill=sb.RED + (int(a * 0.8),), width=3)
                step *= 1.35
                yy += step
        self.r.hud(dr, t, label)
        tag = "실제 사진 · 조성 전"
        tw = dr.textlength(tag, font=self.r.f_small)
        dr.rectangle((W - 40 - tw - 26, 104, W - 40, 140), fill=(0, 0, 0, 140))
        dr.text((W - 40 - tw - 13, 109), tag, font=self.r.f_small, fill=(255, 255, 255, 230))
        return Image.alpha_composite(img, ov).convert("RGB")

    def raw(self, seg, t):
        a, b, kind, s0, s1, label = seg
        u = min(max((t - a) / (b - a), 0), 1)
        src = s0 + (s1 - s0) * u
        if kind == "motion":
            return self.r.frame(min(src, sb.DURATION - 1e-3))
        if kind == "glitch":
            return self.glitch(u, t)
        if kind == "before":
            return self.before_photo(u, label, t)
        return self.footage(kind, src, label, t)

    def frame(self, t):
        for k, seg in enumerate(TIMELINE):
            a, b, kind = seg[:3]
            if a <= t < b or (t >= DURATION - 1e-6 and k == len(TIMELINE) - 1):
                img = self.raw(seg, t)
                # 실사 ↔ 모션 경계에서 0.3초 디졸브
                if k and t - a < 0.3 and TIMELINE[k - 1][2] != kind and "glitch" not in (kind, TIMELINE[k - 1][2]):
                    prev = self.raw(TIMELINE[k - 1], a - 1e-3)
                    img = Image.blend(prev, img, sb.ease((t - a) / 0.3))
                return self.subtitles(img, t)
        return self.subtitles(self.r.frame(56.0), t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="medeonggol_weave.mp4")
    ap.add_argument("--font")
    ap.add_argument("--still", type=float, action="append")
    ap.add_argument("--before", help="조성 전 실제 사진(세로 사진 권장). 없으면 Clip 01 화면을 쓴다")
    args = ap.parse_args()
    wv = Weaver(args)
    if args.still:
        base = os.path.splitext(args.out)[0]
        for s in args.still:
            p = f"{base}_{s:05.2f}s.png"
            wv.frame(s).save(p)
            print(p)
        return
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DURATION * FPS)
    for i in range(total):
        proc.stdin.write(wv.frame(i / FPS).tobytes())
        if i % FPS == 0:
            print(f"\r{i // FPS:>3}/{int(DURATION)}s", end="", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"\n{args.out}")


if __name__ == "__main__":
    main()
