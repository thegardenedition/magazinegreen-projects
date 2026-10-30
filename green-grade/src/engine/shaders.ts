// GLSL ES 3.00. 수식은 color.ts의 gradeLinear와 1:1로 대응한다.

import { HUE_SHIFT_MAX_DEG, LUT_SIZE, RED_ANGLE } from './curves';

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const GRADE_CHUNK = /* glsl */ `
precision highp float;
precision highp int;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float GRADING_GAMMA = 2.4;

uniform bool u_enabled;
uniform vec3 u_wb;
uniform vec3 u_offsetMul;
uniform vec3 u_gainMul;
uniform vec3 u_lift;
uniform vec3 u_gammaExp;
uniform float u_contrast;
uniform float u_pivot;
uniform float u_saturation;
uniform mat3 u_hueMatrix;
uniform bool u_dither;
uniform highp sampler2D u_curves;   // 커브 표: 0행 Y/R/G/B, 1행 Hue 3종, 2행 Lum vs Sat
uniform bool u_hueActive;

const int LUT_SIZE = ${LUT_SIZE};
const float RED_ANGLE = ${RED_ANGLE.toFixed(9)};
const float HUE_SHIFT_MAX = ${((HUE_SHIFT_MAX_DEG * Math.PI) / 180).toFixed(9)};
const float TAU = 6.283185307;

vec3 spow(vec3 x, vec3 e) {
  return sign(x) * pow(abs(x), e);
}

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.04045))));
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
}

float lookupCustom(int ch, float p) {
  float q = clamp(p, 0.0, 1.0);
  float f = q * float(LUT_SIZE - 1);
  int i0 = min(LUT_SIZE - 2, int(floor(f)));
  float t = f - float(i0);
  float v = mix(texelFetch(u_curves, ivec2(i0, 0), 0)[ch], texelFetch(u_curves, ivec2(i0 + 1, 0), 0)[ch], t);
  return v + (p - q);
}

float lookupHue(int ch, float h) {
  float f = (h - floor(h)) * float(LUT_SIZE);
  int i0 = int(floor(f)) % LUT_SIZE;
  int i1 = (i0 + 1) % LUT_SIZE;
  float t = f - floor(f);
  return mix(texelFetch(u_curves, ivec2(i0, 1), 0)[ch], texelFetch(u_curves, ivec2(i1, 1), 0)[ch], t);
}

float lookupLumSat(float y) {
  float q = clamp(y, 0.0, 1.0);
  float f = q * float(LUT_SIZE - 1);
  int i0 = min(LUT_SIZE - 2, int(floor(f)));
  float t = f - float(i0);
  return mix(texelFetch(u_curves, ivec2(i0, 2), 0).r, texelFetch(u_curves, ivec2(i0 + 1, 2), 0).r, t);
}

vec3 applyHueCurves(vec3 lin) {
  vec3 p = spow(lin, vec3(1.0 / GRADING_GAMMA));
  float y = dot(p, LUMA);
  float cb = (p.b - y) / 1.8556;
  float cr = (p.r - y) / 1.5748;
  float chroma = length(vec2(cb, cr));
  if (chroma < 1e-6) return lin;
  float a0 = atan(cr, cb);
  float h = (a0 - RED_ANGLE) / TAU;
  h -= floor(h);
  float shift = (lookupHue(0, h) - 0.5) * 2.0 * HUE_SHIFT_MAX;
  float sat = 2.0 * lookupHue(1, h) * 2.0 * lookupLumSat(y);
  float lum = 1.0 + (lookupHue(2, h) - 0.5) * smoothstep(0.0, 0.02, chroma);
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

vec3 gradeLinear(vec3 c) {
  if (!u_enabled) return c;
  c = c * u_wb * u_offsetMul * u_gainMul;
  vec3 p = spow(c, vec3(1.0 / GRADING_GAMMA));
  p = p + u_lift * (1.0 - p);
  p = spow(p, u_gammaExp);
  p = (p - u_pivot) * u_contrast + u_pivot;
  p = vec3(lookupCustom(0, p.r), lookupCustom(0, p.g), lookupCustom(0, p.b));
  p = vec3(lookupCustom(1, p.r), lookupCustom(2, p.g), lookupCustom(3, p.b));
  c = spow(p, vec3(GRADING_GAMMA));
  float y = dot(c, LUMA);
  c = y + (c - y) * u_saturation;
  c = u_hueMatrix * c;
  return u_hueActive ? applyHueCurves(c) : c;
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
