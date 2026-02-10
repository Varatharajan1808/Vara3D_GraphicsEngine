export function createBuffer( gl: WebGLRenderingContext, data: number[]): WebGLBuffer {
  const Buffer: WebGLBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, Buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data || []), gl.STATIC_DRAW);
  return Buffer;
}

export function createElementBuffer( gl: WebGLRenderingContext, data: Uint16Array | Uint32Array): WebGLBuffer {
  const indexBuffer: WebGLBuffer = gl.createBuffer() ;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data || []), gl.STATIC_DRAW);
  return indexBuffer;
}
