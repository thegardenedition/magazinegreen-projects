#!/usr/bin/env python3
"""영상 납품 전 자동 점검 (video-motion 스킬 7장).

사용: python3 qa_video.py <video.mp4> [출력폴더]
출력: PASS/WARN/FAIL 목록 + <출력폴더>/first.png, contact.png, cuts.png
이 스크립트는 '측정'만 한다. contact.png 는 반드시 눈으로 본다(가독성·겹침·서체·안전 영역).
FAIL 이 하나라도 있으면 종료 코드 1.
"""
import json
import re
import subprocess
import sys
from pathlib import Path


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.parent / "qa"
    out.mkdir(parents=True, exist_ok=True)
    results = []

    def say(level, msg):
        results.append(level)
        print(f"{level:<5} {msg}")

    # 1. 스트림 정보
    probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(src)]).stdout)
    v = next(s for s in probe["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in probe["streams"])
    num, den = (int(x) for x in v["r_frame_rate"].split("/"))
    fps = num / den
    dur = float(probe["format"]["duration"])
    w, h = v["width"], v["height"]
    say("INFO", f"{w}x{h} {fps:g}fps {v.get('nb_frames', '?')}f {dur:.2f}s {v['pix_fmt']} range={v.get('color_range', '?')} {v['codec_name']}")
    say("PASS" if v["pix_fmt"] == "yuv420p" else "FAIL", f"pix_fmt {v['pix_fmt']}" + ("" if v["pix_fmt"] == "yuv420p" else " → yuv420p 로 변환(SKILL.md 7-4)"))
    say("PASS" if v.get("color_range") == "tv" else "WARN", f"color_range {v.get('color_range', '미표기')}" + ("" if v.get("color_range") == "tv" else " → tv 범위 권장"))
    say("PASS" if (w, h) == (1080, 1920) else "INFO", "9:16 1080x1920" if (w, h) == (1080, 1920) else f"9:16 아님 ({w}x{h})")
    trace = run(["ffprobe", "-v", "trace", str(src)]).stderr
    m = re.search(r"type:'(moov|mdat)'", trace)
    say("PASS" if m and m.group(1) == "moov" else "WARN", "faststart (moov 가 앞)" if m and m.group(1) == "moov" else "faststart 아님 → -movflags +faststart")

    # 2. 첫 프레임(썸네일)이 비어 있는가: 회색조 표준편차
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-frames:v", "1", "-vf", "scale=360:-1", str(out / "first.png")])
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-frames:v", "1", "-vf", "scale=180:320,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
    if raw:
        mean = sum(raw) / len(raw)
        std = (sum((b - mean) ** 2 for b in raw) / len(raw)) ** 0.5
        say("PASS" if std >= 12 else "WARN", f"첫 프레임 명암 편차 {std:.1f}" + ("" if std >= 12 else " — 거의 빈 화면(썸네일로 쓰인다)"))

    # 3. 접촉 인화(1.5초 간격) + 장면 전환 프레임
    step = max(1, round(fps * 1.5))
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", f"select='not(mod(n\\,{step}))',scale=216:-1,tile=8x4", "-frames:v", "1", str(out / "contact.png")])
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "select='gt(scene\\,0.25)',scale=216:-1,tile=8x3", "-frames:v", "1", str(out / "cuts.png")])
    say("INFO", f"접촉 인화 {out / 'contact.png'} · 전환 {out / 'cuts.png'} — 직접 볼 것")

    # 4. 블랙·정지 구간
    log = run(["ffmpeg", "-v", "info", "-i", str(src), "-vf", "blackdetect=d=0.1:pix_th=0.10,freezedetect=n=-60dB:d=2.5", "-an", "-f", "null", "-"]).stderr
    blacks = re.findall(r"black_start:([\d.]+)", log)
    freezes = re.findall(r"freeze_start: ([\d.]+)", log)
    freeze_ends = re.findall(r"freeze_end: ([\d.]+)", log)
    say("PASS" if not blacks else "WARN", "블랙 구간 없음" if not blacks else f"블랙 구간 시작 {', '.join(blacks)}s — 의도인지 확인")
    tail_ok = [s for s in freezes if float(s) >= dur - 4.0]  # 마지막 4초(엔드 카드) 정지는 허용
    mid = [s for s in freezes if s not in tail_ok]
    if mid:
        spans = [f"{s}~{e}s" for s, e in zip(freezes, freeze_ends + ['끝'] * len(freezes)) if s in mid]
        say("WARN", f"2.5초 이상 정지 {', '.join(spans)} — 살아 있는 것 하나(느린 확대·그레인) 또는 다음 정보")
    else:
        say("PASS", "본문에 2.5초 이상 정지 없음" + (" (엔드 카드 정지는 허용)" if tail_ok else ""))

    # 5. 오디오
    if has_audio:
        log = run(["ffmpeg", "-v", "info", "-i", str(src), "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
        i_m = re.findall(r"I:\s+(-?[\d.]+) LUFS", log)
        tp_m = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", log)
        if i_m:
            lufs = float(i_m[-1])
            say("PASS" if -16 <= lufs <= -12 else "WARN", f"라우드니스 {lufs} LUFS (목표 -14±2)")
        if tp_m:
            tp = float(tp_m[-1])
            say("PASS" if tp <= -1.0 else "FAIL", f"트루피크 {tp} dBTP (≤ -1)")
    else:
        say("INFO", "오디오 트랙 없음 — 무음 납품이면 정상")

    sys.exit(1 if "FAIL" in results else 0)


if __name__ == "__main__":
    main()
