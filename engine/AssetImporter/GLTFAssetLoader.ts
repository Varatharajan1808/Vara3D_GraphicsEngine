import { mat4, vec3, vec4, quat } from "../MathLibrary/gl-matrix";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import { TextureAssetLoader } from "../CoreUtilities/TextureAssetLoader";
import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
import { SceneNode } from "../SceneGraph/SceneNode";

// Define interfaces for GLTF structure
interface GLTFNode {
  mesh?: number;
  name?: string;
  children?: number[];
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

interface GLTFMesh {
  primitives: GLTFPrimitive[];
}
interface BufferCreationOptions {
  node: GLTFNode;
  attributes: {
    positions: Float32Array;
    normals?: Float32Array;
    texcoords?: Float32Array;
    tangents?: Float32Array;
    indices?: Uint16Array | Uint32Array;
  };
  localMatrix: Float32Array;
  globalMatrix: Float32Array;
  materialProps: {
    baseColorFactor: number[];
    metallic: number;
    roughness: number;
    specular: number;
    emissionColor: number[];
    emissionIntensity: number;
    alpha: number;
  };
  texture: WebGLTexture | null;
  normalMap: WebGLTexture | null;
  imageUri: string | null;
  normalMapUri: string | null;
}
interface GLTFPrimitive {
  attributes: {
    POSITION: number;
    NORMAL?: number;
    TEXCOORD_0?: number;
    TANGENT?: number;
  };
  indices?: number;
  material?: number;
}

interface GLTFScene {
  nodes: number[];
}

interface GLTFAccessor {
  bufferView: number;
  byteOffset?: number;
  count: number;
}

interface GLTFBufferView {
  byteOffset?: number;
  byteLength: number;
}

interface GLTFBuffer {
  uri: string;
}

interface GLTFTexture {
  source?: number;
}

interface GLTFImage {
  uri?: string;
  bufferView?: number;
  mimeType?: string;
}

interface GLTFMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    baseColorTexture?: {
      index: number;
    };
    metallicFactor?: number;
    roughnessFactor?: number;
  };
  normalTexture?: {
    index: number;
  };
  emissiveFactor?: number[];
  alphaCutoff?: number;
  extensions?: {
    KHR_materials_specular?: {
      specularFactor?: number;
    };
    KHR_materials_emissive_strength?: {
      emissiveStrength?: number;
    };
  };
}

interface GLTFData {
  scenes: GLTFScene[];
  nodes: GLTFNode[];
  meshes: GLTFMesh[];
  accessors: GLTFAccessor[];
  bufferViews: GLTFBufferView[];
  buffers: GLTFBuffer[];
  textures?: GLTFTexture[];
  images?: GLTFImage[];
  materials?: GLTFMaterial[];
}

// Define interfaces for internal use
interface MeshData {
  type?: string;
  positionBuffer: WebGLBuffer | null;
  positions: Float32Array;
  normals: Float32Array;
  texcoords: Float32Array;
  tangents: Float32Array;
  indices: Uint16Array | null;
  vertexCount: number;
  modelMatrix: Float32Array;
  localMatrix: Float32Array;
  baseColorFactor: number[];
  texture: WebGLTexture | null;
  normalMap: WebGLTexture | null;
  imageUri: string | null;
  normalMapUri: string | null;
  metallic: number;
  roughness: number;
  specular: number;
  emissionColor: number[];
  emissionIntensity: number;
  alpha: number;
  translation: number[];
  rotation: number[];
  scale: number[];
}

interface GeometryData {
  type: string;
  Vertices: Float32Array;
  Indices: Uint16Array | null;
  Normals: Float32Array;
  TextureCoordinates: Float32Array;
  Tangents: Float32Array;
}

interface MaterialProperties {
  color: number[];
  metallic: number;
  roughness: number;
  specular: number;
  alpha: number;
  emissionColor: number[];
  emissionIntensity: number;
}

// Scene is not well-defined in the original code
// interface Scene {
//   add: (mesh: Mesh) => void;
// }

export class GLTFAssetLoader {
  gl: WebGLRenderingContext;
  scene: SceneHierarchyManager;
  buffer: MeshData[];
  material: PBRMaterialProperties;
  loadTexture: TextureAssetLoader;
  importedMeshes: RenderableMeshObject[];
  textureURIs: (string | null)[];
  nodeMap: Map<number, SceneNode> = new Map();

  constructor(gl: WebGLRenderingContext, scene: SceneHierarchyManager) {
    this.gl = gl;
    this.scene = scene;
    this.buffer = [];
    this.material = new PBRMaterialProperties();
    this.loadTexture = new TextureAssetLoader(gl, this.scene);
    this.importedMeshes = [];
    this.textureURIs = [];
  }
  async loadGLTF(url: string): Promise<GLTFData> {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to load GLTF: ${response.statusText}`);
    return (await response.json()) as GLTFData;
  }
  decodeBase64(base64: string): ArrayBuffer {
    const binaryString = atob(base64.split(",")[1]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  async loadTextureFromBuffer(
    bufferData: Uint8Array,
    mimeType: string
  ): Promise<WebGLTexture | null> {
    const blob = new Blob([new Uint8Array(bufferData)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const texture = await this.loadTexture.loadTexture(this.gl, url);
    URL.revokeObjectURL(url);
    return texture;
  }
  async processTextures(
    gltfData: GLTFData,
    bufferData: ArrayBuffer
  ): Promise<(WebGLTexture | null)[]> {
    const textures: (WebGLTexture | null)[] = [];
    const textureURIs: (string | null)[] = [];

    function bufferToBase64(buffer: Uint8Array): string {
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, [
          ...buffer.subarray(i, i + chunkSize),
        ]);
      }
      return btoa(binary);
    }

    if (!gltfData.images) return textures;

    for (let i = 0; i < gltfData.images.length; i++) {
      const image = gltfData.images[i];
      try {
        if (image.uri) {
          let uri = image.uri;
          if (uri.startsWith("data:image/")) uri = uri.split(",")[1];
          textureURIs[i] = uri;
          textures[i] = await this.loadTexture.loadTexture(this.gl, image.uri);
        } else if (image.bufferView !== undefined) {
          const view = gltfData.bufferViews[image.bufferView];
          const imageBuffer = new Uint8Array(
            bufferData,
            view.byteOffset || 0,
            view.byteLength
          );
          const base64 = bufferToBase64(imageBuffer);
          textureURIs[i] = base64;
          textures[i] = await this.loadTextureFromBuffer(
            imageBuffer,
            image.mimeType || "image/png"
          );
        }
      } catch (error) {
        console.warn(`Texture load failed for image[${i}]:`, error);
        textures[i] = null;
        textureURIs[i] = null;
      }
    }

    this.textureURIs = textureURIs;
    return textures;
  }
  async main(urls: string[]): Promise<void> {
    for (const url of urls) {
      try {
        const gltfData = await this.loadGLTF(url);
        const bufferData = this.decodeBase64(gltfData.buffers[0].uri);
        const textures = await this.processTextures(gltfData, bufferData);

        this.nodeMap.clear();
        this.buffer = [];

        for (let i = 0; i < gltfData.scenes.length; i++) {
          const scene = gltfData.scenes[i];
          for (let j = 0; j < scene.nodes.length; j++) {
            const nodeIndex = scene.nodes[j];
            this.processNode(
              nodeIndex,
              null,
              gltfData,
              bufferData,
              textures
            );
          }
        }
      } catch (err) {
        console.error(`GLTF Load Error (${url}):`, err);
      }
    }
  }
  processNode(
    nodeIndex: number,
    parentNode: SceneNode | null,
    gltfData: GLTFData,
    bufferData: ArrayBuffer,
    textures: (WebGLTexture | null)[]
  ): void {
    const nodeData = gltfData.nodes[nodeIndex];
    if (this.nodeMap.has(nodeIndex)) return;

    const gltfMesh =
      nodeData.mesh !== undefined ? gltfData.meshes[nodeData.mesh] : null;

    let currentNode: SceneNode;

    // Determine if we can merge the node and a single primitive mesh
    if (gltfMesh && gltfMesh.primitives.length === 1) {
      // MERGE: Create a RenderableMeshObject directly for the node
      currentNode = this.getMeshForPrimitive(
        gltfMesh.primitives[0],
        nodeData,
        gltfData,
        bufferData,
        textures
      );
    } else {
      // GROUP: Create a standard SceneNode (either empty or with multiple primitives)
      currentNode = new SceneNode(nodeData.name || `Node_${nodeIndex}`);

      if (gltfMesh) {
        // Add multiple primitives as children
        for (let i = 0; i < gltfMesh.primitives.length; i++) {
          const primitive = gltfMesh.primitives[i];
          const primMesh = this.getMeshForPrimitive(
            primitive,
            { name: `${currentNode.name}_Primitive_${i}` },
            gltfData,
            bufferData,
            textures
          );
          primMesh.setParent(currentNode);
          this.scene.add(primMesh);
        }
      }
    }

    // Apply Transformation to the current node (either the merged mesh or the group node)
    this.applyTransformToNode(currentNode, nodeData);

    if (parentNode) {
      currentNode.setParent(parentNode);
    }

    this.scene.add(currentNode);
    this.nodeMap.set(nodeIndex, currentNode);

    // Recursively process children
    if (nodeData.children) {
      for (const childIndex of nodeData.children) {
        this.processNode(childIndex, currentNode, gltfData, bufferData, textures);
      }
    }
  }

  private applyTransformToNode(node: SceneNode, nodeData: GLTFNode): void {
    if (nodeData.matrix) {
      const matrix = new Float32Array(nodeData.matrix);
      mat4.copy(node.localMatrix, matrix);

      const t = vec3.create();
      const s = vec3.create();
      const q = quat.create();
      mat4.getTranslation(t, matrix);
      mat4.getScaling(s, matrix);
      mat4.getRotation(q, matrix);

      node.position = { x: t[0], y: t[1], z: t[2] };
      node.scale = { x: s[0], y: s[1], z: s[2] };
      node.rotate = this.quaternionToEuler([q[0], q[1], q[2], q[3]]);
    } else {
      const t = nodeData.translation || [0, 0, 0];
      const s = nodeData.scale || [1, 1, 1];
      const r = nodeData.rotation || [0, 0, 0, 1];

      node.position = { x: t[0], y: t[1], z: t[2] };
      node.scale = { x: s[0], y: s[1], z: s[2] };
      node.rotate = this.quaternionToEuler(r as [number, number, number, number]);
    }
    node.updateLocalMatrix();
  }

  private quaternionToEuler(quaternion: [number, number, number, number]): { x: number, y: number, z: number } {
    const [x, y, z, w] = quaternion;
    return {
      x: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
      y: Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))),
      z: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
    };
  }

  private getMeshForPrimitive(
    primitive: GLTFPrimitive,
    nodeData: { name?: string },
    gltfData: GLTFData,
    bufferData: ArrayBuffer,
    textures: (WebGLTexture | null)[]
  ): RenderableMeshObject {
    const matData = this.getMaterialData(primitive, gltfData);
    const pbr = matData.pbrMetallicRoughness || {};
    const materialProps = this.getMaterialProperties(matData, pbr);

    const { texture, imageUri } = this.getTextureData(
      pbr.baseColorTexture?.index,
      gltfData,
      textures
    );

    const { texture: normalMap, imageUri: normalMapUri } = this.getTextureData(
      matData.normalTexture?.index,
      gltfData,
      textures
    );

    const attributes = this.getPrimitiveAttributes(
      gltfData,
      bufferData,
      primitive
    );

    const meshData: MeshData = {
      type: nodeData.name || "GLTF-Mesh",
      positionBuffer: null,
      positions: attributes.positions,
      normals: attributes.normals ?? new Float32Array(0),
      texcoords: attributes.texcoords ?? new Float32Array(0),
      tangents: attributes.tangents ?? new Float32Array(0),
      indices: attributes.indices ?? null,
      vertexCount: attributes.positions.length / 3,
      modelMatrix: mat4.create() as Float32Array,
      localMatrix: mat4.create() as Float32Array,
      baseColorFactor: materialProps.baseColorFactor,
      texture,
      normalMap,
      imageUri,
      normalMapUri,
      metallic: materialProps.metallic,
      roughness: materialProps.roughness,
      specular: materialProps.specular,
      emissionColor: materialProps.emissionColor,
      emissionIntensity: materialProps.emissionIntensity,
      alpha: materialProps.alpha,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    };

    // We do NOT add it to the scene here, the caller will decide
    return this.createRenderableMesh(meshData);
  }

  private createRenderableMesh(meshData: MeshData): RenderableMeshObject {
    const geometry = this.createGeometry(meshData);
    const material = this.createMaterial(meshData);

    const mesh = new RenderableMeshObject(
      geometry,
      new PBRMaterialProperties(material.color as [number, number, number]),
      meshData.texture,
      meshData.normalMap,
      meshData.imageUri as unknown as HTMLImageElement | null | undefined,
      meshData.normalMapUri as unknown as HTMLImageElement | null | undefined,
      {
        translation: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0, 1],
      }
    );

    // Initial bounding box setup
    if (meshData.positions?.length) {
      mesh.originalBoundingBox = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      for (let i = 0; i < meshData.positions.length; i += 3) {
        mesh.originalBoundingBox.min[0] = Math.min(mesh.originalBoundingBox.min[0], meshData.positions[i]);
        mesh.originalBoundingBox.min[1] = Math.min(mesh.originalBoundingBox.min[1], meshData.positions[i + 1]);
        mesh.originalBoundingBox.min[2] = Math.min(mesh.originalBoundingBox.min[2], meshData.positions[i + 2]);
        mesh.originalBoundingBox.max[0] = Math.max(mesh.originalBoundingBox.max[0], meshData.positions[i]);
        mesh.originalBoundingBox.max[1] = Math.max(mesh.originalBoundingBox.max[1], meshData.positions[i + 1]);
        mesh.originalBoundingBox.max[2] = Math.max(mesh.originalBoundingBox.max[2], meshData.positions[i + 2]);
      }
    }
    mesh.updateBoundingBox();
    return mesh;
  }
  getMaterialData(primitive: GLTFPrimitive, gltfData: GLTFData) {
    const matIndex = primitive.material ?? -1;
    return matIndex >= 0 && gltfData.materials
      ? gltfData.materials[matIndex]
      : {};
  }
  getMaterialProperties(matData: any, pbr: any) {
    const baseColorAlpha =
      pbr.baseColorFactor && pbr.baseColorFactor.length > 3
        ? pbr.baseColorFactor[3]
        : undefined;

    return {
      baseColorFactor: pbr.baseColorFactor || [1, 1, 1, 1],
      metallic: pbr.metallicFactor ?? 1.0,
      roughness: pbr.roughnessFactor ?? 1.0,
      specular:
        matData.extensions?.KHR_materials_specular?.specularFactor ?? 1.0,
      emissionColor: matData.emissiveFactor || [0, 0, 0],
      emissionIntensity:
        matData.extensions?.KHR_materials_emissive_strength?.emissiveStrength ??
        0.0,
      alpha: baseColorAlpha ?? matData.alphaCutoff ?? 1.0,
    };
  }
  getTextureData(
    textureIndex: number | undefined,
    gltfData: GLTFData,
    textures: (WebGLTexture | null)[]
  ) {
    let texture: WebGLTexture | null = null;
    let imageUri: string | null = null;

    if (textureIndex !== undefined && gltfData.textures) {
      const textureInfo = gltfData.textures[textureIndex];
      if (textureInfo?.source !== undefined) {
        const sourceIndex = textureInfo.source;
        texture = textures[sourceIndex] ?? null;
        imageUri = this.textureURIs[sourceIndex] ?? null;
      }
    }

    return { texture, imageUri };
  }
  getPrimitiveAttributes(
    gltfData: GLTFData,
    bufferData: ArrayBuffer,
    primitive: GLTFPrimitive
  ) {
    const indicesArray = this.getIndexArray(
      gltfData,
      bufferData,
      primitive.indices
    );
    return {
      positions: this.getAttributeArray(
        gltfData,
        bufferData,
        primitive.attributes.POSITION,
        3
      ),
      normals: this.getAttributeArray(
        gltfData,
        bufferData,
        primitive.attributes.NORMAL,
        3
      ),
      texcoords: this.getAttributeArray(
        gltfData,
        bufferData,
        primitive.attributes.TEXCOORD_0,
        2
      ),
      tangents: this.getAttributeArray(
        gltfData,
        bufferData,
        primitive.attributes.TANGENT,
        3
      ),
      indices: indicesArray === null ? undefined : indicesArray,
    };
  }

  getAttributeArray(
    gltfData: GLTFData,
    bufferData: ArrayBuffer,
    attrIndex: number | undefined,
    components: number
  ): Float32Array {
    if (attrIndex === undefined) return new Float32Array(0);

    const accessor = gltfData.accessors[attrIndex];
    const view = gltfData.bufferViews[accessor.bufferView];

    const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const length = accessor.count * components;
    const aligned = byteOffset % 4 === 0;

    if (aligned) {
      try {
        return new Float32Array(bufferData, byteOffset, length);
      } catch (e) {
        // Handle alignment issues by falling back to copying
        const sliced = new Uint8Array(bufferData).slice(
          byteOffset,
          byteOffset + length * 4
        );
        return new Float32Array(sliced.buffer);
      }
    }

    const sliced = new Uint8Array(bufferData).slice(
      byteOffset,
      byteOffset + length * 4
    );
    return new Float32Array(sliced.buffer);
  }
  getIndexArray(
    gltfData: GLTFData,
    bufferData: ArrayBuffer,
    indexAccessorIdx: number | undefined
  ): Uint16Array | null {
    if (indexAccessorIdx === undefined) return null;

    const accessor = gltfData.accessors[indexAccessorIdx];
    const view = gltfData.bufferViews[accessor.bufferView];

    const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const aligned = byteOffset % 2 === 0;

    if (aligned) {
      try {
        return new Uint16Array(bufferData, byteOffset, count);
      } catch (e) {
        // Handle alignment issues by falling back to copying
        const sliced = new Uint8Array(bufferData).slice(
          byteOffset,
          byteOffset + count * 2
        );
        return new Uint16Array(sliced.buffer);
      }
    }

    const sliced = new Uint8Array(bufferData).slice(
      byteOffset,
      byteOffset + count * 2
    );
    return new Uint16Array(sliced.buffer);
  }
  createGeometry(meshData: MeshData): GeometryData {
    return {
      type: meshData.type ?? "GLTF-Mesh",
      Vertices: meshData.positions,
      Indices: meshData.indices,
      Normals: meshData.normals,
      TextureCoordinates: meshData.texcoords,
      Tangents: meshData.tangents,
    };
  }
  createMaterial(meshData: MeshData): MaterialProperties {
    return this.material.getMaterialProperties({
      color: [
        meshData.baseColorFactor[0] || 0,
        meshData.baseColorFactor[1] || 0,
        meshData.baseColorFactor[2] || 0,
      ],
      metallic: meshData.metallic,
      roughness: meshData.roughness,
      specular: meshData.specular,
      alpha: meshData.alpha,
      emissionColor: [
        meshData.emissionColor[0] || 0,
        meshData.emissionColor[1] || 0,
        meshData.emissionColor[2] || 0,
      ] as [number, number, number],
      emissionIntensity: meshData.emissionIntensity,
    });
  }
  loadingGLTF(
    meshData: MeshData,
    scene: SceneHierarchyManager
  ): RenderableMeshObject {
    const mesh = this.createRenderableMesh(meshData);
    scene.add(mesh);
    return mesh;
  }
}