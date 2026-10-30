import { useRef, useState } from 'react';
import { downloadBlob } from '../engine/image';
import { parseCube, serializeCube } from '../engine/lut';
import { bakeGradeLut, LUT_EXPORT_SIZES, windowNodeCount, type WindowHandling } from '../engine/lutExport';
import {
  BUILTIN_PRESETS,
  loadUserPresets,
  parsePreset,
  saveUserPresets,
  serializePreset,
  type Preset,
} from '../engine/presets';
import { currentPreset, currentUniforms, presetToNodes, selectedNode, useGrade } from '../state/store';

function applyPreset(p: Preset) {
  useGrade.getState().setNodes(presetToNodes(p));
}

const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'preset';

export function PresetPanel() {
  const [tab, setTab] = useState<'presets' | 'lut'>('presets');
  const [user, setUser] = useState<Preset[]>(loadUserPresets);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const presetFile = useRef<HTMLInputElement>(null);
  const lutFile = useRef<HTMLInputElement>(null);
  const node = useGrade((s) => selectedNode(s));
  const setLut = useGrade((s) => s.setLut);
  const setLutIntensity = useGrade((s) => s.setLutIntensity);

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

  const importLut = async (file: File | undefined) => {
    if (!file) return;
    try {
      const lut = parseCube(await file.text(), file.name);
      setLut(lut);
      setMessage({ text: `${lut.name} (${lut.size}³) → ${node.name}` });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
  };

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
          <div className="preset-group-title">정원 프리셋</div>
          <ul className="preset-list" data-testid="builtin-presets">
            {BUILTIN_PRESETS.map((p) => (
              <li key={p.name}>
                <button className="preset-item" onClick={() => applyPreset(p)} title={p.description}>
                  <span>{p.name}</span>
                  <span className="muted small">{p.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="preset-group-title">내 프리셋</div>
          {user.length === 0 && <p className="muted small preset-empty">저장한 프리셋이 없습니다.</p>}
          <ul className="preset-list" data-testid="user-presets">
            {user.map((p) => (
              <li key={p.name} className="preset-user">
                <button className="preset-item" onClick={() => applyPreset(p)}>
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
                .cube 3D LUT(최대 65³)를 이 노드에 적용합니다. LUT는 sRGB 사진 기준으로 만든 것을 쓰세요.
              </p>
              <button className="btn btn-primary" onClick={() => lutFile.current?.click()}>
                .cube 불러오기
              </button>
            </div>
          )}
          <LutExport />
          <input
            ref={lutFile}
            type="file"
            accept=".cube"
            hidden
            data-testid="lut-file"
            onChange={(e) => {
              importLut(e.target.files?.[0]);
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
