import { jogFill } from './ColorWheel';
import { NumberField } from './NumberField';

interface Props {
  label: string;
  value: number;
  def: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
  testId: string;
}

/** 이름 · 슬라이더 · 숫자 칸 한 줄. 더블클릭하면 기본값으로. */
export function RangeControl({ label, value, def, min, max, step, onChange, testId }: Props) {
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (
    <div className="scalar" onDoubleClick={() => onChange(def)} title="더블클릭: 리셋">
      <span className="scalar-label">{label}</span>
      <div className="scalar-track">
        <span className="jog-fill" style={jogFill(def, value, min, max)} />
        <input
          type="range"
          aria-label={label}
          data-testid={testId}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <NumberField label={`${label} value`} value={value} digits={digits} min={min} max={max} onCommit={onChange} />
    </div>
  );
}
