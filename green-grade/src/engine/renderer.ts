import type { GradeUniforms } from './color';
import { MAX_NODES } from './constants';
import { LUT_ROWS, LUT_SIZE } from './curves';
import { MAX_POLY_POINTS, maskBits } from './mask';
import { type DevelopBase, type DevelopPlan, type GrainUniforms, type Mat3 } from './develop';
import { DEV_TILE, Developer } from './developGL';
import { link } from './glsl';
import { EXPORT_FRAGMENT, VIEWER_FRAGMENT } from './shaders';

export type TexSource = ImageBitmap | { data: Uint8Array; width: number; height: number };

export interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ViewerDraw {
  view: ViewState;
  imageWidth: number;
  imageHeight: number;
  split: number;
  bypass: boolean;
  dither: boolean;
  /** 마스크 보기: 0 끔, 1 하이라이트, 2 흑백 */
  maskView: 0 | 1 | 2;
  maskNode: number;
  /** 보이는 영역 0–1 → 원본 0–1 (원본 보기·분할의 왼쪽에 쓴다) */
  matrix: Mat3;
  grain: GrainUniforms;
}

/** 형태·디테일을 거쳐 렌더할 때의 계획과 선명도·디헤이즈 기준 */
export interface DevelopInput {
  plan: DevelopPlan;
  base: DevelopBase | null;
}

export interface RenderResult {
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

export const IDENTITY_MATRIX: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const colMajor = (m: Mat3) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

const TILE = 2048;
/** 텍스처 유닛: 0 이미지, 1 커브 표, 2–9 노드별 LUT, 10 폴리곤, 11 현상 결과, 12 스코프 */
export const LUT_UNIT0 = 2;
const POLY_UNIT = 10;
/** 현상 결과 텍스처 */
const DEV_UNIT = 11;

export interface GradeOptions {
  dither: boolean;
  /** 이미지 가로/세로 (창 모양 계산용) */
  aspect?: number;
  /** 마스크를 보여 줄 노드의 순번 (꺼진 노드 포함한 원래 순번) */
  maskNode?: number;
}
const BACKGROUND: [number, number, number] = [0.086, 0.086, 0.086];

export { link };

/** WebGL2 컨텍스트 하나와 보정 셰이더 공통 자원(전체 화면 삼각형, 커브 표 텍스처) */
export class GLBase {
  readonly gl: WebGL2RenderingContext;
  readonly maxTextureSize: number;
  protected vao: WebGLVertexArrayObject;
  private curvesTex: WebGLTexture;
  /** 노드 칸마다 마지막으로 올린 커브 표 / LUT (같으면 다시 올리지 않는다) */
  private curvesData: Array<Float32Array | null> = new Array(MAX_NODES).fill(null);
  private lutTex: WebGLTexture[] = [];
  private lutData: Array<Float32Array | null> = new Array(MAX_NODES).fill(null);
  private polyTex: WebGLTexture;
  private polyData = new Float32Array(MAX_POLY_POINTS * MAX_NODES * 4);

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('이 브라우저는 WebGL2를 지원하지 않습니다.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // 커브 표: RGBA32F, texelFetch로만 읽으므로 필터링 확장이 필요 없다
    this.curvesTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.curvesTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, LUT_SIZE, LUT_ROWS * MAX_NODES);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.polyTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.polyTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, MAX_POLY_POINTS, MAX_NODES);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // 3D LUT 칸: 처음엔 1×1×1 빈 텍스처 (샘플러마다 유효한 3D 텍스처가 묶여 있어야 한다)
    for (let i = 0; i < MAX_NODES; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, 1, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.lutTex.push(t);
    }
  }

  createTexture(src: TexSource, mipmap: boolean): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (src instanceof ImageBitmap) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mipmap ? gl.LINEAR : gl.NEAREST);
    if (mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    }
    return tex;
  }

  /** 켜진 노드만 앞에서부터 셰이더 배열에 채운다 */
  protected setGradeUniforms(prog: WebGLProgram, chain: GradeUniforms[], opts: GradeOptions) {
    const { dither, aspect = 1, maskNode = -1 } = opts;
    const gl = this.gl;
    const loc = (n: string) => gl.getUniformLocation(prog, n);
    const nodes = chain.filter((u) => u.enabled).slice(0, MAX_NODES);
    const pad = <T,>(f: (u: GradeUniforms) => T, empty: T): T[] =>
      Array.from({ length: MAX_NODES }, (_, i) => (nodes[i] ? f(nodes[i]) : empty));
    const zero3 = [0, 0, 0];
    gl.uniform1i(loc('u_nodeCount'), nodes.length);
    gl.uniform3fv(loc('u_wb'), pad((u) => u.wb, zero3).flat());
    gl.uniform3fv(loc('u_offsetMul'), pad((u) => u.offsetMul, zero3).flat());
    gl.uniform3fv(loc('u_gainMul'), pad((u) => u.gainMul, zero3).flat());
    gl.uniform3fv(loc('u_lift'), pad((u) => u.lift, zero3).flat());
    gl.uniform3fv(loc('u_gammaExp'), pad((u) => u.gammaExp, zero3).flat());
    const hasLut = (u: GradeUniforms) => !!u.lut && u.lut.intensity > 0;
    gl.uniform4fv(
      loc('u_tone'),
      pad((u) => [u.contrast, u.pivot, u.saturation, u.lut?.intensity ?? 0], [0, 0, 0, 0]).flat(),
    );
    gl.uniform4fv(loc('u_tone2'), pad((u) => [u.shadows, u.highlights, u.colorBoost, u.highRange], [0, 0, 0, 0.55]).flat());
    gl.uniform4fv(loc('u_logS'), pad((u) => [...u.logShadow, u.lowRange], [0, 0, 0, 0.333]).flat());
    gl.uniform3fv(loc('u_logM'), pad((u) => u.logMidtone, zero3).flat());
    gl.uniform3fv(loc('u_logH'), pad((u) => u.logHighlight, zero3).flat());
    gl.uniform4iv(
      loc('u_flags'),
      pad(
        (u) => [u.curves.hueActive ? 1 : 0, hasLut(u) ? 1 : 0, u.lut?.lut.size ?? 2, maskBits(u.mask)],
        [0, 0, 2, 0],
      ).flat(),
    );
    const q = (u: GradeUniforms) => u.mask?.qualifier;
    gl.uniform4fv(loc('u_hueQ'), pad((u) => { const h = q(u)?.hue; return h ? [h.center, h.width, h.soft, 0] : [0, 0, 0, 0]; }, [0, 0, 0, 0]).flat());
    gl.uniform4fv(loc('u_satQ'), pad((u) => { const r = q(u)?.sat; return r ? [r.low, r.high, r.soft, 0] : [0, 1, 0, 0]; }, [0, 1, 0, 0]).flat());
    gl.uniform4fv(loc('u_lumQ'), pad((u) => { const r = q(u)?.lum; return r ? [r.low, r.high, r.soft, 0] : [0, 1, 0, 0]; }, [0, 1, 0, 0]).flat());
    gl.uniform4fv(loc('u_winA'), pad((u) => u.mask?.window?.w.a ?? [0, 0, 0, 0], [0, 0, 0, 0]).flat());
    gl.uniform4fv(
      loc('u_winB'),
      pad((u) => { const w = u.mask?.window?.w; return w ? [w.angle, w.feather, 0, 0] : [0, 0, 0, 0]; }, [0, 0, 0, 0]).flat(),
    );
    gl.uniform1f(loc('u_aspect'), aspect);
    // 꺼진 노드는 빠지므로, 원래 순번을 켜진 노드 안의 순번으로 바꾼다
    const shown = maskNode >= 0 && chain[maskNode]?.enabled ? chain.slice(0, maskNode).filter((u) => u.enabled).length : -1;
    gl.uniform1i(loc('u_maskNode'), shown);
    gl.uniformMatrix3fv(loc('u_hueMatrix'), false, pad((u) => u.hueMatrix, new Array(9).fill(0)).flat());
    gl.uniform3fv(loc('u_lutMin'), pad((u) => u.lut?.lut.domainMin ?? zero3, zero3).flat());
    gl.uniform3fv(loc('u_lutMax'), pad((u) => u.lut?.lut.domainMax ?? [1, 1, 1], [1, 1, 1]).flat());
    gl.uniform1i(loc('u_dither'), dither ? 1 : 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curvesTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    nodes.forEach((u, i) => {
      if (this.curvesData[i] === u.curves.data) return;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, i * LUT_ROWS, LUT_SIZE, LUT_ROWS, gl.RGBA, gl.FLOAT, u.curves.data);
      this.curvesData[i] = u.curves.data;
    });
    gl.uniform1i(loc('u_curves'), 1);

    // 폴리곤 꼭짓점 표
    gl.activeTexture(gl.TEXTURE0 + POLY_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.polyTex);
    this.polyData.fill(0);
    nodes.forEach((u, i) => {
      u.mask?.window?.w.poly.slice(0, MAX_POLY_POINTS).forEach((p, k) => {
        this.polyData[(i * MAX_POLY_POINTS + k) * 4] = p.x;
        this.polyData[(i * MAX_POLY_POINTS + k) * 4 + 1] = p.y;
      });
    });
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_POLY_POINTS, MAX_NODES, gl.RGBA, gl.FLOAT, this.polyData);
    gl.uniform1i(loc('u_polys'), POLY_UNIT);

    for (let i = 0; i < MAX_NODES; i++) {
      gl.activeTexture(gl.TEXTURE0 + LUT_UNIT0 + i);
      gl.bindTexture(gl.TEXTURE_3D, this.lutTex[i]);
      const l = nodes[i] && hasLut(nodes[i]) ? nodes[i].lut!.lut : null;
      if (l && this.lutData[i] !== l.data) {
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, l.size, l.size, l.size, 0, gl.RGBA, gl.FLOAT, l.data);
        this.lutData[i] = l.data;
      }
      gl.uniform1i(loc(`u_lut${i}`), LUT_UNIT0 + i);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
}

export class Renderer extends GLBase {
  private viewerProg: WebGLProgram;
  private exportProg: WebGLProgram;
  private previewTex: WebGLTexture | null = null;
  private devTex: WebGLTexture | null = null;
  private developer: Developer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.viewerProg = link(this.gl, VIEWER_FRAGMENT);
    this.exportProg = link(this.gl, EXPORT_FRAGMENT);
  }

  /** 현상 단계는 처음 쓸 때 만든다 (실수 렌더 타깃 확장이 없으면 여기서 오류) */
  private dev(): Developer {
    if (!this.developer) this.developer = new Developer(this.gl, this.vao);
    return this.developer;
  }

  setPreview(proxy: ImageBitmap | null) {
    if (this.previewTex) this.gl.deleteTexture(this.previewTex);
    this.previewTex = proxy ? this.createTexture(proxy, true) : null;
    this.setDevelopPreview(null);
  }

  /** 미리보기 축소본을 형태·디테일 보정한 텍스처를 만든다. identity면 축소본을 그대로 쓴다. */
  setDevelopPreview(input: DevelopInput | null) {
    if (this.devTex) this.gl.deleteTexture(this.devTex);
    this.devTex = null;
    if (!input || input.plan.identity || !this.previewTex) return;
    const d = this.dev();
    this.devTex = d.developPreview(this.previewTex, input.plan, input.base);
    d.releasePool();
  }

  private setGrain(prog: WebGLProgram, g: GrainUniforms | undefined) {
    this.gl.uniform3f(this.gl.getUniformLocation(prog, 'u_grain'), g?.amount ?? 0, g?.scale[0] ?? 1, g?.scale[1] ?? 1);
  }

  drawViewer(u: GradeUniforms[], d: ViewerDraw) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    if (!this.previewTex) {
      gl.clearColor(...BACKGROUND, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const prog = this.viewerProg;
    gl.useProgram(prog);
    const loc = (n: string) => gl.getUniformLocation(prog, n);
    this.setGradeUniforms(prog, u, {
      dither: d.dither,
      aspect: d.imageWidth / d.imageHeight,
      maskNode: d.maskNode,
    });
    this.setGrain(prog, d.grain);
    gl.uniform1i(loc('u_maskView'), d.maskView);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.previewTex);
    gl.uniform1i(loc('u_image'), 0);
    gl.activeTexture(gl.TEXTURE0 + DEV_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.devTex);
    gl.uniform1i(loc('u_dev'), DEV_UNIT);
    gl.uniform1i(loc('u_developed'), this.devTex ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniformMatrix3fv(loc('u_matrix'), false, colMajor(d.matrix));
    gl.uniform2f(loc('u_canvasSize'), width, height);
    gl.uniform2f(loc('u_imageSize'), d.imageWidth, d.imageHeight);
    gl.uniform1f(loc('u_scale'), d.view.scale);
    gl.uniform2f(loc('u_offset'), d.view.offsetX, d.view.offsetY);
    gl.uniform1f(loc('u_split'), d.split);
    gl.uniform1i(loc('u_bypass'), d.bypass ? 1 : 0);
    gl.uniform3fv(loc('u_background'), BACKGROUND);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * 보정 결과를 렌더해 위→아래 순서의 RGBA8 버퍼로 돌려준다.
   * develop이 있으면 형태·디테일을 거친 크기(plan.outW×outH)로, 없으면 src 크기 그대로 렌더한다.
   * GPU 메모리를 아끼기 위해 타일 단위로 그리고 읽는다 (현상할 때는 더 작은 타일).
   */
  renderFull(
    src: TexSource,
    u: GradeUniforms[],
    opts: { dither: boolean; onProgress?: (done: number) => void; develop?: DevelopInput | null },
  ): RenderResult {
    const gl = this.gl;
    if (src.width > this.maxTextureSize || src.height > this.maxTextureSize) {
      throw new Error(`이미지가 GPU 최대 텍스처 크기(${this.maxTextureSize}px)를 넘습니다.`);
    }
    const develop = opts.develop && !opts.develop.plan.identity ? opts.develop : null;
    const width = develop ? develop.plan.outW : src.width;
    const height = develop ? develop.plan.outH : src.height;
    const tileSize = develop ? DEV_TILE : TILE;
    const tex = this.createTexture(src, false);
    const out = new Uint8ClampedArray(width * height * 4);

    const tileTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tileTex);
    // 작은 렌더(썸네일 등)에 큰 타일을 잡지 않는다 — 휴대폰 GPU 메모리를 아낀다
    const tileW = Math.min(tileSize, width);
    const tileH = Math.min(tileSize, height);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, tileW, tileH);
    const fbo = gl.createFramebuffer();

    const prog = this.exportProg;
    const tilePixels = new Uint8Array(tileW * tileH * 4);
    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);
    let done = 0;
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = tx * tileSize;
        const y0 = ty * tileSize;
        const tw = Math.min(tileSize, width - x0);
        const th = Math.min(tileSize, height - y0);
        const devTile = develop ? this.dev().run(tex, develop.plan, develop.base, x0, y0, tw, th) : null;

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tileTex, 0);
        gl.useProgram(prog);
        this.setGradeUniforms(prog, u, { dither: opts.dither, aspect: width / height });
        this.setGrain(prog, develop?.plan.grain ?? opts.develop?.plan.grain);
        const loc = (n: string) => gl.getUniformLocation(prog, n);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(loc('u_image'), 0);
        gl.activeTexture(gl.TEXTURE0 + DEV_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, devTile?.tex ?? null);
        gl.uniform1i(loc('u_dev'), DEV_UNIT);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(loc('u_developed'), devTile ? 1 : 0);
        gl.uniform2i(loc('u_devOrigin'), devTile?.originX ?? 0, devTile?.originY ?? 0);
        gl.uniform2i(loc('u_outSize'), width, height);
        gl.uniform2i(loc('u_tileOrigin'), x0, y0);
        gl.uniform1i(loc('u_tileHeight'), th);
        gl.viewport(0, 0, tw, th);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, tilePixels);
        // readPixels는 아래 행부터 채우므로 뒤집어 복사
        for (let row = 0; row < th; row++) {
          const srcStart = (th - 1 - row) * tw * 4;
          const dstStart = ((y0 + row) * width + x0) * 4;
          out.set(tilePixels.subarray(srcStart, srcStart + tw * 4), dstStart);
        }
        opts.onProgress?.(++done / (tilesX * tilesY));
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tileTex);
    gl.deleteTexture(tex);
    if (develop) this.dev().releasePool();
    return { pixels: out, width, height };
  }
}

// 뷰어가 만든 렌더러를 내보내기 등 다른 모듈이 함께 쓴다 (WebGL 컨텍스트는 하나만 유지)
let active: Renderer | null = null;
export const setActiveRenderer = (r: Renderer | null) => {
  active = r;
};
export const getActiveRenderer = () => active;
