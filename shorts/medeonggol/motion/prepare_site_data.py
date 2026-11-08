"""메덩골정원 대상지 데이터 준비: 실제 지형·필지·시설을 한 JSON으로 묶는다.

출처
  - 좌표: 메덩골정원 공식 '오시는 길' 지도 (37.4962933, 127.7283216)
  - 공사 전 현황: Esri World Imagery Wayback 2016-06-13 판(겨울 눈 덮인 촬영분)에서 논밭 필지를 자동 추출
  - 완공 후 시설: OpenStreetMap (2026년 7~9월 갱신분) — 계류, 연못, 담장, 건물, 길
  - 지형: AWS Terrain Tiles(terrarium) z15 표고

결과: site_data.json (렌더러 site_blueprint.py 가 읽는다)
좌표계: 원점(LAT0, LON0) 기준 미터, x=동쪽, y=북쪽.

필요: Python 3, numpy, Pillow, opencv-python-headless
"""

import io
import json
import math
import os
import urllib.request
import xml.etree.ElementTree as ET

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.join(HERE, "site_data.json")

LAT0, LON0 = 37.4952, 127.7266
BBOX = (127.7190, 37.4885, 127.7340, 37.4995)  # 서, 남, 동, 북
MX = math.cos(math.radians(LAT0)) * 111320
MY = 110950
UA = {"User-Agent": "magazinegreen-site-analysis/1.0"}


def to_m(lat, lon):
    return round((lon - LON0) * MX, 1), round((lat - LAT0) * MY, 1)


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            open(path, "wb").write(r.read())
    return path


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def tile_latlon(x, y, z):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def mosaic(template, z, name):
    """BBOX를 덮는 타일을 이어 붙이고, 각 픽셀의 (lat, lon)을 계산할 수 있게 원점을 돌려준다."""
    xa, ya = tile_xy(BBOX[3], BBOX[0], z)
    xb, yb = tile_xy(BBOX[1], BBOX[2], z)
    x0, y0, x1, y1 = int(xa), int(ya), int(xb), int(yb)
    img = Image.new("RGB", (256 * (x1 - x0 + 1), 256 * (y1 - y0 + 1)))
    for i, x in enumerate(range(x0, x1 + 1)):
        for j, y in enumerate(range(y0, y1 + 1)):
            p = fetch(template.format(z=z, x=x, y=y), f"{name}_{z}_{x}_{y}.png")
            img.paste(Image.open(p).convert("RGB"), (i * 256, j * 256))
    return img, x0, y0


def px_to_m(px, py, x0, y0, z):
    lat, lon = tile_latlon(x0 + px / 256, y0 + py / 256, z)
    return to_m(lat, lon)


# ---------- 1. 공사 전 논밭 필지 (2016 겨울 위성사진) ----------

def fields_2016():
    tpl = ("https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/"
           "default028mm/MapServer/tile/11509/{z}/{y}/{x}")
    img, x0, y0 = mosaic(tpl, 17, "wb2016")
    c = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY)
    s = cv2.cvtColor(c, cv2.COLOR_BGR2HSV)[..., 1]
    # 눈 덮인 평탄지(논밭)는 밝고 채도가 낮다. 둑과 경계는 어두운 선으로 남아 필지가 갈린다.
    mask = ((g > 175) & (s < 40)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8), 1)
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for k in cs:
        if cv2.contourArea(k) < 350:
            continue
        k = cv2.approxPolyDP(k, 2.5, True)[:, 0, :]
        poly = [px_to_m(float(px), float(py), x0, y0, 17) for px, py in k]
        xs, ys = zip(*poly)
        if not (-330 < np.mean(xs) < 340 and -300 < np.mean(ys) < 520):
            continue
        area = abs(sum(poly[i][0] * poly[i - 1][1] - poly[i - 1][0] * poly[i][1] for i in range(len(poly)))) / 2
        out.append({"poly": poly, "area": int(round(area))})
    return out


# ---------- 2. 완공 후 시설 (OpenStreetMap) ----------

def osm_features():
    url = "https://api.openstreetmap.org/api/0.6/map?bbox={},{},{},{}".format(*BBOX)
    root = ET.parse(fetch(url, "osm.xml")).getroot()
    nodes = {n.get("id"): (float(n.get("lat")), float(n.get("lon"))) for n in root.iter("node")}
    feats = {k: [] for k in ("stream", "water", "wall", "building", "path", "road", "parking", "tree_row", "garden")}
    for w in root.iter("way"):
        t = {x.get("k"): x.get("v") for x in w.findall("tag")}
        pts = [to_m(*nodes[nd.get("ref")]) for nd in w.findall("nd") if nd.get("ref") in nodes]
        if len(pts) < 2:
            continue
        L = round(sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)))
        rec = {"id": int(w.get("id")), "pts": pts, "len": L}
        if t.get("waterway") in ("stream", "ditch", "river"):
            feats["stream"].append(rec)
        elif t.get("natural") == "water":
            feats["water"].append(rec)
        elif t.get("barrier") in ("wall", "retaining_wall"):
            feats["wall"].append(rec)
        elif "building" in t:
            area = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2
            rec["area"] = round(area)
            feats["building"].append(rec)
        elif t.get("highway") in ("footway", "path", "pedestrian", "steps", "track", "service"):
            feats["path"].append(rec)
        elif t.get("highway") in ("tertiary", "residential", "unclassified", "secondary"):
            rec["name"] = t.get("name", "")
            feats["road"].append(rec)
        elif t.get("amenity") == "parking":
            feats["parking"].append(rec)
        elif t.get("natural") == "tree_row":
            feats["tree_row"].append(rec)
        elif t.get("leisure") == "garden":
            feats["garden"].append(rec)
    return feats


# ---------- 3. 지형 ----------

def terrain():
    tpl = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
    img, x0, y0 = mosaic(tpl, 15, "dem")
    a = np.array(img).astype(np.float64)
    h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    h = cv2.GaussianBlur(h, (0, 0), 2.5)
    # 5m 격자로 재표본
    step = 5
    gx = np.arange(-340, 360 + step, step)
    gy = np.arange(540, -310 - step, -step)
    grid = np.zeros((len(gy), len(gx)))
    for j, ym in enumerate(gy):
        for i, xm in enumerate(gx):
            lat = LAT0 + ym / MY
            lon = LON0 + xm / MX
            tx, ty = tile_xy(lat, lon, 15)
            px, py = (tx - x0) * 256, (ty - y0) * 256
            grid[j, i] = cv2.getRectSubPix(h.astype(np.float32), (1, 1), (px, py))[0, 0]
    return {"x0": int(gx[0]), "y0": int(gy[0]), "step": step, "w": len(gx), "h": len(gy),
            "z": [[round(v, 1) for v in row] for row in grid]}


def contours(ter, interval=10):
    g = np.array(ter["z"], np.float32)
    out = []
    for level in range(int(g.min() // interval * interval) + interval, int(g.max()), interval):
        m = (g >= level).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for k in cs:
            if len(k) < 6:
                continue
            k = cv2.approxPolyDP(k, 0.8, False)[:, 0, :]
            pts = [(int(ter["x0"] + px * ter["step"]), int(ter["y0"] - py * ter["step"])) for px, py in k]
            out.append({"level": level, "pts": pts, "major": level % 50 == 0})
    return out


def sample(ter, x, y):
    i = (x - ter["x0"]) / ter["step"]
    j = (ter["y0"] - y) / ter["step"]
    i = min(max(i, 0), ter["w"] - 1.001)
    j = min(max(j, 0), ter["h"] - 1.001)
    i0, j0 = int(i), int(j)
    fi, fj = i - i0, j - j0
    z = ter["z"]
    return ((z[j0][i0] * (1 - fi) + z[j0][i0 + 1] * fi) * (1 - fj)
            + (z[j0 + 1][i0] * (1 - fi) + z[j0 + 1][i0 + 1] * fi) * fj)


def main():
    print("1/3 공사 전 필지 추출…")
    fields = fields_2016()
    print("2/3 OSM 시설…")
    osm = osm_features()
    print("3/3 지형…")
    ter = terrain()
    cons = contours(ter)

    # 핵심 대상 식별
    main_stream = max(osm["stream"], key=lambda r: r["len"] if r["len"] < 600 and r["pts"][0][0] < 100 else 0)
    seowon = min(osm["building"], key=lambda b: abs(b.get("area", 0) - 467) if b["pts"][0][0] < 0 else 1e9)
    prof = []
    acc = 0.0
    pts = main_stream["pts"]
    for i, p in enumerate(pts):
        if i:
            acc += math.dist(pts[i - 1], p)
        prof.append((round(acc, 1), round(sample(ter, *p), 1)))

    data = {
        "origin": {"lat": LAT0, "lon": LON0},
        "sources": [
            "메덩골정원 공식 홈페이지(좌표·공간 명칭)",
            "Esri World Imagery Wayback 2016-06-13 (공사 전 필지 추출)",
            "© OpenStreetMap contributors (2026 시설)",
            "AWS Terrain Tiles (지형)",
            "이로재 선곡서원 자료(배치·연못 위치)",
        ],
        "fields_2016": fields,
        "osm": osm,
        "terrain": ter,
        "contours": cons,
        "key": {
            "main_stream_id": main_stream["id"],
            "main_stream_len": main_stream["len"],
            "stream_profile": prof,
            "seowon_id": seowon["id"],
            "seowon_area": seowon.get("area"),
        },
    }
    json.dump(data, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    fa = sum(f["area"] for f in fields)
    print(f"필지 {len(fields)}개 · {fa:,}m² | 계류 {main_stream['len']}m (id {main_stream['id']}) "
          f"| 서원 추정 건물 {seowon.get('area')}m² (id {seowon['id']}) | 등고선 {len(cons)}개")
    print(f"계류 표고 {prof[0][1]}m → {prof[-1][1]}m")
    print(OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
