import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
import { SceneNode } from "../SceneGraph/SceneNode";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import { LightNode } from "../LightingEngine/LightNode";
import { PointLightNode } from "../LightingEngine/PointLightNode";
import { SpotLightNode } from "../LightingEngine/SpotLightNode";
import { DirectionalLightNode } from "../LightingEngine/DirectionalLightNode";
import { CameraController } from "../CameraSystem/CameraController";
import { TextureAssetLoader } from "./TextureAssetLoader";

export interface SerializedGeometry {
  vertices: number[];
  indices: number[];
  normals?: number[];
  texCoords?: number[];
  tangents?: number[];
  type: string;
}

export interface SerializedMaterial {
  color: [number, number, number];
  metallic: number;
  roughness: number;
  specular: number;
  alpha: number;
  emissionColor: [number, number, number];
  emissionIntensity: number;
}

export interface SerializedNode {
  uuid: string;
  name: string;
  type: string;
  nodeKind: "mesh" | "light" | "group";
  visible: boolean;
  position: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  parentUUID: string | null;
  childrenUUIDs: string[];

  // Mesh specific
  geometry?: SerializedGeometry;
  material?: SerializedMaterial;
  textureDataUrl?: string | null;
  normalMapDataUrl?: string | null;

  // Light specific
  lightType?: "point" | "spot" | "directional";
  color?: [number, number, number];
  intensity?: number;
  radius?: number;
  direction?: [number, number, number];
  angle?: number;
}

export interface CameraOrbitState {
  rotationX: number;
  rotationY: number;
  radius: number;
}

export interface SerializedScene {
  version: number;
  timestamp: number;
  nodes: SerializedNode[];
  camera?: {
    eye: { x: number; y: number; z: number };
    center?: { x: number; y: number; z: number };
    rotationX?: number;
    rotationY?: number;
    radius?: number;
  };
}

export class IndexedDBSceneStorage {
  private static readonly DB_NAME = "WebGL_3DEditor_DB";
  private static readonly DB_VERSION = 1;
  private static readonly STORE_NAME = "scene_autosave";
  private static readonly AUTOSAVE_KEY = "latest_autosave";

  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private static imageToDataURL(img: HTMLImageElement): string | null {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 256;
      canvas.height = img.naturalHeight || img.height || 256;
      if (canvas.width === 0 || canvas.height === 0) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  /**
   * Serialize current scene into plain JSON-compatible objects
   */
  public static serializeScene(
    scene: SceneHierarchyManager,
    camera?: CameraController,
    orbit?: CameraOrbitState
  ): SerializedScene {
    const serializedNodes: SerializedNode[] = [];

    // Filter out system and gizmo nodes
    const isExcluded = (node: any) => {
      if (!node) return true;
      if (node.isGizmoPart) return true;
      if (node.type === "Grid-Geometry") return true;
      if (typeof node.type === "string" && node.type.startsWith("Gizmo-")) return true;
      if (typeof node.name === "string" && node.name.startsWith("Gizmo")) return true;
      return false;
    };

    // Collect all valid SceneNode instances from scene.nodes
    const collectNodes = (nodes: SceneNode[]) => {
      for (const node of nodes) {
        if (isExcluded(node)) continue;

        let nodeKind: "mesh" | "light" | "group" = "group";
        if (node instanceof RenderableMeshObject) {
          nodeKind = "mesh";
        } else if (node instanceof LightNode) {
          nodeKind = "light";
        }

        const serializedNode: SerializedNode = {
          uuid: node.uuid,
          name: node.name || node.type || "Object",
          type: node.type || "SceneNode",
          nodeKind,
          visible: (node as any).visible !== false,
          position: {
            x: node.position?.x || 0,
            y: node.position?.y || 0,
            z: node.position?.z || 0,
          },
          rotate: {
            x: node.rotate?.x || 0,
            y: node.rotate?.y || 0,
            z: node.rotate?.z || 0,
          },
          scale: {
            x: node.scale?.x ?? 1,
            y: node.scale?.y ?? 1,
            z: node.scale?.z ?? 1,
          },
          parentUUID: node.parent ? node.parent.uuid : null,
          childrenUUIDs: (node.children || [])
            .filter((c) => !isExcluded(c))
            .map((c) => c.uuid),
        };

        if (nodeKind === "mesh") {
          const mesh = node as RenderableMeshObject;
          const geom = mesh.geometry || {};

          // CRITICAL: Live edited vertices & normals on mesh take priority over initial geom definition
          const vertices = mesh.vertices ? Array.from(mesh.vertices as any) : (geom.Vertices ? Array.from(geom.Vertices) : []);
          const indices = mesh.indices ? Array.from(mesh.indices as any) : (geom.Indices ? Array.from(geom.Indices) : []);
          const normals = mesh.normals ? Array.from(mesh.normals as any) : (geom.Normals ? Array.from(geom.Normals) : undefined);
          const texCoords = mesh.texCoord ? Array.from(mesh.texCoord as any) : (geom.TextureCoordinates ? Array.from(geom.TextureCoordinates) : undefined);
          const tangents = mesh.tangent ? Array.from(mesh.tangent as any) : (geom.Tangents ? Array.from(geom.Tangents) : undefined);

          serializedNode.geometry = {
            vertices: vertices as number[],
            indices: indices as number[],
            normals: normals ? (normals as number[]) : undefined,
            texCoords: texCoords ? (texCoords as number[]) : undefined,
            tangents: tangents ? (tangents as number[]) : undefined,
            type: geom.type || mesh.type || "Custom-Mesh",
          };

          const mat = mesh.material || {};
          serializedNode.material = {
            color: mat.color ? [mat.color[0], mat.color[1], mat.color[2]] : [1, 1, 1],
            metallic: mat.metallic ?? 0.5,
            roughness: mat.roughness ?? 0.5,
            specular: mat.specular ?? 16.0,
            alpha: mat.alpha ?? 1.0,
            emissionColor: mat.emissionColor ? [mat.emissionColor[0], mat.emissionColor[1], mat.emissionColor[2]] : [0, 0, 0],
            emissionIntensity: mat.emissionIntensity ?? 0.0,
          };

          // Texture data URLs or paths
          let texUrl = (mesh as any).textureURL || null;
          if (!texUrl && typeof mesh.image === "string") {
            texUrl = mesh.image;
          } else if (!texUrl && mesh.image instanceof HTMLImageElement) {
            // Prefer existing src (often data:) over expensive canvas re-encode
            texUrl = mesh.image.src?.startsWith("data:") || mesh.image.src?.startsWith("blob:")
              ? mesh.image.src
              : this.imageToDataURL(mesh.image);
            if (texUrl?.startsWith("blob:")) {
              texUrl = this.imageToDataURL(mesh.image);
            }
          }
          serializedNode.textureDataUrl = texUrl;

          let normUrl = (mesh as any).normalMapURL || null;
          if (!normUrl && typeof mesh.normalMapImage === "string") {
            normUrl = mesh.normalMapImage;
          } else if (!normUrl && mesh.normalMapImage instanceof HTMLImageElement) {
            const src = mesh.normalMapImage.src;
            normUrl = src?.startsWith("data:")
              ? src
              : this.imageToDataURL(mesh.normalMapImage);
          }
          serializedNode.normalMapDataUrl = normUrl;
        } else if (nodeKind === "light") {
          const light = node as LightNode;
          serializedNode.color = light.color ? [light.color[0], light.color[1], light.color[2]] : [1, 1, 1];
          serializedNode.intensity = light.intensity ?? 1.0;

          if (light instanceof PointLightNode) {
            serializedNode.lightType = "point";
            serializedNode.radius = light.radius ?? 2.0;
          } else if (light instanceof SpotLightNode) {
            serializedNode.lightType = "spot";
            serializedNode.direction = light.direction ? [light.direction[0], light.direction[1], light.direction[2]] : [0, 0, -1];
            serializedNode.angle = light.angle ?? Math.PI / 7;
          } else if (light instanceof DirectionalLightNode) {
            serializedNode.lightType = "directional";
            serializedNode.direction = light.direction ? [light.direction[0], light.direction[1], light.direction[2]] : [0, 0, 1];
          }
        }

        serializedNodes.push(serializedNode);

        if (node.children && node.children.length > 0) {
          collectNodes(node.children);
        }
      }
    };

    // Start with root nodes in scene.nodes
    const rootNodes = (scene.nodes || []).filter((n) => !n.parent);
    collectNodes(rootNodes);

    return {
      version: 1,
      timestamp: Date.now(),
      nodes: serializedNodes,
      camera: camera
        ? {
            eye: { x: camera.eye.x, y: camera.eye.y, z: camera.eye.z },
            center: camera.center
              ? { x: camera.center.x, y: camera.center.y, z: camera.center.z }
              : undefined,
            rotationX: orbit?.rotationX,
            rotationY: orbit?.rotationY,
            radius: orbit?.radius,
          }
        : undefined,
    };
  }

  /**
   * Save scene state to IndexedDB
   */
  public static async saveScene(
    scene: SceneHierarchyManager,
    camera?: CameraController,
    orbit?: CameraOrbitState
  ): Promise<void> {
    try {
      const serialized = this.serializeScene(scene, camera, orbit);
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.put(serialized, this.AUTOSAVE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("[IndexedDBSceneStorage] Failed to save scene:", err);
    }
  }

  /**
   * Load saved scene from IndexedDB
   */
  public static async loadScene(): Promise<SerializedScene | null> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readonly");
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.get(this.AUTOSAVE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("[IndexedDBSceneStorage] Failed to load scene:", err);
      return null;
    }
  }

  /**
   * Clear saved scene from IndexedDB (e.g. when creating New Scene)
   */
  public static async clearSavedScene(): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.delete(this.AUTOSAVE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("[IndexedDBSceneStorage] Failed to clear saved scene:", err);
    }
  }

  /**
   * Check whether a saved scene exists in IndexedDB
   */
  public static async hasSavedScene(): Promise<boolean> {
    try {
      const data = await this.loadScene();
      return !!(data && data.nodes && data.nodes.length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Reconstruct scene objects and hierarchy from serialized state
   */
  public static async restoreScene(
    savedData: SerializedScene,
    scene: SceneHierarchyManager,
    createdObjects: Map<string, any>,
    gl: WebGLRenderingContext,
    materialFactory: PBRMaterialProperties,
    camera?: CameraController
  ): Promise<void> {
    if (!savedData || !savedData.nodes || savedData.nodes.length === 0) return;

    // 1. Clear existing user nodes and lights (keep Grid)
    const gridNodes = (scene.nodes || []).filter((n) => n.type === "Grid-Geometry");
    scene.nodes = [...gridNodes];
    scene.objects = scene.objects.filter((o) => o.type === "Grid-Geometry");
    scene.lights = [];
    createdObjects.clear();

    const createdNodeMap = new Map<string, SceneNode>();
    const textureLoader = new TextureAssetLoader(gl, scene);

    // 2. First Pass: Create instances (textures load in background — do not block first frame)
    for (const nodeData of savedData.nodes) {
      if (nodeData.nodeKind === "mesh" && nodeData.geometry) {
        const indexSrc = nodeData.geometry.indices || [];
        let maxIndex = 0;
        for (let i = 0; i < indexSrc.length; i++) {
          if (indexSrc[i] > maxIndex) maxIndex = indexSrc[i];
        }
        const Indices =
          maxIndex > 65535 ? new Uint32Array(indexSrc) : new Uint16Array(indexSrc);

        const geomData = {
          Vertices: new Float32Array(nodeData.geometry.vertices),
          Indices,
          Normals: nodeData.geometry.normals ? new Float32Array(nodeData.geometry.normals) : undefined,
          TextureCoordinates: nodeData.geometry.texCoords ? new Float32Array(nodeData.geometry.texCoords) : undefined,
          Tangents: nodeData.geometry.tangents ? new Float32Array(nodeData.geometry.tangents) : undefined,
          type: nodeData.geometry.type || "Custom-Mesh",
        };

        const matData = nodeData.material || {
          color: [1, 1, 1] as [number, number, number],
          metallic: 0.5,
          roughness: 0.5,
          specular: 16.0,
          alpha: 1.0,
          emissionColor: [0, 0, 0] as [number, number, number],
          emissionIntensity: 0.0,
        };

        const pbrMat = materialFactory.getMaterialProperties({
          color: matData.color,
          metallic: matData.metallic,
          roughness: matData.roughness,
          specular: matData.specular,
          alpha: matData.alpha,
          emissionColor: matData.emissionColor,
          emissionIntensity: matData.emissionIntensity,
        });

        const mesh = new RenderableMeshObject(geomData, pbrMat);
        mesh.uuid = nodeData.uuid;
        mesh.name = nodeData.name;
        mesh.position = { ...nodeData.position };
        mesh.rotate = { ...nodeData.rotate };
        mesh.scale = { ...nodeData.scale };
        mesh.visible = nodeData.visible !== false;

        mesh.updateTranslate();
        mesh.ObjectRotation();
        mesh.updateScale();
        if (mesh.updateBoundingBox) mesh.updateBoundingBox();
        mesh.geometryNeedsUpdate = true;

        // Kick off textures without awaiting — viewport can show untextured meshes first
        if (nodeData.textureDataUrl) {
          let texUrl = nodeData.textureDataUrl;
          if (texUrl.startsWith("../../engine/Textures/")) {
            texUrl = texUrl.replace("../../", "");
          }
          (mesh as any).textureURL = texUrl;
          mesh.image = texUrl as any;
          textureLoader
            .loadTextureAsync(texUrl)
            .then((texData) => {
              mesh.texture = texData.texture;
              mesh.image = (texData.base64Image || texUrl) as any;
            })
            .catch((err) => console.warn("[IndexedDBSceneStorage] Texture load error:", err));
        }

        if (nodeData.normalMapDataUrl) {
          let normUrl = nodeData.normalMapDataUrl;
          if (normUrl.startsWith("../../engine/Textures/")) {
            normUrl = normUrl.replace("../../", "");
          }
          (mesh as any).normalMapURL = normUrl;
          mesh.normalMapImage = normUrl as any;
          textureLoader
            .loadTextureAsync(normUrl)
            .then((normData) => {
              mesh.normalMap = normData.texture;
              mesh.normalMapImage = (normData.base64Image || normUrl) as any;
            })
            .catch((err) => console.warn("[IndexedDBSceneStorage] NormalMap load error:", err));
        }

        scene.add(mesh);
        createdObjects.set(mesh.uuid, mesh);
        createdNodeMap.set(mesh.uuid, mesh);
      } else if (nodeData.nodeKind === "light") {
        let lightNode: LightNode;
        if (nodeData.lightType === "spot") {
          const spot = new SpotLightNode(nodeData.name);
          spot.direction = nodeData.direction ? [nodeData.direction[0], nodeData.direction[1], nodeData.direction[2]] : [0, 0, -1];
          spot.angle = nodeData.angle ?? Math.PI / 7;
          lightNode = spot;
        } else if (nodeData.lightType === "directional") {
          const dir = new DirectionalLightNode(nodeData.name);
          dir.direction = nodeData.direction ? [nodeData.direction[0], nodeData.direction[1], nodeData.direction[2]] : [0, 0, 1];
          lightNode = dir;
        } else {
          const pt = new PointLightNode(nodeData.name);
          pt.radius = nodeData.radius ?? 2.0;
          lightNode = pt;
        }

        lightNode.uuid = nodeData.uuid;
        lightNode.color = nodeData.color ? [nodeData.color[0], nodeData.color[1], nodeData.color[2]] : [1, 1, 1];
        lightNode.intensity = nodeData.intensity ?? 1.0;
        lightNode.position = { ...nodeData.position };
        lightNode.rotate = { ...nodeData.rotate };
        lightNode.scale = { ...nodeData.scale };
        (lightNode as any).visible = nodeData.visible !== false;
        lightNode.updateLocalMatrix();

        scene.add(lightNode);
        createdNodeMap.set(lightNode.uuid, lightNode);
      } else {
        const group = new SceneNode(nodeData.name);
        group.uuid = nodeData.uuid;
        group.position = { ...nodeData.position };
        group.rotate = { ...nodeData.rotate };
        group.scale = { ...nodeData.scale };
        (group as any).visible = nodeData.visible !== false;
        group.updateLocalMatrix();

        scene.add(group);
        createdNodeMap.set(group.uuid, group);
      }
    }

    // 3. Second Pass: Link hierarchy (parent -> child)
    for (const nodeData of savedData.nodes) {
      if (nodeData.parentUUID) {
        const child = createdNodeMap.get(nodeData.uuid);
        const parent = createdNodeMap.get(nodeData.parentUUID);
        if (child && parent) {
          child.setParent(parent);
        }
      }
    }

    // 4. Restore Camera if available (textures continue loading in background)
    if (camera && savedData.camera && savedData.camera.eye) {
      camera.eye = { ...savedData.camera.eye };
      if (savedData.camera.center && camera.center) {
        camera.center = { ...savedData.camera.center };
      }
      camera.OrbitCamera();
    }
  }
}
