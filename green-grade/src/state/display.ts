// 뷰어가 지금 보여 주는 영역. 형태 탭에서는 크롭 전 전체 프레임을, 그 밖에서는 크롭 결과를 보여 준다.

import {
  computeBase,
  FULL_RECT,
  geometryMatrix,
  grainUniforms,
  orientedSize,
  planDevelop,
  type DevelopBase,
  type Geometry,
  type GrainUniforms,
  type Mat3,
  type PixelSource,
  type Rect,
} from '../engine/develop';
import type { DevelopInput } from '../engine/renderer';
import type { useGrade } from './store';

type GradeSnapshot = ReturnType<typeof useGrade.getState>;

export interface DisplayInfo {
  /** 형태 탭: 크롭 전 전체 프레임을 보여 주는 중 */
  transformView: boolean;
  /** 보이는 영역 (변형된 프레임 기준 0–1) */
  rect: Rect;
  /** 보이는 영역의 원본 해상도 기준 크기 (소수) */
  width: number;
  height: number;
  /** 보이는 영역 0–1 → 원본 0–1 */
  matrix: Mat3;
  grain: GrainUniforms;
}

export function displayInfo(s: GradeSnapshot): DisplayInfo | null {
  const img = s.image;
  if (!img) return null;
  const g = s.develop.geometry;
  const transformView = s.correctionTab === 'transform';
  const rect = transformView ? FULL_RECT : g.crop;
  const [W, H] = orientedSize(g.rotate, img.width, img.height);
  return {
    transformView,
    rect,
    width: rect.w * W,
    height: rect.h * H,
    matrix: geometryMatrix(g, img.width, img.height, rect),
    grain: grainUniforms(s.develop.detail, g, img.width, img.height, rect),
  };
}

// 선명도·디헤이즈 기준은 형태와 보이는 영역이 같으면 다시 계산하지 않는다
let baseMemo: { key: string; src: PixelSource; base: DevelopBase } | null = null;

export function baseFor(src: PixelSource, g: Geometry, fullW: number, fullH: number, rect: Rect): DevelopBase {
  const key = JSON.stringify([g.rotate, g.flipH, g.flipV, g.straighten, g.vertical, g.horizontal, rect, fullW, fullH]);
  if (baseMemo?.src === src && baseMemo.key === key) return baseMemo.base;
  const base = computeBase(src, g, fullW, fullH, rect);
  baseMemo = { key, src, base };
  return base;
}

/** 미리보기 축소본을 현상할 계획 */
export function previewInput(s: GradeSnapshot): DevelopInput | null {
  const img = s.image;
  const d = displayInfo(s);
  if (!img || !d) return null;
  const plan = planDevelop(s.develop, img.width, img.height, img.proxy.width / img.width, d.rect);
  const base = plan.needsBase ? baseFor(img.baseSource, s.develop.geometry, img.width, img.height, d.rect) : null;
  return { plan, base };
}
