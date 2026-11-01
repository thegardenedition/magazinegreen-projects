// 기본 제공 프리셋 라이브러리 (8개 분류, 135종).
// 값은 이 앱의 노드 기능(Primary·Log 휠·RGB Mixer·Curves·Qualifier·Window)으로 만들고,
// 필름 룩 일부는 디테일 효과(그레인·할레이션·글로우·비네트)를 함께 담는다.
// 공통 안전선(계조 반전·새 클리핑·피부 색상)과 정원 프리셋의 목표는 tests/unit/gardenPresets.test.ts,
// 나머지 분류의 목표는 tests/unit/presetLibrary.test.ts에서 수치로 검증한다.

import { defaultPrimary, LUMA, type PrimaryParams, type Vec3, type WheelValue } from './color';
import { defaultCurves, type CurvePoint, type CurvesParams } from './curves';
import { defaultQualifier, defaultWindow } from './mask';
import type { Detail } from './develop';
import type { BuiltinPreset, PresetNode } from './presets';

// ── 만들기 도구 ──

/** 휠을 특정 색 방향으로 민 값 (amount: 0–1, 휠 반지름 비율) */
function toward(rgb: Vec3, amount: number, master: number): WheelValue {
  const y = LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
  const cb = (rgb[2] - y) / 1.8556;
  const cr = (rgb[0] - y) / 1.5748;
  const len = Math.hypot(cb, cr) || 1;
  return { x: (cb / len) * amount, y: (cr / len) * amount, master };
}

const master = (m: number): WheelValue => ({ x: 0, y: 0, master: m });

const AMBER: Vec3 = [1, 0.62, 0.2];
const ORANGE: Vec3 = [1, 0.5, 0.15];
const TEAL: Vec3 = [0.1, 0.55, 0.6];
const BLUE: Vec3 = [0.25, 0.4, 1];
const CYAN: Vec3 = [0.2, 0.75, 0.85];
const SEPIA_DARK: Vec3 = [0.6, 0.42, 0.28];
const SELENIUM: Vec3 = [0.45, 0.4, 0.62];

// 색상축 위치. 순색이 아니라 실제 정원 색의 자리(gardenSwatches.ts 측정값)에 맞춘다.
// 예: 실제 잎은 순수 초록(0.35)보다 노랑 쪽인 0.24–0.34에, 맑은 하늘은 파랑(0.70)이 아닌 0.61에 있다.
/** 새순·연두 */
const HUE_SPROUT = 0.245;
/** 햇빛 받은 잎·잔디 */
const HUE_FOLIAGE = 0.285;
/** 중간 녹색 잎 */
const HUE_LEAF = 0.316;
/** 하늘 */
const HUE_SKY = 0.61;
/** 수국·청보라 꽃 */
const HUE_HYDRANGEA = 0.72;
/** 보라 꽃 */
const HUE_PURPLE = 0.785;
/** 목재·흙 */
const HUE_WOOD = 0.095;
/** 붉은 벽돌과 목재의 가운데 (피부 0.07도 이 근처라 밝기로 따로 덜어 낸다) */
const HUE_BRICK_WOOD = 0.065;
/** 빨강 */
const HUE_RED = 0;

/** 고른 색상 하나만 올리거나 내리는 커브 (양옆 고정점 포함) */
const bump = (...pts: Array<[number, number]>): CurvePoint[] => {
  const out: CurvePoint[] = [];
  for (const [x, y] of pts) out.push({ x: x - Math.floor(x), y });
  const xs = pts.map(([x]) => x);
  const lo = Math.min(...xs) - 0.08;
  const hi = Math.max(...xs) + 0.08;
  out.push({ x: lo - Math.floor(lo), y: 0.5 }, { x: hi - Math.floor(hi), y: 0.5 });
  return out.sort((a, b) => a.x - b.x);
};

/** Y 커브: [입력, 출력] 쌍 */
const yCurve = (...pts: Array<[number, number]>): CurvePoint[] => pts.map(([x, y]) => ({ x, y }));

function node(
  name: string,
  p: Partial<PrimaryParams>,
  c: Partial<CurvesParams> = {},
  extra: Partial<PresetNode> = {},
): PresetNode {
  return {
    qualifier: defaultQualifier(),
    window: defaultWindow(),
    name,
    enabled: true,
    primary: { ...defaultPrimary(), ...p },
    curves: { ...defaultCurves(), ...c },
    lut: null,
    lutIntensity: 1,
    ...extra,
  };
}

/** 흑백 변환 노드 (앞 노드의 밝기 조정 뒤에 둔다) */
const monoNode = (patch: Partial<PrimaryParams> = {}, c: Partial<CurvesParams> = {}) =>
  node('흑백', { saturation: 0, ...patch }, c);

/** 가장자리를 어둡게 하는 비네트 노드 */
const vignetteNode = (strength: number) =>
  node('비네트', { gain: master(1 - strength) }, {}, {
    window: {
      enabled: true,
      invert: true,
      feather: 0.45,
      shape: { type: 'circle', cx: 0.5, cy: 0.5, rx: 0.72, ry: 0.5, angle: 0 },
    },
  });

// ── 정원 (13) ──

const GARDEN: BuiltinPreset[] = [
  {
    category: 'garden',
    name: '신록',
    description: '연두는 노랑 쪽, 녹색은 청록 쪽으로 갈라 잎의 층을 살리고 녹색 과포화를 누른다',
    nodes: [
      node('톤', { gamma: master(0.03), contrast: 1.04 }, { y: yCurve([0, 0], [0.75, 0.76], [1, 0.985]) }),
      node('녹색 분리', {}, {
        // 연두 −5°, 중간 녹색 +5° → 두 녹색 사이가 약 10° 벌어진다. 햇빛 받은 잎(0.285)은 거의 제자리.
        hueHue: bump([HUE_SPROUT, 0.46], [HUE_LEAF, 0.54]),
        hueSat: bump([HUE_SPROUT, 0.48], [HUE_FOLIAGE, 0.45], [HUE_LEAF, 0.46]),
        lumSat: yCurve([0, 0.5], [0.7, 0.5], [1, 0.4]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '늦가을 정원',
    description: '앰버빛 하이라이트, 가라앉은 섀도, 노랗게 바랜 녹색',
    nodes: [
      node('가을빛', {
        temperature: 8,
        gain: toward(AMBER, 0.3, 0.97),
        lift: toward(TEAL, 0.12, -0.012),
        saturation: 0.95,
        contrast: 1.03,
      }, {
        hueHue: bump([HUE_FOLIAGE, 0.42]),
        hueSat: bump([HUE_FOLIAGE, 0.42]),
        lumSat: yCurve([0, 0.33], [0.42, 0.5], [1, 0.5]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '흐린 날 구제',
    description: '미드톤 대비를 세우고, 위쪽 그라디언트 창으로 하늘만 짙게',
    nodes: [
      node('대비', { contrast: 1.06, temperature: 3, saturation: 0.93 }, {
        y: yCurve([0, 0], [0.25, 0.225], [0.75, 0.78], [1, 1]),
      }),
      // 위쪽 그라디언트 창 안에서만: 하늘을 눌러 구름 결을 살리고 푸른 기를 더한다
      node('하늘', { gamma: master(-0.15), temperature: -4, saturation: 1 }, {
        hueLum: bump([HUE_SKY, 0.42]),
        hueSat: bump([HUE_SKY, 0.55]),
      }, {
        window: { enabled: true, invert: false, feather: 0.05, shape: { type: 'gradient', x0: 0.5, y0: 0.05, x1: 0.5, y1: 0.55 } },
      }),
    ],
  },
  {
    category: 'garden',
    name: '매거진 내추럴',
    description: '낮은 채도, 들린 블랙, 부드럽게 꺾이는 하이라이트',
    nodes: [
      node('내추럴', { saturation: 0.93, contrast: 0.97, gain: toward(AMBER, 0.1, 1) }, {
        y: yCurve([0, 0.085], [0.5, 0.5], [0.85, 0.83], [1, 0.965]),
        lumSat: yCurve([0, 0.42], [0.25, 0.5], [0.75, 0.5], [1, 0.36]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '석재·목재 질감',
    description: '중간톤 대비로 돌결과 나뭇결을 세우고, 돌은 무채색 그대로, 나무색은 깊게',
    nodes: [
      node('질감', { contrast: 1.02, saturation: 0.93 }, {
        y: yCurve([0, 0], [0.3, 0.285], [0.5, 0.5], [0.7, 0.72], [1, 1]),
        // 벽돌(0.04)–나무(0.09) 사이를 함께 짙게. 그 사이의 피부는 밝기가 높으므로 Lum vs Sat로 다시 덜어 낸다.
        hueSat: bump([HUE_BRICK_WOOD, 0.57]),
        hueLum: bump([HUE_WOOD, 0.46]),
        lumSat: yCurve([0, 0.5], [0.47, 0.5], [0.6, 0.43], [1, 0.43]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '봄꽃 파스텔',
    description: '들린 섀도와 부드러운 대비, 분홍·보라 꽃을 가볍게',
    nodes: [
      node('파스텔', { contrast: 0.94, saturation: 0.92, lift: toward(SELENIUM, 0.08, 0.02), gain: toward(AMBER, 0.06, 1) }, {
        y: yCurve([0, 0.05], [0.5, 0.52], [1, 0.98]),
        hueLum: bump([0.95, 0.56], [HUE_PURPLE, 0.55]),
        lumSat: yCurve([0, 0.45], [0.6, 0.5], [1, 0.42]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '한여름 정오',
    description: '정오의 강한 햇빛: 하이라이트를 눌러 잎의 결을 되살리고 녹색 번들거림을 덜기',
    nodes: [
      node('하이라이트', { saturation: 0.95 }, {
        y: yCurve([0, 0], [0.55, 0.55], [0.8, 0.76], [1, 0.95]),
        hueSat: bump([HUE_FOLIAGE, 0.46]),
        lumSat: yCurve([0, 0.5], [0.65, 0.5], [1, 0.4]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '아침 안개',
    description: '낮은 대비, 들린 푸른 섀도, 옅은 채도',
    nodes: [
      node('안개', {
        contrast: 0.9,
        saturation: 0.85,
        temperature: -5,
        lift: toward(TEAL, 0.14, 0.035),
      }, {
        y: yCurve([0, 0.02], [0.5, 0.52], [1, 0.97]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '골든아워',
    description: '해 질 녘의 낮은 햇빛: 따뜻한 하이라이트, 노을빛으로 기우는 녹색',
    nodes: [
      node('골든아워', {
        temperature: 11,
        gain: toward(AMBER, 0.2, 0.97),
        lift: toward(ORANGE, 0.06, 0),
        saturation: 1.02,
      }, {
        hueHue: bump([HUE_FOLIAGE, 0.45]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '비 온 뒤',
    description: '젖은 잎과 돌의 짙은 색: 중간톤 대비와 깊은 녹색',
    nodes: [
      node('젖은 질감', { contrast: 1.06, gamma: master(-0.03), saturation: 0.93 }, {
        y: yCurve([0, 0], [0.3, 0.28], [0.7, 0.72], [1, 1]),
        hueSat: bump([HUE_LEAF, 0.52]),
        hueLum: bump([HUE_FOLIAGE, 0.47]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '겨울 정원',
    description: '차가운 공기: 푸른 그림자, 바랜 색, 맑은 하이라이트',
    nodes: [
      node('겨울', { temperature: -14, saturation: 0.82, lift: toward(BLUE, 0.12, -0.008) }, {
        y: yCurve([0, 0], [0.8, 0.8], [1, 0.98]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '수국 블루',
    description: '청보라 수국과 보라 꽃의 채도·깊이를 살리고 나머지는 그대로',
    nodes: [
      node('수국', {}, {
        hueSat: bump([HUE_HYDRANGEA, 0.58], [HUE_PURPLE, 0.56]),
        hueLum: bump([HUE_HYDRANGEA, 0.47]),
      }),
    ],
  },
  {
    category: 'garden',
    name: '단풍 강조',
    description: '채도가 높은 단풍의 주황·빨강만 골라 깊고 짙게 (피부는 채도가 낮아 제외)',
    nodes: [
      node('단풍', { saturation: 1.05, gamma: master(-0.05) }, {}, {
        // 피부(채도 약 0.24)와 단풍(약 0.5)은 색상이 겹치므로 채도로 가른다
        qualifier: {
          enabled: true,
          invert: false,
          hue: { on: true, center: 0.05, width: 0.07, soft: 0.03 },
          sat: { on: true, low: 0.38, high: 1, soft: 0.08 },
          lum: { on: false, low: 0, high: 1, soft: 0.05 },
        },
      }),
    ],
  },
];

// ── 보정 (12) ──

const CORRECTION: BuiltinPreset[] = [
  {
    category: 'correction',
    name: '노출 +½',
    description: '반 스톱 밝게 (선형 공간에서 빛의 양 ×1.41)',
    mayClip: true,
    nodes: [node('노출', { offset: master(0.5) })],
  },
  {
    category: 'correction',
    name: '노출 −½',
    description: '반 스톱 어둡게 (선형 공간에서 빛의 양 ×0.71)',
    nodes: [node('노출', { offset: master(-0.5) })],
  },
  {
    category: 'correction',
    name: '따뜻하게',
    description: '색온도를 따뜻한 쪽으로 (중립 회색의 밝기는 유지)',
    nodes: [node('색온도', { temperature: 28 })],
  },
  {
    category: 'correction',
    name: '차갑게',
    description: '색온도를 차가운 쪽으로 (중립 회색의 밝기는 유지)',
    nodes: [node('색온도', { temperature: -28 })],
  },
  {
    category: 'correction',
    name: '그늘 색 보정',
    description: '그늘에서 찍어 푸르게 뜬 사진을 중립으로',
    nodes: [node('그늘', { temperature: 30, tint: 6 })],
  },
  {
    category: 'correction',
    name: '녹색 반사광 제거',
    description: '잎에 둘러싸여 전체가 초록으로 물든 사진(인물·흰 벽)을 중립으로',
    nodes: [node('틴트', { tint: 20 })],
  },
  {
    category: 'correction',
    name: '하이라이트 복구',
    description: '밝은 부분을 눌러 구름·흰 꽃의 결을 되살리기',
    nodes: [
      node('하이라이트', {}, {
        y: yCurve([0, 0], [0.6, 0.6], [0.85, 0.8], [1, 0.93]),
        lumSat: yCurve([0, 0.5], [0.7, 0.5], [1, 0.44]),
      }),
    ],
  },
  {
    category: 'correction',
    name: '섀도 들기',
    description: '어두운 부분을 들어 그늘 속 디테일 보이기',
    nodes: [node('섀도', {}, { y: yCurve([0, 0.01], [0.2, 0.25], [0.5, 0.53], [1, 1]) })],
  },
  {
    category: 'correction',
    name: '대비 강하게',
    description: '18% 회색을 중심으로 대비 +10%, 하이라이트는 부드럽게 눌러 잘리지 않게',
    nodes: [node('대비', { contrast: 1.1, saturation: 0.92 }, { y: yCurve([0, 0], [0.85, 0.85], [1, 0.96]) })],
  },
  {
    category: 'correction',
    name: '대비 부드럽게',
    description: '18% 회색을 중심으로 대비 −15%',
    nodes: [node('대비', { contrast: 0.85, saturation: 1.04 })],
  },
  {
    category: 'correction',
    name: '채도 올리기',
    description: '옅은 색만 채도 +20% (바이브런스). 이미 진한 꽃색은 거의 그대로라 잘리지 않음',
    nodes: [
      node('바이브런스', { saturation: 1.2 }, {}, {
        qualifier: {
          enabled: true,
          invert: false,
          hue: { on: false, center: 0, width: 0.5, soft: 0 },
          sat: { on: true, low: 0, high: 0.3, soft: 0.25 },
          lum: { on: false, low: 0, high: 1, soft: 0 },
        },
      }),
    ],
  },
  {
    category: 'correction',
    name: '채도 내리기',
    description: '전체 채도 −20%',
    nodes: [node('채도', { saturation: 0.8 })],
  },
];

// ── 흑백 (6) ──

const BW: BuiltinPreset[] = [
  {
    category: 'bw',
    name: '흑백',
    description: 'Rec.709 휘도 그대로의 흑백',
    nodes: [monoNode()],
  },
  {
    category: 'bw',
    name: '고대비 흑백',
    description: '깊은 블랙과 또렷한 하이라이트',
    nodes: [monoNode({ contrast: 1.1 }, { y: yCurve([0, 0], [0.25, 0.22], [0.75, 0.79], [1, 1]) })],
  },
  {
    category: 'bw',
    name: '흑백 · 녹색 필터',
    description: '녹색 필터를 끼운 흑백: 잎은 밝게, 붉은 꽃과 하늘은 어둡게',
    nodes: [
      node('녹색 필터', {}, { hueLum: bump([HUE_FOLIAGE, 0.68], [HUE_LEAF, 0.68], [HUE_SKY, 0.42], [0.98, 0.4]) }),
      monoNode(),
    ],
  },
  {
    category: 'bw',
    name: '흑백 · 빨강 필터',
    description: '빨강 필터를 끼운 흑백: 하늘은 짙게, 붉은 꽃과 피부는 밝게',
    nodes: [
      node('빨강 필터', {}, { hueLum: bump([HUE_SKY, 0.3], [0.5, 0.36], [0.03, 0.64], [HUE_FOLIAGE, 0.42]) }),
      monoNode({ contrast: 1.05 }),
    ],
  },
  {
    category: 'bw',
    name: '세피아',
    description: '갈색 섀도와 크림색 하이라이트의 옛 사진',
    nodes: [
      monoNode({ contrast: 0.96 }),
      node('세피아', { lift: toward(SEPIA_DARK, 0.25, 0.01), gain: toward(AMBER, 0.16, 0.97) }),
    ],
  },
  {
    category: 'bw',
    name: '셀레늄 톤',
    description: '차가운 보랏빛 섀도의 흑백 프린트',
    nodes: [
      monoNode({ contrast: 1.08 }),
      node('셀레늄', { lift: toward(SELENIUM, 0.2, -0.005), gain: toward(AMBER, 0.04, 1) }),
    ],
  },
];

// ── 필름 (6) ──

const FILM: BuiltinPreset[] = [
  {
    category: 'film',
    name: '따뜻한 프린트 필름',
    description: '부드러운 토와 숄더, 청록 섀도와 따뜻한 하이라이트',
    bold: true,
    nodes: [
      node('프린트', {
        contrast: 1.06,
        saturation: 0.95,
        lift: toward(TEAL, 0.1, -0.005),
        gain: toward(AMBER, 0.16, 0.98),
      }, {
        y: yCurve([0, 0.015], [0.15, 0.13], [0.85, 0.89], [1, 0.97]),
      }),
    ],
  },
  {
    category: 'film',
    name: '차가운 슬라이드 필름',
    description: '높은 채도와 대비, 맑고 차가운 색',
    bold: true,
    nodes: [
      node('슬라이드', { contrast: 1.05, saturation: 1.02, temperature: -14 }, {
        y: yCurve([0, 0], [0.25, 0.22], [0.75, 0.79], [1, 0.99]),
        lumSat: yCurve([0, 0.5], [0.7, 0.5], [1, 0.42]),
      }),
    ],
  },
  {
    category: 'film',
    name: '바랜 필름',
    description: '들린 블랙, 눌린 흰색, 따뜻하게 바랜 색',
    nodes: [
      node('페이드', { saturation: 0.8, gain: toward(AMBER, 0.1, 1) }, {
        y: yCurve([0, 0.12], [0.5, 0.53], [1, 0.93]),
      }),
    ],
  },
  {
    category: 'film',
    name: '블리치 바이패스',
    description: '은을 남긴 현상: 낮은 채도와 강한 대비',
    bold: true,
    nodes: [
      node('블리치', { saturation: 0.55, contrast: 1.08, gamma: master(-0.03) }, {
        y: yCurve([0, 0], [0.25, 0.22], [0.75, 0.8], [1, 0.99]),
      }),
    ],
  },
  {
    category: 'film',
    name: '크로스 프로세스',
    description: '슬라이드 필름을 네거티브 약품으로 현상한 색: 노란 하이라이트, 푸른 섀도',
    bold: true,
    nodes: [
      node('크로스', { saturation: 1.02 }, {
        r: yCurve([0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]),
        g: yCurve([0, 0], [0.25, 0.24], [0.75, 0.8], [1, 1]),
        b: yCurve([0, 0.1], [0.5, 0.46], [1, 0.86]),
      }),
    ],
  },
  {
    category: 'film',
    name: '매트',
    description: '블랙만 살짝 들어 올린 차분한 무광 톤',
    nodes: [node('매트', { saturation: 0.92 }, { y: yCurve([0, 0.1], [0.25, 0.28], [0.75, 0.75], [1, 0.96]) })],
  },
];

// ── 시네마틱 (5) ──

const CINEMATIC: BuiltinPreset[] = [
  {
    category: 'cinematic',
    name: '틸 & 오렌지',
    description: '청록 섀도와 주황 하이라이트의 보색 대비',
    bold: true,
    nodes: [
      node('스플릿 톤', {
        contrast: 1.06,
        lift: toward(TEAL, 0.24, -0.01),
        gain: toward(ORANGE, 0.16, 0.98),
      }),
    ],
  },
  {
    category: 'cinematic',
    name: '무디 다크',
    description: '반 스톱가량 어둡게, 가라앉은 채도와 푸른 그림자, 가장자리 어둡게',
    nodes: [
      node('무드', {
        offset: master(-0.45),
        contrast: 1.08,
        saturation: 0.85,
        lift: toward(TEAL, 0.12, -0.005),
      }, {
        y: yCurve([0, 0], [0.8, 0.78], [1, 0.94]),
      }),
      vignetteNode(0.18),
    ],
  },
  {
    category: 'cinematic',
    name: '하이키 에어리',
    description: '밝고 가벼운 중간톤, 흰색은 잘리지 않게',
    nodes: [node('하이키', { gamma: master(0.14), lift: master(0.02), contrast: 0.94, saturation: 0.93, temperature: 2 })],
  },
  {
    category: 'cinematic',
    name: '로우키',
    description: '짙은 중간톤과 깊은 그림자, 가장자리 비네트',
    nodes: [
      node('로우키', { gamma: master(-0.14), contrast: 1.1, saturation: 0.9 }, { lumSat: yCurve([0, 0.4], [0.35, 0.5], [1, 0.5]) }),
      vignetteNode(0.22),
    ],
  },
  {
    category: 'cinematic',
    name: '비네트',
    description: '가장자리만 부드럽게 어둡게 (색은 그대로)',
    nodes: [vignetteNode(0.25)],
  },
];

// ── 확장 도구: RGB Mixer, 효과, 컬러 키 ──

const mixer = (rows: [Vec3, Vec3, Vec3], mono = false, preserve = true): PrimaryParams['mixer'] => ({ rows, mono, preserve });
/** 흑백 필터: 입력 R·G·B 비율 (합 1로 맞춰 밝기 유지) */
const filterMono = (r: number, g: number, b: number) => mixer([[r, g, b], [0, 1, 0], [0, 0, 1]], true, true);
/** 필름 룩 효과: 적지 않은 값은 기본값(효과 없음)으로 채워, 다른 필름 룩에서 바꿔도 깨끗하게 덮어쓴다 */
const fx = (d: Partial<Detail>): Partial<Detail> => ({
  grain: 0,
  grainSize: 100,
  vignette: 0,
  vignetteMidpoint: 50,
  vignetteFeather: 50,
  glow: 0,
  halation: 0,
  ...d,
});
/** 한 색만 남기고 나머지를 흑백으로 (Qualifier 반전 + 채도 0) */
const colorKey = (name: string, center: number, width: number) =>
  node(name, { saturation: 0 }, {}, {
    qualifier: {
      enabled: true,
      invert: true,
      hue: { on: true, center, width, soft: 0.05 },
      sat: { on: true, low: 0.12, high: 1, soft: 0.08 },
      lum: { on: false, low: 0, high: 1, soft: 0.05 },
    },
  });

const ROSE: Vec3 = [1, 0.35, 0.55];
const CREAM: Vec3 = [1, 0.92, 0.75];
const FOREST: Vec3 = [0.15, 0.4, 0.25];
const NAVY: Vec3 = [0.12, 0.2, 0.55];
const MAGENTA: Vec3 = [0.9, 0.2, 0.8];
const YELLOW: Vec3 = [1, 0.9, 0.3];

// ── 정원 확장 (12) ──

const GARDEN_MORE: BuiltinPreset[] = [
  {
    category: 'garden',
    name: '장미 정원',
    description: '진한 장미·붉은 꽃만 채도와 깊이를 살린다 (옅은 피부색은 채도로 걸러 낸다)',
    nodes: [
      node('장미', { saturation: 1.15, gamma: master(-0.04) }, {}, {
        qualifier: {
          enabled: true,
          invert: false,
          hue: { on: true, center: 0.97, width: 0.06, soft: 0.04 },
          sat: { on: true, low: 0.42, high: 1, soft: 0.08 },
          lum: { on: false, low: 0, high: 1, soft: 0.05 },
        },
      }),
    ],
  },
  {
    category: 'garden',
    name: '라벤더 밭',
    description: '보라 꽃을 짙고 맑게, 하늘은 그대로',
    nodes: [node('라벤더', { temperature: -3 }, { hueSat: bump([HUE_PURPLE, 0.6]), hueLum: bump([HUE_PURPLE, 0.46]) })],
  },
  {
    category: 'garden',
    name: '이끼·고사리',
    description: '짙은 녹색을 깊고 촉촉하게, 그늘은 살짝 들어 올린다',
    nodes: [node('이끼', { shadows: 18, colorBoost: 8 }, { hueSat: bump([HUE_LEAF, 0.55]), hueLum: bump([HUE_LEAF, 0.47]) })],
  },
  {
    category: 'garden',
    name: '잔디 정돈',
    description: '누렇게 뜬 잔디를 푸른 쪽으로, 과한 형광 녹색은 누른다',
    nodes: [node('잔디', {}, { hueHue: bump([HUE_SPROUT, 0.53], [HUE_FOLIAGE, 0.52]), hueSat: bump([HUE_FOLIAGE, 0.46]) })],
  },
  {
    category: 'garden',
    name: '역광 잎',
    description: '햇빛이 비치는 잎: 하이라이트를 누르고 그늘을 들며, 밝은 곳에 옅은 빛 번짐',
    nodes: [node('역광', { highlights: -22, shadows: 24, colorBoost: 12 })],
    detail: fx({ glow: 14 }),
  },
  {
    category: 'garden',
    name: '그늘 정원',
    description: '나무 그늘 아래: 어두운 곳을 들고 푸른 기운을 덜어 낸다',
    nodes: [node('그늘', { shadows: 34, temperature: 6, colorBoost: 8 })],
  },
  {
    category: 'garden',
    name: '연못·물빛',
    description: '물과 하늘의 청록을 맑게, 잎은 그대로',
    nodes: [node('물빛', {}, { hueSat: bump([0.56, 0.58], [HUE_SKY, 0.56]), hueLum: bump([0.56, 0.48]) })],
  },
  {
    category: 'garden',
    name: '꽃밭 선명',
    description: '탁한 꽃색은 살리고(Color Boost), 이미 진한 색은 더 오르지 않게 (Sat vs Sat)',
    nodes: [node('꽃밭', { colorBoost: 22 }, { satSat: [{ x: 0, y: 0.5 }, { x: 0.55, y: 0.5 }, { x: 1, y: 0.4 }] })],
  },
  {
    category: 'garden',
    name: '돌길·자갈',
    description: '돌·자갈에 낀 옅은 색 기운을 걷어 무채색으로, 중간톤 대비는 조금',
    nodes: [node('돌길', { contrast: 1.05 }, { satSat: [{ x: 0, y: 0.25 }, { x: 0.12, y: 0.5 }, { x: 1, y: 0.5 }] })],
  },
  {
    category: 'garden',
    name: '정원 야경',
    description: '조명 켠 저녁 정원: 그림자를 들고 조명 빛은 누르며, 주변은 푸르게',
    bold: true,
    nodes: [node('야경', { shadows: 22, highlights: -32, temperature: -8, highlight: toward(AMBER, 0.25, 0) })],
    detail: fx({ glow: 18 }),
  },
  {
    category: 'garden',
    name: '실내 식물',
    description: '실내 조명의 노란·녹색 기운을 덜고 잎색을 살린다',
    nodes: [node('실내', { temperature: -6, tint: 8, colorBoost: 10 })],
  },
  {
    category: 'garden',
    name: '온실',
    description: '유리에 비친 녹색 반사와 뿌연 공기를 걷는다',
    nodes: [node('온실', { tint: 12, highlights: -14, contrast: 1.03 })],
    detail: { dehaze: 15 },
  },
];

// ── 계절·날씨 (10) ──

const SEASON: BuiltinPreset[] = [
  {
    category: 'season',
    name: '봄 아침',
    description: '맑고 부드러운 아침 빛: 옅은 따뜻함, 들린 그림자',
    nodes: [node('봄 아침', { temperature: 5, shadows: 14, contrast: 0.96, colorBoost: 10 })],
  },
  {
    category: 'season',
    name: '초여름 한낮',
    description: '강한 해: 하이라이트를 누르고 색을 맑게',
    nodes: [node('한낮', { highlights: -24, contrast: 1.04, colorBoost: 14 })],
  },
  {
    category: 'season',
    name: '장마',
    description: '젖은 공기: 차분한 푸른 기운, 들린 그림자, 옅은 안개 걷기',
    nodes: [node('장마', { temperature: -6, shadows: 16, saturation: 0.92 })],
    detail: { dehaze: 12 },
  },
  {
    category: 'season',
    name: '미세먼지 걷기',
    description: '뿌연 날: 안개를 걷고(디헤이즈) 대비와 색을 되살린다',
    nodes: [node('맑게', { contrast: 1.05, colorBoost: 15 })],
    detail: { dehaze: 35 },
  },
  {
    category: 'season',
    name: '초가을',
    description: '녹색이 막 누렇게 기우는 때: 따뜻한 하이라이트',
    nodes: [node('초가을', { temperature: 6, gain: toward(AMBER, 0.08, 1) }, { hueHue: bump([HUE_FOLIAGE, 0.44]) })],
  },
  {
    category: 'season',
    name: '가을 역광',
    description: '낮은 가을 햇빛: 앰버 하이라이트와 번지는 빛',
    bold: true,
    nodes: [node('가을 역광', { temperature: 10, highlight: toward(AMBER, 0.3, 0), highlights: -12 })],
    detail: fx({ glow: 22, halation: 10 }),
  },
  {
    category: 'season',
    name: '첫눈',
    description: '눈 덮인 정원: 흰색을 깨끗하게 두고 그림자는 푸르게',
    nodes: [node('첫눈', { temperature: -10, highlights: -10, shadow: toward(BLUE, 0.25, 0) })],
  },
  {
    category: 'season',
    name: '겨울 새벽',
    description: '해 뜨기 전: 푸르고 차가운 빛, 낮은 채도',
    bold: true,
    nodes: [node('새벽', { temperature: -20, saturation: 0.8, gamma: master(-0.04) })],
  },
  {
    category: 'season',
    name: '노을 직후',
    description: '해 진 뒤 하늘의 분홍·보랏빛',
    bold: true,
    mayClip: true,
    nodes: [node('노을', { highlight: toward(ROSE, 0.3, 0), midtone: toward(MAGENTA, 0.1, 0), temperature: 4 })],
  },
  {
    category: 'season',
    name: '블루아워',
    description: '해 진 뒤 푸른 시간: 푸른 그림자와 따뜻한 조명',
    bold: true,
    nodes: [node('블루아워', { temperature: -16, shadow: toward(BLUE, 0.3, 0), highlight: toward(AMBER, 0.25, 0) })],
  },
];

// ── 보정 확장 (10) ──

const CORRECTION_MORE: BuiltinPreset[] = [
  {
    category: 'correction',
    name: '노출 +1',
    description: '빛의 양 2배 (+1 스톱). 밝은 곳은 잘릴 수 있다',
    bold: true,
    mayClip: true,
    nodes: [node('노출 +1', { offset: master(1) })],
  },
  {
    category: 'correction',
    name: '노출 −1',
    description: '빛의 양 절반 (−1 스톱)',
    nodes: [node('노출 −1', { offset: master(-1) })],
  },
  {
    category: 'correction',
    name: '텅스텐 조명 보정',
    description: '백열등·전구색 조명의 강한 주황 기운을 걷는다',
    bold: true,
    mayClip: true,
    nodes: [node('텅스텐', { temperature: -45 })],
  },
  {
    category: 'correction',
    name: '형광등 보정',
    description: '형광등의 녹색 기운을 걷는다',
    bold: true,
    nodes: [node('형광등', { tint: 26, temperature: 4 })],
  },
  {
    category: 'correction',
    name: '밝은 곳·어두운 곳 균형',
    description: '하이라이트는 누르고 그늘은 들어 넓은 계조를 화면에 담는다',
    nodes: [node('균형', { highlights: -32, shadows: 34 })],
  },
  {
    category: 'correction',
    name: '탁한 색 살리기',
    description: 'Color Boost: 채도가 낮은 색만 올려 진한 색은 넘치지 않게',
    bold: true,
    nodes: [node('Color Boost', { colorBoost: 40 })],
  },
  {
    category: 'correction',
    name: '진한 색 누르기',
    description: '이미 진한 색만 채도를 낮춘다 (Sat vs Sat). 꽃색 클리핑 방지',
    nodes: [node('진한 색', {}, { satSat: [{ x: 0, y: 0.5 }, { x: 0.45, y: 0.5 }, { x: 1, y: 0.32 }] })],
  },
  {
    category: 'correction',
    name: '회색 순화',
    description: '회색·흰색에 낀 옅은 색 기운만 걷는다 (Sat vs Sat 아래쪽)',
    nodes: [node('회색 순화', {}, { satSat: [{ x: 0, y: 0.15 }, { x: 0.1, y: 0.5 }, { x: 1, y: 0.5 }] })],
  },
  {
    category: 'correction',
    name: '그늘 색 따뜻하게',
    description: '그림자 영역만 푸른 기운을 덜어 낸다 (Log 휠 Shadow)',
    nodes: [node('그늘 색', { shadow: toward(AMBER, 0.2, 0) })],
  },
  {
    category: 'correction',
    name: '하늘만 내리기',
    description: '밝은 영역만 밝기를 낮춰 하늘의 구름결을 살린다',
    nodes: [node('하늘', { highlights: -40 })],
  },
];

// ── 흑백 확장 (9) ──

const BW_MORE: BuiltinPreset[] = [
  { category: 'bw', name: '흑백 · 파랑 필터', description: '하늘은 밝게, 붉은 꽃·흙은 어둡게', nodes: [node('파랑 필터', { mixer: filterMono(0.1, 0.3, 0.6) })] },
  { category: 'bw', name: '흑백 · 노랑 필터', description: '하늘을 조금 짙게, 잎은 자연스럽게 (풍경 기본)', nodes: [node('노랑 필터', { mixer: filterMono(0.42, 0.5, 0.08) })] },
  { category: 'bw', name: '흑백 · 주황 필터', description: '하늘을 짙게, 피부·나무를 밝게', nodes: [node('주황 필터', { mixer: filterMono(0.6, 0.36, 0.04) })] },
  { category: 'bw', name: '흑백 · 부드러운', description: '낮은 대비와 들린 블랙의 은은한 흑백', nodes: [monoNode({ contrast: 0.88, lift: master(0.03) })] },
  { category: 'bw', name: '흑백 · 하이키', description: '밝고 가벼운 흑백, 흰색은 잘리지 않게', nodes: [monoNode({ gamma: master(0.25), highlights: -10 })] },
  { category: 'bw', name: '흑백 · 로우키', description: '짙은 중간톤과 깊은 그림자', nodes: [monoNode({ gamma: master(-0.22), contrast: 1.06 })] },
  {
    category: 'bw',
    name: '시아노타입',
    description: '청사진 인화처럼 푸른 단색',
    nodes: [monoNode({}), node('시안 톤', { lift: toward(NAVY, 0.3, 0.01), gain: toward(CYAN, 0.12, 0.98) })],
  },
  {
    category: 'bw',
    name: '흑백 · 스플릿 톤',
    description: '그림자는 차갑게, 밝은 곳은 따뜻하게 물들인 흑백',
    nodes: [monoNode({}), node('스플릿', { shadow: toward(BLUE, 0.2, 0), highlight: toward(AMBER, 0.2, 0) })],
  },
  {
    category: 'bw',
    name: '흑백 필름 그레인',
    description: '노랑 필터 흑백에 굵은 필름 입자',
    nodes: [node('필름 흑백', { mixer: filterMono(0.42, 0.5, 0.08), contrast: 1.08 })],
    detail: fx({ grain: 45, grainSize: 140 }),
  },
];

// ── 필름 확장 (9, 효과 포함) ──

const FILM_MORE: BuiltinPreset[] = [
  {
    category: 'film',
    name: '컬러 네거티브 · 인물',
    description: '부드러운 대비, 따뜻한 하이라이트, 고운 입자',
    nodes: [node('네거티브', { contrast: 0.94, lift: master(0.02), highlight: toward(AMBER, 0.1, 0), colorBoost: -8 })],
    detail: fx({ grain: 18, halation: 8 }),
  },
  {
    category: 'film',
    name: '컬러 네거티브 · 풍경',
    description: '맑은 채도와 단단한 대비, 고운 입자',
    nodes: [
      node('네거티브', { contrast: 1.04, saturation: 1.03, shadow: toward(TEAL, 0.08, 0) }, {
        satSat: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.4 }],
      }),
    ],
    detail: fx({ grain: 15 }),
  },
  {
    category: 'film',
    name: '고채도 슬라이드',
    description: '진한 색, 깊은 그림자, 차가운 하이라이트',
    bold: true,
    mayClip: true,
    nodes: [node('슬라이드', { contrast: 1.12, colorBoost: 25, temperature: -5, gamma: master(-0.04) })],
    detail: fx({ grain: 10 }),
  },
  {
    category: 'film',
    name: '시네마 네거티브',
    description: '청록 그림자, 따뜻한 하이라이트, 붉게 번지는 빛',
    bold: true,
    nodes: [node('시네마', { shadow: toward(TEAL, 0.25, 0), highlight: toward(AMBER, 0.18, 0), contrast: 1.04 })],
    detail: fx({ grain: 20, halation: 28 }),
  },
  {
    category: 'film',
    name: '인스턴트 필름',
    description: '바랜 청록 그림자, 크림색 하이라이트, 옅은 비네트',
    bold: true,
    nodes: [node('인스턴트', { lift: toward(CYAN, 0.12, 0.06), gain: toward(CREAM, 0.1, 0.96), saturation: 0.85, contrast: 0.95 })],
    detail: fx({ grain: 15, vignette: 25 }),
  },
  {
    category: 'film',
    name: '8mm 홈무비',
    description: '따뜻하고 거친 입자, 짙은 비네트, 번지는 하이라이트',
    bold: true,
    nodes: [node('8mm', { temperature: 12, contrast: 1.08, saturation: 0.9 })],
    detail: fx({ grain: 60, grainSize: 220, vignette: 45, vignetteMidpoint: 40, halation: 20 }),
  },
  {
    category: 'film',
    name: '70년대 빈티지',
    description: '누렇게 바랜 색과 들린 블랙',
    bold: true,
    nodes: [node('70s', { temperature: 10, tint: -6, lift: toward(YELLOW, 0.1, 0.05), saturation: 0.8 })],
    detail: fx({ grain: 25 }),
  },
  {
    category: 'film',
    name: '로모',
    description: '강한 대비와 채도, 짙은 비네트',
    bold: true,
    mayClip: true,
    nodes: [node('로모', { contrast: 1.15, colorBoost: 30, lift: toward(BLUE, 0.1, 0), gain: toward(YELLOW, 0.08, 1) })],
    detail: fx({ vignette: 60, vignetteMidpoint: 35, grain: 15 }),
  },
  {
    category: 'film',
    name: '할레이션 필름',
    description: '밝은 곳 둘레에 붉게 번지는 빛과 고운 입자',
    nodes: [node('할레이션', { highlight: toward(AMBER, 0.06, 0) })],
    detail: fx({ halation: 50, glow: 8, grain: 15 }),
  },
];

// ── 시네마틱 확장 (10) ──

const CINEMATIC_MORE: BuiltinPreset[] = [
  {
    category: 'cinematic',
    name: '블록버스터',
    description: '강한 청록 그림자와 주황 피부·하이라이트',
    bold: true,
    mayClip: true,
    nodes: [node('블록버스터', { contrast: 1.08, shadow: toward(TEAL, 0.35, -0.01), highlight: toward(ORANGE, 0.22, 0), colorBoost: 10 })],
  },
  {
    category: 'cinematic',
    name: '노이르',
    description: '거의 흑백인 짙은 대비와 비네트',
    bold: true,
    mayClip: true,
    nodes: [node('노이르', { saturation: 0.12, contrast: 1.2, gamma: master(-0.12) })],
    detail: fx({ vignette: 45, grain: 20 }),
  },
  {
    category: 'cinematic',
    name: '사막의 열기',
    description: '바랜 주황빛과 눌린 하이라이트',
    bold: true,
    nodes: [node('사막', { temperature: 22, saturation: 0.88, highlights: -12, lift: toward(ORANGE, 0.08, 0.02) })],
  },
  {
    category: 'cinematic',
    name: '북유럽 미니멀',
    description: '차갑고 절제된 색, 들린 블랙',
    bold: true,
    nodes: [node('미니멀', { temperature: -10, saturation: 0.72, lift: master(0.03), contrast: 0.95 })],
  },
  {
    category: 'cinematic',
    name: '네온 나이트',
    description: '마젠타 하이라이트와 청록 그림자의 밤거리',
    bold: true,
    mayClip: true,
    nodes: [node('네온', { shadow: toward(CYAN, 0.35, -0.01), highlight: toward(MAGENTA, 0.3, 0), colorBoost: 30, contrast: 1.06 })],
    detail: fx({ glow: 25 }),
  },
  {
    category: 'cinematic',
    name: '블루 무비',
    description: '전체를 푸르게 물들인 차가운 영화 톤',
    bold: true,
    nodes: [node('블루', { temperature: -24, midtone: toward(BLUE, 0.15, 0), saturation: 0.9 })],
  },
  {
    category: 'cinematic',
    name: '그린 매트릭스',
    description: '녹색으로 기운 디지털 느낌',
    bold: true,
    nodes: [node('그린', { mixer: mixer([[0.85, 0.15, 0], [0.05, 1.0, 0.05], [0, 0.2, 0.75]], false, true), tint: -14, contrast: 1.05 })],
  },
  {
    category: 'cinematic',
    name: '웨스턴',
    description: '먼지 낀 갈색 톤과 단단한 대비',
    bold: true,
    mayClip: true,
    nodes: [node('웨스턴', { temperature: 16, saturation: 0.8, contrast: 1.1, shadow: toward(SEPIA_DARK, 0.2, 0) })],
    detail: fx({ grain: 20, vignette: 25 }),
  },
  {
    category: 'cinematic',
    name: '파스텔 무비',
    description: '들린 블랙, 옅은 색, 분홍빛 하이라이트',
    bold: true,
    nodes: [node('파스텔', { lift: master(0.06), saturation: 0.8, highlight: toward(ROSE, 0.15, 0), contrast: 0.92 })],
  },
  {
    category: 'cinematic',
    name: '매직아워 글로우',
    description: '따뜻한 빛과 하이라이트 번짐',
    bold: true,
    nodes: [node('매직아워', { temperature: 14, highlight: toward(AMBER, 0.25, 0), highlights: -10 })],
    detail: fx({ glow: 30, halation: 15 }),
  },
];

// ── 크리에이티브 (10) ──

const CREATIVE: BuiltinPreset[] = [
  {
    category: 'creative',
    name: '듀오톤 · 숲과 크림',
    description: '짙은 숲색 그림자와 크림색 하이라이트의 두 색',
    bold: true,
    nodes: [monoNode({}), node('듀오톤', { lift: toward(FOREST, 0.45, 0.02), gain: toward(CREAM, 0.2, 0.98) })],
  },
  {
    category: 'creative',
    name: '듀오톤 · 남색과 주황',
    description: '남색 그림자와 주황 하이라이트의 두 색',
    bold: true,
    nodes: [monoNode({}), node('듀오톤', { lift: toward(NAVY, 0.5, 0.02), gain: toward(ORANGE, 0.25, 0.98) })],
  },
  {
    category: 'creative',
    name: '적외선풍',
    description: '잎이 희고 분홍빛으로 빛나는 적외선 사진 느낌 (채널 섞기)',
    bold: true,
    mayClip: true,
    nodes: [node('적외선', { mixer: mixer([[0.3, 0.9, -0.2], [0.2, 0.5, 0.3], [0.1, 0.3, 0.6]], false, true), colorBoost: 15 })],
  },
  { category: 'creative', name: '빨강만 남기기', description: '붉은 꽃만 색을 두고 나머지는 흑백', bold: true, nodes: [colorKey('빨강만', 0.98, 0.07)] },
  { category: 'creative', name: '초록만 남기기', description: '잎만 색을 두고 나머지는 흑백', bold: true, nodes: [colorKey('초록만', HUE_FOLIAGE, 0.09)] },
  { category: 'creative', name: '파랑만 남기기', description: '하늘·파란 꽃만 색을 두고 나머지는 흑백', bold: true, nodes: [colorKey('파랑만', HUE_SKY, 0.08)] },
  {
    category: 'creative',
    name: '팝아트',
    description: '아주 진한 색과 강한 대비',
    bold: true,
    mayClip: true,
    nodes: [node('팝아트', { saturation: 1.3, colorBoost: 50, contrast: 1.15 })],
  },
  {
    category: 'creative',
    name: '시안 & 마젠타',
    description: '청록 그림자와 마젠타 하이라이트',
    bold: true,
    nodes: [node('시안 마젠타', { shadow: toward(CYAN, 0.3, 0), highlight: toward(MAGENTA, 0.25, 0) })],
  },
  {
    category: 'creative',
    name: '엽서 빈티지',
    description: '누렇게 바랜 엽서: 낮은 채도, 들린 블랙, 비네트',
    bold: true,
    nodes: [node('엽서', { saturation: 0.65, lift: toward(YELLOW, 0.12, 0.05), gain: toward(CREAM, 0.1, 0.97), contrast: 0.92 })],
    detail: fx({ vignette: 30, grain: 20 }),
  },
  {
    category: 'creative',
    name: '색상 반전 (보색)',
    description: '색상만 정반대로 돌린다 (밝기는 그대로)',
    bold: true,
    mayClip: true,
    nodes: [node('보색', { hue: 180 })],
  },
];

// ── 프로 워크플로 (23): 로그로 평탄하게 만든 뒤 색을 입힌다 ──
// 노드 1 '로그 변환'(sRGB → 로그) → 노드 2 '1차 보정 (Log)'(노출은 Offset, 색은 휠로; 로그 상태라 넓은 범위가 고르게 움직인다)
// → 노드 3 '룩'(로그 입력 LUT). 질감(그레인·할레이션 등)은 디테일 효과로 함께 건다.

const lutNode = (name: string, lutRef: string) => node(name, {}, {}, { lutRef });
const primaryLogNode = () => node('1차 보정 (Log)', {});

const proWorkflow = (look: string, lookName: string, description: string, detail?: Partial<Detail>): BuiltinPreset => ({
  category: 'pro',
  name: `프로 · ${lookName}`,
  description: `${description}. 로그 변환 → 1차 보정 → 룩 LUT`,
  bold: true,
  nodes: [lutNode('로그 변환', 'tolog-arri'), primaryLogNode(), lutNode(lookName, `pro-${look}`)],
  ...(detail ? { detail: fx(detail) } : { detail: fx({}) }),
});

const PRO_WORKFLOW: BuiltinPreset[] = [
  proWorkflow('cine-standard', '시네마 표준', '부드러운 하이라이트의 기본 영화 톤'),
  proWorkflow('portrait-neg', '인물 네거티브', '고운 피부와 따뜻한 하이라이트, 고운 입자', { grain: 12 }),
  proWorkflow('landscape-neg', '풍경 네거티브', '깊은 녹색과 맑은 하늘', { grain: 8 }),
  proWorkflow('doc-chrome', '다큐 크롬', '가라앉은 채도와 단단한 그림자', { grain: 14 }),
  proWorkflow('reversal', '리버설 슬라이드', '깊은 대비와 진한 색', { grain: 8 }),
  proWorkflow('tungsten-night', '텅스텐 나이트', '푸른 밤과 따뜻한 조명, 붉게 번지는 빛', { grain: 22, halation: 35 }),
  proWorkflow('bleach', '블리치 시네마', '낮은 채도와 강한 대비, 거친 입자', { grain: 20 }),
  { ...proWorkflow('teal-orange', '틸 & 오렌지 프로', '피부는 주황, 나머지는 청록', { grain: 10 }), mayClip: true },
  proWorkflow('wedding-airy', '웨딩 에어리', '밝고 가벼운 파스텔, 옅은 빛 번짐', { glow: 12 }),
  proWorkflow('drama-soft', '드라마 소프트', '깨끗한 피부와 부드러운 대비'),
  proWorkflow('editorial', '매거진 에디토리얼', '중립적이고 풍부한 지면용 톤', { clarity: 10 }),
  proWorkflow('moody-forest', '무디 포레스트', '올리브빛 녹색과 깊은 그림자, 가장자리 어둡게', { vignette: 25, grain: 10 }),
  proWorkflow('garden-golden', '가든 골든', '햇빛 머금은 녹색과 번지는 하이라이트', { glow: 18, halation: 10 }),
  proWorkflow('nordic-matte', '노르딕 매트', '차갑고 절제된 무광 톤'),
  proWorkflow('vintage-print', '빈티지 프린트', '바랜 블랙과 크림색, 굵은 입자와 비네트', { grain: 28, grainSize: 150, vignette: 22 }),
  proWorkflow('silver-bw', '실버 흑백', '깊은 계조의 흑백과 필름 입자', { grain: 30 }),
];

/** 로그 베이스: 사진을 그 카메라 로그로 바꿔 두고, 마지막 노드의 LUT를 갖고 있는 상용 LUT로 바꿔 쓰는 틀 */
const logBase = (cam: string, camName: string): BuiltinPreset => ({
  category: 'pro',
  name: `로그 베이스 · ${camName}`,
  description: `사진을 ${camName}로 평탄하게 바꾼다. 마지막 노드의 LUT를 ${camName}용 LUT(갖고 있는 상용 LUT 등)로 '바꾸기' 하면 그 색감이 그대로 입혀진다`,
  nodes: [lutNode('로그 변환', `tolog-${cam}`), primaryLogNode(), lutNode('룩 LUT (바꿔 쓰기)', `camera-${cam}-soft`)],
});

const LOG_BASES: BuiltinPreset[] = [
  logBase('dji', 'DJI D-Log'),
  logBase('sony', 'Sony S-Log3'),
  logBase('arri', 'ARRI LogC3'),
  logBase('panasonic', 'Panasonic V-Log'),
  logBase('fujifilm-flog2', 'Fujifilm F-Log2'),
  logBase('canon', 'Canon Log 3'),
  logBase('apple', 'Apple Log'),
];

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  ...GARDEN,
  ...GARDEN_MORE,
  ...SEASON,
  ...CORRECTION,
  ...CORRECTION_MORE,
  ...BW,
  ...BW_MORE,
  ...FILM,
  ...FILM_MORE,
  ...CINEMATIC,
  ...CINEMATIC_MORE,
  ...CREATIVE,
  ...PRO_WORKFLOW,
  ...LOG_BASES,
];

// 내부에서 다른 라이브러리(LUT)가 쓰는 색 상수
export const PRESET_COLORS = { AMBER, ORANGE, TEAL, BLUE, CYAN, HUE_RED };
