// 내 LUT: 불러온 .cube / .3dl 파일을 이 브라우저(IndexedDB)에 보관한다.
// 원래 텍스트를 그대로 저장하고, 쓸 때 다시 읽는다. IndexedDB를 쓸 수 없으면 이번 세션 동안만 메모리에 둔다.

import { create } from 'zustand';
import { parseLutFile, type CubeLut } from '../engine/lut';
import { selectedNode, useGrade } from './store';

export interface UserLut {
  id: string;
  name: string;
  fileName: string;
  text: string;
  size: number;
  added: number;
}

interface UserLutState {
  items: UserLut[];
  ready: boolean;
  /** 마지막 불러오기 결과 (LUT 탭에 표시) */
  notice: { text: string; error?: boolean; at: number } | null;
}

export const useUserLuts = create<UserLutState>(() => ({ items: [], ready: false, notice: null }));

const DB_NAME = 'green-grade';
const STORE = 'luts';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/** 저장된 LUT 목록을 불러온다 (앱 시작 시 한 번) */
export async function loadUserLuts() {
  const all = ((await tx('readonly', (s) => s.getAll())) ?? []) as UserLut[];
  useUserLuts.setState({ items: all.sort((a, b) => a.added - b.added), ready: true });
}

const cache = new Map<string, CubeLut>();

/** 보관된 LUT를 CubeLut으로 (한 번 읽으면 기억) */
export function userLut(id: string): CubeLut {
  let l = cache.get(id);
  if (!l) {
    const it = useUserLuts.getState().items.find((x) => x.id === id);
    if (!it) throw new Error('보관된 LUT를 찾을 수 없습니다.');
    l = { ...parseLutFile(it.text, it.fileName), name: it.name };
    cache.set(id, l);
  }
  return l;
}

let seq = 0;

/**
 * LUT 파일들을 읽어 보관한다. 같은 이름이 이미 있으면 새 내용으로 바꾼다.
 * 읽은 LUT(순서대로)와 실패한 파일의 오류를 돌려준다.
 */
export async function importLutFiles(files: File[]): Promise<{ added: Array<{ item: UserLut; lut: CubeLut }>; errors: string[] }> {
  const added: Array<{ item: UserLut; lut: CubeLut }> = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const lut = parseLutFile(text, file.name);
      const name = lut.name || file.name.replace(/\.[^.]+$/, '');
      const prev = useUserLuts.getState().items.find((x) => x.name === name);
      const item: UserLut = {
        id: prev?.id ?? `lut${Date.now().toString(36)}${(seq++).toString(36)}`,
        name,
        fileName: file.name,
        text,
        size: lut.size,
        added: prev?.added ?? Date.now(),
      };
      cache.set(item.id, { ...lut, name });
      await tx('readwrite', (s) => s.put(item));
      useUserLuts.setState((s) => ({ items: prev ? s.items.map((x) => (x.id === item.id ? item : x)) : [...s.items, item] }));
      added.push({ item, lut: { ...lut, name } });
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }
  return { added, errors };
}

export async function removeUserLut(id: string) {
  cache.delete(id);
  await tx('readwrite', (s) => s.delete(id));
  useUserLuts.setState((s) => ({ items: s.items.filter((x) => x.id !== id) }));
}

/** 파일을 보관하고 첫 LUT를 선택 노드에 적용한다 (불러오기 버튼·끌어다 놓기 공통) */
export async function importAndApply(files: File[]) {
  const { added, errors } = await importLutFiles(files);
  const g = useGrade.getState();
  if (added.length) g.setLut(added[0].lut);
  const node = selectedNode(useGrade.getState()).name;
  const parts: string[] = [];
  if (added.length) {
    parts.push(`${added[0].lut.name} (${added[0].lut.size}³) → ${node}`);
    if (added.length > 1) parts.push(`외 ${added.length - 1}개는 내 LUT에 보관`);
  }
  parts.push(...errors);
  useUserLuts.setState({ notice: { text: parts.join(' · '), error: !added.length, at: Date.now() } });
}
