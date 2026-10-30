import { useCallback, useEffect, useRef, useState } from 'react';
import { toUniforms, type PrimaryParams } from '../engine/color';
import { bakeCurves, type CurvesParams } from '../engine/curves';
import { computeBase, planDevelop, type Develop } from '../engine/develop';
import { parseCube } from '../engine/lut';
import { maskUniform, type Point, type Qualifier, type WindowParams } from '../engine/mask';
import { IDENTITY_MATRIX, Renderer, setActiveRenderer, type ViewState } from '../engine/renderer';
import { displayInfo, previewInput } from '../state/display';
import { currentUniforms, selectedNode, useGrade } from '../state/store';
import { CropOverlay } from './CropOverlay';
import { pickQualifier } from './picker';
import { WindowOverlay } from './WindowOverlay';

const MIN_SCALE = 0.01;
const MAX_SCALE = 16;

export interface TestNode {
  primary: PrimaryParams;
  curves?: CurvesParams;
  enabled?: boolean;
  cube?: string;
  lutIntensity?: number;
  qualifier?: Qualifier;
  window?: WindowParams;
}

const MASK_VIEW = { off: 0, highlight: 1, bw: 2 } as const;

function testChain(nodes: TestNode[]) {
  return nodes.map((n) =>
    toUniforms(n.primary, {
      enabled: n.enabled ?? true,
      curves: n.curves ? bakeCurves(n.curves) : undefined,
      lut: n.cube ? { lut: parseCube(n.cube), intensity: n.lutIntensity ?? 1 } : null,
      mask: n.qualifier && n.window ? maskUniform(n.qualifier, n.window) : null,
    }),
  );
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
      /** 형태·디테일 + 노드 체인. 입력을 원본(=선명도 기준 사본)으로 보고 원본 해상도로 렌더한다. */
      developNodes(
        data: number[],
        width: number,
        height: number,
        develop: Develop,
        nodes: TestNode[],
        dither: boolean,
      ): { pixels: number[]; width: number; height: number };
    };
  }
}

export function Viewer({ onOpen }: { onOpen: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const viewRef = useRef<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const frameRef = useRef(0);
  const [view, setViewState] = useState<ViewState>(viewRef.current);
  const [error, setError] = useState<string | null>(null);

  const image = useGrade((s) => s.image);
  const split = useGrade((s) => s.split);
  const splitPos = useGrade((s) => s.splitPos);
  const bypass = useGrade((s) => s.bypass);
  const tool = useGrade((s) => s.viewerTool);
  const showWindow = useGrade((s) => s.correctionTab === 'window');
  const maskView = useGrade((s) => s.maskView);
  const transformView = useGrade((s) => s.correctionTab === 'transform');
  // 보이는 영역의 크기가 바뀌면(크롭·회전·형태 탭 전환) 화면에 다시 맞춘다
  const dispKey = useGrade((s) => {
    const d = displayInfo(s);
    return d ? `${d.width.toFixed(2)}x${d.height.toFixed(2)}` : '';
  });
  const disp = displayInfo(useGrade.getState());

  // 형태·디테일이 바뀌면 다음 프레임에 미리보기 현상을 다시 한다
  const devDirty = useRef(true);

  const draw = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const r = rendererRef.current;
      if (!r) return;
      const s = useGrade.getState();
      if (devDirty.current) {
        devDirty.current = false;
        try {
          r.setDevelopPreview(previewInput(s));
          setError(null);
        } catch (e) {
          r.setDevelopPreview(null);
          setError((e as Error).message);
        }
      }
      const d = displayInfo(s);
      r.drawViewer(currentUniforms(s), {
        view: viewRef.current,
        imageWidth: d?.width ?? 1,
        imageHeight: d?.height ?? 1,
        split: s.split ? s.splitPos * r.canvas.width : -1,
        bypass: s.bypass,
        dither: true,
        maskView: MASK_VIEW[s.maskView],
        maskNode: s.nodes.indexOf(selectedNode(s)),
        matrix: d?.matrix ?? IDENTITY_MATRIX,
        grain: d?.grain ?? { amount: 0, scale: [1, 1] },
      });
    });
  }, []);

  const setView = useCallback(
    (v: ViewState) => {
      viewRef.current = v;
      setViewState(v);
      draw();
    },
    [draw],
  );

  const fit = useCallback(() => {
    const c = canvasRef.current;
    const d = displayInfo(useGrade.getState());
    if (!c || !d) return;
    const scale = Math.min(c.width / d.width, c.height / d.height) * 0.96;
    setView({
      scale,
      offsetX: (c.width - d.width * scale) / 2,
      offsetY: (c.height - d.height * scale) / 2,
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
          return Array.from(out.pixels);
        },
        gradeNodes(data, width, height, nodes, dither) {
          const out = r.renderFull({ data: new Uint8Array(data), width, height }, testChain(nodes), { dither });
          draw();
          return Array.from(out.pixels);
        },
        developNodes(data, width, height, develop, nodes, dither) {
          const src = { data: new Uint8Array(data), width, height };
          const plan = planDevelop(develop, width, height, 1);
          const base = plan.needsBase ? computeBase(src, develop.geometry, width, height) : null;
          const out = r.renderFull(src, testChain(nodes), { dither, develop: { plan, base } });
          draw();
          return { pixels: Array.from(out.pixels), width: out.width, height: out.height };
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
      setViewState(viewRef.current);
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // 새 이미지 → 프록시 텍스처 교체 후 화면 맞춤
  useEffect(() => {
    rendererRef.current?.setPreview(image?.proxy ?? null);
    devDirty.current = true;
    if (image) fit();
    else draw();
  }, [image, fit, draw]);

  useEffect(() => {
    if (dispKey) fit();
  }, [dispKey, fit]);

  // 보정값이 바뀔 때마다 다시 그림 (형태·디테일이나 보이는 영역이 바뀌면 미리보기 현상부터)
  useEffect(
    () =>
      useGrade.subscribe((s, p) => {
        if (s.develop !== p.develop || (s.correctionTab === 'transform') !== (p.correctionTab === 'transform')) {
          devDirty.current = true;
        }
        draw();
      }),
    [draw],
  );

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

  /** 화면 좌표 → 이미지 좌표(0–1) */
  const toImage = useCallback((clientX: number, clientY: number): Point => {
    const [x, y] = toCanvas({ clientX, clientY });
    const v = viewRef.current;
    const d = displayInfo(useGrade.getState());
    if (!d) return { x: 0, y: 0 };
    return { x: (x - v.offsetX) / v.scale / d.width, y: (y - v.offsetY) / v.scale / d.height };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (!image) return;
    const [x, y] = toCanvas(e);
    zoomAt(viewRef.current.scale * Math.exp(-e.deltaY * 0.0015), x, y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image || e.button !== 0) return;
    const s = useGrade.getState();
    if (s.viewerTool !== 'none' && s.viewerTool !== 'level') {
      const p = toImage(e.clientX, e.clientY);
      if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
      if (s.viewerTool === 'pen') {
        s.setWindow((w) =>
          w.shape.type === 'polygon' ? { ...w, enabled: true, shape: { ...w.shape, points: [...w.shape.points, p] } } : w,
        );
      } else {
        pickQualifier(p.x, p.y, s.viewerTool === 'pick-add');
      }
      return;
    }
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
    <div className={`viewer ${tool !== 'none' ? 'viewer-tool' : ''}`} ref={wrapRef} onWheel={onWheel}>
      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        data-testid="viewer-canvas"
        onPointerDown={onPointerDown}
        onDoubleClick={() => tool === 'none' && fit()}
      />
      {image && disp && showWindow && (
        <WindowOverlay
          view={view}
          dpr={window.devicePixelRatio || 1}
          imageWidth={disp.width}
          imageHeight={disp.height}
          toImage={toImage}
        />
      )}
      {image && disp && transformView && (
        <CropOverlay view={view} dpr={window.devicePixelRatio || 1} frameWidth={disp.width} frameHeight={disp.height} toImage={toImage} />
      )}
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
      {image && !bypass && maskView !== 'off' && (
        <div className="viewer-badge" data-testid="mask-badge">
          마스크 보기 · {maskView === 'bw' ? '흑백' : '하이라이트'} (Shift+H)
        </div>
      )}
      {image && tool !== 'none' && (
        <div className="viewer-tool-hint" data-testid="tool-hint">
          {tool === 'pen'
            ? '클릭해 점 추가 · 점 더블클릭으로 삭제'
            : tool === 'level'
              ? '수평(또는 수직)이어야 할 선을 따라 끌기'
              : tool === 'pick'
                ? '고를 색을 클릭'
                : '더할 색을 클릭'}
          <button className="btn btn-ghost" onClick={() => useGrade.getState().setViewerTool('none')}>
            끝내기 (Esc)
          </button>
        </div>
      )}
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
          <span className="mono">{Math.round(view.scale * 100)}%</span>
        </div>
      )}
    </div>
  );
}
