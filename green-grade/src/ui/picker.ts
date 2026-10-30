import { gradeChain, srgbToLinear, type Vec3 } from '../engine/color';
import { mapPoint } from '../engine/develop';
import { qualifierFromSamples } from '../engine/mask';
import { displayInfo } from '../state/display';
import { currentUniforms, selectedNode, useGrade } from '../state/store';

/** 스포이드가 읽는 범위: 클릭한 점 주변 5×5 픽셀 (프록시 기준) */
const RADIUS = 2;

let cache: { bitmap: ImageBitmap; ctx: OffscreenCanvasRenderingContext2D } | null = null;

function proxyContext(bitmap: ImageBitmap) {
  if (cache?.bitmap !== bitmap) {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    cache = { bitmap, ctx };
  }
  return cache.ctx;
}

/**
 * 보이는 영역의 좌표(0–1)를 눌렀을 때, 선택 노드에 '들어오는' 색들로 Qualifier 범위를 정한다.
 * 형태(회전·크롭)를 거슬러 원본 위치를 찾고, 앞 노드들의 보정을 CPU 기준 구현으로 그대로 거친 색을 쓴다.
 * 디테일(샤프닝 등)은 색 범위에 거의 영향이 없어 반영하지 않는다.
 */
export function pickQualifier(u: number, v: number, extend: boolean) {
  const s = useGrade.getState();
  const d = displayInfo(s);
  if (!s.image || !d) return;
  const proxy = s.image.proxy;
  const ctx = proxyContext(proxy);
  const [su, sv] = mapPoint(d.matrix, u, v);
  const px = Math.round(su * proxy.width);
  const py = Math.round(sv * proxy.height);
  const x0 = Math.max(0, px - RADIUS);
  const y0 = Math.max(0, py - RADIUS);
  const w = Math.min(proxy.width, px + RADIUS + 1) - x0;
  const h = Math.min(proxy.height, py + RADIUS + 1) - y0;
  if (w <= 0 || h <= 0) return;
  const data = ctx.getImageData(x0, y0, w, h).data;

  const node = selectedNode(s);
  const index = s.nodes.indexOf(node);
  const before = currentUniforms(s).slice(0, index);
  const aspect = d.width / d.height;
  const samples: Vec3[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const lin = [0, 1, 2].map((c) => srgbToLinear(data[k + c] / 255)) as Vec3;
      // 창 마스크 위치는 보이는 영역 기준 (클릭한 점으로 근사)
      const pos = { u, v, aspect };
      samples.push(gradeChain(lin, before, pos));
    }
  }
  s.setQualifier((q) => qualifierFromSamples(samples, q, extend));
}
