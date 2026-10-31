import { useState } from 'react';
import { LOG_WHEELS, PRIMARY_WHEELS, SCALAR_SPECS, type ScalarName } from '../engine/color';
import { selectedNode, useGrade } from '../state/store';
import { ColorWheel, jogFill } from './ColorWheel';
import { NumberField } from './NumberField';

const SCALARS: ScalarName[] = ['temperature', 'tint', 'contrast', 'pivot', 'saturation', 'hue', 'shadows', 'highlights', 'colorBoost'];
const LOG_SCALARS: ScalarName[] = ['lowRange', 'highRange'];

function ScalarControl({ name }: { name: ScalarName }) {
  const spec = SCALAR_SPECS[name];
  const value = useGrade((s) => selectedNode(s).primary[name]);
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
  // DaVinci처럼 Primary 휠(Lift/Gamma/Gain)과 Log 휠(Shadow/Midtone/Highlight)을 바꿔 본다. 두 휠은 함께 적용된다.
  const [mode, setMode] = useState<'primary' | 'log'>('primary');
  return (
    <div className="primary">
      <div className="wheel-mode library-chips">
        <button className={`chip ${mode === 'primary' ? 'on' : ''}`} onClick={() => setMode('primary')} data-testid="wheels-primary">
          Primary 휠
        </button>
        <button className={`chip ${mode === 'log' ? 'on' : ''}`} onClick={() => setMode('log')} data-testid="wheels-log">
          Log 휠
        </button>
        <span className="muted small">
          {mode === 'log' ? 'Low Range 아래 = Shadow, High Range 위 = Highlight, 사이 = Midtone' : 'Lift = 검정 쪽, Gamma = 중간, Gain = 흰색 쪽'}
        </span>
      </div>
      <div className="wheels">
        {(mode === 'primary' ? PRIMARY_WHEELS : LOG_WHEELS).map((w) => (
          <ColorWheel key={w} name={w} />
        ))}
      </div>
      <div className="scalars">
        {(mode === 'log' ? [...LOG_SCALARS, ...SCALARS] : SCALARS).map((s) => (
          <ScalarControl key={s} name={s} />
        ))}
      </div>
    </div>
  );
}
