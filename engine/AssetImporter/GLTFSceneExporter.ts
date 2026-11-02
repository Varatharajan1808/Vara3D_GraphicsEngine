import { mat4, vec3, vec4, quat } from "../MathLibrary/gl-matrix";
import { TextureCoordinates } from "../GeometryPrimitives/UVCoordinateMapper";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import { SceneNode } from "../SceneGraph/SceneNode";
import { LightNode } from "../LightingEngine/LightNode";
import { TextureAssetLoader } from "../CoreUtilities/TextureAssetLoader";

// ======================
// Type Definitions
// ======================

interface Vec3 {
  x?: number;
  y?: number;
  z?: number;
}

interface Vec4 {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
}

interface Transform {
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

interface Image {
  mimeType: string;
  uri: string;
}

interface Sampler {
  magFilter: number;
  minFilter: number;
  wrapS: number;
  wrapT: number;
}

interface Texture {
  sampler: number;
  source: number;
  name?: string;
}

interface Material {
  pbrMetallicRoughness: {
    metallicFactor: number;
    roughnessFactor: number;
    baseColorTexture?: { index: number; texCoord: number };
    baseColorFactor?: number[];
  };
  normalTexture?: { index: number; texCoord: number };
  doubleSided: boolean;
  extensions: {
    KHR_materials_specular: { specularFactor: number };
    KHR_materials_emissive_strength: { emissiveStrength: number };
  };
  extras?: { varaEditorSpecular?: number };
  alphaMode: "OPAQUE" | "BLEND";
  alphaCutoff: number;
  emissiveFactor: number[];
}

interface Accessor {
  bufferView: number;
  componentType: number; // 5126 = FLOAT, 5123 = UNSIGNED_SHORT
  count: number;
  type: "VEC3" | "VEC2" | "VEC4" | "SCALAR";
  min?: number[];
  max?: number[];
}

interface BufferView {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  target: number; // 34962 = ARRAY_BUFFER, 34963 = ELEMENT_ARRAY_BUFFER
}

interface Primitive {
  attributes: {
    POSITION: number;
    NORMAL?: number;
    TEXCOORD_0?: number;
    TANGENT?: number;
  };
  indices: number;
  material: number;
  mode: number; // GL_TRIANGLES = 4
}

interface GLTFMesh {
  name: string;
  primitives: Primitive[];
}

interface Node {
  mesh: number;
  name: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
}

interface GLTFLight {
  type: "directional";
  color: number[];
  intensity: number;
}

interface KHR_lights_punctual {
  lights: GLTFLight[];
}

interface GLTF {
  asset: {
    version: string;
    generator: string;
  };
  scene: number;
  scenes: { name: string; nodes: number[] }[];
  nodes: Node[];
  meshes: GLTFMesh[];
  accessors: Accessor[];
  bufferViews: BufferView[];
  buffers: {
    byteLength: number;
    uri: string;
  }[];
  materials: Material[];
  textures: Texture[];
  samplers: Sampler[];
  images: Image[];
  extensionsUsed: string[];
  extensions: {
    KHR_lights_punctual: KHR_lights_punctual;
  };
}

interface GltfIndex {
  position: number;
  normal?: number;
  texCoord?: number;
  tangent?: number;
  indices: number;
  material: number;
}

// ======================
// GLTFExporter Class
// ======================

export class GLTFSceneExporter {
  private positionAccessorIndex: number | undefined;
  private normalAccessorIndex: number | undefined;
  private texCoordAccessorIndex: number | undefined;
  private tangentAccessorIndex: number | undefined;
  private indexAccessorIndex: number | undefined;
  private baseColorTextureIndex: number | undefined;
  private normalMapTextureIndex: number | undefined;
  private materialIndex: number | undefined;

  private meshes: any[] = [];
  private bufferViews: BufferView[] = [];
  private accessors: Accessor[] = [];
  private bufferData: Uint8Array | null = null;
  private images: Image[] = [];
  private samplers: Sampler[] = [];
  private textureData: Texture[] = [];
  private materials: Material[] = [];

  private positionMin: number[] = [Infinity, Infinity, Infinity];
  private positionMax: number[] = [-Infinity, -Infinity, -Infinity];

  private byteOffset: number = 0;

  private textureMap: Map<string, number> = new Map();
  private normalMapTextureMap: Map<string, number> = new Map();

  constructor() {
    this.resetState();
  }

  resetState(): void {
    this.positionAccessorIndex = undefined;
    this.normalAccessorIndex = undefined;
    this.texCoordAccessorIndex = undefined;
    this.tangentAccessorIndex = undefined;
    this.indexAccessorIndex = undefined;
    this.baseColorTextureIndex = undefined;
    this.normalMapTextureIndex = undefined;
    this.materialIndex = undefined;

    this.meshes = [];
    this.bufferViews = [];
    this.accessors = [];
    this.bufferData = null;
    this.images = [];
    this.samplers = [];
    this.textureData = [];
    this.materials = [];

    this.positionMin = [Infinity, Infinity, Infinity];
    this.positionMax = [-Infinity, -Infinity, -Infinity];

    this.byteOffset = 0;

    this.textureMap.clear();
    this.normalMapTextureMap.clear();
  }

  async generateGLTF(allNodes: any[]): Promise<GLTF> {
    this.resetState();

    // Separate mesh nodes from group nodes
    const meshNodes = allNodes.filter(n => n.isMesh);

    const estimatedSize = this.estimateBufferSize(meshNodes);
    this.bufferData = new Uint8Array(estimatedSize);

    for (const mesh of meshNodes) {
      // Reset per-mesh bounding box
      this.positionMin = [Infinity, Infinity, Infinity];
      this.positionMax = [-Infinity, -Infinity, -Infinity];
      await this.processMesh(mesh);
    }

    return this.generateFinalGLTFStructure(allNodes, meshNodes);
  }

  private estimateBufferSize(meshes: any[]): number {
    let totalSize = 0;
    for (const mesh of meshes) {
      const vertLen = mesh.vertices?.length ?? 0;
      totalSize += vertLen * 4; // Float32 positions
      // Normals always written (live or generated) at vertex length
      totalSize += vertLen * 4;
      // UVs always written (matching vertex count) for textured round-trip
      totalSize += (vertLen / 3) * 2 * 4;
      totalSize += (mesh.indices?.length ?? 0) * 2; // Uint16
      totalSize += 4; // padding to 4-byte align after indices
    }
    return totalSize;
  }

  private async processMesh(mesh: any): Promise<void> {
    this.positionAccessorIndex = undefined;
    this.normalAccessorIndex = undefined;
    this.texCoordAccessorIndex = undefined;
    this.tangentAccessorIndex = undefined;
    this.indexAccessorIndex = undefined;

    this.processPositions(mesh);
    this.processNormals(mesh);
    // this.processTangents(mesh);
    this.processTexCoords(mesh);
    this.processIndices(mesh);
    this.alignByteOffset(4); // next mesh floats need 4-byte aligned offset
    await this.processTextures(mesh);
    this.processMaterial(mesh);
    this.storeMeshInfo(mesh);
  }

  /**
   * Embed texture sources as real data URIs (never wrap a file path as fake base64).
   */
  private async resolveImageToDataURL(
    source: string | HTMLImageElement
  ): Promise<{ uri: string; mimeType: string } | null> {
    if (typeof source === "string") {
      if (source.startsWith("data:")) {
        const semi = source.indexOf(";");
        const mimeType =
          semi > 5 ? source.slice(5, semi) : "image/png";
        return { uri: source, mimeType };
      }
      try {
        const res = await fetch(source);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const uri = await TextureAssetLoader.blobToDataURL(blob);
        return { uri, mimeType: blob.type || "image/png" };
      } catch (err) {
        console.warn("[GLTFSceneExporter] Failed to embed texture:", source, err);
        return null;
      }
    }

    if (source instanceof HTMLImageElement) {
      if (source.src?.startsWith("data:")) {
        const semi = source.src.indexOf(";");
        const mimeType =
          semi > 5 ? source.src.slice(5, semi) : "image/png";
        return { uri: source.src, mimeType };
      }
      if (source.src) {
        return this.resolveImageToDataURL(source.src);
      }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = source.naturalWidth || source.width || 1;
        canvas.height = source.naturalHeight || source.height || 1;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(source, 0, 0);
        const uri = canvas.toDataURL("image/png");
        return { uri, mimeType: "image/png" };
      } catch (err) {
        console.warn("[GLTFSceneExporter] Canvas encode failed:", err);
        return null;
      }
    }

    return null;
  }

  private processPositions(mesh: any): Float32Array | null {
    if (!mesh.vertices || mesh.vertices.length === 0) {
      console.warn(`Mesh ${mesh.name} has no position data!`);
      return null;
    }

    const positionBuffer = new Float32Array(mesh.vertices);

    for (let i = 0; i < positionBuffer.length; i += 3) {
      const x = positionBuffer[i];
      const y = positionBuffer[i + 1];
      const z = positionBuffer[i + 2];

      this.positionMin[0] = Math.min(this.positionMin[0], x);
      this.positionMin[1] = Math.min(this.positionMin[1], y);
      this.positionMin[2] = Math.min(this.positionMin[2], z);

      this.positionMax[0] = Math.max(this.positionMax[0], x);
      this.positionMax[1] = Math.max(this.positionMax[1], y);
      this.positionMax[2] = Math.max(this.positionMax[2], z);
    }

    this.positionAccessorIndex = this.accessors.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: positionBuffer.byteLength,
      target: 34962, // ARRAY_BUFFER
    });

    this.accessors.push({
      bufferView: this.bufferViews.length - 1,
      componentType: 5126, // FLOAT
      count: positionBuffer.length / 3,
      type: "VEC3",
      min: [...this.positionMin],
      max: [...this.positionMax],
    });

    this.copyToBuffer(positionBuffer);
    return positionBuffer;
  }

  private processNormals(mesh: any): void {
    const vertCount = mesh.vertices?.length ?? 0;
    if (vertCount <= 0) return;

    // Always rebuild from positions+indices for every primitive shape.
    const normalBuffer = this.generateNormalsFromMesh(mesh);
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: normalBuffer.byteLength,
      target: 34962,
    });

    this.normalAccessorIndex = this.accessors.length;
    this.accessors.push({
      bufferView: this.bufferViews.length - 1,
      componentType: 5126,
      count: normalBuffer.length / 3,
      type: "VEC3",
    });

    this.copyToBuffer(normalBuffer);
  }

  /** Smooth face normals from positions + indices. */
  private generateNormalsFromMesh(mesh: any): Float32Array {
    const positions = new Float32Array(mesh.vertices);
    const normals = new Float32Array(positions.length);
    const indices = mesh.indices;

    if (indices && indices.length >= 3) {
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const i0 = indices[i] * 3;
        const i1 = indices[i + 1] * 3;
        const i2 = indices[i + 2] * 3;

        const ax = positions[i1] - positions[i0];
        const ay = positions[i1 + 1] - positions[i0 + 1];
        const az = positions[i1 + 2] - positions[i0 + 2];
        const bx = positions[i2] - positions[i0];
        const by = positions[i2 + 1] - positions[i0 + 1];
        const bz = positions[i2 + 2] - positions[i0 + 2];

        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-5) {
          nx /= len;
          ny /= len;
          nz /= len;
        }

        for (const base of [i0, i1, i2]) {
          normals[base] += nx;
          normals[base + 1] += ny;
          normals[base + 2] += nz;
        }
      }

      for (let i = 0; i < normals.length; i += 3) {
        const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
        if (len > 1e-5) {
          normals[i] /= len;
          normals[i + 1] /= len;
          normals[i + 2] /= len;
        } else {
          normals[i + 1] = 1;
        }
      }
    } else {
      for (let i = 0; i + 8 < positions.length; i += 9) {
        const ax = positions[i + 3] - positions[i];
        const ay = positions[i + 4] - positions[i + 1];
        const az = positions[i + 5] - positions[i + 2];
        const bx = positions[i + 6] - positions[i];
        const by = positions[i + 7] - positions[i + 1];
        const bz = positions[i + 8] - positions[i + 2];

        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-5) {
          nx /= len;
          ny /= len;
          nz /= len;
        } else {
          ny = 1;
        }

        for (let v = 0; v < 3; v++) {
          normals[i + v * 3] = nx;
          normals[i + v * 3 + 1] = ny;
          normals[i + v * 3 + 2] = nz;
        }
      }
    }

    return normals;
  }

  private processTexCoords(mesh: any): void {
    this.texCoordAccessorIndex = undefined;
    const vertCount = (mesh.vertices?.length ?? 0) / 3;
    if (vertCount <= 0) return;

    const expectedUvFloats = vertCount * 2;
    let texCoordData: ArrayLike<number> | null = mesh.texCoords ?? null;

    // Empty typed/plain arrays are truthy — only accept matching UV length
    if (
      !texCoordData ||
      (texCoordData as any).length === 0 ||
      (texCoordData as any).length !== expectedUvFloats
    ) {
      if (
        TextureCoordinates.length === expectedUvFloats
      ) {
        texCoordData = TextureCoordinates;
      } else {
        texCoordData = this.generatePlanarUVs(mesh.vertices);
      }
    }

    // Always emit UVs so textured re-import keeps lighting-friendly albedo sampling
    const texcoordBuffer = new Float32Array(texCoordData);
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: texcoordBuffer.byteLength,
      target: 34962,
    });

    this.texCoordAccessorIndex = this.accessors.length;
    this.accessors.push({
      bufferView: this.bufferViews.length - 1,
      componentType: 5126,
      count: texcoordBuffer.length / 2,
      type: "VEC2",
    });

    this.copyToBuffer(texcoordBuffer);
  }

  /** Planar UVs from XZ bounds (export/import fallback when UVs missing/mismatched). */
  private generatePlanarUVs(vertices: ArrayLike<number>): Float32Array {
    const uvs = new Float32Array((vertices.length / 3) * 2);
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const sx = maxX - minX || 1;
    const sz = maxZ - minZ || 1;
    for (let i = 0, u = 0; i < vertices.length; i += 3, u += 2) {
      uvs[u] = (vertices[i] - minX) / sx;
      uvs[u + 1] = (vertices[i + 2] - minZ) / sz;
    }
    return uvs;
  }

  private processIndices(mesh: any): void {
    if (!mesh.indices || mesh.indices.length === 0) return;

    let maxIndex = 0;
    for (let i = 0; i < mesh.indices.length; i++) {
      if (mesh.indices[i] > maxIndex) maxIndex = mesh.indices[i];
    }
    const useUint32 = maxIndex > 65535;
    const indexBuffer = useUint32
      ? new Uint32Array(mesh.indices)
      : new Uint16Array(mesh.indices);

    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: indexBuffer.byteLength,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });

    this.indexAccessorIndex = this.accessors.length;
    this.accessors.push({
      bufferView: this.bufferViews.length - 1,
      componentType: useUint32 ? 5125 : 5123, // UINT / USHORT
      count: mesh.indices.length,
      type: "SCALAR",
    });

    this.copyToBuffer(indexBuffer);
  }

  /** Pad so the next bufferView (usually FLOAT attrs) starts 4-byte aligned. */
  private alignByteOffset(alignment: number = 4): void {
    const rem = this.byteOffset % alignment;
    if (rem === 0) return;
    const pad = alignment - rem;
    if (this.bufferData) {
      for (let i = 0; i < pad; i++) {
        this.bufferData[this.byteOffset + i] = 0;
      }
    }
    this.byteOffset += pad;
  }

  private copyToBuffer(sourceArray: ArrayBufferView): void {
    const sourceBytes = new Uint8Array(
      sourceArray.buffer,
      sourceArray.byteOffset,
      sourceArray.byteLength
    );
    this.bufferData!.set(sourceBytes, this.byteOffset);
    this.byteOffset += sourceArray.byteLength;
  }

  private async processTextures(mesh: any): Promise<void> {
    this.baseColorTextureIndex = undefined;
    this.normalMapTextureIndex = undefined;

    // Use textureURL as primary source, then image
    const baseImage = mesh.textureURL || mesh.image;

    if (baseImage) {
      const textureKey =
        typeof baseImage === "string"
          ? baseImage
          : `img_${(baseImage as HTMLImageElement).src || "element"}`;

      if (!this.textureMap.has(textureKey)) {
        const resolved = await this.resolveImageToDataURL(baseImage);
        if (resolved) {
          this.baseColorTextureIndex = this.textureData.length;
          this.images.push({
            mimeType: resolved.mimeType,
            uri: resolved.uri,
          });
          this.samplers.push({
            magFilter: 9729,
            minFilter: 9987,
            wrapS: 10497,
            wrapT: 10497,
          });
          this.textureData.push({
            sampler: this.samplers.length - 1,
            source: this.images.length - 1,
            name: mesh.name,
          });
          this.textureMap.set(textureKey, this.baseColorTextureIndex);
        }
      } else {
        this.baseColorTextureIndex = this.textureMap.get(textureKey)!;
      }
    }

    const normalImage = mesh.normalMapURL || mesh.normalMapImage;

    if (normalImage) {
      const normalMapKey =
        typeof normalImage === "string"
          ? `n:${normalImage}`
          : `n:img_${(normalImage as HTMLImageElement).src || "element"}`;

      if (!this.normalMapTextureMap.has(normalMapKey)) {
        const resolved = await this.resolveImageToDataURL(normalImage);
        if (resolved) {
          this.normalMapTextureIndex = this.textureData.length;
          this.images.push({
            mimeType: resolved.mimeType,
            uri: resolved.uri,
          });
          this.samplers.push({
            magFilter: 9729,
            minFilter: 9987,
            wrapS: 10497,
            wrapT: 10497,
          });
          this.textureData.push({
            sampler: this.samplers.length - 1,
            source: this.images.length - 1,
            name: `${mesh.name}_NormalMap`,
          });
          this.normalMapTextureMap.set(normalMapKey, this.normalMapTextureIndex);
        }
      } else {
        this.normalMapTextureIndex =
          this.normalMapTextureMap.get(normalMapKey)!;
      }
    }
  }

  private processMaterial(mesh: any): void {
    this.materialIndex = this.materials.length;

    const baseColorFactor =
      this.baseColorTextureIndex === undefined
        ? Array.isArray(mesh.color)
          ? mesh.color.length === 4
            ? mesh.color
            : [...mesh.color, mesh.alpha ?? 1.0]
          : [1, 1, 1, 1]
        : undefined;

    // Editor specular is a shininess-like scale (~16); glTF KHR specularFactor is 0–1.
    const editorSpecular = mesh.specular ?? 16.0;
    const khrSpecular =
      editorSpecular > 1
        ? Math.min(1, Math.max(0, editorSpecular / 64))
        : Math.min(1, Math.max(0, editorSpecular));

    const material: Material = {
      pbrMetallicRoughness: {
        metallicFactor: mesh.metallic ?? 0.5,
        roughnessFactor: mesh.roughness ?? 0.5,
        baseColorTexture:
          this.baseColorTextureIndex !== undefined
            ? {
              index: this.baseColorTextureIndex,
              texCoord: 0,
            }
            : undefined,
        baseColorFactor,
      },
      normalTexture:
        this.normalMapTextureIndex !== undefined
          ? {
            index: this.normalMapTextureIndex,
            texCoord: 0,
          }
          : undefined,
      doubleSided: true,
      extensions: {
        KHR_materials_specular: {
          specularFactor: khrSpecular,
        },
        KHR_materials_emissive_strength: {
          emissiveStrength: mesh.emissionIntensity ?? 0.0,
        },
      },
      // Round-trip editor shininess without corrupting KHR factor
      extras: {
        varaEditorSpecular: editorSpecular,
      },
      alphaMode: (mesh.alpha ?? 1.0) < 1.0 ? "BLEND" : "OPAQUE",
      alphaCutoff: mesh.alpha ?? 1.0,
      emissiveFactor: mesh.emissionColor ?? [0.0, 0.0, 0.0],
    };

    this.materials.push(material);
  }

  private storeMeshInfo(mesh: any): void {
    (mesh as any).gltfIndex = {
      position: this.positionAccessorIndex,
      normal: this.normalAccessorIndex,
      texCoord: this.texCoordAccessorIndex,
      tangent: this.tangentAccessorIndex,
      indices: this.indexAccessorIndex,
      material: this.materialIndex,
    } as GltfIndex;
  }

  private generateFinalGLTFStructure(allNodes: any[], meshNodes: any[]): GLTF {
    // Encode only the used byte range (avoids trailing junk; keeps accessor offsets valid)
    const used = Math.max(this.byteOffset, 0);
    const slice = this.bufferData!.subarray(0, used);
    const packed = new Uint8Array(used);
    packed.set(slice);
    const base64Buffer = this.bufferToBase64(packed.buffer);

    const meshesGLTF: GLTFMesh[] = meshNodes.map((mesh) => ({
      name: mesh.name,
      primitives: [
        {
          attributes: {
            POSITION: mesh.gltfIndex.position,
            ...(mesh.gltfIndex.normal !== undefined && {
              NORMAL: mesh.gltfIndex.normal,
            }),
            ...(mesh.gltfIndex.texCoord !== undefined && {
              TEXCOORD_0: mesh.gltfIndex.texCoord,
            }),
            ...(mesh.gltfIndex.tangent !== undefined && {
              TANGENT: mesh.gltfIndex.tangent,
            }),
          },
          indices: mesh.gltfIndex.indices,
          material: mesh.gltfIndex.material,
          mode: 4, // GL_TRIANGLES
        },
      ],
    }));

    const { nodes, rootNodes } = this.createNodes(allNodes, meshNodes);

    return {
      asset: { version: "2.0", generator: "WebGL Exporter" },
      scene: 0,
      scenes: [{ name: "Scene", nodes: rootNodes }],
      nodes,
      meshes: meshesGLTF,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [
        {
          byteLength: used,
          uri: `data:application/octet-stream;base64,${base64Buffer}`,
        },
      ],
      materials: this.materials,
      textures: this.textureData,
      samplers: this.samplers,
      images: this.images,
      extensionsUsed: [
        "KHR_lights_punctual",
        "KHR_materials_specular",
        "KHR_materials_emissive_strength",
      ],
      extensions: {
        KHR_lights_punctual: {
          lights: [{ type: "directional", color: [1, 1, 1], intensity: 1.0 }],
        },
      },
    };
  }

  private createNodes(allNodes: any[], meshNodes: any[]): { nodes: Node[]; rootNodes: number[] } {
    const nodes: Node[] = [];
    const nodeIndexMap = new Map<string, number>(); // uuid -> gltf node index
    const meshIndexMap = new Map<string, number>(); // uuid -> gltf mesh index
    const rootNodes: number[] = [];

    // Build mesh index map (only mesh nodes get a mesh index)
    meshNodes.forEach((mesh, idx) => {
      meshIndexMap.set(mesh.uuid, idx);
    });

    this.computeRelativeTransforms(allNodes);

    // Create GLTF nodes for ALL nodes (mesh + group)
    for (let i = 0; i < allNodes.length; i++) {
      const obj = allNodes[i];
      const node: Node = {
        mesh: meshIndexMap.has(obj.uuid) ? meshIndexMap.get(obj.uuid)! : -1,
        name: obj.name,
      };

      // Remove mesh field for group nodes
      if (!meshIndexMap.has(obj.uuid)) {
        delete (node as any).mesh;
      }

      if (obj.relativeTransform) {
        if (obj.relativeTransform.translation)
          node.translation = obj.relativeTransform.translation;
        if (obj.relativeTransform.rotation)
          node.rotation = obj.relativeTransform.rotation;
        if (obj.relativeTransform.scale)
          node.scale = obj.relativeTransform.scale;
      }

      nodeIndexMap.set(obj.uuid, i);
      nodes.push(node);

      if (!obj.parent) {
        rootNodes.push(i);
      }
    }

    // Set up children references
    for (let i = 0; i < allNodes.length; i++) {
      const obj = allNodes[i];
      if (obj.parent && nodeIndexMap.has(obj.parent.uuid)) {
        const parentIndex = nodeIndexMap.get(obj.parent.uuid)!;
        if (!nodes[parentIndex].children) {
          nodes[parentIndex].children = [];
        }
        nodes[parentIndex].children!.push(i);
      }
    }

    return { nodes, rootNodes };
  }

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 65536;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return btoa(binary);
  }

  private computeRelativeTransforms(allNodes: any[]): void {
    const nodeMap = new Map(allNodes.map((n: any) => [n.uuid, n]));

    for (const node of allNodes) {
      if (node.parent && nodeMap.has(node.parent.uuid)) {
        // Node has a parent exported in the GLTF tree.
        // In SceneNode, node.localMatrix is already strictly relative to its parent!
        node.relativeTransform = this.decomposeMatrix(node.localMatrix);
      } else {
        // Root node in export (no parent, or parent was excluded from export).
        // Use worldMatrix if available so that world-space position/orientation is preserved.
        const matrix =
          node.worldMatrix && node.worldMatrix.length === 16
            ? node.worldMatrix
            : node.localMatrix;
        node.relativeTransform = this.decomposeMatrix(matrix);
      }
    }
  }

  private decomposeMatrix(matrix: number[] | null | undefined): Transform {
    if (!matrix || matrix.length === 0) {
      return {
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      };
    }

    const translation = vec3.create();
    const rotation = vec4.create(); // gl-matrix quat is vec4
    const scale = vec3.create();

    mat4.getTranslation(translation, matrix as any);
    mat4.getRotation(rotation, matrix as any);
    mat4.getScaling(scale, matrix as any);
    quat.normalize(rotation as any, rotation as any);

    return {
      translation: Array.from(translation),
      rotation: Array.from(rotation),
      scale: Array.from(scale),
    };
  }

  exportSceneToGLTF(scene: any): any[] {
    const allNodes: any[] = [];
    const nodeMap = new Map<string, any>();

    // Recursively collect all nodes from the scene tree
    const collectNode = (node: any) => {
      // Skip gizmo parts and grid geometry
      const isGizmo = node.isGizmoPart ||
        (node.type && node.type.startsWith('Gizmo-')) ||
        (node.name && node.name.startsWith('Gizmo'));
      if (isGizmo || node.type === "Grid-Geometry" || node instanceof LightNode) return;

      if (node instanceof RenderableMeshObject && node.geometry) {
        const materialData = node.material ?? {};
        const geometryData = node.geometry;

        const meshObject = {
          uuid: node.uuid,
          name: node.name || node.type || "Mesh",
          isMesh: true,
          // Live buffers only — same for cube/sphere/plane/cone/cylinder/GLTF
          vertices: (node.vertices ?? geometryData.Vertices) ?? [],
          normals: (node.normals ?? geometryData.Normals) ?? [],
          texCoords: (node.texCoord ?? geometryData.TextureCoordinates) ?? [],
          tangents: (node.tangent ?? geometryData.Tangents) ?? [],
          indices: (node.indices ?? geometryData.Indices) ?? [],
          color: materialData.color ?? [1, 1, 1],
          metallic: materialData.metallic ?? 0.5,
          roughness: materialData.roughness ?? 0.5,
          specular: materialData.specular ?? 16.0,
          alpha: materialData.alpha ?? 1.0,
          emissionColor: materialData.emissionColor ?? [0.0, 0.0, 0.0],
          emissionIntensity: materialData.emissionIntensity ?? 0.0,
          texture: node.texture ?? null,
          image: node.image ?? null,
          textureURL: (node as any).textureURL ?? null,
          normalMap: node.normalMap ?? null,
          normalMapImage: node.normalMapImage ?? null,
          normalMapURL: (node as any).normalMapURL ?? null,
          localMatrix: node.localMatrix ?? [],
          worldMatrix: node.worldMatrix ?? [],
          parent: null as any,
          children: [] as any[],
          sceneNode: node,
        };

        allNodes.push(meshObject);
        nodeMap.set(node.uuid, meshObject);
      } else {
        // Group node (SceneNode without render data)
        const groupObject = {
          uuid: node.uuid,
          name: node.name || "Group",
          isMesh: false,
          localMatrix: node.localMatrix ?? [],
          worldMatrix: node.worldMatrix ?? [],
          parent: null as any,
          children: [] as any[],
          sceneNode: node,
        };

        allNodes.push(groupObject);
        nodeMap.set(node.uuid, groupObject);
      }

      // Recurse into children
      if (node.children) {
        for (const child of node.children) {
          collectNode(child);
        }
      }
    };

    // Walk from root nodes
    const roots = scene.getRootNodes ? scene.getRootNodes() : (scene.nodes || []).filter((n: any) => !n.parent);
    for (const root of roots) {
      collectNode(root);
    }

    // Set up parent references
    for (const obj of allNodes) {
      const sceneNode = obj.sceneNode;
      if (sceneNode.parent && nodeMap.has(sceneNode.parent.uuid)) {
        obj.parent = nodeMap.get(sceneNode.parent.uuid);
      }
      // Clean up temporary reference
      delete obj.sceneNode;
    }

    // Only process mesh nodes for buffer data
    this.meshes = allNodes.filter(n => n.isMesh);
    return allNodes;
  }

  async saveGLTF(fileName: string, meshes: any[]): Promise<void> {
    const gltf = await this.generateGLTF(meshes);
    const json = JSON.stringify(gltf, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.gltf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
