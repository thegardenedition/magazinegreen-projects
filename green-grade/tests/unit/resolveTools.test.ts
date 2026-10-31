import { describe, expect, it } from 'vitest';
import { defaultPrimary, gradePixel8, LUMA, srgbToLinear, toUniforms, type PrimaryParams, type Vec3 } from '../../src/engine/color';
import { bakeCurves, defaultCurves, type CurvesParams } from '../../src/engine/curves';
import { computeBase, defaultDevelop, developReference, planDevelop, type Detail, type PixelSource } from '../../src/engine/develop';
import { parse3dl, parseCube, parseLutFile, sampleLut, serializeCube, buildLut } from '../../src/engine/lut';
import { parsePreset, serializePreset } from '../../src/engine/presets';

const grade = (c: Vec3, patch: Partial<PrimaryParams>, curves?: CurvesParams) =>
  gradePixel8(c, toUniforms({ ...defaultPrimary(), ...patch }, { curves: curves ? bakeCurves(curves) : undefined }));
const lum = (c: Vec3) => LUMA[0] * srgbToLinear(c[0] / 255) + LUMA[1] * srgbToLinear(c[1] / 255) + LUMA[2] * srgbToLinear(c[2] / 255);
const chroma = (c: Vec3) => Math.max(...c) - Math.min(...c);

describe('Primaries 막대: Shadows · Highlights · Color Boost', () => {
  it('기본값은 아무것도 바꾸지 않는다', () => {
    for (const c of [[0, 0, 0], [40, 90, 30], [128, 128, 128], [250, 240, 200]] as Vec3[]) expect(grade(c, {})).toEqual(c);
  });
  it('Shadows +는 어두운 곳을 크게, 밝은 곳은 거의 올리지 않는다', () => {
    const dark: Vec3 = [30, 30, 30];
    const bright: Vec3 = [220, 220, 220];
    expect(grade(dark, { shadows: 60 })[0] - 30).toBeGreaterThan(15);
    expect(grade(bright, { shadows: 60 })[0] - 220).toBeLessThan(2);
  });
  it('Highlights −는 밝은 곳만 내린다 (하늘 살리기)', () => {
    expect(220 - grade([220, 220, 220], { highlights: -60 })[0]).toBeGreaterThan(15);
    expect(Math.abs(30 - grade([30, 30, 30], { highlights: -60 })[0])).toBeLessThan(2);
  });
  it('Color Boost는 탁한 색을 많이, 진한 색은 적게 올리고 회색은 그대로', () => {
    const dull: Vec3 = [120, 130, 110];
    const vivid: Vec3 = [200, 40, 40];
    const gainDull = chroma(grade(dull, { colorBoost: 80 })) / chroma(dull);
    const gainVivid = chroma(grade(vivid, { colorBoost: 80 })) / chroma(vivid);
    expect(gainDull).toBeGreaterThan(1.4);
    expect(gainVivid).toBeLessThan(gainDull);
    expect(grade([128, 128, 128], { colorBoost: 80 })).toEqual([128, 128, 128]);
  });
});

describe('Log 휠', () => {
  it('Shadow 휠은 어두운 곳에만 색을 더한다', () => {
    const blue = { x: 0.8, y: 0, master: 0 };
    const dark = grade([30, 30, 30], { shadow: blue });
    const bright = grade([220, 220, 220], { shadow: blue });
    expect(dark[2] - dark[0]).toBeGreaterThan(10);
    expect(Math.abs(bright[2] - bright[0])).toBeLessThanOrEqual(1);
  });
  it('Highlight 휠은 밝은 곳에만, Midtone은 중간에 가장 세게', () => {
    const warm = { x: -0.6, y: 0.6, master: 0 };
    const hiBright = grade([225, 225, 225], { highlight: warm });
    const hiDark = grade([25, 25, 25], { highlight: warm });
    expect(hiBright[0] - hiBright[2]).toBeGreaterThan(10);
    expect(Math.abs(hiDark[0] - hiDark[2])).toBeLessThanOrEqual(1);
    const mid = grade([120, 120, 120], { midtone: { x: 0, y: 0, master: 0.1 } });
    const edge = grade([10, 10, 10], { midtone: { x: 0, y: 0, master: 0.1 } });
    expect(mid[0] - 120).toBeGreaterThan(edge[0] - 10);
  });
  it('Low Range를 올리면 Shadow 휠이 더 밝은 곳까지 닿는다', () => {
    const m = { x: 0, y: 0, master: 0.1 };
    const narrow = grade([90, 90, 90], { shadow: m, lowRange: 0.15 })[0];
    const wide = grade([90, 90, 90], { shadow: m, lowRange: 0.5 })[0];
    expect(wide).toBeGreaterThan(narrow + 5);
  });
});

describe('RGB Mixer', () => {
  it('흑백: 출력 R 행 하나로 세 채널이 같아진다 (녹색 필터처럼)', () => {
    const mixer = { rows: [[0.1, 0.8, 0.1], [0, 1, 0], [0, 0, 1]] as PrimaryParams['mixer']['rows'], mono: true, preserve: false };
    const leaf = grade([60, 140, 40], { mixer });
    const sky = grade([120, 170, 230], { mixer });
    expect(leaf[0]).toBe(leaf[1]);
    expect(leaf[1]).toBe(leaf[2]);
    expect(Math.abs(sky[0] - sky[2])).toBeLessThanOrEqual(0);
  });
  it('채널 바꾸기와 휘도 유지', () => {
    const swap = { rows: [[0, 0, 1], [0, 1, 0], [1, 0, 0]] as PrimaryParams['mixer']['rows'], mono: false, preserve: false };
    expect(grade([200, 100, 20], { mixer: swap })).toEqual([20, 100, 200]);
    // 행 합이 2라도 휘도 유지면 회색은 그대로
    const strong = { rows: [[2, 0, 0], [0, 2, 0], [0, 0, 2]] as PrimaryParams['mixer']['rows'], mono: false, preserve: true };
    expect(grade([128, 128, 128], { mixer: strong })).toEqual([128, 128, 128]);
  });
});

describe('Sat vs Sat · Sat vs Lum 커브', () => {
  it('Sat vs Sat: 진한 색만 채도를 낮출 수 있다', () => {
    const c = { ...defaultCurves(), satSat: [{ x: 0, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 1, y: 0.2 }] };
    const vivid: Vec3 = [220, 40, 40];
    const dull: Vec3 = [130, 120, 115];
    expect(chroma(grade(vivid, {}, c))).toBeLessThan(chroma(vivid) * 0.8);
    expect(Math.abs(chroma(grade(dull, {}, c)) - chroma(dull))).toBeLessThanOrEqual(2);
  });
  it('Sat vs Lum: 진한 색만 어둡게 하고 회색은 그대로', () => {
    const c = { ...defaultCurves(), satLum: [{ x: 0, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 1, y: 0.2 }] };
    expect(lum(grade([40, 200, 40], {}, c))).toBeLessThan(lum([40, 200, 40]) * 0.85);
    expect(grade([128, 128, 128], {}, c)).toEqual([128, 128, 128]);
  });
});

describe('프리셋 파일', () => {
  it('새 값(Log 휠·막대·Mixer)이 왕복되고, 예전 파일은 기본값으로 읽힌다', () => {
    const p = {
      ...defaultPrimary(),
      shadow: { x: 0.2, y: -0.1, master: 0.05 },
      shadows: 30,
      colorBoost: -20,
      lowRange: 0.25,
      mixer: { rows: [[0.3, 0.6, 0.1], [0, 1, 0], [0, 0, 1]] as PrimaryParams['mixer']['rows'], mono: true, preserve: true },
    };
    const node = { name: 'n', enabled: true, primary: p, curves: { ...defaultCurves(), satSat: [{ x: 0.5, y: 0.3 }] } };
    const text = serializePreset({ name: 't', nodes: [node] } as never);
    const back = parsePreset(text).nodes[0];
    expect(back.primary.shadow).toEqual(p.shadow);
    expect(back.primary.mixer).toEqual(p.mixer);
    expect(back.primary.lowRange).toBe(0.25);
    expect(back.curves.satSat).toEqual([{ x: 0.5, y: 0.3 }]);
    const old = JSON.parse(text);
    for (const k of ['shadow', 'shadows', 'colorBoost', 'lowRange', 'mixer']) delete old.nodes[0].primary[k];
    delete old.nodes[0].curves.satSat;
    const o = parsePreset(JSON.stringify(old)).nodes[0];
    expect(o.primary.mixer).toEqual(defaultPrimary().mixer);
    expect(o.primary.shadows).toBe(0);
    expect(o.curves.satSat).toEqual([]);
  });
});

describe('.3dl LUT', () => {
  const ref = buildLut(5, 'ref', (r, g, b) => [r * 0.9, Math.sqrt(g), 1 - b * 0.5]);
  /** 기준 LUT를 .3dl 텍스트로 (B가 가장 빠름) */
  const to3dl = (bits: number, shaper = true, mesh = false) => {
    const n = ref.size;
    const max = 2 ** bits - 1;
    const lines: string[] = [];
    if (mesh) lines.push(`Mesh 2 ${bits}`);
    if (shaper) lines.push(Array.from({ length: n }, (_, i) => Math.round((i * 1023) / (n - 1))).join(' '));
    for (let r = 0; r < n; r++)
      for (let g = 0; g < n; g++)
        for (let b = 0; b < n; b++) {
          const i = ((b * n + g) * n + r) * 4;
          lines.push([0, 1, 2].map((c) => Math.round(ref.data[i + c] * max)).join(' '));
        }
    return lines.join('\n');
  };
  it.each([[10, true, false], [12, true, true], [16, false, false]] as const)('%i bit (입력 격자 줄 %s, Mesh 줄 %s)', (bits, shaper, mesh) => {
    const l = parse3dl(to3dl(bits, shaper, mesh), 'look.3dl');
    expect(l.size).toBe(5);
    expect(l.name).toBe('look');
    for (const c of [[0.1, 0.5, 0.9], [0.7, 0.2, 0.4]] as Vec3[]) {
      const a = sampleLut(l, c);
      const e = sampleLut(ref, c);
      for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(e[k], 2);
    }
  });
  it('확장자로 형식을 고르고, 잘못된 파일은 알려 준다', () => {
    expect(parseLutFile(serializeCube(ref), 'a.cube').size).toBe(5);
    expect(parseLutFile(to3dl(10), 'a.3DL').size).toBe(5);
    expect(() => parse3dl('0 256 512 1023\n1 2 3\n', 'x.3dl')).toThrow('64');
    expect(() => parseCube('nope', 'x.cube')).toThrow();
  });
});

describe('효과: 비네트 · 글로우 · 할레이션', () => {
  const W = 120;
  const H = 80;
  const flat: PixelSource = { data: new Uint8ClampedArray(W * H * 4).fill(150), width: W, height: H };
  const withDetail = (d: Partial<Detail>) => ({ ...defaultDevelop(), detail: { ...defaultDevelop().detail, ...d } });
  const run = (src: PixelSource, d: Partial<Detail>) => {
    const dev = withDetail(d);
    const plan = planDevelop(dev, W, H, 1);
    return developReference(src, plan, plan.needsBase ? computeBase(src, dev.geometry, W, H) : null);
  };
  const at = (o: Float32Array, x: number, y: number) => o[(y * W + x) * 3 + 1];

  it('비네트 +는 모서리만 어둡게, −는 모서리만 밝게', () => {
    const base = run(flat, {});
    const dark = run(flat, { vignette: 60 });
    const light = run(flat, { vignette: -60 });
    expect(at(dark, 60, 40)).toBeCloseTo(at(base, 60, 40), 5);
    expect(at(dark, 1, 1)).toBeLessThan(at(base, 1, 1) * 0.7);
    expect(at(light, 1, 1)).toBeGreaterThan(at(base, 1, 1) * 1.2);
  });

  it('글로우는 밝은 점 주변을 밝히고, 할레이션은 붉게 번진다', () => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const lamp = Math.hypot(x - 60, y - 40) < 6;
        data.set(lamp ? [255, 255, 255, 255] : [40, 40, 40, 255], i);
      }
    const src = { data, width: W, height: H };
    const none = run(src, {});
    const glow = run(src, { glow: 80 });
    const hal = run(src, { halation: 80 });
    // 램프(반지름 6) 바로 바깥과 조금 떨어진 곳
    const at2 = (o: Float32Array, x: number, c: number) => o[(40 * W + x) * 3 + c];
    expect(at2(glow, 70, 1)).toBeGreaterThan(at2(none, 70, 1) * 1.3);
    expect(at2(hal, 67, 0) - at2(none, 67, 0)).toBeGreaterThan(0.01);
    expect(at2(hal, 67, 0) - at2(none, 67, 0)).toBeGreaterThan((at2(hal, 67, 2) - at2(none, 67, 2)) * 4);
    // 멀리 떨어진 곳은 그대로
    expect(glow[(5 * W + 5) * 3 + 1]).toBeCloseTo(none[(5 * W + 5) * 3 + 1], 3);
  });
});
