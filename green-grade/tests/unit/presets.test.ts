import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPrimary, gradePixel8, toUniforms } from '../../src/engine/color';
import { MAX_NODES } from '../../src/engine/constants';
import { buildLut } from '../../src/engine/lut';
import { parsePreset, serializePreset, type Preset } from '../../src/engine/presets';
import {
  commitHistory,
  createNode,
  currentPreset,
  currentUniforms,
  presetToNodes,
  selectedNode,
  useGrade,
} from '../../src/state/store';

describe('프리셋 직렬화', () => {
  it('LUT까지 포함해 왕복이 같다', () => {
    const lut = buildLut(5, 'Warm', (r, g, b) => [Math.min(1, r * 1.1), g, b * 0.9]);
    const p: Preset = {
      name: '테스트',
      nodes: [
        { ...createNode('A'), lut, lutIntensity: 0.4 },
        { ...createNode('B'), enabled: false },
      ].map(({ id: _id, ...n }) => n),
    };
    p.nodes[0].primary.gain = { x: 0.2, y: -0.1, master: 1.3 };
    p.nodes[1].curves.hueSat = [{ x: 0.3, y: 0.2 }];
    const back = parsePreset(serializePreset(p));
    expect(back.name).toBe('테스트');
    expect(back.nodes).toHaveLength(2);
    expect(back.nodes[0].primary.gain).toEqual({ x: 0.2, y: -0.1, master: 1.3 });
    expect(back.nodes[0].lutIntensity).toBe(0.4);
    expect(back.nodes[0].lut!.size).toBe(5);
    for (let i = 0; i < lut.data.length; i++) expect(back.nodes[0].lut!.data[i]).toBeCloseTo(lut.data[i], 5);
    expect(back.nodes[1].enabled).toBe(false);
    expect(back.nodes[1].curves.hueSat).toEqual([{ x: 0.3, y: 0.2 }]);
  });

  it('다른 형식·손상된 파일은 거절한다', () => {
    expect(() => parsePreset('not json')).toThrow('JSON');
    expect(() => parsePreset('{"format":"other"}')).toThrow('프리셋 파일이 아닙니다');
    expect(() => parsePreset('{"format":"green-grade-preset","version":99,"nodes":[{}]}')).toThrow('새로운 버전');
    expect(() => parsePreset('{"format":"green-grade-preset","version":1,"nodes":[]}')).toThrow('노드가 없습니다');
    expect(() =>
      parsePreset('{"format":"green-grade-preset","version":1,"nodes":[{"lut":{"size":3,"data":[1,2]}}]}'),
    ).toThrow('길이');
  });

  it('빠진 값은 기본값, 범위 밖 값은 잘라낸다', () => {
    const p = parsePreset(
      JSON.stringify({
        format: 'green-grade-preset',
        version: 1,
        nodes: [{ primary: { contrast: 9, gain: { x: 3, y: 4, master: 1.2 } }, curves: { y: 'bad' } }],
      }),
    );
    const n = p.nodes[0];
    expect(n.primary.contrast).toBe(2);
    expect(n.primary.gain.x).toBeCloseTo(0.6, 10);
    expect(n.primary.gain.y).toBeCloseTo(0.8, 10);
    expect(n.primary.temperature).toBe(0);
    expect(n.curves.y).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(n.name).toBe('노드 1');
  });
});

describe('노드 체인', () => {
  beforeEach(() => {
    useGrade.getState().resetAll();
    commitHistory();
  });

  it('순서가 결과를 바꾼다 (Gain → Lift ≠ Lift → Gain)', () => {
    const a = toUniforms({ ...defaultPrimary(), gain: { x: 0, y: 0, master: 2 } });
    const b = toUniforms({ ...defaultPrimary(), lift: { x: 0, y: 0, master: 0.2 } });
    expect(gradePixel8([60, 60, 60], [a, b])).not.toEqual(gradePixel8([60, 60, 60], [b, a]));
  });

  it('꺼진 노드는 건너뛴다', () => {
    const a = toUniforms({ ...defaultPrimary(), gain: { x: 0, y: 0, master: 2 } }, { enabled: false });
    expect(gradePixel8([60, 90, 120], [a])).toEqual([60, 90, 120]);
  });

  it('추가는 선택 노드 바로 뒤, 새 노드를 선택', () => {
    const s = useGrade.getState();
    s.addNode();
    s.addNode();
    s.selectNode(useGrade.getState().nodes[0].id);
    useGrade.getState().addNode();
    const { nodes } = useGrade.getState();
    expect(nodes.map((n) => n.name)).toEqual(['Primary', '노드 3', '노드 1', '노드 2']);
    expect(selectedNode(useGrade.getState()).name).toBe('노드 3');
  });

  it(`최대 ${MAX_NODES}개, 최소 1개`, () => {
    for (let i = 0; i < 20; i++) useGrade.getState().addNode();
    expect(useGrade.getState().nodes).toHaveLength(MAX_NODES);
    for (let i = 0; i < 20; i++) useGrade.getState().deleteNode();
    expect(useGrade.getState().nodes).toHaveLength(1);
  });

  it('복제는 보정값을 그대로, 순서 이동, 선택 노드만 보정', () => {
    const s = useGrade.getState();
    s.setWheel('gain', { master: 1.7 });
    s.duplicateNode();
    expect(selectedNode(useGrade.getState()).primary.gain.master).toBe(1.7);
    useGrade.getState().setWheel('gain', { master: 0.5 });
    expect(useGrade.getState().nodes.map((n) => n.primary.gain.master)).toEqual([1.7, 0.5]);
    useGrade.getState().moveNode(-1);
    expect(useGrade.getState().nodes.map((n) => n.primary.gain.master)).toEqual([0.5, 1.7]);
  });

  it('현재 그레이드 → 프리셋 → 노드 왕복', () => {
    useGrade.getState().setWheel('lift', { master: 0.05 });
    useGrade.getState().addNode();
    useGrade.getState().setScalar('saturation', 0.6);
    const p = parsePreset(serializePreset(currentPreset('왕복')));
    const before = currentUniforms();
    useGrade.getState().setNodes(presetToNodes(p));
    const after = currentUniforms();
    expect(after.map((u) => [u.lift, u.saturation])).toEqual(before.map((u) => [u.lift, u.saturation]));
  });
});
