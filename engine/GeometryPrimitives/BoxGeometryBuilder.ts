import { mat4 } from "../MathLibrary/gl-matrix";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export class BoxGeometryBuilder {
  uuid: string;
  type: string;
  Vertices: number[];
  Indices: number[];
  modelMatrix: any;

  constructor() {
    this.uuid = uuidv4();
    this.type = "Cube-Geometry";
    this.Vertices = [];
    this.Indices = [];
    this.modelMatrix = mat4.create();
  }

  CubeData(): {
    type: string;
    Vertices: number[];
    Indices: number[];
    Normals: number[];
    TextureCoordinates: number[];
    Tangents: number[];
  } {
    let Vertices: number[] = [
      // Front face
      -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
      // Back face
      -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0, -1.0, -1.0, -1.0,
      // Top face
      -1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0,
      // Bottom face
      1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, -1.0,
      // Right face
      1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0,
      // Left face
      -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, -1.0,
    ];

    let Indices: number[] = [
      // Front face
      0, 1, 2, 0, 2, 3,
      // Back face
      4, 5, 6, 4, 6, 7,
      // Top face
      8, 9, 10, 8, 10, 11,
      // Bottom face
      12, 13, 14, 12, 14, 15,
      // Right face
      16, 17, 18, 16, 18, 19,
      // Left face
      20, 21, 22, 20, 22, 23,
    ];

    const Normals = [
      // Front face
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      // Back face
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      // Top face
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
      // Bottom face
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      // Right face
      1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
      // Left face
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ];

    const TextureCoordinates = [
      // Front
      0, 0, 1, 0, 1, 1, 0, 1,
      // Back
      0, 0, 1, 0, 1, 1, 0, 1,
      // Top
      0, 0, 1, 0, 1, 1, 0, 1,
      // Bottom
      0, 0, 1, 0, 1, 1, 0, 1,
      // Right
      0, 0, 1, 0, 1, 1, 0, 1,
      // Left
      0, 0, 1, 0, 1, 1, 0, 1,
    ];

    const Tangents = [
      // Front
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
      // Back
      -1, 0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1,
      // Top
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
      // Bottom
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
      // Right
      0, 0, -1, 1, 0, 0, -1, 1, 0, 0, -1, 1, 0, 0, -1, 1,
      // Left
      0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1,
    ];

    return { type: this.type, Vertices, Indices, Normals, TextureCoordinates, Tangents };
  }
}
