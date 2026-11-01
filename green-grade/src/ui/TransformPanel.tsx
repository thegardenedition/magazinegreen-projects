import { useState } from 'react';
import { autoStraighten, MIN_CONFIDENCE } from '../engine/autoLevel';
import { ASPECTS, outputSize, type Rotation } from '../engine/develop';
import { useGrade } from '../state/store';
import { RangeControl } from './RangeControl';

/** 형태: 90° 회전·반전, 수평, 원근, 크롭 비율. 크롭은 뷰어의 사각형을 끌어서 고친다. */
export function TransformPanel() {
  const g = useGrade((s) => s.develop.geometry);
  const image = useGrade((s) => s.image);
  const tool = useGrade((s) => s.viewerTool);
  const setGeometry = useGrade((s) => s.setGeometry);
  const setTool = useGrade((s) => s.setViewerTool);
  const rotate = (deg: 90 | 270) => setGeometry({ rotate: ((g.rotate + deg) % 360) as Rotation });
  const size = image ? outputSize(g, image.width, image.height) : null;
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="primary develop-panel">
      <div className="develop-row">
        <button className="btn" onClick={() => rotate(270)} title="왼쪽으로 90° 회전" data-testid="rotate-left">
          ⟲ 90°
        </button>
        <button className="btn" onClick={() => rotate(90)} title="오른쪽으로 90° 회전" data-testid="rotate-right">
          ⟳ 90°
        </button>
        <button className={`btn btn-toggle ${g.flipH ? 'on' : ''}`} onClick={() => setGeometry({ flipH: !g.flipH })} data-testid="flip-h">
          좌우 반전
        </button>
        <button className={`btn btn-toggle ${g.flipV ? 'on' : ''}`} onClick={() => setGeometry({ flipV: !g.flipV })} data-testid="flip-v">
          상하 반전
        </button>
        <span className="spacer" />
        <span className="muted small mono" data-testid="crop-size">
          {size ? `${size[0]} × ${size[1]} px` : ''}
        </span>
      </div>
      <div className="scalars develop-scalars">
        <RangeControl
          label="수평"
          value={g.straighten}
          def={0}
          min={-45}
          max={45}
          step={0.1}
          onChange={(v) => setGeometry({ straighten: v })}
          testId="geo-straighten"
        />
        <RangeControl
          label="세로 원근"
          value={g.vertical}
          def={0}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => setGeometry({ vertical: v })}
          testId="geo-vertical"
        />
        <RangeControl
          label="가로 원근"
          value={g.horizontal}
          def={0}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => setGeometry({ horizontal: v })}
          testId="geo-horizontal"
        />
      </div>
      <div className="develop-row">
        <button
          className={`btn btn-toggle ${tool === 'level' ? 'on' : ''}`}
          onClick={() => setTool(tool === 'level' ? 'none' : 'level')}
          disabled={!image}
          title="사진 속 수평선이나 기둥을 따라 선을 그으면 그 선이 수평·수직이 되도록 돌립니다"
          data-testid="level-tool"
        >
          기준선 긋기
        </button>
        <button
          className="btn"
          onClick={() => {
            const s = useGrade.getState();
            const img = s.image;
            if (!img) return;
            const r = autoStraighten(img.baseSource, s.develop.geometry, img.width, img.height);
            if (r.confidence < MIN_CONFIDENCE) {
              setNote('뚜렷한 수평·수직선을 찾지 못했습니다. 기준선 긋기로 맞춰 주세요.');
              return;
            }
            setGeometry({ straighten: r.straighten });
            setNote(`수평 ${r.straighten > 0 ? '+' : ''}${r.straighten.toFixed(1)}° 맞춤`);
          }}
          disabled={!image}
          title="사진 속 지평선·처마선·기둥을 찾아 수평을 맞춥니다"
          data-testid="auto-level"
        >
          자동 수평
        </button>
        <span className="muted small" data-testid="level-note">
          {note ?? '지평선·처마선·기둥을 따라 끌면(기준선 긋기) 그 선이 수평이 됩니다.'}
        </span>
      </div>
      <div className="develop-row">
        <span className="scalar-label">크롭 비율</span>
        <div className="library-chips">
          {ASPECTS.map(([id, label]) => (
            <button
              key={id}
              className={`chip ${g.aspect === id ? 'on' : ''}`}
              onClick={() => setGeometry({ aspect: id })}
              data-testid={`aspect-${id.replace(':', 'x')}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setGeometry({ cropAuto: true })} title="빈 모서리 없이 가장 크게" data-testid="crop-max">
          최대로
        </button>
      </div>
    </div>
  );
}
