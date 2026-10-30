import { useEffect, useState } from 'react';

interface Props {
  value: number;
  digits: number;
  onCommit(v: number): void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
}

/** 수치 직접 입력 칸. Enter/포커스 해제 시 반영, Esc는 취소. */
export function NumberField({ value, digits, onCommit, min, max, label, className }: Props) {
  const [text, setText] = useState(value.toFixed(digits));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(value.toFixed(digits));
  }, [value, digits, editing]);

  const commit = () => {
    setEditing(false);
    const v = Number(text);
    if (!Number.isFinite(v)) {
      setText(value.toFixed(digits));
      return;
    }
    onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
  };

  return (
    <input
      className={`num ${className ?? ''}`}
      aria-label={label}
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(value.toFixed(digits));
          setEditing(false);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
