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
import { EasyAdjustPanel } from './ui/EasyAdjustPanel';
import { HealPanel } from './ui/HealPanel';
import { TransformPanel } from './ui/TransformPanel';
import { useUi, type UiMode } from './state/ui';
import type { CorrectionTab } from './state/store';

/** 휴대폰 아래 탭 */
type MobileTab = 'adjust' | 'nodes' | 'library' | 'scope' | 'photos' | 'crop' | 'heal';
const ICON = {
  adjust: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  nodes: 'M12 3v4M12 17v4M7 7h10v10H7z',
  library: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z',
  scope: 'M4 19h16M6 16l3-5 3 3 3-7 3 5',
  photos: 'M4 6h16v12H4zM4 15l5-4 4 3 3-2 4 3',
  crop: 'M7 3v14h14M3 7h14v14',
  heal: 'M15 4l5 5-9 9H6v-5zM4 20h16',
} as const;
const PRO_TABS: Array<[MobileTab, string]> = [
  ['adjust', '조정'],
  ['nodes', '노드'],
  ['library', '프리셋'],
  ['scope', '스코프'],
  ['photos', '사진'],
];
const EASY_TABS: Array<[MobileTab, string]> = [
  ['library', '프리셋'],
  ['adjust', '조정'],
  ['crop', '자르기'],
  ['heal', '지우개'],
  ['photos', '사진'],
];

/** 쉬운 모드 옆 패널 */
type EasyTab = 'library' | 'adjust' | 'crop' | 'heal';
const EASY_SIDE: Array<[EasyTab, string]> = [
  ['library', '프리셋'],
  ['adjust', '조정'],
  ['crop', '자르기·수평'],
  ['heal', '지우개'],
];
/** 쉬운 모드 탭에 맞는 보정 탭 (자르기는 화면에 원본 전체와 크롭 틀을, 지우개는 붓을 쓴다) */
const correctionFor = (t: MobileTab | EasyTab): CorrectionTab => (t === 'crop' ? 'transform' : t === 'heal' ? 'heal' : 'primary');

function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const mode = useUi((s) => s.mode);
  const set = (m: UiMode) => {
    useUi.getState().setMode(m);
    useGrade.getState().setCorrectionTab('primary');
  };
  return (
    <div className="mode-switch" role="group" aria-label="화면 모드">
      <button className={mode === 'easy' ? 'on' : ''} onClick={() => set('easy')} aria-pressed={mode === 'easy'} data-testid="mode-easy">
        {compact ? '쉬움' : '쉬운 모드'}
      </button>
      <button className={mode === 'pro' ? 'on' : ''} onClick={() => set('pro')} aria-pressed={mode === 'pro'} data-testid="mode-pro">
        {compact ? '전문' : '전문가 모드'}
      </button>
    </div>
  );
}

function FocusButton() {
  const focus = useUi((s) => s.focus);
  const image = useGrade((s) => s.image);
  return (
    <button
      className={`btn btn-toggle ${focus ? 'on' : ''}`}
      onClick={() => useUi.getState().toggleFocus()}
      disabled={!image}
      title="보정 패널을 숨기고 사진을 크게 (F)"
      data-testid="focus-toggle"
    >
      {focus ? '패널 보이기' : '크게 보기'}
    </button>
  );
}

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
  const mode = useUi((s) => s.mode);
  const focus = useUi((s) => s.focus);
  const easy = mode === 'easy';
  const [proTab, setProTab] = useState<MobileTab>('adjust');
  const [easyTab, setEasyTab] = useState<MobileTab>('library');
  const mobileTab = easy ? easyTab : proTab;
  const [sideTab, setSideTab] = useState<EasyTab>('library');
  /** 휴대폰: 지금 탭을 한 번 더 누르면 도구 칸을 접어 사진을 크게 */
  const [sheetClosed, setSheetClosed] = useState(false);
  const pickMobileTab = (t: MobileTab) => {
    if (t === mobileTab) {
      setSheetClosed((c) => !c);
      return;
    }
    setSheetClosed(false);
    if (easy) {
      setEasyTab(t);
      useGrade.getState().setCorrectionTab(correctionFor(t));
    } else setProTab(t);
  };
  // 모드를 바꾸면 각 모드의 첫 탭에서 시작한다
  useEffect(() => {
    setSideTab('library');
    setEasyTab('library');
    setSheetClosed(false);
  }, [mode]);
  const pickSideTab = (t: EasyTab) => {
    setSideTab(t);
    useGrade.getState().setCorrectionTab(correctionFor(t));
  };

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
      } else if (!mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        if (s.image) useUi.getState().toggleFocus();
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
    const tabs = easy ? EASY_TABS : PRO_TABS;
    const pane = (tab: MobileTab, node: React.ReactNode) => (
      <div className={`m-pane ${mobileTab === tab ? '' : 'm-hidden'}`} data-testid={`m-pane-${tab}`}>
        {node}
      </div>
    );
    const photos = hasItems ? (
      <Filmstrip onOpen={open} />
    ) : (
      <div className="m-empty">
        <p className="muted">열어 둔 사진이 없습니다.</p>
        <button className="btn btn-primary" onClick={open}>
          사진 열기
        </button>
      </div>
    );
    return (
      <div
        className={`app app-mobile ${easy ? 'app-easy' : ''} ${sheetClosed ? 'm-closed' : ''} ${dragging ? 'is-dragging' : ''}`}
        {...dropProps}
      >
        <header className="topbar m-topbar">
          <button className="btn" onClick={open} data-testid="open">
            열기
          </button>
          {fileInput}
          <ModeSwitch compact />
          <span className="spacer" />
          {!easy && (
            <button className={`btn btn-toggle ${split ? 'on' : ''}`} onClick={() => useGrade.getState().toggleSplit()} disabled={!image} aria-label="Before/After 분할">
              분할
            </button>
          )}
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
          {easy ? (
            <>
              {pane('library', <PresetPanel visible={mobileTab === 'library' && !sheetClosed} />)}
              {pane('adjust', <EasyAdjustPanel />)}
              {pane('crop', mobileTab === 'crop' && <div className="easy-pane"><TransformPanel /></div>)}
              {pane('heal', mobileTab === 'heal' && <div className="easy-pane"><HealPanel /></div>)}
              {pane('photos', photos)}
            </>
          ) : (
            <>
              {pane('adjust', <CorrectionPanel />)}
              {pane('nodes', <NodePanel />)}
              {pane('library', <PresetPanel visible={mobileTab === 'library'} />)}
              {pane('scope', <ScopePanel />)}
              {pane('photos', photos)}
            </>
          )}
        </section>
        <nav className="m-nav" aria-label="도구">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={`m-nav-btn ${mobileTab === id ? 'on' : ''}`}
              onClick={() => pickMobileTab(id)}
              aria-current={mobileTab === id ? 'page' : undefined}
              aria-expanded={mobileTab === id ? !sheetClosed : undefined}
              title={mobileTab === id ? (sheetClosed ? '도구 펼치기' : '한 번 더 누르면 도구를 접고 사진을 크게') : undefined}
              data-testid={`m-tab-${id}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={ICON[id]} />
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

  const topbar = (
    <header className="topbar">
      <div className="brand">
        GREEN <b>GRADE</b>
      </div>
      <ModeSwitch />
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
      <FocusButton />
      {!easy && (
        <button
          className={`btn btn-toggle ${split ? 'on' : ''}`}
          onClick={() => useGrade.getState().toggleSplit()}
          disabled={!image}
          title="Before/After 분할 (S)"
        >
          분할
        </button>
      )}
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
  );

  if (easy) {
    return (
      <div className={`app app-easy ${hasItems ? 'has-film' : ''} ${focus ? 'is-focus' : ''} ${dragging ? 'is-dragging' : ''}`} {...dropProps}>
        {topbar}
        <main className="easy-workspace">
          <Viewer onOpen={open} />
          <aside className="panel easy-side" data-testid="easy-side">
            <header className="tabs easy-tabs">
              {EASY_SIDE.map(([id, label]) => (
                <button key={id} className={`tab ${sideTab === id ? 'on' : ''}`} onClick={() => pickSideTab(id)} data-testid={`easy-tab-${id}`}>
                  {label}
                </button>
              ))}
            </header>
            <div className="easy-body">
              {sideTab === 'library' && <PresetPanel visible={!focus} />}
              {sideTab === 'adjust' && <EasyAdjustPanel />}
              {sideTab === 'crop' && (
                <div className="easy-pane">
                  <TransformPanel />
                </div>
              )}
              {sideTab === 'heal' && (
                <div className="easy-pane">
                  <HealPanel />
                </div>
              )}
            </div>
          </aside>
        </main>
        <Filmstrip onOpen={open} />
        <ExportDialog />
      </div>
    );
  }

  return (
    <div className={`app ${dragging ? 'is-dragging' : ''} ${hasItems ? 'has-film' : ''} ${focus ? 'is-focus' : ''}`} {...dropProps}>
      {topbar}

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
