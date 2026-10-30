import type { GradeUniforms } from './color';
import { MAX_NODES } from './constants';
import { LUT_ROWS, LUT_SIZE } from './curves';
import { EXPORT_FRAGMENT, VERTEX_SHADER, VIEWER_FRAGMENT } from './shaders';

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
}

const TILE = 2048;
/** 텍스처 유닛: 0 이미지, 1 커브 표, 2–9 노드별 LUT, 10 이후 스코프 */
export const LUT_UNIT0 = 2;
const BACKGROUND: [number, number, number] = [0.086, 0.086, 0.086];

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('셰이더 컴파일 실패: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export function link(gl: WebGL2RenderingContext, fs: string, vs = VERTEX_SHADER) {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('셰이더 링크 실패: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

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
  protected setGradeUniforms(prog: WebGLProgram, chain: GradeUniforms[], dither: boolean) {
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
    gl.uniform1fv(loc('u_contrast'), pad((u) => u.contrast, 0));
    gl.uniform1fv(loc('u_pivot'), pad((u) => u.pivot, 0));
    gl.uniform1fv(loc('u_saturation'), pad((u) => u.saturation, 0));
    gl.uniformMatrix3fv(loc('u_hueMatrix'), false, pad((u) => u.hueMatrix, new Array(9).fill(0)).flat());
    gl.uniform1iv(loc('u_hueActive'), pad((u) => (u.curves.hueActive ? 1 : 0), 0));
    const hasLut = (u: GradeUniforms) => !!u.lut && u.lut.intensity > 0;
    gl.uniform1iv(loc('u_hasLut'), pad((u) => (hasLut(u) ? 1 : 0), 0));
    gl.uniform1fv(loc('u_lutIntensity'), pad((u) => u.lut?.intensity ?? 0, 0));
    gl.uniform1iv(loc('u_lutSize'), pad((u) => u.lut?.lut.size ?? 2, 2));
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

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.viewerProg = link(this.gl, VIEWER_FRAGMENT);
    this.exportProg = link(this.gl, EXPORT_FRAGMENT);
  }

  setPreview(proxy: ImageBitmap | null) {
    if (this.previewTex) this.gl.deleteTexture(this.previewTex);
    this.previewTex = proxy ? this.createTexture(proxy, true) : null;
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
    this.setGradeUniforms(prog, u, d.dither);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.previewTex);
    gl.uniform1i(loc('u_image'), 0);
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
   * 원본 해상도로 보정 결과를 렌더해 위→아래 순서의 RGBA8 버퍼로 돌려준다.
   * GPU 메모리를 아끼기 위해 2048px 타일 단위로 그리고 읽는다.
   */
  renderFull(
    src: TexSource,
    u: GradeUniforms[],
    opts: { dither: boolean; onProgress?: (done: number) => void },
  ): Uint8ClampedArray<ArrayBuffer> {
    const gl = this.gl;
    const { width, height } = src;
    if (width > this.maxTextureSize || height > this.maxTextureSize) {
      throw new Error(`이미지가 GPU 최대 텍스처 크기(${this.maxTextureSize}px)를 넘습니다.`);
    }
    const tex = this.createTexture(src, false);
    const out = new Uint8ClampedArray(width * height * 4);

    const tileTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tileTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, TILE, TILE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tileTex, 0);

    const prog = this.exportProg;
    gl.useProgram(prog);
    this.setGradeUniforms(prog, u, opts.dither);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_image'), 0);
    gl.bindVertexArray(this.vao);

    const tilePixels = new Uint8Array(TILE * TILE * 4);
    const tilesX = Math.ceil(width / TILE);
    const tilesY = Math.ceil(height / TILE);
    let done = 0;
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = tx * TILE;
        const y0 = ty * TILE;
        const tw = Math.min(TILE, width - x0);
        const th = Math.min(TILE, height - y0);
        gl.viewport(0, 0, tw, th);
        gl.uniform2i(gl.getUniformLocation(prog, 'u_tileOrigin'), x0, y0);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_tileHeight'), th);
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
    return out;
  }
}

// 뷰어가 만든 렌더러를 내보내기 등 다른 모듈이 함께 쓴다 (WebGL 컨텍스트는 하나만 유지)
let active: Renderer | null = null;
export const setActiveRenderer = (r: Renderer | null) => {
  active = r;
};
export const getActiveRenderer = () => active;
