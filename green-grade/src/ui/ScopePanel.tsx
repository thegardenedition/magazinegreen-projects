import { useCallback, useEffect, useRef, useState } from 'react';
import { outputSize, planDevelop } from '../engine/develop';
import { ANALYSIS_WIDTH, ScopeRenderer, type ScopeMode, type ScopeStats } from '../engine/scopes';
import { baseFor } from '../state/display';
import { currentUniforms, useGrade } from '../state/store';

const TABS: Array<[ScopeMode, string]> = [
  ['waveform', 'Waveform'],
  ['parade', 'Parade'],
  ['vectorscope', 'Vector'],
  ['histogram', 'Histogram'],
];

/** 클리핑 경고를 띄우는 기준 (픽셀 비율) */
const CLIP_WARN = 0.001;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = { left: 30, right: 8, top: 8, bottom: 8 };

function plotRect(mode: ScopeMode, w: number, h: number): Rect {
  const iw = Math.max(1, w - PAD.left - PAD.right);
  const ih = Math.max(1, h - PAD.top - PAD.bottom);
  if (mode === 'vectorscope') {
    const s = Math.min(w - 16, h - 16);
    return { x: (w - s) / 2, y: (h - s) / 2, w: s, h: s };
  }
  return { x: PAD.left, y: PAD.top, w: iw, h: ih };
}

// 벡터스코프 75% 컬러바 목표점
const TARGETS: Array<[string, [number, number, number]]> = [
  ['R', [0.75, 0, 0]],
  ['Yl', [0.75, 0.75, 0]],
  ['G', [0, 0.75, 0]],
  ['Cy', [0, 0.75, 0.75]],
  ['B', [0, 0, 0.75]],
  ['Mg', [0.75, 0, 0.75]],
];
const cbcr = ([r, g, b]: [number, number, number]) => {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [(b - y) / 1.8556, (r - y) / 1.5748];
};
/** 스킨톤 라인: Cb 축에서 반시계 방향 약 123° */
const SKIN_ANGLE = (123 * Math.PI) / 180;

function Graticule({ mode, r }: { mode: ScopeMode; r: Rect }) {
  if (mode === 'vectorscope') {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const toXY = (cb: number, cr: number) => [cx + cb * r.w, cy - cr * r.h];
    return (
      <g>
        <circle cx={cx} cy={cy} r={r.w / 2} className="grat" />
        <circle cx={cx} cy={cy} r={r.w / 4} className="grat faint" />
        <line x1={r.x} y1={cy} x2={r.x + r.w} y2={cy} className="grat faint" />
        <line x1={cx} y1={r.y} x2={cx} y2={r.y + r.h} className="grat faint" />
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(SKIN_ANGLE) * (r.w / 2)}
          y2={cy - Math.sin(SKIN_ANGLE) * (r.h / 2)}
          className="grat skin"
        />
        {TARGETS.map(([name, rgb]) => {
          const [x, y] = toXY(...(cbcr(rgb) as [number, number]));
          return (
            <g key={name}>
              <rect x={x - 5} y={y - 5} width={10} height={10} className="grat" />
              <text x={x + 8} y={y + 3} className="grat-label">
                {name}
              </text>
            </g>
          );
        })}
      </g>
    );
  }
  if (mode === 'histogram') {
    return (
      <g>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={r.x + t * r.w} y1={r.y} x2={r.x + t * r.w} y2={r.y + r.h} className="grat faint" />
        ))}
      </g>
    );
  }
  const panes = mode === 'parade' ? 3 : 1;
  return (
    <g>
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((ire) => {
        const y = r.y + r.h * (1 - ire / 100);
        const major = ire % 50 === 0;
        return (
          <g key={ire}>
            <line x1={r.x} y1={y} x2={r.x + r.w} y2={y} className={`grat ${major ? '' : 'faint'}`} />
            {ire % 20 === 0 || ire === 100 ? (
              <text x={r.x - 4} y={y + 3} textAnchor="end" className="grat-label">
                {ire}
              </text>
            ) : null}
          </g>
        );
      })}
      {Array.from({ length: panes - 1 }, (_, i) => (
        <line
          key={i}
          x1={r.x + ((i + 1) * r.w) / 3}
          y1={r.y}
          x2={r.x + ((i + 1) * r.w) / 3}
          y2={r.y + r.h}
          className="grat"
        />
      ))}
    </g>
  );
}

export function ScopePanel() {
  const [mode, setMode] = useState<ScopeMode>('waveform');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [stats, setStats] = useState<ScopeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ScopeRenderer | null>(null);
  const modeRef = useRef(mode);
  const frame = useRef(0);
  const image = useGrade((s) => s.image);

  const draw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = rendererRef.current;
      const c = canvasRef.current;
      if (!r || !c) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = c.width / dpr;
      const cssH = c.height / dpr;
      const pr = plotRect(modeRef.current, cssW, cssH);
      // GL 좌표는 아래가 0
      const glRect = { x: pr.x * dpr, y: (cssH - pr.y - pr.h) * dpr, w: pr.w * dpr, h: pr.h * dpr };
      const s = r.draw(currentUniforms(), modeRef.current, glRect);
      setStats((prev) =>
        prev && s && prev.highlightClip === s.highlightClip && prev.shadowClip === s.shadowClip ? prev : s,
      );
    });
  }, []);

  useEffect(() => {
    try {
      rendererRef.current = new ScopeRenderer(canvasRef.current!);
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const body = bodyRef.current!;
    const c = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(body.clientWidth * dpr));
      c.height = Math.max(1, Math.round(body.clientHeight * dpr));
      setSize({ w: body.clientWidth, h: body.clientHeight });
      draw();
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, [draw]);

  // 형태·디테일을 반영한 분석 원본 (크롭 결과를 분석 해상도로)
  const develop = useCallback(() => {
    const r = rendererRef.current;
    const s = useGrade.getState();
    const img = s.image;
    if (!r || !img) return;
    const g = s.develop.geometry;
    const [cw, ch] = outputSize(g, img.width, img.height);
    const scale = Math.min(img.proxy.width / img.width, ANALYSIS_WIDTH / cw, ANALYSIS_WIDTH / ch);
    const plan = planDevelop(s.develop, img.width, img.height, scale);
    try {
      r.setDevelop({ plan, base: plan.needsBase ? baseFor(img.baseSource, g, img.width, img.height, g.crop) : null }, img.proxy);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    rendererRef.current?.setImage(image?.proxy ?? null);
    if (!image) setStats(null);
    develop();
    draw();
  }, [image, draw, develop]);

  useEffect(() => {
    modeRef.current = mode;
    draw();
  }, [mode, draw]);

  // 보정값이 바뀌면 다시 계산
  useEffect(
    () =>
      useGrade.subscribe((s, p) => {
        if (s.develop !== p.develop) develop();
        if (s.nodes !== p.nodes || s.develop !== p.develop) draw();
      }),
    [draw, develop],
  );

  const rect = plotRect(mode, size.w, size.h);
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;

  return (
    <section className="panel panel-scope">
      <header className="tabs">
        {TABS.map(([m, label]) => (
          <button
            key={m}
            className={`tab ${m === mode ? 'on' : ''}`}
            onClick={() => setMode(m)}
            data-testid={`scope-tab-${m}`}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="scope-body" ref={bodyRef}>
        <canvas ref={canvasRef} className="scope-canvas" data-testid="scope-canvas" />
        <svg className="scope-overlay" width={size.w} height={size.h}>
          {image && <Graticule mode={mode} r={rect} />}
        </svg>
        {!image && <div className="scope-empty muted small">사진을 열면 스코프가 표시됩니다</div>}
        {error && <div className="scope-empty error small">{error}</div>}
      </div>
      <footer className="scope-foot mono" data-testid="clip-stats">
        {stats ? (
          <>
            <span className={stats.highlightClip > CLIP_WARN ? 'clip-warn' : ''} data-testid="clip-high">
              ▲ 하이라이트 클리핑 {pct(stats.highlightClip)}
            </span>
            <span className={stats.shadowClip > CLIP_WARN ? 'clip-warn' : ''} data-testid="clip-low">
              ▼ 섀도 클리핑 {pct(stats.shadowClip)}
            </span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </footer>
    </section>
  );
}
