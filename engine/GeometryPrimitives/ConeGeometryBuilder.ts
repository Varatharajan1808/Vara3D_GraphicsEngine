import { mat4 } from "../MathLibrary/gl-matrix";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export class ConeGeometryBuilder {
  uuid: string;
  type: string;
  modelMatrix: any;

  constructor() {
    this.uuid = uuidv4();
    this.type = "Cone-Geometry";
    this.modelMatrix = mat4.create();
  }
  ConeData(coneHeight: number, coneRadius: number, segments: number) {
    let Vertices: number[] = [];
    let Indices: number[] = [];
    let Normals: number[] = [];
    let TextureCoordinates: number[] = [];
    let Tangents: number[] = [];

    let anglePerSegment: number = (2 * Math.PI) / segments;

    // Apex vertex (top of the cone)
    Vertices.push(0.0, coneHeight / 2, 0.0); // Position (apex at the top)
    Normals.push(0.0, 1.0, 0.0); // Normal (facing up)
    TextureCoordinates.push(0.5, 1.0); // Texture coordinate (center top)
    Tangents.push(1.0, 0.0, 0.0); // Tangent (arbitrary, along X-axis)

    // Base center vertex
    let baseCenterIndex: number = segments + 1;
    Vertices.push(0.0, -coneHeight / 2, 0.0); // Base center
    Normals.push(0.0, -1.0, 0.0); // Normal facing down
    TextureCoordinates.push(0.5, 0.0); // Texture coordinate
    Tangents.push(1.0, 0.0, 0.0); // Arbitrary tangent

    // Base vertices
    for (let i = 0; i < segments; i++) {
      let angle: number = anglePerSegment * i;
      let x: number = coneRadius * Math.cos(angle);
      let z: number = coneRadius * Math.sin(angle);

      // Position (base at the bottom)
      Vertices.push(x, -coneHeight / 2, z);

      // Normal (sloped for the cone sides, pointing outward)
      let normalX: number = x / coneRadius;
      let normalZ: number = z / coneRadius;
      let normalY: number = -coneRadius / coneHeight;
      let normalLength: number = Math.sqrt(
        normalX * normalX + normalY * normalY + normalZ * normalZ
      );
      Normals.push(
        normalX / normalLength,
        normalY / normalLength,
        normalZ / normalLength
      );

      // Texture coordinates (wrapped around the cone)
      TextureCoordinates.push(i / segments, 0.0);

      // Tangent (perpendicular to the normal)
      Tangents.push(-z, 0.0, x);
    }

    // Indices for the cone sides (Triangle Fan from Apex)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      // Apex (0) -> perimeter[next] -> perimeter[i]
      // Perimeter vertices start at index 2
      Indices.push(0, next + 2, i + 2);
    }

    // Indices for the base (Triangle Fan from Base Center)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      // Base Center -> perimeter[i] -> perimeter[next]
      Indices.push(baseCenterIndex, i + 2, next + 2);
    }

    return {
      type: this.type,
      Vertices,
      Indices,
      Normals,
      Tangents,
      TextureCoordinates,
    };
  }
}
