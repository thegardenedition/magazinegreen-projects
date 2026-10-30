import { useState } from 'react';
import { downloadBlob, exportFileName, exportJpeg } from '../engine/image';
import { getActiveRenderer } from '../engine/renderer';
import { useGrade } from '../state/store';

export function ExportDialog() {
  const open = useGrade((s) => s.exportOpen);
  const setOpen = useGrade((s) => s.setExportOpen);
  const image = useGrade((s) => s.image);
  const [quality, setQuality] = useState(92);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open || !image) return null;

  const run = async () => {
    const renderer = getActiveRenderer();
    if (!renderer) return;
    setError(null);
    setProgress(0);
    // 진행률 표시가 먼저 그려지도록 한 프레임 양보
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const { primary, nodeEnabled } = useGrade.getState();
      const blob = await exportJpeg(renderer, image, primary, nodeEnabled, quality / 100, setProgress);
      downloadBlob(blob, exportFileName(image.name, 'jpg'));
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="modal-back" onClick={() => progress === null && setOpen(false)}>
      <div className="modal" role="dialog" aria-label="JPG 내보내기" onClick={(e) => e.stopPropagation()}>
        <h2>JPG 내보내기</h2>
        <dl className="kv">
          <dt>파일명</dt>
          <dd className="mono">{exportFileName(image.name, 'jpg')}</dd>
          <dt>해상도</dt>
          <dd className="mono">
            {image.width} × {image.height} (원본)
          </dd>
        </dl>
        <label className="quality">
          <span>품질</span>
          <input
            type="range"
            min={50}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            aria-label="JPG 품질"
          />
          <span className="mono">{quality}</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={() => setOpen(false)} disabled={progress !== null}>
            취소
          </button>
          <button className="btn btn-primary" onClick={run} disabled={progress !== null} data-testid="export-confirm">
            {progress === null ? '내보내기' : `렌더링 ${Math.round(progress * 100)}%`}
          </button>
        </div>
      </div>
    </div>
  );
}
