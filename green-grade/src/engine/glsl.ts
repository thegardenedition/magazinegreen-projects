import { VERTEX_SHADER } from './shaders';

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
