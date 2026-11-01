import { HistoryIcon } from './HistoryBar';
import { maskState } from '../engine/mask';
import { selectedNode, useGrade, type CorrectionTab } from '../state/store';
import { CurvesPanel } from './CurvesPanel';
import { DetailPanel } from './DetailPanel';
import { HealPanel } from './HealPanel';
import { MixerPanel } from './MixerPanel';
import { QualifierPanel, WindowPanel } from './MaskPanels';
import { PrimaryPanel } from './PrimaryPanel';
import { TransformPanel } from './TransformPanel';

const CORRECTION_TABS: Array<{ id: CorrectionTab; label: string; phase: number }> = [
  { id: 'primary', label: 'Primary', phase: 1 },
  { id: 'curves', label: 'Curves', phase: 2 },
  { id: 'mixer', label: 'RGB Mixer', phase: 4 },
  { id: 'qualifier', label: 'HSL Qualifier', phase: 4 },
  { id: 'window', label: 'Window', phase: 4 },
  { id: 'transform', label: '형태', phase: 4 },
  { id: 'detail', label: '디테일', phase: 4 },
  { id: 'heal', label: '지우개', phase: 4 },
];

/**
 * 선택 노드에 창이나 Qualifier가 켜져 있으면, 보정이 화면 일부에만 걸린다는 것을 알리고 바로 풀 수 있게 한다.
 * (예: '비네트' 프리셋의 노드는 창 바깥=가장자리에만 적용된다)
 */
function MaskNotice() {
  const node = useGrade((s) => selectedNode(s));
  const { setWindow, setQualifier, addNode } = useGrade.getState();
  const m = maskState(node.qualifier, node.window);
  if (!m.window && !m.qualifier) return null;
  const where = [
    m.window ? (m.windowInvert ? '창 바깥(가장자리)' : '창 안쪽') : null,
    m.qualifier ? (m.qualifierInvert ? '고른 색을 뺀 부분' : 'HSL Qualifier로 고른 색') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="mask-notice" role="status" data-testid="mask-notice">
      <span>
        ‘{node.name}’ 노드의 보정은 <b>{where}</b>에만 적용됩니다.
      </span>
      {m.window && (
        <button className="btn btn-ghost" onClick={() => setWindow((w) => ({ ...w, enabled: false }))} data-testid="mask-notice-window-off">
          창 끄기
        </button>
      )}
      {m.qualifier && (
        <button className="btn btn-ghost" onClick={() => setQualifier((q) => ({ ...q, enabled: false }))} data-testid="mask-notice-qualifier-off">
          Qualifier 끄기
        </button>
      )}
      <button className="btn btn-ghost" onClick={addNode} title="이 노드 뒤에 사진 전체에 적용되는 새 노드를 만든다" data-testid="mask-notice-new-node">
        전체용 새 노드
      </button>
    </div>
  );
}

/** 노드가 아니라 사진 전체에 적용되는 탭 */
const PHOTO_TABS: CorrectionTab[] = ['transform', 'detail', 'heal'];

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
          <button className="btn btn-reset" onClick={resetPrimary} data-testid="reset-primary">
            <HistoryIcon name="reset" />
            Primary 초기화
          </button>
        )}
        {tab === 'curves' && (
          <button className="btn btn-reset" onClick={resetCurves} data-testid="reset-curves">
            <HistoryIcon name="reset" />
            커브 초기화
          </button>
        )}
        {tab === 'transform' && (
          <button className="btn btn-reset" onClick={resetGeometry} data-testid="reset-geometry">
            <HistoryIcon name="reset" />
            형태 초기화
          </button>
        )}
        {tab === 'detail' && (
          <button className="btn btn-reset" onClick={resetDetail} data-testid="reset-detail">
            <HistoryIcon name="reset" />
            디테일 초기화
          </button>
        )}
      </header>
      {(tab === 'primary' || tab === 'curves' || tab === 'mixer') && <MaskNotice />}
      {tab === 'primary' && <PrimaryPanel />}
      {tab === 'curves' && <CurvesPanel />}
      {tab === 'mixer' && <MixerPanel />}
      {tab === 'qualifier' && <QualifierPanel />}
      {tab === 'window' && <WindowPanel />}
      {tab === 'transform' && <TransformPanel />}
      {tab === 'detail' && <DetailPanel />}
      {tab === 'heal' && <HealPanel />}
    </section>
  );
}
