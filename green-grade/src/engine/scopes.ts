// 스코프. 뷰어와 별개의 WebGL2 컨텍스트에서
//  1) 프록시를 분석 해상도(가로 512px)로 보정 렌더
//  2) 분석 픽셀 하나를 점 하나로 뿌려(scatter) 가산 합성 → Waveform / Parade / Vectorscope
//  3) 누적 결과를 로그 톤으로 화면에 표시
// Histogram과 클리핑 비율은 분석 픽셀을 읽어 정확한 개수로 센다.

import type { GradeUniforms } from './color';
import { GLBase, link } from './renderer';
import { GRADE_CHUNK } from './shaders';

export type ScopeMode = 'waveform' | 'parade' | 'vectorscope' | 'histogram';

export const ANALYSIS_WIDTH = 512;
const HIST_UNIT = 12;

const ANALYSIS_FRAGMENT = /* glsl */ `#version 300 es
${GRADE_CHUNK}
uniform sampler2D u_image;
uniform vec2 u_size;
out vec4 outColor;
void main() {
  // 0행이 이미지 맨 위가 되도록 (Waveform 가로축은 이미지 가로와 같아야 함)
  vec2 uv = vec2(gl_FragCoord.x / u_size.x, 1.0 - gl_FragCoord.y / u_size.y);
  vec3 lin = srgbToLinear(texture(u_image, uv).rgb);
  outColor = vec4(linearToSrgb(clamp(gradeLinear(lin, uv), 0.0, 1.0)), 1.0);
}
`;

const SCATTER_VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
uniform sampler2D u_analysis;
uniform ivec2 u_analysisSize;
uniform ivec2 u_targetSize;
uniform int u_mode;        // 0 waveform, 1 parade, 2 vectorscope
uniform float u_weight;
out vec3 v_color;

// 0–1 값을 대상 텍스처의 픽셀 중심에 맞춘 클립 좌표로
float toClip(float v, int n) {
  return ((clamp(v, 0.0, 1.0) * float(n - 1) + 0.5) / float(n)) * 2.0 - 1.0;
}

void main() {
  ivec2 px = ivec2(gl_VertexID % u_analysisSize.x, gl_VertexID / u_analysisSize.x);
  vec3 c = texelFetch(u_analysis, px, 0).rgb;
  float x = (float(px.x) + 0.5) / float(u_analysisSize.x);
  vec2 pos;
  vec3 col = vec3(1.0);
  if (u_mode == 0) {
    pos = vec2(x, dot(c, LUMA));
  } else if (u_mode == 1) {
    int ch = gl_InstanceID;
    pos = vec2((float(ch) + x) / 3.0, c[ch]);
    col = vec3(0.0);
    col[ch] = 1.0;
  } else {
    float y = dot(c, LUMA);
    float cb = (c.b - y) / 1.8556;
    float cr = (c.r - y) / 1.5748;
    pos = vec2(0.5 + cb, 0.5 + cr);
  }
  gl_Position = vec4(toClip(pos.x, u_targetSize.x), toClip(pos.y, u_targetSize.y), 0.0, 1.0);
  gl_PointSize = 1.0;
  v_color = col * u_weight;
}
`;

const SCATTER_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 outColor;
void main() { outColor = vec4(v_color, 1.0); }
`;

const DISPLAY_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_acc;
uniform sampler2D u_hist;
uniform vec4 u_rect;        // 그릴 영역 (x, y, w, h) 캔버스 픽셀, 아래 기준
uniform int u_mode;         // 0 waveform, 1 parade, 2 vectorscope, 3 histogram
uniform float u_gain;
out vec4 outColor;

vec3 tone(vec3 v) { return 1.0 - exp(-v * u_gain); }

void main() {
  vec2 uv = (gl_FragCoord.xy - u_rect.xy) / u_rect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
  vec3 col;
  if (u_mode == 3) {
    vec4 h = texture(u_hist, vec2(uv.x, 0.5));
    vec3 fill = step(vec3(uv.y), h.rgb);
    float lumaEdge = step(abs(uv.y - h.a), 0.006);
    col = fill * 0.55 + vec3(lumaEdge * 0.9);
  } else {
    vec3 v = texture(u_acc, uv).rgb;
    if (u_mode == 1) col = tone(v) * vec3(0.95, 0.9, 1.0);
    else col = vec3(tone(v).r) * vec3(0.86, 0.92, 0.86);
  }
  outColor = vec4(col, 1.0);
}
`;

export interface ScopeStats {
  /** 한 채널이라도 255에 닿은 픽셀 비율 */
  highlightClip: number;
  /** 한 채널이라도 0에 닿은 픽셀 비율 */
  shadowClip: number;
  pixels: number;
}

export class ScopeRenderer extends GLBase {
  private analysisProg: WebGLProgram;
  private scatterProg: WebGLProgram;
  private displayProg: WebGLProgram;
  private proxyTex: WebGLTexture | null = null;
  private analysisTex: WebGLTexture | null = null;
  private analysisFbo: WebGLFramebuffer | null = null;
  private analysisSize = { w: 0, h: 0 };
  private analysisPixels = new Uint8Array(0);
  private accTex = new Map<string, { tex: WebGLTexture; fbo: WebGLFramebuffer }>();
  private histTex: WebGLTexture;
  private aspect = 1;
  private readonly floatAcc: boolean;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    const gl = this.gl;
    // 누적 버퍼는 반정밀도 실수가 좋다. 렌더 타깃 확장이 없으면 8bit로 대체.
    this.floatAcc = !!gl.getExtension('EXT_color_buffer_float');
    this.analysisProg = link(gl, ANALYSIS_FRAGMENT);
    this.scatterProg = link(gl, SCATTER_FRAGMENT, SCATTER_VERTEX);
    this.displayProg = link(gl, DISPLAY_FRAGMENT);
    this.histTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.histTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 256, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  }

  setImage(proxy: ImageBitmap | null) {
    const gl = this.gl;
    if (this.proxyTex) gl.deleteTexture(this.proxyTex);
    this.proxyTex = proxy ? this.createTexture(proxy, true) : null;
    if (!proxy) return;
    this.aspect = proxy.width / proxy.height;
    const w = Math.min(ANALYSIS_WIDTH, proxy.width);
    const h = Math.max(1, Math.min(ANALYSIS_WIDTH, Math.round((w * proxy.height) / proxy.width)));
    if (w === this.analysisSize.w && h === this.analysisSize.h) return;
    if (this.analysisTex) gl.deleteTexture(this.analysisTex);
    if (this.analysisFbo) gl.deleteFramebuffer(this.analysisFbo);
    this.analysisTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.analysisTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.analysisFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.analysisFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.analysisTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.analysisSize = { w, h };
    this.analysisPixels = new Uint8Array(w * h * 4);
  }

  private accumulator(w: number, h: number) {
    const key = `${w}x${h}`;
    let a = this.accTex.get(key);
    if (a) return a;
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.floatAcc ? gl.RGBA16F : gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    a = { tex, fbo };
    this.accTex.set(key, a);
    return a;
  }

  /** 스코프를 그리고 클리핑 통계를 돌려준다. 이미지가 없으면 null. */
  draw(u: GradeUniforms[], mode: ScopeMode, rect: { x: number; y: number; w: number; h: number }): ScopeStats | null {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.07, 0.07, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.proxyTex || !this.analysisFbo) return null;

    // 1) 분석 렌더
    const { w: aw, h: ah } = this.analysisSize;
    gl.useProgram(this.analysisProg);
    this.setGradeUniforms(this.analysisProg, u, { dither: false, aspect: this.aspect });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.proxyTex);
    gl.uniform1i(gl.getUniformLocation(this.analysisProg, 'u_image'), 0);
    gl.uniform2f(gl.getUniformLocation(this.analysisProg, 'u_size'), aw, ah);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.analysisFbo);
    gl.viewport(0, 0, aw, ah);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) 히스토그램·클리핑 (정확한 개수)
    gl.readPixels(0, 0, aw, ah, gl.RGBA, gl.UNSIGNED_BYTE, this.analysisPixels);
    const stats = this.histogram(mode === 'histogram');

    // 3) 산포 누적
    let target = { w: 0, h: 0 };
    if (mode !== 'histogram') {
      target = mode === 'vectorscope' ? { w: 256, h: 256 } : { w: mode === 'parade' ? 768 : 512, h: 256 };
      const acc = this.accumulator(target.w, target.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fbo);
      gl.viewport(0, 0, target.w, target.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      const p = this.scatterProg;
      gl.useProgram(p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.analysisTex);
      gl.uniform1i(gl.getUniformLocation(p, 'u_analysis'), 0);
      gl.uniform2i(gl.getUniformLocation(p, 'u_analysisSize'), aw, ah);
      gl.uniform2i(gl.getUniformLocation(p, 'u_targetSize'), target.w, target.h);
      gl.uniform1i(gl.getUniformLocation(p, 'u_mode'), mode === 'waveform' ? 0 : mode === 'parade' ? 1 : 2);
      // 8bit 누적일 때는 한 점의 기여를 1/255로 둔다
      gl.uniform1f(gl.getUniformLocation(p, 'u_weight'), this.floatAcc ? 1 : 1 / 255);
      gl.drawArraysInstanced(gl.POINTS, 0, aw * ah, mode === 'parade' ? 3 : 1);
      gl.disable(gl.BLEND);
    }

    // 4) 표시
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const d = this.displayProg;
    gl.useProgram(d);
    gl.uniform4f(gl.getUniformLocation(d, 'u_rect'), rect.x, rect.y, rect.w, rect.h);
    gl.uniform1i(
      gl.getUniformLocation(d, 'u_mode'),
      { waveform: 0, parade: 1, vectorscope: 2, histogram: 3 }[mode],
    );
    // 밝기 기준: 분석 픽셀이 한 칸에 몰리는 정도에 맞춰 조정
    const density = mode === 'histogram' ? 1 : (aw * ah) / (target.w * target.h) || 1;
    const k = this.floatAcc ? 1 : 255;
    gl.uniform1f(gl.getUniformLocation(d, 'u_gain'), (k * (mode === 'vectorscope' ? 0.6 : 2.2)) / density);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mode === 'histogram' ? null : this.accumulator(target.w || 1, target.h || 1).tex);
    gl.uniform1i(gl.getUniformLocation(d, 'u_acc'), 0);
    gl.activeTexture(gl.TEXTURE0 + HIST_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.histTex);
    gl.uniform1i(gl.getUniformLocation(d, 'u_hist'), HIST_UNIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return stats;
  }

  private histogram(upload: boolean): ScopeStats {
    const px = this.analysisPixels;
    const n = px.length / 4;
    const bins = new Float32Array(256 * 4);
    let hi = 0;
    let lo = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      bins[r * 4]++;
      bins[g * 4 + 1]++;
      bins[b * 4 + 2]++;
      bins[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b) * 4 + 3]++;
      if (r === 255 || g === 255 || b === 255) hi++;
      if (r === 0 || g === 0 || b === 0) lo++;
    }
    if (upload) {
      // 양 끝 칸(클리핑)이 그래프를 납작하게 만들지 않도록 1–254 구간의 최댓값으로 정규화
      let max = 1;
      for (let i = 4; i < 255 * 4; i++) max = Math.max(max, bins[i]);
      for (let i = 0; i < bins.length; i++) bins[i] = Math.min(1, bins[i] / max);
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.histTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.FLOAT, bins);
    }
    return { highlightClip: hi / n, shadowClip: lo / n, pixels: n };
  }
}
