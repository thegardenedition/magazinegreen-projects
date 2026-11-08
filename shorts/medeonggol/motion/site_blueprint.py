"""메덩골정원 '논밭 → 한국정원' 대상지 분석 모션그래픽 (실측 데이터 기반).

prepare_site_data.py 가 만든 site_data.json 을 읽어 그린다. 모든 선은 실제 좌표다.
  - 공사 전 현황: 2016년 위성사진에서 추출한 논밭 필지 25곳
  - 지형: 표고 등고선, 음영기복, 계류 종단면
  - 완공 후: OpenStreetMap 의 계류(408m), 연못, 길, 건물(선곡서원)
위치가 공개되지 않은 디테일(남도돌담길 쌓기, 담장 너머 소나무)은 지도 위가 아니라
'SCHEMATIC' 표시를 단 HUD 확대창에서 도식으로 보여준다.

기법
  1. HUD & 스캐닝: 레이더식 스캔으로 지형과 2016년 필지를 탐지
  2. 테크 블루프린트(Manim식 작도) + 카메라 줌/팬: 실제 좌표 위에 물길·길·건물을 순서대로 작도
  3. 파티클 스웜: 도면의 선이 입자로 흩어졌다가 매거진그린 로고로 모인다

사용:
  python3 site_blueprint.py --out medeonggol_site.mp4
  python3 site_blueprint.py --still 10 --still 30 --out check.png   (정지 화면 확인)
"""

import argparse
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

NAVY = (8, 26, 46)
GRID = (22, 52, 84)
GRID_MAJOR = (34, 74, 116)
LINE = (206, 232, 255)
HUD = (124, 255, 178)
AMBER = (255, 196, 92)
RED = (255, 77, 77)
WATER = (96, 196, 255)
DARK = (6, 12, 16)
PAPER = (246, 244, 238)

# 장면 시간표(초)
S_SCAN = (0.0, 9.0)
S_FLOW = (9.0, 14.0)
S_BP = (14.0, 17.0)
S_STREAM = (17.0, 23.0)
S_PATH = (23.0, 28.0)
S_SEOWON = (28.0, 33.0)
S_WALL = (33.0, 38.5)
S_PINE = (38.5, 44.0)
S_ERASE = (44.0, 49.0)
S_SWARM = (49.0, 56.0)
DURATION = S_SWARM[1]

# 카메라 키프레임: (시각, 중심 x[m], 중심 y[m], 배율[px/m])
CAM = [
    (0.0, 10, 110, 1.36),
    (9.0, 10, 110, 1.36),
    (14.0, 5, 60, 1.55),
    (17.0, 40, -95, 2.05),
    (23.0, 40, -95, 2.05),
    (28.0, -40, -110, 2.3),
    (30.5, -125, -160, 4.2),
    (33.0, -110, -150, 3.4),
    (44.0, 30, -60, 1.75),
    (49.0, 30, -60, 1.75),
]
MAP_CY = 860  # 지도 중심의 화면 y


def clamp01(x):
    return max(0.0, min(1.0, x))


def ph(t, span):
    a, b = span
    return clamp01((t - a) / (b - a))


def ease(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_io(x):
    x = clamp01(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_rgb(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def partial(points, f):
    if f <= 0:
        return []
    if f >= 1:
        return list(points)
    seg = [math.dist(points[i], points[i + 1]) for i in range(len(points) - 1)]
    target = sum(seg) * f
    out, acc = [points[0]], 0.0
    for i, d in enumerate(seg):
        if acc + d >= target:
            r = (target - acc) / d if d else 0
            a, b = points[i], points[i + 1]
            out.append((lerp(a[0], b[0], r), lerp(a[1], b[1], r)))
            return out
        acc += d
        out.append(points[i + 1])
    return out


def point_at(points, f):
    p = partial(points, max(f, 1e-4))
    return p[-1]


def find_font(cands):
    for p in cands:
        if p and os.path.exists(p):
            return p
    return None


class Camera:
    def __init__(self, keys):
        self.keys = keys

    def at(self, t):
        ks = self.keys
        if t <= ks[0][0]:
            return ks[0][1:]
        for a, b in zip(ks, ks[1:]):
            if a[0] <= t <= b[0]:
                u = ease_io((t - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 1)
                return (lerp(a[1], b[1], u), lerp(a[2], b[2], u), math.exp(lerp(math.log(a[3]), math.log(b[3]), u)))
        return ks[-1][1:]


class Renderer:
    def __init__(self, args):
        self.d = json.load(open(args.data))
        kb = find_font([args.font, "/usr/share/fonts/truetype/nanum/NanumSquareRoundB.ttf",
                        "C:/Windows/Fonts/malgunbd.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc"])
        kr = find_font(["/usr/share/fonts/truetype/nanum/NanumSquareRoundR.ttf", "C:/Windows/Fonts/malgun.ttf",
                        "/System/Library/Fonts/AppleSDGothicNeo.ttc"]) or kb
        mono = find_font(["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "C:/Windows/Fonts/consola.ttf",
                          "/System/Library/Fonts/Menlo.ttc"]) or kr
        if not kb:
            sys.exit("한글 글꼴을 찾지 못했습니다. --font 로 지정하세요.")
        self.f_cap = ImageFont.truetype(kb, 56)
        self.f_sub = ImageFont.truetype(kr, 34)
        self.f_lbl = ImageFont.truetype(kb, 28)
        self.f_small = ImageFont.truetype(kr, 22)
        self.f_mono = ImageFont.truetype(mono, 22)
        self.f_mono_b = ImageFont.truetype(mono, 32)
        self.cam = Camera(CAM)
        self.captions = not getattr(args, "no_captions", False)

        o = self.d["osm"]
        k = self.d["key"]
        self.stream = next(s["pts"] for s in o["stream"] if s["id"] == k["main_stream_id"])
        self.stream_len = k["main_stream_len"]
        self.branches = [s["pts"] for s in o["stream"] if s["id"] != k["main_stream_id"] and s["len"] < 300]
        self.road_stream = [s["pts"] for s in o["stream"] if s["len"] >= 300 and s["id"] != k["main_stream_id"]]
        self.seowon = next(b["pts"] for b in o["building"] if b["id"] == k["seowon_id"])
        sx = sum(p[0] for p in self.seowon) / len(self.seowon)
        sy = sum(p[1] for p in self.seowon) / len(self.seowon)
        self.seowon_c = (sx, sy)
        self.seowon_pond = min(o["water"], key=lambda w: math.dist(w["pts"][0], self.seowon_c))["pts"]
        # 길은 서쪽(정원)부터 동쪽으로 순서를 매겨 차례로 그린다
        self.paths = sorted([p["pts"] for p in o["path"]], key=lambda p: (p[0][0] + p[-1][0]))
        self.fields = sorted(self.d["fields_2016"], key=lambda f: -f["area"])
        self.prof = k["stream_profile"]
        self._prep_relief()
        self._prep_grid()
        logo_path = args.logo or os.path.join(REPO, "public", "logo.png")
        self.logo = Image.open(logo_path).convert("RGBA")
        self._swarm_ready = False

    # ---------- 좌표 변환 ----------

    def P(self, p, cam):
        cx, cy, s = cam
        return (W / 2 + (p[0] - cx) * s, MAP_CY - (p[1] - cy) * s)

    def PL(self, pts, cam):
        return [self.P(p, cam) for p in pts]

    # ---------- 정적 레이어 ----------

    def _prep_relief(self):
        t = self.d["terrain"]
        pad = 160
        z = np.pad(np.array(t["z"], np.float64), pad, mode="edge")
        st = t["step"]
        gy, gx = np.gradient(z, st)
        az, alt = math.radians(315), math.radians(40)
        slope = np.arctan(np.hypot(gx, gy) * 1.6)
        aspect = np.arctan2(-gx, gy)
        hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
        hs = np.clip(hs, 0, 1)
        zn = (z - z.min()) / (z.max() - z.min())
        rgb = np.zeros(z.shape + (3,))
        low, high = np.array([58, 92, 52]), np.array([30, 58, 36])
        rgb[:] = low * (1 - zn[..., None]) + high * zn[..., None]
        rgb = rgb * (0.45 + 0.75 * hs[..., None])
        img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
        img = img.resize((z.shape[1] * 4, z.shape[0] * 4), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))
        # 수관(나무 머리) 질감: 작은 반점 노이즈
        rng = np.random.default_rng(5)
        nz = rng.normal(0, 1, (img.height // 2, img.width // 2)).astype(np.float32)
        nz = np.array(Image.fromarray(((nz * 30) + 128).clip(0, 255).astype(np.uint8)).resize(img.size, Image.BILINEAR)
                      .filter(ImageFilter.GaussianBlur(1.2)), np.float32) - 128
        arr = np.array(img, np.float32) * (1 + nz[..., None] / 220)
        self.relief = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
        self.relief_origin = (t["x0"] - pad * st, t["y0"] + pad * st, st / 4)

    def relief_frame(self, cam):
        """음영기복 이미지를 현재 카메라로 변환해 화면 크기로 돌려준다."""
        x0, y0, mpp = self.relief_origin
        cx, cy, s = cam
        # 화면 픽셀 (u,v) → 지도 m → 기복 이미지 픽셀
        a = 1 / (s * mpp)
        c = (cx - W / 2 / s - x0) / mpp
        e = 1 / (s * mpp)
        f = (y0 - cy - MAP_CY / s) / mpp
        return self.relief.transform((W, H), Image.AFFINE, (a, 0, c, 0, e, f), resample=Image.BILINEAR,
                                     fillcolor=(20, 34, 24))

    def _prep_grid(self):
        self.grid_cache = {}

    def grid(self, dr, cam, alpha=1.0):
        cx, cy, s = cam
        step = 50 if s < 2.6 else 20
        a = int(255 * alpha)
        x_min = cx - W / 2 / s
        x_max = cx + W / 2 / s
        y_min = cy - (H - MAP_CY) / s
        y_max = cy + MAP_CY / s
        x = math.floor(x_min / step) * step
        while x <= x_max:
            u = self.P((x, 0), cam)[0]
            major = x % (step * 5) == 0
            dr.line([(u, 0), (u, H)], fill=(GRID_MAJOR if major else GRID) + (a,), width=1)
            x += step
        y = math.floor(y_min / step) * step
        while y <= y_max:
            v = self.P((0, y), cam)[1]
            major = y % (step * 5) == 0
            dr.line([(0, v), (W, v)], fill=(GRID_MAJOR if major else GRID) + (a,), width=1)
            y += step

    # ---------- HUD 요소 ----------

    def hud(self, dr, t, label, accent=HUD, cam=None):
        m, L = 40, 66
        for cx, cy, sx, sy in ((m, m, 1, 1), (W - m, m, -1, 1), (m, H - m, 1, -1), (W - m, H - m, -1, -1)):
            dr.line([(cx, cy), (cx + sx * L, cy)], fill=accent + (220,), width=4)
            dr.line([(cx, cy), (cx, cy + sy * L)], fill=accent + (220,), width=4)
        dr.text((m + 18, m + 18), "MEDONGAULE · YANGDONG-MYEON, YANGPYEONG", font=self.f_mono, fill=accent + (230,))
        dr.text((m + 18, m + 46), label, font=self.f_mono, fill=accent + (180,))
        tc = f"T+{t:05.2f}s"
        tw = dr.textlength(tc, font=self.f_mono)
        dr.text((W - m - 18 - tw, m + 18), tc, font=self.f_mono, fill=accent + (200,))
        if int(t * 2) % 2 == 0:
            dr.ellipse((W - m - 18 - tw - 24, m + 24, W - m - 18 - tw - 10, m + 38), fill=RED + (230,))
        if cam:
            # 축척 막대
            s = cam[2]
            meters = 50 if s < 2.6 else 20
            bx, by = m + 18, H - m - 54
            dr.line([(bx, by), (bx + meters * s, by)], fill=accent + (220,), width=3)
            for xx in (bx, bx + meters * s):
                dr.line([(xx, by - 8), (xx, by + 8)], fill=accent + (220,), width=3)
            dr.text((bx + meters * s + 12, by - 13), f"{meters} m", font=self.f_mono, fill=accent + (220,))
            # 방위
            nx, ny = W - m - 50, H - m - 70
            dr.polygon([(nx, ny - 26), (nx - 10, ny + 4), (nx + 10, ny + 4)], outline=accent + (220,))
            dr.text((nx - 7, ny + 8), "N", font=self.f_mono, fill=accent + (220,))

    def caption(self, dr, text, sub=None, alpha=1.0, color=(255, 255, 255), y=1580):
        if alpha <= 0:
            return
        a = int(255 * alpha)
        for ln in text.split("\n"):
            tw = dr.textlength(ln, font=self.f_cap)
            dr.text(((W - tw) / 2 + 3, y + 3), ln, font=self.f_cap, fill=(0, 0, 0, int(a * 0.6)))
            dr.text(((W - tw) / 2, y), ln, font=self.f_cap, fill=color + (a,))
            y += 70
        if sub:
            tw = dr.textlength(sub, font=self.f_sub)
            dr.text(((W - tw) / 2, y + 6), sub, font=self.f_sub, fill=color + (int(a * 0.78),))

    def tag(self, dr, xy, text, color=LINE, alpha=1.0, leader=None, font=None):
        font = font or self.f_lbl
        a = int(255 * alpha)
        if a <= 0:
            return
        if leader:
            dr.line(leader, fill=color + (int(a * 0.8),), width=2)
        x, y = xy
        tw = dr.textlength(text, font=font)
        dr.rectangle((x - 10, y - 6, x + tw + 10, y + font.size + 10), fill=NAVY + (int(a * 0.88),), outline=color + (a,))
        dr.text((x, y), text, font=font, fill=color + (a,))

    def panel(self, dr, box, title, alpha, accent=HUD):
        a = int(255 * alpha)
        x0, y0, x1, y1 = box
        dr.rectangle(box, fill=(4, 14, 24, int(a * 0.85)), outline=accent + (a,), width=2)
        dr.rectangle((x0, y0, x1, y0 + 34), fill=accent + (int(a * 0.18),))
        dr.text((x0 + 12, y0 + 6), title, font=self.f_mono, fill=accent + (a,))

    # ---------- 장면 1: HUD 스캔 ----------

    def scene_scan(self, t, cam, dr):
        # 레이더식 원형 스캔
        u = ph(t, (0.4, 6.5))
        center = self.P((10, 110), cam)
        R = 1400 * ease(u)
        ang = t * 2.4
        for c in self.d["contours"]:
            pts = self.PL(c["pts"], cam)
            vis = [p for p in pts if math.dist(p, center) < R]
            if len(vis) > 1:
                col = (90, 150, 120) if c["major"] else (52, 96, 80)
                dr.line(vis, fill=col + (200,), width=2 if c["major"] else 1)
        # 스위프 빔
        if u < 1:
            for k in range(14):
                a0 = ang - k * 0.035
                ex = center[0] + math.cos(a0) * 1500
                ey = center[1] + math.sin(a0) * 1500
                dr.line([center, (ex, ey)], fill=HUD + (int(90 * (1 - k / 14)),), width=6)
        dr.ellipse((center[0] - R, center[1] - R, center[0] + R, center[1] + R), outline=HUD + (120,), width=2)
        # 탐지된 필지
        det = ph(t, (2.0, 7.0))
        n = int(len(self.fields) * det)
        for i, f in enumerate(self.fields[:n]):
            pts = self.PL(f["poly"], cam)
            age = clamp01(det * len(self.fields) - i)
            dr.polygon(pts, fill=AMBER + (int(60 * age),), outline=AMBER + (230,))
        if n:
            big = self.fields[0]
            bx = sum(p[0] for p in big["poly"]) / len(big["poly"])
            by = sum(p[1] for p in big["poly"]) / len(big["poly"])
            bp = self.P((bx, by), cam)
            self.tag(dr, (bp[0] - 330, bp[1] + 150), "2016 · 논밭 필지", AMBER, ease(ph(t, (3.0, 3.6))),
                     leader=[bp, (bp[0] - 200, bp[1] + 150)])
        # 데이터 패널
        pa = ease(ph(t, (4.0, 5.0)))
        if pa > 0:
            box = (560, 140, 1040, 360)
            self.panel(dr, box, "SITE SCAN · 2016 (BEFORE)", pa)
            total = sum(f["area"] for f in self.fields[:n])
            rows = [("PARCELS", f"{n:>3}"), ("FIELD AREA", f"{total:>7,} m²"),
                    ("ELEV. (STREAM)", f"{self.prof[-1][1]:.0f}–{self.prof[0][1]:.0f} m"), ("COVER", "FOREST · FIELDS")]
            for k, (a, b) in enumerate(rows):
                dr.text((box[0] + 14, box[1] + 50 + k * 40), a, font=self.f_mono, fill=HUD + (int(200 * pa),))
                tw = dr.textlength(b, font=self.f_mono_b)
                dr.text((box[2] - 14 - tw, box[1] + 44 + k * 40), b, font=self.f_mono_b, fill=(255, 255, 255, int(240 * pa)))

    # ---------- 장면 2: 물의 흐름과 종단면 ----------

    def scene_flow(self, t, cam, dr, alpha=1.0):
        a = ease(ph(t, (S_FLOW[0], S_FLOW[0] + 0.8))) * alpha
        if a <= 0:
            return
        pts = self.PL(self.stream, cam)
        dr.line(pts, fill=WATER + (int(110 * a),), width=10, joint="curve")
        # 흐르는 화살표(서 → 동)
        for k in range(7):
            f = ((t * 0.12) + k / 7) % 1.0
            p = point_at(self.stream, f)
            q = point_at(self.stream, min(f + 0.01, 1))
            P0, P1 = self.P(p, cam), self.P(q, cam)
            ang = math.atan2(P1[1] - P0[1], P1[0] - P0[0])
            L = 16
            tri = [(P0[0] + math.cos(ang) * L, P0[1] + math.sin(ang) * L),
                   (P0[0] + math.cos(ang + 2.5) * L, P0[1] + math.sin(ang + 2.5) * L),
                   (P0[0] + math.cos(ang - 2.5) * L, P0[1] + math.sin(ang - 2.5) * L)]
            dr.polygon(tri, fill=WATER + (int(230 * a),))
        # 종단면 그래프(Manim식)
        box = (90, 1250, 990, 1500)
        self.panel(dr, box, "STREAM PROFILE · 408 m", a, WATER)
        g = ease(ph(t, (S_FLOW[0] + 0.6, S_FLOW[1] - 1.0)))
        x0, y0, x1, y1 = box[0] + 70, box[1] + 50, box[2] - 30, box[3] - 40
        zmax, zmin = self.prof[0][1] + 3, self.prof[-1][1] - 3
        Lm = self.prof[-1][0]
        dr.line([(x0, y1), (x1, y1)], fill=WATER + (int(160 * a),), width=2)
        dr.line([(x0, y0), (x0, y1)], fill=WATER + (int(160 * a),), width=2)
        dr.text((box[0] + 10, y0 - 6), f"{zmax:.0f}m", font=self.f_mono, fill=WATER + (int(200 * a),))
        dr.text((box[0] + 10, y1 - 22), f"{zmin:.0f}m", font=self.f_mono, fill=WATER + (int(200 * a),))
        curve = [(x0 + (x1 - x0) * d_ / Lm, y0 + (y1 - y0) * (zmax - z) / (zmax - zmin)) for d_, z in self.prof]
        part = partial(curve, g)
        if len(part) > 1:
            dr.line(part, fill=WATER + (int(255 * a),), width=4, joint="curve")
            dr.ellipse((part[-1][0] - 7, part[-1][1] - 7, part[-1][0] + 7, part[-1][1] + 7), fill=HUD + (int(255 * a),))
        if g >= 1:
            drop = self.prof[0][1] - self.prof[-1][1]
            txt = f"Δh {drop:.1f} m · AVG {drop / Lm * 100:.1f} %"
            tw = dr.textlength(txt, font=self.f_mono_b)
            dr.text((x1 - tw, y0), txt, font=self.f_mono_b, fill=(255, 255, 255, int(240 * a)))

    # ---------- 장면 3~: 블루프린트 ----------

    def draw_fields_ghost(self, dr, cam, alpha):
        for f in self.fields:
            pts = self.PL(f["poly"], cam)
            for i in range(0, len(pts) - 1):
                if i % 2 == 0:
                    dr.line([pts[i], pts[i + 1]], fill=AMBER + (int(120 * alpha),), width=1)

    def draw_stream(self, dr, t, cam, f):
        pts = self.PL(partial(self.stream, f), cam)
        if len(pts) > 1:
            dr.line(pts, fill=WATER + (60,), width=22, joint="curve")
            dr.line(pts, fill=WATER + (255,), width=6, joint="curve")
            if f < 1:
                x, y = pts[-1]
                dr.ellipse((x - 10, y - 10, x + 10, y + 10), fill=HUD + (240,))
        for b in self.branches:
            bp = self.PL(partial(b, ease(ph(f, (0.5, 1.0)))), cam)
            if len(bp) > 1:
                dr.line(bp, fill=WATER + (200,), width=3, joint="curve")
        if f >= 1:
            # 흐름 입자
            for k in range(26):
                ff = ((t * 0.09) + k / 26) % 1
                x, y = self.P(point_at(self.stream, ff), cam)
                dr.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(230, 250, 255, 220))

    def draw_ponds(self, dr, cam, alpha):
        for w in self.d["osm"]["water"]:
            dr.polygon(self.PL(w["pts"], cam), fill=WATER + (int(110 * alpha),), outline=WATER + (int(255 * alpha),))

    def draw_paths(self, dr, cam, f):
        n = len(self.paths)
        for i, p in enumerate(self.paths):
            fi = clamp01(f * n - i * 0.6)
            if fi <= 0:
                continue
            pts = self.PL(partial(p, fi), cam)
            if len(pts) > 1:
                dr.line(pts, fill=LINE + (230,), width=2, joint="curve")

    def draw_buildings(self, dr, cam, alpha):
        for b in self.d["osm"]["building"]:
            dr.polygon(self.PL(b["pts"], cam), outline=LINE + (int(160 * alpha),))

    def draw_seowon(self, dr, t, cam, f):
        pts = self.PL(self.seowon + [self.seowon[0]], cam)
        part = partial(pts, f)
        if len(part) > 1:
            dr.line(part, fill=HUD + (80,), width=12)
            dr.line(part, fill=HUD + (255,), width=4)
        if f >= 1:
            dr.polygon(pts, fill=HUD + (40,))

    def inset(self, dr, box, title, alpha):
        """지도와 분리된 HUD 확대창(도식)."""
        a = int(255 * alpha)
        x0, y0, x1, y1 = box
        dr.rectangle(box, fill=(6, 22, 40, int(a * 0.95)), outline=HUD + (a,), width=3)
        for gx in range(x0, x1, 30):
            dr.line([(gx, y0), (gx, y1)], fill=GRID + (int(a * 0.8),), width=1)
        for gy in range(y0, y1, 30):
            dr.line([(x0, gy), (x1, gy)], fill=GRID + (int(a * 0.8),), width=1)
        dr.rectangle((x0, y0, x1, y0 + 40), fill=HUD + (int(a * 0.2),))
        dr.text((x0 + 12, y0 + 6), title, font=self.f_lbl, fill=HUD + (a,))
        tw = dr.textlength("SCHEMATIC", font=self.f_mono)
        dr.text((x1 - tw - 12, y0 + 7), "SCHEMATIC", font=self.f_mono, fill=AMBER + (a,))

    def wall_inset(self, dr, t, alpha):
        box = (90, 380, 990, 1180)
        self.inset(dr, box, "DETAIL · 남도돌담길", alpha)
        if alpha < 0.6:
            return
        x0, y0, x1, y1 = box
        base = y1 - 160
        u0 = S_WALL[0]
        build = ease(ph(t, (u0 + 0.4, u0 + 1.6)))
        fall = ease(ph(t, (u0 + 2.2, u0 + 3.0)))
        redo = ease(ph(t, (u0 + 3.1, S_WALL[1] - 0.3)))
        rng = np.random.default_rng(3)
        # 반듯한 담: 같은 크기 돌, 수평 계측선
        if fall < 1:
            k = 0
            for row in range(4):
                for col in range(14):
                    k += 1
                    if k / 56 > build:
                        break
                    sx = x0 + 70 + col * 54 + (27 if row % 2 else 0)
                    if sx + 50 > x1 - 60:
                        continue
                    sy = base - (row + 1) * 46
                    drop = fall * (80 + (k * 53) % 160) if row >= 2 else fall * 20
                    dr.rectangle((sx, sy + drop, sx + 50, sy + 42 + drop), outline=LINE + (int(255 * (1 - fall)),), width=2)
            lvl = (1 - fall) * ease(ph(t, (u0 + 1.2, u0 + 1.8)))
            if lvl > 0:
                dr.line([(x0 + 50, base - 4 * 46 - 6), (x1 - 50, base - 4 * 46 - 6)], fill=RED + (int(255 * lvl),), width=3)
                dr.text((x1 - 230, base - 4 * 46 - 50), "LEVEL ±0", font=self.f_mono_b, fill=RED + (int(255 * lvl),))
        if redo > 0:
            stones = []
            x = x0 + 70
            while x < x1 - 110:
                for row in range(4):
                    w = rng.uniform(34, 78)
                    h = rng.uniform(24, 40)
                    cx = x + rng.uniform(0, 18) + w / 2
                    cy = base - 26 - row * 40 + rng.uniform(-5, 5)
                    an = rng.uniform(-0.25, 0.25)
                    pts = []
                    for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
                        jx, jy = dx * rng.uniform(0.75, 1.05), dy * rng.uniform(0.75, 1.1)
                        pts.append((cx + jx * math.cos(an) - jy * math.sin(an), cy + jx * math.sin(an) + jy * math.cos(an)))
                    stones.append(pts)
                x += rng.uniform(46, 70)
            n = int(len(stones) * redo)
            for st in stones[:n]:
                dr.polygon(st, outline=LINE + (240,), fill=LINE + (30,))
            if redo > 0.3:
                for k in range(8):
                    xx = x0 + 70 + k * 100
                    if xx > x1 - 60:
                        break
                    dr.line([(xx, base + 30), (xx, base + 48)], fill=RED + (220,), width=3)
                dr.line([(x0 + 70, base + 39), (x0 + 770, base + 39)], fill=RED + (200,), width=2)
                dr.text((x0 + 300, base + 56), "1 m씩 쌓고 확인", font=self.f_lbl, fill=RED + (230,))

    def pine_inset(self, dr, t, alpha):
        box = (90, 380, 990, 1180)
        self.inset(dr, box, "DETAIL · 담장 너머 소나무", alpha)
        if alpha < 0.6:
            return
        x0, y0, x1, y1 = box
        u0 = S_PINE[0]
        base = (x0 + 470, y1 - 300)
        top = (base[0] - 190, base[1] - 290)
        gps = ease(ph(t, (u0 + 0.3, u0 + 1.6)))
        span = lerp(380, 0, gps)
        ac = int(230 * min(1, gps * 2))
        dr.line([(base[0] - 70 - span, base[1]), (base[0] + 70 + span, base[1])], fill=RED + (ac,), width=2)
        dr.line([(base[0], base[1] - 70 - span), (base[0], base[1] + 70 + span)], fill=RED + (ac,), width=2)
        rr = 30 + span * 0.2
        dr.ellipse((base[0] - rr, base[1] - rr, base[0] + rr, base[1] + rr), outline=RED + (ac,), width=3)
        if gps >= 1:
            dr.text((base[0] + 50, base[1] + 26), "GPS · 오차 몇 cm 이내", font=self.f_lbl, fill=RED + (240,))
        tr = ease(ph(t, (u0 + 1.6, u0 + 2.8)))
        if tr > 0:
            tx, ty = lerp(base[0], top[0], tr), lerp(base[1], top[1], tr)
            dr.line([base, (tx, ty)], fill=LINE + (80,), width=22)
            dr.line([base, (tx, ty)], fill=LINE + (255,), width=8)
            can = ease(ph(t, (u0 + 2.4, u0 + 3.2)))
            for k, (ox, oy, r) in enumerate(((0, 0, 90), (-90, 30, 64), (80, 40, 60), (-30, -70, 58))):
                if can * 4 > k:
                    cx, cy = top[0] + ox, top[1] + oy
                    dr.ellipse((cx - r, cy - r, cx + r, cy + r), outline=LINE + (230,), width=3)
        wl = ease(ph(t, (u0 + 3.2, S_PINE[1] - 0.6)))
        if wl > 0:
            wall = [(x0 + 60, base[1] + 70), (base[0] - 80, base[1] + 56), (base[0] - 10, base[1] + 36),
                    (base[0] + 70, base[1] + 44), (x1 - 60, base[1] + 74)]
            part = partial(wall, wl)
            if len(part) > 1:
                dr.line(part, fill=LINE + (60,), width=34, joint="curve")
                dr.line(part, fill=LINE + (240,), width=20, joint="curve")
                dr.line(part, fill=NAVY + (255,), width=8, joint="curve")
            if wl >= 1:
                a, b = (base[0], base[1] + 6), (base[0], base[1] + 26)
                dr.line([a, b], fill=RED + (255,), width=3)
                for p in (a, b):
                    dr.line([(p[0] - 12, p[1]), (p[0] + 12, p[1])], fill=RED + (255,), width=3)
                self.tag(dr, (base[0] + 120, base[1] + 120), "밑동과 담 사이 · 몇 cm", RED, 1.0,
                         leader=[(base[0] + 14, base[1] + 18), (base[0] + 120, base[1] + 120)])

    # ---------- 파티클 스웜 ----------

    def _prep_swarm(self, src_img):
        n = 9000
        rng = np.random.default_rng(11)
        arr = np.array(src_img.convert("L"))
        ys, xs = np.nonzero(arr > 140)
        if len(xs) < 100:
            ys, xs = np.mgrid[300:1500:8, 100:980:8].reshape(2, -1)
        pick = rng.choice(len(xs), n)
        self.p_start = np.stack([xs[pick], ys[pick]], 1).astype(np.float32)
        logo = self.logo
        sc = 960 / logo.width
        lw, lh = int(logo.width * sc), int(logo.height * sc)
        self.logo_big = logo.resize((lw, lh), Image.LANCZOS)
        self.logo_pos = ((W - lw) // 2, (H - lh) // 2 - 40)
        la = np.array(self.logo_big)
        ink = (la[..., 3] > 128) & (la[..., :3].sum(-1) < 600)
        ly, lx = np.nonzero(ink)
        pick = rng.choice(len(lx), n)
        self.p_target = np.stack([lx[pick] + self.logo_pos[0], ly[pick] + self.logo_pos[1]], 1).astype(np.float32)
        self.p_color = la[ly[pick], lx[pick], :3].astype(np.float32)
        self.p_seed = rng.uniform(0, 2 * math.pi, (n, 2)).astype(np.float32)
        self.p_burst = rng.normal(0, 1, (n, 2)).astype(np.float32) * 120
        self._swarm_ready = True

    def scene_swarm(self, t):
        if not self._swarm_ready:
            self._end = self.blueprint_frame(S_SWARM[0] - 1e-3)
            self._prep_swarm(self.linework_only(S_SWARM[0] - 1e-3))
        u = t - S_SWARM[0]
        bgm = ease(ph(u, (3.0, 4.4)))
        bg = lerp_rgb(NAVY, PAPER, bgm)
        arr = np.empty((H, W, 3), np.uint8)
        arr[:] = bg
        out = ease(ph(u, (0.0, 0.8)))
        if out < 1:
            arr[:] = (np.array(self._end, np.float32) * (1 - out) + np.array(bg, np.float32) * out).astype(np.uint8)
        burst = 1 - (1 - ph(u, (0.4, 1.8))) ** 3
        gather = ease(ph(u, (1.2, 4.2)))
        swirl = (1 - gather) * 60
        tt = u * 2.2
        noise = np.stack([np.sin(tt + self.p_seed[:, 0] * 3) * swirl, np.cos(tt * 1.3 + self.p_seed[:, 1] * 3) * swirl], 1)
        pos = (self.p_start + self.p_burst * burst) * (1 - gather) + self.p_target * gather + noise
        fly = np.array(HUD, np.float32) * 0.55 + np.array(LINE, np.float32) * 0.45
        settle = ease(ph(u, (3.2, 4.4)))
        col = fly * (1 - settle) + self.p_color * settle
        fade = 1 - ease(ph(u, (4.6, 5.6)))
        if fade > 0:
            xs = np.clip(pos[:, 0].astype(int), 0, W - 4)
            ys = np.clip(pos[:, 1].astype(int), 0, H - 4)
            c = (col * fade + np.array(bg, np.float32) * (1 - fade)).astype(np.uint8)
            size = 3 if gather < 0.9 else 2
            for dy in range(size):
                for dx in range(size):
                    arr[ys + dy, xs + dx] = c
        img = Image.fromarray(arr).convert("RGBA")
        la = ease(ph(u, (4.2, 5.4)))
        if la > 0:
            lg = np.array(self.logo_big)
            lg[..., 3] = (lg[..., 3] * la).astype(np.uint8)
            img.alpha_composite(Image.fromarray(lg), dest=self.logo_pos)
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)
        if u < 2.4:
            self.hud(dr, t, "PARTICLE SWARM")
        src = ease(ph(u, (5.0, 6.0)))
        if src > 0:
            for k, s in enumerate(("데이터: Esri World Imagery Wayback(2016) · AWS Terrain Tiles",
                                   "© OpenStreetMap contributors · 메덩골정원 · 이로재")):
                tw = dr.textlength(s, font=self.f_small)
                dr.text(((W - tw) / 2, H - 150 + k * 32), s, font=self.f_small, fill=(90, 100, 95, int(220 * src)))
        return Image.alpha_composite(img, ov).convert("RGB")

    # ---------- 프레임 조립 ----------

    def linework_only(self, t):
        """파티클 시작점용: 완성 도면의 선만 흰색으로."""
        cam = self.cam.at(t)
        img = Image.new("RGB", (W, H), (0, 0, 0))
        dr = ImageDraw.Draw(img)
        dr.line(self.PL(self.stream, cam), fill=(255, 255, 255), width=5)
        for p in self.paths:
            dr.line(self.PL(p, cam), fill=(255, 255, 255), width=2)
        dr.polygon(self.PL(self.seowon, cam), outline=(255, 255, 255))
        for f in self.fields:
            dr.polygon(self.PL(f["poly"], cam), outline=(200, 200, 200))
        return img

    def blueprint_frame(self, t):
        cam = self.cam.at(t)
        # 배경: 스캔 단계는 어두운 지형, 블루프린트는 남색, 지우기 단계는 음영기복
        if t < S_BP[0]:
            base = Image.new("RGB", (W, H), DARK)
        else:
            base = Image.new("RGB", (W, H), NAVY)
            tr = ease(ph(t, S_BP))
            if tr < 1:
                base = Image.blend(Image.new("RGB", (W, H), DARK), base, tr)
        erase = ease(ph(t, (S_ERASE[0], S_ERASE[0] + 3.0)))
        if erase > 0:
            base = Image.blend(base, self.relief_frame(cam), erase)
        img = base.convert("RGBA")
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(ov)
        line_a = 1 - erase

        if t >= S_BP[0] and line_a > 0:
            self.grid(dr, cam, ease(ph(t, S_BP)) * line_a)

        if t < S_STREAM[0]:
            self.scene_scan(min(t, S_SCAN[1]), cam, dr) if t < S_BP[1] else None
            if t >= S_FLOW[0]:
                self.scene_flow(t, cam, dr, alpha=1 - ease(ph(t, (S_BP[0] + 1.5, S_BP[1]))))
        if t >= S_BP[0] and line_a > 0:
            self.draw_fields_ghost(dr, cam, ease(ph(t, S_BP)) * line_a * 0.9)
            ov2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d2 = ImageDraw.Draw(ov2)
            self.draw_stream(d2, t, cam, ease(ph(t, (S_STREAM[0], S_STREAM[0] + 4.0))))
            if t >= S_STREAM[0] + 2.5:
                self.draw_ponds(d2, cam, ease(ph(t, (S_STREAM[0] + 2.5, S_STREAM[1]))))
            self.draw_paths(d2, cam, ease(ph(t, S_PATH)))
            if t >= S_PATH[0] + 2:
                self.draw_buildings(d2, cam, ease(ph(t, (S_PATH[0] + 2, S_PATH[1]))))
            self.draw_seowon(d2, t, cam, ease(ph(t, (S_SEOWON[0] + 0.8, S_SEOWON[0] + 3.0))))
            if line_a < 1:
                a = np.array(ov2)
                a[..., 3] = (a[..., 3] * line_a).astype(np.uint8)
                ov2 = Image.fromarray(a)
            ov = Image.alpha_composite(ov, ov2)
            dr = ImageDraw.Draw(ov)

            # 라벨
            if S_STREAM[0] + 4.0 <= t < S_PATH[1]:
                mid = self.P(point_at(self.stream, 0.55), cam)
                self.tag(dr, (mid[0] - 40, mid[1] + 90), f"메덩내 계류 · {self.stream_len} m", WATER,
                         ease(ph(t, (S_STREAM[0] + 4.0, S_STREAM[0] + 4.6))), leader=[mid, (mid[0], mid[1] + 84)])
                src = self.P(self.stream[0], cam)
                self.tag(dr, (src[0] - 230, src[1] - 110), "물길의 시작", HUD,
                         ease(ph(t, (S_STREAM[0] + 4.4, S_STREAM[0] + 5.0))), leader=[src, (src[0] - 120, src[1] - 74)])
            if S_SEOWON[0] + 2.6 <= t < S_WALL[0] + 0.5:
                c = self.P(self.seowon_c, cam)
                self.tag(dr, (c[0] + 90, c[1] - 170), "선곡서원", HUD, ease(ph(t, (S_SEOWON[0] + 2.6, S_SEOWON[0] + 3.2))),
                         leader=[c, (c[0] + 90, c[1] - 140)])
                pc = self.seowon_pond
                pp = self.P((sum(p[0] for p in pc) / len(pc), sum(p[1] for p in pc) / len(pc)), cam)
                self.tag(dr, (pp[0] - 220, pp[1] + 80), "연못", WATER, ease(ph(t, (S_SEOWON[0] + 3.0, S_SEOWON[0] + 3.6))),
                         leader=[pp, (pp[0] - 120, pp[1] + 80)])

        if erase > 0:
            nat = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            dn = ImageDraw.Draw(nat)
            s_ = cam[2]
            for p in self.paths:
                dn.line(self.PL(p, cam), fill=(214, 204, 176, 230), width=max(2, int(1.6 * s_)), joint="curve")
            for w in self.d["osm"]["water"]:
                dn.polygon(self.PL(w["pts"], cam), fill=(70, 120, 140, 255))
            dn.line(self.PL(self.stream, cam), fill=(84, 140, 160, 255), width=max(3, int(2.4 * s_)), joint="curve")
            for b in self.d["osm"]["building"]:
                dn.polygon(self.PL(b["pts"], cam), fill=(176, 172, 162, 255))
            nat = nat.filter(ImageFilter.GaussianBlur(0.8))
            a = np.array(nat)
            a[..., 3] = (a[..., 3] * erase).astype(np.uint8)
            img = Image.alpha_composite(img, Image.fromarray(a))

        # 도식 확대창
        wa = min(ease(ph(t, (S_WALL[0], S_WALL[0] + 0.5))), 1 - ease(ph(t, (S_WALL[1] - 0.4, S_WALL[1]))))
        if wa > 0:
            self.wall_inset(dr, t, wa)
        pa = min(ease(ph(t, (S_PINE[0], S_PINE[0] + 0.5))), 1 - ease(ph(t, (S_PINE[1] - 0.4, S_PINE[1]))))
        if pa > 0:
            self.pine_inset(dr, t, pa)

        # HUD
        labels = [(S_SCAN, "SCAN · 2016 SATELLITE / TERRAIN"), (S_FLOW, "ANALYSIS · WATER FLOW W→E"),
                  (S_BP, "BLUEPRINT · OVER THE OLD FIELDS"), (S_STREAM, "STEP 01 · STREAM 408 m"),
                  (S_PATH, "STEP 02 · PATHS"), (S_SEOWON, "STEP 03 · SEONGOK SEOWON"),
                  (S_WALL, "STEP 04 · STONE WALL (SCHEMATIC)"), (S_PINE, "STEP 05 · PINE FIRST (SCHEMATIC)"),
                  (S_ERASE, "STEP 06 · ERASE THE LINES")]
        lab = labels[0][1]
        for span, name in labels:
            if t >= span[0]:
                lab = name
        self.hud(dr, t, lab, cam=cam)

        caps = [
            ((0.6, 4.6), "SCANNING…", "양평 양동면 메덩골, 2016년 겨울 위성사진"),
            ((4.6, S_SCAN[1]), "골짜기를 따라\n계단처럼 놓인 논밭", "공사 전 필지 25곳 · 약 7만 ㎡"),
            (S_FLOW, "물은 서쪽 골짜기에서\n동쪽 개울로 흐릅니다", None),
            (S_BP, "그 논밭 위에\n정원의 선을 긋습니다", None),
            (S_STREAM, "사백 미터의 물길을 내고", "지도 실측 408 m · 공식 400 m"),
            (S_PATH, "길을 앉히고", None),
            (S_SEOWON, "골짜기 끝에 서원을 앉혔습니다", None),
            ((S_WALL[0], S_WALL[0] + 3.0), "너무 반듯한 담은 허물고", None),
            ((S_WALL[0] + 3.0, S_WALL[1]), "농부의 마음으로\n1미터씩 다시", None),
            ((S_PINE[0], S_PINE[0] + 3.2), "소나무가 먼저 왔습니다", "정밀 GPS로 자리와 높이를 찍고"),
            ((S_PINE[0] + 3.2, S_PINE[1]), "담은 밑동을 스치도록\n나중에 쌓았지요", None),
            ((S_ERASE[0], S_ERASE[0] + 2.2), "그리고 모든 선을 지웁니다", None),
            ((S_ERASE[0] + 2.2, S_ERASE[1]), "원래 있던 자연처럼", "그것이 조경의 디테일이고, 기술입니다"),
        ]
        for span, txt, sub in (caps if self.captions else []):
            if span[0] <= t < span[1]:
                a = min(ease(ph(t, (span[0], span[0] + 0.4))), 1 - ease(ph(t, (span[1] - 0.3, span[1]))))
                self.caption(dr, txt, sub, alpha=a)

        img = Image.alpha_composite(img, ov)
        return img.convert("RGB")

    def frame(self, t):
        if t < S_SWARM[0]:
            return self.blueprint_frame(t)
        return self.scene_swarm(t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="medeonggol_site.mp4")
    ap.add_argument("--data", default=os.path.join(HERE, "site_data.json"))
    ap.add_argument("--logo")
    ap.add_argument("--font")
    ap.add_argument("--still", type=float, action="append")
    args = ap.parse_args()
    r = Renderer(args)
    if args.still:
        base = os.path.splitext(args.out)[0]
        for s in args.still:
            p = f"{base}_{s:05.2f}s.png"
            r.frame(s).save(p)
            print(p)
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
