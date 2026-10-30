import { selectedNode, useGrade, type CorrectionTab } from '../state/store';
import { CurvesPanel } from './CurvesPanel';
import { DetailPanel } from './DetailPanel';
import { QualifierPanel, WindowPanel } from './MaskPanels';
import { PrimaryPanel } from './PrimaryPanel';
import { TransformPanel } from './TransformPanel';

const CORRECTION_TABS: Array<{ id: CorrectionTab; label: string; phase: number }> = [
  { id: 'primary', label: 'Primary', phase: 1 },
  { id: 'curves', label: 'Curves', phase: 2 },
  { id: 'qualifier', label: 'HSL Qualifier', phase: 4 },
  { id: 'window', label: 'Window', phase: 4 },
  { id: 'transform', label: '형태', phase: 4 },
  { id: 'detail', label: '디테일', phase: 4 },
];

/** 노드가 아니라 사진 전체에 적용되는 탭 */
const PHOTO_TABS: CorrectionTab[] = ['transform', 'detail'];

/** 지금 단계까지 구현된 탭 */
const AVAILABLE_PHASE = 4;

export function CorrectionPanel() {
  const tab = useGrade((s) => s.correctionTab);
  const setTab = useGrade((s) => s.setCorrectionTab);
  const resetPrimary = useGrade((s) => s.resetPrimary);
  const nodeName = useGrade((s) => selectedNode(s).name);
  const resetCurves = useGrade((s) => s.resetCurves);
  const resetGeometry = useGrade((s) => s.resetGeometry);
  const resetDetail = useGrade((s) => s.resetDetail);
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
          {PHOTO_TABS.includes(tab) ? '사진 전체' : nodeName}
        </span>
        {tab === 'primary' && (
          <button className="btn btn-ghost" onClick={resetPrimary} data-testid="reset-primary">
            Primary 리셋
          </button>
        )}
        {tab === 'curves' && (
          <button className="btn btn-ghost" onClick={resetCurves} data-testid="reset-curves">
            커브 전체 리셋
          </button>
        )}
        {tab === 'transform' && (
          <button className="btn btn-ghost" onClick={resetGeometry} data-testid="reset-geometry">
            형태 리셋
          </button>
        )}
        {tab === 'detail' && (
          <button className="btn btn-ghost" onClick={resetDetail} data-testid="reset-detail">
            디테일 리셋
          </button>
        )}
      </header>
      {tab === 'primary' && <PrimaryPanel />}
      {tab === 'curves' && <CurvesPanel />}
      {tab === 'qualifier' && <QualifierPanel />}
      {tab === 'window' && <WindowPanel />}
      {tab === 'transform' && <TransformPanel />}
      {tab === 'detail' && <DetailPanel />}
    </section>
  );
}
