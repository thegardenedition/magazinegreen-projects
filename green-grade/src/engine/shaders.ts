// GLSL ES 3.00. 수식은 color.ts의 gradeLinear와 1:1로 대응한다.

import { MAX_NODES } from './constants';
import { HUE_SHIFT_MAX_DEG, LUT_SIZE, RED_ANGLE } from './curves';
import { MAX_POLY_POINTS, SAT_SCALE } from './mask';

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
uniform mat3 u_hueMatrix[MAX_NODES];
uniform vec4 u_tone[MAX_NODES];     // contrast, pivot, saturation, LUT 강도
uniform ivec4 u_flags[MAX_NODES];   // 색상 커브 사용, LUT 사용, LUT 크기, 마스크 비트
uniform vec3 u_lutMin[MAX_NODES];
uniform vec3 u_lutMax[MAX_NODES];
uniform vec4 u_hueQ[MAX_NODES];     // 중심, 폭, 소프트
uniform vec4 u_satQ[MAX_NODES];     // 낮은 끝, 높은 끝, 소프트
uniform vec4 u_lumQ[MAX_NODES];
uniform vec4 u_winA[MAX_NODES];     // 원·사각: cx, cy, 크기 / 그라디언트: x0, y0, x1, y1
uniform vec4 u_winB[MAX_NODES];     // 회전(라디안), 페더
uniform float u_aspect;             // 이미지 가로/세로
uniform int u_maskNode;             // 마스크를 보여 줄 노드 (-1: 없음)
uniform highp sampler2D u_polys;    // 폴리곤 꼭짓점: 노드 n의 행 n
uniform bool u_dither;
// 커브 표: 노드 i의 행 3i = Y/R/G/B, 3i+1 = Hue 3종, 3i+2 = Lum vs Sat
uniform highp sampler2D u_curves;
${LUT_SAMPLERS}

const int LUT_SIZE = ${LUT_SIZE};
const float RED_ANGLE = ${RED_ANGLE.toFixed(9)};
const float HUE_SHIFT_MAX = ${((HUE_SHIFT_MAX_DEG * Math.PI) / 180).toFixed(9)};
const float TAU = 6.283185307;
const float SAT_SCALE = ${SAT_SCALE.toFixed(6)};

// 마스크 비트 (mask.ts의 maskBits와 같다)
const int M_QUAL = 1;
const int M_QUAL_INV = 2;
const int M_HUE = 4;
const int M_SAT = 8;
const int M_LUM = 16;
const int M_WIN = 32;
const int M_WIN_INV = 64;

// u_maskNode의 마스크 값 (마스크 보기용)
float g_mask = 1.0;

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
  int size = u_flags[n].z;
  vec3 t = clamp((s - u_lutMin[n]) / (u_lutMax[n] - u_lutMin[n]), 0.0, 1.0);
  vec3 f = t * float(size - 1);
  ivec3 i0 = min(ivec3(size - 2), ivec3(floor(f)));
  vec3 fr = f - vec3(i0);
  vec3 c00 = mix(lutFetch(n, i0), lutFetch(n, i0 + ivec3(1, 0, 0)), fr.x);
  vec3 c10 = mix(lutFetch(n, i0 + ivec3(0, 1, 0)), lutFetch(n, i0 + ivec3(1, 1, 0)), fr.x);
  vec3 c01 = mix(lutFetch(n, i0 + ivec3(0, 0, 1)), lutFetch(n, i0 + ivec3(1, 0, 1)), fr.x);
  vec3 c11 = mix(lutFetch(n, i0 + ivec3(0, 1, 1)), lutFetch(n, i0 + ivec3(1, 1, 1)), fr.x);
  vec3 o = mix(mix(c00, c10, fr.y), mix(c01, c11, fr.y), fr.z);
  return mix(lin, srgbToLinear(o), u_tone[n].w);
}

float softStep(float e0, float e1, float x) {
  float t = clamp((x - e0) / max(e1 - e0, 1e-5), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float linearWeight(bool on, vec4 r, float x) {
  if (!on) return 1.0;
  float lo = r.x <= 0.0 ? 1.0 : softStep(r.x - r.z, r.x, x);
  float hi = r.y >= 1.0 ? 1.0 : 1.0 - softStep(r.y, r.y + r.z, x);
  return lo * hi;
}

float qualifierWeight(int n, int bits, vec3 lin) {
  vec3 p = spow(lin, vec3(1.0 / GRADING_GAMMA));
  float l = dot(p, LUMA);
  float cb = (p.b - l) / 1.8556;
  float cr = (p.r - l) / 1.5748;
  float chroma = length(vec2(cb, cr));
  float h = (atan(cr, cb) - RED_ANGLE) / TAU;
  h -= floor(h);
  float w = 1.0;
  if ((bits & M_HUE) != 0) {
    vec4 q = u_hueQ[n];
    float d = abs(fract(h - q.x + 0.5) - 0.5);
    w *= (1.0 - softStep(q.y, q.y + q.z, d)) * softStep(0.0, 0.02, chroma);
  }
  w *= linearWeight((bits & M_SAT) != 0, u_satQ[n], min(1.0, chroma / SAT_SCALE));
  w *= linearWeight((bits & M_LUM) != 0, u_lumQ[n], clamp(l, 0.0, 1.0));
  return (bits & M_QUAL_INV) != 0 ? 1.0 - w : w;
}

float polygonSdf(int n, int count, vec2 p) {
  float d = 1e9;
  float s = 1.0;
  vec2 vj = texelFetch(u_polys, ivec2(count - 1, n), 0).xy * vec2(u_aspect, 1.0);
  for (int i = 0; i < ${MAX_POLY_POINTS}; i++) {
    if (i >= count) break;
    vec2 vi = texelFetch(u_polys, ivec2(i, n), 0).xy * vec2(u_aspect, 1.0);
    vec2 e = vj - vi;
    vec2 w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
    d = min(d, dot(b, b));
    bool c1 = p.y >= vi.y;
    bool c2 = p.y < vj.y;
    bool c3 = e.x * w.y > e.y * w.x;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    vj = vi;
  }
  return s * sqrt(d);
}

float windowWeight(int n, int bits, vec2 uv) {
  int type = (u_flags[n].w >> 8) & 15;
  vec2 p = vec2(uv.x * u_aspect, uv.y);
  vec4 a = u_winA[n];
  float m;
  if (type == 2) {
    vec2 dir = vec2((a.z - a.x) * u_aspect, a.w - a.y);
    float t = dot(p - vec2(a.x * u_aspect, a.y), dir) / max(dot(dir, dir), 1e-9);
    m = 1.0 - softStep(0.0, 1.0, t);
  } else {
    float d;
    if (type == 3) {
      d = polygonSdf(n, (u_flags[n].w >> 12) & 127, p);
    } else {
      float ang = u_winB[n].x;
      vec2 r = p - vec2(a.x * u_aspect, a.y);
      vec2 q = vec2(cos(ang) * r.x + sin(ang) * r.y, -sin(ang) * r.x + cos(ang) * r.y);
      if (type == 0) {
        vec2 rad = max(a.zw, vec2(1e-4));
        d = (length(q / rad) - 1.0) * min(rad.x, rad.y);
      } else {
        vec2 k = abs(q) - a.zw * 0.5;
        d = length(max(k, 0.0)) + min(max(k.x, k.y), 0.0);
      }
    }
    float f = u_winB[n].y;
    m = 1.0 - softStep(-f * 0.5, f * 0.5, d);
  }
  return (bits & M_WIN_INV) != 0 ? 1.0 - m : m;
}

float nodeMask(int n, vec3 lin, vec2 uv) {
  int bits = u_flags[n].w;
  float k = 1.0;
  if ((bits & M_QUAL) != 0) k *= qualifierWeight(n, bits, lin);
  if ((bits & M_WIN) != 0) k *= windowWeight(n, bits, uv);
  return k;
}

vec3 gradeNode(int n, vec3 c) {
  vec4 tone = u_tone[n];
  c = c * u_wb[n] * u_offsetMul[n] * u_gainMul[n];
  vec3 p = spow(c, vec3(1.0 / GRADING_GAMMA));
  p = p + u_lift[n] * (1.0 - p);
  p = spow(p, u_gammaExp[n]);
  p = (p - tone.y) * tone.x + tone.y;
  int row = n * 3;
  p = vec3(lookupCustom(row, 0, p.r), lookupCustom(row, 0, p.g), lookupCustom(row, 0, p.b));
  p = vec3(lookupCustom(row, 1, p.r), lookupCustom(row, 2, p.g), lookupCustom(row, 3, p.b));
  c = spow(p, vec3(GRADING_GAMMA));
  float y = dot(c, LUMA);
  c = y + (c - y) * tone.z;
  c = u_hueMatrix[n] * c;
  if (u_flags[n].x != 0) c = applyHueCurves(n, c);
  if (u_flags[n].y != 0) c = applyLut(n, c);
  return c;
}

/** uv: 이미지 좌표 0–1 (y는 위에서 아래) */
vec3 gradeLinear(vec3 c, vec2 uv) {
  g_mask = 1.0;
  for (int n = 0; n < MAX_NODES; n++) {
    if (n >= u_nodeCount) break;
    vec3 graded = gradeNode(n, c);
    if (u_flags[n].w != 0) {
      float m = nodeMask(n, c, uv);
      if (n == u_maskNode) g_mask = m;
      c = mix(c, graded, m);
    } else {
      c = graded;
    }
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
uniform int u_maskView;      // 0 끔, 1 하이라이트(선택 밖을 흐리게), 2 흑백 마스크
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
  vec3 graded = original ? lin : gradeLinear(lin, uv);
  if (!original && u_maskView == 2) {
    outColor = vec4(vec3(g_mask), 1.0);
    return;
  }
  if (!original && u_maskView == 1) graded = mix(vec3(dot(graded, LUMA) * 0.18), graded, g_mask);
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
  vec2 uv = (vec2(px) + 0.5) / vec2(textureSize(u_image, 0));
  outColor = vec4(encodeOutput(gradeLinear(lin, uv), vec2(px)), 1.0);
}
`;
