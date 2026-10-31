// .cube 3D LUT 읽기와 CPU 기준 적용. 셰이더의 applyLut과 1:1로 대응한다.

import type { Vec3 } from './constants';

export interface CubeLut {
  name: string;
  size: number;
  /** size³ × RGBA. 인덱스 = ((b·n + g)·n + r)·4 — .cube 파일 순서(R이 가장 빠름) 그대로 */
  data: Float32Array;
  domainMin: Vec3;
  domainMax: Vec3;
}

/** 노드에 붙은 LUT와 적용 강도 */
export interface LutUniform {
  lut: CubeLut;
  intensity: number;
}

export const LUT_MAX_SIZE = 65;
/** 1D LUT는 이 크기의 3D LUT로 바꿔 쓴다 */
export const LUT_1D_AS_3D = 65;

export function parseCube(text: string, name = 'LUT'): CubeLut {
  let size = 0;
  let size1d = 0;
  let title = '';
  let domainMin: Vec3 = [0, 0, 0];
  let domainMax: Vec3 = [1, 1, 1];
  const values: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].replace(/#.*/, '').trim();
    if (!line) continue;
    const head = line.split(/\s+/)[0].toUpperCase();
    const rest = line.slice(head.length).trim();
    if (head === 'TITLE') title = rest.replace(/^"|"$/g, '');
    else if (head === 'LUT_3D_SIZE') size = parseInt(rest, 10);
    else if (head === 'LUT_1D_SIZE') size1d = parseInt(rest, 10);
    else if (head === 'DOMAIN_MIN') domainMin = parseTriple(rest, ln);
    else if (head === 'DOMAIN_MAX') domainMax = parseTriple(rest, ln);
    else if (head === 'LUT_3D_INPUT_RANGE' || head === 'LUT_1D_INPUT_RANGE') {
      const [a, b] = rest.split(/\s+/).map(Number);
      domainMin = [a, a, a];
      domainMax = [b, b, b];
    } else if (/^[-+.\d]/.test(head)) values.push(...parseTriple(line, ln));
    // 그 밖의 키워드(LUT_IN_VIDEO_RANGE 등)는 무시
  }
  if (size1d && !size) return oneDimensional(values, size1d, domainMin, domainMax, title || name.replace(/\.cube$/i, ''));
  if (!size) throw new Error('LUT_3D_SIZE가 없습니다.');
  if (size < 2 || size > LUT_MAX_SIZE) throw new Error(`LUT 크기 ${size}는 지원 범위(2–${LUT_MAX_SIZE}) 밖입니다.`);
  const n3 = size * size * size;
  if (values.length !== n3 * 3) {
    throw new Error(`LUT 데이터가 ${n3}개여야 하는데 ${values.length / 3}개입니다.`);
  }
  for (let k = 0; k < 3; k++) {
    if (!(domainMax[k] > domainMin[k])) throw new Error('DOMAIN_MAX는 DOMAIN_MIN보다 커야 합니다.');
  }
  const data = new Float32Array(n3 * 4);
  for (let i = 0; i < n3; i++) {
    data[i * 4] = values[i * 3];
    data[i * 4 + 1] = values[i * 3 + 1];
    data[i * 4 + 2] = values[i * 3 + 2];
    data[i * 4 + 3] = 1;
  }
  return { name: title || name.replace(/\.cube$/i, ''), size, data, domainMin, domainMax };
}

/** 1D LUT(채널마다 따로인 곡선)를 65³ 3D LUT로 바꾼다. 격자점에서는 1D 곡선을 선형 보간한 값 그대로다. */
function oneDimensional(values: number[], n: number, domainMin: Vec3, domainMax: Vec3, name: string): CubeLut {
  if (n < 2 || n > 65536) throw new Error(`1D LUT 크기 ${n}는 지원 범위(2–65536) 밖입니다.`);
  if (values.length !== n * 3) throw new Error(`1D LUT 데이터가 ${n}개여야 하는데 ${values.length / 3}개입니다.`);
  const curve = (x: number, c: number) => {
    const t = Math.min(1, Math.max(0, (x - domainMin[c]) / (domainMax[c] - domainMin[c]))) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t));
    return values[i * 3 + c] + (values[(i + 1) * 3 + c] - values[i * 3 + c]) * (t - i);
  };
  const N = LUT_1D_AS_3D;
  // 3D 격자는 1D의 입력 범위를 덮는다
  const at = (k: number, c: number) => domainMin[c] + ((domainMax[c] - domainMin[c]) * k) / (N - 1);
  const data = new Float32Array(N ** 3 * 4);
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const i = ((b * N + g) * N + r) * 4;
        data[i] = curve(at(r, 0), 0);
        data[i + 1] = curve(at(g, 1), 1);
        data[i + 2] = curve(at(b, 2), 2);
        data[i + 3] = 1;
      }
  return { name, size: N, data, domainMin, domainMax };
}

/** 1D .cube 쓰기 (같은 곡선을 세 채널에) */
export function serializeCube1D(name: string, n: number, f: (x: number) => number): string {
  const lines = [`TITLE "${name}"`, `LUT_1D_SIZE ${n}`];
  for (let i = 0; i < n; i++) {
    const v = fmt(f(i / (n - 1)));
    lines.push(`${v} ${v} ${v}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Autodesk/Lustre .3dl 읽기.
 * - 첫 줄(선택)은 입력 격자 위치 목록(예: 0 64 128 … 1023). 개수가 격자 크기다.
 * - 'Mesh 4 12' 같은 줄의 두 번째 숫자는 출력 비트 수.
 * - 나머지는 정수 R G B. 파랑이 가장 빨리 바뀌는 순서다(.cube와 반대).
 */
export function parse3dl(text: string, name = 'LUT'): CubeLut {
  const rows: number[][] = [];
  let shaper: number[] | null = null;
  let outBits = 0;
  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].replace(/#.*/, '').trim();
    if (!line) continue;
    if (/^mesh/i.test(line)) {
      const parts = line.split(/\s+/).map(Number);
      if (Number.isFinite(parts[2])) outBits = parts[2];
      continue;
    }
    if (/^[a-z]/i.test(line)) continue; // 3DMESH, LUT8 등 키워드
    const v = line.split(/\s+/).map(Number);
    if (v.some((x) => !Number.isFinite(x))) throw new Error(`${ln + 1}번째 줄을 읽을 수 없습니다: "${line}"`);
    if (v.length > 3 && !shaper && !rows.length) shaper = v;
    else if (v.length >= 3) rows.push(v.slice(0, 3));
    else throw new Error(`${ln + 1}번째 줄을 읽을 수 없습니다: "${line}"`);
  }
  const n = shaper ? shaper.length : Math.round(Math.cbrt(rows.length));
  if (n < 2 || n > LUT_MAX_SIZE) throw new Error(`.3dl 격자 크기 ${n}는 지원 범위(2–${LUT_MAX_SIZE}) 밖입니다.`);
  if (rows.length !== n ** 3) throw new Error(`.3dl 데이터가 ${n ** 3}개여야 하는데 ${rows.length}개입니다.`);
  const maxV = Math.max(...rows.map((r) => Math.max(r[0], r[1], r[2])));
  const scale = outBits ? 2 ** outBits - 1 : maxV <= 1.0001 ? 1 : maxV <= 1023 ? 1023 : maxV <= 4095 ? 4095 : 65535;
  const data = new Float32Array(n ** 3 * 4);
  rows.forEach((v, k) => {
    // .3dl 순서(k): R이 가장 느리고 B가 가장 빠르다 → .cube 순서(R이 가장 빠름)로 옮긴다
    const r = Math.floor(k / (n * n));
    const g = Math.floor(k / n) % n;
    const b = k % n;
    const i = ((b * n + g) * n + r) * 4;
    data[i] = v[0] / scale;
    data[i + 1] = v[1] / scale;
    data[i + 2] = v[2] / scale;
    data[i + 3] = 1;
  });
  return { name: name.replace(/\.3dl$/i, ''), size: n, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
}

/** 파일 이름의 확장자로 .cube / .3dl을 골라 읽는다 */
export function parseLutFile(text: string, fileName: string): CubeLut {
  if (/\.3dl$/i.test(fileName)) return parse3dl(text, fileName);
  return parseCube(text, fileName);
}

/** 불러올 수 있는 LUT 파일인지 (확장자) */
export const isLutFile = (name: string) => /\.(cube|3dl)$/i.test(name);

function parseTriple(s: string, ln: number): Vec3 {
  const v = s.split(/\s+/).map(Number);
  if (v.length < 3 || v.slice(0, 3).some((x) => !Number.isFinite(x))) {
    throw new Error(`${ln + 1}번째 줄을 읽을 수 없습니다: "${s}"`);
  }
  return [v[0], v[1], v[2]];
}

/** 항등 LUT (테스트·기본값용) */
export function identityLut(size: number, name = 'Identity'): CubeLut {
  return buildLut(size, name, (r, g, b) => [r, g, b]);
}

/** 함수로 LUT 만들기. 입력·출력은 sRGB 코드값(0–1). */
export function buildLut(size: number, name: string, f: (r: number, g: number, b: number) => Vec3): CubeLut {
  const data = new Float32Array(size ** 3 * 4);
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const o = f(r / (size - 1), g / (size - 1), b / (size - 1));
        const i = ((b * size + g) * size + r) * 4;
        data[i] = o[0];
        data[i + 1] = o[1];
        data[i + 2] = o[2];
        data[i + 3] = 1;
      }
  return { name, size, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
}

export function serializeCube(lut: CubeLut): string {
  const lines = [`TITLE "${lut.name}"`, `LUT_3D_SIZE ${lut.size}`];
  if (lut.domainMin.some((v) => v !== 0)) lines.push(`DOMAIN_MIN ${lut.domainMin.join(' ')}`);
  if (lut.domainMax.some((v) => v !== 1)) lines.push(`DOMAIN_MAX ${lut.domainMax.join(' ')}`);
  for (let i = 0; i < lut.data.length; i += 4) {
    lines.push(`${fmt(lut.data[i])} ${fmt(lut.data[i + 1])} ${fmt(lut.data[i + 2])}`);
  }
  return lines.join('\n') + '\n';
}

const fmt = (v: number) => v.toFixed(6);

/** sRGB 코드값(0–1) 하나를 LUT로 변환 — 셀 안에서 3선형 보간 */
export function sampleLut(lut: CubeLut, s: Vec3): Vec3 {
  const n = lut.size;
  const idx: number[] = [];
  const frac: number[] = [];
  for (let k = 0; k < 3; k++) {
    const t = Math.min(1, Math.max(0, (s[k] - lut.domainMin[k]) / (lut.domainMax[k] - lut.domainMin[k])));
    const f = t * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(f));
    idx.push(i0);
    frac.push(f - i0);
  }
  const at = (r: number, g: number, b: number, c: number) => lut.data[((b * n + g) * n + r) * 4 + c];
  const out: Vec3 = [0, 0, 0];
  const [r0, g0, b0] = idx;
  const [fr, fg, fb] = frac;
  for (let c = 0; c < 3; c++) {
    const c00 = at(r0, g0, b0, c) * (1 - fr) + at(r0 + 1, g0, b0, c) * fr;
    const c10 = at(r0, g0 + 1, b0, c) * (1 - fr) + at(r0 + 1, g0 + 1, b0, c) * fr;
    const c01 = at(r0, g0, b0 + 1, c) * (1 - fr) + at(r0 + 1, g0, b0 + 1, c) * fr;
    const c11 = at(r0, g0 + 1, b0 + 1, c) * (1 - fr) + at(r0 + 1, g0 + 1, b0 + 1, c) * fr;
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    out[c] = c0 * (1 - fb) + c1 * fb;
  }
  return out;
}
