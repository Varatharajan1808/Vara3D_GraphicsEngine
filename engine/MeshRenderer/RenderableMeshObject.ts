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
    const m = mat4.create();
    mat4.fromQuat(m, quaternion as any);
    const sinY = Math.max(-1, Math.min(1, m[8]));
    const y = Math.asin(sinY);
    let x: number, z: number;
    if (Math.abs(sinY) < 0.9999999) {
      x = Math.atan2(-m[9], m[10]);
      z = Math.atan2(-m[4], m[0]);
    } else {
      x = Math.atan2(m[6], m[5]);
      z = 0;
    }
    return { x, y, z };
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
    const vertices = this.vertices;
    if (!vertices || vertices.length === 0) return;

    if (!this.originalBoundingBox || this.geometryNeedsUpdate) {
      this.computeOriginalBoundingBox();
      this.geometryNeedsUpdate = false;
    }

    const worldMatrix = this.getWorldMatrix();
    const len = vertices.length;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    const m00 = worldMatrix[0], m01 = worldMatrix[1], m02 = worldMatrix[2];
    const m10 = worldMatrix[4], m11 = worldMatrix[5], m12 = worldMatrix[6];
    const m20 = worldMatrix[8], m21 = worldMatrix[9], m22 = worldMatrix[10];
    const m30 = worldMatrix[12], m31 = worldMatrix[13], m32 = worldMatrix[14];

    // For very high vertex counts (>60,000 vertices), stride keeps calculation < 1ms
    const stride = len > 180000 ? Math.ceil(len / 180000) * 3 : 3;

    for (let i = 0; i < len; i += stride) {
      const vx = vertices[i];
      const vy = vertices[i + 1];
      const vz = vertices[i + 2];
      if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) continue;

      const wx = m00 * vx + m10 * vy + m20 * vz + m30;
      const wy = m01 * vx + m11 * vy + m21 * vz + m31;
      const wz = m02 * vx + m12 * vy + m22 * vz + m32;

      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }

    if (!isFinite(minX)) {
      minX = -0.5; maxX = 0.5;
      minY = -0.5; maxY = 0.5;
      minZ = -0.5; maxZ = 0.5;
    }
    if (Math.abs(maxX - minX) < 0.001) { minX -= 0.001; maxX += 0.001; }
    if (Math.abs(maxY - minY) < 0.001) { minY -= 0.001; maxY += 0.001; }
    if (Math.abs(maxZ - minZ) < 0.001) { minZ -= 0.001; maxZ += 0.001; }

    this.boundingBox = {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };

    const center: [number, number, number] = [
      (minX + maxX) * 0.5,
      (minY + maxY) * 0.5,
      (minZ + maxZ) * 0.5,
    ];
    const radius = Math.hypot(
      maxX - center[0],
      maxY - center[1],
      maxZ - center[2]
    );
    this.boundingSphere = { center, radius };
  }

}
