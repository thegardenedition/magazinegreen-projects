import { useEffect, useState } from 'react';
import { useGrade } from '../state/store';

const ICONS = {
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  reset: 'M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5',
};

export function HistoryIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="history-icon">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** 되돌리기 · 다시 실행 · 처음 상태로 초기화. 초기화도 되돌리기로 취소할 수 있다. */
export function HistoryBar({ compact = false }: { compact?: boolean }) {
  const image = useGrade((s) => s.image);
  const undoCount = useGrade((s) => s.past.length);
  const redoCount = useGrade((s) => s.future.length);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const reset = () => {
    useGrade.getState().resetPhoto();
    setToast(true);
  };
  const undoReset = () => {
    useGrade.getState().undo();
    setToast(false);
  };

  return (
    <div className={`history ${compact ? 'history-compact' : ''}`} role="group" aria-label="작업 기록">
      <button
        className="btn btn-history"
        onClick={() => useGrade.getState().undo()}
        disabled={!undoCount}
        title={`되돌리기 (Ctrl+Z)${undoCount ? ` · ${undoCount}단계 남음` : ''}`}
        aria-label="되돌리기"
        data-testid="undo"
      >
        <HistoryIcon name="undo" />
        <span>되돌리기</span>
        {undoCount > 0 && !compact && <span className="history-count mono">{undoCount}</span>}
      </button>
      <button
        className="btn btn-history"
        onClick={() => useGrade.getState().redo()}
        disabled={!redoCount}
        title="다시 실행 (Ctrl+Shift+Z)"
        aria-label="다시 실행"
        data-testid="redo"
      >
        <HistoryIcon name="redo" />
        <span>{compact ? '다시' : '다시 실행'}</span>
      </button>
      <button
        className="btn btn-history btn-history-reset"
        onClick={reset}
        disabled={!image}
        title="노드·형태·디테일·지우개를 모두 처음 상태로 (되돌리기로 취소 가능)"
        aria-label="전체 초기화"
        data-testid="reset-all"
      >
        <HistoryIcon name="reset" />
        <span>초기화</span>
      </button>
      {toast && (
        <div className="history-toast" role="status" data-testid="reset-toast">
          <span>처음 상태로 초기화했습니다.</span>
          <button className="btn btn-primary" onClick={undoReset} data-testid="reset-undo">
            취소
          </button>
        </div>
      )}
    </div>
  );
}
