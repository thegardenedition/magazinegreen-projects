import type { GradeUniforms } from './color';
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
  private curvesData: Float32Array | null = null;

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
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, LUT_SIZE, LUT_ROWS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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

  protected setGradeUniforms(prog: WebGLProgram, u: GradeUniforms, dither: boolean) {
    const gl = this.gl;
    const loc = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform1i(loc('u_enabled'), u.enabled ? 1 : 0);
    gl.uniform3fv(loc('u_wb'), u.wb);
    gl.uniform3fv(loc('u_offsetMul'), u.offsetMul);
    gl.uniform3fv(loc('u_gainMul'), u.gainMul);
    gl.uniform3fv(loc('u_lift'), u.lift);
    gl.uniform3fv(loc('u_gammaExp'), u.gammaExp);
    gl.uniform1f(loc('u_contrast'), u.contrast);
    gl.uniform1f(loc('u_pivot'), u.pivot);
    gl.uniform1f(loc('u_saturation'), u.saturation);
    gl.uniformMatrix3fv(loc('u_hueMatrix'), false, u.hueMatrix);
    gl.uniform1i(loc('u_dither'), dither ? 1 : 0);
    gl.uniform1i(loc('u_hueActive'), u.curves.hueActive ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curvesTex);
    if (this.curvesData !== u.curves.data) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LUT_SIZE, LUT_ROWS, gl.RGBA, gl.FLOAT, u.curves.data);
      this.curvesData = u.curves.data;
    }
    gl.uniform1i(loc('u_curves'), 1);
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


  drawViewer(u: GradeUniforms, d: ViewerDraw) {
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
    u: GradeUniforms,
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
