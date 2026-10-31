import { useMemo, useRef, useState } from 'react';
import {
  CUSTOM_CURVES,
  evaluatorFor,
  HUE_CURVE_LABELS,
  HUE_CURVES,
  hueSwatch,
  isPeriodic,
  isSatAxis,
  SIX_VECTORS,
  type CurvePoint,
  type CustomCurveName,
  type HueCurveName,
} from '../engine/curves';
import { selectedNode, useGrade, type CurveName } from '../state/store';

const CHANNEL_COLOR: Record<CustomCurveName, string> = {
  y: '#d6d6d6',
  r: '#d08a80',
  g: '#93b48c',
  b: '#8aa2cc',
};

const MIN_GAP = 0.004;
/** 색상·휘도 커브에 점을 추가할 때 양옆에 함께 두는 고정점 간격 */
const ANCHOR = 0.08;

interface EditorProps {
  name: CurveName;
  width: number;
  height: number;
  color: string;
  /** 같은 판에 옅게 함께 그릴 다른 커브 */
  ghosts?: CustomCurveName[];
  background?: React.ReactNode;
  testId: string;
}

function curvePath(name: CurveName, pts: CurvePoint[], w: number, h: number) {
  const f = evaluatorFor(name, pts);
  const n = 160;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    const y = Math.min(1.05, Math.max(-0.05, f(x)));
    d += `${i ? 'L' : 'M'}${(x * w).toFixed(2)},${((1 - y) * h).toFixed(2)}`;
  }
  return d;
}

/** 점을 x 순으로 두고, 이웃 점과 겹치지 않게 x를 제한한다 */
function placePoint(pts: CurvePoint[], index: number, x: number, y: number, lockX: boolean): CurvePoint[] {
  const next = pts.map((p) => ({ ...p }));
  const lo = index > 0 ? next[index - 1].x + MIN_GAP : 0;
  const hi = index < next.length - 1 ? next[index + 1].x - MIN_GAP : 1;
  next[index] = {
    x: lockX ? next[index].x : Math.min(hi, Math.max(lo, x)),
    y: Math.min(1, Math.max(0, y)),
  };
  return next;
}

function CurveEditor({ name, width, height, color, ghosts = [], background, testId }: EditorProps) {
  const pts = useGrade((s) => selectedNode(s).curves[name]);
  const all = useGrade((s) => selectedNode(s).curves);
  const setCurve = useGrade((s) => s.setCurve);
  const svgRef = useRef<SVGSVGElement>(null);
  const periodic = isPeriodic(name);
  const isCustom = name.length === 1;
  const sorted = useMemo(() => [...pts].sort((a, b) => a.x - b.x), [pts]);
  const fixedEnds = isCustom;

  const toUnit = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  };

  const startDrag = (e: React.PointerEvent, index: number, list: CurvePoint[]) => {
    // 누른 요소에 캡처해야 점의 더블클릭이 그 점으로 전달된다
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const lockX = fixedEnds && (index === 0 || index === list.length - 1);
    let cur = list;
    const move = (ev: Event) => {
      const u = toUnit(ev as PointerEvent);
      cur = placePoint(cur, index, u.x, u.y, lockX);
      setCurve(name, cur);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x = Math.min(periodic ? 0.999 : 1, Math.max(0, toUnit(e).x));
    if (sorted.some((p) => Math.abs(p.x - x) < MIN_GAP)) return;
    // 누른 x의 커브 위에 점을 만들고 바로 끌 수 있게 한다 (누르는 순간 커브가 튀지 않도록)
    const f = evaluatorFor(name, sorted);
    const added: CurvePoint = { x, y: f(x) };
    const extra: CurvePoint[] = [];
    if (!isCustom) {
      // 색상·휘도 커브는 양옆에 고정점을 함께 두어, 고른 색 주변만 바뀌게 한다
      for (const dx of [-ANCHOR, ANCHOR]) {
        let ax = x + dx;
        if (periodic) ax -= Math.floor(ax);
        else if (ax < 0 || ax > 1) continue;
        if (sorted.every((p) => Math.abs(p.x - ax) > ANCHOR / 2)) extra.push({ x: ax, y: f(ax) });
      }
    }
    const list = [...sorted, added, ...extra].sort((a, b) => a.x - b.x);
    setCurve(name, list);
    startDrag(e, list.indexOf(added), list);
  };

  const removePoint = (index: number) => {
    if (fixedEnds && (index === 0 || index === sorted.length - 1)) return;
    setCurve(
      name,
      sorted.filter((_, i) => i !== index),
    );
  };

  const centerY = periodic || name === 'lumSat' ? height / 2 : null;

  return (
    <svg
      ref={svgRef}
      className="curve-editor"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={onBackgroundDown}
      data-testid={testId}
    >
      {background}
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={t}>
          <line x1={t * width} y1={0} x2={t * width} y2={height} className="grat faint" />
          <line x1={0} y1={t * height} x2={width} y2={t * height} className="grat faint" />
        </g>
      ))}
      {centerY !== null ? (
        <line x1={0} y1={centerY} x2={width} y2={centerY} className="grat" />
      ) : (
        <line x1={0} y1={height} x2={width} y2={0} className="grat faint" />
      )}
      {ghosts.map((g) => (
        <path key={g} d={curvePath(g, all[g], width, height)} stroke={CHANNEL_COLOR[g]} className="curve-ghost" />
      ))}
      <path d={curvePath(name, sorted, width, height)} stroke={color} className="curve-line" />
      {sorted.map((p, i) => (
        <circle
          key={i}
          cx={p.x * width}
          cy={(1 - p.y) * height}
          r={5}
          className="curve-point"
          stroke={color}
          data-testid={`${testId}-point`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            startDrag(e, i, sorted);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            removePoint(i);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            removePoint(i);
          }}
        />
      ))}
    </svg>
  );
}

/** 커브 배경: 색상축(무지개), 휘도축(회색 계조), 채도축(회색 → 진한 색) */
function hueGradient(id: string, axis: 'hue' | 'lum' | 'sat') {
  const stops = Array.from({ length: 25 }, (_, i) => i / 24);
  const lum = axis === 'lum';
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          {stops.map((t) => {
            const c = lum ? [t, t, t] : axis === 'sat' ? hueSwatch(0.08, t * 0.3, 0.5) : hueSwatch(t);
            return (
              <stop
                key={t}
                offset={t}
                stopColor={`rgb(${c.map((v) => Math.round(v * 255)).join(',')})`}
              />
            );
          })}
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} opacity={0.32} />
    </>
  );
}

export function CurvesPanel() {
  const [channel, setChannel] = useState<CustomCurveName>('y');
  const [hueCurve, setHueCurve] = useState<HueCurveName>('hueSat');
  const resetCurve = useGrade((s) => s.resetCurve);
  const setCurve = useGrade((s) => s.setCurve);

  const addSix = () => {
    const pts = selectedNode(useGrade.getState()).curves[hueCurve];
    const f = evaluatorFor(hueCurve, pts);
    const extra = SIX_VECTORS.map(([, x]) => ({ x, y: f(x) })).filter((p) =>
      pts.every((q) => Math.abs(q.x - p.x) > MIN_GAP),
    );
    setCurve(hueCurve, [...pts, ...extra].sort((a, b) => a.x - b.x));
  };

  return (
    <div className="curves">
      <div className="curve-block">
        <div className="curve-head">
          <span className="curve-title">Custom</span>
          {CUSTOM_CURVES.map((c) => (
            <button
              key={c}
              className={`chip ${c === channel ? 'on' : ''}`}
              style={{ color: CHANNEL_COLOR[c] }}
              onClick={() => setChannel(c)}
              data-testid={`curve-channel-${c}`}
            >
              {c.toUpperCase()}
            </button>
          ))}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={() => resetCurve(channel)}>
            리셋
          </button>
        </div>
        <CurveEditor
          name={channel}
          width={232}
          height={200}
          color={CHANNEL_COLOR[channel]}
          ghosts={CUSTOM_CURVES.filter((c) => c !== channel)}
          testId="curve-custom"
        />
      </div>
      <div className="curve-block">
        <div className="curve-head">
          {HUE_CURVES.map((c) => (
            <button
              key={c}
              className={`chip ${c === hueCurve ? 'on' : ''}`}
              onClick={() => setHueCurve(c)}
              data-testid={`curve-tab-${c}`}
            >
              {HUE_CURVE_LABELS[c]}
            </button>
          ))}
          <span className="spacer" />
          {isPeriodic(hueCurve) && (
            <button className="btn btn-ghost" onClick={addSix} title="빨강·노랑·초록·청록·파랑·마젠타 위치에 점 추가">
              6점
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => resetCurve(hueCurve)}>
            리셋
          </button>
        </div>
        <CurveEditor
          key={hueCurve}
          name={hueCurve}
          width={380}
          height={200}
          color="#d6d6d6"
          background={hueGradient(`grad-${hueCurve}`, hueCurve === 'lumSat' ? 'lum' : isSatAxis(hueCurve) ? 'sat' : 'hue')}
          testId="curve-hue"
        />
      </div>
      <p className="curves-help muted small">
        빈 곳을 눌러 점 추가 · 점 드래그 · 점 더블클릭/우클릭으로 삭제. 색상 커브는 가운데 선이 '변화 없음'입니다
        (Hue vs Hue ±60°, Sat ×0–2, Lum ±50%). Sat vs Sat·Sat vs Lum은 가로축이 채도(왼쪽 무채색 → 오른쪽 진한 색)입니다.
      </p>
    </div>
  );
}
