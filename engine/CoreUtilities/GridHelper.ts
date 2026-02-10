import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export interface GeometryData {
  Vertices: Float32Array | number[];
  Indices: number[] | Uint16Array | null;
  type: string;
}

export class GridHelper {
  uuid: string;
  type: string;
  radius: number;
  size: number;
  spacing: number;
  grid: GeometryData;

  constructor(size: number, spacing: number = 3) {
    this.uuid = uuidv4();
    this.type = "Grid-Geometry";
    this.radius = 0;
    this.size = size;
    this.spacing = spacing;
    this.grid = this.createGrid();
  }

  createGrid(): GeometryData {
    const vertices: number[] = [];
    const gridSize = this.size;

    for (let i = -gridSize; i <= gridSize; i++) {
      vertices.push(i * this.spacing, 0.0, -gridSize * this.spacing);
      vertices.push(i * this.spacing, 0.0, gridSize * this.spacing);

      vertices.push(-gridSize * this.spacing, 0.0, i * this.spacing);
      vertices.push(gridSize * this.spacing, 0.0, i * this.spacing);
    }

    return { Vertices: vertices, Indices: null, type: this.type };
  }
}
