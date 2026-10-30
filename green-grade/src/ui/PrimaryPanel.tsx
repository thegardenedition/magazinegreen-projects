import { SCALAR_SPECS, type ScalarName, type WheelName } from '../engine/color';
import { useGrade } from '../state/store';
import { ColorWheel, jogFill } from './ColorWheel';
import { NumberField } from './NumberField';

const WHEELS: WheelName[] = ['lift', 'gamma', 'gain', 'offset'];
const SCALARS: ScalarName[] = ['temperature', 'tint', 'contrast', 'pivot', 'saturation', 'hue'];

function ScalarControl({ name }: { name: ScalarName }) {
  const spec = SCALAR_SPECS[name];
  const value = useGrade((s) => s.primary[name]);
  const setScalar = useGrade((s) => s.setScalar);
  const resetScalar = useGrade((s) => s.resetScalar);
  const digits = spec.step >= 1 ? 0 : spec.step >= 0.01 ? 2 : 3;

  return (
    <div className="scalar" onDoubleClick={() => resetScalar(name)} title="더블클릭: 리셋">
      <span className="scalar-label">{spec.label}</span>
      <div className="scalar-track">
        <span className="jog-fill" style={jogFill(spec.def, value, spec.min, spec.max)} />
        <input
          type="range"
          aria-label={spec.label}
          data-testid={`scalar-${name}`}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => setScalar(name, Number(e.target.value))}
        />
      </div>
      <NumberField
        label={`${spec.label} value`}
        value={value}
        digits={digits}
        min={spec.min}
        max={spec.max}
        onCommit={(v) => setScalar(name, v)}
      />
    </div>
  );
}

export function PrimaryPanel() {
  return (
    <div className="primary">
      <div className="wheels">
        {WHEELS.map((w) => (
          <ColorWheel key={w} name={w} />
        ))}
      </div>
      <div className="scalars">
        {SCALARS.map((s) => (
          <ScalarControl key={s} name={s} />
        ))}
      </div>
    </div>
  );
}
