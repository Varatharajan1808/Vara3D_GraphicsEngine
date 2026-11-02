import { IndexedDBSceneStorage } from "../../engine/CoreUtilities/IndexedDBSceneStorage";
import { CommandHistory, Command } from "../../engine/CoreUtilities/CommandHistory";
import { ObjectTransformSnapshot } from "../../engine/EventManager/SceneInteractionHandler";
import { ZipArchiveLoader } from "../../engine/CoreUtilities/ZipArchiveLoader";
import { EditorUIController } from "../../engine/UserInterface/EditorUIController";
import { ViewHelper } from "../../engine/UserInterface/ViewHelper";
import { WebGLRenderEngine } from "../../engine/Renderer/Webgl/WebGLRenderEngine";
import { CameraController } from "../../engine/CameraSystem/CameraController";
import { SceneHierarchyManager } from "../../engine/SceneGraph/SceneHierarchyManager";
import { PBRMaterialProperties } from "../../engine/MaterialSystem/PBRMaterialProperties";
import { TextureAssetLoader } from "../../engine/CoreUtilities/TextureAssetLoader";
import { GridHelper } from "../../engine/CoreUtilities/GridHelper";
import { RenderableMeshObject } from "../../engine/MeshRenderer/RenderableMeshObject";
import { BoxGeometryBuilder } from "../../engine/GeometryPrimitives/BoxGeometryBuilder";
import { SphereGeometryBuilder } from "../../engine/GeometryPrimitives/SphereGeometryBuilder";
import { PlaneGeometryBuilder } from "../../engine/GeometryPrimitives/PlaneGeometryBuilder";
import { ConeGeometryBuilder } from "../../engine/GeometryPrimitives/ConeGeometryBuilder";
import { CylinderGeometryBuilder } from "../../engine/GeometryPrimitives/CylinderGeometryBuilder";
import { SceneLightingManager } from "../../engine/LightingEngine/SceneLightingManager";
import { GLTFAssetLoader } from "../../engine/AssetImporter/GLTFAssetLoader";
import { SceneInteractionHandler } from "../../engine/EventManager/SceneInteractionHandler";
import { GLTFSceneExporter } from "../../engine/AssetImporter/GLTFSceneExporter";
import { createProgram } from "../../engine/Renderer/Webgl/ShaderProgramLinker";
import { PointLightNode } from "../../engine/LightingEngine/PointLightNode";
import { SpotLightNode } from "../../engine/LightingEngine/SpotLightNode";
import { DirectionalLightNode } from "../../engine/LightingEngine/DirectionalLightNode";
import { SceneNode } from "../../engine/SceneGraph/SceneNode";
import { LightNode } from "../../engine/LightingEngine/LightNode";
import {
  PointLightvsShader, PointLightfsShader,
  SpotLightvsShader, SpotLightfsShader,
  DirLightvsShader, DirLightfsShader,
  UnifiedLightvsShader,
  UnifiedLightfsShader,
} from "../../engine/Renderer/Shaders/GLSLShaderLibrary";


// Initialize canvas and WebGL
const canvas = document.getElementById("Mycanvas") as HTMLCanvasElement;
const webgl = new WebGLRenderEngine(canvas);

// Initialize camera  
const camera = new CameraController();

// Consolidated resize and aspect update
function handleResize() {
  const viewport = document.getElementById("viewport-container");
  if (viewport) {
    const rect = viewport.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    // Update renderer resolution and viewport
    webgl.resize(width, height);

    // Update camera aspect ratio
    const aspect = width / height;
    if (camera) {
      if ((camera as any).projectionType === "orthographic") {
        camera.OrthographicCamera(aspect);
      } else {
        camera.PerspectiveCamera(45, aspect, 0.1, 1000);
      }
      camera.OrbitCamera();
    }
  }
}

// Initial setup
handleResize();

// Consolidated resize listener
window.addEventListener("resize", handleResize);

// Initialize scene
const scene = new SceneHierarchyManager();
const gl = webgl.gl;

// Initialize material and texture loader
const material = new PBRMaterialProperties();
const MaterialColor = material.BaseColors();
const Texture = new TextureAssetLoader(gl, scene);

// Add a grid for reference
let currentGridSettings = { size: 20, spacing: 3.0, visible: true };
let gridGenerator = new GridHelper(currentGridSettings.size, currentGridSettings.spacing);
let gridMesh = new RenderableMeshObject(gridGenerator.createGrid());
gridMesh.visible = currentGridSettings.visible;
gridMesh.position = { x: 0, y: 0, z: 0 };
gridMesh.updateTranslate();
scene.add(gridMesh);

// Default cube/light are added only after IndexedDB restore check (avoids refresh flash)
const boxGeometry = new BoxGeometryBuilder();

// Initialize light system
let program: any = null;
// Set up light shader programs
const unifiedProgram = createProgram(gl, UnifiedLightvsShader as string, UnifiedLightfsShader as string);

// Create a master light instance that will hold all lights
const masterLight = new SceneLightingManager(gl, unifiedProgram);
masterLight.lightType = "point";

// Current active program starts with point light
program = unifiedProgram;
gl.useProgram(program);

// Set base light properties
masterLight.BaseLight({
  ambientLight: [0.2, 0.2, 0.2],
  diffuseLight: [1.0, 1.0, 1.0],
  specularLight: [1.0, 1.0, 1.0],
});
scene.globalLight = masterLight;

// Store individual light instances for UI tracking
const lightInstances: Map<string, { light: SceneLightingManager; type: string; index: number }> = new Map();

/** Fresh-editor starter content (cube + point light). Not used when restoring a saved session. */
function addDefaultStarterContent(): void {
  const cubeMaterial = material.getMaterialProperties({
    color: MaterialColor.red,
    metallic: 0.5,
    roughness: 0.2,
    specular: 16.0,
    alpha: 1.0,
    emissionColor: [0.0, 0.0, 0.0],
    emissionIntensity: 0.0,
  });
  const cube = new RenderableMeshObject(boxGeometry.CubeData(), cubeMaterial);
  cube.position = { x: 0, y: 0, z: 0 };
  cube.updateTranslate();
  scene.add(cube);

  const defaultLight = new PointLightNode("Point Light");
  defaultLight.position = { x: 0, y: 0, z: 3 };
  defaultLight.radius = 2.0;
  defaultLight.color = [1, 1, 1];
  defaultLight.intensity = 1.0;
  scene.add(defaultLight);

  lightInstances.set(masterLight.uuid, { light: masterLight, type: "point", index: 0 });
  masterLight.PointLight({
    lightPosition: [0.0, 0.0, 3.0],
    radius: 2.0,
    lightColor: [1.0, 1.0, 1.0],
    intensity: 2.0,
  });
}

// Initialize GLTF loader
const loader = new GLTFAssetLoader(gl, scene);

// Initialize events
const events = new SceneInteractionHandler(scene, camera, canvas, gl);

// Initialize View Helper
const viewportContainer = document.getElementById("viewport-container") as HTMLElement;
const viewHelper = new ViewHelper(viewportContainer, camera, events);

// Synchronize viewport selection with UI
events.onSelect = (uuid) => {
  if (uuid) {
    uiManager.selectObject(uuid);
    selectedObject = findObjectByUUID(uuid);
    previousSelectedUUID = uuid;
    if (selectedObject) {
      updateObjectProperties(selectedObject);
    }
  } else {
    selectedObject = null;
    previousSelectedUUID = null;
    uiManager.selectObject(null);
    clearObjectProperties();
  }
};

events.onMultiSelect = (uuids: string[]) => {
  uiManager.selectObjects(uuids);
  if (events.select && events.select.length > 0) {
    selectedObject = events.select[events.select.length - 1];
    previousSelectedUUID = selectedObject ? selectedObject.uuid : null;
    if (selectedObject) {
      updateObjectProperties(selectedObject);
    }
  } else {
    selectedObject = null;
    previousSelectedUUID = null;
    clearObjectProperties();
  }
};

// Handle object deletion
events.onDelete = (uuid) => {
  // Remove from createdObjects map if present
  if (createdObjects.has(uuid)) {
    createdObjects.delete(uuid);
  }

  // Update scene graph UI
  updateSceneGraph();
};

// Track previous selection to detect changes
// Initialize UI Manager
const uiManager = new EditorUIController();

// ============================================================================
// Core Undo / Redo System & Helper Functions
// ============================================================================
let previousSelectionSignature: string = "";
let cachedSelectedUUIDs: Set<string> = new Set();
let lastSelectionCacheKey: string = "";
let previousSelectedUUID: string | null = null;

// ============================================================================
// Auto-Save System (IndexedDB Background Storage)
// ============================================================================
let autoSaveTimeout: any = null;
function getCameraOrbitState() {
  return {
    rotationX: events.rotationX,
    rotationY: events.rotationY,
    radius: events.cameraRadiuscam,
  };
}

function triggerAutoSave() {
  if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(async () => {
    try {
      await IndexedDBSceneStorage.saveScene(scene, camera, getCameraOrbitState());
    } catch (err) {
      console.warn("[AutoSave] Error saving to IndexedDB:", err);
    }
  }, 1000);
}

window.addEventListener("beforeunload", () => {
  IndexedDBSceneStorage.saveScene(scene, camera, getCameraOrbitState());
});

events.onViewChange = () => {
  triggerAutoSave();
};

const commandHistory = new CommandHistory(50);
commandHistory.onChange((canUndo, canRedo, undoName, redoName) => {
  uiManager.updateUndoRedoUI(canUndo, canRedo, undoName, redoName);
  triggerAutoSave();
});
uiManager.onUndo(() => commandHistory.undo());
uiManager.onRedo(() => commandHistory.redo());

// Universal helper to find an object by UUID in meshes, nodes, lights, or camera
function findObjectByUUID(uuid: string): any {
  if (!uuid) return null;
  if (camera && camera.uuid === uuid) return camera;

  const findInNodes = (nodes: SceneNode[]): SceneNode | null => {
    for (const node of nodes) {
      if (node.uuid === uuid) return node;
      const found = findInNodes(node.children);
      if (found) return found;
    }
    return null;
  };

  const foundNode = findInNodes(scene.nodes);
  if (foundNode) return foundNode;

  for (const obj of scene.objects) {
    if (obj.uuid === uuid) return obj;
  }
  for (const light of scene.lights) {
    if (light.uuid === uuid) return light;
  }
  return null;
}

function selectSingleObject(obj: any) {
  selectedObject = obj;
  previousSelectedUUID = obj.uuid;
  previousSelectionSignature = obj.uuid;
  updateObjectProperties(obj);
  if (obj instanceof RenderableMeshObject || (obj instanceof SceneNode && !(obj instanceof LightNode))) {
    events.selectedObject = obj;
    events.isObjectSelected = true;
    events.select = [obj];
    if (events.webgl) events.webgl.selectedObject = obj;
    if (events.gizmo) {
      events.gizmo.visible = true;
      events.updateGizmoPosition(obj);
      if (!events.gizmo.gizmoMeshes.length) {
        events.gizmo.addToScene(scene);
      }
    }
  } else {
    events.selectedObject = null;
    events.isObjectSelected = false;
    events.select = [];
    if (events.gizmo) {
      events.gizmo.visible = false;
    }
  }
  uiManager.selectObject(obj.uuid);
}

function deselectInEditor() {
  selectedObject = null;
  previousSelectedUUID = null;
  previousSelectionSignature = "";
  events.deselectObject();
  clearObjectProperties();
  uiManager.selectObject(null);
}

function applyObjectTransforms(snapshots: ObjectTransformSnapshot[]) {
  for (const s of snapshots) {
    const obj = findObjectByUUID(s.uuid);
    if (obj) {
      obj.position.x = s.position.x;
      obj.position.y = s.position.y;
      obj.position.z = s.position.z;
      obj.rotate.x = s.rotate.x;
      obj.rotate.y = s.rotate.y;
      obj.rotate.z = s.rotate.z;
      obj.scale.x = s.scale.x;
      obj.scale.y = s.scale.y;
      obj.scale.z = s.scale.z;
      if (obj instanceof RenderableMeshObject) {
        obj.updateTranslate();
        obj.ObjectRotation();
        obj.updateScale();
        if (obj.updateBoundingBox) obj.updateBoundingBox();
      } else if (obj instanceof SceneNode) {
        obj.updateLocalMatrix();
      }
    }
  }

  // Update gizmo and properties panel
  if (events.select.length > 1) {
    events.updateGizmoPositionForMultiSelection();
  } else if (events.selectedObject) {
    events.updateGizmoPosition(events.selectedObject);
  }
  if (selectedObject) {
    updateObjectProperties(selectedObject);
  }
}

// Handle interactive gizmo transform complete (Undo/Redo)
events.onTransformComplete = (startStates, endStates) => {
  commandHistory.execute({
    name: "Transform",
    execute: () => {
      applyObjectTransforms(endStates);
    },
    undo: () => {
      applyObjectTransforms(startStates);
    }
  }, false);
};

// Handle interactive geometry change (Vertex/Edge/Face edits) Undo/Redo & AutoSave
events.onGeometryChange = (mesh, prevVertices, newVertices) => {
  commandHistory.execute({
    name: "Edit Geometry",
    execute: () => {
      mesh.vertices = new Float32Array(newVertices);
      if (mesh.geometry) {
        mesh.geometry.Vertices = mesh.vertices;
        mesh.geometry.type = "Custom-Mesh";
      }
      mesh.geometryNeedsUpdate = true;
      events.recalculateNormals(mesh);
      mesh.updateBoundingBox();
      triggerAutoSave();
    },
    undo: () => {
      mesh.vertices = new Float32Array(prevVertices);
      if (mesh.geometry) {
        mesh.geometry.Vertices = mesh.vertices;
        mesh.geometry.type = "Custom-Mesh";
      }
      mesh.geometryNeedsUpdate = true;
      events.recalculateNormals(mesh);
      mesh.updateBoundingBox();
      triggerAutoSave();
    }
  }, false);
  triggerAutoSave();
};

function executeDeleteObjects(nodes: SceneNode[]) {
  if (!nodes || nodes.length === 0) return;

  const records = nodes.map((node) => ({
    node,
    parent: node.parent || null,
  }));

  commandHistory.execute({
    name: nodes.length > 1 ? `Delete ${nodes.length} Objects` : `Delete ${nodes[0]?.name || "Object"}`,
    execute: () => {
      for (const rec of records) {
        // Recursively remove tracking from createdObjects and lightInstances
        const deleteTrackingRecursive = (n: SceneNode) => {
          createdObjects.delete(n.uuid);
          if (lightInstances.has(n.uuid)) {
            lightInstances.delete(n.uuid);
          }
          if (n.children) {
            for (const child of n.children) {
              deleteTrackingRecursive(child);
            }
          }
        };
        deleteTrackingRecursive(rec.node);

        // SceneHierarchyManager.remove recursively removes node and all descendant meshes/lights
        scene.remove(rec.node);
      }

      // Check if selectedObject (or items in events.select) was inside any deleted node
      const isDescendantOrSelf = (target: any, root: SceneNode): boolean => {
        if (!target || !root) return false;
        if (target === root || target.uuid === root.uuid) return true;
        if (root.children) {
          for (const child of root.children) {
            if (isDescendantOrSelf(target, child)) return true;
          }
        }
        return false;
      };

      const selectedWasDeleted = records.some((rec) =>
        (selectedObject && isDescendantOrSelf(selectedObject, rec.node)) ||
        events.select.some((s: any) => isDescendantOrSelf(s, rec.node))
      );

      if (selectedWasDeleted) {
        deselectInEditor();
      }

      updateSceneGraph();
      triggerAutoSave();
    },
    undo: () => {
      for (const rec of records) {
        scene.add(rec.node);
        if (rec.parent) {
          rec.node.setParent(rec.parent);
        }
        const addTrackingRecursive = (n: SceneNode) => {
          if (n instanceof RenderableMeshObject) {
            createdObjects.set(n.uuid, n);
          }
          if (n.children) {
            for (const child of n.children) {
              addTrackingRecursive(child);
            }
          }
        };
        addTrackingRecursive(rec.node);
      }
      if (records.length === 1) {
        selectSingleObject(records[0].node);
      } else {
        const meshes: RenderableMeshObject[] = [];
        const collectMeshes = (n: SceneNode) => {
          if (n instanceof RenderableMeshObject) meshes.push(n);
          if (n.children) n.children.forEach(collectMeshes);
        };
        records.forEach((r) => collectMeshes(r.node));

        if (meshes.length > 0) {
          events.select = meshes;
          events.selectedObject = meshes[0];
          events.isObjectSelected = true;
          events.updateGizmoPositionForMultiSelection();
          if (events.gizmo) events.gizmo.visible = true;
          uiManager.selectObjects(meshes.map((m) => m.uuid));
        }
      }
      updateSceneGraph();
      triggerAutoSave();
    }
  }, true);
}

events.onDeleteNodes = (nodes) => {
  executeDeleteObjects(nodes);
};

// Handle Grid changes
uiManager.onGridChange((settings) => {
  if (settings.size !== currentGridSettings.size || settings.spacing !== currentGridSettings.spacing) {
    // Regenerate grid geometry
    gridGenerator.size = settings.size;
    gridGenerator.spacing = settings.spacing;
    const newData = gridGenerator.createGrid();

    // Update mesh geometry
    gridMesh.vertices = newData.Vertices as Float32Array;
    gridMesh.geometryNeedsUpdate = true;
  }

  gridMesh.visible = settings.visible;
  currentGridSettings = { ...settings };
});



// Store references to created objects
const createdObjects: Map<string, any> = new Map();
let selectedObject: any = null;
console.log(selectedObject);

// Scene graph update counter
let frameCount = 0;
let wasGizmoDragging = false;

// Update scene graph
function updateSceneGraph() {
  const sceneObjects: any[] = [];

  const getNodeWeight = (type: string): number => {
    if (!type) return 1;
    if (type === "Camera") return 3;
    if (type.includes("Light") || type === "Light") return 2;
    return 1;
  };

  const convertNode = (node: SceneNode): any => {
    const convertedChildren = node.children
      .filter(child => {
        const isGizmo = (child as any).isGizmoPart || child.type?.startsWith("Gizmo-");
        return !isGizmo;
      })
      .map(child => convertNode(child));

    // Sort children: Mesh (1), Light (2), Camera (3)
    convertedChildren.sort((a, b) => getNodeWeight(a.type) - getNodeWeight(b.type));

    return {
      uuid: node.uuid,
      name: node.name || node.type || "Object",
      type: node.type,
      isGizmoPart: (node as any).isGizmoPart || false,
      visible: (node as any).visible !== false,
      children: convertedChildren
    };
  };

  // Get root nodes from scene manager
  const roots = scene.getRootNodes();
  roots.forEach(root => {
    const isGizmo = (root as any).isGizmoPart || root.type?.startsWith("Gizmo-");
    if (root.type !== "Grid-Geometry" && !isGizmo) {
      sceneObjects.push(convertNode(root));
    }
  });

  // Add camera
  const cameraLabel = camera.projectionType === "orthographic" ? `Orthographic Camera` : `Perspective Camera`;
  sceneObjects.push({
    uuid: camera.uuid,
    name: cameraLabel,
    type: "Camera",
  });

  // Sort root nodes: Mesh (1), Light (2), Camera (3)
  sceneObjects.sort((a, b) => getNodeWeight(a.type) - getNodeWeight(b.type));

  uiManager.updateSceneGraph(sceneObjects);
}

// Handle reparenting
uiManager.onNodeReparent((childUuid, parentUuid) => {
  const findNode = (nodes: SceneNode[], uuid: string): SceneNode | null => {
    for (const node of nodes) {
      if (node.uuid === uuid) return node;
      const found = findNode(node.children, uuid);
      if (found) return found;
    }
    return null;
  };

  const allNodes = scene.nodes;
  const childNode = findNode(allNodes, childUuid);
  const parentNode = parentUuid ? findNode(allNodes, parentUuid) : null;

  if (childNode) {
    childNode.setParent(parentNode);
    updateSceneGraph();
    triggerAutoSave();
    console.log(`Reparented ${childNode.name} to ${parentNode ? parentNode.name : 'Root'}`);
  }
});

// Handle node visibility toggle from scene graph
uiManager.onNodeVisibility((uuid: string, visible: boolean) => {
  const targetNode = findObjectByUUID(uuid);
  if (!targetNode) return;

  const oldVisible = (targetNode as any).visible !== false;
  if (oldVisible === visible) return;

  const setVisibilityRecursive = (node: SceneNode, v: boolean) => {
    (node as any).visible = v;
    for (const child of node.children) {
      setVisibilityRecursive(child, v);
    }
  };

  commandHistory.execute({
    name: `${visible ? "Show" : "Hide"} ${targetNode.name || targetNode.type || "Object"}`,
    execute: () => {
      setVisibilityRecursive(targetNode, visible);
      if (selectedObject === targetNode && !visible) {
        if (events.gizmo) events.gizmo.visible = false;
      }
      updateSceneGraph();
    },
    undo: () => {
      setVisibilityRecursive(targetNode, oldVisible);
      updateSceneGraph();
    }
  }, true);
});

// Handle node deletion from scene graph
uiManager.onNodeDelete((uuid: string) => {
  deleteObjectFromScene(uuid);
});

// Handle object selection from Scene Graph tree UI
uiManager.onObjectSelect((uuid: string) => {
  const foundObject = findObjectByUUID(uuid);
  if (!foundObject) return;

  selectedObject = foundObject;
  previousSelectedUUID = uuid;
  updateObjectProperties(foundObject);

  program = unifiedProgram;
  gl.useProgram(program);

  if (foundObject instanceof RenderableMeshObject || (foundObject instanceof SceneNode && !(foundObject instanceof LightNode))) {
    events.selectedObject = foundObject;
    events.isObjectSelected = true;
    events.select = [foundObject];

    if (events.webgl) {
      events.webgl.selectedObject = foundObject;
    }

    if (events.gizmo) {
      events.gizmo.visible = true;
      events.updateGizmoPosition(foundObject);
      if (!events.gizmo.gizmoMeshes.length) {
        events.gizmo.addToScene(scene);
      }
    }
  } else {
    // Light or Camera selected from UI - clear viewport selection
    events.selectedObject = null;
    events.isObjectSelected = false;
    events.select = [];
    if (events.gizmo) {
      events.gizmo.visible = false;
      events.gizmo.removeFromScene(scene);
    }
  }
});

// Update object properties in UI
function updateObjectProperties(obj: any) {
  const objectType = obj.type || "Unknown";
  const objectUUID = obj.uuid || "-";

  // Update type and UUID
  const typeElement = document.getElementById("object-type");
  const uuidElement = document.getElementById("object-uuid");
  if (typeElement) typeElement.textContent = objectType;
  if (uuidElement) uuidElement.textContent = objectUUID;

  // Update transform properties
  const pos = obj.position || (obj === camera ? camera.eye : null);
  if (pos) {
    (document.getElementById("pos-x") as HTMLInputElement).value = (pos.x as number)?.toFixed(2) || "0.00";
    (document.getElementById("pos-y") as HTMLInputElement).value = (pos.y as number)?.toFixed(2) || "0.00";
    (document.getElementById("pos-z") as HTMLInputElement).value = (pos.z as number)?.toFixed(2) || "0.00";
  }

  if (obj.rotate) {
    (document.getElementById("rot-x") as HTMLInputElement).value = obj.rotate.x?.toFixed(2) || "0.00";
    (document.getElementById("rot-y") as HTMLInputElement).value = obj.rotate.y?.toFixed(2) || "0.00";
    (document.getElementById("rot-z") as HTMLInputElement).value = obj.rotate.z?.toFixed(2) || "0.00";
  }

  if (obj.scale) {
    (document.getElementById("scale-x") as HTMLInputElement).value = obj.scale.x?.toFixed(2) || "1.00";
    (document.getElementById("scale-y") as HTMLInputElement).value = obj.scale.y?.toFixed(2) || "1.00";
    (document.getElementById("scale-z") as HTMLInputElement).value = obj.scale.z?.toFixed(2) || "1.00";
  }

  // Update material properties if it's a mesh
  if (obj instanceof RenderableMeshObject && obj.material) {
    const material = obj.material;
    if (material.color) {
      const colorHex = rgbToHex(material.color[0], material.color[1], material.color[2]);
      (document.getElementById("base-color-input") as HTMLInputElement).value = colorHex;
      (document.getElementById("base-color-swatch") as HTMLElement).style.backgroundColor = colorHex;
    }
    (document.getElementById("metallic-slider") as HTMLInputElement).value = (material.metallic || 0.5).toString();
    (document.getElementById("metallic-value") as HTMLElement).textContent = (material.metallic || 0.5).toFixed(2);

    (document.getElementById("roughness-slider") as HTMLInputElement).value = (material.roughness || 0.2).toString();
    (document.getElementById("roughness-value") as HTMLElement).textContent = (material.roughness || 0.2).toFixed(2);

    (document.getElementById("specular-slider") as HTMLInputElement).value = (material.specular || 16).toString();
    (document.getElementById("specular-value") as HTMLElement).textContent = Math.round(material.specular || 16).toString();

    (document.getElementById("alpha-slider") as HTMLInputElement).value = (material.alpha || 1).toString();
    (document.getElementById("alpha-value") as HTMLElement).textContent = (material.alpha || 1).toFixed(2);

    if (material.emissionColor) {
      const emissionHex = rgbToHex(material.emissionColor[0], material.emissionColor[1], material.emissionColor[2]);
      (document.getElementById("emission-color-input") as HTMLInputElement).value = emissionHex;
      (document.getElementById("emission-color-swatch") as HTMLElement).style.backgroundColor = emissionHex;
    }
    (document.getElementById("emission-intensity-slider") as HTMLInputElement).value = (material.emissionIntensity || 0).toString();
    (document.getElementById("emission-intensity-value") as HTMLElement).textContent = (material.emissionIntensity || 0).toFixed(1);
  }

  // Update light properties if it's a light
  const lightPanel = document.getElementById("light-properties-panel");
  if (obj instanceof PointLightNode || obj instanceof SpotLightNode || obj instanceof DirectionalLightNode) {
    if (lightPanel) lightPanel.style.display = "block";

    // Show/hide groups based on light type
    const positionGroup = document.getElementById("light-position-group");
    const directionGroup = document.getElementById("light-direction-group");
    const radiusGroup = document.getElementById("light-radius-group");
    const angleGroup = document.getElementById("light-angle-group");

    if (obj instanceof PointLightNode) {
      (document.getElementById("light-type") as HTMLElement).textContent = "Point Light";
      if (positionGroup) positionGroup.style.display = "block";
      if (directionGroup) directionGroup.style.display = "none";
      if (radiusGroup) radiusGroup.style.display = "block";
      if (angleGroup) angleGroup.style.display = "none";

      (document.getElementById("light-pos-x") as HTMLInputElement).value = obj.position.x.toFixed(2);
      (document.getElementById("light-pos-y") as HTMLInputElement).value = obj.position.y.toFixed(2);
      (document.getElementById("light-pos-z") as HTMLInputElement).value = obj.position.z.toFixed(2);

      (document.getElementById("light-radius-slider") as HTMLInputElement).value = obj.radius.toString();
      (document.getElementById("light-radius-value") as HTMLElement).textContent = obj.radius.toFixed(1);

      const colorHex = rgbToHex(obj.color[0], obj.color[1], obj.color[2]);
      (document.getElementById("light-color-input") as HTMLInputElement).value = colorHex;
      (document.getElementById("light-color-swatch") as HTMLElement).style.backgroundColor = colorHex;

      (document.getElementById("light-intensity-slider") as HTMLInputElement).value = obj.intensity.toString();
      (document.getElementById("light-intensity-value") as HTMLElement).textContent = obj.intensity.toFixed(1);

    } else if (obj instanceof SpotLightNode) {
      (document.getElementById("light-type") as HTMLElement).textContent = "Spot Light";
      if (positionGroup) positionGroup.style.display = "block";
      if (directionGroup) directionGroup.style.display = "block";
      if (radiusGroup) radiusGroup.style.display = "none";
      if (angleGroup) angleGroup.style.display = "block";

      (document.getElementById("light-pos-x") as HTMLInputElement).value = obj.position.x.toFixed(2);
      (document.getElementById("light-pos-y") as HTMLInputElement).value = obj.position.y.toFixed(2);
      (document.getElementById("light-pos-z") as HTMLInputElement).value = obj.position.z.toFixed(2);

      (document.getElementById("light-dir-x") as HTMLInputElement).value = obj.direction[0].toFixed(2);
      (document.getElementById("light-dir-y") as HTMLInputElement).value = obj.direction[1].toFixed(2);
      (document.getElementById("light-dir-z") as HTMLInputElement).value = obj.direction[2].toFixed(2);

      const angleDegrees = (obj.angle * 180) / Math.PI;
      (document.getElementById("light-angle-slider") as HTMLInputElement).value = angleDegrees.toString();
      (document.getElementById("light-angle-value") as HTMLElement).textContent = Math.round(angleDegrees).toString();

      const colorHex = rgbToHex(obj.color[0], obj.color[1], obj.color[2]);
      (document.getElementById("light-color-input") as HTMLInputElement).value = colorHex;
      (document.getElementById("light-color-swatch") as HTMLElement).style.backgroundColor = colorHex;

      (document.getElementById("light-intensity-slider") as HTMLInputElement).value = obj.intensity.toString();
      (document.getElementById("light-intensity-value") as HTMLElement).textContent = obj.intensity.toFixed(1);

    } else if (obj instanceof DirectionalLightNode) {
      (document.getElementById("light-type") as HTMLElement).textContent = "Directional Light";
      if (positionGroup) positionGroup.style.display = "none";
      if (directionGroup) directionGroup.style.display = "block";
      if (radiusGroup) radiusGroup.style.display = "none";
      if (angleGroup) angleGroup.style.display = "none";

      (document.getElementById("light-dir-x") as HTMLInputElement).value = obj.direction[0].toFixed(2);
      (document.getElementById("light-dir-y") as HTMLInputElement).value = obj.direction[1].toFixed(2);
      (document.getElementById("light-dir-z") as HTMLInputElement).value = obj.direction[2].toFixed(2);

      const colorHex = rgbToHex(obj.color[0], obj.color[1], obj.color[2]);
      (document.getElementById("light-color-input") as HTMLInputElement).value = colorHex;
      (document.getElementById("light-color-swatch") as HTMLElement).style.backgroundColor = colorHex;

      (document.getElementById("light-intensity-slider") as HTMLInputElement).value = obj.intensity.toString();
      (document.getElementById("light-intensity-value") as HTMLElement).textContent = obj.intensity.toFixed(1);
    }
  } else {
    if (lightPanel) lightPanel.style.display = "none";
  }

  // Update camera properties if it's a camera
  if (obj === camera) {
    const cameraPanel = document.getElementById("camera-properties-panel");
    if (cameraPanel) cameraPanel.style.display = "block";
    const projType = (camera as any).projectionType || "perspective";
    (document.getElementById("camera-type") as HTMLElement).textContent = projType.charAt(0).toUpperCase() + projType.slice(1);
    (document.getElementById("camera-pos-x") as HTMLInputElement).value = isNaN(camera.eye.x) ? "0.00" : camera.eye.x.toFixed(2);
    (document.getElementById("camera-pos-y") as HTMLInputElement).value = isNaN(camera.eye.y) ? "0.00" : camera.eye.y.toFixed(2);
    (document.getElementById("camera-pos-z") as HTMLInputElement).value = isNaN(camera.eye.z) ? "0.00" : camera.eye.z.toFixed(2);

    // Sync rotation UI with internal camera orbit angles
    if (events) {
      (document.getElementById("rot-x") as HTMLInputElement).value = (events.rotationX * events.sensitivity).toFixed(2);
      (document.getElementById("rot-y") as HTMLInputElement).value = (events.rotationY * events.sensitivity).toFixed(2);
      (document.getElementById("rot-z") as HTMLInputElement).value = "0.00";
    }
  } else {
    const cameraPanel = document.getElementById("camera-properties-panel");
    if (cameraPanel) cameraPanel.style.display = "none";
  }
}

// Clear object properties from UI when no object is selected
function clearObjectProperties() {
  // Reset type and UUID display
  const typeElement = document.getElementById("object-type");
  const uuidElement = document.getElementById("object-uuid");
  if (typeElement) typeElement.textContent = "-";
  if (uuidElement) uuidElement.textContent = "-";

  // Reset transform inputs
  const transformInputs = ["pos-x", "pos-y", "pos-z", "rot-x", "rot-y", "rot-z", "scale-x", "scale-y", "scale-z"];
  transformInputs.forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = id.startsWith("scale") ? "1.00" : "0.00";
  });

  // Reset material properties
  const colorSwatches = [
    { input: "base-color-input", swatch: "base-color-swatch", default: "#ffffff" },
    { input: "emission-color-input", swatch: "emission-color-swatch", default: "#000000" }
  ];
  colorSwatches.forEach(pair => {
    const input = document.getElementById(pair.input) as HTMLInputElement;
    const swatch = document.getElementById(pair.swatch) as HTMLElement;
    if (input) input.value = pair.default;
    if (swatch) swatch.style.backgroundColor = pair.default;
  });

  const sliders = [
    { id: "metallic-slider", valId: "metallic-value", default: "0.50" },
    { id: "roughness-slider", valId: "roughness-value", default: "0.50" },
    { id: "specular-slider", valId: "specular-value", default: "16" },
    { id: "alpha-slider", valId: "alpha-value", default: "1.00" },
    { id: "emission-intensity-slider", valId: "emission-intensity-value", default: "0.0" }
  ];
  sliders.forEach(slider => {
    const el = document.getElementById(slider.id) as HTMLInputElement;
    const valEl = document.getElementById(slider.valId) as HTMLElement;
    if (el) el.value = slider.default;
    if (valEl) valEl.textContent = slider.default;
  });

  // Reset light properties
  const lightType = document.getElementById("light-type");
  if (lightType) lightType.textContent = "-";

  const lightInputs = ["light-pos-x", "light-pos-y", "light-pos-z", "light-dir-x", "light-dir-y", "light-dir-z"];
  lightInputs.forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = "0.00";
  });

  const lightSliders = [
    { id: "light-radius-slider", valId: "light-radius-value", default: "2.0" },
    { id: "light-angle-slider", valId: "light-angle-value", default: "36" },
    { id: "light-intensity-slider", valId: "light-intensity-value", default: "1.0" }
  ];
  lightSliders.forEach(slider => {
    const el = document.getElementById(slider.id) as HTMLInputElement;
    const valEl = document.getElementById(slider.valId) as HTMLElement;
    if (el) el.value = slider.default;
    if (valEl) valEl.textContent = slider.default;
  });

  const lightColorInput = document.getElementById("light-color-input") as HTMLInputElement;
  const lightColorSwatch = document.getElementById("light-color-swatch") as HTMLElement;
  if (lightColorInput) lightColorInput.value = "#ffffff";
  if (lightColorSwatch) lightColorSwatch.style.backgroundColor = "#ffffff";

  // Reset camera properties
  const cameraType = document.getElementById("camera-type");
  if (cameraType) cameraType.textContent = "-";

  ["camera-pos-x", "camera-pos-y", "camera-pos-z"].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = "0.00";
  });
}

// Helper function to convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Initialize scene graph
updateSceneGraph();

// Handle transform changes from UI
uiManager.onTransformChange((transform: any) => {
  if (selectedObject) {
    if (selectedObject instanceof SceneNode) {
      if (transform.position) {
        if (!isNaN(transform.position.x)) selectedObject.position.x = transform.position.x;
        if (!isNaN(transform.position.y)) selectedObject.position.y = transform.position.y;
        if (!isNaN(transform.position.z)) selectedObject.position.z = transform.position.z;
        selectedObject.updateLocalMatrix();
      }

      if (transform.rotation && !(selectedObject instanceof LightNode)) {
        if (!isNaN(transform.rotation.x)) selectedObject.rotate.x = transform.rotation.x;
        if (!isNaN(transform.rotation.y)) selectedObject.rotate.y = transform.rotation.y;
        if (!isNaN(transform.rotation.z)) selectedObject.rotate.z = transform.rotation.z;
        selectedObject.ObjectRotation();
      }

      if (transform.scale && !(selectedObject instanceof LightNode)) {
        if (!isNaN(transform.scale.x)) selectedObject.scale.x = transform.scale.x;
        if (!isNaN(transform.scale.y)) selectedObject.scale.y = transform.scale.y;
        if (!isNaN(transform.scale.z)) selectedObject.scale.z = transform.scale.z;
        selectedObject.updateScale();
      }

      // Update gizmo
      if (events.gizmo) {
        if (events.select && events.select.length > 1) {
          events.updateGizmoPositionForMultiSelection();
        } else {
          events.updateGizmoPosition(selectedObject);
        }
      }
    } else if (selectedObject === camera) {
      if (transform.position) {
        camera.eye.x = transform.position.x;
        camera.eye.y = transform.position.y;
        camera.eye.z = transform.position.z;
        camera.OrbitCamera();
        events.updateOrbitParametersFromEye(camera);
      }

      if (transform.rotation) {
        // Allow updating orbit angles from UI
        events.rotationX = transform.rotation.x / events.sensitivity;
        events.rotationY = transform.rotation.y / events.sensitivity;
        const pos = events.controlEvent();
        camera.eye = { x: pos[0], y: pos[1], z: pos[2] };
        camera.OrbitCamera();
      }
    }
  }
  triggerAutoSave();
});

// Handle texture library selection
uiManager.onTextureSelect(async (type, url) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject) {
    try {
      if (url === "") {
        if (type === "texture") {
          selectedObject.texture = null;
          selectedObject.textureURL = null;
          selectedObject.image = null;
        } else {
          selectedObject.normalMap = null;
          selectedObject.normalMapURL = null;
          selectedObject.normalMapImage = null;
        }
      } else {
        const textureData = await Texture.loadTextureAsync(url);
        if (type === "texture") {
          selectedObject.texture = textureData.texture;
          selectedObject.textureURL = textureData.base64Image || url;
          selectedObject.image = (textureData.base64Image || url) as any;
        } else {
          selectedObject.normalMap = textureData.texture;
          selectedObject.normalMapURL = textureData.base64Image || url;
          selectedObject.normalMapImage = (textureData.base64Image || url) as any;
        }
      }
      // Force update
      selectedObject.geometryNeedsUpdate = true;
      triggerAutoSave();
    } catch (error) {
      console.error(`Error handling unit library ${type}:`, error);
    }
  }
});

// Handle tool changes
uiManager.onToolChange((tool: string) => {
  if (events.gizmo) {
    if (tool === "translate" || tool === "rotate" || tool === "scale") {
      // Show gizmo if an object is selected
      if (events.selectedObject) {
        events.gizmo.visible = true;
      }
      events.gizmo.setMode(tool as "translate" | "rotate" | "scale");
    }
  }
});

// --- EDIT MODE UI COORDINATION ---

const objectModeBtn = document.getElementById("object-mode-btn")!;
const editModeBtn = document.getElementById("edit-mode-btn")!;
const editSubmodesDivider = document.getElementById("edit-submodes-divider")!;
const vertexSelectBtn = document.getElementById("vertex-select-btn")!;
const edgeSelectBtn = document.getElementById("edge-select-btn")!;
const faceSelectBtn = document.getElementById("face-select-btn")!;

function setEditorMode(mode: 'object' | 'edit') {
  events.editorMode = mode;
  webgl.editorMode = mode;
  
  // Update button active states
  if (mode === 'object') {
    objectModeBtn.classList.add("active");
    editModeBtn.classList.remove("active");
    
    // Hide submodes
    editSubmodesDivider.style.display = "none";
    vertexSelectBtn.style.display = "none";
    edgeSelectBtn.style.display = "none";
    faceSelectBtn.style.display = "none";
    
    // Clear selections
    events.selectedVertices = [];
    if (events.selectedObject) {
      events.selectedObject.selectedVertexIndex = undefined;
      events.selectedObject.selectedEdgeVertices = undefined;
      events.selectedObject.highlightedFace = undefined;
    }
    
    // Show gizmo centered on object
    if (events.selectedObject && events.gizmo) {
      events.gizmo.visible = true;
      events.updateGizmoPosition(events.selectedObject);
    }
  } else {
    objectModeBtn.classList.remove("active");
    editModeBtn.classList.add("active");
    
    // Show submodes
    editSubmodesDivider.style.display = "block";
    vertexSelectBtn.style.display = "flex";
    edgeSelectBtn.style.display = "flex";
    faceSelectBtn.style.display = "flex";
    
    // Set default submode to vertex
    setEditSubMode('vertex');
  }
}

function setEditSubMode(submode: 'vertex' | 'edge' | 'face') {
  events.editSubMode = submode;
  webgl.editSubMode = submode;
  
  // Update button active states
  vertexSelectBtn.classList.toggle("active", submode === 'vertex');
  edgeSelectBtn.classList.toggle("active", submode === 'edge');
  faceSelectBtn.classList.toggle("active", submode === 'face');
  
  // Clear sub-selections
  events.selectedVertices = [];
  if (events.selectedObject) {
    events.selectedObject.selectedVertexIndex = undefined;
    events.selectedObject.selectedEdgeVertices = undefined;
    events.selectedObject.highlightedFace = undefined;
  }
  
  if (events.gizmo) {
    events.gizmo.visible = false; // Hide gizmo until something is selected
  }
}

objectModeBtn.addEventListener("click", () => setEditorMode('object'));
editModeBtn.addEventListener("click", () => setEditorMode('edit'));
vertexSelectBtn.addEventListener("click", () => setEditSubMode('vertex'));
edgeSelectBtn.addEventListener("click", () => setEditSubMode('edge'));
faceSelectBtn.addEventListener("click", () => setEditSubMode('face'));

// Add keyboard shortcuts (O/E to toggle modes, 1/2/3 to toggle submodes)
document.addEventListener("keydown", (e) => {
  if (
    document.activeElement instanceof HTMLInputElement ||
    document.activeElement instanceof HTMLTextAreaElement
  ) {
    return;
  }
  const key = e.key.toLowerCase();
  if (key === "o") {
    setEditorMode('object');
  } else if (key === "e") {
    setEditorMode('edit');
  } else if (key === "1" && events.editorMode === 'edit') {
    setEditSubMode('vertex');
  } else if (key === "2" && events.editorMode === 'edit') {
    setEditSubMode('edge');
  } else if (key === "3" && events.editorMode === 'edit') {
    setEditSubMode('face');
  }
});

// Handle adding objects
// Reusable function to handle adding objects
function handleAddObject(type: string, subtype: string) {
  if (type === "mesh") {
    let geometryData: any = null;

    switch (subtype) {
      case "box":
        const boxGeometry = new BoxGeometryBuilder();
        geometryData = boxGeometry.CubeData();
        break;
      case "sphere":
        const sphereGeometry = new SphereGeometryBuilder();
        geometryData = sphereGeometry.SphereData();
        break;
      case "plane":
        const planeGeometry = new PlaneGeometryBuilder();
        geometryData = planeGeometry.PlaneData();
        break;
      case "cone":
        const coneGeometry = new ConeGeometryBuilder();
        geometryData = coneGeometry.ConeData(2.0, 1.0, 31);
        break;
      case "cylinder":
        const cylinderGeometry = new CylinderGeometryBuilder();
        geometryData = cylinderGeometry.CylinderData();
        break;
      default:
        return;
    
    }

    if (!geometryData) return;

    // Create a new material instance for each mesh to avoid shared references
    const meshMaterial = material.getMaterialProperties({
      color: MaterialColor.white,
      metallic: 0.5,
      roughness: 0.5,
      specular: 16.0,
      alpha: 1.0,
      emissionColor: [0.0, 0.0, 0.0],
      emissionIntensity: 0.0,
    });

    const mesh = new RenderableMeshObject(geometryData, meshMaterial);
    // Position mesh at origin (camera is looking at origin from z=10)
    mesh.position = { x: 0, y: 0, z: 0 };
    mesh.scale = { x: 1, y: 1, z: 1 };
    mesh.rotate = { x: 0, y: 0, z: 0 };
    mesh.updateTranslate();
    mesh.updateScale();
    // Update bounding box after setting position/scale
    if (mesh.updateBoundingBox) {
      mesh.updateBoundingBox();
    }
    // Ensure geometry needs update flag is set
    mesh.geometryNeedsUpdate = true;
    scene.add(mesh);
    createdObjects.set(mesh.uuid, mesh);
    updateSceneGraph();

    // Select the newly added mesh
    selectedObject = mesh;
    previousSelectedUUID = mesh.uuid;
    updateObjectProperties(mesh);

    // Also select it in the events system
    events.selectedObject = mesh;
    events.isObjectSelected = true;
    events.select = [mesh];
    // Start with translate tool active if none
    if (events.gizmo && !events.gizmo.currentGizmoType) {
      events.gizmo.setMode("translate");
    }
    if (events.gizmo) events.gizmo.visible = true;

    if (events.webgl) {
      events.webgl.selectedObject = mesh;
    }

    commandHistory.execute({
      name: `Add ${subtype}`,
      execute: () => {
        scene.add(mesh);
        createdObjects.set(mesh.uuid, mesh);
        selectSingleObject(mesh);
        updateSceneGraph();
      },
      undo: () => {
        scene.remove(mesh);
        createdObjects.delete(mesh.uuid);
        if (selectedObject === mesh || events.select.some((o: any) => o.uuid === mesh.uuid)) {
          deselectInEditor();
        }
        updateSceneGraph();
      }
    }, false);
  } else if (type === "light") {
    // Add new light based on subtype as a SceneNode
    let newLight: LightNode | null = null;
    const lightIndex = scene.lights.length + 1;

    switch (subtype) {
      case "point":
        newLight = new PointLightNode(`Point Light`);
        newLight.position = { x: 0, y: 3, z: 0 };
        (newLight as PointLightNode).radius = 2.0;
        program = unifiedProgram;
        break;
      case "spot":
        newLight = new SpotLightNode(`Spot Light`);
        newLight.position = { x: 0, y: 0, z: 2 };
        (newLight as SpotLightNode).direction = [0, 0, -1];
        (newLight as SpotLightNode).angle = Math.PI / 7;
        program = unifiedProgram;
        break;
      case "directional":
        newLight = new DirectionalLightNode(`Directional Light`);
        (newLight as DirectionalLightNode).direction = [0, 0, 1];
        program = unifiedProgram;
        break;
    }

    if (newLight) {
      newLight.color = [1, 1, 1];
      newLight.intensity = 1.0;
      newLight.updateLocalMatrix();
      scene.add(newLight);

      // Select the newly added light
      selectedObject = newLight;
      previousSelectedUUID = newLight.uuid;
      updateObjectProperties(newLight);
      uiManager.selectObject(newLight.uuid);

      const addedLight = newLight;
      commandHistory.execute({
        name: `Add ${subtype} Light`,
        execute: () => {
          scene.add(addedLight);
          selectSingleObject(addedLight);
          updateSceneGraph();
        },
        undo: () => {
          scene.remove(addedLight);
          if (selectedObject === addedLight) {
            deselectInEditor();
          }
          updateSceneGraph();
        }
      }, false);
    }

    gl.useProgram(program);
    updateSceneGraph();
  } else if (type === "camera") {
    if (subtype === "orthographic") {
      const aspect = canvas.clientWidth / canvas.clientHeight;
      // Calculate a sensible orthoSize based on current camera distance to maintain zoom perspective
      const distance = Math.sqrt(
        camera.eye.x * camera.eye.x +
        camera.eye.y * camera.eye.y +
        camera.eye.z * camera.eye.z
      );
      // For Perspective FOV 45, the visible height at distance D is 2 * D * tan(22.5 deg)
      // orthoSize is half-height, so D * tan(22.5 deg)
      camera.orthoSize = distance * Math.tan((45 * Math.PI) / 360);
      camera.OrthographicCamera(aspect);
    } else {
      // If switching back from ortho, calculate eye distance based on orthoSize
      const aspect = canvas.clientWidth / canvas.clientHeight;
      const distance = camera.orthoSize / Math.tan((45 * Math.PI) / 360);

      // We need to keep the direction vector from eye to center
      const currentEyeVec = [camera.eye.x, camera.eye.y, camera.eye.z];
      const currentDist = Math.sqrt(currentEyeVec[0] ** 2 + currentEyeVec[1] ** 2 + currentEyeVec[2] ** 2);

      if (currentDist > 0.0001) {
        const factor = distance / currentDist;
        camera.eye.x *= factor;
        camera.eye.y *= factor;
        camera.eye.z *= factor;
      } else {
        camera.eye.z = distance;
      }

      camera.PerspectiveCamera(45, aspect, 0.1, 1000);
      // Sync events system parameters
      events.updateOrbitParametersFromEye(camera);
    }

    // Ensure camera view matrix is updated (maintains same look-at angle)
    camera.OrbitCamera();

    // Update UI if camera is selected
    if (selectedObject === camera) {
      updateObjectProperties(camera);
    }
    updateSceneGraph();
  }
}

// Handle adding objects via UI
uiManager.onAddObject(handleAddObject);

// Handle adding objects via Keyboard Shortcuts (from SceneInteractionHandler)
// Handle adding objects via Keyboard Shortcuts (from SceneInteractionHandler)
events.onAddObject = handleAddObject;

// Handle Context Menu (Shift + A)
events.onOpenAddMenu = () => {
  const addMenuBtn = document.getElementById("add-menu-btn");
  if (addMenuBtn) {
    addMenuBtn.click();
  }
};

// Handle File Menu (Shift + F)
events.onOpenFileMenu = () => {
  const fileMenuBtn = document.getElementById("file-menu-btn");
  if (fileMenuBtn) {
    fileMenuBtn.click();
  }
};

// Handle New Scene
document.getElementById("new-scene-btn")?.addEventListener("click", () => {
  uiManager.showConfirm({
    title: "New Scene",
    message: "Create new scene? All unsaved changes will be lost.",
    confirmText: "Create New",
    cancelText: "Cancel",
    isDanger: true,
    onConfirm: () => {
      IndexedDBSceneStorage.clearSavedScene();
      // Clear all scene data
    scene.nodes = [];
    scene.objects = [];
    scene.lights = [];
    scene.grids = [];

    createdObjects.clear();
    lightInstances.clear();

    // Clear and re-add Grid
    gridGenerator = new GridHelper(currentGridSettings.size, currentGridSettings.spacing);
    gridMesh = new RenderableMeshObject(gridGenerator.createGrid());
    gridMesh.visible = currentGridSettings.visible;
    gridMesh.position = { x: 0, y: 0, z: 0 };
    gridMesh.updateTranslate();
    scene.add(gridMesh);

    // Re-add default cube
    const boxGeometry = new BoxGeometryBuilder();
    const cubeMaterial = material.getMaterialProperties({
      color: MaterialColor.red,
      metallic: 0.5,
      roughness: 0.2,
      specular: 16.0,
      alpha: 1.0,
      emissionColor: [0.0, 0.0, 0.0],
      emissionIntensity: 0.0,
    });
    const cube = new RenderableMeshObject(boxGeometry.CubeData(), cubeMaterial);
    cube.position = { x: 0, y: 0, z: 0 };
    cube.updateTranslate();
    scene.add(cube);

    // Add default point light node (Ensures it shows up in Scene Graph)
    const defaultLight = new PointLightNode("Point Light");
    defaultLight.position = { x: 0, y: 0, z: 3 };
    defaultLight.radius = 2.0;
    defaultLight.color = [1, 1, 1];
    defaultLight.intensity = 1.0;
    scene.add(defaultLight);

    // Reset master light to default
    masterLight.lightData.point.position = [];
    masterLight.lightData.point.radius = [];
    masterLight.lightData.point.color = [];
    masterLight.lightData.point.intensity = [];
    masterLight.lightData.spot.position = [];
    masterLight.lightData.spot.direction = [];
    masterLight.lightData.spot.angle = [];
    masterLight.lightData.spot.color = [];
    masterLight.lightData.spot.intensity = [];
    masterLight.lightData.directional.direction = [];
    masterLight.lightData.directional.color = [];
    masterLight.lightData.directional.intensity = [];

    // Add the default light to the tracking system
    lightInstances.set(masterLight.uuid, { light: masterLight, type: "point", index: 0 });

    masterLight.PointLight({
      lightPosition: [0.0, 0.0, 3.0],
      radius: 2.0,
      lightColor: [1.0, 1.0, 1.0],
      intensity: 2.0,
    });

    // Reset camera to Perspective and default position
    camera.eye = { x: 0, y: 0, z: 10 };
    camera.center = { x: 0, y: 0, z: 0 };
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.OrbitCamera();

    // Reset interaction handler rotation (Orbit angles)
    if (events) {
      events.rotationX = 0;
      events.rotationY = 0;
      events.updateOrbitParametersFromEye(camera);
    }

    // Deselect
    selectedObject = null;
    previousSelectedUUID = null;
    events.selectedObject = null;
    events.isObjectSelected = false;
    events.select = [];
    if (events.gizmo) {
      events.gizmo.visible = false;
      events.gizmo.removeFromScene(scene);
    }

    clearObjectProperties();
      updateSceneGraph();
    }
  });
});

// Unified model loader for files, folders, and .zip archives
async function loadModelFromFiles(inputFiles: File[] | FileList): Promise<void> {
  const files: File[] = Array.from(inputFiles);
  if (files.length === 0) return;

  let fileMap = new Map<string, File>();
  let gltfFile: File | null = null;

  // Check if a .zip archive was provided
  const zipFile = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zipFile) {
    try {
      fileMap = await ZipArchiveLoader.unzipModelArchive(zipFile);
      for (const [name, file] of fileMap) {
        if (name.endsWith(".gltf") || name.endsWith(".glb")) {
          gltfFile = file;
          break;
        }
      }
      if (!gltfFile) {
        uiManager.showAlert("ZIP Archive", "No .gltf or .glb model file found inside the ZIP archive.");
        return;
      }
    } catch (err) {
      uiManager.showAlert("ZIP Extraction Error", (err as Error).message);
      return;
    }
  } else {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      fileMap.set(file.name, file);
      if (file.name.endsWith(".gltf") || file.name.endsWith(".glb")) {
        gltfFile = file;
      }
    }
    if (!gltfFile) gltfFile = files[0];
  }

  const url = URL.createObjectURL(gltfFile);
  try {
    await loader.main([url], fileMap);
    updateSceneGraph();
    triggerAutoSave();
    if (loader.lastImportedRoot) {
      selectSingleObject(loader.lastImportedRoot);
    }
  } catch (error) {
    console.error("Error loading model:", error);
    uiManager.showAlert("Import Error", `Failed to load model: ${(error as Error).message}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Handle GLTF / GLB / ZIP file import
document.getElementById("import-gltf-btn")?.addEventListener("click", () => {
  const fileInput = document.getElementById("gltf-file-input") as HTMLInputElement;
  fileInput.click();
});

document.getElementById("gltf-file-input")?.addEventListener("change", async (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    await loadModelFromFiles(files);
    (e.target as HTMLInputElement).value = "";
  }
});

// Handle GLTF folder import
document.getElementById("import-gltf-folder-btn")?.addEventListener("click", () => {
  const folderInput = document.getElementById("gltf-folder-input") as HTMLInputElement;
  folderInput.click();
});

document.getElementById("gltf-folder-input")?.addEventListener("change", async (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    await loadModelFromFiles(files);
    (e.target as HTMLInputElement).value = "";
  }
});

// Handle drag-and-drop of 3D models (.gltf, .glb, .zip, folders) directly onto the viewport
viewportContainer.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "copy";
  }
  viewportContainer.classList.add("drag-over");
});

viewportContainer.addEventListener("dragleave", () => {
  viewportContainer.classList.remove("drag-over");
});

// Recursive folder & file reader for smooth Drag-and-Drop without browser security warnings
async function extractDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const fileList: File[] = [];
  const items = dataTransfer.items;

  async function readAllEntries(dirReader: any): Promise<any[]> {
    const entries: any[] = [];
    const read = async () => {
      const batch: any[] = await new Promise((resolve, reject) => dirReader.readEntries(resolve, reject));
      if (batch.length > 0) {
        entries.push(...batch);
        await read();
      }
    };
    await read();
    return entries;
  }

  async function traverseEntry(entry: any): Promise<void> {
    if (!entry) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      fileList.push(file);
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await readAllEntries(dirReader);
      for (const child of entries) {
        await traverseEntry(child);
      }
    }
  }

  if (items && items.length > 0) {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (typeof item.webkitGetAsEntry === "function") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(traverseEntry(entry));
          continue;
        }
      }
      const file = item.getAsFile();
      if (file) fileList.push(file);
    }
    await Promise.all(promises);
  } else if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      fileList.push(dataTransfer.files[i]);
    }
  }
  return fileList;
}

viewportContainer.addEventListener("drop", async (e) => {
  e.preventDefault();
  viewportContainer.classList.remove("drag-over");
  if (!e.dataTransfer) return;

  const files = await extractDroppedFiles(e.dataTransfer);
  if (files && files.length > 0) {
    await loadModelFromFiles(files);
  }
});

// Handle GLTF export
document.getElementById("export-gltf-btn")?.addEventListener("click", () => {
  const gltfExport = new GLTFSceneExporter();
  const gltf = gltfExport.exportSceneToGLTF(scene);
  gltfExport.saveGLTF("exported_scene", gltf);
});

// Handle texture loading
// Handle texture loading
document.getElementById("texture-file-input")?.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file && selectedObject && selectedObject instanceof RenderableMeshObject) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const texture = await Texture.loadTextureAsync(dataUrl);
        selectedObject.texture = texture.texture;
        selectedObject.textureURL = dataUrl;
        selectedObject.image = dataUrl as any;
        selectedObject.geometryNeedsUpdate = true;
        triggerAutoSave();
      } catch (error) {
        console.error("Error loading texture:", error);
      }
    };
    reader.readAsDataURL(file);
    (e.target as HTMLInputElement).value = "";
  }
});

// Handle normal map loading
document.getElementById("normal-file-input")?.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file && selectedObject && selectedObject instanceof RenderableMeshObject) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const normalMap = await Texture.loadTextureAsync(dataUrl);
        selectedObject.normalMap = normalMap.texture;
        selectedObject.normalMapURL = dataUrl;
        selectedObject.normalMapImage = dataUrl as any;
        selectedObject.geometryNeedsUpdate = true;
        triggerAutoSave();
      } catch (error) {
        console.error("Error loading normal map:", error);
      }
    };
    reader.readAsDataURL(file);
    (e.target as HTMLInputElement).value = "";
  }
});

// Handle delete from scene graph
function deleteObjectFromScene(uuid: string) {
  const targetNode = findObjectByUUID(uuid);
  if (!targetNode) return;
  executeDeleteObjects([targetNode]);
}

// Add delete functionality to scene graph items
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  const treeItem = target.closest(".tree-item") as HTMLElement;
  if (treeItem && treeItem.dataset.uuid) {
    e.preventDefault();
    const itemUuid = treeItem.dataset.uuid;
    uiManager.showConfirm({
      title: "Delete Object",
      message: "Are you sure you want to delete this object?",
      confirmText: "Delete",
      isDanger: true,
      onConfirm: () => {
        deleteObjectFromScene(itemUuid);
      }
    });
  }
});

// Single Delete/Backspace path for viewport + keyboard (same as scene-graph trash)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (
    document.activeElement instanceof HTMLInputElement ||
    document.activeElement instanceof HTMLTextAreaElement
  ) {
    return;
  }

  let toDelete: SceneNode[] = [];
  if (events.select && events.select.length > 0) {
    toDelete = events.select.filter(
      (o: any) => o && o.type !== "Grid-Geometry"
    ) as SceneNode[];
  } else if (selectedObject && (selectedObject as any).type !== "Grid-Geometry") {
    toDelete = [selectedObject as SceneNode];
  } else if (previousSelectedUUID) {
    const node = findObjectByUUID(previousSelectedUUID);
    if (node && node.type !== "Grid-Geometry") {
      toDelete = [node];
    }
  }

  if (toDelete.length === 0) return;

  e.preventDefault();
  const label =
    toDelete.length > 1
      ? `${toDelete.length} Objects`
      : toDelete[0].name || toDelete[0].type || "Selected Object";

  uiManager.showConfirm({
    title: "Delete Object",
    message: `Are you sure you want to delete <strong style="color: var(--text-white);">"${label}"</strong>?`,
    confirmText: "Delete",
    isDanger: true,
    onConfirm: () => {
      executeDeleteObjects(toDelete);
    },
  });
});

// Handle material property changes
document.getElementById("base-color-input")?.addEventListener("input", (e) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject && selectedObject.material) {
    const hex = (e.target as HTMLInputElement).value;
    const rgb = hexToRgb(hex);
    if (rgb) {
      selectedObject.material.color = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
      (document.getElementById("base-color-swatch") as HTMLElement).style.backgroundColor = hex;
      triggerAutoSave();
    }
  }
});

document.getElementById("metallic-slider")?.addEventListener("input", (e) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject && selectedObject.material) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.material.metallic = value;
    (document.getElementById("metallic-value") as HTMLElement).textContent = value.toFixed(2);
  }
  triggerAutoSave();
});

document.getElementById("roughness-slider")?.addEventListener("input", (e) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject && selectedObject.material) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.material.roughness = value;
    (document.getElementById("roughness-value") as HTMLElement).textContent = value.toFixed(2);
  }
  triggerAutoSave();
});

document.getElementById("specular-slider")?.addEventListener("input", (e) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject && selectedObject.material) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.material.specular = value;
    (document.getElementById("specular-value") as HTMLElement).textContent = value.toString();
  }
  triggerAutoSave();
});

document.getElementById("alpha-slider")?.addEventListener("input", (e) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject && selectedObject.material) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.material.alpha = value;
    (document.getElementById("alpha-value") as HTMLElement).textContent = value.toFixed(2);
  }
  triggerAutoSave();
});

document.getElementById("emission-color-input")?.addEventListener("input", (e) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject && selectedObject.material) {
    const hex = (e.target as HTMLInputElement).value;
    const rgb = hexToRgb(hex);
    if (rgb) {
      selectedObject.material.emissionColor = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
      (document.getElementById("emission-color-swatch") as HTMLElement).style.backgroundColor = hex;
    }
  }
  triggerAutoSave();
});

document.getElementById("emission-intensity-slider")?.addEventListener("input", (e) => {
  if (selectedObject && selectedObject instanceof RenderableMeshObject && selectedObject.material) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.material.emissionIntensity = value;
    (document.getElementById("emission-intensity-value") as HTMLElement).textContent = value.toFixed(1);
  }
  triggerAutoSave();
});

// Handle camera position changes
document.getElementById("camera-pos-x")?.addEventListener("input", (e) => {
  if (selectedObject === camera) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    camera.eye.x = value;
    camera.OrbitCamera();
    // Update orbit control parameters to match new camera position
    events.updateOrbitParametersFromEye(camera);
  }
  triggerAutoSave();
});

document.getElementById("camera-pos-y")?.addEventListener("input", (e) => {
  if (selectedObject === camera) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    camera.eye.y = value;
    camera.OrbitCamera();
    // Update orbit control parameters to match new camera position
    events.updateOrbitParametersFromEye(camera);
  }
  triggerAutoSave();
});

document.getElementById("camera-pos-z")?.addEventListener("input", (e) => {
  if (selectedObject === camera) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    camera.eye.z = value;
    camera.OrbitCamera();
    // Update orbit control parameters to match new camera position
    events.updateOrbitParametersFromEye(camera);
  }
  triggerAutoSave();
});

// Handle light property changes
document.getElementById("light-pos-x")?.addEventListener("input", (e) => {
  if (selectedObject instanceof PointLightNode || selectedObject instanceof SpotLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.position.x = value;
    selectedObject.updateLocalMatrix();
  }
  triggerAutoSave();
});

document.getElementById("light-pos-y")?.addEventListener("input", (e) => {
  if (selectedObject instanceof PointLightNode || selectedObject instanceof SpotLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.position.y = value;
    selectedObject.updateLocalMatrix();
  }
  triggerAutoSave();
});

document.getElementById("light-pos-z")?.addEventListener("input", (e) => {
  if (selectedObject instanceof PointLightNode || selectedObject instanceof SpotLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.position.z = value;
    selectedObject.updateLocalMatrix();
  }
  triggerAutoSave();
});

document.getElementById("light-color-input")?.addEventListener("input", (e) => {
  if (selectedObject instanceof PointLightNode || selectedObject instanceof SpotLightNode || selectedObject instanceof DirectionalLightNode) {
    const hex = (e.target as HTMLInputElement).value;
    const rgb = hexToRgb(hex);
    if (rgb) {
      selectedObject.color = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
      (document.getElementById("light-color-swatch") as HTMLElement).style.backgroundColor = hex;
    }
  }
  triggerAutoSave();
});

document.getElementById("light-intensity-slider")?.addEventListener("input", (e) => {
  if (selectedObject instanceof PointLightNode || selectedObject instanceof SpotLightNode || selectedObject instanceof DirectionalLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.intensity = value;
    (document.getElementById("light-intensity-value") as HTMLElement).textContent = value.toFixed(1);
  }
  triggerAutoSave();
});

// Handle light radius changes (Point Light)
document.getElementById("light-radius-slider")?.addEventListener("input", (e) => {
  if (selectedObject instanceof PointLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.radius = value;
    (document.getElementById("light-radius-value") as HTMLElement).textContent = value.toFixed(1);
  }
});

// Handle light angle changes (Spot Light)
document.getElementById("light-angle-slider")?.addEventListener("input", (e) => {
  if (selectedObject instanceof SpotLightNode) {
    const valueDegrees = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.angle = (valueDegrees * Math.PI) / 180;
    (document.getElementById("light-angle-value") as HTMLElement).textContent = Math.round(valueDegrees).toString();
  }
});

// Handle light direction changes (Spot and Directional Lights)
document.getElementById("light-dir-x")?.addEventListener("input", (e) => {
  if (selectedObject instanceof SpotLightNode || selectedObject instanceof DirectionalLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.direction[0] = value;
  }
});

document.getElementById("light-dir-y")?.addEventListener("input", (e) => {
  if (selectedObject instanceof SpotLightNode || selectedObject instanceof DirectionalLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.direction[1] = value;
  }
});

document.getElementById("light-dir-z")?.addEventListener("input", (e) => {
  if (selectedObject instanceof SpotLightNode || selectedObject instanceof DirectionalLightNode) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    selectedObject.direction[2] = value;
  }
});

// Helper function to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : null;
}

// WebGL to WebGPU toggle (dummy)
document.getElementById("webgl-toggle")?.addEventListener("click", (e) => {
  const toggle = e.target as HTMLElement;
  toggle.classList.toggle("active");

  if (toggle.classList.contains("active")) {
    uiManager.showAlert("WebGPU", "WebGPU implementation is coming soon! Currently, the engine uses WebGL 1.0 for high-performance rendering.");
    // Revert back to WebGL as WebGPU is not yet available
    toggle.classList.remove("active");
  } else {
    console.log("Switched to WebGL");
  }
});
function animate() {
  // Update view helper animations and rendering
  viewHelper.update();

  const controls = events.controlEvent();
  const isGizmoDragging = events.isGizmoInteraction;

  // Skip heavy transform UI rebinds while gizmo-dragging (throttled properties cover live values)
  if (!isGizmoDragging) {
    events.updateUI(
      events,
      document.getElementById("object-uuid") as HTMLElement,
      document.getElementById("object-type") as HTMLElement
    );
  }

  // Check if selection changed from viewport (mouse clicks)
  const currentViewportSelected = events.select && events.select.length > 0 ? events.select[0] : null;
  const currentViewportUUID = currentViewportSelected ? currentViewportSelected.uuid : null;

  // Only update if selection comes from viewport OR if selection was cleared in viewport
  // and we weren't already selecting something else (like a light) via the UI tree.
  if (currentViewportUUID !== null) {
    // Viewport selection took priority
    if (currentViewportUUID !== previousSelectedUUID) {
      previousSelectedUUID = currentViewportUUID;
      selectedObject = currentViewportSelected;
      updateObjectProperties(currentViewportSelected);
      updateSceneGraph();
    }
  } else if (previousSelectedUUID !== null) {
    // Viewport selection is empty. 
    // check if we have a "non-viewport" object selected (Camera or Light)
    const isPickByTree = selectedObject && (selectedObject instanceof LightNode || selectedObject === camera);

    if (!isPickByTree) {
      // Clear selection because viewport is empty and nothing special picked from tree
      selectedObject = null;
      previousSelectedUUID = null;
      // Clear properties
      clearObjectProperties();
      updateSceneGraph();
    }
  }

  // Properties panel: throttle during gizmo drag; flush final values on release
  if (isGizmoDragging && selectedObject) {
    if (frameCount % 5 === 0) {
      updateObjectProperties(selectedObject);
    }
    wasGizmoDragging = true;
  } else if (wasGizmoDragging) {
    if (selectedObject) updateObjectProperties(selectedObject);
    wasGizmoDragging = false;
  }

  // Update camera
  camera.eye = { x: controls[0], y: controls[1], z: controls[2] };
  camera.OrbitCamera();

  // Update camera UI if camera is selected
  if (selectedObject === camera) {
    (document.getElementById("camera-pos-x") as HTMLInputElement).value = camera.eye.x.toFixed(2);
    (document.getElementById("camera-pos-y") as HTMLInputElement).value = camera.eye.y.toFixed(2);
    (document.getElementById("camera-pos-z") as HTMLInputElement).value = camera.eye.z.toFixed(2);
  }

  // Sync isSelected flag — rebuild UUID set + flags only when selection or object count changes
    const selectionCacheKey = (events.select || []).map((o: any) => o?.uuid || '').join(',') + '|' + (selectedObject?.uuid || '') + '|' + scene.objects.length;
    if (selectionCacheKey !== lastSelectionCacheKey) {
      lastSelectionCacheKey = selectionCacheKey;
      cachedSelectedUUIDs.clear();
      const collectSelected = (node: any) => {
        if (!node) return;
        cachedSelectedUUIDs.add(node.uuid);
        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            collectSelected(child);
          }
        }
      };
      const selectedNodes = (events.select || []).slice();
      if (selectedObject && !selectedNodes.some((o: any) => o.uuid === selectedObject.uuid)) {
        selectedNodes.push(selectedObject);
      }
      for (const node of selectedNodes) {
        collectSelected(node);
      }

      scene.objects.forEach((obj: any) => {
        obj.isSelected = cachedSelectedUUIDs.has(obj.uuid);
      });
    }

  // Render
  webgl.Render(program, camera, scene);

  // Update status bar stats
  uiManager.updateStatusBar(webgl.getStats());

  // Periodic scene graph rebuild — skip while gizmo-dragging (avoids ~1s FPS dips)
  if (!isGizmoDragging && frameCount % 60 === 0) {
    updateSceneGraph();
  }
  frameCount++;

  requestAnimationFrame(animate);
}

// Global Keyboard Shortcuts for Undo / Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    (e.target as HTMLElement)?.isContentEditable
  ) {
    return;
  }

  // Undo: Ctrl+Z or Cmd+Z (without Shift)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    e.stopPropagation();
    commandHistory.undo();
    return;
  }

  // Redo: Ctrl+Y or Cmd+Y, or Ctrl+Shift+Z / Cmd+Shift+Z
  if (
    ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) ||
    ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "z" || e.key === "Z"))
  ) {
    e.preventDefault();
    e.stopPropagation();
    commandHistory.redo();
    return;
  }
});

// Wait for IndexedDB restore (or add defaults) BEFORE first render — prevents deleted-cube flash
(async () => {
  let restored = false;
  try {
    const saved = await IndexedDBSceneStorage.loadScene();
    if (saved && saved.nodes && saved.nodes.length > 0) {
      console.log(`[IndexedDB] Restoring saved session from ${new Date(saved.timestamp).toLocaleTimeString()}...`);
      await IndexedDBSceneStorage.restoreScene(
        saved,
        scene,
        createdObjects,
        gl,
        material,
        camera
      );
      // Sync orbit controller with restored camera (otherwise animate() overwrites eye)
      if (saved.camera) {
        if (
          typeof saved.camera.rotationX === "number" &&
          typeof saved.camera.rotationY === "number" &&
          typeof saved.camera.radius === "number"
        ) {
          events.rotationX = saved.camera.rotationX;
          events.rotationY = saved.camera.rotationY;
          events.cameraRadiuscam = saved.camera.radius;
          events.scalervalue = saved.camera.radius;
        } else {
          events.updateOrbitParametersFromEye(camera);
        }
      }
      restored = true;
      console.log("[IndexedDB] Session successfully restored!");
    }
  } catch (err) {
    console.warn("[IndexedDB] Session auto-restore error:", err);
  }

  if (!restored) {
    addDefaultStarterContent();
  }

  updateSceneGraph();
  animate();
})();
