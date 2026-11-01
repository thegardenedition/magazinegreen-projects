import { useState, useSyncExternalStore } from 'react';
import { mapPoint } from '../engine/develop';
import type { Point } from '../engine/mask';
import type { ViewState } from '../engine/renderer';
import { displayInfo } from '../state/display';
import { erase, useHeal, type BrushDab } from '../state/heal';
import { useGrade } from '../state/store';
import { useBrush } from './HealPanel';

interface Props {
  view: ViewState;
  dpr: number;
  toImage(clientX: number, clientY: number): Point;
}

/** 지우개 붓: 끌어서 칠하고, 손을 떼면 칠한 곳을 메운다 */
export function HealOverlay({ view, dpr, toImage }: Props) {
  const size = useSyncExternalStore(useBrush.subscribe, useBrush.get);
  const busy = useHeal((s) => s.busy);
  const [stroke, setStroke] = useState<Array<{ x: number; y: number }>>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const radius = size / 2;

  const local = (e: { clientX: number; clientY: number }, el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const pts = [local(e, el)];
    const clientPts = [{ x: e.clientX, y: e.clientY }];
    setStroke([...pts]);
    const move = (ev: Event) => {
      const pe = ev as PointerEvent;
      const p = local(pe, el);
      const last = pts[pts.length - 1];
      // 붓 반지름의 1/3마다 점을 찍는다
      if (Math.hypot(p.x - last.x, p.y - last.y) < Math.max(2, radius / 3)) return;
      pts.push(p);
      clientPts.push({ x: pe.clientX, y: pe.clientY });
      setStroke([...pts]);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const s = useGrade.getState();
      const d = displayInfo(s);
      const img = s.image;
      if (!d || !img) {
        setStroke([]);
        return;
      }
      // 화면 좌표 → 보이는 영역 0–1 → 원본 0–1 → 원본 픽셀. 반지름: 화면 px → 원본 px
      const rFull = (radius * dpr) / view.scale;
      const dabs: BrushDab[] = clientPts.map((c) => {
        const q = toImage(c.x, c.y);
        const [u, v] = mapPoint(d.matrix, q.x, q.y);
        return { x: u * img.width, y: v * img.height, r: rFull };
      });
      erase(dabs).finally(() => setStroke([]));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <svg
      className="heal-overlay"
      data-testid="heal-overlay"
      onPointerDown={onDown}
      onPointerMove={(e) => setCursor(local(e, e.currentTarget))}
      onPointerLeave={() => setCursor(null)}
    >
      {stroke.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={radius} className="heal-paint" />
      ))}
      {cursor && !stroke.length && <circle cx={cursor.x} cy={cursor.y} r={radius} className="heal-cursor" />}
    </svg>
  );
}
