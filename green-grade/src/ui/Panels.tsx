import { useState } from 'react';
import { useGrade } from '../state/store';
import { CurvesPanel } from './CurvesPanel';
import { PrimaryPanel } from './PrimaryPanel';

function Placeholder({ phase, children }: { phase: number; children: string }) {
  return (
    <div className="placeholder">
      <span className="phase-tag">Phase {phase}</span>
      <p>{children}</p>
    </div>
  );
}

const CORRECTION_TABS = [
  { id: 'primary', label: 'Primary', phase: 1 },
  { id: 'curves', label: 'Curves', phase: 2 },
  { id: 'qualifier', label: 'HSL Qualifier', phase: 4 },
  { id: 'window', label: 'Window', phase: 4 },
];

/** 지금 단계까지 구현된 탭 */
const AVAILABLE_PHASE = 2;

export function CorrectionPanel() {
  const [tab, setTab] = useState('primary');
  const resetPrimary = useGrade((s) => s.resetPrimary);
  const resetCurves = useGrade((s) => s.resetCurves);
  return (
    <section className="panel panel-correction">
      <header className="tabs">
        {CORRECTION_TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${t.id === tab ? 'on' : ''}`}
            disabled={t.phase > AVAILABLE_PHASE}
            title={t.phase > AVAILABLE_PHASE ? `Phase ${t.phase}에서 제공` : undefined}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
        <span className="spacer" />
        {tab === 'primary' ? (
          <button className="btn btn-ghost" onClick={resetPrimary} data-testid="reset-primary">
            Primary 리셋
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={resetCurves} data-testid="reset-curves">
            커브 전체 리셋
          </button>
        )}
      </header>
      {tab === 'primary' ? <PrimaryPanel /> : <CurvesPanel />}
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
