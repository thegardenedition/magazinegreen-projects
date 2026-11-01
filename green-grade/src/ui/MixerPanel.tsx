import { HistoryIcon } from './HistoryBar';
import { defaultMixer, type Vec3 } from '../engine/color';
import { selectedNode, useGrade } from '../state/store';
import { RangeControl } from './RangeControl';

const OUT: Array<[string, string]> = [
  ['R', '#e07a6e'],
  ['G', '#7fbf6a'],
  ['B', '#6f9be0'],
];

/**
 * RGB Mixer (DaVinci의 같은 이름 팔레트): 출력 채널마다 입력 R·G·B를 얼마나 섞을지 정한다.
 * 흑백을 켜면 '출력 R' 행 하나로 흑백을 만든다 (예: R 0.2 · G 0.7 · B 0.1이면 잎이 밝은 흑백).
 */
export function MixerPanel() {
  const mixer = useGrade((s) => selectedNode(s).primary.mixer ?? defaultMixer());
  const setMixer = useGrade((s) => s.setMixer);
  const setCell = (row: number, col: number, v: number) =>
    setMixer((m) => ({ ...m, rows: m.rows.map((r, i) => (i === row ? (r.map((x, j) => (j === col ? v : x)) as Vec3) : r)) as typeof m.rows }));
  const rows = mixer.mono ? [0] : [0, 1, 2];

  return (
    <div className="primary mixer-panel">
      <div className="develop-row">
        <label className="check">
          <input type="checkbox" checked={mixer.mono} onChange={(e) => setMixer((m) => ({ ...m, mono: e.target.checked }))} data-testid="mixer-mono" />
          흑백
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={mixer.preserve}
            onChange={(e) => setMixer((m) => ({ ...m, preserve: e.target.checked }))}
            data-testid="mixer-preserve"
          />
          휘도 유지
        </label>
        <span className="spacer" />
        <button className="btn btn-reset" onClick={() => setMixer(() => defaultMixer())} data-testid="mixer-reset">
          <HistoryIcon name="reset" />
          Mixer 초기화
        </button>
      </div>
      <div className="mixer-rows">
        {rows.map((r) => (
          <section key={r} className="detail-group">
            <h3 style={{ color: mixer.mono ? undefined : OUT[r][1] }}>{mixer.mono ? '흑백 = ' : `출력 ${OUT[r][0]} = `}</h3>
            {OUT.map(([ch], c) => (
              <RangeControl
                key={ch}
                label={`입력 ${ch}`}
                value={mixer.rows[r][c]}
                def={r === c ? 1 : 0}
                min={-2}
                max={2}
                step={0.01}
                onChange={(v) => setCell(r, c, v)}
                testId={`mixer-${r}-${c}`}
              />
            ))}
          </section>
        ))}
      </div>
      <p className="muted small">
        선형 RGB에서 섞습니다. 휘도 유지를 켜면 행마다 합이 1이 되도록 맞춰 전체 밝기가 변하지 않습니다.
      </p>
    </div>
  );
}
