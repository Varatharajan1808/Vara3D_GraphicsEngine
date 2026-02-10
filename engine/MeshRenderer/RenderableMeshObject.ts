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
  visible: boolean = false;
  isSelected: boolean;
  isHovered: boolean = false;
  isActive: boolean = false;
  originalBoundingBox?: BoundingBox;
  boundingBox?: BoundingBox;
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
  updateBoundingBox(): void {
    if (!this.geometry || !this.geometry.Vertices) return;
    const worldMatrix = this.getWorldMatrix();
    const vertexCount = this.geometry.Vertices.length / 3;
    if (vertexCount === 0) return;
    const worldVertex = vec3.create();
    const vertex = vec3.create();

    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

    // Process all vertices
    for (let i = 0; i < vertexCount; i++) {
      vertex[0] = this.geometry.Vertices[i * 3];
      vertex[1] = this.geometry.Vertices[i * 3 + 1];
      vertex[2] = this.geometry.Vertices[i * 3 + 2];

      // Skip invalid vertices
      if (!isFinite(vertex[0]) || !isFinite(vertex[1]) || !isFinite(vertex[2])) continue;

      vec3.transformMat4(worldVertex, vertex, worldMatrix);

      // Update min/max bounds
      for (let j = 0; j < 3; j++) {
        if (isFinite(worldVertex[j])) {
          min[j] = Math.min(min[j], worldVertex[j]);
          max[j] = Math.max(max[j], worldVertex[j]);
        }
      }
    }

    // Ensure valid bounding box
    for (let i = 0; i < 3; i++) {
      if (!isFinite(min[i])) min[i] = 0;
      if (!isFinite(max[i])) max[i] = 0;

      // Prevent zero-size bounding box
      if (Math.abs(max[i] - min[i]) < 0.001) {
        const center = (min[i] + max[i]) * 0.5;
        min[i] = center - 0.001;
        max[i] = center + 0.001;
      }
    }

    this.boundingBox = { min, max };
  }
}
