import { useSyncExternalStore } from 'react';
import { clearHeal, undoLastHeal, useHeal } from '../state/heal';
import { useGrade } from '../state/store';
import { RangeControl } from './RangeControl';

/** 지우개 붓 크기 (화면 px). 뷰어 위 붓과 함께 쓴다 */
export const useBrush = (() => {
  let size = 40;
  const subs = new Set<() => void>();
  return {
    get: () => size,
    set: (v: number) => {
      size = v;
      subs.forEach((f) => f());
    },
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
})();

/** 지우개: 지울 곳을 뷰어에서 칠하면 주변 질감으로 메운다 (사진 전체, 노드 보정 앞) */
export function HealPanel() {
  const tool = useGrade((s) => s.viewerTool);
  const setTool = useGrade((s) => s.setViewerTool);
  const image = useGrade((s) => s.image);
  const count = useGrade((s) => s.develop.heal?.length ?? 0);
  const busy = useHeal((s) => s.busy);
  const error = useHeal((s) => s.error);
  const size = useSyncExternalStore(useBrush.subscribe, useBrush.get);
  const on = tool === 'heal';

  return (
    <div className="primary develop-panel">
      <div className="develop-row">
        <button
          className={`btn ${on ? 'btn-toggle on' : 'btn-primary'}`}
          onClick={() => setTool(on ? 'none' : 'heal')}
          disabled={!image}
          data-testid="heal-tool"
        >
          {on ? '칠하기 끝내기' : '지울 곳 칠하기'}
        </button>
        <span className="muted small" data-testid="heal-status">
          {busy ? '지우는 중…' : error ? error : count ? `지운 곳 ${count}개` : '아직 지운 곳이 없습니다'}
        </span>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={undoLastHeal} disabled={!count || busy} data-testid="heal-undo">
          마지막 것 되돌리기
        </button>
        <button className="btn btn-ghost" onClick={clearHeal} disabled={!count || busy} data-testid="heal-clear">
          모두 되돌리기
        </button>
      </div>
      <div className="scalars develop-scalars">
        <RangeControl label="붓 크기" value={size} def={40} min={8} max={200} step={1} onChange={useBrush.set} testId="heal-size" />
      </div>
      <p className="muted small">
        뷰어에서 지울 것(낙엽, 전깃줄, 표지판, 작은 사람 등)을 덮어 칠하면, 손을 뗄 때 주변 질감으로 메웁니다. 사진 밖으로는
        전송되지 않습니다. 생성형 AI가 아니라 사진 안의 비슷한 부분을 가져오므로, 작은 물체일수록 자연스럽고 큰 물체나 뒤에
        가려진 구조(창문, 얼굴 등)는 새로 그려 내지 못합니다. 여러 번 나눠 칠하면 더 깔끔합니다.
      </p>
    </div>
  );
}
