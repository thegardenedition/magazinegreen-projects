import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitHistory, HISTORY_IDLE_MS, selectedNode, useGrade } from '../../src/state/store';

const gain = () => selectedNode(useGrade.getState()).primary.gain.master;
const setGain = (v: number) => useGrade.getState().setWheel('gain', { master: v });

describe('되돌리기 / 다시 실행', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 이전 테스트의 상태를 기록에 반영하고 비운다
    commitHistory();
    useGrade.setState({ past: [], future: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('드래그처럼 연속된 변경은 멈춘 뒤 한 단계로 기록된다', () => {
    const start = gain();
    for (let v = 1.01; v <= 1.5; v += 0.01) setGain(v);
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    expect(useGrade.getState().past).toHaveLength(1);
    useGrade.getState().undo();
    expect(gain()).toBe(start);
  });

  it('undo → redo로 같은 값에 돌아온다', () => {
    setGain(2);
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    setGain(3);
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    const { undo, redo } = useGrade.getState();
    undo();
    expect(gain()).toBe(2);
    undo();
    redo();
    expect(gain()).toBe(2);
    redo();
    expect(gain()).toBe(3);
  });

  it('기록되기 전에 undo를 눌러도 방금 변경이 취소된다', () => {
    setGain(1.2);
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    setGain(1.7);
    useGrade.getState().undo();
    expect(gain()).toBe(1.2);
  });

  it('되돌린 뒤 새로 고치면 다시 실행 목록은 비워진다', () => {
    setGain(2);
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    useGrade.getState().undo();
    expect(useGrade.getState().future).toHaveLength(1);
    setGain(0.8);
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    expect(useGrade.getState().future).toHaveLength(0);
  });

  it('커브와 노드 on/off도 기록된다', () => {
    const before = selectedNode(useGrade.getState()).curves;
    useGrade.getState().setCurve('y', [{ x: 0, y: 0 }, { x: 0.5, y: 0.3 }, { x: 1, y: 1 }]);
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    useGrade.getState().toggleNode();
    vi.advanceTimersByTime(HISTORY_IDLE_MS + 10);
    useGrade.getState().undo();
    expect(selectedNode(useGrade.getState()).enabled).toBe(true);
    useGrade.getState().undo();
    expect(selectedNode(useGrade.getState()).curves).toBe(before);
  });
});
