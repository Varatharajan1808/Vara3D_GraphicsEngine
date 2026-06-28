export function getAttribLocation(gl: WebGLRenderingContext, program: WebGLProgram, shaderLocation: string, buffer: WebGLBuffer | null, point: number, stride = 0, offset = 0): number | void {
    const location = gl.getAttribLocation(program, shaderLocation);
    if (location === -1) {
        console.error(`Attribute location not found for ${shaderLocation}`);
        return;
    }
    gl.enableVertexAttribArray(location);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(location, point, gl.FLOAT, false, stride, offset);
    return location;
}

export function getUniformLocation(gl: WebGLRenderingContext, Program: WebGLProgram, Location: string, Matrix: Float32Array) {
    const AnyMatrix = gl.getUniformLocation(Program, Location) as WebGLUniformLocation;
    if (!AnyMatrix) {
        console.error(`Uniform location not found for ${Location}`);
        return null;
    }
    gl.uniformMatrix4fv(AnyMatrix, false, Matrix);

    return AnyMatrix
}