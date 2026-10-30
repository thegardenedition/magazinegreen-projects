import { useState } from 'react';
import { cropValid, levelFromLine, MIN_CROP, ratioOf, type Rect } from '../engine/develop';
import type { Point } from '../engine/mask';
import type { ViewState } from '../engine/renderer';
import { useGrade } from '../state/store';

interface Props {
  view: ViewState;
  dpr: number;
  /** 변형된 전체 프레임의 원본 해상도 기준 크기 */
  frameWidth: number;
  frameHeight: number;
  /** 화면 좌표 → 프레임 좌표(0–1) */
  toImage(clientX: number, clientY: number): Point;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
});

/** 형태 탭: 크롭 사각형(3분할 격자, 핸들)과 수평 기준선 도구 */
export function CropOverlay({ view, dpr, frameWidth, frameHeight, toImage }: Props) {
  const geometry = useGrade((s) => s.develop.geometry);
  const tool = useGrade((s) => s.viewerTool);
  const [line, setLine] = useState<[Point, Point] | null>(null);
  const crop = geometry.crop;
  const sx = (x: number) => (view.offsetX + x * frameWidth * view.scale) / dpr;
  const sy = (y: number) => (view.offsetY + y * frameHeight * view.scale) / dpr;
  const aspect = frameWidth / frameHeight;

  /** 시작 크롭에서 목표 크롭으로 가되, 원본 밖이 들어오기 직전까지만 간다 */
  const apply = (start: Rect, target: Rect) => {
    const s = useGrade.getState();
    const img = s.image;
    if (!img) return;
    const g = s.develop.geometry;
    const ok = (r: Rect) => cropValid(g, img.width, img.height, r);
    let rect = target;
    if (!ok(target)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (ok(lerpRect(start, target, mid))) lo = mid;
        else hi = mid;
      }
      rect = lerpRect(start, target, lo);
    }
    s.setCrop(rect);
  };

  const drag = (e: React.PointerEvent, onMove: (p: Point, p0: Point, start: Rect) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const p0 = toImage(e.clientX, e.clientY);
    const start = { ...useGrade.getState().develop.geometry.crop };
    const move = (ev: Event) => {
      const pe = ev as PointerEvent;
      onMove(toImage(pe.clientX, pe.clientY), p0, start);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onMoveRect = (p: Point, p0: Point, start: Rect) => {
    const x = Math.min(1 - start.w, Math.max(0, start.x + p.x - p0.x));
    const y = Math.min(1 - start.h, Math.max(0, start.y + p.y - p0.y));
    apply(start, { ...start, x, y });
  };

  const onResize = (h: Handle) => (p: Point, _p0: Point, start: Rect) => {
    const s = useGrade.getState();
    const img = s.image;
    if (!img) return;
    const g = s.develop.geometry;
    const ratio = ratioOf(g.aspect, g, img.width, img.height);
    const left = h.includes('w');
    const right = h.includes('e');
    const top = h.startsWith('n');
    const bottom = h.startsWith('s');
    let x0 = start.x;
    let y0 = start.y;
    let x1 = start.x + start.w;
    let y1 = start.y + start.h;
    if (ratio === null) {
      if (left) x0 = Math.min(x1 - MIN_CROP, clamp01(p.x));
      if (right) x1 = Math.max(x0 + MIN_CROP, clamp01(p.x));
      if (top) y0 = Math.min(y1 - MIN_CROP, clamp01(p.y));
      if (bottom) y1 = Math.max(y0 + MIN_CROP, clamp01(p.y));
      apply(start, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      return;
    }
    // 비율 고정: 맞은편 모서리를 고정하고, 끈 거리 중 큰 쪽에 맞춘다 (픽셀 비율 기준)
    const ax = left ? x1 : x0;
    const ay = top ? y1 : y0;
    const sxSign = left ? -1 : 1;
    const sySign = top ? -1 : 1;
    let wp = Math.max(Math.max(0, (p.x - ax) * sxSign) * aspect, Math.max(0, (p.y - ay) * sySign) * ratio);
    // 프레임 밖으로 나가지 않게
    const maxW = (sxSign > 0 ? 1 - ax : ax) * aspect;
    const maxH = (sySign > 0 ? 1 - ay : ay) * ratio;
    wp = Math.max(MIN_CROP * aspect, Math.min(wp, maxW, maxH));
    const w = wp / aspect;
    const hh = wp / ratio;
    apply(start, { x: sxSign > 0 ? ax : ax - w, y: sySign > 0 ? ay : ay - hh, w, h: hh });
  };

  const handles: Array<[Handle, number, number]> = [
    ['nw', crop.x, crop.y],
    ['n', crop.x + crop.w / 2, crop.y],
    ['ne', crop.x + crop.w, crop.y],
    ['e', crop.x + crop.w, crop.y + crop.h / 2],
    ['se', crop.x + crop.w, crop.y + crop.h],
    ['s', crop.x + crop.w / 2, crop.y + crop.h],
    ['sw', crop.x, crop.y + crop.h],
    ['w', crop.x, crop.y + crop.h / 2],
  ];
  const free = geometry.aspect === 'free';

  const X0 = sx(crop.x);
  const Y0 = sy(crop.y);
  const X1 = sx(crop.x + crop.w);
  const Y1 = sy(crop.y + crop.h);
  const F = [sx(0), sy(0), sx(1), sy(1)];

  const onLevelDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const p0 = toImage(e.clientX, e.clientY);
    setLine([p0, p0]);
    const move = (ev: Event) => {
      const pe = ev as PointerEvent;
      setLine([p0, toImage(pe.clientX, pe.clientY)]);
    };
    const up = (ev: Event) => {
      const pe = ev as PointerEvent;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setLine(null);
      const p1 = toImage(pe.clientX, pe.clientY);
      const dx = (p1.x - p0.x) * frameWidth;
      const dy = (p1.y - p0.y) * frameHeight;
      // 화면에서 너무 짧은 선은 무시
      if (Math.hypot(dx, dy) * (view.scale / dpr) < 12) return;
      const s = useGrade.getState();
      s.setGeometry({ straighten: levelFromLine(s.develop.geometry.straighten, dx, dy) });
      s.setViewerTool('none');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <svg className="crop-overlay" data-testid="crop-overlay">
      <path
        className="crop-shade"
        fillRule="evenodd"
        d={`M${F[0]},${F[1]}H${F[2]}V${F[3]}H${F[0]}Z M${X0},${Y0}H${X1}V${Y1}H${X0}Z`}
      />
      {[1, 2].map((i) => (
        <g key={i} className="crop-grid">
          <line x1={X0 + ((X1 - X0) * i) / 3} y1={Y0} x2={X0 + ((X1 - X0) * i) / 3} y2={Y1} />
          <line x1={X0} y1={Y0 + ((Y1 - Y0) * i) / 3} x2={X1} y2={Y0 + ((Y1 - Y0) * i) / 3} />
        </g>
      ))}
      <rect
        className="crop-rect"
        x={X0}
        y={Y0}
        width={Math.max(0, X1 - X0)}
        height={Math.max(0, Y1 - Y0)}
        onPointerDown={(e) => drag(e, onMoveRect)}
        data-testid="crop-rect"
      />
      {handles
        .filter(([h]) => free || h.length === 2)
        .map(([h, x, y]) => (
          <rect
            key={h}
            className={`crop-handle crop-${h}`}
            x={sx(x) - 6}
            y={sy(y) - 6}
            width={12}
            height={12}
            onPointerDown={(e) => drag(e, onResize(h))}
            data-testid={`crop-handle-${h}`}
          />
        ))}
      {tool === 'level' && (
        <rect className="level-catcher" x={0} y={0} width="100%" height="100%" onPointerDown={onLevelDown} data-testid="level-catcher" />
      )}
      {line && <line className="level-line" x1={sx(line[0].x)} y1={sy(line[0].y)} x2={sx(line[1].x)} y2={sy(line[1].y)} />}
    </svg>
  );
}
