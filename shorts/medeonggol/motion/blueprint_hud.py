"""메덩골정원 '빈 땅 → 한국정원' 모션그래픽 렌더러.

세 기법을 한 영상에 섞는다.
  1. HUD & 스캐닝(Sci-Fi HUD): 인트로. 빈 땅을 스캔해 지형을 읽는다.
  2. 테크 블루프린트(Manim식 작도): 물길, 길, 돌담, 소나무, 기와 담장이 순서대로 그려진다.
  3. 파티클 스웜: 도면의 선이 입자로 흩어졌다가 매거진그린 로고로 모인다.

기사 사진은 선택 입력이다. 없으면 도면과 절차 생성 지형만으로 렌더링한다.
  --field   공사 전 빈 땅 사진 (인트로 스캔 배경)
  --garden  완성된 정원 사진 (블루프린트가 걷히며 드러나는 마지막 장면)

사용 예:
  python3 blueprint_hud.py --out medeonggol_blueprint.mp4
  python3 blueprint_hud.py --field D:/메덩골/drive-download/field.jpg \
      --garden D:/메덩골/올빼미/garden.jpg --out medeonggol_blueprint.mp4

필요한 것: Python 3, Pillow, NumPy, ffmpeg, 한글 글꼴(나눔스퀘어라운드 또는 --font 지정).
"""

import argparse
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 30

# 색
NAVY = (9, 32, 58)
GRID = (30, 74, 118)
GRID_MAJOR = (46, 102, 156)
LINE = (206, 232, 255)
HUD = (124, 255, 178)
RED = (255, 77, 77)
FIELD_DARK = (20, 28, 18)
FIELD_LINE = (74, 96, 58)
PAPER = (246, 244, 238)

# 장면 시간표(초)
T_INTRO_END = 7.0
T_GRID = (7.0, 9.0)
T_STREAM = (9.0, 14.0)
T_PATH = (14.0, 18.0)
T_WALL = (18.0, 24.0)
T_PINE = (24.0, 28.5)
T_TILE = (28.5, 33.0)
T_REVEAL = (33.0, 37.0)
T_SWARM = (37.0, 44.0)
DURATION = T_SWARM[1]

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


# ---------- 공통 유틸 ----------

def clamp01(x):
    return max(0.0, min(1.0, x))


def phase(t, span):
    a, b = span
    return clamp01((t - a) / (b - a))


def ease(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_rgb(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def catmull(points, steps=24):
    """제어점을 지나는 매끈한 곡선."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(steps):
            u = s / steps
            u2, u3 = u * u, u * u * u
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
            out.append((x, y))
    out.append(points[-1])
    return out


def partial(points, f):
    """폴리라인의 앞쪽 f 비율만 돌려준다(Manim의 Create처럼 그려지는 효과)."""
    if f <= 0:
        return []
    if f >= 1:
        return list(points)
    seg = [math.dist(points[i], points[i + 1]) for i in range(len(points) - 1)]
    target = sum(seg) * f
    out = [points[0]]
    acc = 0.0
    for i, d in enumerate(seg):
        if acc + d >= target:
            r = (target - acc) / d if d else 0
            a, b = points[i], points[i + 1]
            out.append((lerp(a[0], b[0], r), lerp(a[1], b[1], r)))
            return out
        acc += d
        out.append(points[i + 1])
    return out


def glow_line(dr, pts, color, width=4, alpha=255, glow=True):
    if len(pts) < 2:
        return
    if glow:
        dr.line(pts, fill=color + (int(alpha * 0.18),), width=width * 4, joint="curve")
        dr.line(pts, fill=color + (int(alpha * 0.35),), width=width * 2, joint="curve")
    dr.line(pts, fill=color + (alpha,), width=width, joint="curve")


def head_dot(dr, pts, color, r=9):
    if pts:
        x, y = pts[-1]
        dr.ellipse((x - r, y - r, x + r, y + r), fill=color + (230,))


def cover(img, w, h):
    iw, ih = img.size
    s = max(w / iw, h / ih)
    img = img.resize((int(iw * s) + 1, int(ih * s) + 1), Image.LANCZOS)
    x = (img.width - w) // 2
    y = (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def find_font(preferred, fallbacks):
    for p in [preferred] + fallbacks:
        if p and os.path.exists(p):
            return p
    return None


# ---------- 도면 기하 ----------

STREAM = catmull([(760, 300), (700, 520), (830, 720), (650, 960), (730, 1200), (580, 1470)])
PATH = catmull([(150, 1480), (400, 1200), (280, 960), (470, 640), (360, 330)])
WALL_Y = 1330
WALL_X = (80, 560)
PINE_BASE = (512, 760)
PINE_TOP = (400, 610)
TILE_WALL = catmull([(120, 850), (330, 838), (450, 812), (512, 790), (575, 800), (660, 832)], steps=16)
# 소나무 밑동과 담장 사이 간격(그림상 약 22px)을 보여주는 지점
CLEAR_A = (PINE_BASE[0], PINE_BASE[1] + 3)
CLEAR_B = (PINE_BASE[0], 790 - 8)

rng = np.random.default_rng(7)
ROCKS = []
for i in range(14):
    idx = int((i + 0.5) / 14 * (len(STREAM) - 1))
    x, y = STREAM[idx]
    side = 1 if i % 2 else -1
    cx, cy = x + side * rng.uniform(26, 46), y + rng.uniform(-14, 14)
    r = rng.uniform(12, 24)
    n = int(rng.integers(5, 8))
    poly = []
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
        rr = r * rng.uniform(0.7, 1.15)
        poly.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    ROCKS.append(poly)

# 반듯한 담(같은 크기 돌) / 농부의 담(불규칙한 돌)
PERFECT_STONES = []
x = WALL_X[0]
while x < WALL_X[1]:
    for row in range(2):
        off = 0 if row == 0 else 20
        sx = x + off
        if sx + 36 <= WALL_X[1]:
            PERFECT_STONES.append((sx, WALL_Y - 40 + row * 22, sx + 36, WALL_Y - 40 + row * 22 + 20))
    x += 40
ROUGH_STONES = []
x = WALL_X[0]
while x < WALL_X[1] - 10:
    for row in range(3):
        w = rng.uniform(24, 52)
        h = rng.uniform(14, 22)
        cx = x + rng.uniform(0, 14) + w / 2
        cy = WALL_Y - 44 + row * 19 + rng.uniform(-3, 3)
        a = rng.uniform(-0.25, 0.25)
        corners = []
        for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
            jx, jy = dx * rng.uniform(0.8, 1.05), dy * rng.uniform(0.8, 1.1)
            corners.append((cx + jx * math.cos(a) - jy * math.sin(a), cy + jx * math.sin(a) + jy * math.cos(a)))
        ROUGH_STONES.append(corners)
    x += rng.uniform(30, 48)


# ---------- 렌더러 ----------

class Renderer:
    def __init__(self, args):
        kr_b = find_font(args.font, [
            "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",
            "C:/Windows/Fonts/malgunbd.ttf",
            "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        ])
        kr_r = find_font(None, [
            "/usr/share/fonts/truetype/nanum/NanumSquareRoundR.ttf",
            "C:/Windows/Fonts/malgun.ttf",
            "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        ]) or kr_b
        mono = find_font(None, [
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "C:/Windows/Fonts/consola.ttf",
            "/System/Library/Fonts/Menlo.ttc",
        ]) or kr_r
        if not kr_b:
            sys.exit("한글 글꼴을 찾지 못했습니다. --font 로 .ttf 경로를 지정하세요.")
        self.f_cap = ImageFont.truetype(kr_b, 58)
        self.f_sub = ImageFont.truetype(kr_r, 36)
        self.f_lbl = ImageFont.truetype(kr_b, 30)
        self.f_mono = ImageFont.truetype(mono, 24)
        self.f_mono_b = ImageFont.truetype(mono, 34)

        self.field = self._make_field(args.field)
        self.garden = cover(Image.open(args.garden).convert("RGB"), W, H) if args.garden else None
        self.grid = self._make_grid()
        logo_path = args.logo or os.path.join(REPO, "public", "logo.png")
        self.logo = Image.open(logo_path).convert("RGBA")
        self._prep_swarm()

    # --- 정적 레이어 ---

    def _make_field(self, path):
        if path:
            img = cover(Image.open(path).convert("RGB"), W, H)
            dark = Image.new("RGB", (W, H), FIELD_DARK)
            return Image.blend(img, dark, 0.45)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        h = (np.sin(xx / 210 + 0.6) * 0.9 + np.sin(yy / 260 - 1.1) * 1.1
             + np.sin((xx + yy) / 340) * 0.7 + np.sin((xx - 0.6 * yy) / 150) * 0.35)
        band = np.abs((h * 3.2) % 1.0 - 0.5)
        lines = band < 0.035
        base = np.zeros((H, W, 3), np.float32)
        g = (yy / H)[..., None]
        base[:] = np.array(FIELD_DARK) * (0.8 + 0.4 * g)
        base[lines] = FIELD_LINE
        noise = rng.normal(0, 6, (H, W, 1))
        return Image.fromarray(np.clip(base + noise, 0, 255).astype(np.uint8))

    def _make_grid(self):
        img = Image.new("RGB", (W, H), NAVY)
        dr = ImageDraw.Draw(img)
        for x in range(0, W, 40):
            dr.line([(x, 0), (x, H)], fill=GRID_MAJOR if x % 200 == 0 else GRID, width=1)
        for y in range(0, H, 40):
            dr.line([(0, y), (W, y)], fill=GRID_MAJOR if y % 200 == 0 else GRID, width=1)
        return img

    def _plan_layer(self):
        """완성된 도면 한 장(파티클 시작점 샘플링용)."""
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(img)
        glow_line(dr, STREAM, LINE, 6, glow=False)
        glow_line(dr, PATH, LINE, 4, glow=False)
        for poly in ROCKS:
            dr.polygon(poly, outline=LINE + (255,))
        for st in ROUGH_STONES:
            dr.polygon(st, outline=LINE + (255,))
        dr.line([PINE_BASE, PINE_TOP], fill=LINE + (255,), width=6)
        glow_line(dr, TILE_WALL, LINE, 10, glow=False)
        return img

    def _prep_swarm(self):
        n = 9000
        plan = np.array(self._plan_layer())[..., 3] > 0
        ys, xs = np.nonzero(plan)
        pick = rng.choice(len(xs), n)
        self.p_start = np.stack([xs[pick], ys[pick]], 1).astype(np.float32)

        logo = self.logo
        scale = 960 / logo.width
        lw, lh = int(logo.width * scale), int(logo.height * scale)
        logo = logo.resize((lw, lh), Image.LANCZOS)
        self.logo_big = logo
        self.logo_pos = ((W - lw) // 2, (H - lh) // 2 - 40)
        la = np.array(logo)
        ink = (la[..., 3] > 128) & (la[..., :3].sum(-1) < 600)
        ly, lx = np.nonzero(ink)
        pick = rng.choice(len(lx), n)
        self.p_target = np.stack([lx[pick] + self.logo_pos[0], ly[pick] + self.logo_pos[1]], 1).astype(np.float32)
        self.p_color = la[ly[pick], lx[pick], :3].astype(np.float32)
        self.p_seed = rng.uniform(0, 2 * math.pi, (n, 2)).astype(np.float32)
        self.p_burst = rng.normal(0, 1, (n, 2)).astype(np.float32) * 110

    # --- HUD ---

    def hud(self, dr, t, step_label, accent=HUD, progress=None):
        m, L = 42, 70
        for cx, cy, sx, sy in ((m, m, 1, 1), (W - m, m, -1, 1), (m, H - m, 1, -1), (W - m, H - m, -1, -1)):
            dr.line([(cx, cy), (cx + sx * L, cy)], fill=accent + (220,), width=4)
            dr.line([(cx, cy), (cx, cy + sy * L)], fill=accent + (220,), width=4)
        dr.text((m + 18, m + 20), "MEDEONGGOL · KOREAN GARDEN", font=self.f_mono, fill=accent + (230,))
        dr.text((m + 18, m + 52), step_label, font=self.f_mono, fill=accent + (170,))
        tc = f"T+{t:05.2f}s"
        tw = dr.textlength(tc, font=self.f_mono)
        dr.text((W - m - 18 - tw, m + 20), tc, font=self.f_mono, fill=accent + (200,))
        blink = (int(t * 2) % 2) == 0
        dr.ellipse((W - m - 18 - tw - 26, m + 26, W - m - 18 - tw - 12, m + 40),
                   fill=(RED + (230,)) if blink else (RED + (60,)))
        if progress is not None:
            x0, x1, y = m + 18, W - m - 18, H - m - 30
            dr.rectangle((x0, y, x1, y + 8), outline=accent + (160,))
            dr.rectangle((x0, y, x0 + (x1 - x0) * progress, y + 8), fill=accent + (220,))

    def caption(self, dr, text, sub=None, alpha=1.0, color=(255, 255, 255)):
        if alpha <= 0:
            return
        a = int(255 * alpha)
        y = 1600
        lines = text.split("\n")
        for ln in lines:
            tw = dr.textlength(ln, font=self.f_cap)
            dr.text(((W - tw) / 2 + 3, y + 3), ln, font=self.f_cap, fill=(0, 0, 0, int(a * 0.6)))
            dr.text(((W - tw) / 2, y), ln, font=self.f_cap, fill=color + (a,))
            y += 74
        if sub:
            tw = dr.textlength(sub, font=self.f_sub)
            dr.text(((W - tw) / 2, y + 8), sub, font=self.f_sub, fill=color + (int(a * 0.75),))

    def label(self, dr, xy, text, color=LINE, alpha=1.0, anchor_line=None):
        a = int(255 * alpha)
        if anchor_line:
            dr.line(anchor_line, fill=color + (int(a * 0.7),), width=2)
        x, y = xy
        tw = dr.textlength(text, font=self.f_lbl)
        dr.rectangle((x - 10, y - 6, x + tw + 10, y + 40), fill=NAVY + (int(a * 0.85),), outline=color + (a,))
        dr.text((x, y), text, font=self.f_lbl, fill=color + (a,))

    def dim_line(self, dr, a, b, text, f, color=RED):
        """Manim식 치수선: 양끝 눈금 + 가운데 글자."""
        if f <= 0:
            return
        al = int(255 * clamp01(f * 1.5))
        mx, my = lerp(a[0], b[0], f), lerp(a[1], b[1], f)
        dr.line([a, (mx, my)], fill=color + (al,), width=3)
        for p in (a, (mx, my)):
            if a[0] == b[0]:
                dr.line([(p[0] - 14, p[1]), (p[0] + 14, p[1])], fill=color + (al,), width=3)
            else:
                dr.line([(p[0], p[1] - 14), (p[0], p[1] + 14)], fill=color + (al,), width=3)
        if f >= 1:
            cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            tw = dr.textlength(text, font=self.f_mono_b)
            dr.rectangle((cx - tw / 2 - 10, cy - 24, cx + tw / 2 + 10, cy + 24), fill=NAVY + (230,))
            dr.text((cx - tw / 2, cy - 20), text, font=self.f_mono_b, fill=color + (255,))

    # --- 장면 ---

    def intro(self, t):
        img = self.field.copy()
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)
        scan = ease(phase(t, (0.6, 4.6)))
        sy = int(scan * H)
        # 스캔이 지나간 영역: 초록 HUD 틴트 + 격자
        if sy > 0:
            dr.rectangle((0, 0, W, sy), fill=HUD + (26,))
            for y in range(0, sy, 60):
                dr.line([(0, y), (W, y)], fill=HUD + (30,), width=1)
            for x in range(0, W, 60):
                dr.line([(x, 0), (x, sy)], fill=HUD + (30,), width=1)
        dr.rectangle((0, sy - 3, W, sy + 3), fill=HUD + (230,))
        dr.rectangle((0, sy - 40, W, sy), fill=HUD + (40,))
        # 회전하는 조준경
        cx, cy, r = W // 2, 860, 190
        rot = t * 40
        for k in range(4):
            a0 = rot + k * 90
            dr.arc((cx - r, cy - r, cx + r, cy + r), a0, a0 + 52, fill=HUD + (210,), width=4)
        dr.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), outline=HUD + (230,), width=3)
        dr.line([(cx - r - 30, cy), (cx - r + 20, cy)], fill=HUD + (200,), width=3)
        dr.line([(cx + r - 20, cy), (cx + r + 30, cy)], fill=HUD + (200,), width=3)
        # 탐지 박스(인터뷰 원문: 버려진 논밭, 습지, 나대지)
        found = [((120, 380, 470, 640), "논밭 · PADDY", 1.6),
                 ((560, 1060, 960, 1330), "습지 · WETLAND", 2.6),
                 ((150, 1180, 480, 1460), "빈 땅 · BARE LAND", 3.5)]
        for box, txt, at in found:
            f = ease_out(phase(t, (at, at + 0.5)))
            if f <= 0:
                continue
            x0, y0, x1, y1 = box
            a = int(230 * f)
            L = 36
            for px, py, sx, sy2 in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
                dr.line([(px, py), (px + sx * L, py)], fill=RED + (a,), width=4)
                dr.line([(px, py), (px, py + sy2 * L)], fill=RED + (a,), width=4)
            tw = dr.textlength(txt, font=self.f_lbl)
            dr.rectangle((x0, y0 - 48, x0 + tw + 20, y0 - 6), fill=(0, 0, 0, int(160 * f)))
            dr.text((x0 + 10, y0 - 44), txt, font=self.f_lbl, fill=RED + (a,))
        self.hud(dr, t, "SITE SCAN · YANGPYEONG", progress=scan)
        done = phase(t, (4.8, 5.4))
        if done < 1 and t < 4.8:
            self.caption(dr, "SCANNING…", "양평 메덩골, 공사 전의 땅", alpha=ease(phase(t, (0.3, 1.0))))
        else:
            self.caption(dr, "버려진 논밭과 습지,\n아무것도 없던 땅", "SCAN COMPLETE", alpha=ease(done))
        img = Image.alpha_composite(img.convert("RGBA"), ov)
        # 블루프린트로 넘어가는 디졸브
        x = ease(phase(t, (6.2, 7.0)))
        if x > 0:
            img = Image.blend(img, self.grid.convert("RGBA"), x)
        return img.convert("RGB")

    def blueprint(self, t, garden_mix=0.0):
        img = self.grid.copy().convert("RGBA")
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)

        # 격자 위 좌표축이 그려진다
        g = ease(phase(t, T_GRID))
        dr.line([(60, 1520), (60 + (W - 120) * g, 1520)], fill=LINE + (200,), width=2)
        dr.line([(60, 1520), (60, 1520 - 1260 * g)], fill=LINE + (200,), width=2)
        if g > 0.3:
            for k in range(0, 6):
                y = 1520 - k * 240
                if 1520 - y <= 1260 * g:
                    dr.text((70, y - 30), f"{k * 80:>3}m", font=self.f_mono, fill=LINE + (150,))

        # 1) 물길 400m
        s = ease(phase(t, T_STREAM))
        pts = partial(STREAM, s)
        glow_line(dr, pts, LINE, 6)
        if s < 1:
            head_dot(dr, pts, HUD)
        rk = phase(t, (T_STREAM[0] + 2.5, T_STREAM[1]))
        for i, poly in enumerate(ROCKS):
            if rk * len(ROCKS) > i:
                dr.polygon(poly, outline=LINE + (230,), fill=LINE + (40,))
        self.dim_line(dr, (985, 300), (985, 1470), "400 m", ease(phase(t, (T_STREAM[0] + 1.0, T_STREAM[1] - 0.6))))

        # 2) 살짝 꺾인 길
        p = ease(phase(t, T_PATH))
        pts = partial(PATH, p)
        for i in range(0, len(pts) - 1, 2):
            dr.line([pts[i], pts[i + 1]], fill=LINE + (220,), width=4)
        if p < 1:
            head_dot(dr, pts, HUD, 7)
        cone = ease(phase(t, (T_PATH[0] + 1.6, T_PATH[1])))
        if cone > 0 and t < T_WALL[1]:
            for bi in (len(PATH) // 3, 2 * len(PATH) // 3):
                bx, by = PATH[bi]
                nx, ny = PATH[min(bi + 10, len(PATH) - 1)]
                ang = math.atan2(ny - by, nx - bx)
                rr = 230 * cone
                a1, a2 = ang - 0.32, ang + 0.32
                dr.polygon([(bx, by), (bx + rr * math.cos(a1), by + rr * math.sin(a1)),
                            (bx + rr * math.cos(a2), by + rr * math.sin(a2))], fill=HUD + (40,), outline=HUD + (120,))

        # 3) 돌담: 반듯한 담 → 허물고 → 농부의 담
        w0 = T_WALL[0]
        build = ease(phase(t, (w0, w0 + 1.6)))
        fall = ease(phase(t, (w0 + 2.4, w0 + 3.4)))
        rough = ease(phase(t, (w0 + 3.6, T_WALL[1])))
        if build > 0 and fall < 1:
            for i, (x0, y0, x1, y1) in enumerate(PERFECT_STONES):
                if i / len(PERFECT_STONES) > build:
                    break
                drop = fall * (60 + (i * 37) % 90) if y0 < WALL_Y - 30 else fall * 20
                rot_a = int(255 * (1 - fall))
                dr.rectangle((x0, y0 + drop, x1, y1 + drop), outline=LINE + (rot_a,), width=2)
            lvl = ease(phase(t, (w0 + 1.2, w0 + 2.0))) * (1 - fall)
            if lvl > 0:
                dr.line([(WALL_X[0] - 20, WALL_Y - 46), (WALL_X[1] + 20, WALL_Y - 46)], fill=RED + (int(255 * lvl),), width=3)
                dr.text((WALL_X[1] - 150, WALL_Y - 92), "LEVEL ±0", font=self.f_mono_b, fill=RED + (int(255 * lvl),))
        if rough > 0:
            n = int(len(ROUGH_STONES) * rough)
            for st in ROUGH_STONES[:n]:
                dr.polygon(st, outline=LINE + (235,), fill=LINE + (30,))
            if rough > 0.2:
                lab = phase(t, (w0 + 4.0, w0 + 4.6))
                for k in range(5):
                    xx = WALL_X[0] + k * 100
                    dr.line([(xx, WALL_Y + 20), (xx, WALL_Y + 36)], fill=RED + (int(220 * lab),), width=3)
                dr.line([(WALL_X[0], WALL_Y + 28), (WALL_X[0] + 400, WALL_Y + 28)], fill=RED + (int(200 * lab),), width=2)
                dr.text((WALL_X[0] + 110, WALL_Y + 40), "1 m × 1 m × …", font=self.f_mono, fill=RED + (int(230 * lab),))

        # 4) 소나무 먼저: GPS 좌표
        p0 = T_PINE[0]
        gps = ease(phase(t, (p0, p0 + 1.6)))
        if gps > 0 and t < T_TILE[1] + 1.0:
            bx, by = PINE_BASE
            span = lerp(420, 0, gps)
            a = int(230 * min(1, gps * 2))
            dr.line([(bx - 60 - span, by), (bx + 60 + span, by)], fill=RED + (a,), width=2)
            dr.line([(bx, by - 60 - span), (bx, by + 60 + span)], fill=RED + (a,), width=2)
            rr = 26 + span * 0.2
            dr.ellipse((bx - rr, by - rr, bx + rr, by + rr), outline=RED + (a,), width=3)
            if gps >= 1:
                dr.text((bx + 40, by + 24), "GPS LOCK · ±수 cm", font=self.f_lbl, fill=RED + (230,))
        trunk = ease(phase(t, (p0 + 1.6, p0 + 3.0)))
        if trunk > 0:
            tx = lerp(PINE_BASE[0], PINE_TOP[0], trunk)
            ty = lerp(PINE_BASE[1], PINE_TOP[1], trunk)
            glow_line(dr, [PINE_BASE, (tx, ty)], LINE, 7)
            can = ease(phase(t, (p0 + 2.6, T_PINE[1])))
            for k, (ox, oy, r) in enumerate(((0, 0, 70), (-70, 20, 50), (60, 30, 46), (-20, -50, 44))):
                if can * 4 > k:
                    cx, cy = PINE_TOP[0] + ox, PINE_TOP[1] + oy
                    dr.ellipse((cx - r, cy - r, cx + r, cy + r), outline=LINE + (220,), width=3)

        # 5) 기와 담장은 나중에, 밑동을 스치도록
        tw_ = ease(phase(t, (T_TILE[0], T_TILE[0] + 2.4)))
        pts = partial(TILE_WALL, tw_)
        if len(pts) > 1:
            dr.line(pts, fill=LINE + (60,), width=24, joint="curve")
            dr.line(pts, fill=LINE + (240,), width=14, joint="curve")
            dr.line(pts, fill=NAVY + (255,), width=6, joint="curve")
            for i in range(0, len(pts), 2):
                x, y = pts[i]
                dr.line([(x, y - 9), (x, y + 9)], fill=LINE + (200,), width=2)
            if tw_ < 1:
                head_dot(dr, pts, HUD)
        clr = ease(phase(t, (T_TILE[0] + 2.4, T_TILE[0] + 3.2)))
        if clr > 0 and t < T_REVEAL[0] + 1.0:
            dr.line([CLEAR_A, CLEAR_B], fill=RED + (int(255 * clr),), width=3)
            for px, py in (CLEAR_A, CLEAR_B):
                dr.line([(px - 10, py), (px + 10, py)], fill=RED + (int(255 * clr),), width=3)
            self.label(dr, (580, 900), "밑동과 담 사이 · 몇 cm", RED, clr, anchor_line=[(530, 790), (580, 900)])

        # 단계 라벨
        steps = [(T_STREAM, "STEP 01 · STREAM 400 m"), (T_PATH, "STEP 02 · PATH"), (T_WALL, "STEP 03 · STONE WALL"),
                 (T_PINE, "STEP 04 · PINE FIRST"), (T_TILE, "STEP 05 · TILED WALL"), (T_REVEAL, "STEP 06 · ERASE")]
        step = "BLUEPRINT · READING THE LAND"
        for span, name in steps:
            if t >= span[0]:
                step = name
        self.hud(dr, t, step, progress=phase(t, (T_GRID[0], T_REVEAL[1])))

        caps = [
            (T_GRID, "먼저, 땅을 읽습니다", None),
            (T_STREAM, "사백 미터의 물길을 내고", "메덩내 계류 · 수만 톤의 바위"),
            (T_PATH, "길은 살짝 꺾어\n다음 풍경을 숨기고", "보이지 않기에 걷고 싶어지는 길"),
            ((T_WALL[0], T_WALL[0] + 3.4), "너무 반듯한 담은 허물고", None),
            ((T_WALL[0] + 3.4, T_WALL[1]), "농부의 마음으로\n1미터씩 다시", None),
            (T_PINE, "소나무가 먼저 왔습니다", "정밀 GPS로 자리와 높이를 찍고"),
            (T_TILE, "담은 밑동을 스치도록\n나중에 쌓았지요", None),
            (T_REVEAL, "그리고 모든 선을 지웁니다", "원래 있던 자연처럼"),
        ]
        for span, txt, sub in caps:
            if span[0] <= t < span[1]:
                a = min(ease(phase(t, (span[0], span[0] + 0.4))), ease(1 - phase(t, (span[1] - 0.3, span[1]))))
                self.caption(dr, txt, sub, alpha=a)

        img = Image.alpha_composite(img, ov)

        # 6) 도면이 걷히고 정원이 드러난다
        if garden_mix > 0:
            if self.garden is not None:
                g_img = self.garden.convert("RGBA")
            else:
                g_img = self._soft_garden()
            wipe = int(H * (1 - garden_mix))
            mask = Image.new("L", (W, H), 0)
            ImageDraw.Draw(mask).rectangle((0, wipe, W, H), fill=255)
            mask = mask.filter(ImageFilter.GaussianBlur(40))
            img = Image.composite(g_img, img, mask)
            line = ImageDraw.Draw(img)
            line.rectangle((0, wipe - 2, W, wipe + 2), fill=HUD + (230,))
            if garden_mix > 0.55:
                over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                self.caption(ImageDraw.Draw(over), "원래 있던 자연처럼", None, alpha=ease((garden_mix - 0.55) / 0.3))
                img = Image.alpha_composite(img, over)
        return img.convert("RGB")

    def _soft_garden(self):
        """사진이 없을 때 쓰는 대체 화면: 도면 위에 녹색 면을 칠한 '자연' 상태."""
        if getattr(self, "_soft", None) is not None:
            return self._soft
        base = Image.new("RGBA", (W, H), (34, 58, 40, 255))
        dr = ImageDraw.Draw(base)
        for k in range(160):
            x, y = rng.uniform(0, W), rng.uniform(200, 1560)
            r = rng.uniform(40, 130)
            c = (int(rng.uniform(40, 90)), int(rng.uniform(80, 130)), int(rng.uniform(50, 80)), 90)
            dr.ellipse((x - r, y - r, x + r, y + r), fill=c)
        dr.line(STREAM, fill=(150, 190, 200, 255), width=22, joint="curve")
        dr.line(PATH, fill=(190, 170, 130, 255), width=26, joint="curve")
        for st in ROUGH_STONES:
            dr.polygon(st, fill=(150, 145, 135, 255))
        dr.line(TILE_WALL, fill=(70, 70, 75, 255), width=16, joint="curve")
        dr.line([PINE_BASE, PINE_TOP], fill=(90, 60, 40, 255), width=12)
        for ox, oy, r in ((0, 0, 70), (-70, 20, 50), (60, 30, 46), (-20, -50, 44)):
            cx, cy = PINE_TOP[0] + ox, PINE_TOP[1] + oy
            dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(30, 80, 50, 255))
        self._soft = base.filter(ImageFilter.GaussianBlur(6))
        return self._soft

    def swarm(self, t):
        u = t - T_SWARM[0]
        # 배경: 도면의 남색 → 종이색
        bgm = ease(phase(u, (3.0, 4.4)))
        bg = lerp_rgb(NAVY, PAPER, bgm)
        arr = np.empty((H, W, 3), np.uint8)
        arr[:] = bg
        # 앞 장면(정원)에서 남색 배경으로 0.8초 동안 넘어간다
        out = ease(phase(u, (0.0, 0.8)))
        if out < 1:
            if getattr(self, "_end_arr", None) is None:
                self._end_arr = np.array(self.blueprint(T_SWARM[0] - 1e-3, garden_mix=1.0)).astype(np.float32)
            arr[:] = (self._end_arr * (1 - out) + np.array(bg, np.float32) * out).astype(np.uint8)
        # 입자 위치
        burst = ease_out(phase(u, (0.4, 1.8)))
        gather = ease(phase(u, (1.2, 4.2)))
        swirl = (1 - gather) * 60
        tt = u * 2.2
        noise = np.stack([np.sin(tt + self.p_seed[:, 0] * 3) * swirl, np.cos(tt * 1.3 + self.p_seed[:, 1] * 3) * swirl], 1)
        mid = self.p_start + self.p_burst * burst
        pos = mid * (1 - gather) + self.p_target * gather + noise
        fly = np.array(HUD, np.float32) * 0.55 + np.array(LINE, np.float32) * 0.45
        settle = ease(phase(u, (3.2, 4.4)))
        col = fly * (1 - settle) + self.p_color * settle
        fade = 1 - ease(phase(u, (4.6, 5.6)))
        if fade > 0:
            xs = np.clip(pos[:, 0].astype(int), 0, W - 4)
            ys = np.clip(pos[:, 1].astype(int), 0, H - 4)
            c = (col * fade + np.array(bg, np.float32) * (1 - fade)).astype(np.uint8)
            size = 3 if gather < 0.9 else 2
            for dy in range(size):
                for dx in range(size):
                    arr[ys + dy, xs + dx] = c
        img = Image.fromarray(arr).convert("RGBA")
        logo_a = ease(phase(u, (4.2, 5.4)))
        if logo_a > 0:
            lg = self.logo_big.copy()
            al = np.array(lg)
            al[..., 3] = (al[..., 3] * logo_a).astype(np.uint8)
            img.alpha_composite(Image.fromarray(al), dest=self.logo_pos)
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)
        if u < 2.4:
            self.hud(dr, t, "PARTICLE SWARM", accent=HUD)
        tag = ease(phase(u, (5.2, 6.0)))
        if tag > 0:
            s = "땅과 시간을 읽는 정원 저널"
            tw = dr.textlength(s, font=self.f_sub)
            dr.text(((W - tw) / 2, self.logo_pos[1] + self.logo_big.height + 60), s, font=self.f_sub,
                    fill=(40, 60, 50, int(230 * tag)))
        img = Image.alpha_composite(img, ov)
        return img.convert("RGB")

    def frame(self, t):
        if t < T_INTRO_END:
            return self.intro(t)
        if t < T_REVEAL[0]:
            return self.blueprint(t)
        if t < T_SWARM[0]:
            return self.blueprint(t, garden_mix=ease(phase(t, (T_REVEAL[0], T_REVEAL[1] - 0.6))))
        return self.swarm(t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="medeonggol_blueprint.mp4")
    ap.add_argument("--field", help="공사 전 빈 땅 사진(선택)")
    ap.add_argument("--garden", help="완성된 정원 사진(선택)")
    ap.add_argument("--logo", help="로고 PNG(기본: public/logo.png)")
    ap.add_argument("--font", help="한글 굵은 글꼴 .ttf 경로")
    ap.add_argument("--still", type=float, action="append", help="이 시각(초)의 정지 화면만 PNG로 저장")
    args = ap.parse_args()

    r = Renderer(args)
    if args.still:
        base = os.path.splitext(args.out)[0]
        for s in args.still:
            path = f"{base}_{s:05.2f}s.png"
            r.frame(s).save(path)
            print(path)
        return

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DURATION * FPS)
    for i in range(total):
        proc.stdin.write(r.frame(i / FPS).tobytes())
        if i % FPS == 0:
            print(f"\r{i // FPS:>3}/{int(DURATION)}s", end="", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"\n{args.out}")


if __name__ == "__main__":
    main()
