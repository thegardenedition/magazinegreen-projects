import { useState } from 'react';
import { outputSize } from '../engine/develop';
import { decodeFull, downloadBlob, exportFileName, exportJpeg, resizedSize } from '../engine/image';
import { getActiveRenderer } from '../engine/renderer';
import { currentUniforms, useGrade } from '../state/store';

/** 긴 변 제한 선택지 (null = 원본 크기) */
export const LONG_EDGES: Array<[number | null, string]> = [
  [null, '원본'],
  [4096, '4096'],
  [3000, '3000'],
  [2048, '2048'],
  [1600, '1600'],
  [1080, '1080'],
];

export function LongEdgeField({ value, onChange }: { value: number | null; onChange(v: number | null): void }) {
  return (
    <label className="quality">
      <span>긴 변</span>
      <select
        className="num"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        aria-label="긴 변 크기"
        data-testid="long-edge"
      >
        {LONG_EDGES.map(([v, label]) => (
          <option key={label} value={v ?? ''}>
            {v ? `${label} px` : label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ExportDialog() {
  const open = useGrade((s) => s.exportOpen);
  const setOpen = useGrade((s) => s.setExportOpen);
  const image = useGrade((s) => s.image);
  const geometry = useGrade((s) => s.develop.geometry);
  const [quality, setQuality] = useState(92);
  const [longEdge, setLongEdge] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open || !image) return null;

  const [cw, ch] = outputSize(geometry, image.width, image.height);
  const [ow, oh] = resizedSize(cw, ch, longEdge);
  const cropped = cw !== image.width || ch !== image.height;

  const run = async () => {
    const renderer = getActiveRenderer();
    if (!renderer) return;
    setError(null);
    setProgress(0);
    // 진행률 표시가 먼저 그려지도록 한 프레임 양보
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      // 원본 해상도는 내보낼 때만 디코딩하고 바로 놓아 준다
      const full = await decodeFull(image.file);
      let blob: Blob;
      try {
        blob = await exportJpeg(renderer, { ...image, full }, currentUniforms(), {
          quality: quality / 100,
          develop: useGrade.getState().develop,
          longEdge,
          onProgress: setProgress,
        });
      } finally {
        full.close();
      }
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
          <dd className="mono" data-testid="export-size">
            {ow} × {oh}
            {ow !== cw ? ` (긴 변 축소, ${cropped ? '크롭' : '원본'} ${cw} × ${ch})` : cropped ? ' (크롭)' : ' (원본)'}
          </dd>
        </dl>
        <LongEdgeField value={longEdge} onChange={setLongEdge} />
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
