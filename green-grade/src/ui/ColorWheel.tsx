import { useEffect, useRef } from 'react';
import {
  channelsToWheel,
  chromaToRgb,
  WHEEL_SPECS,
  wheelChannels,
  type Vec3,
  type WheelName,
} from '../engine/color';
import { selectedNode, useGrade } from '../state/store';
import { NumberField } from './NumberField';

const SIZE = 132;
const RADIUS = SIZE / 2 - 6;

let discCache: string | null = null;

/** 벡터스코프와 같은 방향으로 색이 놓인 휠 배경 (한 번만 그려 재사용) */
function wheelDisc(): string {
  if (discCache) return discCache;
  const dpr = 2;
  const n = SIZE * dpr;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const r = RADIUS * dpr;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x - n / 2) / r;
      const v = -(y - n / 2) / r;
      const d = Math.hypot(u, v);
      if (d > 1) continue;
      const rgb = chromaToRgb(u, v);
      const i = (y * n + x) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(255 * Math.min(1, Math.max(0, 0.3 + 0.17 * rgb[k])));
      img.data[i + 3] = d > 0.985 ? Math.round(255 * (1 - d) / 0.015) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  discCache = c.toDataURL();
  return discCache;
}

/** 기본값에서 현재값까지를 채우는 막대 위치 (%) */
export function jogFill(def: number, v: number, min: number, max: number) {
  const a = ((def - min) / (max - min)) * 100;
  const b = ((v - min) / (max - min)) * 100;
  return { left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` };
}

function drag(
  e: React.PointerEvent,
  onDelta: (dx: number, dy: number, fine: boolean) => void,
) {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  let lx = e.clientX;
  let ly = e.clientY;
  const move = (ev: PointerEvent) => {
    onDelta(ev.clientX - lx, ev.clientY - ly, ev.shiftKey);
    lx = ev.clientX;
    ly = ev.clientY;
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

export function ColorWheel({ name }: { name: WheelName }) {
  const spec = WHEEL_SPECS[name];
  const value = useGrade((s) => selectedNode(s).primary[name]);
  const setWheel = useGrade((s) => s.setWheel);
  const resetWheel = useGrade((s) => s.resetWheel);
  const discRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (discRef.current) discRef.current.style.backgroundImage = `url(${wheelDisc()})`;
  }, []);

  const channels = wheelChannels(name, value);
  const digits = name === 'offset' ? 2 : 3;

  const onDiscDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag(e, (dx, dy, fine) => {
      const cur = selectedNode(useGrade.getState()).primary[name];
      const k = (fine ? 0.25 : 1) / RADIUS;
      let x = cur.x + dx * k;
      let y = cur.y - dy * k;
      const d = Math.hypot(x, y);
      if (d > 1) {
        x /= d;
        y /= d;
      }
      setWheel(name, { x, y });
    });
  };

  const onJogDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag(e, (dx, _dy, fine) => {
      const cur = selectedNode(useGrade.getState()).primary[name].master;
      const k = ((spec.masterMax - spec.masterMin) / 600) * (fine ? 0.25 : 1);
      setWheel(name, { master: Math.min(spec.masterMax, Math.max(spec.masterMin, cur + dx * k)) });
    });
  };

  const commitChannel = (i: number, v: number) => {
    const rgb = [...channels] as Vec3;
    rgb[i] = v;
    setWheel(name, channelsToWheel(name, rgb));
  };

  return (
    <div className="wheel" data-testid={`wheel-${name}`}>
      <div className="wheel-title" onDoubleClick={() => resetWheel(name)} title="더블클릭: 전체 리셋">
        {spec.label}
      </div>
      <div
        className="wheel-disc"
        ref={discRef}
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={onDiscDown}
        onDoubleClick={() => resetWheel(name, 'color')}
        title="드래그: 색 조절 (Shift: 미세) · 더블클릭: 색 리셋"
        data-testid={`wheel-${name}-disc`}
      >
        <span className="wheel-cross" />
        <span
          className="wheel-puck"
          style={{ left: SIZE / 2 + value.x * RADIUS, top: SIZE / 2 - value.y * RADIUS }}
        />
      </div>
      <div
        className="jog"
        onPointerDown={onJogDown}
        onDoubleClick={() => resetWheel(name, 'master')}
        title="좌우 드래그: 밝기 (Shift: 미세) · 더블클릭: 리셋"
        data-testid={`wheel-${name}-jog`}
      >
        <span
          className="jog-fill"
          style={jogFill(spec.masterDefault, value.master, spec.masterMin, spec.masterMax)}
        />
      </div>
      <div className="wheel-master">
        <NumberField
          label={`${spec.label} master`}
          value={value.master}
          digits={digits}
          min={spec.masterMin}
          max={spec.masterMax}
          onCommit={(v) => setWheel(name, { master: v })}
        />
        {spec.unit && <span className="muted">{spec.unit}</span>}
      </div>
      <div className="wheel-rgb">
        {(['R', 'G', 'B'] as const).map((ch, i) => (
          <label key={ch} className={`ch ch-${ch.toLowerCase()}`}>
            <span>{ch}</span>
            <NumberField
              label={`${spec.label} ${ch}`}
              value={channels[i]}
              digits={digits}
              onCommit={(v) => commitChannel(i, v)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
