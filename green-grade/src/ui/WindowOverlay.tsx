import { polygonVertices, type Point, type WindowShape } from '../engine/mask';
import type { ViewState } from '../engine/renderer';
import { selectedNode, useGrade } from '../state/store';

interface Props {
  view: ViewState;
  dpr: number;
  imageWidth: number;
  imageHeight: number;
  /** 화면 좌표 → 이미지 좌표(0–1) */
  toImage(clientX: number, clientY: number): Point;
}

const ROT_GAP = 0.06;

/** 선택 노드의 창을 뷰어 위에 그리고, 핸들로 직접 고친다 */
export function WindowOverlay({ view, dpr, imageWidth, imageHeight, toImage }: Props) {
  const win = useGrade((s) => selectedNode(s).window);
  const setWindow = useGrade((s) => s.setWindow);
  const aspect = imageWidth / imageHeight;
  const k = (view.scale * imageHeight) / dpr; // 높이 1 = 화면 몇 px
  // 이미지 좌표(x: 0–1, y: 0–1) → 화면(CSS px)
  const sx = (x: number) => (view.offsetX + x * imageWidth * view.scale) / dpr;
  const sy = (y: number) => (view.offsetY + y * imageHeight * view.scale) / dpr;
  // 높이 단위 공간(X = x·aspect, Y = y) → 화면
  const hx = (X: number) => sx(X / aspect);

  const setShape = (fn: (s: WindowShape) => WindowShape) => setWindow((w) => ({ ...w, shape: fn(w.shape) }));

  const drag = (e: React.PointerEvent, onMove: (p: Point) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const move = (ev: Event) => {
      const pe = ev as PointerEvent;
      onMove(toImage(pe.clientX, pe.clientY));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const handle = (key: string, x: number, y: number, onMove: (p: Point) => void, extra: Partial<React.SVGProps<SVGCircleElement>> = {}) => (
    <circle
      key={key}
      cx={x}
      cy={y}
      r={6}
      className="win-handle"
      data-testid={`win-handle-${key}`}
      onPointerDown={(e) => drag(e, onMove)}
      {...extra}
    />
  );

  const s = win.shape;
  const f = win.feather;
  const els: React.ReactNode[] = [];

  if (s.type === 'circle' || s.type === 'rect') {
    const a = (s.angle * Math.PI) / 180;
    const ex = [Math.cos(a), Math.sin(a)];
    const ey = [-Math.sin(a), Math.cos(a)];
    const C = [s.cx * aspect, s.cy];
    const half = s.type === 'circle' ? [s.rx, s.ry] : [s.w / 2, s.h / 2];
    const at = (u: number, v: number) => [hx(C[0] + ex[0] * u + ey[0] * v), sy(C[1] + ex[1] * u + ey[1] * v)];
    const outline = (grow: number, cls: string, key: string) => {
      const rx = Math.max(0, half[0] + grow) * k;
      const ry = Math.max(0, half[1] + grow) * k;
      const [cx, cy] = at(0, 0);
      const t = `rotate(${s.angle} ${cx} ${cy})`;
      return s.type === 'circle' ? (
        <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} transform={t} className={cls} />
      ) : (
        <rect key={key} x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} transform={t} className={cls} />
      );
    };
    els.push(outline(0, 'win-line', 'shape'));
    if (f > 0) {
      els.push(outline(f / 2, 'win-line faint', 'fo'));
      els.push(outline(-f / 2, 'win-line faint', 'fi'));
    }
    const [cx, cy] = at(0, 0);
    const [rxX, rxY] = at(half[0], 0);
    const [ryX, ryY] = at(0, -half[1]);
    const [rtX, rtY] = at(0, -half[1] - ROT_GAP);
    els.push(<line key="rot-line" x1={ryX} y1={ryY} x2={rtX} y2={rtY} className="win-line faint" />);
    // 핸들: 이미지 좌표 → 높이 단위 공간으로 바꿔 계산
    const local = (p: Point) => {
      const dx = p.x * aspect - C[0];
      const dy = p.y - C[1];
      return [dx * ex[0] + dy * ex[1], dx * ey[0] + dy * ey[1]];
    };
    els.push(
      handle('center', cx, cy, (p) => setShape((sh) => ({ ...sh, cx: p.x, cy: p.y }) as WindowShape)),
      handle('size-x', rxX, rxY, (p) => {
        const v = Math.max(0.005, Math.abs(local(p)[0]));
        setShape((sh) => (sh.type === 'circle' ? { ...sh, rx: v } : sh.type === 'rect' ? { ...sh, w: v * 2 } : sh));
      }),
      handle('size-y', ryX, ryY, (p) => {
        const v = Math.max(0.005, Math.abs(local(p)[1]));
        setShape((sh) => (sh.type === 'circle' ? { ...sh, ry: v } : sh.type === 'rect' ? { ...sh, h: v * 2 } : sh));
      }),
      handle('rotate', rtX, rtY, (p) => {
        const deg = (Math.atan2(p.x * aspect - C[0], -(p.y - C[1])) * 180) / Math.PI;
        setShape((sh) => ({ ...sh, angle: Math.round(deg * 10) / 10 }) as WindowShape);
      }, { className: 'win-handle win-rot' }),
    );
  } else if (s.type === 'gradient') {
    const x0 = sx(s.x0);
    const y0 = sy(s.y0);
    const x1 = sx(s.x1);
    const y1 = sy(s.y1);
    // 시작·끝에서 그라디언트 방향에 수직인 선
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 2000;
    const ny = (dx / len) * 2000;
    els.push(
      <line key="g0" x1={x0 - nx} y1={y0 - ny} x2={x0 + nx} y2={y0 + ny} className="win-line" />,
      <line key="g1" x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} className="win-line faint" />,
      <line key="gm" x1={x0} y1={y0} x2={x1} y2={y1} className="win-line faint" />,
      handle('start', x0, y0, (p) => setShape((sh) => ({ ...sh, x0: p.x, y0: p.y }) as WindowShape)),
      handle('end', x1, y1, (p) => setShape((sh) => ({ ...sh, x1: p.x, y1: p.y }) as WindowShape)),
    );
  } else {
    const verts = polygonVertices(s.points, s.smooth);
    if (verts.length >= 2) {
      els.push(
        <polygon
          key="poly"
          points={verts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
          className={`win-line ${s.points.length < 3 ? 'faint' : ''}`}
        />,
      );
    }
    s.points.forEach((p, i) =>
      els.push(
        handle(
          `pt${i}`,
          sx(p.x),
          sy(p.y),
          (q) =>
            setShape((sh) =>
              sh.type === 'polygon' ? { ...sh, points: sh.points.map((o, k2) => (k2 === i ? q : o)) } : sh,
            ),
          {
            onDoubleClick: (e) => {
              e.stopPropagation();
              setShape((sh) => (sh.type === 'polygon' ? { ...sh, points: sh.points.filter((_, k2) => k2 !== i) } : sh));
            },
          },
        ),
      ),
    );
  }

  return (
    <svg className={`win-overlay ${win.enabled ? '' : 'win-disabled'}`} data-testid="window-overlay">
      {els}
    </svg>
  );
}
