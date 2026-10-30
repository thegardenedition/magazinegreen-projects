import { useEffect, useRef, useState } from 'react';
import { ACCEPTED_TYPES, loadImage } from './engine/image';
import { useGrade } from './state/store';
import { ExportDialog } from './ui/ExportDialog';
import { NodePanel } from './ui/NodePanel';
import { CorrectionPanel } from './ui/Panels';
import { PresetPanel } from './ui/PresetPanel';
import { ScopePanel } from './ui/ScopePanel';
import { Viewer } from './ui/Viewer';

export function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const image = useGrade((s) => s.image);
  const split = useGrade((s) => s.split);
  const bypass = useGrade((s) => s.bypass);
  const canUndo = useGrade((s) => s.past.length > 0);
  const canRedo = useGrade((s) => s.future.length > 0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => fileRef.current?.click();

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const prev = useGrade.getState().image;
      const img = await loadImage(file);
      useGrade.getState().setImage(img);
      if (prev) {
        prev.full.close();
        if (prev.proxy !== prev.full) prev.proxy.close();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input:not([type=range]), textarea')) return;
      const s = useGrade.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        open();
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (s.image) s.setExportOpen(true);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.toggleNode();
      } else if (e.altKey && !mod && e.code === 'KeyS') {
        e.preventDefault();
        s.addNode();
      } else if (e.shiftKey && !mod && !e.altKey && e.key.toLowerCase() === 'h') {
        s.setMaskView(s.maskView === 'off' ? 'highlight' : 'off');
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'b') {
        s.toggleBypass();
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 's') {
        s.toggleSplit();
      } else if (e.key === 'Escape') {
        s.setExportOpen(false);
        s.setViewerTool('none');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`app ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        load(e.dataTransfer.files[0]);
      }}
    >
      <header className="topbar">
        <div className="brand">
          GREEN <b>GRADE</b>
        </div>
        <button className="btn" onClick={open} title="사진 열기 (Ctrl+O)">
          열기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          hidden
          data-testid="file-input"
          onChange={(e) => {
            load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {image && (
          <span className="file-meta mono" data-testid="file-meta">
            {image.name} · {image.width}×{image.height}
          </span>
        )}
        {error && <span className="error">{error}</span>}
        <span className="spacer" />
        <button
          className="btn btn-ghost"
          onClick={() => useGrade.getState().undo()}
          disabled={!canUndo}
          title="되돌리기 (Ctrl+Z)"
          data-testid="undo"
        >
          ↶ 되돌리기
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => useGrade.getState().redo()}
          disabled={!canRedo}
          title="다시 실행 (Ctrl+Shift+Z)"
          data-testid="redo"
        >
          ↷ 다시 실행
        </button>
        <button
          className={`btn btn-toggle ${split ? 'on' : ''}`}
          onClick={() => useGrade.getState().toggleSplit()}
          disabled={!image}
          title="Before/After 분할 (S)"
        >
          분할
        </button>
        <button
          className={`btn btn-toggle ${bypass ? 'on' : ''}`}
          onClick={() => useGrade.getState().toggleBypass()}
          disabled={!image}
          title="원본 보기 (B)"
        >
          원본
        </button>
        <button
          className="btn btn-primary"
          onClick={() => useGrade.getState().setExportOpen(true)}
          disabled={!image}
          title="JPG 내보내기 (Ctrl+E)"
          data-testid="export-open"
        >
          내보내기
        </button>
      </header>

      <main className="workspace">
        <Viewer onOpen={open} />
        <NodePanel />
      </main>

      <footer className="dock">
        <ScopePanel />
        <CorrectionPanel />
        <PresetPanel />
      </footer>

      <ExportDialog />
    </div>
  );
}
