"""MODUL 플랜터 시스템 — 파라메트릭 3D 모델 (외부 라이브러리 없이 STL 생성)

python3 modul_model.py  →  stl/ 폴더에 부품별 STL을 씁니다.

설계 기준
- 단위 mm, 소재 PP, 벽 두께 2.2, 구배 1.8°(도면 값)
- 3개 화분은 '바닥을 맞춰 포개는' 중첩 조건(3.5mm 오프셋)에서 상단 외경을 역산했습니다.
- 원안 스택(섬프 28 + 공기층 20)으로는 소형 화분의 흙 깊이가 25mm밖에 남지 않습니다.
  연통관은 세 섬프의 수위를 같은 높이로 맞추므로 섬프 높이를 화분마다 다르게 둘 수 없어,
  세 화분 모두 섬프 22 / 공기층 14로 통일한 수정안을 적용했습니다 (리포트 F-04).
- 트레이는 화분 바닥이 20mm 들어앉는 포켓형(두께 30)으로 수정했습니다. 평판 트레이에
  모서리 주수구를 두면 물이 트레이 높이 위로 올라가지 못합니다 (리포트 F-01).
"""
import math, struct, os

WALL = 2.2
DRAFT = math.tan(math.radians(1.8))
OFFSET = 3.5          # 중첩 간극(반경)
SEG = 96              # 원주 분할 수

# 이름, 높이, 섬프 높이, 공기층
POTS = [("tall", 180, 22, 14), ("medium", 135, 22, 14), ("low", 90, 22, 14)]


def top_od():
    """대형 상단 외경 150에서 시작해, 바닥을 맞춰 포갤 때 3.5mm 간극이 남도록 다음 화분의 외경을 역산."""
    ods, od, prev_h = {}, 150.0, None
    for name, h, *_ in POTS:
        if prev_h is not None:
            inner_top = od - 2 * WALL                       # 바깥 화분 상단 내경
            inner_at = inner_top - 2 * (prev_h - h) * DRAFT  # 안쪽 화분 상단 높이에서의 내경
            od = inner_at - 2 * OFFSET
        ods[name] = round(od, 1)
        prev_h = h
    return ods


def r_at(od_top, h, z):
    return od_top / 2 - (h - z) * DRAFT


def lathe(profile):
    """(r, z) 닫힌 단면을 회전시켜 삼각형 목록을 만든다."""
    tris = []
    n = len(profile)
    for i in range(SEG):
        a0, a1 = 2 * math.pi * i / SEG, 2 * math.pi * (i + 1) / SEG
        for j in range(n):
            (r0, z0), (r1, z1) = profile[j], profile[(j + 1) % n]
            p = lambda r, z, a: (r * math.cos(a), r * math.sin(a), z)
            A, B, C, D = p(r0, z0, a0), p(r1, z1, a0), p(r1, z1, a1), p(r0, z0, a1)
            if r0 > 1e-6 or r1 > 1e-6:
                tris += [(A, B, C), (A, C, D)]
    return tris


def cup(r_bot, r_top, z0, z1, floor=2.5, open_bottom=False):
    """두께 WALL의 테이퍼 컵(또는 바닥 없는 링)."""
    if open_bottom:
        return [(r_bot, z0), (r_top, z1), (r_top - WALL, z1), (r_bot - WALL, z0)]
    return [(0, z0), (r_bot, z0), (r_top, z1), (r_top - WALL, z1),
            (r_bot - WALL, z0 + floor), (0, z0 + floor)]


def write_stl(path, tris):
    with open(path, "wb") as f:
        f.write(b"MODUL parametric".ljust(80, b" "))
        f.write(struct.pack("<I", len(tris)))
        for a, b, c in tris:
            f.write(struct.pack("<3f", 0, 0, 0))
            for v in (a, b, c):
                f.write(struct.pack("<3f", *v))
            f.write(b"\0\0")


def build(out="stl"):
    os.makedirs(out, exist_ok=True)
    ods = top_od()
    report = []
    for name, h, sump_h, gap in POTS:
        od = ods[name]
        rb, rt = r_at(od, h, 0), od / 2
        r_s = r_at(od, h, sump_h)
        parts = {
            "sump": cup(rb, r_s, 0, sump_h),
            "shell": cup(r_s, rt, sump_h, h, open_bottom=True),
            "basket": cup(r_s - WALL - 0.8, rt - WALL - 0.8, sump_h + gap, h - 2),
            # 세라믹 콘: 흙 속 넓은 입구 → 저수조 바닥 쪽으로 좁아짐 (속 찬 형상으로 단순화)
            "cone": [(0, 3), (0.11 * od, 3), (0.2 * od, sump_h + gap + 0.35 * (h - sump_h - gap)),
                     (0, sump_h + gap + 0.35 * (h - sump_h - gap))],
        }
        for part, prof in parts.items():
            write_stl(f"{out}/{name}_{part}.stl", lathe(prof))
        soil = h - 15 - (sump_h + gap + 2.5)
        sump_ml = math.pi * (rb - WALL) ** 2 * (sump_h - 2.5 - 4) / 1000
        report.append((name, h, od, round(soil), round(sump_ml)))
    # 도킹 트레이: 라운드 사각 슬래브 (내부 유로는 리포트 도면 참고)
    L = sum(ods.values()) + 12 * 4
    W = max(ods.values()) + 25
    tris = []
    x, y, t = L / 2, W / 2, 30
    v = [(-x, -y), (x, -y), (x, y), (-x, y)]
    for i in range(4):
        (ax, ay), (bx, by) = v[i], v[(i + 1) % 4]
        tris += [((ax, ay, 0), (bx, by, 0), (bx, by, t)), ((ax, ay, 0), (bx, by, t), (ax, ay, t))]
    tris += [((-x, -y, 0), (x, y, 0), (x, -y, 0)), ((-x, -y, 0), (-x, y, 0), (x, y, 0)),
             ((-x, -y, t), (x, -y, t), (x, y, t)), ((-x, -y, t), (x, y, t), (-x, y, t))]
    write_stl(f"{out}/dock_tray.stl", tris)
    print("pot      H    top OD  soil depth  sump ml")
    for r in report:
        print("%-7s %4d  %6.1f  %9d  %7d" % r)
    print("tray     %.0f x %.0f x 30 (pocket depth 20)" % (L, W))


if __name__ == "__main__":
    build(os.path.join(os.path.dirname(os.path.abspath(__file__)), "stl"))
