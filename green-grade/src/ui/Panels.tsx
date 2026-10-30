import { useState } from 'react';
import { useGrade } from '../state/store';
import { PrimaryPanel } from './PrimaryPanel';

function Placeholder({ phase, children }: { phase: number; children: string }) {
  return (
    <div className="placeholder">
      <span className="phase-tag">Phase {phase}</span>
      <p>{children}</p>
    </div>
  );
}

const SCOPE_TABS = ['Waveform', 'Parade', 'Vectorscope', 'Histogram'];

export function ScopePanel() {
  const [tab, setTab] = useState(SCOPE_TABS[0]);
  return (
    <section className="panel">
      <header className="tabs">
        {SCOPE_TABS.map((t) => (
          <button key={t} className={`tab ${t === tab ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </header>
      <Placeholder phase={2}>{`${tab} 스코프는 다음 단계에서 GPU로 실시간 계산해 표시합니다.`}</Placeholder>
    </section>
  );
}

const CORRECTION_TABS = [
  { id: 'primary', label: 'Primary', phase: 1 },
  { id: 'curves', label: 'Curves', phase: 2 },
  { id: 'qualifier', label: 'HSL Qualifier', phase: 4 },
  { id: 'window', label: 'Window', phase: 4 },
];

export function CorrectionPanel() {
  const resetPrimary = useGrade((s) => s.resetPrimary);
  return (
    <section className="panel panel-correction">
      <header className="tabs">
        {CORRECTION_TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${t.phase === 1 ? 'on' : ''}`}
            disabled={t.phase > 1}
            title={t.phase > 1 ? `Phase ${t.phase}에서 제공` : undefined}
          >
            {t.label}
          </button>
        ))}
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={resetPrimary} data-testid="reset-primary">
          Primary 리셋
        </button>
      </header>
      <PrimaryPanel />
    </section>
  );
}

export function NodePanel() {
  const enabled = useGrade((s) => s.nodeEnabled);
  const toggle = useGrade((s) => s.toggleNode);
  return (
    <aside className="panel panel-nodes">
      <header className="tabs">
        <span className="tab on">Nodes</span>
      </header>
      <div className="node-graph">
        <span className="node-io">IN</span>
        <span className="node-wire" />
        <div className={`node ${enabled ? '' : 'node-off'}`} data-testid="node-01">
          <div className="node-head">
            <span className="mono">01</span>
            <span>Primary</span>
            <button
              className="node-toggle"
              onClick={toggle}
              aria-pressed={enabled}
              title="노드 켜기/끄기 (Ctrl+D)"
            >
              {enabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <span className="node-wire" />
        <span className="node-io">OUT</span>
      </div>
      <p className="muted small">노드 추가·복제·순서 변경은 Phase 3에서 제공합니다.</p>
    </aside>
  );
}

export function PresetPanel() {
  return (
    <section className="panel">
      <header className="tabs">
        <span className="tab on">Presets & LUT</span>
      </header>
      <Placeholder phase={3}>정원 특화 프리셋 5종과 .cube LUT 불러오기는 Phase 3에서 제공합니다.</Placeholder>
    </section>
  );
}
