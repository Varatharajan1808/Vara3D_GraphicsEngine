import { mat4 } from "../MathLibrary/gl-matrix.js";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export class CameraController {
  uuid: string;
  type: string = "Camera";
  translate: number[];
  scale: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  eye: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  projectionMatrix: any;
  modelMatrix: any;
  viewMatrix: any;
  localMatrix: any;
  viewProjectionMatrix: any;
  rm: any;
  projectionType: "perspective" | "orthographic" = "perspective";
  orthoSize: number = 2.0;
  constructor() {
    this.uuid = uuidv4();
    this.translate = [0, 0, 0];
    this.scale = { x: 1, y: 1, z: 1 };
    this.rotate = { x: 0, y: 0, z: 0 };
    this.eye = { x: 0, y: 0, z: 10 };
    this.center = { x: 0, y: 0, z: 0 };
    this.up = { x: 0, y: 1, z: 0 };
    this.projectionMatrix = mat4.create();
    this.modelMatrix = mat4.create();
    this.viewMatrix = mat4.create();
    this.viewProjectionMatrix = mat4.create();
    this.localMatrix = mat4.create();
    this.rm = mat4.create();
    mat4.identity(this.rm);
    mat4.identity(this.modelMatrix);
    mat4.identity(this.localMatrix);
  }

  // perspective Camera
  PerspectiveCamera(fov: number, aspect: number, near: number, far: number) {
    this.projectionType = "perspective";
    mat4.perspective(this.projectionMatrix, fov, aspect, near, far);
    this._updateViewProjection();
  }

  // Ortho Camera
  OrthographicCamera(aspect: number) {
    this.projectionType = "orthographic";
    const size = this.orthoSize;
    const left = -size * aspect;
    const right = size * aspect;
    const bottom = -size;
    const top = size;
    mat4.ortho(this.projectionMatrix, left, right, bottom, top, 0.1, 1000);
    this._updateViewProjection();
  }

  // Orbit camera
  OrbitCamera() {
    mat4.lookAt(
      this.viewMatrix,
      [this.eye.x, this.eye.y, this.eye.z],
      [this.center.x, this.center.y, this.center.z],
      [this.up.x, this.up.y, this.up.z]
    );
    this._updateViewProjection();
  }

  // translate
  updateTranslate() {
    mat4.translate(this.modelMatrix, this.modelMatrix, [
      this.translate[0] * 3,
      this.translate[1] * 3,
      this.translate[2] * 3,
    ]);
  }

  //  scale
  updateScale() {
    mat4.scale(this.modelMatrix, this.modelMatrix, [
      this.scale.x,
      this.scale.y,
      this.scale.z,
    ]);
  }

  // rotation
  ObjectRotation() {
    mat4.rotateX(this.modelMatrix, this.modelMatrix, this.rotate.x); // Use rotate.x instead of rotate[0]

    mat4.rotateY(this.modelMatrix, this.modelMatrix, this.rotate.y); // Use rotate.y instead of rotate[1]

    mat4.rotateZ(this.modelMatrix, this.modelMatrix, this.rotate.z); // Use rotate.z instead of rotate[2]
  }

  // Private helper to update view-projection matrix (optimization)
  _updateViewProjection() {
    mat4.multiply(
      this.viewProjectionMatrix,
      this.projectionMatrix,
      this.viewMatrix
    );
  }
}
