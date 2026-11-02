const attribLocationCache = new WeakMap<WebGLProgram, Map<string, number>>();
const uniformLocationCache = new WeakMap<
  WebGLProgram,
  Map<string, WebGLUniformLocation | null>
>();

function getAttribCache(program: WebGLProgram): Map<string, number> {
  let map = attribLocationCache.get(program);
  if (!map) {
    map = new Map();
    attribLocationCache.set(program, map);
  }
  return map;
}

function getUniformCache(
  program: WebGLProgram
): Map<string, WebGLUniformLocation | null> {
  let map = uniformLocationCache.get(program);
  if (!map) {
    map = new Map();
    uniformLocationCache.set(program, map);
  }
  return map;
}

/** Cached gl.getAttribLocation — safe to call every draw. */
export function resolveAttribLocation(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string
): number {
  const cache = getAttribCache(program);
  let location = cache.get(name);
  if (location === undefined) {
    location = gl.getAttribLocation(program, name);
    cache.set(name, location);
  }
  return location;
}

/** Cached gl.getUniformLocation — safe to call every draw. */
export function resolveUniformLocation(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string
): WebGLUniformLocation | null {
  const cache = getUniformCache(program);
  if (!cache.has(name)) {
    cache.set(name, gl.getUniformLocation(program, name));
  }
  return cache.get(name) ?? null;
}

export function getAttribLocation(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  shaderLocation: string,
  buffer: WebGLBuffer | null,
  point: number,
  stride = 0,
  offset = 0
): number | void {
  const location = resolveAttribLocation(gl, program, shaderLocation);
  if (location === -1) {
    console.error(`Attribute location not found for ${shaderLocation}`);
    return;
  }
  gl.enableVertexAttribArray(location);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(location, point, gl.FLOAT, false, stride, offset);
  return location;
}

export function getUniformLocation(
  gl: WebGLRenderingContext,
  Program: WebGLProgram,
  Location: string,
  Matrix: Float32Array
) {
  const AnyMatrix = resolveUniformLocation(gl, Program, Location);
  if (!AnyMatrix) {
    console.error(`Uniform location not found for ${Location}`);
    return null;
  }
  gl.uniformMatrix4fv(AnyMatrix, false, Matrix);

  return AnyMatrix;
}
