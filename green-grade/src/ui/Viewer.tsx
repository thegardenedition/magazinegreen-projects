import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultPrimary, toUniforms, type PrimaryParams } from '../engine/color';
import { bakeCurves, type CurvesParams } from '../engine/curves';
import { computeBase, planDevelop, type Develop } from '../engine/develop';
import { parseCube } from '../engine/lut';
import { maskUniform, type Point, type Qualifier, type WindowParams } from '../engine/mask';
import { IDENTITY_MATRIX, Renderer, setActiveRenderer, type ViewState } from '../engine/renderer';
import { displayInfo, previewInput } from '../state/display';
import { currentUniforms, selectedNode, useGrade } from '../state/store';
import { CropOverlay } from './CropOverlay';
import { pickQualifier } from './picker';
import { MOBILE_QUERY } from './useMedia';
import { WindowOverlay } from './WindowOverlay';

const MIN_SCALE = 0.01;
const MAX_SCALE = 16;

/** 테스트 훅이 받는 Primary 값. 나중에 생긴 값(Log 휠·Mixer 등)은 빠져 있으면 기본값을 쓴다. */
export type TestPrimary = Pick<PrimaryParams, 'lift' | 'gamma' | 'gain' | 'offset' | 'temperature' | 'tint' | 'contrast' | 'pivot' | 'saturation' | 'hue'> &
  Partial<PrimaryParams>;

const fullPrimary = (p: TestPrimary): PrimaryParams => ({ ...defaultPrimary(), ...p });

export interface TestNode {
  primary: TestPrimary;
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
    toUniforms(fullPrimary(n.primary), {
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
        primary: TestPrimary,
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
      /** 테스트용: 그래픽 컨텍스트를 잃은 것처럼 / 되돌린 것처럼 */
      loseContext(): void;
      restoreContext(): void;
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
  const [lost, setLost] = useState(false);

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
    return d ? `${d.width.toFixed(2)}x${d.height.toFixed(2)}${d.transformView ? ' 형태' : ''}` : '';
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

  // 화면 맞춤 상태인지. 맞춤 상태에서 뷰어 크기가 바뀌면(휴대폰 회전, 패널 열고 닫기) 다시 맞춘다.
  const autoFit = useRef(true);

  const setView = useCallback(
    (v: ViewState, fitting = false) => {
      autoFit.current = fitting;
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
    // 형태 탭에서는 크롭 핸들이 가장자리에 걸리지 않도록 여백을 더 둔다
    const scale = Math.min(c.width / d.width, c.height / d.height) * (d.transformView ? 0.86 : 0.96);
    setView(
      {
        scale,
        offsetX: (c.width - d.width * scale) / 2,
        offsetY: (c.height - d.height * scale) / 2,
      },
      true,
    );
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

  // WebGL 초기화. 휴대폰 브라우저는 그래픽 메모리가 모자라면 컨텍스트를 버리므로(화면이 비는 원인),
  // 잃으면 복구를 요청하고, 돌아오면 자원을 다시 만들어 지금 사진·보정을 다시 그린다.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const create = () => {
      const r = new Renderer(canvas);
      rendererRef.current = r;
      setActiveRenderer(r);
      const img = useGrade.getState().image;
      if (img) r.setPreview(img.proxy);
      devDirty.current = true;
      draw();
    };
    const R = () => {
      const r = rendererRef.current;
      if (!r) throw new Error('렌더러가 준비되지 않았습니다.');
      return r;
    };
    let loseExt: WEBGL_lose_context | null = null;
    try {
      create();
      loseExt = rendererRef.current!.gl.getExtension('WEBGL_lose_context');
      window.__GG__ = {
        gradePixels(data, width, height, primary, dither, curves) {
          const u = toUniforms(fullPrimary(primary), { curves: curves ? bakeCurves(curves) : undefined });
          const out = R().renderFull({ data: new Uint8Array(data), width, height }, [u], { dither });
          draw();
          return Array.from(out.pixels);
        },
        gradeNodes(data, width, height, nodes, dither) {
          const out = R().renderFull({ data: new Uint8Array(data), width, height }, testChain(nodes), { dither });
          draw();
          return Array.from(out.pixels);
        },
        developNodes(data, width, height, develop, nodes, dither) {
          const src = { data: new Uint8Array(data), width, height };
          const plan = planDevelop(develop, width, height, 1);
          const base = plan.needsBase ? computeBase(src, develop.geometry, width, height) : null;
          const out = R().renderFull(src, testChain(nodes), { dither, develop: { plan, base } });
          draw();
          return { pixels: Array.from(out.pixels), width: out.width, height: out.height };
        },
        // 잃은 뒤에는 확장을 다시 얻을 수 없으므로 미리 잡아 둔 것을 쓴다
        loseContext() {
          loseExt?.loseContext();
        },
        restoreContext() {
          loseExt?.restoreContext();
        },
      };
    } catch (e) {
      setError((e as Error).message);
    }
    const onLost = (e: Event) => {
      e.preventDefault(); // 복구를 요청한다
      rendererRef.current = null;
      setActiveRenderer(null);
      setLost(true);
    };
    const onRestored = () => {
      try {
        create();
        setLost(false);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
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
      if (autoFit.current && useGrade.getState().image) {
        fit();
        return;
      }
      viewRef.current = { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy };
      setViewState(viewRef.current);
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw, fit]);

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
    pointers.current.set(e.pointerId, toCanvas(e));
    beginGesture();
  };

  // 손가락(포인터) 하나면 이동, 둘이면 핀치 확대 + 이동. 포인터 수가 바뀔 때마다 기준을 다시 잡는다.
  const pointers = useRef(new Map<number, readonly [number, number]>());
  const gesture = useRef<{ v0: ViewState; c0: readonly [number, number]; d0: number } | null>(null);
  const centroid = () => {
    const ps = [...pointers.current.values()];
    return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length] as const;
  };
  const spread = () => {
    const ps = [...pointers.current.values()];
    return ps.length >= 2 ? Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]) : 0;
  };
  const beginGesture = () => {
    gesture.current = pointers.current.size ? { v0: viewRef.current, c0: centroid(), d0: spread() } : null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, toCanvas(e));
    const { v0, c0, d0 } = gesture.current;
    const c = centroid();
    const k = d0 > 0 ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, (v0.scale * spread()) / d0)) / v0.scale : 1;
    // 시작할 때 손가락 중심 아래에 있던 이미지 점이 지금 손가락 중심 아래에 오도록
    setView({
      scale: v0.scale * k,
      offsetX: c[0] - (c0[0] - v0.offsetX) * k,
      offsetY: c[1] - (c0[1] - v0.offsetY) * k,
    });
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    beginGesture();
  };

  /** 더블클릭(휴대폰은 두 번 탭): 화면 맞춤. 휴대폰에서 이미 맞춤이면 그 자리를 확대 */
  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'none') return;
    const c = canvasRef.current;
    const d = displayInfo(useGrade.getState());
    if (!c || !d) return;
    const fitScale = Math.min(c.width / d.width, c.height / d.height) * (d.transformView ? 0.86 : 0.96);
    if (window.matchMedia(MOBILE_QUERY).matches && Math.abs(viewRef.current.scale - fitScale) < fitScale * 0.02) {
      const [x, y] = toCanvas(e);
      zoomAt(Math.min(MAX_SCALE, fitScale * 3), x, y);
    } else fit();
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
    <div className={`viewer ${tool !== 'none' ? 'viewer-tool' : ''} ${transformView ? 'viewer-transform' : ''}`} ref={wrapRef} onWheel={onWheel}>
      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        data-testid="viewer-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={onDoubleClick}
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
      {lost && (
        <div className="viewer-empty" data-testid="context-lost">
          <p>그래픽 메모리가 부족해 화면을 다시 준비하는 중입니다.</p>
          <p className="muted small">보정은 그대로 남아 있습니다. 오래 걸리면 다른 앱·탭을 닫아 주세요.</p>
        </div>
      )}
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
