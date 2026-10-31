import { useState } from 'react';
import { downloadBlob } from '../engine/image';
import { LongEdgeField } from './ExportDialog';
import { MOBILE_QUERY, useMediaQuery } from './useMedia';
import {
  copyGrade,
  exportBatch,
  openItem,
  pasteGrade,
  removeItem,
  selectAll,
  selectRange,
  toggleSelect,
  useGallery,
} from '../state/gallery';

export function Filmstrip({ onOpen }: { onOpen: () => void }) {
  const items = useGallery((s) => s.items);
  const currentId = useGallery((s) => s.currentId);
  const selected = useGallery((s) => s.selected);
  const clipboard = useGallery((s) => s.clipboard);
  const busy = useGallery((s) => s.busy);
  const error = useGallery((s) => s.error);
  const [note, setNote] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const mobile = useMediaQuery(MOBILE_QUERY);

  if (!items.length) return null;

  const onThumbClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey) selectRange(id);
    else if (e.metaKey || e.ctrlKey) toggleSelect(id);
    else openItem(id);
  };

  return (
    <section className="filmstrip" data-testid="filmstrip">
      <div className="film-tools">
        <span className="muted small mono" data-testid="film-count">
          {items.length}장 · 선택 {selected.length}
        </span>
        <button className="btn" onClick={() => selectAll(selected.length < items.length)} data-testid="film-select-all">
          {selected.length < items.length ? '모두 선택' : '선택 해제'}
        </button>
        <button
          className="btn"
          onClick={() => {
            copyGrade();
            setNote('지금 사진의 그레이드를 복사했습니다');
          }}
          title="지금 사진의 그레이드 복사 (Ctrl+C)"
          data-testid="grade-copy"
        >
          그레이드 복사
        </button>
        <button
          className="btn"
          disabled={!clipboard || !selected.length}
          onClick={() => setNote(`${pasteGrade()}장에 붙여 넣었습니다`)}
          title="고른 사진들에 붙여넣기 (Ctrl+V)"
          data-testid="grade-paste"
        >
          선택에 붙여넣기
        </button>
        <button className="btn btn-primary" disabled={!selected.length} onClick={() => setBatchOpen(true)} data-testid="batch-open">
          선택 {selected.length}장 내보내기
        </button>
        <button className="btn btn-ghost" onClick={onOpen}>
          + 사진 추가
        </button>
        <span className={`small film-note ${error ? 'error' : 'muted'}`} data-testid="film-note">
          {busy ?? error ?? note ?? (clipboard ? `클립보드: ${clipboard.from}의 그레이드` : (mobile ? '체크 상자로 여러 장 선택' : 'Ctrl/⌘+클릭 여러 장 선택 · Shift+클릭 범위 선택'))}
        </span>
      </div>
      <ul className="film-list">
        {items.map((it) => {
          const sel = selected.includes(it.id);
          return (
            <li
              key={it.id}
              className={`film-item ${it.id === currentId ? 'current' : ''} ${sel ? 'selected' : ''}`}
              data-testid="film-item"
              data-current={it.id === currentId}
              data-selected={sel}
              title={it.name}
            >
              <button className="film-thumb" onClick={(e) => onThumbClick(e, it.id)}>
                {it.thumbUrl ? <img src={it.thumbUrl} alt={it.name} draggable={false} /> : <span className="film-wait" />}
              </button>
              <label className="film-check" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={sel} onChange={() => toggleSelect(it.id)} aria-label={`${it.name} 선택`} />
              </label>
              {it.id !== currentId && (
                <button className="film-remove" onClick={() => removeItem(it.id)} aria-label={`${it.name} 목록에서 빼기`}>
                  ×
                </button>
              )}
              <span className="film-name">{it.name}</span>
            </li>
          );
        })}
      </ul>
      {batchOpen && <BatchExportDialog ids={selected} onClose={() => setBatchOpen(false)} />}
    </section>
  );
}

function BatchExportDialog({ ids, onClose }: { ids: string[]; onClose(): void }) {
  const [quality, setQuality] = useState(92);
  const [longEdge, setLongEdge] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      const zip = await exportBatch(ids, { quality: quality / 100, longEdge }, (done, total, name) => setProgress({ done, total, name }));
      downloadBlob(zip, `GREEN_GRADE_${ids.length}장.zip`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="modal-back" onClick={() => !progress && onClose()}>
      <div className="modal" role="dialog" aria-label="일괄 내보내기" onClick={(e) => e.stopPropagation()}>
        <h2>선택 {ids.length}장 내보내기</h2>
        <p className="muted small">
          사진마다 자기 그레이드·크롭·디테일로 JPG를 만들어 ZIP 하나로 묶습니다. 파일 이름은 원래 이름 뒤에 _GG가 붙습니다.
        </p>
        <LongEdgeField value={longEdge} onChange={setLongEdge} />
        <label className="quality">
          <span>품질</span>
          <input type="range" min={50} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} aria-label="JPG 품질" />
          <span className="mono">{quality}</span>
        </label>
        {progress && (
          <p className="small mono" data-testid="batch-progress">
            {progress.done}/{progress.total} {progress.name}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={!!progress}>
            취소
          </button>
          <button className="btn btn-primary" onClick={run} disabled={!!progress} data-testid="batch-confirm">
            {progress ? '렌더링 중…' : 'ZIP으로 내보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
