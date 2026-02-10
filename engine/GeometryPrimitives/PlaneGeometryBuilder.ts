import { mat4 } from "../MathLibrary/gl-matrix";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export class PlaneGeometryBuilder {
  uuid: string;
  type: string;
  modelMatrix: any;
  constructor() {
    this.uuid = uuidv4();
    this.type = "Plane-Geometry";
    this.modelMatrix = mat4.create();
  }

  PlaneData(): {
    type: string;
    Vertices: number[];
    Indices: number[];
    Normals: number[];
    TextureCoordinates: number[];
    Tangents: number[];
  } {
    const Vertices = [
      -2.0, 0.0, 2.0,  // Vertex 0
      2.0, 0.0, 2.0,  // Vertex 1
      2.0, 0.0, -2.0, // Vertex 2
      -2.0, 0.0, -2.0, // Vertex 3
    ];

    const Indices = [
      0, 1, 2, // First Triangle
      0, 2, 3, // Second Triangle
    ];

    const Normals = [
      0.0, 1.0, 0.0,
      0.0, 1.0, 0.0,
      0.0, 1.0, 0.0,
      0.0, 1.0, 0.0,
    ];

    const TextureCoordinates = [
      0.0, 0.0,
      1.0, 0.0,
      1.0, 1.0,
      0.0, 1.0,
    ];

    const Tangents = [
      1.0, 0.0, 0.0, 1.0,
      1.0, 0.0, 0.0, 1.0,
      1.0, 0.0, 0.0, 1.0,
      1.0, 0.0, 0.0, 1.0,
    ];

    return { type: this.type, Vertices, Indices, Normals, TextureCoordinates, Tangents };
  }
}
