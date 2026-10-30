import { DETAIL_NAMES, DETAIL_SPECS, type DetailName } from '../engine/develop';
import { useGrade } from '../state/store';
import { RangeControl } from './RangeControl';

const GROUPS = [...new Set(DETAIL_NAMES.map((n) => DETAIL_SPECS[n].group))];

function DetailControl({ name }: { name: DetailName }) {
  const spec = DETAIL_SPECS[name];
  const value = useGrade((s) => s.develop.detail[name]);
  const setDetail = useGrade((s) => s.setDetail);
  return (
    <RangeControl
      label={spec.label}
      value={value}
      def={spec.def}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      onChange={(v) => setDetail(name, v)}
      testId={`detail-${name}`}
    />
  );
}

/** 디테일: 샤프닝, 노이즈 감소, 텍스처·선명도·디헤이즈, 그레인 (사진 전체, 노드 보정 앞) */
export function DetailPanel() {
  return (
    <div className="primary develop-panel">
      <div className="detail-groups">
        {GROUPS.map((group) => (
          <section key={group} className="detail-group">
            <h3>{group}</h3>
            {DETAIL_NAMES.filter((n) => DETAIL_SPECS[n].group === group).map((n) => (
              <DetailControl key={n} name={n} />
            ))}
          </section>
        ))}
      </div>
      <p className="muted small">
        샤프닝·노이즈 감소는 원본 픽셀 기준이라, 축소본인 화면 미리보기에서는 약하게 보입니다. 100% 확대로 확인하고, 최종 결과는
        내보낸 JPG로 판단하세요.
      </p>
    </div>
  );
}
