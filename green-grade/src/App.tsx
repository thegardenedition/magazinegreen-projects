import { useEffect, useRef, useState } from 'react';
import { ACCEPTED_TYPES } from './engine/image';
import { addFiles, copyGrade, gradeSummary, pasteGrade, useGallery } from './state/gallery';
import { useGrade } from './state/store';
import { importAndApply, loadUserLuts } from './state/userLuts';
import { isLutFile } from './engine/lut';
import { ExportDialog } from './ui/ExportDialog';
import { Filmstrip } from './ui/Filmstrip';
import { NodePanel } from './ui/NodePanel';
import { HistoryBar } from './ui/HistoryBar';
import { CorrectionPanel } from './ui/Panels';
import { PresetPanel } from './ui/PresetPanel';
import { ScopePanel } from './ui/ScopePanel';
import { MOBILE_QUERY, useMediaQuery } from './ui/useMedia';
import { Viewer } from './ui/Viewer';

/** 휴대폰 아래 탭 */
type MobileTab = 'adjust' | 'nodes' | 'library' | 'scope' | 'photos';
const MOBILE_TABS: Array<[MobileTab, string, string]> = [
  ['adjust', '조정', 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4'],
  ['nodes', '노드', 'M12 3v4M12 17v4M7 7h10v10H7z'],
  ['library', '프리셋', 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z'],
  ['scope', '스코프', 'M4 19h16M6 16l3-5 3 3 3-7 3 5'],
  ['photos', '사진', 'M4 6h16v12H4zM4 15l5-4 4 3 3-2 4 3'],
];

export function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const image = useGrade((s) => s.image);
  const split = useGrade((s) => s.split);
  const bypass = useGrade((s) => s.bypass);
  const [dragging, setDragging] = useState(false);
  const error = useGallery((s) => s.error);
  const hasItems = useGallery((s) => s.items.length > 0);
  const itemCount = useGallery((s) => s.items.length);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [mobileTab, setMobileTab] = useState<MobileTab>('adjust');

  const open = () => fileRef.current?.click();
  // 사진은 필름스트립으로, .cube·.3dl은 내 LUT에 보관하고 선택 노드에 적용
  const load = (files: FileList | null | undefined) => {
    if (!files?.length) return;
    const all = Array.from(files);
    const luts = all.filter((f) => isLutFile(f.name));
    const images = all.filter((f) => !isLutFile(f.name));
    if (luts.length) importAndApply(luts);
    if (images.length) addFiles(images);
  };

  useEffect(() => {
    loadUserLuts();
  }, []);

  useEffect(() => {
    // E2E 테스트에서 사진별 그레이드를 확인할 때 쓴다
    (window as unknown as { __GG_GALLERY__: unknown }).__GG_GALLERY__ = { summary: gradeSummary };
  }, []);

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
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        if (!s.image) return;
        e.preventDefault();
        copyGrade();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'v') {
        if (!useGallery.getState().clipboard) return;
        e.preventDefault();
        pasteGrade();
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

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept={ACCEPTED_TYPES.join(',')}
      multiple
      hidden
      data-testid="file-input"
      onChange={(e) => {
        load(e.target.files);
        e.target.value = '';
      }}
    />
  );
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      load(e.dataTransfer.files);
    },
  };

  if (mobile) {
    const pane = (tab: MobileTab, node: React.ReactNode) => (
      <div className={`m-pane ${mobileTab === tab ? '' : 'm-hidden'}`} data-testid={`m-pane-${tab}`}>
        {node}
      </div>
    );
    return (
      <div className={`app app-mobile ${dragging ? 'is-dragging' : ''}`} {...dropProps}>
        <header className="topbar m-topbar">
          <div className="brand" aria-label="GREEN GRADE">
            G<b>G</b>
          </div>
          <button className="btn" onClick={open} data-testid="open">
            열기
          </button>
          {fileInput}
          <span className="spacer" />
          <button className={`btn btn-toggle ${split ? 'on' : ''}`} onClick={() => useGrade.getState().toggleSplit()} disabled={!image} aria-label="Before/After 분할">
            분할
          </button>
          <button className={`btn btn-toggle ${bypass ? 'on' : ''}`} onClick={() => useGrade.getState().toggleBypass()} disabled={!image} aria-label="원본 보기">
            원본
          </button>
          <button className="btn btn-primary" onClick={() => useGrade.getState().setExportOpen(true)} disabled={!image} data-testid="export-open">
            내보내기
          </button>
        </header>
        {(error || image) && (
          <div className="m-status">
            {image && (
              <span className="file-meta mono" data-testid="file-meta">
                {image.name} · {image.width}×{image.height}
              </span>
            )}
            {error && <span className="error">{error}</span>}
            {image && <HistoryBar compact />}
          </div>
        )}
        <main className="m-viewer">
          <Viewer onOpen={open} />
        </main>
        <section className="m-sheet" data-testid="m-sheet">
          {pane('adjust', <CorrectionPanel />)}
          {pane('nodes', <NodePanel />)}
          {pane('library', <PresetPanel visible={mobileTab === 'library'} />)}
          {pane('scope', <ScopePanel />)}
          {pane(
            'photos',
            hasItems ? (
              <Filmstrip onOpen={open} />
            ) : (
              <div className="m-empty">
                <p className="muted">열어 둔 사진이 없습니다.</p>
                <button className="btn btn-primary" onClick={open}>
                  사진 열기
                </button>
              </div>
            ),
          )}
        </section>
        <nav className="m-nav" aria-label="도구">
          {MOBILE_TABS.map(([id, label, icon]) => (
            <button
              key={id}
              className={`m-nav-btn ${mobileTab === id ? 'on' : ''}`}
              onClick={() => setMobileTab(id)}
              aria-current={mobileTab === id ? 'page' : undefined}
              data-testid={`m-tab-${id}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={icon} />
              </svg>
              <span>
                {label}
                {id === 'photos' && itemCount > 0 ? ` ${itemCount}` : ''}
              </span>
            </button>
          ))}
        </nav>
        <ExportDialog />
      </div>
    );
  }

  return (
    <div className={`app ${dragging ? 'is-dragging' : ''} ${hasItems ? 'has-film' : ''}`} {...dropProps}>
      <header className="topbar">
        <div className="brand">
          GREEN <b>GRADE</b>
        </div>
        <button className="btn" onClick={open} title="사진 열기 (Ctrl+O)">
          열기
        </button>
        {fileInput}
        {image && (
          <span className="file-meta mono" data-testid="file-meta">
            {image.name} · {image.width}×{image.height}
          </span>
        )}
        {error && <span className="error">{error}</span>}
        <span className="spacer" />
        <HistoryBar />
        <span className="topbar-sep" />
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

      <Filmstrip onOpen={open} />

      <footer className="dock">
        <ScopePanel />
        <CorrectionPanel />
        <PresetPanel />
      </footer>

      <ExportDialog />
    </div>
  );
}
