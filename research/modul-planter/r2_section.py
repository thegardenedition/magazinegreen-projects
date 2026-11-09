"""MODUL R2 단면 A-A (대형, 도킹 상태) — modul_model.py와 같은 파라미터로 SVG 도면을 그린다.
python3 r2_section.py → modul-r2-section.svg"""
import math
from modul_model import WALL, DRAFT

H, OD, SUMP, GAP = 180, 150.0, 22, 14
TRAY, POCKET, FLOOR = 30, 20, 2.5          # 트레이 두께, 포켓 깊이, 섬프 바닥 두께
Z0 = TRAY - POCKET                          # 화분이 앉는 높이(절대)
WMAX = 16                                   # 만수(플로트 FULL). 물리적 상한은 트레이 윗면 30 = 섬프 상단보다 2mm 낮음
S = 3.0                                     # px/mm
CX, BASE = 490, 700                         # 화분 중심 x, 트레이 바닥 y (px)

def X(x): return CX + x * S
def Y(z): return BASE - z * S
def r(z): return OD / 2 - (H - (z - Z0)) * DRAFT   # 절대 높이 z에서 외곽 반경
def poly(pts, cls): return '<polygon class="%s" points="%s"/>' % (cls, " ".join("%.1f,%.1f" % (X(a), Y(b)) for a, b in pts))
def both(pts, cls): return poly(pts, cls) + poly([(-a, b) for a, b in pts], cls)
def line(x1, z1, x2, z2, cls): return '<line class="%s" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>' % (cls, X(x1), Y(z1), X(x2), Y(z2))
def text(x, z, s, cls="t", anchor="start"): return '<text class="%s" x="%.1f" y="%.1f" text-anchor="%s">%s</text>' % (cls, X(x), Y(z), anchor, s)

def vdim(x, z1, z2, label, side=1):
    o = [line(x, z1, x, z2, "dim"), line(x - 2, z1, x + 2, z1, "dim"), line(x - 2, z2, x + 2, z2, "dim")]
    o.append(text(x + side * 3, (z1 + z2) / 2 - 1.2, label, "d", "start" if side > 0 else "end"))
    return o

def hdim(z, x1, x2, label):
    return [line(x1, z, x2, z, "dim"), line(x1, z - 2, x1, z + 2, "dim"), line(x2, z - 2, x2, z + 2, "dim"),
            text((x1 + x2) / 2, z + 2, label, "d", "middle")]

g = []
zs, zb, zsoil, ztop = Z0 + SUMP, Z0 + SUMP + GAP, Z0 + H - 15, Z0 + H
# 탱크 트레이: 포켓은 마른 상태, 포켓 둘레의 트레이 몸통이 섬프와 같은 높이의 저수조.
pr = r(Z0) + 1.5
pw = pr + WALL
XL, XR, SK = -118, 95, TRAY - WALL                         # 트레이 좌우 끝, 상판 하면
g.append(poly([(XL, 0), (XR, 0), (XR, Z0), (XL, Z0)], "cut"))                              # 받침(유로층)
for sx, xe in ((-1, XL), (1, XR)):
    g.append(poly([(xe, Z0), (xe - sx * WALL, Z0), (xe - sx * WALL, SK), (xe, SK)], "cut"))  # 외벽
    g.append(poly([(sx * pr, Z0), (sx * pw, Z0), (sx * pw, SK), (sx * pr, SK)], "cut"))      # 포켓 벽
    g.append(poly([(xe, SK), (sx * pr, SK), (sx * pr, TRAY), (xe, TRAY)], "cut"))            # 상판
    g.append(poly([(xe - sx * WALL, Z0), (sx * pw, Z0), (sx * pw, Z0 + WMAX), (xe - sx * WALL, Z0 + WMAX)], "water"))
g.append(poly([(-pw - 9, 4), (6, 4), (6, 8), (-pw - 9, 8)], "water"))                      # 탱크 → 포켓 중심 유로
g.append(poly([(-pw - 9, 8), (-pw - 4, 8), (-pw - 4, Z0), (-pw - 9, Z0)], "water"))
g.append(poly([(-4, 8), (4, 8), (4, Z0 + FLOOR), (-4, Z0 + FLOOR)], "water"))               # 포펫 통로
g.append(poly([(-1.5, Z0 - 1), (1.5, Z0 - 1), (1.5, Z0 + 3.5), (-1.5, Z0 + 3.5)], "pin"))   # 트위스트 핀
# 주수 넥 + 황동 플로트 (가득 찼을 때 4mm 솟음)
for xa in (-113, -96):
    g.append(poly([(xa, Z0 + 8), (xa + 1.6, Z0 + 8), (xa + 1.6, TRAY), (xa, TRAY)], "cut"))
g.append(poly([(-111.4, Z0 + 8), (-96, Z0 + 8), (-96, Z0 + WMAX), (-111.4, Z0 + WMAX)], "water"))
g.append(poly([(-109.5, Z0 + WMAX - 4), (-98, Z0 + WMAX - 4), (-98, TRAY + 4), (-109.5, TRAY + 4)], "brass"))
g.append(poly([(XR - WALL, Z0 + 4), (XR + 4, Z0 + 4), (XR + 4, Z0 + 10), (XR - WALL, Z0 + 10)], "water"))  # 링크 포트
# 섬프, 쉘, 바스켓
g.append(both([(r(Z0), Z0), (r(zs), zs), (r(zs) - WALL, zs), (r(Z0) - WALL, Z0 + FLOOR), (6, Z0 + FLOOR), (6, Z0)], "cut"))
g.append(poly([(-(r(Z0) - WALL), Z0 + FLOOR), (r(Z0) - WALL, Z0 + FLOOR), (r(Z0 + WMAX) - WALL, Z0 + WMAX), (-(r(Z0 + WMAX) - WALL), Z0 + WMAX)], "water"))
g.append(both([(r(zs) + .4, zs), (r(ztop), ztop), (r(ztop) - WALL, ztop), (r(zs) - WALL + .4, zs)], "cut2"))
rb = r(zs) - WALL - .8
g.append(both([(rb, zb), (rb + (ztop - 2 - zb) * DRAFT, ztop - 2), (rb + (ztop - 2 - zb) * DRAFT - 1.6, ztop - 2), (rb - 1.6, zb + 1.6), (24, zb + 1.6), (24, zb)], "cut3"))
g.append(poly([(-(rb - 1.6), zb + 1.6), (rb - 1.6, zb + 1.6), (rb - 1.6 + (zsoil - zb) * DRAFT, zsoil), (-(rb - 1.6 + (zsoil - zb) * DRAFT), zsoil)], "soil"))
# 통풍구: 바스켓 측벽 상단(흙면 위)과 쉘 림 아래
for zz in (zsoil + 3, zsoil + 8):
    for sx in (-1, 1):
        g.append('<rect class="vent" x="%.1f" y="%.1f" width="%.1f" height="%.1f"/>' % (X(sx * (rb + 4) - (1.6 * S if sx > 0 else 0) / S), Y(zz + 1.5), 2.2 * S, 3 * S))
# 세라믹 콘 + 필터 링
ch = zb + 0.35 * (H - SUMP - GAP)
g.append(poly([(-.11 * OD, Z0 + 5), (.11 * OD, Z0 + 5), (.2 * OD, ch), (-.2 * OD, ch)], "cone"))
g.append(poly([(-25, zb), (25, zb), (25, zb + 3), (-25, zb + 3)], "felt"))
# 수위선: 정상 만수(플로트 기준)와 물리적 상한(트레이 윗면)
g.append(line(XL, Z0 + WMAX, XR, Z0 + WMAX, "wl"))
g.append(line(-pr, TRAY, pr, TRAY, "cap"))
g.append(text(-120, TRAY + 9, "▽ 만수 %d · 상한 %d" % (Z0 + WMAX, TRAY), "wlt"))
g.append(text(0, -7, "트위스트 핀 · 화분을 30° 돌리면 핀이 비켜나 밸브가 닫힌다", "n", "middle"))
g.append(text(XR + 6, Z0 + 12, "링크 포트", "d"))
# 치수
for o in (vdim(-128, Z0, zs, "섬프 22", -1) + vdim(-128, zs, zb, "공기층 14", -1) + vdim(-128, zb, zsoil, "흙 126", -1) +
          vdim(-128, zsoil, ztop, "여유 15", -1) + vdim(128, 0, TRAY, "트레이 30") + vdim(152, Z0, TRAY, "포켓 20") +
          vdim(42, Z0 + FLOOR, Z0 + WMAX, "수위 13.5") + hdim(ztop + 10, -OD / 2, OD / 2, "Ø150 (상단 외경)") +
          hdim(-14, -pr, pr, "포켓 Ø%.1f" % (2 * pr))):
    g.append(o)
# 주석
notes = [(-128, -22, "① 탱크 트레이: 포켓 둘레의 트레이 몸통이 섬프와 같은 높이의 저수조. 사용 가능 수량 약 0.94L", "n"),
         (-128, -28, "② 아무리 부어도 물은 트레이 윗면(30) 위로 못 오른다. 섬프 상단(32)보다 낮아 흙이 잠기지 않는다", "n"),
         (-128, -34, "③ 황동 플로트가 넥 위로 솟은 높이가 남은 물. 평평해지면 급수", "n"),
         (-128, -40, "④ 통풍구는 흙면 위 바스켓 측벽과 쉘 림 아래 · 콘은 공극률 3단 카트리지", "n")]
for x, z, s, c in notes: g.append(text(x, z, s, c))
g.append(text(86, zb + 40, "다공성 세라믹 콘", "n"))
g.append(text(86, zb + 34, "+ 부직포 필터 링", "n"))

css = """
.cut{fill:url(#h1);stroke:#14201c;stroke-width:1.2}.cut2{fill:url(#h2);stroke:#2b3fa8;stroke-width:1.2}
.cut3{fill:#55605b;stroke:#14201c;stroke-width:.8}.water{fill:#4f9fd6;fill-opacity:.45;stroke:#2c78b0;stroke-width:.8}
.soil{fill:#6b4a35;fill-opacity:.18;stroke:none}.cone{fill:#e6dfd0;stroke:#7a7062;stroke-width:1}.felt{fill:#b9b39f;stroke:#7a7062;stroke-width:.6}
.brass{fill:#b08a3e;stroke:#6d5420}.vent{fill:#fff;stroke:#14201c;stroke-width:.8}.dial{fill:#fff;stroke:#14201c;stroke-width:1.2}
.pin{fill:#14201c}.cap{stroke:#b3261e;stroke-width:1.2;stroke-dasharray:3 3}.dim{stroke:#5b6b65;stroke-width:.8}.wl{stroke:#2c78b0;stroke-width:1.2;stroke-dasharray:8 4}
text{font-family:'IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;fill:#14201c}
.d{font-size:12px;fill:#3d4a45}.n{font-size:12.5px}.wlt{font-size:12px;fill:#2c78b0}.ttl{font-size:17px;font-weight:600}.tb{font-size:11px;fill:#5b6b65}
"""
defs = ('<defs><pattern id="h1" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#d7dcda"/><line x1="0" y1="0" x2="0" y2="6" stroke="#14201c" stroke-width=".7"/></pattern>'
        '<pattern id="h2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="5" fill="#dfe3f5"/><line x1="0" y1="0" x2="0" y2="5" stroke="#2b3fa8" stroke-width=".7"/></pattern></defs>')
W, Hh = 1010, 860
head = ['<text class="ttl" x="24" y="34">MODUL R2 · 단면 A-A · 대형 (도킹 상태) · 탱크 트레이</text>',
        '<text class="tb" x="24" y="54">단위 mm · 축척 3:1(화면) · PP 2.2t · 구배 1.8° · 일반공차 ISO 2768-m · 소스 modul_model.py / r2_section.py</text>']
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" aria-label="MODUL R2 대형 화분 도킹 단면도">' % (W, Hh)
       + '<style>' + css + '</style>' + defs + '<rect width="100%" height="100%" fill="#f8faf9"/>' + "".join(head) + "".join(g) + '</svg>')
open("modul-r2-section.svg", "w").write(svg)
print("ok", len(svg))
