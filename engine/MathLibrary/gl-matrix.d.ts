export namespace glMatrix {
    export type Mat4 = Float32Array | number[];
    export type Vec3 = Float32Array | number[];
    export type Quat = Float32Array | number[];
    export type Vec4 = Float32Array | number[];
}

export namespace mat4 {
    export function create(): glMatrix.Mat4;
    export function identity(out: glMatrix.Mat4): glMatrix.Mat4;
    export function perspective(out: glMatrix.Mat4, fovy: number, aspect: number, near: number, far: number): glMatrix.Mat4;
    export function ortho(out: glMatrix.Mat4, left: number, right: number, bottom: number, top: number, near: number, far: number): glMatrix.Mat4;
    export function translate(out: glMatrix.Mat4, a: glMatrix.Mat4, v: glMatrix.Vec3): glMatrix.Mat4;
    export function scale(out: glMatrix.Mat4, a: glMatrix.Mat4, v: glMatrix.Vec3): glMatrix.Mat4;
    export function rotateX(out: glMatrix.Mat4, a: glMatrix.Mat4, rad: number): glMatrix.Mat4;
    export function rotateY(out: glMatrix.Mat4, a: glMatrix.Mat4, rad: number): glMatrix.Mat4;
    export function rotateZ(out: glMatrix.Mat4, a: glMatrix.Mat4, rad: number): glMatrix.Mat4;
    export function lookAt(out: glMatrix.Mat4, eye: glMatrix.Vec3, center: glMatrix.Vec3, up: glMatrix.Vec3): glMatrix.Mat4;
    export function multiply(out: glMatrix.Mat4, a: glMatrix.Mat4, b: glMatrix.Mat4): glMatrix.Mat4;
    export function invert(out: glMatrix.Mat4, a: glMatrix.Mat4): glMatrix.Mat4 | null;
    export function fromRotationTranslationScale(out: glMatrix.Mat4, q: glMatrix.Quat, v: glMatrix.Vec3, s: glMatrix.Vec3): glMatrix.Mat4;
    export function getTranslation(out: glMatrix.Vec3, mat: glMatrix.Mat4): glMatrix.Vec3;
    export function getRotation(out: glMatrix.Quat, mat: glMatrix.Mat4): glMatrix.Quat;
    export function getScaling(out: glMatrix.Vec3, mat: glMatrix.Mat4): glMatrix.Vec3;
    export function copy(out: glMatrix.Mat4, a: glMatrix.Mat4): glMatrix.Mat4;
}

export namespace vec3 {
    export function create(): glMatrix.Vec3;
    export function normalize(out: glMatrix.Vec3, a: glMatrix.Vec3): glMatrix.Vec3;
    export function subtract(out: glMatrix.Vec3, a: glMatrix.Vec3, b: glMatrix.Vec3): glMatrix.Vec3;
    export function add(out: glMatrix.Vec3, a: glMatrix.Vec3, b: glMatrix.Vec3): glMatrix.Vec3;
    export function cross(out: glMatrix.Vec3, a: glMatrix.Vec3, b: glMatrix.Vec3): glMatrix.Vec3;
    export function distance(a: glMatrix.Vec3, b: glMatrix.Vec3): number;
    export function dot(a: glMatrix.Vec3, b: glMatrix.Vec3): number;
    export function scale(out: glMatrix.Vec3, v: glMatrix.Vec3, s: number): glMatrix.Vec3;
    export function transformMat4(out: glMatrix.Vec3, a: glMatrix.Vec3, m: glMatrix.Mat4): glMatrix.Vec3;
    export function fromValues(x: number, y: number, z: number): glMatrix.Vec3;
}

export namespace vec4 {
    export function create(): glMatrix.Vec4;
    export function transformMat4(out: glMatrix.Vec4, a: glMatrix.Vec4, m: glMatrix.Mat4): glMatrix.Vec4;
    export function fromValues(x: number, y: number, z: number, w: number): glMatrix.Vec4;
}

export namespace quat {
    export function create(): glMatrix.Quat;
}
