import { defaultPrimary, SCALAR_SPECS, type ScalarName } from '../engine/color';
import { DETAIL_SPECS, type DetailName } from '../engine/develop';
import { basicNodeOf, updateBasicPrimary, useGrade } from '../state/store';
import { useUi } from '../state/ui';
import { RangeControl } from './RangeControl';

const DEF = defaultPrimary();

/** 쉬운 이름의 Primary 슬라이더 (기본 보정 노드) */
function BasicScalar({ name, label, min, max }: { name: ScalarName; label: string; min?: number; max?: number }) {
  const spec = SCALAR_SPECS[name];
  const value = useGrade((s) => basicNodeOf(s)?.primary[name] ?? DEF[name]);
  return (
    <RangeControl
      label={label}
      value={value}
      def={spec.def}
      min={min ?? spec.min}
      max={max ?? spec.max}
      step={spec.step}
      onChange={(v) => updateBasicPrimary(() => ({ [name]: v }))}
      testId={`easy-${name}`}
    />
  );
}

/** 밝기: 노출(EV) — Offset 다이얼 */
function Exposure() {
  const value = useGrade((s) => basicNodeOf(s)?.primary.offset.master ?? 0);
  return (
    <RangeControl
      label="밝기"
      value={value}
      def={0}
      min={-2}
      max={2}
      step={0.05}
      onChange={(v) => updateBasicPrimary((p) => ({ offset: { ...p.offset, master: v } }))}
      testId="easy-exposure"
    />
  );
}

/** 사진 전체의 디테일 값 */
function BasicDetail({ name, label }: { name: DetailName; label: string }) {
  const spec = DETAIL_SPECS[name];
  const value = useGrade((s) => s.develop.detail[name]);
  const setDetail = useGrade((s) => s.setDetail);
  return (
    <RangeControl
      label={label}
      value={value}
      def={spec.def}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      onChange={(v) => setDetail(name, v)}
      testId={`easy-${name}`}
    />
  );
}

/** 쉬운 모드의 '조정': 자주 쓰는 값만, 쉬운 이름으로 */
export function EasyAdjustPanel() {
  const image = useGrade((s) => s.image);
  return (
    <div className="easy-adjust" data-testid="easy-adjust">
      {!image && <p className="muted small">사진을 열면 조정할 수 있습니다.</p>}
      <section className="easy-group">
        <h3>빛</h3>
        <Exposure />
        <BasicScalar name="contrast" label="대비" min={0.5} max={1.5} />
        <BasicScalar name="highlights" label="밝은 곳" />
        <BasicScalar name="shadows" label="어두운 곳" />
      </section>
      <section className="easy-group">
        <h3>색</h3>
        <BasicScalar name="temperature" label="색온도" />
        <BasicScalar name="tint" label="색조" />
        <BasicScalar name="saturation" label="채도" />
        <BasicScalar name="colorBoost" label="생동감" />
      </section>
      <section className="easy-group">
        <h3>질감 · 효과</h3>
        <BasicDetail name="sharpen" label="선명하게" />
        <BasicDetail name="clarity" label="또렷함" />
        <BasicDetail name="dehaze" label="안개 제거" />
        <BasicDetail name="vignette" label="가장자리" />
        <BasicDetail name="grain" label="필름 입자" />
      </section>
      <p className="muted small easy-hint">
        이름을 두 번 누르면 그 값만 처음으로 돌아갑니다. 프리셋을 바꿔도 여기서 맞춘 값은 그대로 남습니다. 커브·색 휠·노드는{' '}
        <button className="link" onClick={() => useUi.getState().setMode('pro')}>
          전문가 모드
        </button>
        에 있습니다.
      </p>
    </div>
  );
}
