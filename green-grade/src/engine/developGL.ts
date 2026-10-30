// 현상 단계의 GPU 구현. 수식은 develop.ts의 developReference와 1:1로 대응한다.
// 패스: 형태 변환 → 노이즈 감소 → 휘도 블러(가로) → 휘도 블러(세로) → 합성
// 큰 이미지는 타일로 나눠 처리하고, 타일마다 블러·노이즈 반경만큼 가장자리(apron)를 더 계산한다.
// 이웃 픽셀은 항상 '출력 이미지 좌표를 가장자리로 고정한 뒤' 읽으므로 타일 경계에서도 결과가 같다.

import { apronOf, OUTSIDE_EPS, OUTSIDE_ENCODED, NR_COLOR_EDGE, type DevelopBase, type DevelopPlan } from './develop';
import { link } from './glsl';

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float GRADING_GAMMA = 2.4;
uniform ivec2 u_origin;   // 이 텍스처 (0,0) 텍셀의 출력 이미지 좌표
uniform ivec2 u_outSize;  // 출력 이미지 크기
uniform ivec2 u_texSize;  // 이 패스가 읽고 쓰는 텍스처 크기
out vec4 outColor;

vec3 spow(vec3 x, float e) { return sign(x) * pow(abs(x), vec3(e)); }

ivec2 imgOf(ivec2 local) { return clamp(u_origin + local, ivec2(0), u_outSize - 1); }
// 이미지 좌표 img에서 d만큼 떨어진 이웃의 텍셀 좌표 (이미지 가장자리 고정)
ivec2 nb(ivec2 img, ivec2 d) {
  ivec2 q = clamp(img + d, ivec2(0), u_outSize - 1);
  return clamp(q - u_origin, ivec2(0), u_texSize - 1);
}
`;

const WARP_FRAGMENT = /* glsl */ `${HEADER}
uniform sampler2D u_src;  // 8bit sRGB 원본
uniform mat3 u_matrix;    // 출력 0–1 → 원본 0–1
uniform float u_outside;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow(max(c + 0.055, 0.0) / 1.055, vec3(2.4));
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.04045))));
}

vec3 fetchLin(ivec2 p, ivec2 size) {
  return srgbToLinear(texelFetch(u_src, clamp(p, ivec2(0), size - 1), 0).rgb);
}

void main() {
  ivec2 img = imgOf(ivec2(gl_FragCoord.xy));
  vec2 uv = (vec2(img) + 0.5) / vec2(u_outSize);
  vec3 q = u_matrix * vec3(uv, 1.0);
  vec2 s = q.xy / q.z;
  const float E = ${OUTSIDE_EPS.toExponential()};
  if (!(s.x >= -E && s.y >= -E && s.x <= 1.0 + E && s.y <= 1.0 + E)) {
    outColor = vec4(vec3(u_outside), 1.0);
    return;
  }
  ivec2 size = textureSize(u_src, 0);
  vec2 f = s * vec2(size) - 0.5;
  vec2 fl = floor(f);
  vec2 t = f - fl;
  ivec2 i0 = ivec2(fl);
  vec3 a = mix(fetchLin(i0, size), fetchLin(i0 + ivec2(1, 0), size), t.x);
  vec3 b = mix(fetchLin(i0 + ivec2(0, 1), size), fetchLin(i0 + ivec2(1, 1), size), t.x);
  outColor = vec4(spow(mix(a, b, t.y), 1.0 / GRADING_GAMMA), 1.0);
}
`;

const NR_FRAGMENT = /* glsl */ `${HEADER}
uniform sampler2D u_in;   // 그레이딩 인코딩 RGB
uniform vec3 u_nrL;       // 공간 σ, 밝기 σ, 반경
uniform vec3 u_nrC;       // 공간 σ, 섞는 양, 반경
const float EDGE = ${NR_COLOR_EDGE.toFixed(6)};

void main() {
  ivec2 img = imgOf(ivec2(gl_FragCoord.xy));
  vec3 p0 = texelFetch(u_in, nb(img, ivec2(0)), 0).rgb;
  float y0 = dot(p0, LUMA);
  float Y = y0;
  int lR = int(u_nrL.z);
  if (lR > 0) {
    float sw = 0.0, sy = 0.0;
    for (int dy = -lR; dy <= lR; dy++) {
      for (int dx = -lR; dx <= lR; dx++) {
        float yn = dot(texelFetch(u_in, nb(img, ivec2(dx, dy)), 0).rgb, LUMA);
        float w = exp(-float(dx * dx + dy * dy) / (2.0 * u_nrL.x * u_nrL.x) - (yn - y0) * (yn - y0) / (2.0 * u_nrL.y * u_nrL.y));
        sw += w;
        sy += w * yn;
      }
    }
    Y = sy / sw;
  }
  float cb = p0.b - y0;
  float cr = p0.r - y0;
  int cR = int(u_nrC.z);
  if (cR > 0) {
    float sw = 0.0, sb = 0.0, sr = 0.0;
    for (int dy = -cR; dy <= cR; dy++) {
      for (int dx = -cR; dx <= cR; dx++) {
        vec3 pn = texelFetch(u_in, nb(img, ivec2(dx, dy)), 0).rgb;
        float yn = dot(pn, LUMA);
        float w = exp(-float(dx * dx + dy * dy) / (2.0 * u_nrC.x * u_nrC.x) - (yn - y0) * (yn - y0) / (2.0 * EDGE * EDGE));
        sw += w;
        sb += w * (pn.b - yn);
        sr += w * (pn.r - yn);
      }
    }
    cb += (sb / sw - cb) * u_nrC.y;
    cr += (sr / sw - cr) * u_nrC.y;
  }
  float r = Y + cr;
  float b = Y + cb;
  outColor = vec4(r, (Y - LUMA.r * r - LUMA.b * b) / LUMA.g, b, Y);
}
`;

const BLUR_FRAGMENT = /* glsl */ `${HEADER}
uniform sampler2D u_in;
uniform ivec2 u_dir;
uniform int u_pass;       // 0: 가로 (a = 휘도를 읽음), 1: 세로 (r = 샤프닝용, g = 텍스처용)
uniform vec2 u_sigma;     // σ 샤프닝, σ 텍스처
uniform ivec2 u_R;

float src(vec4 t, int ch) { return u_pass == 0 ? t.a : (ch == 0 ? t.r : t.g); }

float blur1(ivec2 img, int ch, float sigma, int R) {
  float sum = 0.0, wsum = 0.0;
  for (int i = -R; i <= R; i++) {
    float w = exp(-float(i * i) / (2.0 * sigma * sigma));
    wsum += w;
    sum += w * src(texelFetch(u_in, nb(img, u_dir * i), 0), ch);
  }
  return sum / wsum;
}

void main() {
  ivec2 img = imgOf(ivec2(gl_FragCoord.xy));
  vec4 c = texelFetch(u_in, nb(img, ivec2(0)), 0);
  float s = u_R.x > 0 ? blur1(img, 0, u_sigma.x, u_R.x) : src(c, 0);
  float t = u_R.y > 0 ? blur1(img, 1, u_sigma.y, u_R.y) : src(c, 1);
  outColor = vec4(s, t, 0.0, 1.0);
}
`;

const COMBINE_FRAGMENT = /* glsl */ `${HEADER}
uniform sampler2D u_nr;    // rgb = 노이즈 감소 결과(인코딩), a = 휘도
uniform sampler2D u_blur;  // r = 샤프닝 블러, g = 텍스처 블러
uniform sampler2D u_base;  // r = 흐린 휘도, g = 안개
uniform bool u_hasBase;
uniform vec4 u_sharp;      // 양, 마스킹, 반경 > 0
uniform vec3 u_tex;        // 양, 반경 > 0, -
uniform vec2 u_cd;         // 선명도, 디헤이즈
uniform vec3 u_air;

vec2 sampleBase(vec2 uv) {
  ivec2 size = textureSize(u_base, 0);
  vec2 f = uv * vec2(size) - 0.5;
  vec2 fl = floor(f);
  vec2 t = f - fl;
  ivec2 i0 = ivec2(fl);
  ivec2 hi = size - 1;
  vec2 a = mix(texelFetch(u_base, clamp(i0, ivec2(0), hi), 0).rg, texelFetch(u_base, clamp(i0 + ivec2(1, 0), ivec2(0), hi), 0).rg, t.x);
  vec2 b = mix(texelFetch(u_base, clamp(i0 + ivec2(0, 1), ivec2(0), hi), 0).rg, texelFetch(u_base, clamp(i0 + ivec2(1, 1), ivec2(0), hi), 0).rg, t.x);
  return mix(a, b, t.y);
}

void main() {
  ivec2 img = imgOf(ivec2(gl_FragCoord.xy));
  ivec2 tc = nb(img, ivec2(0));
  vec4 q = texelFetch(u_nr, tc, 0);
  vec2 bl = texelFetch(u_blur, tc, 0).rg;
  float Y = q.a;
  float det = 0.0;
  if (u_sharp.x > 0.0 && u_sharp.z > 0.0) {
    float d = Y - bl.x;
    float m = 1.0;
    if (u_sharp.y > 0.0) {
      float t = clamp(abs(d) / max(0.05 * u_sharp.y, 1e-5), 0.0, 1.0);
      m = t * t * (3.0 - 2.0 * t);
    }
    det += u_sharp.x * d * m;
  }
  if (u_tex.x != 0.0 && u_tex.y > 0.0) {
    float d = Y - bl.y;
    det += u_tex.x * 0.8 * (d / (1.0 + 6.0 * abs(d)));
  }
  float hz = 0.0;
  if (u_hasBase) {
    vec2 uv = (vec2(img) + 0.5) / vec2(u_outSize);
    vec2 bs = sampleBase(uv);
    hz = bs.y;
    if (u_cd.x != 0.0) {
      float d = Y - bs.x;
      float mid = clamp(4.0 * Y * (1.0 - Y), 0.0, 1.0);
      det += u_cd.x * 0.9 * (d / (1.0 + 3.0 * abs(d))) * mid;
    }
  }
  vec3 v = q.rgb + det;
  if (u_hasBase && u_cd.y > 0.0) {
    float t = max(0.15, 1.0 - 0.85 * u_cd.y * hz);
    v = (v - u_air) / t + u_air;
  } else if (u_hasBase && u_cd.y < 0.0) {
    v += (u_air - v) * (-u_cd.y * 0.45);
  }
  outColor = vec4(spow(v, GRADING_GAMMA), 1.0);
}
`;

/** 타일 결과를 큰 텍스처의 제자리에 옮긴다 (미리보기용) */
const COPY_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_in;
uniform ivec2 u_offset;   // 대상 픽셀 - 이 값 = 원본 텍셀
out vec4 outColor;
void main() { outColor = texelFetch(u_in, ivec2(gl_FragCoord.xy) - u_offset, 0); }
`;

/** 현상 타일의 가장 큰 변 (가장자리 제외) */
export const DEV_TILE = 1024;

export interface DevelopTile {
  tex: WebGLTexture;
  /** 텍스처 (0,0)의 출력 이미지 좌표 */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

type Role = 'warp' | 'nr' | 'blurH' | 'blurV' | 'out';

export class Developer {
  private warp: WebGLProgram;
  private nr: WebGLProgram;
  private blur: WebGLProgram;
  private combine: WebGLProgram;
  private copy: WebGLProgram;
  private fbo: WebGLFramebuffer;
  private pool = new Map<Role, { tex: WebGLTexture; w: number; h: number }>();
  private baseTex: WebGLTexture;
  private baseData: DevelopBase | null = null;

  constructor(
    private gl: WebGL2RenderingContext,
    private vao: WebGLVertexArrayObject,
  ) {
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('이 브라우저는 실수 렌더 타깃(EXT_color_buffer_float)을 지원하지 않아 형태·디테일 보정을 쓸 수 없습니다.');
    }
    this.warp = link(gl, WARP_FRAGMENT);
    this.nr = link(gl, NR_FRAGMENT);
    this.blur = link(gl, BLUR_FRAGMENT);
    this.combine = link(gl, COMBINE_FRAGMENT);
    this.copy = link(gl, COPY_FRAGMENT);
    this.fbo = gl.createFramebuffer()!;
    this.baseTex = this.floatTexture(1, 1);
  }

  private floatTexture(w: number, h: number, format: number = this.gl.RGBA32F, levels = 1) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, levels, format, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private texture(role: Role, w: number, h: number) {
    const cur = this.pool.get(role);
    if (cur && cur.w === w && cur.h === h) return cur.tex;
    if (cur) this.gl.deleteTexture(cur.tex);
    const tex = this.floatTexture(w, h);
    this.pool.set(role, { tex, w, h });
    return tex;
  }

  private setBase(base: DevelopBase | null) {
    if (!base || base === this.baseData) return;
    const gl = this.gl;
    gl.deleteTexture(this.baseTex);
    this.baseTex = this.floatTexture(base.width, base.height);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, base.width, base.height, gl.RGBA, gl.FLOAT, base.data);
    this.baseData = base;
  }

  private draw(prog: WebGLProgram, target: WebGLTexture, w: number, h: number, inputs: Array<[string, WebGLTexture]>, set: (loc: (n: string) => WebGLUniformLocation | null) => void, origin: [number, number], outSize: [number, number]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    const loc = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform2i(loc('u_origin'), origin[0], origin[1]);
    gl.uniform2i(loc('u_outSize'), outSize[0], outSize[1]);
    gl.uniform2i(loc('u_texSize'), w, h);
    inputs.forEach(([name, tex], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc(name), i);
    });
    set(loc);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * 출력 이미지의 (x0, y0, w, h) 영역을 현상한다. 결과 텍스처는 RGBA32F 선형 RGB이고,
   * (0,0)이 출력 좌표 (x0 − apron, y0 − apron)이다. 다음 run 호출 전까지만 유효하다.
   */
  run(src: WebGLTexture, plan: DevelopPlan, base: DevelopBase | null, x0: number, y0: number, w: number, h: number): DevelopTile {
    const gl = this.gl;
    const du = plan.du;
    const whole = x0 === 0 && y0 === 0 && w === plan.outW && h === plan.outH;
    const a = whole ? 0 : apronOf(du);
    const ox = x0 - a;
    const oy = y0 - a;
    const tw = w + 2 * a;
    const th = h + 2 * a;
    const origin: [number, number] = [ox, oy];
    const outSize: [number, number] = [plan.outW, plan.outH];
    const useBase = plan.needsBase && !!base;
    if (useBase) this.setBase(base);

    const tWarp = this.texture('warp', tw, th);
    this.draw(this.warp, tWarp, tw, th, [['u_src', src]], (loc) => {
      const m = plan.matrix;
      // GLSL mat3은 열 우선
      gl.uniformMatrix3fv(loc('u_matrix'), false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
      gl.uniform1f(loc('u_outside'), OUTSIDE_ENCODED);
    }, origin, outSize);

    const tNr = this.texture('nr', tw, th);
    this.draw(this.nr, tNr, tw, th, [['u_in', tWarp]], (loc) => {
      gl.uniform3fv(loc('u_nrL'), du.nrLuma);
      gl.uniform3fv(loc('u_nrC'), du.nrColor);
    }, origin, outSize);

    const sR = du.sharpen[3];
    const tR = du.texture[2];
    const tBlurH = this.texture('blurH', tw, th);
    const tBlurV = this.texture('blurV', tw, th);
    const blurPass = (input: WebGLTexture, target: WebGLTexture, pass: 0 | 1) =>
      this.draw(this.blur, target, tw, th, [['u_in', input]], (loc) => {
        gl.uniform2i(loc('u_dir'), pass === 0 ? 1 : 0, pass === 0 ? 0 : 1);
        gl.uniform1i(loc('u_pass'), pass);
        gl.uniform2f(loc('u_sigma'), du.sharpen[2], du.texture[1]);
        gl.uniform2i(loc('u_R'), sR, tR);
      }, origin, outSize);
    blurPass(tNr, tBlurH, 0);
    blurPass(tBlurH, tBlurV, 1);

    const tOut = this.texture('out', tw, th);
    this.draw(this.combine, tOut, tw, th, [['u_nr', tNr], ['u_blur', tBlurV], ['u_base', this.baseTex]], (loc) => {
      gl.uniform1i(loc('u_hasBase'), useBase ? 1 : 0);
      gl.uniform4f(loc('u_sharp'), du.sharpen[0], du.sharpen[1], sR > 0 ? 1 : 0, 0);
      gl.uniform3f(loc('u_tex'), du.texture[0], tR > 0 ? 1 : 0, 0);
      gl.uniform2f(loc('u_cd'), du.clarity, du.dehaze);
      gl.uniform3fv(loc('u_air'), base?.airlight ?? [1, 1, 1]);
    }, origin, outSize);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    return { tex: tOut, originX: ox, originY: oy, width: tw, height: th };
  }

  /** 출력 전체를 현상해 밉맵이 있는 반정밀도 텍스처로 만든다 (뷰어 미리보기) */
  developPreview(src: WebGLTexture, plan: DevelopPlan, base: DevelopBase | null): WebGLTexture {
    const gl = this.gl;
    const levels = Math.floor(Math.log2(Math.max(plan.outW, plan.outH))) + 1;
    const target = this.floatTexture(plan.outW, plan.outH, gl.RGBA16F, levels);
    for (let y0 = 0; y0 < plan.outH; y0 += DEV_TILE) {
      for (let x0 = 0; x0 < plan.outW; x0 += DEV_TILE) {
        const w = Math.min(DEV_TILE, plan.outW - x0);
        const h = Math.min(DEV_TILE, plan.outH - y0);
        const tile = this.run(src, plan, base, x0, y0, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
        gl.viewport(x0, y0, w, h);
        gl.useProgram(this.copy);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tile.tex);
        gl.uniform1i(gl.getUniformLocation(this.copy, 'u_in'), 0);
        gl.uniform2i(gl.getUniformLocation(this.copy, 'u_offset'), tile.originX, tile.originY);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return target;
  }

  /** 미리보기가 끝나면 큰 중간 텍스처를 돌려준다 */
  releasePool() {
    for (const { tex } of this.pool.values()) this.gl.deleteTexture(tex);
    this.pool.clear();
  }
}
