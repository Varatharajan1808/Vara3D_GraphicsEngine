import { SceneNode, Vec3 } from "../SceneGraph/SceneNode";
import { TextureCoordinates } from "../GeometryPrimitives/UVCoordinateMapper";
import { NormalsData } from "../GeometryPrimitives/SurfaceNormalCalculator";
import { Tangents } from "../GeometryPrimitives/TangentSpaceCalculator";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import { mat4, vec3 } from "../MathLibrary/gl-matrix";

type Quaternion = [number, number, number, number];

interface MeshData {
  id?: string | number;
  translation?: [number, number, number];
  rotation?: Quaternion;
  scale?: [number, number, number];
  nodeIndex?: number;
}

interface BoundingBox {
  min: [number, number, number];
  max: [number, number, number];
}

export class RenderableMeshObject extends SceneNode {
  geometry: any;
  vertices: Float32Array | number[];
  indices: Uint16Array | number[];
  texCoord: Float32Array | number[] | null;
  tangent: Float32Array | number[] | null;
  normals: Float32Array | number[] | null;
  material: PBRMaterialProperties;
  geometryNeedsUpdate: boolean = true;
  needsUpdate?: boolean;
  texture: WebGLTexture | null;
  normalMap: WebGLTexture | null;
  textureURL: string | null;
  normalMapURL: string | null;
  image: HTMLImageElement | null;
  normalMapImage: HTMLImageElement | null;
  highlightedFace?: number[]; // Add this line
  highlightColor?: [number, number, number]; // Optional

  nodeIndex: number | null;
  axis?: string;
  isGizmoPart?: boolean;
  visible: boolean = true;
  isSelected: boolean;
  wireframeIndexBuffer?: WebGLBuffer | null;
  wireframeIndexCount?: number;
  selectedVertexIndex?: number;
  selectedEdgeVertices?: number[];
  hoveredVertexIndex?: number;
  hoveredEdgeVertices?: number[];
  isHovered: boolean = false;
  isActive: boolean = false;
  originalBoundingBox?: BoundingBox;
  boundingBox?: BoundingBox;
  boundingSphere?: { center: [number, number, number]; radius: number };
  isRing?: boolean;
  hoveredFace?: number[];
  hoverColor?: [number, number, number];
  additionalTransform?: Float32Array;

  constructor(
    geometry: any,
    material?: PBRMaterialProperties | null,
    texture?:
      | WebGLTexture
      | null
      | { texture: WebGLTexture; textureUrl?: string },
    normalMap?:
      | WebGLTexture
      | null
      | { normalMap: WebGLTexture; normalMapUrl?: string },
    imageUri?: HTMLImageElement | null,
    normalMapUri?: HTMLImageElement | null,
    meshData: MeshData = {}
  ) {
    super(geometry.type || "Mesh");
    this.geometry = geometry;
    const { Vertices, Indices, type } = geometry;
    this.vertices = Vertices;
    this.indices = Indices;
    this.type = type || "Mesh";

    this.texCoord = geometry.TextureCoordinates ?? TextureCoordinates ?? null;
    this.tangent = geometry.Tangents ?? Tangents ?? null;
    this.normals = geometry.Normals ?? NormalsData ?? null;
    this.material = material ?? new PBRMaterialProperties();

    this.texture = (texture as any)?.texture ?? texture ?? null;
    this.normalMap = (normalMap as any)?.normalMap ?? normalMap ?? null;
    // Handle both textureUrl and textureURL property names
    this.textureURL = (texture as any)?.textureUrl ?? (texture as any)?.textureURL ?? null;
    this.normalMapURL = (normalMap as any)?.normalMapUrl ?? (normalMap as any)?.normalMapURL ?? null;
    this.image = imageUri ?? null;
    this.normalMapImage = normalMapUri ?? null;
    this.isSelected = false;

    if (meshData.translation) {
      this.position = {
        x: meshData.translation[0],
        y: meshData.translation[1],
        z: meshData.translation[2],
      };
    }
    if (meshData.scale) {
      this.scale = {
        x: meshData.scale[0],
        y: meshData.scale[1],
        z: meshData.scale[2]
      };
    }
    if (meshData.rotation) {
      this.rotate = this.quaternionToEuler(meshData.rotation);
    }

    this.nodeIndex = meshData.nodeIndex || null;
    this.computeOriginalBoundingBox();
    this.updateLocalMatrix();
  }

  quaternionToEuler(quaternion: Quaternion): Vec3 {
    const [x, y, z, w] = quaternion;
    return {
      x: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
      y: Math.asin(2 * (w * y - z * x)),
      z: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
    };
  }

  updateLocalMatrix(): void {
    super.updateLocalMatrix();
    if (this.additionalTransform) {
      mat4.multiply(
        this.localMatrix,
        this.localMatrix,
        this.additionalTransform
      );
      this.updateWorldMatrix();
    }
    this.updateBoundingBox();
  }

  updateWorldMatrix(): void {
    super.updateWorldMatrix();
    this.updateBoundingBox();
  }

  updateTranslate(deltaX = 0, deltaY = 0, deltaZ = 0): void {
    super.updateTranslate(deltaX, deltaY, deltaZ);
  }

  updateScale(
    scaleX: number | null = null,
    scaleY: number | null = null,
    scaleZ: number | null = null
  ): void {
    if (scaleX !== null) this.scale.x = scaleX;
    if (scaleY !== null) this.scale.y = scaleY;
    if (scaleZ !== null) this.scale.z = scaleZ;
    this.updateLocalMatrix();
  }

  ObjectRotation(): void {
    this.updateLocalMatrix();
  }

  computeOriginalBoundingBox(): void {
    const vertices = this.vertices;
    if (!vertices || vertices.length === 0) return;

    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const len = vertices.length;

    for (let i = 0; i < len; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }

    // Ensure valid non-degenerate box
    for (let i = 0; i < 3; i++) {
      if (!isFinite(min[i])) min[i] = -0.5;
      if (!isFinite(max[i])) max[i] = 0.5;
      if (Math.abs(max[i] - min[i]) < 0.001) {
        min[i] -= 0.001;
        max[i] += 0.001;
      }
    }

    this.originalBoundingBox = { min, max };
  }

  updateBoundingBox(): void {
    if (!this.vertices || this.vertices.length === 0) return;

    if (!this.originalBoundingBox || this.geometryNeedsUpdate) {
      this.computeOriginalBoundingBox();
    }
    if (!this.originalBoundingBox) return;

    const worldMatrix = this.getWorldMatrix();
    const lMin = this.originalBoundingBox.min;
    const lMax = this.originalBoundingBox.max;

    // 8 corners of the local bounding box transformed by world matrix
    const corners = [
      vec3.fromValues(lMin[0], lMin[1], lMin[2]),
      vec3.fromValues(lMax[0], lMin[1], lMin[2]),
      vec3.fromValues(lMin[0], lMax[1], lMin[2]),
      vec3.fromValues(lMax[0], lMax[1], lMin[2]),
      vec3.fromValues(lMin[0], lMin[1], lMax[2]),
      vec3.fromValues(lMax[0], lMin[1], lMax[2]),
      vec3.fromValues(lMin[0], lMax[1], lMax[2]),
      vec3.fromValues(lMax[0], lMax[1], lMax[2]),
    ];

    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const transformed = vec3.create();

    for (let i = 0; i < 8; i++) {
      vec3.transformMat4(transformed, corners[i], worldMatrix);
      min[0] = Math.min(min[0], transformed[0]);
      min[1] = Math.min(min[1], transformed[1]);
      min[2] = Math.min(min[2], transformed[2]);
      max[0] = Math.max(max[0], transformed[0]);
      max[1] = Math.max(max[1], transformed[1]);
      max[2] = Math.max(max[2], transformed[2]);
    }

    this.boundingBox = { min, max };

    const center: [number, number, number] = [
      (min[0] + max[0]) * 0.5,
      (min[1] + max[1]) * 0.5,
      (min[2] + max[2]) * 0.5,
    ];
    const radius = Math.hypot(
      max[0] - center[0],
      max[1] - center[1],
      max[2] - center[2]
    );
    this.boundingSphere = { center, radius };
  }
}
