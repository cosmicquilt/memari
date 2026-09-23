// Lays two page pictures onto the pages of a video frame.
//
// A WebGL canvas the size of the video frame, placed over it with the same
// object-fit, cleared to white and multiplied onto the video (CSS
// mix-blend-mode): where it is white nothing changes, and the printed
// layout and the ink darken the page the camera saw - its paper, its warm
// light and the leaf shadows across it all come through, so the drawing
// sits IN the photograph rather than on top of it.
//
// Each page is a grid mesh following its outline: straight outer and
// gutter edges, arched top and bottom edges, and rows spaced for the
// perspective (the far edge of a page is drawn smaller than the near one,
// so equal steps down the page are shorter at the top of the frame).

import type { PageOutline, Point } from "./heroVideo";

const COLUMNS = 24;
const ROWS = 32;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** y of a sampled edge at x, the outline's corner points closing its ends. */
function edgeAt(samples: readonly Point[], x: number) {
  if (x <= samples[0][0]) return samples[0][1];
  for (let i = 1; i < samples.length; i++) {
    const [x1, y1] = samples[i];
    if (x <= x1) {
      const [x0, y0] = samples[i - 1];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return samples[samples.length - 1][1];
}

/** Where the page's point (u across, v down, both 0..1) lies in the frame. */
export function placeOnPage(o: PageOutline, u: number, v: number): Point {
  const top: Point[] = [o.aTop, ...o.top, o.bTop];
  const bottom: Point[] = [o.aBottom, ...o.bottom, o.bBottom];
  // Perspective down the page: the near (bottom) edge is wider than the far
  // one by the camera's depth ratio.
  const k = (o.bTop[0] - o.aTop[0]) / (o.bBottom[0] - o.aBottom[0]);
  const f = v / (k * (1 - v) + v);
  const xTop = lerp(o.aTop[0], o.bTop[0], u);
  const xBottom = lerp(o.aBottom[0], o.bBottom[0], u);
  const yTop = edgeAt(top, xTop);
  const yBottom = edgeAt(bottom, xBottom);
  return [lerp(xTop, xBottom, f), lerp(yTop, yBottom, f)];
}

const VERTEX = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D page;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(page, vUv);
}`;

type Mesh = { buffer: WebGLBuffer; count: number; texture: WebGLTexture };

export class PageWarp {
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private program: WebGLProgram;
  private meshes: Mesh[];
  private mipmaps: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    outlines: readonly [PageOutline, PageOutline],
    frame: { width: number; height: number }
  ) {
    canvas.width = frame.width;
    canvas.height = frame.height;
    const gl2 = canvas.getContext("webgl2", { premultipliedAlpha: false, antialias: true });
    const gl = gl2 ?? canvas.getContext("webgl", { premultipliedAlpha: false, antialias: true });
    if (!gl) throw new Error("no WebGL");
    this.gl = gl;
    // Mipmaps keep the fine ruled lines from shimmering where the page
    // picture is drawn several times smaller than it is; WebGL 1 cannot
    // make them for a picture that is not a power of two across.
    this.mipmaps = gl2 !== null;
    this.program = this.link();
    this.meshes = outlines.map((outline) => this.mesh(outline, frame));
  }

  private link() {
    const gl = this.gl;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    return program;
  }

  private mesh(outline: PageOutline, frame: { width: number; height: number }): Mesh {
    const gl = this.gl;
    // Two triangles per cell: x, y (clip space), u, v.
    const data: number[] = [];
    const vertex = (u: number, v: number) => {
      const [x, y] = placeOnPage(outline, u, v);
      data.push((x / frame.width) * 2 - 1, 1 - (y / frame.height) * 2, u, v);
    };
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLUMNS; i++) {
        const [u0, u1, v0, v1] = [i / COLUMNS, (i + 1) / COLUMNS, j / ROWS, (j + 1) / ROWS];
        vertex(u0, v0);
        vertex(u1, v0);
        vertex(u0, v1);
        vertex(u1, v0);
        vertex(u1, v1);
        vertex(u0, v1);
      }
    }
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    return { buffer, count: data.length / 4, texture };
  }

  /** Take a page's picture as it is now (0 left, 1 right). */
  upload(page: 0 | 1, picture: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.meshes[page].texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    if (this.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  }

  draw() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    const position = gl.getAttribLocation(this.program, "position");
    const uv = gl.getAttribLocation(this.program, "uv");
    for (const mesh of this.meshes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
      gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
  }

  dispose() {
    const gl = this.gl;
    for (const mesh of this.meshes) {
      gl.deleteBuffer(mesh.buffer);
      gl.deleteTexture(mesh.texture);
    }
    gl.deleteProgram(this.program);
    (gl.getExtension("WEBGL_lose_context") as { loseContext(): void } | null)?.loseContext();
  }
}
