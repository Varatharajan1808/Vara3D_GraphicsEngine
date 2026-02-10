import { mat4 } from "../MathLibrary/gl-matrix";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export class CylinderGeometryBuilder {
  Vertices: number[];
  Indices: number[];
  Faces: number[][]; // Store faces as arrays of vertex indices
  uuid: string;
  type: string;
  radius: number;
  height: number;
  segments: number;
  modelMatrix: any;

  constructor(radius: number = 1, height: number = 2, segments: number = 32) {
    this.uuid = uuidv4();
    this.Vertices = [];
    this.Indices = [];
    this.Faces = [];
    this.radius = radius;
    this.type = "Cylinder-Geometry";
    this.height = height;
    this.segments = segments;
    this.modelMatrix = mat4.create();

    const cylinderData = this.CylinderData(
      this.radius,
      this.height,
      this.segments
    );
    this.Vertices = cylinderData.Vertices;
    this.Indices = cylinderData.Indices;
    this.Faces = cylinderData.Faces;
  }

  CylinderData(
    radius: number = 1,
    height: number = 2,
    segments: number = 32
  ): {
    type: string;
    Vertices: number[];
    Indices: number[];
    Faces: number[][];
    Normals: number[];
    Tangents: number[];
    TextureCoordinates: number[];
  } {
    const Vertices: number[] = [];
    const Normals: number[] = [];
    const Tangents: number[] = [];
    const TextureCoordinates: number[] = [];
    const Indices: number[] = [];
    const Faces: number[][] = [];

    // Generate vertices for top circle
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      Vertices.push(x, height / 2, z);
      Normals.push(0, 1, 0);
      Tangents.push(1, 0, 0);
      TextureCoordinates.push(
        0.5 + 0.5 * Math.cos(angle),
        0.5 + 0.5 * Math.sin(angle)
      );
    }

    // Generate vertices for bottom circle
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      Vertices.push(x, -height / 2, z);
      Normals.push(0, -1, 0);
      Tangents.push(1, 0, 0);
      TextureCoordinates.push(
        0.5 + 0.5 * Math.cos(angle),
        0.5 + 0.5 * Math.sin(angle)
      );
    }

    // Generate side vertices (separate from top/bottom to avoid shared vertices)
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      const tangentX = -Math.sin(angle);
      const tangentZ = Math.cos(angle);

      // Top side vertex
      Vertices.push(x, height / 2, z);
      Normals.push(nx, 0, nz);
      Tangents.push(tangentX, 0, tangentZ);
      TextureCoordinates.push(i / segments, 1);

      // Bottom side vertex
      Vertices.push(x, -height / 2, z);
      Normals.push(nx, 0, nz);
      Tangents.push(tangentX, 0, tangentZ);
      TextureCoordinates.push(i / segments, 0);
    }

    // TOP FACE - Single n-gon face
    const topFace = [];
    for (let i = 0; i < segments; i++) {
      topFace.push(i);
    }
    Faces.push(topFace);

    // BOTTOM FACE - Single n-gon face
    const bottomFace = [];
    for (let i = 0; i < segments; i++) {
      bottomFace.push(segments + i);
    }
    // Reverse order for correct winding
    bottomFace.reverse();
    Faces.push(bottomFace);

    // SIDE FACES - Each quad as a single face
    const sideStart = segments * 2;
    for (let i = 0; i < segments; i++) {
      const top1 = sideStart + i * 2;
      const bottom1 = sideStart + i * 2 + 1;
      const top2 = sideStart + ((i + 1) % segments) * 2;
      const bottom2 = sideStart + ((i + 1) % segments) * 2 + 1;

      // Quad face (4 vertices)
      Faces.push([top1, top2, bottom2, bottom1]);
    }

    // Convert faces to triangulated indices for rendering (if needed)
    for (const face of Faces) {
      if (face.length === 3) {
        // Triangle
        Indices.push(...face);
      } else if (face.length === 4) {
        // Quad -> 2 triangles
        Indices.push(face[0], face[1], face[2]);
        Indices.push(face[0], face[2], face[3]);
      } else {
        // N-gon -> triangle fan
        for (let i = 1; i < face.length - 1; i++) {
          Indices.push(face[0], face[i], face[i + 1]);
        }
      }
    }

    return {
      type: this.type,
      Vertices,
      Indices,
      Faces,
      Normals,
      Tangents,
      TextureCoordinates,
    };
  }
}
