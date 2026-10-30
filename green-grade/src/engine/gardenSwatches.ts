// 정원 사진에서 자주 나오는 색의 견본 (sRGB 8bit, 맑은 날 일반적인 노출 기준의 대표값).
// 정원 프리셋을 수치로 검증하고 다듬는 데 쓴다. 실제 사진을 대신하지는 않는다.

import type { Vec3 } from './constants';

export type SwatchGroup = 'foliage' | 'sky' | 'ground' | 'flower' | 'skin' | 'autumn' | 'neutral';

export interface Swatch {
  key: string;
  label: string;
  group: SwatchGroup;
  rgb: Vec3;
  /** 사진 속 보통 위치 (0 위 – 1 아래). 하늘 그라디언트 창 같은 위치 의존 보정을 볼 때 쓴다. */
  v: number;
}

export const GARDEN_SWATCHES: Swatch[] = [
  { key: 'sprout', label: '새순 연두', group: 'foliage', rgb: [150, 180, 70], v: 0.6 },
  { key: 'sunlit', label: '햇빛 받은 잎', group: 'foliage', rgb: [110, 160, 60], v: 0.6 },
  { key: 'leaf', label: '중간 녹색 잎', group: 'foliage', rgb: [70, 120, 50], v: 0.6 },
  { key: 'shade', label: '그늘 잎', group: 'foliage', rgb: [35, 65, 30], v: 0.65 },
  { key: 'conifer', label: '침엽수', group: 'foliage', rgb: [40, 70, 50], v: 0.55 },
  { key: 'lawn', label: '잔디', group: 'foliage', rgb: [95, 140, 55], v: 0.8 },
  { key: 'moss', label: '이끼', group: 'foliage', rgb: [100, 115, 50], v: 0.85 },
  { key: 'skyClear', label: '맑은 하늘', group: 'sky', rgb: [100, 150, 215], v: 0.08 },
  { key: 'skyHorizon', label: '지평선 하늘', group: 'sky', rgb: [170, 195, 225], v: 0.3 },
  { key: 'skyOvercast', label: '흐린 하늘', group: 'sky', rgb: [190, 195, 200], v: 0.1 },
  { key: 'cloud', label: '구름 밝은 곳', group: 'sky', rgb: [240, 242, 245], v: 0.12 },
  { key: 'soil', label: '흙', group: 'ground', rgb: [105, 80, 60], v: 0.9 },
  { key: 'wetSoil', label: '젖은 흙', group: 'ground', rgb: [65, 50, 40], v: 0.92 },
  { key: 'granite', label: '화강석', group: 'ground', rgb: [150, 148, 142], v: 0.85 },
  { key: 'darkStone', label: '어두운 돌', group: 'ground', rgb: [70, 70, 72], v: 0.88 },
  { key: 'deck', label: '목재 데크', group: 'ground', rgb: [140, 100, 65], v: 0.85 },
  { key: 'brick', label: '붉은 벽돌', group: 'ground', rgb: [150, 75, 55], v: 0.7 },
  { key: 'redFlower', label: '붉은 꽃', group: 'flower', rgb: [200, 40, 50], v: 0.6 },
  { key: 'pinkFlower', label: '분홍 꽃', group: 'flower', rgb: [225, 130, 160], v: 0.6 },
  { key: 'purpleFlower', label: '보라 꽃', group: 'flower', rgb: [120, 80, 160], v: 0.6 },
  { key: 'yellowFlower', label: '노란 꽃', group: 'flower', rgb: [235, 200, 50], v: 0.6 },
  { key: 'whiteFlower', label: '흰 꽃', group: 'flower', rgb: [235, 235, 225], v: 0.6 },
  { key: 'skinLight', label: '피부 밝음', group: 'skin', rgb: [225, 180, 155], v: 0.5 },
  { key: 'skinMid', label: '피부 중간', group: 'skin', rgb: [180, 130, 100], v: 0.5 },
  { key: 'mapleOrange', label: '단풍 주황', group: 'autumn', rgb: [210, 110, 40], v: 0.5 },
  { key: 'mapleRed', label: '단풍 빨강', group: 'autumn', rgb: [170, 45, 35], v: 0.5 },
  { key: 'dryLeaf', label: '마른 잎', group: 'autumn', rgb: [150, 115, 70], v: 0.8 },
  { key: 'black', label: '검정', group: 'neutral', rgb: [0, 0, 0], v: 0.5 },
  { key: 'grey18', label: '18% 회색', group: 'neutral', rgb: [118, 118, 118], v: 0.5 },
  { key: 'white', label: '흰색', group: 'neutral', rgb: [255, 255, 255], v: 0.5 },
];

export const swatch = (key: string) => {
  const s = GARDEN_SWATCHES.find((x) => x.key === key);
  if (!s) throw new Error(`견본 없음: ${key}`);
  return s;
};
