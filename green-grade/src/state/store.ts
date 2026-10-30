import { create } from 'zustand';
import {
  defaultPrimary,
  defaultWheel,
  SCALAR_SPECS,
  type PrimaryParams,
  type ScalarName,
  type WheelName,
  type WheelValue,
} from '../engine/color';
import type { LoadedImage } from '../engine/image';

interface GradeState {
  image: LoadedImage | null;
  primary: PrimaryParams;
  /** 노드 01의 on/off. Phase 3에서 노드 배열로 확장한다. */
  nodeEnabled: boolean;
  bypass: boolean;
  split: boolean;
  splitPos: number;
  exportOpen: boolean;

  setImage(img: LoadedImage | null): void;
  setWheel(name: WheelName, patch: Partial<WheelValue>): void;
  resetWheel(name: WheelName, part?: 'color' | 'master'): void;
  setScalar(name: ScalarName, value: number): void;
  resetScalar(name: ScalarName): void;
  resetPrimary(): void;
  toggleNode(): void;
  toggleBypass(): void;
  toggleSplit(): void;
  setSplitPos(v: number): void;
  setExportOpen(v: boolean): void;
}

export const useGrade = create<GradeState>((set) => ({
  image: null,
  primary: defaultPrimary(),
  nodeEnabled: true,
  bypass: false,
  split: false,
  splitPos: 0.5,
  exportOpen: false,

  setImage: (image) => set({ image }),
  setWheel: (name, patch) =>
    set((s) => ({ primary: { ...s.primary, [name]: { ...s.primary[name], ...patch } } })),
  resetWheel: (name, part) =>
    set((s) => {
      const d = defaultWheel(name);
      const cur = s.primary[name];
      const next = part === 'color' ? { ...cur, x: 0, y: 0 } : part === 'master' ? { ...cur, master: d.master } : d;
      return { primary: { ...s.primary, [name]: next } };
    }),
  setScalar: (name, value) => set((s) => ({ primary: { ...s.primary, [name]: value } })),
  resetScalar: (name) => set((s) => ({ primary: { ...s.primary, [name]: SCALAR_SPECS[name].def } })),
  resetPrimary: () => set({ primary: defaultPrimary() }),
  toggleNode: () => set((s) => ({ nodeEnabled: !s.nodeEnabled })),
  toggleBypass: () => set((s) => ({ bypass: !s.bypass })),
  toggleSplit: () => set((s) => ({ split: !s.split })),
  setSplitPos: (splitPos) => set({ splitPos: Math.min(1, Math.max(0, splitPos)) }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}));
