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
  nodes?: number[];
}

interface GLTFAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType?: number;
  count: number;
  min?: number[];
  max?: number[];
  type?: string;
}

interface GLTFBufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

interface GLTFBuffer {
  uri?: string;
  byteLength?: number;
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
  scene?: number;
  scenes?: GLTFScene[];
  nodes?: GLTFNode[];
  meshes?: GLTFMesh[];
  accessors?: GLTFAccessor[];
  bufferViews?: GLTFBufferView[];
  buffers?: GLTFBuffer[];
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
  indices: Uint16Array | Uint32Array | null;
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
  Indices: Uint16Array | Uint32Array | null;
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

  /**
   * Load JSON GLTF from a URL (backwards compatible helper).
   */
  async loadGLTF(url: string): Promise<GLTFData> {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to load GLTF: ${response.statusText}`);
    return (await response.json()) as GLTFData;
  }

  /**
   * Fast base64 data URI decoding using native browser fetch with synchronous fallback.
   */
  async decodeBase64(base64: string): Promise<ArrayBuffer> {
    try {
      const res = await fetch(base64);
      return await res.arrayBuffer();
    } catch {
      const binaryString = atob(base64.split(",")[1]);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }

  /**
   * Parse binary GLB (0x46546C67 = "glTF") into GLTF structure and raw binary chunk.
   */
  parseGLB(arrayBuffer: ArrayBuffer): { gltfData: GLTFData; bufferData: ArrayBuffer } {
    const dataView = new DataView(arrayBuffer);
    const magic = dataView.getUint32(0, true);
    if (magic !== 0x46546c67) {
      throw new Error("Invalid GLB format: magic header is not 0x46546C67 (glTF)");
    }
    const version = dataView.getUint32(4, true);
    if (version !== 2) {
      console.warn(`GLB version ${version} detected; expected 2.`);
    }
    const totalLength = dataView.getUint32(8, true);

    let offset = 12;
    let gltfData: GLTFData | null = null;
    let bufferData: ArrayBuffer = new ArrayBuffer(0);

    while (offset < totalLength && offset < arrayBuffer.byteLength) {
      const chunkLength = dataView.getUint32(offset, true);
      const chunkType = dataView.getUint32(offset + 4, true);
      offset += 8;

      if (chunkType === 0x4e4f534a) {
        // 0x4E4F534A = "JSON"
        const jsonBytes = new Uint8Array(arrayBuffer, offset, chunkLength);
        const jsonString = new TextDecoder("utf-8").decode(jsonBytes);
        gltfData = JSON.parse(jsonString) as GLTFData;
      } else if (chunkType === 0x004e4942) {
        // 0x004E4942 = "BIN\0"
        bufferData = arrayBuffer.slice(offset, offset + chunkLength);
      }

      offset += chunkLength;
      // GLB chunks are aligned to 4-byte boundaries
      offset = (offset + 3) & ~3;
    }

    if (!gltfData) {
      throw new Error("Invalid GLB: Missing JSON chunk");
    }

    return { gltfData, bufferData };
  }

  /**
   * Load texture from a binary buffer view directly using Blob URL (no CPU freeze).
   */
  async loadTextureFromBuffer(
    bufferData: Uint8Array,
    mimeType: string
  ): Promise<WebGLTexture | null> {
    const blob = new Blob([new Uint8Array(bufferData)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const textureData = await this.loadTexture.loadTextureAsync(url);
    URL.revokeObjectURL(url);
    return textureData.texture;
  }

  /**
   * Process and decode all textures in parallel without blocking the main CPU thread.
   */
  async processTextures(
    gltfData: GLTFData,
    buffers: ArrayBuffer | ArrayBuffer[],
    fileMap?: Map<string, File>
  ): Promise<(WebGLTexture | null)[]> {
    const textures: (WebGLTexture | null)[] = [];
    const textureURIs: (string | null)[] = [];

    if (!gltfData.images || gltfData.images.length === 0) return textures;

    // Process textures in parallel with Promise.all
    const promises = gltfData.images.map(async (image, i) => {
      try {
        if (image.uri) {
          let uri = image.uri;
          let loadUrl = image.uri;
          let isBlob = false;

          // Resolve external image files from the fileMap
          if (!uri.startsWith("data:") && fileMap) {
            const fileName = uri.split("/").pop() || uri;
            const file = fileMap.get(fileName) || fileMap.get(uri);
            if (file) {
              loadUrl = URL.createObjectURL(file);
              isBlob = true;
            }
          }

          const textureData = await this.loadTexture.loadTextureAsync(loadUrl);
          textures[i] = textureData.texture;
          textureURIs[i] = textureData.base64Image || uri;

          if (isBlob) {
            URL.revokeObjectURL(loadUrl);
          }
        } else if (image.bufferView !== undefined && gltfData.bufferViews) {
          const view = gltfData.bufferViews[image.bufferView];
          const targetBuffer = Array.isArray(buffers)
            ? (buffers[view.buffer ?? 0] || buffers[0])
            : buffers;

          const imageBuffer = new Uint8Array(
            targetBuffer,
            view.byteOffset || 0,
            view.byteLength
          );
          const mimeType = image.mimeType || "image/png";
          const blob = new Blob([imageBuffer], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);

          const textureData = await this.loadTexture.loadTextureAsync(blobUrl);
          textures[i] = textureData.texture;
          textureURIs[i] = textureData.base64Image || null;

          URL.revokeObjectURL(blobUrl);
        }
      } catch (error) {
        console.warn(`Texture load failed for image[${i}]:`, error);
        textures[i] = null;
        textureURIs[i] = null;
      }
    });

    await Promise.all(promises);

    this.textureURIs = textureURIs;
    return textures;
  }

  /**
   * Resolve buffer data from a GLTF buffer URI.
   * Handles: data URIs (base64), external files (fileMap), and relative network URLs.
   */
  private async resolveBufferData(
    bufferUri: string,
    fileMap?: Map<string, File>,
    baseUrl?: string
  ): Promise<ArrayBuffer> {
    // Case 1: Embedded base64 data URI
    if (bufferUri.startsWith("data:")) {
      return await this.decodeBase64(bufferUri);
    }

    // Case 2: External file reference — look up in user-provided fileMap
    if (fileMap) {
      const fileName = bufferUri.split("/").pop() || bufferUri;
      const file = fileMap.get(fileName) || fileMap.get(bufferUri);
      if (file) {
        return await file.arrayBuffer();
      }
    }

    // Case 3: Network fetch fallback if loaded via web URL
    if (baseUrl && !baseUrl.startsWith("blob:")) {
      try {
        const resolvedUrl = new URL(bufferUri, baseUrl).href;
        const res = await fetch(resolvedUrl);
        if (res.ok) {
          return await res.arrayBuffer();
        }
      } catch (_) {}
    }

    // No match found — give a helpful error
    throw new Error(
      `Cannot resolve buffer "${bufferUri}". ` +
      `This GLTF file references an external .bin file. ` +
      `Please select both the .gltf and .bin files together when importing.`
    );
  }

  /**
   * Main entry point to load models (.gltf or .glb).
   */
  async main(urls: string[], fileMap?: Map<string, File>): Promise<void> {
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();

        // Detect if binary GLB by checking 4-byte magic (0x46546C67 = "glTF")
        const isGLB =
          arrayBuffer.byteLength >= 12 &&
          new DataView(arrayBuffer).getUint32(0, true) === 0x46546c67;

        let gltfData: GLTFData;
        const buffers: ArrayBuffer[] = [];

        if (isGLB) {
          const { gltfData: parsedGltf, bufferData } = this.parseGLB(arrayBuffer);
          gltfData = parsedGltf;
          buffers[0] = bufferData;
        } else {
          const jsonText = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));
          gltfData = JSON.parse(jsonText) as GLTFData;
        }

        // Resolve external or remaining buffers
        if (gltfData.buffers && gltfData.buffers.length > 0) {
          for (let b = 0; b < gltfData.buffers.length; b++) {
            if (buffers[b]) continue; // Already loaded via GLB binary chunk
            const buf = gltfData.buffers[b];
            if (buf.uri) {
              const data = await this.resolveBufferData(buf.uri, fileMap, url);
              buffers[b] = data;
            }
          }
        }

        if (buffers.length === 0) {
          buffers[0] = new ArrayBuffer(0);
        }

        // Process textures asynchronously in parallel
        const textures = await this.processTextures(gltfData, buffers, fileMap);

        this.nodeMap.clear();
        this.buffer = [];

        // Extract a readable root node name from fileMap or URL
        let rootName = "Imported_Model";
        if (fileMap) {
          for (const [name] of fileMap) {
            if (name.endsWith(".gltf") || name.endsWith(".glb")) {
              rootName = name.replace(/\.(gltf|glb)$/i, "");
              break;
            }
          }
        } else {
          const urlBase = url.split("/").pop()?.split("?")[0];
          if (urlBase && !urlBase.startsWith("blob:")) {
            rootName = urlBase.replace(/\.(gltf|glb)$/i, "");
          }
        }

        const rootNode = new SceneNode(rootName);
        this.scene.add(rootNode);

        // Find root nodes to process
        const rootIndices: number[] = [];
        if (gltfData.scenes && gltfData.scenes.length > 0) {
          const sceneIdx = gltfData.scene !== undefined ? gltfData.scene : 0;
          const targetScene = gltfData.scenes[sceneIdx] || gltfData.scenes[0];
          if (targetScene && targetScene.nodes) {
            rootIndices.push(...targetScene.nodes);
          }
        } else if (gltfData.nodes) {
          const childSet = new Set<number>();
          for (const n of gltfData.nodes) {
            if (n.children) {
              for (const c of n.children) childSet.add(c);
            }
          }
          for (let idx = 0; idx < gltfData.nodes.length; idx++) {
            if (!childSet.has(idx)) rootIndices.push(idx);
          }
        }

        for (const nodeIndex of rootIndices) {
          this.processNode(
            nodeIndex,
            rootNode,
            gltfData,
            buffers,
            textures
          );
        }

        // Update world matrices from root down
        rootNode.updateWorldMatrix();
      } catch (err) {
        console.error(`GLTF/GLB Load Error (${url}):`, err);
        throw err;
      }
    }
  }

  processNode(
    nodeIndex: number,
    parentNode: SceneNode | null,
    gltfData: GLTFData,
    buffers: ArrayBuffer | ArrayBuffer[],
    textures: (WebGLTexture | null)[]
  ): void {
    if (!gltfData.nodes || !gltfData.nodes[nodeIndex]) return;
    const nodeData = gltfData.nodes[nodeIndex];
    if (this.nodeMap.has(nodeIndex)) return;

    const gltfMesh =
      (nodeData.mesh !== undefined && gltfData.meshes)
        ? gltfData.meshes[nodeData.mesh]
        : null;

    let currentNode: SceneNode;

    // Determine if we can merge the node and a single primitive mesh
    if (gltfMesh && gltfMesh.primitives && gltfMesh.primitives.length === 1) {
      // MERGE: Create a RenderableMeshObject directly for the node
      currentNode = this.getMeshForPrimitive(
        gltfMesh.primitives[0],
        nodeData,
        gltfData,
        buffers,
        textures
      );
    } else {
      // GROUP: Create a standard SceneNode (either empty or with multiple primitives)
      currentNode = new SceneNode(nodeData.name || `Node_${nodeIndex}`);

      if (gltfMesh && gltfMesh.primitives) {
        // Add multiple primitives as children
        for (let i = 0; i < gltfMesh.primitives.length; i++) {
          const primitive = gltfMesh.primitives[i];
          const primMesh = this.getMeshForPrimitive(
            primitive,
            { name: `${currentNode.name}_Primitive_${i}` },
            gltfData,
            buffers,
            textures
          );
          primMesh.setParent(currentNode);
          this.scene.add(primMesh);
        }
      }
    }

    // Apply Transformation to current node
    this.applyTransformToNode(currentNode, nodeData);

    if (parentNode) {
      currentNode.setParent(parentNode);
    }

    this.scene.add(currentNode);
    this.nodeMap.set(nodeIndex, currentNode);

    // Recursively process children
    if (nodeData.children) {
      for (const childIndex of nodeData.children) {
        this.processNode(childIndex, currentNode, gltfData, buffers, textures);
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

  private quaternionToEuler(quaternion: [number, number, number, number]): { x: number; y: number; z: number } {
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
    buffers: ArrayBuffer | ArrayBuffer[],
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
      buffers,
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

    return this.createRenderableMesh(meshData, primitive, gltfData);
  }

  private createRenderableMesh(
    meshData: MeshData,
    primitive?: GLTFPrimitive,
    gltfData?: GLTFData
  ): RenderableMeshObject {
    const geometry = this.createGeometry(meshData);
    const material = this.createMaterial(meshData);

    const pbrMaterial = new PBRMaterialProperties(
      material.color as [number, number, number],
      material.metallic,
      material.roughness,
      material.specular,
      material.alpha,
      material.emissionColor as [number, number, number],
      material.emissionIntensity
    );

    const mesh = new RenderableMeshObject(
      geometry,
      pbrMaterial,
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

    // Fast bounding box setup: use accessor min/max (O(1)) if available, else loop
    const posAccessorIdx = primitive?.attributes?.POSITION;
    const posAccessor = (posAccessorIdx !== undefined && gltfData?.accessors)
      ? gltfData.accessors[posAccessorIdx]
      : undefined;

    if (
      posAccessor?.min &&
      posAccessor?.max &&
      posAccessor.min.length >= 3 &&
      posAccessor.max.length >= 3
    ) {
      mesh.originalBoundingBox = {
        min: [posAccessor.min[0], posAccessor.min[1], posAccessor.min[2]],
        max: [posAccessor.max[0], posAccessor.max[1], posAccessor.max[2]],
      };
    } else if (meshData.positions?.length) {
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

  /**
   * Compute smooth / flat normals for primitives that omit normal vectors.
   */
  private generateFlatNormals(
    positions: Float32Array,
    indices?: Uint16Array | Uint32Array
  ): Float32Array {
    const normals = new Float32Array(positions.length);

    if (indices && indices.length > 0) {
      for (let i = 0; i < indices.length; i += 3) {
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
        if (len > 0.00001) {
          nx /= len;
          ny /= len;
          nz /= len;
        }

        normals[i0] += nx;
        normals[i0 + 1] += ny;
        normals[i0 + 2] += nz;

        normals[i1] += nx;
        normals[i1 + 1] += ny;
        normals[i1 + 2] += nz;

        normals[i2] += nx;
        normals[i2 + 1] += ny;
        normals[i2 + 2] += nz;
      }

      for (let i = 0; i < normals.length; i += 3) {
        const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
        if (len > 0.00001) {
          normals[i] /= len;
          normals[i + 1] /= len;
          normals[i + 2] /= len;
        } else {
          normals[i + 1] = 1.0;
        }
      }
    } else {
      for (let i = 0; i < positions.length; i += 9) {
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
        if (len > 0.00001) {
          nx /= len;
          ny /= len;
          nz /= len;
        } else {
          ny = 1.0;
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

  getPrimitiveAttributes(
    gltfData: GLTFData,
    buffers: ArrayBuffer | ArrayBuffer[],
    primitive: GLTFPrimitive
  ) {
    const indicesArray = this.getIndexArray(
      gltfData,
      buffers,
      primitive.indices
    );
    const positions = this.getAttributeArray(
      gltfData,
      buffers,
      primitive.attributes.POSITION,
      3
    );
    let normals = this.getAttributeArray(
      gltfData,
      buffers,
      primitive.attributes.NORMAL,
      3
    );
    if ((!normals || normals.length === 0) && positions.length > 0) {
      normals = this.generateFlatNormals(positions, indicesArray || undefined);
    }

    return {
      positions,
      normals,
      texcoords: this.getAttributeArray(
        gltfData,
        buffers,
        primitive.attributes.TEXCOORD_0,
        2
      ),
      tangents: this.getAttributeArray(
        gltfData,
        buffers,
        primitive.attributes.TANGENT,
        4
      ),
      indices: indicesArray === null ? undefined : indicesArray,
    };
  }

  getAttributeArray(
    gltfData: GLTFData,
    buffers: ArrayBuffer | ArrayBuffer[],
    attrIndex: number | undefined,
    components: number
  ): Float32Array {
    if (attrIndex === undefined || !gltfData.accessors) return new Float32Array(0);

    const accessor = gltfData.accessors[attrIndex];
    if (!accessor || !gltfData.bufferViews) return new Float32Array(0);

    const view = gltfData.bufferViews[accessor.bufferView];
    if (!view) return new Float32Array(0);

    const bufferData = Array.isArray(buffers)
      ? (buffers[view.buffer ?? 0] || buffers[0])
      : buffers;

    const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const length = accessor.count * components;

    // Handle interleaved attributes if byteStride is present
    if (view.byteStride && view.byteStride !== components * 4) {
      const result = new Float32Array(length);
      const dataView = new DataView(bufferData);
      const stride = view.byteStride;
      for (let i = 0; i < accessor.count; i++) {
        const itemOffset = byteOffset + i * stride;
        for (let c = 0; c < components; c++) {
          result[i * components + c] = dataView.getFloat32(itemOffset + c * 4, true);
        }
      }
      return result;
    }

    const aligned = byteOffset % 4 === 0;
    if (aligned) {
      try {
        return new Float32Array(bufferData, byteOffset, length);
      } catch (e) {
        const sliced = bufferData.slice(byteOffset, byteOffset + length * 4);
        return new Float32Array(sliced);
      }
    }

    const sliced = bufferData.slice(byteOffset, byteOffset + length * 4);
    return new Float32Array(sliced);
  }

  getIndexArray(
    gltfData: GLTFData,
    buffers: ArrayBuffer | ArrayBuffer[],
    indexAccessorIdx: number | undefined
  ): Uint16Array | Uint32Array | null {
    if (indexAccessorIdx === undefined || !gltfData.accessors) return null;

    const accessor = gltfData.accessors[indexAccessorIdx];
    if (!accessor || !gltfData.bufferViews) return null;

    const view = gltfData.bufferViews[accessor.bufferView];
    if (!view) return null;

    const bufferData = Array.isArray(buffers)
      ? (buffers[view.buffer ?? 0] || buffers[0])
      : buffers;

    const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const compType = accessor.componentType ?? 5123;

    // 5121 = UNSIGNED_BYTE -> Convert to Uint16Array for WebGL compatibility
    if (compType === 5121) {
      const u8 = new Uint8Array(bufferData, byteOffset, count);
      return new Uint16Array(u8);
    }

    // 5125 = UNSIGNED_INT (Uint32), 5123 = UNSIGNED_SHORT (Uint16)
    const isUint32 = compType === 5125;
    const bytesPerElement = isUint32 ? 4 : 2;
    const alignment = bytesPerElement;
    const aligned = byteOffset % alignment === 0;

    if (aligned) {
      try {
        return isUint32
          ? new Uint32Array(bufferData, byteOffset, count)
          : new Uint16Array(bufferData, byteOffset, count);
      } catch (e) {
        const sliced = bufferData.slice(byteOffset, byteOffset + count * bytesPerElement);
        return isUint32
          ? new Uint32Array(sliced)
          : new Uint16Array(sliced);
      }
    }

    const sliced = bufferData.slice(byteOffset, byteOffset + count * bytesPerElement);
    return isUint32
      ? new Uint32Array(sliced)
      : new Uint16Array(sliced);
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
