export function createBuffer(
  gl: WebGLRenderingContext,
  data: ArrayLike<number> | Float32Array | null | undefined
): WebGLBuffer {
  const Buffer: WebGLBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, Buffer);
  const payload =
    data instanceof Float32Array ? data : new Float32Array((data as ArrayLike<number>) || []);
  gl.bufferData(gl.ARRAY_BUFFER, payload, gl.STATIC_DRAW);
  return Buffer;
}

export function createElementBuffer(
  gl: WebGLRenderingContext,
  data: Uint16Array | Uint32Array | ArrayLike<number> | null | undefined
): WebGLBuffer {
  const indexBuffer: WebGLBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  // Preserve the original typed array type (Uint16 vs Uint32)
  if (data instanceof Uint32Array) {
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
  } else if (data instanceof Uint16Array) {
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
  } else {
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data || []), gl.STATIC_DRAW);
  }
  return indexBuffer;
}
