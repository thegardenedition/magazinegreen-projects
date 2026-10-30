// 기본 제공 프리셋 라이브러리 (5개 분류, 42종).
// 모든 값은 이 앱의 노드 기능(Primary, Curves, Qualifier, Window)만으로 만든다.
// 공통 안전선(계조 반전·새 클리핑·피부 색상)과 정원 프리셋의 목표는 tests/unit/gardenPresets.test.ts,
// 나머지 분류의 목표는 tests/unit/presetLibrary.test.ts에서 수치로 검증한다.

import { defaultPrimary, LUMA, type PrimaryParams, type Vec3, type WheelValue } from './color';
import { defaultCurves, type CurvePoint, type CurvesParams } from './curves';
import { defaultQualifier, defaultWindow } from './mask';
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

export const BUILTIN_PRESETS: BuiltinPreset[] = [...GARDEN, ...CORRECTION, ...BW, ...FILM, ...CINEMATIC];

// 내부에서 다른 라이브러리(LUT)가 쓰는 색 상수
export const PRESET_COLORS = { AMBER, ORANGE, TEAL, BLUE, CYAN, HUE_RED };
