// GLSL ES 3.00. 수식은 color.ts의 gradeLinear와 1:1로 대응한다.

import { MAX_NODES } from './constants';
import { HUE_SHIFT_MAX_DEG, LUT_SIZE, RED_ANGLE } from './curves';

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** 노드별 3D LUT 샘플러. GLSL ES 3.00은 샘플러 배열을 변수로 인덱싱할 수 없어 따로 둔다. */
const LUT_SAMPLERS = Array.from({ length: MAX_NODES }, (_, i) => `uniform highp sampler3D u_lut${i};`).join('\n');
const LUT_FETCH = Array.from(
  { length: MAX_NODES },
  (_, i) => `  if (slot == ${i}) return texelFetch(u_lut${i}, p, 0).rgb;`,
).join('\n');

export const GRADE_CHUNK = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler3D;

#define MAX_NODES ${MAX_NODES}
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float GRADING_GAMMA = 2.4;

// 노드별 값 (켜진 노드만 앞에서부터 채운다)
uniform int u_nodeCount;
uniform vec3 u_wb[MAX_NODES];
uniform vec3 u_offsetMul[MAX_NODES];
uniform vec3 u_gainMul[MAX_NODES];
uniform vec3 u_lift[MAX_NODES];
uniform vec3 u_gammaExp[MAX_NODES];
uniform float u_contrast[MAX_NODES];
uniform float u_pivot[MAX_NODES];
uniform float u_saturation[MAX_NODES];
uniform mat3 u_hueMatrix[MAX_NODES];
uniform bool u_hueActive[MAX_NODES];
uniform bool u_hasLut[MAX_NODES];
uniform float u_lutIntensity[MAX_NODES];
uniform int u_lutSize[MAX_NODES];
uniform vec3 u_lutMin[MAX_NODES];
uniform vec3 u_lutMax[MAX_NODES];
uniform bool u_dither;
// 커브 표: 노드 i의 행 3i = Y/R/G/B, 3i+1 = Hue 3종, 3i+2 = Lum vs Sat
uniform highp sampler2D u_curves;
${LUT_SAMPLERS}

const int LUT_SIZE = ${LUT_SIZE};
const float RED_ANGLE = ${RED_ANGLE.toFixed(9)};
const float HUE_SHIFT_MAX = ${((HUE_SHIFT_MAX_DEG * Math.PI) / 180).toFixed(9)};
const float TAU = 6.283185307;

vec3 spow(vec3 x, vec3 e) {
  return sign(x) * pow(abs(x), e);
}

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow(max(c + 0.055, 0.0) / 1.055, vec3(2.4));
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.04045))));
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
}

float lookupCustom(int row, int ch, float p) {
  float q = clamp(p, 0.0, 1.0);
  float f = q * float(LUT_SIZE - 1);
  int i0 = min(LUT_SIZE - 2, int(floor(f)));
  float t = f - float(i0);
  float v = mix(texelFetch(u_curves, ivec2(i0, row), 0)[ch], texelFetch(u_curves, ivec2(i0 + 1, row), 0)[ch], t);
  return v + (p - q);
}

float lookupHue(int row, int ch, float h) {
  float f = (h - floor(h)) * float(LUT_SIZE);
  int i0 = int(floor(f)) % LUT_SIZE;
  int i1 = (i0 + 1) % LUT_SIZE;
  float t = f - floor(f);
  return mix(texelFetch(u_curves, ivec2(i0, row), 0)[ch], texelFetch(u_curves, ivec2(i1, row), 0)[ch], t);
}

float lookupLumSat(int row, float y) {
  float q = clamp(y, 0.0, 1.0);
  float f = q * float(LUT_SIZE - 1);
  int i0 = min(LUT_SIZE - 2, int(floor(f)));
  float t = f - float(i0);
  return mix(texelFetch(u_curves, ivec2(i0, row), 0).r, texelFetch(u_curves, ivec2(i0 + 1, row), 0).r, t);
}

vec3 applyHueCurves(int n, vec3 lin) {
  vec3 p = spow(lin, vec3(1.0 / GRADING_GAMMA));
  float y = dot(p, LUMA);
  float cb = (p.b - y) / 1.8556;
  float cr = (p.r - y) / 1.5748;
  float chroma = length(vec2(cb, cr));
  if (chroma < 1e-6) return lin;
  float a0 = atan(cr, cb);
  float h = (a0 - RED_ANGLE) / TAU;
  h -= floor(h);
  int row = n * 3 + 1;
  float shift = (lookupHue(row, 0, h) - 0.5) * 2.0 * HUE_SHIFT_MAX;
  float sat = 2.0 * lookupHue(row, 1, h) * 2.0 * lookupLumSat(row + 1, y);
  float lum = 1.0 + (lookupHue(row, 2, h) - 0.5) * smoothstep(0.0, 0.02, chroma);
  float a = a0 + shift;
  float c2 = chroma * sat;
  y *= lum;
  cb = c2 * cos(a);
  cr = c2 * sin(a);
  float r = y + 1.5748 * cr;
  float b = y + 1.8556 * cb;
  float g = (y - LUMA.r * r - LUMA.b * b) / LUMA.g;
  return spow(vec3(r, g, b), vec3(GRADING_GAMMA));
}

vec3 lutFetch(int slot, ivec3 p) {
${LUT_FETCH}
  return vec3(0.0);
}

// 셀 안 3선형 보간을 직접 계산 (하드웨어 필터링보다 정밀하고 CPU 기준과 같다)
vec3 applyLut(int n, vec3 lin) {
  vec3 s = linearToSrgb(clamp(lin, 0.0, 1.0));
  int size = u_lutSize[n];
  vec3 t = clamp((s - u_lutMin[n]) / (u_lutMax[n] - u_lutMin[n]), 0.0, 1.0);
  vec3 f = t * float(size - 1);
  ivec3 i0 = min(ivec3(size - 2), ivec3(floor(f)));
  vec3 fr = f - vec3(i0);
  vec3 c00 = mix(lutFetch(n, i0), lutFetch(n, i0 + ivec3(1, 0, 0)), fr.x);
  vec3 c10 = mix(lutFetch(n, i0 + ivec3(0, 1, 0)), lutFetch(n, i0 + ivec3(1, 1, 0)), fr.x);
  vec3 c01 = mix(lutFetch(n, i0 + ivec3(0, 0, 1)), lutFetch(n, i0 + ivec3(1, 0, 1)), fr.x);
  vec3 c11 = mix(lutFetch(n, i0 + ivec3(0, 1, 1)), lutFetch(n, i0 + ivec3(1, 1, 1)), fr.x);
  vec3 o = mix(mix(c00, c10, fr.y), mix(c01, c11, fr.y), fr.z);
  return mix(lin, srgbToLinear(o), u_lutIntensity[n]);
}

vec3 gradeNode(int n, vec3 c) {
  c = c * u_wb[n] * u_offsetMul[n] * u_gainMul[n];
  vec3 p = spow(c, vec3(1.0 / GRADING_GAMMA));
  p = p + u_lift[n] * (1.0 - p);
  p = spow(p, u_gammaExp[n]);
  p = (p - u_pivot[n]) * u_contrast[n] + u_pivot[n];
  int row = n * 3;
  p = vec3(lookupCustom(row, 0, p.r), lookupCustom(row, 0, p.g), lookupCustom(row, 0, p.b));
  p = vec3(lookupCustom(row, 1, p.r), lookupCustom(row, 2, p.g), lookupCustom(row, 3, p.b));
  c = spow(p, vec3(GRADING_GAMMA));
  float y = dot(c, LUMA);
  c = y + (c - y) * u_saturation[n];
  c = u_hueMatrix[n] * c;
  if (u_hueActive[n]) c = applyHueCurves(n, c);
  if (u_hasLut[n]) c = applyLut(n, c);
  return c;
}

vec3 gradeLinear(vec3 c) {
  for (int n = 0; n < MAX_NODES; n++) {
    if (n >= u_nodeCount) break;
    c = gradeNode(n, c);
  }
  return c;
}

// 픽셀 좌표로 정해지는 해시. 같은 좌표는 항상 같은 값 → 결과가 결정적이다.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 8bit 양자화 직전, 1 LSB 진폭의 삼각 분포 디더 → 그라디언트 밴딩 방지
vec3 encodeOutput(vec3 lin, vec2 pixel) {
  vec3 s = linearToSrgb(clamp(lin, 0.0, 1.0));
  if (u_dither) {
    float n = hash12(pixel) + hash12(pixel + 71.37) - 1.0;
    s += n / 255.0;
  }
  return clamp(s, 0.0, 1.0);
}
`;

/** 화면 뷰어: 확대/이동, Before/After 분할, 원본 보기 */
export const VIEWER_FRAGMENT = /* glsl */ `#version 300 es
${GRADE_CHUNK}
uniform sampler2D u_image;
uniform vec2 u_canvasSize;   // 캔버스 픽셀
uniform vec2 u_imageSize;    // 원본 해상도 기준 픽셀
uniform float u_scale;       // 캔버스 픽셀 / 원본 픽셀
uniform vec2 u_offset;       // 이미지 좌상단의 캔버스 좌표
uniform float u_split;       // 이 x좌표 왼쪽은 원본 (음수면 분할 없음)
uniform bool u_bypass;
uniform vec3 u_background;
out vec4 outColor;

void main() {
  vec2 pos = vec2(gl_FragCoord.x, u_canvasSize.y - gl_FragCoord.y);
  vec2 uv = (pos - u_offset) / u_scale / u_imageSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    outColor = vec4(u_background, 1.0);
    return;
  }
  vec3 lin = srgbToLinear(texture(u_image, uv).rgb);
  bool original = u_bypass || pos.x < u_split;
  vec3 graded = original ? lin : gradeLinear(lin);
  outColor = vec4(encodeOutput(graded, floor(pos)), 1.0);
}
`;

/** 내보내기: 원본 해상도를 타일 단위로 렌더. 필터링 없이 픽셀을 그대로 읽는다. */
export const EXPORT_FRAGMENT = /* glsl */ `#version 300 es
${GRADE_CHUNK}
uniform sampler2D u_image;
uniform ivec2 u_tileOrigin;  // 타일 좌상단의 이미지 좌표
uniform int u_tileHeight;
out vec4 outColor;

void main() {
  // 프레임버퍼는 아래쪽이 0행이므로 위아래를 뒤집어 이미지 좌표를 구한다
  ivec2 local = ivec2(gl_FragCoord.xy);
  ivec2 px = ivec2(u_tileOrigin.x + local.x, u_tileOrigin.y + (u_tileHeight - 1 - local.y));
  vec3 lin = srgbToLinear(texelFetch(u_image, px, 0).rgb);
  outColor = vec4(encodeOutput(gradeLinear(lin), vec2(px)), 1.0);
}
`;
