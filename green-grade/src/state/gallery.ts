// 여러 장 작업: 필름스트립, 사진별 그레이드, 그레이드 복사·붙여넣기, 일괄 내보내기.
// 원본은 File로만 들고 있고, 지금 여는 사진 한 장만 디코딩해 둔다 (메모리 절약).

import { create } from 'zustand';
import { ACCEPTED_TYPES, exportFileName, exportJpeg, loadImage } from '../engine/image';
import type { PresetNode } from '../engine/presets';
import { getActiveRenderer } from '../engine/renderer';
import { buildZip, uniqueNames, type ZipEntry } from '../engine/zip';
import {
  createNode,
  currentPreset,
  currentUniforms,
  presetToNodes,
  resetHistory,
  useGrade,
  type GradeNode,
} from './store';

export const THUMB_WIDTH = 240;

export interface GalleryItem {
  id: string;
  file: File;
  name: string;
  /** 원본 썸네일 (보정 전) */
  thumb: ImageBitmap;
  /** 보정을 반영한 썸네일 URL */
  thumbUrl: string | null;
  /** 이 사진의 그레이드. 아직 안 연 사진은 null(기본 노드 하나) */
  nodes: GradeNode[] | null;
}

interface GalleryState {
  items: GalleryItem[];
  currentId: string | null;
  /** 일괄 작업 대상 */
  selected: string[];
  clipboard: { nodes: PresetNode[]; from: string } | null;
  busy: string | null;
  error: string | null;
}

export const useGallery = create<GalleryState>(() => ({
  items: [],
  currentId: null,
  selected: [],
  clipboard: null,
  busy: null,
  error: null,
}));

let seq = 0;
const freshNodes = () => [createNode('Primary')];

function patchItem(id: string, patch: Partial<GalleryItem>) {
  useGallery.setState((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
}

const nodesOf = (it: GalleryItem) =>
  it.id === useGallery.getState().currentId ? useGrade.getState().nodes : (it.nodes ?? freshNodes());

/** 그레이드를 반영한 썸네일을 다시 만든다 */
export async function refreshThumb(id: string) {
  const it = useGallery.getState().items.find((x) => x.id === id);
  const r = getActiveRenderer();
  if (!it || !r) return;
  const px = r.renderFull(it.thumb, currentUniforms({ nodes: nodesOf(it) }), { dither: true });
  const c = new OffscreenCanvas(it.thumb.width, it.thumb.height);
  c.getContext('2d')!.putImageData(new ImageData(px, it.thumb.width, it.thumb.height), 0, 0);
  const url = URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }));
  const cur = useGallery.getState().items.find((x) => x.id === id);
  if (cur?.thumbUrl) URL.revokeObjectURL(cur.thumbUrl);
  if (cur) patchItem(id, { thumbUrl: url });
  else URL.revokeObjectURL(url);
}

/** 파일 여러 장을 목록에 더한다. 열린 사진이 없으면 첫 장을 연다. */
export async function addFiles(files: File[]) {
  const ok = files.filter((f) => ACCEPTED_TYPES.includes(f.type));
  const skipped = files.length - ok.length;
  useGallery.setState({ error: skipped ? `${skipped}개 파일은 JPG·PNG·WebP가 아니라 건너뛰었습니다.` : null });
  const added: GalleryItem[] = [];
  for (const file of ok) {
    try {
      const thumb = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        premultiplyAlpha: 'none',
        resizeWidth: THUMB_WIDTH,
        resizeQuality: 'medium',
      });
      added.push({ id: `img${Date.now().toString(36)}${seq++}`, file, name: file.name, thumb, thumbUrl: null, nodes: null });
    } catch {
      useGallery.setState({ error: `${file.name}을(를) 읽지 못했습니다.` });
    }
  }
  if (!added.length) return;
  useGallery.setState((s) => ({ items: [...s.items, ...added] }));
  for (const it of added) refreshThumb(it.id);
  // 한 장만 더했으면 바로 열고, 여러 장이면 열린 사진이 없을 때 첫 장을 연다
  if (added.length === 1 || !useGallery.getState().currentId) await openItem(added[0].id);
}

/** 다른 사진으로 넘어가기: 지금 사진의 그레이드를 저장하고, 그 사진의 그레이드를 불러온다 */
export async function openItem(id: string) {
  const g = useGallery.getState();
  if (g.currentId === id) return;
  const it = g.items.find((x) => x.id === id);
  if (!it) return;
  useGallery.setState({ busy: `${it.name} 여는 중…`, error: null });
  try {
    const img = await loadImage(it.file);
    const prevId = useGallery.getState().currentId;
    if (prevId) patchItem(prevId, { nodes: useGrade.getState().nodes });
    const prev = useGrade.getState().image;
    if (!prevId && !it.nodes) {
      // 첫 사진: 열기 전(또는 여는 동안) 만든 그레이드와 되돌리기 기록을 그대로 이어받는다
      useGrade.setState({ image: img });
    } else {
      const nodes = it.nodes ?? freshNodes();
      useGrade.setState({ image: img, nodes, selectedId: nodes[0].id });
      resetHistory();
    }
    useGallery.setState({ currentId: id });
    if (prev) {
      prev.full.close();
      if (prev.proxy !== prev.full) prev.proxy.close();
    }
    if (prevId) refreshThumb(prevId);
  } catch (e) {
    useGallery.setState({ error: (e as Error).message });
  } finally {
    useGallery.setState({ busy: null });
  }
}

export function removeItem(id: string) {
  const g = useGallery.getState();
  const it = g.items.find((x) => x.id === id);
  if (!it || id === g.currentId) return;
  it.thumb.close();
  if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  useGallery.setState({ items: g.items.filter((x) => x !== it), selected: g.selected.filter((x) => x !== id) });
}

// ── 선택 ──

export function toggleSelect(id: string) {
  useGallery.setState((s) => ({
    selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id],
  }));
}

/** Shift+클릭: 마지막으로 고른 사진부터 이 사진까지 */
export function selectRange(id: string) {
  const { items, selected } = useGallery.getState();
  const anchor = selected[selected.length - 1] ?? useGallery.getState().currentId;
  const a = items.findIndex((x) => x.id === anchor);
  const b = items.findIndex((x) => x.id === id);
  if (a < 0 || b < 0) return toggleSelect(id);
  const range = items.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
  useGallery.setState({ selected: [...new Set([...selected, ...range])] });
}

export function selectAll(on: boolean) {
  useGallery.setState((s) => ({ selected: on ? s.items.map((x) => x.id) : [] }));
}

// ── 그레이드 복사·붙여넣기 ──

export function copyGrade() {
  const g = useGallery.getState();
  const name = g.items.find((x) => x.id === g.currentId)?.name ?? '현재 사진';
  useGallery.setState({ clipboard: { nodes: currentPreset('clipboard').nodes, from: name } });
}

/**
 * 복사한 그레이드를 고른 사진들에 붙인다. 지금 열린 사진이 포함되면 그 사진은 되돌리기로 취소할 수 있다.
 * 붙인 사진 수를 돌려준다.
 */
export function pasteGrade(ids = useGallery.getState().selected): number {
  const { clipboard, currentId } = useGallery.getState();
  if (!clipboard || !ids.length) return 0;
  for (const id of ids) {
    const nodes = presetToNodes({ name: '', nodes: clipboard.nodes });
    if (id === currentId) useGrade.getState().setNodes(nodes);
    else patchItem(id, { nodes });
    refreshThumb(id);
  }
  return ids.length;
}

// ── 일괄 내보내기 ──

/** 고른 사진들을 각자의 그레이드로 원본 해상도 JPG로 렌더해 ZIP 하나로 묶는다 */
export async function exportBatch(ids: string[], quality: number, onProgress: (done: number, total: number, name: string) => void) {
  const r = getActiveRenderer();
  if (!r) throw new Error('렌더러가 준비되지 않았습니다.');
  const items = useGallery.getState().items.filter((x) => ids.includes(x.id));
  const names = uniqueNames(items.map((it) => exportFileName(it.name, 'jpg')));
  const entries: ZipEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    onProgress(i, items.length, it.name);
    await new Promise((res) => setTimeout(res, 0));
    const full = await createImageBitmap(it.file, {
      imageOrientation: 'from-image',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'default',
    });
    try {
      const blob = await exportJpeg(
        r,
        { full, width: full.width, height: full.height },
        currentUniforms({ nodes: nodesOf(it) }),
        quality,
      );
      entries.push({ name: names[i], data: new Uint8Array(await blob.arrayBuffer()) });
    } finally {
      full.close();
    }
  }
  onProgress(items.length, items.length, '');
  return buildZip(entries);
}

/** 테스트·디버그용: 사진별 그레이드 요약 */
export function gradeSummary() {
  return useGallery.getState().items.map((it) => ({
    name: it.name,
    nodes: nodesOf(it).map((n) => n.name),
    gain: nodesOf(it)[0].primary.gain.master,
  }));
}

// 지금 사진의 그레이드가 바뀌면 잠시 뒤 썸네일을 다시 만든다
let thumbTimer: ReturnType<typeof setTimeout> | undefined;
useGrade.subscribe((s, p) => {
  if (s.nodes === p.nodes) return;
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    const id = useGallery.getState().currentId;
    if (id) refreshThumb(id);
  }, 400);
});
