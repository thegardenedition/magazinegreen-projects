import { useState } from 'react';
import { MAX_NODES } from '../engine/constants';
import { selectedNode, useGrade, type GradeNode } from '../state/store';

function NodeCard({ node, index, selected }: { node: GradeNode; index: number; selected: boolean }) {
  const select = useGrade((s) => s.selectNode);
  const toggle = useGrade((s) => s.toggleNode);
  const rename = useGrade((s) => s.renameNode);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(node.name);

  const commit = () => {
    setEditing(false);
    rename(node.id, text);
  };

  return (
    <div
      className={`node ${node.enabled ? '' : 'node-off'} ${selected ? 'node-sel' : ''}`}
      onClick={() => select(node.id)}
      data-testid="node"
      data-selected={selected}
    >
      <div className="node-head">
        <span className="mono">{String(index + 1).padStart(2, '0')}</span>
        {editing ? (
          <input
            className="num node-name-input"
            value={text}
            autoFocus
            aria-label="노드 이름"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setText(node.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="node-name"
            title="더블클릭: 이름 바꾸기"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setText(node.name);
              setEditing(true);
            }}
          >
            {node.name}
          </span>
        )}
        <button
          className="node-toggle"
          onClick={(e) => {
            e.stopPropagation();
            toggle(node.id);
          }}
          aria-pressed={node.enabled}
          title="노드 켜기/끄기 (선택 노드: Ctrl+D)"
          data-testid="node-toggle"
        >
          {node.enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {node.lut && (
        <div className="node-lut mono" title={`LUT: ${node.lut.name}`}>
          LUT {node.lut.name} · {Math.round(node.lutIntensity * 100)}%
        </div>
      )}
    </div>
  );
}

export function NodePanel() {
  const nodes = useGrade((s) => s.nodes);
  const sel = useGrade((s) => selectedNode(s));
  const { addNode, duplicateNode, deleteNode, moveNode } = useGrade.getState();
  const index = nodes.indexOf(sel);
  const full = nodes.length >= MAX_NODES;

  return (
    <aside className="panel panel-nodes">
      <header className="tabs">
        <span className="tab on">Nodes</span>
        <span className="spacer" />
        <span className="muted small mono">
          {nodes.length}/{MAX_NODES}
        </span>
      </header>
      <div className="node-graph" data-testid="node-graph">
        <span className="node-io">IN</span>
        {nodes.map((n, i) => (
          <div key={n.id} className="node-slot">
            <span className="node-wire" />
            <NodeCard node={n} index={i} selected={n === sel} />
          </div>
        ))}
        <span className="node-wire" />
        <span className="node-io">OUT</span>
      </div>
      <div className="node-actions">
        <button className="btn" onClick={addNode} disabled={full} title="선택 노드 뒤에 추가 (Alt+S)" data-testid="node-add">
          + 추가
        </button>
        <button className="btn" onClick={duplicateNode} disabled={full} data-testid="node-duplicate">
          복제
        </button>
        <button className="btn" onClick={() => moveNode(-1)} disabled={index <= 0} title="앞으로" data-testid="node-up">
          ↑
        </button>
        <button
          className="btn"
          onClick={() => moveNode(1)}
          disabled={index >= nodes.length - 1}
          title="뒤로"
          data-testid="node-down"
        >
          ↓
        </button>
        <button className="btn" onClick={deleteNode} disabled={nodes.length <= 1} data-testid="node-delete">
          삭제
        </button>
      </div>
    </aside>
  );
}
