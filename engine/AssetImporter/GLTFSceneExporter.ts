import { mat4, vec3, vec4, quat } from "../MathLibrary/gl-matrix";
import { TextureCoordinates } from "../GeometryPrimitives/UVCoordinateMapper";
import { NormalsData } from "../GeometryPrimitives/SurfaceNormalCalculator";
import { Tangents } from "../GeometryPrimitives/TangentSpaceCalculator";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import { SceneNode } from "../SceneGraph/SceneNode";
import { LightNode } from "../LightingEngine/LightNode";

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

  generateGLTF(allNodes: any[]): GLTF {
    this.resetState();

    // Separate mesh nodes from group nodes
    const meshNodes = allNodes.filter(n => n.isMesh);

    const estimatedSize = this.estimateBufferSize(meshNodes);
    this.bufferData = new Uint8Array(estimatedSize);

    for (const mesh of meshNodes) {
      // Reset per-mesh bounding box
      this.positionMin = [Infinity, Infinity, Infinity];
      this.positionMax = [-Infinity, -Infinity, -Infinity];
      this.processMesh(mesh);
    }

    return this.generateFinalGLTFStructure(allNodes, meshNodes);
  }

  private estimateBufferSize(meshes: any[]): number {
    let totalSize = 0;
    for (const mesh of meshes) {
      totalSize += (mesh.vertices?.length ?? 0) * 4; // Float32
      totalSize += (mesh.normals?.length ?? NormalsData?.length ?? 0) * 4;
      totalSize +=
        (mesh.texCoords?.length ?? TextureCoordinates?.length ?? 0) * 4;
      totalSize += (mesh.indices?.length ?? 0) * 2; // Uint16
    }
    return totalSize;
  }

  private processMesh(mesh: any): void {
    this.processPositions(mesh);
    this.processNormals(mesh);
    // this.processTangents(mesh);
    this.processTexCoords(mesh);
    this.processIndices(mesh);
    this.processTextures(mesh);
    this.processMaterial(mesh);
    this.storeMeshInfo(mesh);
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
    const normalData = mesh.normals ?? NormalsData;
    if (!normalData || normalData.length === 0) return;

    const normalBuffer = new Float32Array(normalData);
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
      count: normalData.length / 3,
      type: "VEC3",
    });

    this.copyToBuffer(normalBuffer);
  }

  private processTexCoords(mesh: any): void {
    const texCoordData = mesh.texCoords ?? TextureCoordinates;
    if (!texCoordData || texCoordData.length === 0) return;

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
      count: texCoordData.length / 2,
      type: "VEC2",
    });

    this.copyToBuffer(texcoordBuffer);
  }

  private processIndices(mesh: any): void {
    if (!mesh.indices || mesh.indices.length === 0) return;

    const indexBuffer = new Uint16Array(mesh.indices);
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteOffset,
      byteLength: indexBuffer.byteLength,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });

    this.accessors.push({
      bufferView: this.bufferViews.length - 1,
      componentType: 5123, // UNSIGNED_SHORT
      count: mesh.indices.length,
      type: "SCALAR",
    });

    this.copyToBuffer(indexBuffer);
  }

  private copyToBuffer(sourceArray: ArrayBufferView): void {
    const sourceBytes = new Uint8Array(sourceArray.buffer);
    this.bufferData!.set(sourceBytes, this.byteOffset);
    this.byteOffset += sourceArray.byteLength;
  }

  private processTextures(mesh: any): void {
    this.baseColorTextureIndex = undefined;
    this.normalMapTextureIndex = undefined;

    // Use textureURL as primary source, then image
    const baseImage = mesh.textureURL || mesh.image;

    if (mesh.texture && baseImage) {
      const textureKey = `${baseImage}_${mesh.texture.version ?? "0"}`;

      if (!this.textureMap.has(textureKey)) {
        this.baseColorTextureIndex = this.textureData.length;

        let imageUri = "";
        if (typeof baseImage === 'string') {
          imageUri = baseImage.startsWith('data:')
            ? baseImage
            : `data:image/png;base64,${baseImage}`;
        } else if (baseImage instanceof HTMLImageElement) {
          // Fallback for HTMLImageElement if needed
          const canvas = document.createElement("canvas");
          canvas.width = baseImage.width;
          canvas.height = baseImage.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(baseImage, 0, 0);
          imageUri = canvas.toDataURL("image/png");
        }

        if (imageUri) {
          this.images.push({
            mimeType: "image/png",
            uri: imageUri,
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

    if (mesh.normalMap && normalImage) {
      const normalMapKey = `${normalImage}_${mesh.normalMap.version ?? "0"}`;

      if (!this.normalMapTextureMap.has(normalMapKey)) {
        this.normalMapTextureIndex = this.textureData.length;

        let normalMapUri = "";
        if (typeof normalImage === 'string') {
          normalMapUri = normalImage.startsWith('data:')
            ? normalImage
            : `data:image/png;base64,${normalImage}`;
        } else if (normalImage instanceof HTMLImageElement) {
          const canvas = document.createElement("canvas");
          canvas.width = normalImage.width;
          canvas.height = normalImage.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(normalImage, 0, 0);
          normalMapUri = canvas.toDataURL("image/png");
        }

        if (normalMapUri) {
          this.images.push({
            mimeType: "image/png",
            uri: normalMapUri,
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

    const material: Material = {
      pbrMetallicRoughness: {
        metallicFactor: mesh.metallic ?? 1.0,
        roughnessFactor: mesh.roughness ?? 1.0,
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
          specularFactor: mesh.specular ?? 1.0,
        },
        KHR_materials_emissive_strength: {
          emissiveStrength: mesh.emissionIntensity ?? 0.0,
        },
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
      indices: this.accessors.length - 1,
      material: this.materialIndex,
    } as GltfIndex;
  }

  private generateFinalGLTFStructure(allNodes: any[], meshNodes: any[]): GLTF {
    const buffer = this.bufferData!.buffer;
    const base64Buffer = this.bufferToBase64(buffer as ArrayBuffer);

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
          byteLength: buffer.byteLength,
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
          vertices: (node.vertices ?? geometryData.Vertices) ?? [],
          normals: geometryData.Normals ?? NormalsData ?? [],
          texCoords: geometryData.TextureCoordinates ?? TextureCoordinates ?? [],
          tangents: geometryData.Tangents ?? Tangents ?? [],
          indices: geometryData.Indices ?? [],
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

  saveGLTF(fileName: string, meshes: any[]): void {
    const gltf = this.generateGLTF(meshes);
    console.log("gltf: ", gltf);
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
