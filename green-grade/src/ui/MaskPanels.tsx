import { HistoryIcon } from './HistoryBar';
import { useRef } from 'react';
import { hueSwatch } from '../engine/curves';
import { defaultQualifier, defaultShape, type LinearRange, type WindowShape, type WindowType } from '../engine/mask';
import { selectedNode, useGrade, type MaskView } from '../state/store';
import { NumberField } from './NumberField';

const MASK_VIEWS: Array<[MaskView, string]> = [
  ['off', '끔'],
  ['highlight', '하이라이트'],
  ['bw', '흑백'],
];

function MaskViewSwitch() {
  const view = useGrade((s) => s.maskView);
  const set = useGrade((s) => s.setMaskView);
  return (
    <div className="seg" title="선택 노드의 마스크 보기 (Shift+H)">
      <span className="muted small">마스크</span>
      {MASK_VIEWS.map(([v, label]) => (
        <button key={v} className={`chip ${view === v ? 'on' : ''}`} onClick={() => set(v)} data-testid={`mask-view-${v}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label, testId }: { on: boolean; onChange(v: boolean): void; label: string; testId?: string }) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(!on)} data-testid={testId}>
      {on ? '✓ ' : ''}
      {label}
    </button>
  );
}

const pct = (v: number) => `${v * 100}%`;

/** 막대 위 위치(0–1)를 끌어 값 바꾸기 */
function useBarDrag() {
  const ref = useRef<HTMLDivElement>(null);
  const start = (e: React.PointerEvent, onMove: (x: number, dx: number) => void) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = ref.current!.getBoundingClientRect();
    const x0 = (e.clientX - rect.left) / rect.width;
    const move = (ev: PointerEvent) => {
      const x = (ev.clientX - rect.left) / rect.width;
      onMove(x, x - x0);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return { ref, start };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const wrap = (v: number) => v - Math.floor(v);

function HueBar() {
  const hue = useGrade((s) => selectedNode(s).qualifier.hue);
  const setQ = useGrade((s) => s.setQualifier);
  const { ref, start } = useBarDrag();
  const stops = Array.from({ length: 25 }, (_, i) => {
    const c = hueSwatch(i / 24, 0.25, 0.6).map((v) => Math.round(v * 255));
    return `rgb(${c.join(',')}) ${(i / 24) * 100}%`;
  });
  // 선택 구간 (0–1 밖으로 넘으면 반대편에 이어 그림)
  const lo = hue.center - hue.width;
  const hi = hue.center + hue.width;
  const segs: Array<[number, number]> = [];
  for (const off of [-1, 0, 1]) {
    const a = Math.max(0, lo + off);
    const b = Math.min(1, hi + off);
    if (b > a) segs.push([a, b]);
  }
  const setHue = (patch: Partial<typeof hue>) => setQ((q) => ({ ...q, hue: { ...q.hue, ...patch } }));
  const edge = (x: number) => {
    const d = Math.abs(wrap(x - hue.center + 0.5) - 0.5);
    setHue({ width: Math.min(0.5, Math.max(0.005, d)) });
  };
  return (
    <div className="qbar" ref={ref} style={{ background: `linear-gradient(90deg, ${stops.join(',')})` }} data-testid="qbar-hue">
      {segs.map(([a, b], i) => (
        <span
          key={i}
          className="qbar-sel"
          style={{ left: pct(a), width: pct(b - a) }}
          onPointerDown={(e) => {
            const c0 = hue.center;
            start(e, (_x, dx) => setHue({ center: wrap(c0 + dx) }));
          }}
        />
      ))}
      <span className="qbar-handle" style={{ left: pct(wrap(lo)) }} onPointerDown={(e) => start(e, edge)} />
      <span className="qbar-handle" style={{ left: pct(wrap(hi)) }} onPointerDown={(e) => start(e, edge)} />
    </div>
  );
}

function LinearBar({ which }: { which: 'sat' | 'lum' }) {
  const r = useGrade((s) => selectedNode(s).qualifier[which]);
  const setQ = useGrade((s) => s.setQualifier);
  const { ref, start } = useBarDrag();
  const set = (patch: Partial<LinearRange>) => setQ((q) => ({ ...q, [which]: { ...q[which], ...patch } }));
  const bg =
    which === 'lum'
      ? 'linear-gradient(90deg, #000, #fff)'
      : `linear-gradient(90deg, #7a7a7a, rgb(${hueSwatch(0.38, 0.5, 0.6).map((v) => Math.round(v * 255)).join(',')}))`;
  return (
    <div className="qbar" ref={ref} style={{ background: bg }} data-testid={`qbar-${which}`}>
      <span
        className="qbar-sel"
        style={{ left: pct(r.low), width: pct(Math.max(0, r.high - r.low)) }}
        onPointerDown={(e) => {
          const { low, high } = r;
          start(e, (_x, dx) => {
            const d = Math.min(1 - high, Math.max(-low, dx));
            set({ low: low + d, high: high + d });
          });
        }}
      />
      <span className="qbar-handle" style={{ left: pct(r.low) }} onPointerDown={(e) => start(e, (x) => set({ low: Math.min(clamp01(x), r.high) }))} />
      <span className="qbar-handle" style={{ left: pct(r.high) }} onPointerDown={(e) => start(e, (x) => set({ high: Math.max(clamp01(x), r.low) }))} />
    </div>
  );
}

function Field({ label, value, onCommit, max = 1, digits = 3 }: { label: string; value: number; onCommit(v: number): void; max?: number; digits?: number }) {
  return (
    <label className="qfield">
      <span className="muted small">{label}</span>
      <NumberField label={label} value={value} digits={digits} min={0} max={max} onCommit={onCommit} />
    </label>
  );
}

export function QualifierPanel() {
  const q = useGrade((s) => selectedNode(s).qualifier);
  const setQ = useGrade((s) => s.setQualifier);
  const tool = useGrade((s) => s.viewerTool);
  const setTool = useGrade((s) => s.setViewerTool);
  const hasImage = useGrade((s) => !!s.image);

  const range = (which: 'sat' | 'lum', label: string) => {
    const r = q[which];
    const set = (patch: Partial<LinearRange>) => setQ((x) => ({ ...x, [which]: { ...x[which], ...patch } }));
    return (
      <div className={`qrow ${r.on ? '' : 'qrow-off'}`}>
        <Toggle on={r.on} onChange={(on) => set({ on })} label={label} testId={`q-${which}-on`} />
        <LinearBar which={which} />
        <Field label="낮음" value={r.low} onCommit={(low) => set({ low })} />
        <Field label="높음" value={r.high} onCommit={(high) => set({ high })} />
        <Field label="소프트" value={r.soft} onCommit={(soft) => set({ soft })} />
      </div>
    );
  };

  return (
    <div className="mask-panel">
      <div className="mask-head">
        <Toggle on={q.enabled} onChange={(enabled) => setQ((x) => ({ ...x, enabled }))} label="Qualifier 사용" testId="q-enabled" />
        <button
          className={`chip ${tool === 'pick' ? 'on' : ''}`}
          disabled={!hasImage}
          onClick={() => setTool(tool === 'pick' ? 'none' : 'pick')}
          title="뷰어에서 색을 눌러 범위를 새로 정합니다"
          data-testid="q-pick"
        >
          스포이드
        </button>
        <button
          className={`chip ${tool === 'pick-add' ? 'on' : ''}`}
          disabled={!hasImage || !q.enabled}
          onClick={() => setTool(tool === 'pick-add' ? 'none' : 'pick-add')}
          title="뷰어에서 누른 색까지 범위를 넓힙니다"
          data-testid="q-pick-add"
        >
          + 더하기
        </button>
        <Toggle on={q.invert} onChange={(invert) => setQ((x) => ({ ...x, invert }))} label="반전" testId="q-invert" />
        <button className="btn btn-reset" onClick={() => setQ(() => defaultQualifier())}>
          <HistoryIcon name="reset" />
          초기화
        </button>
        <span className="spacer" />
        <MaskViewSwitch />
      </div>
      <div className={`qrows ${q.enabled ? '' : 'qrows-off'}`}>
        <div className={`qrow ${q.hue.on ? '' : 'qrow-off'}`}>
          <Toggle on={q.hue.on} onChange={(on) => setQ((x) => ({ ...x, hue: { ...x.hue, on } }))} label="Hue" testId="q-hue-on" />
          <HueBar />
          <Field label="중심" value={q.hue.center} onCommit={(center) => setQ((x) => ({ ...x, hue: { ...x.hue, center } }))} />
          <Field label="폭" value={q.hue.width} max={0.5} onCommit={(width) => setQ((x) => ({ ...x, hue: { ...x.hue, width } }))} />
          <Field label="소프트" value={q.hue.soft} max={0.5} onCommit={(soft) => setQ((x) => ({ ...x, hue: { ...x.hue, soft } }))} />
        </div>
        {range('sat', 'Sat')}
        {range('lum', 'Lum')}
      </div>
      <p className="muted small mask-help">
        스포이드로 뷰어의 색을 누르면 그 색 범위만 이 노드의 보정을 받습니다. 판정은 이 노드에 들어오는 색(앞 노드들을 거친
        색) 기준입니다.
      </p>
    </div>
  );
}

const SHAPES: Array<[WindowType, string]> = [
  ['circle', '원형'],
  ['rect', '사각형'],
  ['gradient', '그라디언트'],
  ['polygon', '펜'],
];

const SHAPE_FIELDS: Record<Exclude<WindowType, 'polygon'>, Array<[string, string, number, number]>> = {
  circle: [['cx', 'X', -1, 2], ['cy', 'Y', -1, 2], ['rx', '가로 반경', 0, 3], ['ry', '세로 반경', 0, 3], ['angle', '회전°', -360, 360]],
  rect: [['cx', 'X', -1, 2], ['cy', 'Y', -1, 2], ['w', '너비', 0, 6], ['h', '높이', 0, 6], ['angle', '회전°', -360, 360]],
  gradient: [['x0', '시작 X', -1, 2], ['y0', '시작 Y', -1, 2], ['x1', '끝 X', -1, 2], ['y1', '끝 Y', -1, 2]],
};

export function WindowPanel() {
  const w = useGrade((s) => selectedNode(s).window);
  const setW = useGrade((s) => s.setWindow);
  const tool = useGrade((s) => s.viewerTool);
  const setTool = useGrade((s) => s.setViewerTool);
  const shape = w.shape;

  const chooseShape = (type: WindowType) => {
    setW((x) => ({ ...x, enabled: true, shape: x.shape.type === type ? x.shape : defaultShape(type) }));
    if (type === 'polygon') setTool('pen');
    else if (tool === 'pen') setTool('none');
  };
  const setField = (k: string, v: number) => setW((x) => ({ ...x, shape: { ...x.shape, [k]: v } as WindowShape }));

  return (
    <div className="mask-panel">
      <div className="mask-head">
        <Toggle on={w.enabled} onChange={(enabled) => setW((x) => ({ ...x, enabled }))} label="Window 사용" testId="w-enabled" />
        {SHAPES.map(([t, label]) => (
          <button key={t} className={`chip ${shape.type === t ? 'on' : ''}`} onClick={() => chooseShape(t)} data-testid={`w-shape-${t}`}>
            {label}
          </button>
        ))}
        <Toggle on={w.invert} onChange={(invert) => setW((x) => ({ ...x, invert }))} label="반전" testId="w-invert" />
        <span className="spacer" />
        <MaskViewSwitch />
      </div>
      <div className={`wrows ${w.enabled ? '' : 'qrows-off'}`}>
        {shape.type !== 'gradient' && (
          <label className="wfeather">
            <span className="muted small">페더</span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.005}
              value={w.feather}
              aria-label="페더"
              data-testid="w-feather"
              onChange={(e) => setW((x) => ({ ...x, feather: Number(e.target.value) }))}
            />
            <NumberField label="페더 값" value={w.feather} digits={3} min={0} max={2} onCommit={(feather) => setW((x) => ({ ...x, feather }))} />
          </label>
        )}
        {shape.type === 'polygon' ? (
          <div className="wfields">
            <button className={`chip ${tool === 'pen' ? 'on' : ''}`} onClick={() => setTool(tool === 'pen' ? 'none' : 'pen')} data-testid="w-pen">
              펜으로 점 찍기
            </button>
            <Toggle
              on={shape.smooth}
              onChange={(smooth) => setW((x) => ({ ...x, shape: { ...shape, smooth } }))}
              label="부드러운 곡선"
              testId="w-smooth"
            />
            <span className="muted small" data-testid="w-point-count">
              점 {shape.points.length}개{shape.points.length < 3 ? ' (3개부터 적용)' : ''}
            </span>
            <button className="btn btn-ghost" onClick={() => setW((x) => ({ ...x, shape: { ...shape, points: [] } }))}>
              점 모두 지우기
            </button>
          </div>
        ) : (
          <div className="wfields">
            {SHAPE_FIELDS[shape.type].map(([k, label, min, max]) => (
              <label key={k} className="qfield">
                <span className="muted small">{label}</span>
                <NumberField
                  label={label}
                  value={(shape as unknown as Record<string, number>)[k]}
                  digits={k === 'angle' ? 1 : 3}
                  min={min}
                  max={max}
                  onCommit={(v) => setField(k, v)}
                />
              </label>
            ))}
            <button className="btn btn-reset" onClick={() => setW((x) => ({ ...x, shape: defaultShape(shape.type) }))}>
              <HistoryIcon name="reset" />
              모양 초기화
            </button>
          </div>
        )}
      </div>
      <p className="muted small mask-help">
        뷰어의 핸들로 위치·크기·회전을 바로 고칠 수 있습니다. 좌표는 이미지 기준 0–1, 크기와 페더는 이미지 높이 기준입니다.
        {shape.type === 'gradient' && ' 그라디언트는 시작점에서 완전히 적용되고 끝점에서 사라집니다.'}
        {' '}Qualifier와 함께 켜면 두 조건을 모두 만족하는 곳(교집합)만 보정됩니다.
      </p>
    </div>
  );
}
