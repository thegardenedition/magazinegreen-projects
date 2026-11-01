import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../engine/image';
import { serializeCube, type CubeLut } from '../engine/lut';
import { importAndApply, removeUserLut, useUserLuts, userLut } from '../state/userLuts';
import { bakeGradeLut, LUT_EXPORT_SIZES, windowNodeCount, type WindowHandling } from '../engine/lutExport';
import { buildLibraryLut, LUT_CATEGORIES, LUT_LIBRARY } from '../engine/lutLibrary';
import { buildLibraryZip, PACK_FOLDER } from '../engine/lutPack';
import {
  loadUserPresets,
  parsePreset,
  PRESET_CATEGORIES,
  saveUserPresets,
  serializePreset,
  type Preset,
} from '../engine/presets';
import { BUILTIN_PRESETS } from '../engine/presetLibrary';
import { applyPresetToItems, useGallery } from '../state/gallery';
import { applyPresetToGrade, currentPreset, currentUniforms, selectedNode, useGrade } from '../state/store';
import { LibraryList, type LibraryItem } from './LibraryList';
import { usePresetThumbs } from './usePresetThumbs';

const PRESET_ITEMS: LibraryItem[] = BUILTIN_PRESETS.map((p) => ({
  key: p.name,
  name: p.name,
  description: p.description ?? '',
  category: p.category,
}));

const LUT_ITEMS: LibraryItem[] = LUT_LIBRARY.map((l) => ({
  key: l.id,
  name: l.name,
  description: l.description,
  category: l.category,
}));

/** 프리셋 적용. 일괄 모드면 지금 사진과 필름스트립에서 고른 사진 모두에 */
function applyPreset(p: Preset, batch = false): number {
  const { selected, currentId } = useGallery.getState();
  if (batch && selected.length) {
    const ids = [...new Set([...(currentId ? [currentId] : []), ...selected])];
    return applyPresetToItems(p, ids);
  }
  applyPresetToGrade(p);
  return 1;
}

const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'preset';

/** visible: 휴대폰에서 이 패널이 보이는 탭인지 (안 보이면 썸네일을 만들지 않는다) */
export function PresetPanel({ visible = true }: { visible?: boolean }) {
  const [tab, setTab] = useState<'presets' | 'lut'>('presets');
  const [user, setUser] = useState<Preset[]>(loadUserPresets);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const presetFile = useRef<HTMLInputElement>(null);
  const lutFile = useRef<HTMLInputElement>(null);
  const node = useGrade((s) => selectedNode(s));
  const [batch, setBatch] = useState(false);
  const galleryCount = useGallery((s) => s.items.length);
  const selectedCount = useGallery((s) => s.selected.length);
  const setLut = useGrade((s) => s.setLut);
  const setLutIntensity = useGrade((s) => s.setLutIntensity);

  // 프리셋 탭이 열려 있을 때 지금 사진으로 미리보기 썸네일을 만든다
  const thumbs = usePresetThumbs(BUILTIN_PRESETS, visible && tab === 'presets');
  const presetItems = thumbs.size ? PRESET_ITEMS.map((it) => ({ ...it, thumb: thumbs.get(it.key) })) : PRESET_ITEMS;

  const storeUser = (list: Preset[]) => {
    setUser(list);
    const err = saveUserPresets(list);
    if (err) setMessage({ text: err, error: true });
  };

  const saveCurrent = () => {
    const n = name.trim();
    if (!n) return;
    const p = currentPreset(n);
    storeUser([...user.filter((u) => u.name !== n), p]);
    setNaming(false);
    setName('');
    setMessage({ text: `'${n}' 저장됨` });
  };

  const importPreset = async (file: File | undefined) => {
    if (!file) return;
    try {
      const p = parsePreset(await file.text());
      applyPreset(p);
      storeUser([...user.filter((u) => u.name !== p.name), p]);
      setMessage({ text: `'${p.name}' 불러옴` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

  const exportPreset = () => {
    const p = currentPreset(name.trim() || 'GREEN GRADE 프리셋');
    downloadBlob(new Blob([serializePreset(p)], { type: 'application/json' }), `${safeFileName(p.name)}.json`);
  };

  // 불러오기·끌어다 놓기 결과를 보여 주고 LUT 탭으로
  const notice = useUserLuts((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    setTab('lut');
    setMessage({ text: notice.text, error: notice.error });
  }, [notice]);

  return (
    <section className="panel panel-presets">
      <header className="tabs">
        <button className={`tab ${tab === 'presets' ? 'on' : ''}`} onClick={() => setTab('presets')}>
          Presets
        </button>
        <button className={`tab ${tab === 'lut' ? 'on' : ''}`} onClick={() => setTab('lut')} data-testid="tab-lut">
          LUT
        </button>
      </header>

      {tab === 'presets' ? (
        <div className="preset-body">
          {galleryCount > 1 && (
            <label className="check batch-apply" title="필름스트립에서 체크한 사진들에도 같은 프리셋을 한 번에 적용">
              <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} data-testid="preset-batch" />
              선택한 사진에도 적용 {selectedCount ? `(${selectedCount}장)` : '(필름스트립에서 사진을 체크하세요)'}
            </label>
          )}
          <LibraryList
            items={presetItems}
            categories={PRESET_CATEGORIES}
            onPick={(key) => {
              const p = BUILTIN_PRESETS.find((x) => x.name === key)!;
              const n = applyPreset(p, batch);
              setMessage({
                text: n > 1 ? `'${p.name}' → ${n}장에 적용` : `'${p.name}' 적용 (노드 ${p.nodes.length}개) — 되돌리기로 취소`,
              });
            }}
            testId="builtin-presets"
            placeholder={`프리셋 ${BUILTIN_PRESETS.length}종 검색`}
          />
          <div className="preset-group-title">내 프리셋</div>
          {user.length === 0 && <p className="muted small preset-empty">저장한 프리셋이 없습니다.</p>}
          <ul className="preset-list" data-testid="user-presets">
            {user.map((p) => (
              <li key={p.name} className="preset-user">
                <button className="preset-item" onClick={() => applyPreset(p, batch)}>
                  <span>{p.name}</span>
                  <span className="muted small">노드 {p.nodes.length}개</span>
                </button>
                <button
                  className="btn btn-ghost preset-del"
                  title="삭제"
                  onClick={() => storeUser(user.filter((u) => u !== p))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {naming ? (
            <div className="preset-save">
              <input
                className="num"
                autoFocus
                placeholder="프리셋 이름"
                aria-label="프리셋 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveCurrent();
                  if (e.key === 'Escape') setNaming(false);
                }}
              />
              <button className="btn btn-primary" onClick={saveCurrent} data-testid="preset-save-confirm">
                저장
              </button>
            </div>
          ) : (
            <div className="preset-actions">
              <button className="btn" onClick={() => setNaming(true)} data-testid="preset-save">
                현재 그레이드 저장
              </button>
              <button className="btn" onClick={exportPreset} data-testid="preset-export">
                JSON 내보내기
              </button>
              <button className="btn" onClick={() => presetFile.current?.click()}>
                JSON 불러오기
              </button>
            </div>
          )}
          <input
            ref={presetFile}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="preset-file"
            onChange={(e) => {
              importPreset(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="preset-body">
          <div className="preset-group-title">
            선택 노드 <b>{node.name}</b>
          </div>
          {node.lut ? (
            <div className="lut-info" data-testid="lut-info">
              <div className="mono">{node.lut.name}</div>
              <div className="muted small">
                {node.lut.size}×{node.lut.size}×{node.lut.size} · 노드 보정 뒤에 적용
              </div>
              <label className="lut-intensity">
                <span>강도</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={node.lutIntensity}
                  aria-label="LUT 강도"
                  data-testid="lut-intensity"
                  onChange={(e) => setLutIntensity(Number(e.target.value))}
                />
                <span className="mono">{Math.round(node.lutIntensity * 100)}%</span>
              </label>
              <div className="preset-actions">
                <button className="btn" onClick={() => lutFile.current?.click()}>
                  바꾸기
                </button>
                <button className="btn" onClick={() => setLut(null)} data-testid="lut-remove">
                  제거
                </button>
              </div>
            </div>
          ) : (
            <div className="lut-info">
              <p className="muted small">
                .cube·.3dl LUT(최대 65³, 1D 포함)를 이 노드에 적용합니다. 여러 개를 한 번에 고르거나 화면에 끌어다 놓으면
                모두 '내 LUT'에 보관됩니다. LUT는 sRGB 사진 기준으로 만든 것을 쓰세요.
              </p>
              <button className="btn btn-primary" onClick={() => lutFile.current?.click()} data-testid="lut-open">
                LUT 파일 불러오기
              </button>
            </div>
          )}
          <UserLutList onApply={(lut) => {
            setLut(lut);
            setMessage({ text: `${lut.name} → ${node.name}` });
          }} activeName={node.lut?.name ?? null} />
          <div className="preset-group-title">LUT 라이브러리 · 누르면 선택 노드에 적용</div>
          <LibraryList
            items={LUT_ITEMS}
            categories={LUT_CATEGORIES}
            activeKey={LUT_LIBRARY.find((l) => l.name === node.lut?.name)?.id ?? null}
            onPick={(id) => {
              const lut = buildLibraryLut(id);
              setLut(lut);
              setMessage({ text: `${lut.name} → ${node.name}` });
            }}
            testId="lut-library"
            placeholder={`LUT ${LUT_LIBRARY.length}종 검색`}
          />
          <LibraryPackDownload />
          <LutExport />
          <input
            ref={lutFile}
            type="file"
            accept=".cube,.3dl"
            hidden
            data-testid="lut-file"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) importAndApply(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </div>
      )}
      {message && (
        <p className={`preset-msg small ${message.error ? 'error' : 'muted'}`} data-testid="preset-msg">
          {message.text}
        </p>
      )}
    </section>
  );
}

/** 내 LUT: 불러온 파일을 보관한 목록. 누르면 적용, ×로 삭제 */
function UserLutList({ onApply, activeName }: { onApply(lut: CubeLut): void; activeName: string | null }) {
  const items = useUserLuts((s) => s.items);
  return (
    <div className="user-luts" data-testid="user-luts">
      <div className="preset-group-title">내 LUT {items.length ? `· ${items.length}개` : ''}</div>
      {items.length === 0 ? (
        <p className="muted small preset-empty">불러온 .cube·.3dl 파일이 여기 보관됩니다 (이 브라우저에 저장).</p>
      ) : (
        <ul className="preset-list">
          {items.map((it) => (
            <li key={it.id} className="user-lut">
              <button
                className={`preset-item ${activeName === it.name ? 'active' : ''}`}
                onClick={() => onApply(userLut(it.id))}
                data-testid="user-lut-item"
              >
                <span>{it.name}</span>
                <span className="muted small">
                  {it.fileName} · {it.size}³
                </span>
              </button>
              <button className="btn btn-ghost user-lut-remove" onClick={() => removeUserLut(it.id)} aria-label={`${it.name} 삭제`} data-testid="user-lut-remove">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 라이브러리 전체를 .cube ZIP으로 (DaVinci Resolve 등에서 쓰기) */
function LibraryPackDownload() {
  const [progress, setProgress] = useState<string | null>(null);
  const run = async () => {
    setProgress('0%');
    try {
      const zip = await buildLibraryZip((done, total) => setProgress(`${Math.round((done / total) * 100)}%`));
      downloadBlob(zip, `${PACK_FOLDER}.zip`);
    } finally {
      setProgress(null);
    }
  };
  return (
    <div className="lut-export">
      <button className="btn" onClick={run} disabled={progress !== null} data-testid="lut-pack">
        {progress === null ? `라이브러리 ${LUT_LIBRARY.length}종 .cube 받기 (ZIP)` : `만드는 중 ${progress}`}
      </button>
      <span className="muted small">DaVinci Resolve의 LUT 폴더에 넣어 바로 쓸 수 있습니다.</span>
    </div>
  );
}

/** 지금의 그레이드(켜진 노드 전체)를 .cube로 굽기 */
function LutExport() {
  const [size, setSize] = useState<number>(33);
  const [mode, setMode] = useState<WindowHandling>('exclude');
  const [progress, setProgress] = useState<number | null>(null);
  const windows = useGrade((s) => windowNodeCount(currentUniforms(s)));

  const run = async () => {
    setProgress(0);
    try {
      const lut = await bakeGradeLut(currentUniforms(), size, mode, 'GREEN GRADE', setProgress);
      downloadBlob(new Blob([serializeCube(lut)], { type: 'text/plain' }), `GREEN_GRADE_${size}.cube`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="lut-export">
      <div className="preset-group-title">그레이드를 LUT로 내보내기</div>
      <p className="muted small">
        켜진 노드 전체를 하나의 .cube로 굽습니다. 다른 편집 프로그램이나 카메라 모니터에서 같은 인상을 낼 때 씁니다.
      </p>
      <div className="seg">
        <span className="muted small">크기</span>
        {LUT_EXPORT_SIZES.map((n) => (
          <button key={n} className={`chip ${size === n ? 'on' : ''}`} onClick={() => setSize(n)} data-testid={`lut-size-${n}`}>
            {n}³
          </button>
        ))}
      </div>
      {windows > 0 && (
        <div className="lut-window-mode">
          <p className="small">
            창(Window)이 켜진 노드 {windows}개: 창은 위치 정보라 LUT에 담기지 않습니다.
          </p>
          <label className="small">
            <input type="radio" checked={mode === 'exclude'} onChange={() => setMode('exclude')} data-testid="lut-window-exclude" />
            그 노드를 빼고 굽기
          </label>
          <label className="small">
            <input type="radio" checked={mode === 'ignore'} onChange={() => setMode('ignore')} data-testid="lut-window-ignore" />
            창을 무시하고 화면 전체에 적용해 굽기
          </label>
        </div>
      )}
      <button className="btn" onClick={run} disabled={progress !== null} data-testid="lut-export">
        {progress === null ? '.cube 내보내기' : `계산 중 ${Math.round(progress * 100)}%`}
      </button>
    </div>
  );
}
