import { mat4 } from "../MathLibrary/gl-matrix";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export class SphereGeometryBuilder {
  uuid: string;
  type: string;
  modelMatrix: any;

  constructor() {
    this.uuid = uuidv4();
    this.type = "Sphere-Geometry";
    this.modelMatrix = mat4.create();
  }

  SphereData(
    radius: number = 1,
    widthSegments: number = 32,
    heightSegments: number = 16,
    phiStart: number = 0,
    phiLength: number = Math.PI * 2,
    thetaStart: number = 0,
    thetaLength: number = Math.PI
  ) {
    const Vertices: number[] = [];
    const Normals: number[] = [];
    const Tangents: number[] = [];
    const TextureCoordinates: number[] = [];
    const Indices: number[] = [];

    const grid: number[][] = [];

    for (let iy = 0; iy <= heightSegments; iy++) {
      const row: number[] = [];
      const v = iy / heightSegments;
      const theta = thetaStart + v * thetaLength;

      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments;
        const phi = phiStart + u * phiLength;

        // Unit sphere direction
        const dx = -Math.cos(phi) * Math.sin(theta);
        const dy = Math.cos(theta);
        const dz = Math.sin(phi) * Math.sin(theta);

        // Position
        Vertices.push(dx * radius, dy * radius, dz * radius);

        // Normal (unit)
        Normals.push(dx, dy, dz);

        // UV
        TextureCoordinates.push(u, 1 - v);

        // Tangent (∂pos / ∂u)
        const tx = Math.sin(phi);
        const ty = 0;
        const tz = Math.cos(phi);
        const tLen = Math.sqrt(tx * tx + tz * tz) || 1;

        Tangents.push(tx / tLen, ty, tz / tLen, 1.0);

        row.push(Vertices.length / 3 - 1);
      }
      grid.push(row);
    }

    // Indices
    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];

        if (iy !== 0) Indices.push(a, b, d);
        if (iy !== heightSegments - 1) Indices.push(b, c, d);
      }
    }

    return {
      type: this.type,
      Vertices,
      Indices,
      Normals,
      Tangents,
      TextureCoordinates
    };
  }

}