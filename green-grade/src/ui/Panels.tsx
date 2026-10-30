import { useState } from 'react';
import { selectedNode, useGrade } from '../state/store';
import { CurvesPanel } from './CurvesPanel';
import { PrimaryPanel } from './PrimaryPanel';

const CORRECTION_TABS = [
  { id: 'primary', label: 'Primary', phase: 1 },
  { id: 'curves', label: 'Curves', phase: 2 },
  { id: 'qualifier', label: 'HSL Qualifier', phase: 4 },
  { id: 'window', label: 'Window', phase: 4 },
];

/** 지금 단계까지 구현된 탭 */
const AVAILABLE_PHASE = 3;

export function CorrectionPanel() {
  const [tab, setTab] = useState('primary');
  const resetPrimary = useGrade((s) => s.resetPrimary);
  const nodeName = useGrade((s) => selectedNode(s).name);
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
        <span className="muted small node-badge" data-testid="editing-node">
          {nodeName}
        </span>
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
