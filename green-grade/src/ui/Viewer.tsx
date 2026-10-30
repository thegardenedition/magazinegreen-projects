import { useCallback, useEffect, useRef, useState } from 'react';
import { toUniforms, type PrimaryParams } from '../engine/color';
import { bakeCurves, type CurvesParams } from '../engine/curves';
import { parseCube } from '../engine/lut';
import { Renderer, setActiveRenderer, type ViewState } from '../engine/renderer';
import { currentUniforms, useGrade } from '../state/store';

const MIN_SCALE = 0.01;
const MAX_SCALE = 16;

export interface TestNode {
  primary: PrimaryParams;
  curves?: CurvesParams;
  enabled?: boolean;
  cube?: string;
  lutIntensity?: number;
}

declare global {
  interface Window {
    /** 테스트용 훅: GPU 셰이더로 픽셀을 처리해 결과를 돌려준다 */
    __GG__?: {
      gradePixels(
        data: number[],
        width: number,
        height: number,
        primary: PrimaryParams,
        dither: boolean,
        curves?: CurvesParams,
      ): number[];
      /** 노드 체인 처리. LUT는 .cube 텍스트로 넘긴다. */
      gradeNodes(data: number[], width: number, height: number, nodes: TestNode[], dither: boolean): number[];
    };
  }
}

export function Viewer({ onOpen }: { onOpen: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const viewRef = useRef<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const frameRef = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const image = useGrade((s) => s.image);
  const split = useGrade((s) => s.split);
  const splitPos = useGrade((s) => s.splitPos);
  const bypass = useGrade((s) => s.bypass);

  const draw = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const r = rendererRef.current;
      if (!r) return;
      const s = useGrade.getState();
      r.drawViewer(currentUniforms(s), {
        view: viewRef.current,
        imageWidth: s.image?.width ?? 1,
        imageHeight: s.image?.height ?? 1,
        split: s.split ? s.splitPos * r.canvas.width : -1,
        bypass: s.bypass,
        dither: true,
      });
    });
  }, []);

  const setView = useCallback(
    (v: ViewState) => {
      viewRef.current = v;
      setZoom(v.scale);
      draw();
    },
    [draw],
  );

  const fit = useCallback(() => {
    const c = canvasRef.current;
    const img = useGrade.getState().image;
    if (!c || !img) return;
    const scale = Math.min(c.width / img.width, c.height / img.height) * 0.96;
    setView({
      scale,
      offsetX: (c.width - img.width * scale) / 2,
      offsetY: (c.height - img.height * scale) / 2,
    });
  }, [setView]);

  const zoomAt = useCallback(
    (next: number, cx: number, cy: number) => {
      const v = viewRef.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      const ix = (cx - v.offsetX) / v.scale;
      const iy = (cy - v.offsetY) / v.scale;
      setView({ scale, offsetX: cx - ix * scale, offsetY: cy - iy * scale });
    },
    [setView],
  );

  // WebGL 초기화
  useEffect(() => {
    const canvas = canvasRef.current!;
    try {
      const r = new Renderer(canvas);
      rendererRef.current = r;
      setActiveRenderer(r);
      window.__GG__ = {
        gradePixels(data, width, height, primary, dither, curves) {
          const u = toUniforms(primary, { curves: curves ? bakeCurves(curves) : undefined });
          const out = r.renderFull({ data: new Uint8Array(data), width, height }, [u], { dither });
          draw();
          return Array.from(out);
        },
        gradeNodes(data, width, height, nodes, dither) {
          const chain = nodes.map((n) =>
            toUniforms(n.primary, {
              enabled: n.enabled ?? true,
              curves: n.curves ? bakeCurves(n.curves) : undefined,
              lut: n.cube ? { lut: parseCube(n.cube), intensity: n.lutIntensity ?? 1 } : null,
            }),
          );
          const out = r.renderFull({ data: new Uint8Array(data), width, height }, chain, { dither });
          draw();
          return Array.from(out);
        },
      };
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
      setActiveRenderer(null);
      rendererRef.current = null;
      delete window.__GG__;
    };
  }, [draw]);

  // 캔버스 크기를 컨테이너(물리 픽셀)에 맞춘다
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      const v = viewRef.current;
      // 화면 중심을 유지하며 크기 변경
      const dx = (w - canvas.width) / 2;
      const dy = (h - canvas.height) / 2;
      canvas.width = w;
      canvas.height = h;
      viewRef.current = { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy };
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // 새 이미지 → 프록시 텍스처 교체 후 화면 맞춤
  useEffect(() => {
    rendererRef.current?.setPreview(image?.proxy ?? null);
    if (image) fit();
    else draw();
  }, [image, fit, draw]);

  // 보정값이 바뀔 때마다 다시 그림
  useEffect(() => useGrade.subscribe(draw), [draw]);

  // 확대 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input:not([type=range]), textarea')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = canvasRef.current;
      if (!c) return;
      if (e.key === 'f' || e.key === 'F') fit();
      else if (e.key === '1') zoomAt(1, c.width / 2, c.height / 2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit, zoomAt]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return [(e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr] as const;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!image) return;
    const [x, y] = toCanvas(e);
    zoomAt(viewRef.current.scale * Math.exp(-e.deltaY * 0.0015), x, y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image || e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = toCanvas(e);
    const v0 = viewRef.current;
    const move = (ev: PointerEvent) => {
      const p = toCanvas(ev);
      setView({ ...v0, offsetX: v0.offsetX + p[0] - start[0], offsetY: v0.offsetY + p[1] - start[1] });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onSplitDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = wrapRef.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => useGrade.getState().setSplitPos((ev.clientX - rect.left) / rect.width);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div className="viewer" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        data-testid="viewer-canvas"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onDoubleClick={fit}
      />
      {error && <div className="viewer-empty">{error}</div>}
      {!image && !error && (
        <div className="viewer-empty">
          <p>사진을 끌어다 놓거나</p>
          <button className="btn btn-primary" onClick={onOpen}>
            사진 열기
          </button>
          <p className="muted">JPG · PNG · WebP — 사진은 이 브라우저 밖으로 전송되지 않습니다</p>
        </div>
      )}
      {image && split && (
        <div className="split-line" style={{ left: `${splitPos * 100}%` }} onPointerDown={onSplitDown}>
          <span className="split-tag split-tag-l">BEFORE</span>
          <span className="split-tag split-tag-r">AFTER</span>
        </div>
      )}
      {image && bypass && <div className="viewer-badge">원본 보기 (B)</div>}
      {image && (
        <div className="viewer-hud">
          <button className="btn btn-ghost" onClick={fit} title="화면 맞춤 (F)">
            맞춤
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const c = canvasRef.current!;
              zoomAt(1, c.width / 2, c.height / 2);
            }}
            title="원본 크기 (1)"
          >
            100%
          </button>
          <span className="mono">{Math.round(zoom * 100)}%</span>
        </div>
      )}
    </div>
  );
}
