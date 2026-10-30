import { useMemo, useState } from 'react';

export interface LibraryItem {
  key: string;
  name: string;
  description: string;
  category: string;
}

interface Props {
  items: LibraryItem[];
  categories: Array<[string, string]>;
  onPick(key: string): void;
  /** 지금 쓰고 있는 항목 (강조 표시) */
  activeKey?: string | null;
  testId: string;
  placeholder: string;
}

/** 분류 칩 + 검색 + 분류별 목록. 프리셋·LUT 라이브러리가 함께 쓴다. */
export function LibraryList({ items, categories, onPick, activeKey, testId, placeholder }: Props) {
  const [cat, setCat] = useState<string>('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      items.filter(
        (it) =>
          (cat === 'all' || it.category === cat) &&
          (!q || it.name.toLowerCase().includes(q) || it.description.toLowerCase().includes(q)),
      ),
    [items, cat, q],
  );
  const groups = categories
    .map(([c, label]) => [label, visible.filter((it) => it.category === c)] as const)
    .filter(([, list]) => list.length);

  return (
    <div className="library">
      <input
        className="num library-search"
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid={`${testId}-search`}
      />
      <div className="library-chips">
        {[['all', '전체'] as [string, string], ...categories].map(([c, label]) => (
          <button
            key={c}
            className={`chip ${cat === c ? 'on' : ''}`}
            onClick={() => setCat(c)}
            data-testid={`${testId}-cat-${c}`}
          >
            {label}
            <span className="muted"> {c === 'all' ? items.length : items.filter((it) => it.category === c).length}</span>
          </button>
        ))}
      </div>
      <div className="library-list" data-testid={testId}>
        {groups.length === 0 && <p className="muted small preset-empty">검색 결과가 없습니다.</p>}
        {groups.map(([label, list]) => (
          <div key={label}>
            {cat === 'all' && <div className="preset-group-title">{label}</div>}
            <ul className="preset-list">
              {list.map((it) => (
                <li key={it.key}>
                  <button
                    className={`preset-item ${activeKey === it.key ? 'active' : ''}`}
                    onClick={() => onPick(it.key)}
                    title={it.description}
                    data-testid={`${testId}-item`}
                  >
                    <span>{it.name}</span>
                    <span className="muted small">{it.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
