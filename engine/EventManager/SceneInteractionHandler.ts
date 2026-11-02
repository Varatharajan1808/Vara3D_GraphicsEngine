export interface ObjectTransformSnapshot {
  uuid: string;
  position: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

import { mat4, vec3, vec4 } from "../MathLibrary/gl-matrix.js";
import { CameraController } from "../CameraSystem/CameraController";
import { TransformGizmoController } from "../CoreUtilities/TransformGizmoController";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { GLTFSceneExporter } from "../AssetImporter/GLTFSceneExporter";
import { WebGLRenderEngine } from "../Renderer/Webgl/WebGLRenderEngine";
import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";



type Vec3 = number[] | Float32Array;

enum Axis {
  X = "X",
  Y = "Y",
  Z = "Z",
  XY = "XY",
  XZ = "XZ",
  YZ = "YZ",
  XYZ = "XYZ",
  SCREEN = "SCREEN",
}

interface RayIntersectionResult {
  selectObject?: RenderableMeshObject[];
  answer?: boolean;
  selectedFace?: {
    faceIndex: number;
    vertexIndices: number[];
    intersectionPoint: Vec3;
  };
}

interface SelectableObjectType {
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  uuid?: string;
  type?: string;
  worldMatrix: any; // Changed from modelMatrix
  updateTranslate: () => void;
  updateLocalMatrix: () => void; // Added for new hierarchy system
  updateScale: () => void;
  ObjectRotation: () => void;
}

export class SceneInteractionHandler {
  scene: SceneHierarchyManager;
  camera: CameraController;
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  move: boolean;
  isPressed: boolean;
  inputBindingsInitialized: boolean;
  isObjectSelected: boolean;
  isRotationMode: boolean;
  isScaleMode: boolean;
  isGizmoInteraction: boolean;
  isTransformationActive: boolean;
  activeButton: number = -1;
  hasDragged: boolean = false;
  cameraRadiuscam: number = 0;
  scalervalue: number = 0;
  rotationX: number = 0;
  rotationY: number = 0;
  prevMouseX: number;
  prevMouseY: number;
  sensitivity: number;
  objectSensitivity: number;
  mouseX: number;
  mouseY: number;
  rayDirection: number[];
  rayOrigin: number[];
  select: any[];
  rotationCenter: number[];
  objectPivotPosition: { x: number; y: number; z: number };
  originalObjectPosition: { x: number; y: number; z: number };
  originalObjectRotation: { x: number; y: number; z: number };
  originalObjectScale: { x: number; y: number; z: number };
  dragStartPosition: { x: number; y: number };
  activeAxis: Axis | null;
  selectedObject: any;
  gizmo: TransformGizmoController | null;
  webgl: WebGLRenderEngine;
  initialMouseAngle: number = 0;
  editorMode: string = 'object';
  editSubMode: string = 'vertex';
  selectedVertices: number[] = [];
  originalVertexPositions: number[] = [];
  isDirectDragging: boolean = false;
  /** Local-space unit normal of the currently selected face (face edit Shift+drag lock). */
  selectedFaceNormal: Vec3 | null = null;
  onSelect?: (uuid: string | null) => void;
  onMultiSelect?: (uuids: string[]) => void;
  onDelete?: (uuid: string) => void;
  onDeleteNodes?: (nodes: any[]) => void;
  onTransformComplete?: (
    startStates: ObjectTransformSnapshot[],
    endStates: ObjectTransformSnapshot[]
  ) => void;
  onGeometryChange?: (
    mesh: RenderableMeshObject,
    prevVertices: number[],
    newVertices: number[]
  ) => void;
  /** Fired after camera orbit/pan/zoom gesture ends (for autosave). */
  onViewChange?: () => void;
  transformStartSnapshots: ObjectTransformSnapshot[] = [];
  isMarqueeMode: boolean = false;
  isMarqueeSelecting: boolean = false;
  marqueeStart: { x: number; y: number } = { x: 0, y: 0 };
  marqueeBoxEl: HTMLElement | null = null;
  originalMultiPositions: Map<string, { x: number; y: number; z: number }> = new Map();
  onAddObject?: (type: string, subtype: string) => void;
  onOpenAddMenu?: () => void;
  onOpenFileMenu?: () => void;

  constructor(
    scene: SceneHierarchyManager,
    camera: CameraController,
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext
  ) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.gl = gl;
    this.webgl = new WebGLRenderEngine(this.canvas);
    this.gizmo = new TransformGizmoController();
    this.webgl.setGizmo(this.gizmo);
    this.prevMouseX = 0;
    this.prevMouseY = 0;
    this.sensitivity = 0.2;
    this.objectSensitivity = 0.01;

    // Initialize orbit parameters from camera eye
    this.activeButton = -1;
    this.hasDragged = false;
    this.updateOrbitParametersFromEye(camera);

    this.mouseX = 0;
    this.mouseY = 0;
    this.move = false;
    this.isPressed = false;
    this.inputBindingsInitialized = false;
    this.isObjectSelected = false;
    this.selectedObject = null;
    this.activeAxis = null;
    this.isRotationMode = false;
    this.isScaleMode = false;
    this.gizmo.visible = false;
    this.marqueeBoxEl = document.getElementById("marquee-selection-box");
    if (!this.marqueeBoxEl && this.canvas.parentElement) {
      this.marqueeBoxEl = document.createElement("div");
      this.marqueeBoxEl.id = "marquee-selection-box";
      this.marqueeBoxEl.className = "marquee-box";
      this.marqueeBoxEl.style.display = "none";
      this.canvas.parentElement.appendChild(this.marqueeBoxEl);
    }
    this.isGizmoInteraction = false;
    this.isTransformationActive = false;
    this.rayDirection = [0, 0, 0];
    this.rayOrigin = [0, 0, 0];
    this.select = [];
    this.originalObjectPosition = { x: 0, y: 0, z: 0 };
    this.originalObjectRotation = { x: 0, y: 0, z: 0 };
    this.originalObjectScale = { x: 1, y: 1, z: 1 };
    this.objectPivotPosition = { x: 0, y: 0, z: 0 };
    this.dragStartPosition = { x: 0, y: 0 };
    this.rotationCenter = [0, 0, 0];
    const UUID = document.getElementById("UUID");
    const Type = document.getElementById("Type");
    this.updateUI(this, UUID, Type);
    this.initBoundingBoxes();
    this.events();

    this.#setupExportButton();
  }
  #setupExportButton() {
    document.addEventListener("DOMContentLoaded", () => {
      const exportBtn = document.getElementById("exportBtn");
      if (exportBtn) {
        exportBtn.addEventListener("click", () => {
          const gltfExport = new GLTFSceneExporter();
          const gltf = gltfExport.exportSceneToGLTF(this.scene);
          gltfExport.saveGLTF("exported_scene", gltf);
        });
      }
    });
  }
  getNormalizedMousePos(
    canvas: HTMLCanvasElement,
    event: MouseEvent
  ): { x: number; y: number; z: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      z: 0,
    };
  }
  keyboardEvents(): void {
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in an input field
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      // Object Creation Shortcuts (Shift + A/F)
      if (event.shiftKey) {
        if (key === "a") {
          // Open Add Menu
          this.onOpenAddMenu?.();
          return;
        }
        if (key === "f") {
          // Open File Menu
          this.onOpenFileMenu?.();
          return;
        }
      }

      switch (key) {
        case "t":
          if (this.gizmo && this.isObjectSelected) {
            this.gizmo.setMode("translate");
          }
          break;
        case "r":
          if (this.gizmo && this.isObjectSelected) {
            this.gizmo.setMode("rotate");
          }
          break;
        case "s":
          if (this.gizmo && this.isObjectSelected) {
            this.gizmo.setMode("scale");
          }
          break;
        // Delete / Backspace: handled only in EditorApplication (confirm → deleteObjectFromScene)
        // so scene + scene-graph stay in sync. Do not delete here.
        case "escape":
          this.deselectObject();
          break;
        case "f":
          if (this.selectedObject && this.camera) {
            // Focus on object
            // Update camera center to object position
            this.camera.center = {
              x: this.selectedObject.position.x,
              y: this.selectedObject.position.y,
              z: this.selectedObject.position.z
            };

            // Re-orient camera to look at new center while maintaining distance/angle
            // Note: CameraController might need an update to respect 'center' property changes
            // For now, we manually trigger orbit update which uses 'center'
            this.camera.OrbitCamera();
          }
          break;
      }
    });
  }
  /**
   * Edit-mode sub-element pick (screen-space vertex/edge, ray face).
   * Runs BEFORE mesh raycast so corner vertex clicks don't fall through as empty space.
   * @returns true if a sub-element was selected and the click was handled
   */
  private trySelectEditSubElement(event: MouseEvent): boolean {
    const mesh = this.selectedObject;
    if (!mesh || this.editorMode !== "edit") return false;

    this.setupRay(this.mouseX, this.mouseY);

    if (this.editSubMode === "vertex") {
      let clickedVertexIndex = mesh.hoveredVertexIndex;
      if (clickedVertexIndex === undefined || clickedVertexIndex === null) {
        const res = this.checkVertexIntersections(mesh);
        clickedVertexIndex = res !== null ? res : undefined;
      }
      if (clickedVertexIndex === null || clickedVertexIndex === undefined) {
        return false;
      }

      mesh.selectedVertexIndex = clickedVertexIndex;
      mesh.selectedEdgeVertices = undefined;
      mesh.highlightedFace = undefined;
      this.selectedFaceNormal = null;
      this.selectedVertices = this.getMatchingVertices(mesh, [clickedVertexIndex]);
      this.originalVertexPositions = [...(mesh.vertices as number[])];
      this.isDirectDragging = true;
      if (this.gizmo) this.gizmo.visible = false;
      this.dragStartPosition = { x: event.clientX, y: event.clientY };
      return true;
    }

    if (this.editSubMode === "edge") {
      let clickedEdge = mesh.hoveredEdgeVertices;
      if (clickedEdge === undefined || clickedEdge === null) {
        const res = this.checkEdgeIntersections(mesh);
        clickedEdge = res !== null ? res : undefined;
      }
      if (clickedEdge === null || clickedEdge === undefined) {
        return false;
      }

      mesh.selectedEdgeVertices = clickedEdge;
      mesh.selectedVertexIndex = undefined;
      mesh.highlightedFace = undefined;
      this.selectedFaceNormal = null;
      this.selectedVertices = this.getMatchingVertices(mesh, clickedEdge);
      this.originalVertexPositions = [...(mesh.vertices as number[])];
      this.isDirectDragging = true;
      if (this.gizmo) this.gizmo.visible = false;
      this.dragStartPosition = { x: event.clientX, y: event.clientY };
      return true;
    }

    if (this.editSubMode === "face") {
      let clickedFaceIndices = mesh.hoveredFace;
      if (clickedFaceIndices === undefined || clickedFaceIndices === null) {
        const clickedFaceResult = this.checkFaceIntersections(mesh);
        if (clickedFaceResult !== null) {
          clickedFaceIndices = clickedFaceResult.vertexIndices;
        }
      }
      if (clickedFaceIndices === null || clickedFaceIndices === undefined) {
        return false;
      }

      mesh.highlightedFace = clickedFaceIndices;
      mesh.selectedVertexIndex = undefined;
      mesh.selectedEdgeVertices = undefined;
      this.selectedVertices = this.getMatchingVertices(mesh, clickedFaceIndices);
      this.originalVertexPositions = [...(mesh.vertices as number[])];
      this.selectedFaceNormal =
        clickedFaceIndices.length >= 3
          ? this.calculateTriangleNormal(mesh.vertices as number[], [
              clickedFaceIndices[0],
              clickedFaceIndices[1],
              clickedFaceIndices[2],
            ])
          : null;
      this.isDirectDragging = true;
      if (this.gizmo) this.gizmo.visible = false;
      this.dragStartPosition = { x: event.clientX, y: event.clientY };
      return true;
    }

    return false;
  }

  rayEvents(): void {
    this.canvas.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.button === 2) {
        // Ignore right clicks for selection/raycasting
        return;
      }
      event.preventDefault();
      const mousePos = this.getNormalizedMousePos(this.canvas, event);
      this.mouseX = mousePos.x;
      this.mouseY = mousePos.y;

      // Edit mode: pick vertex/edge/face on the selected mesh BEFORE mesh raycast
      // so corner handles don't register as empty space and deselect the object.
      if (this.editorMode === "edit" && this.selectedObject) {
        if (this.trySelectEditSubElement(event)) {
          return;
        }
      }

      const selectObject = this.performRaycasting();
      const clickedObject = selectObject?.[0];
      const intersection = this.checkIntersections();

      if (clickedObject) {
        if (clickedObject.isGizmoPart) {
          // Gizmo interaction logic remains the same
          this.activeAxis = clickedObject.axis as Axis;
          this.isObjectSelected = true;
          this.isGizmoInteraction = true;
          this.webgl.isGizmoDragging = true;

          // Capture start transform snapshots for undo/redo
          const targetObjects = this.select.length > 0 ? this.select : (this.selectedObject ? [this.selectedObject] : []);
          this.transformStartSnapshots = targetObjects.map((obj) => ({
            uuid: obj.uuid,
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotate: { x: obj.rotate.x, y: obj.rotate.y, z: obj.rotate.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
          }));
          this.originalMultiPositions = new Map();
          for (const obj of this.select) {
            this.originalMultiPositions.set(obj.uuid, {
              x: obj.position.x,
              y: obj.position.y,
              z: obj.position.z,
            });
          };
          this.isRotationMode =
            clickedObject.geometry?.type?.includes("Ring") || false;
          this.isScaleMode =
            clickedObject.geometry?.type?.includes("Scale") || false;
          this.dragStartPosition = { x: event.clientX, y: event.clientY };
          if (this.editorMode === 'edit' && this.selectedObject && this.selectedVertices.length > 0) {
            this.originalVertexPositions = [...(this.selectedObject.vertices as number[])];
          }

          if (this.selectedObject) {
            // Highlight all parts that share the same axis for the active state
            const axisTarget = clickedObject.axis?.toUpperCase();
            this.scene.objects.forEach((obj: any) => {
              // Special case: SCREEN axis rings highlight independently if they are different meshes
              if (obj.isGizmoPart && obj.axis && obj.axis.toUpperCase() === axisTarget) {
                if (axisTarget === "SCREEN") {
                  if (obj.type === clickedObject.type) {
                    obj.isActive = true;
                  }
                } else {
                  obj.isActive = true;
                }
              }
            });

            if (this.activeAxis === Axis.SCREEN || clickedObject.isRing) {
              const gizmoScreenPos = this.worldToScreen(
                this.gizmo!.position.x,
                this.gizmo!.position.y,
                this.gizmo!.position.z
              );
              const rect = this.canvas.getBoundingClientRect();
              const centerX = ((gizmoScreenPos.x + 1) / 2) * rect.width;
              const centerY = ((1 - gizmoScreenPos.y) / 2) * rect.height;
              this.initialMouseAngle = Math.atan2(
                event.clientY - rect.top - centerY,
                event.clientX - rect.left - centerX
              );
            }

            this.objectPivotPosition = {
              x: this.selectedObject.position.x,
              y: this.selectedObject.position.y,
              z: this.selectedObject.position.z,
            };
            this.originalObjectPosition = { ...this.objectPivotPosition };
            this.originalObjectRotation = {
              x: this.selectedObject.rotate.x,
              y: this.selectedObject.rotate.y,
              z: this.selectedObject.rotate.z,
            };
            this.originalObjectScale = {
              x: this.selectedObject.scale.x,
              y: this.selectedObject.scale.y,
              z: this.selectedObject.scale.z,
            };
          }
          return;
        } else {
          // Edit mode + click on selected mesh body (no vertex/edge hit above):
          // clear sub-selection only — do not fall through to object re-select churn
          if (this.editorMode === "edit" && clickedObject === this.selectedObject) {
            clickedObject.selectedVertexIndex = undefined;
            clickedObject.selectedEdgeVertices = undefined;
            clickedObject.highlightedFace = undefined;
            this.selectedFaceNormal = null;
            this.selectedVertices = [];
            this.isDirectDragging = false;
            if (this.gizmo) this.gizmo.visible = false;
            this.dragStartPosition = { x: event.clientX, y: event.clientY };
            return;
          }

          // In Object Mode: If the clicked mesh is part of an imported model or group hierarchy, select the model root!
          let targetObject: any = clickedObject;
          if (this.editorMode !== 'edit' && clickedObject && clickedObject.parent) {
            let curr: any = clickedObject;
            while (curr.parent) {
              curr = curr.parent;
            }
            targetObject = curr;
          }

          // Ctrl / Shift click object selection toggle or multi-select
          if (event.ctrlKey || event.shiftKey || event.metaKey) {
            const existingIdx = this.select.findIndex((o) => o.uuid === targetObject.uuid);
            if (existingIdx >= 0) {
              this.select.splice(existingIdx, 1);
            } else {
              this.select.push(targetObject);
            }
            if (this.select.length > 0) {
              this.isObjectSelected = true;
              this.selectedObject = this.select[this.select.length - 1];
              this.webgl.selectedObject = this.selectedObject;
              this.dragStartPosition = { x: event.clientX, y: event.clientY };
              this.originalMultiPositions = new Map();
              for (const obj of this.select) {
                this.originalMultiPositions.set(obj.uuid, {
                  x: obj.position.x,
                  y: obj.position.y,
                  z: obj.position.z,
                });
              }
              this.updateGizmoPositionForMultiSelection();
              if (this.onMultiSelect) {
                this.onMultiSelect(this.select.map((o) => o.uuid));
              }
            } else {
              this.deselectObject();
            }
            return;
          }

          // Default object selection logic
          this.isObjectSelected = true;
          this.selectedObject = targetObject;
          this.select = [targetObject];

          // Update the WebGL instance's selectedObject
          this.webgl.selectedObject = targetObject;

          // Clear edit selections on selection change
          if (clickedObject) {
            clickedObject.selectedVertexIndex = undefined;
            clickedObject.selectedEdgeVertices = undefined;
            clickedObject.highlightedFace = undefined;
          }
          this.selectedVertices = [];

          this.dragStartPosition = { x: event.clientX, y: event.clientY };
          this.objectPivotPosition = {
            x: targetObject.position.x,
            y: targetObject.position.y,
            z: targetObject.position.z,
          };
          this.originalObjectPosition = { ...this.objectPivotPosition };
          this.originalObjectRotation = {
            x: targetObject.rotate.x,
            y: targetObject.rotate.y,
            z: targetObject.rotate.z,
          };
          this.originalObjectScale = {
            x: targetObject.scale.x,
            y: targetObject.scale.y,
            z: targetObject.scale.z,
          };

          if (this.gizmo) {
            this.gizmo.visible = true;
            if (!this.gizmo.currentGizmoType) {
              this.gizmo.setMode("translate");
            }
            this.updateGizmoPosition(targetObject);
            if (!this.gizmo.gizmoMeshes.length) {
              this.gizmo.addToScene(this.scene);
            }
          }

          this.updateUI(
            this,
            document.getElementById("UUID"),
            document.getElementById("Type")
          );
          if (this.onSelect) {
            this.onSelect(targetObject.uuid || null);
          }
          return;
        }
      } else {
        // Empty space: in edit mode keep the object selected, only clear sub-element picks
        if (!event.ctrlKey && !event.shiftKey && !event.metaKey && !this.isMarqueeMode) {
          if (this.editorMode === "edit" && this.selectedObject) {
            this.selectedObject.selectedVertexIndex = undefined;
            this.selectedObject.selectedEdgeVertices = undefined;
            this.selectedObject.highlightedFace = undefined;
            this.selectedFaceNormal = null;
            this.selectedVertices = [];
            this.isDirectDragging = false;
            if (this.gizmo) this.gizmo.visible = false;
          } else {
            this.deselectObject();
          }
        }
      }
    });

    this.canvas.addEventListener("mousemove", (event: MouseEvent) => {
      if (!this.move && !this.isPressed) {
        // Handle hover highlighting when not dragging
        const mousePos = this.getNormalizedMousePos(this.canvas, event);
        this.mouseX = mousePos.x;
        this.mouseY = mousePos.y;
        this.handleMouseHover(event);
      }
    });

    this.canvas.addEventListener("mouseup", () => {
      // Mouse up handler
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!this.hasDragged) {
        this.deselectObject();
      }
    });
  }

  deselectObject(): void {
    this.scene.objects.forEach((obj: any) => {
      obj.highlightedFace = undefined;
      obj.hoveredFace = undefined; // Clear hover highlights
      obj.highlightColor = undefined;
      obj.hoverColor = undefined; // Clear hover colors
      obj.selectedVertexIndex = undefined;
      obj.selectedEdgeVertices = undefined;
    });
    this.selectedVertices = [];
    this.originalVertexPositions = [];
    this.selectedFaceNormal = null;
    this.isDirectDragging = false;
    this.isObjectSelected = false;
    this.selectedObject = null;
    this.select = [];

    // Clear the WebGL instance's selectedObject
    this.webgl.selectedObject = null;

    this.activeAxis = null;
    this.isGizmoInteraction = false;
    this.webgl.isGizmoDragging = false;
    this.isRotationMode = false;
    this.isScaleMode = false;
    this.isTransformationActive = false;
    if (this.gizmo) {
      this.gizmo.visible = false;
      this.gizmo.removeFromScene(this.scene);
    }

    if (this.onSelect) {
      this.onSelect(null);
    }
    if (this.onMultiSelect) {
      this.onMultiSelect([]);
    }
  }
  events(): void {
    this.initializeInputBindings(this.camera, "Persp");
    this.rayEvents();
    this.keyboardEvents();
    this.canvas.addEventListener("wheel", (event: WheelEvent) => {
      event.preventDefault();
      if ((this.camera as any).projectionType === "orthographic") {
        // Correct orthographic zooming by scaling the frustum
        const zoomSpeed = 0.001;
        this.camera.orthoSize += event.deltaY * zoomSpeed * this.camera.orthoSize;
        this.camera.orthoSize = Math.max(0.01, this.camera.orthoSize);

        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera.OrthographicCamera(aspect);
      } else {
        this.scalervalue += event.deltaY * 0.002;
        this.scalervalue = Math.min(Math.max(-50, this.scalervalue), 1e5);
        this.cameraRadiuscam = this.scalervalue;
        const pos = this.controlEvent();
        this.camera.eye = { x: pos[0], y: pos[1], z: pos[2] };
        this.camera.OrbitCamera();
      }
      if (this.onViewChange) this.onViewChange();
    });
    this.canvas.addEventListener("pointerdown", (e: PointerEvent) => {
      this.move = true;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
      this.dragStartPosition = { x: e.clientX, y: e.clientY };
      this.activeButton = e.button;
      this.hasDragged = false;

      // Check if marquee selection should start (Ctrl, Shift, or Marquee mode)
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        const selectObject = this.performRaycasting();
        const clicked = selectObject?.[0];
        if (!clicked || !clicked.isGizmoPart) {
          this.isMarqueeSelecting = true;
          this.marqueeStart = { x: e.clientX, y: e.clientY };
          this.updateMarqueeVisual(e.clientX, e.clientY);
          return;
        }
      }
    });
    this.canvas.addEventListener("pointermove", (e: PointerEvent) => {
      if (this.isMarqueeSelecting) {
        e.preventDefault();
        this.updateMarqueeVisual(e.clientX, e.clientY);
        return;
      }
      if (!this.move || this.isPressed) return;

      // Set hasDragged flag
      const dragThreshold = 2;
      const dxDrag = Math.abs(e.clientX - this.dragStartPosition.x);
      const dyDrag = Math.abs(e.clientY - this.dragStartPosition.y);
      if (dxDrag > dragThreshold || dyDrag > dragThreshold) {
        this.hasDragged = true;
      }

      // If right click, perform camera panning and ignore other interactions
      if (this.activeButton === 2) {
        e.preventDefault();
        
        // Get camera local right and up axes
        const viewMatrix = this.camera.viewMatrix;
        const right = vec3.fromValues(viewMatrix[0], viewMatrix[4], viewMatrix[8]);
        const up = vec3.fromValues(viewMatrix[1], viewMatrix[5], viewMatrix[9]);
        
        // Calculate movement delta using e.movementX/Y
        const deltaX = e.movementX;
        const deltaY = e.movementY;
        
        // Sensitivity based on camera radius
        const panSensitivity = Math.max(0.1, this.cameraRadiuscam) * 0.001;
        
        // Move eye and center in direction of pan
        const moveVecX = vec3.create();
        const moveVecY = vec3.create();
        
        vec3.scale(moveVecX, right, -deltaX * panSensitivity);
        vec3.scale(moveVecY, up, deltaY * panSensitivity);
        
        this.camera.eye.x += moveVecX[0] + moveVecY[0];
        this.camera.eye.y += moveVecX[1] + moveVecY[1];
        this.camera.eye.z += moveVecX[2] + moveVecY[2];
        
        this.camera.center.x += moveVecX[0] + moveVecY[0];
        this.camera.center.y += moveVecX[1] + moveVecY[1];
        this.camera.center.z += moveVecX[2] + moveVecY[2];
        
        this.camera.OrbitCamera();
        return;
      }

      // Direct vertex/edge/face dragging
      if (this.isDirectDragging && this.selectedObject && this.selectedVertices.length > 0) {
        e.preventDefault();
        const deltaX = e.clientX - this.dragStartPosition.x;
        const deltaY = e.clientY - this.dragStartPosition.y;
        this.handleDirectSubElementTranslation(deltaX, deltaY, e.shiftKey);
        return;
      }

      // Priority 1: Handle gizmo interaction
      if (
        this.isObjectSelected &&
        this.isGizmoInteraction &&
        this.selectedObject
      ) {
        e.preventDefault();
        if (this.isRotationMode) {
          this.handleRotation(e);
        } else if (this.isScaleMode) {
          const deltaX = e.clientX - this.dragStartPosition.x;
          const deltaY = e.clientY - this.dragStartPosition.y;
          this.handleScaling(deltaX, deltaY);
        } else {
          const deltaX = e.clientX - this.dragStartPosition.x;
          const deltaY = e.clientY - this.dragStartPosition.y;
          this.handleTranslation(deltaX, deltaY);
        }
        return; // Don't allow camera rotation when interacting with gizmo
      }

      // Priority 2: Rotate camera only if NOT interacting with objects
      // Lock rotation in orthographic mode to maintain fixed view
      if (
        this.activeButton === 0 &&
        !this.isPressed &&
        !this.isObjectSelected &&
        !this.isGizmoInteraction &&
        (this.camera as any).projectionType !== "orthographic"
      ) {
        this.rotationX -= e.movementX * 0.5;
        this.rotationY += e.movementY * 0.5;

        const pos = this.controlEvent();
        this.camera.eye = { x: pos[0], y: pos[1], z: pos[2] };
        this.camera.OrbitCamera();
      }
    });
    this.canvas.addEventListener("pointerup", (e: PointerEvent) => {
      if (this.isMarqueeSelecting) {
        this.isMarqueeSelecting = false;
        if (this.marqueeBoxEl) {
          this.marqueeBoxEl.style.display = "none";
        }

        const canvasRect = this.canvas.getBoundingClientRect();
        const minX = Math.min(this.marqueeStart.x, e.clientX) - canvasRect.left;
        const maxX = Math.max(this.marqueeStart.x, e.clientX) - canvasRect.left;
        const minY = Math.min(this.marqueeStart.y, e.clientY) - canvasRect.top;
        const maxY = Math.max(this.marqueeStart.y, e.clientY) - canvasRect.top;

        if (maxX - minX > 4 || maxY - minY > 4) {
          const isAdd = e.ctrlKey || e.metaKey;
          this.performMarqueeSelection(minX, maxX, minY, maxY, isAdd);
        }
      }
      if (this.isGizmoInteraction && this.transformStartSnapshots.length > 0) {
        const targetObjects = this.select.length > 0 ? this.select : (this.selectedObject ? [this.selectedObject] : []);
        const endSnapshots: ObjectTransformSnapshot[] = targetObjects.map((obj) => ({
          uuid: obj.uuid,
          position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
          rotate: { x: obj.rotate.x, y: obj.rotate.y, z: obj.rotate.z },
          scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
        }));

        let hasMoved = false;
        for (let i = 0; i < this.transformStartSnapshots.length; i++) {
          const s = this.transformStartSnapshots[i];
          const e = endSnapshots[i];
          if (!s || !e) continue;
          if (
            Math.abs(s.position.x - e.position.x) > 0.0001 ||
            Math.abs(s.position.y - e.position.y) > 0.0001 ||
            Math.abs(s.position.z - e.position.z) > 0.0001 ||
            Math.abs(s.rotate.x - e.rotate.x) > 0.0001 ||
            Math.abs(s.rotate.y - e.rotate.y) > 0.0001 ||
            Math.abs(s.rotate.z - e.rotate.z) > 0.0001 ||
            Math.abs(s.scale.x - e.scale.x) > 0.0001 ||
            Math.abs(s.scale.y - e.scale.y) > 0.0001 ||
            Math.abs(s.scale.z - e.scale.z) > 0.0001
          ) {
            hasMoved = true;
            break;
          }
        }

        if (hasMoved && this.onTransformComplete) {
          this.onTransformComplete(this.transformStartSnapshots, endSnapshots);
        }
        this.transformStartSnapshots = [];
      }
      this.move = false;
      this.isGizmoInteraction = false;
      this.webgl.isGizmoDragging = false;
      this.isTransformationActive = false;
      this.isDirectDragging = false;

      // Check geometry edits (vertex, edge, face)
      if (this.editorMode === 'edit' && this.selectedObject && this.originalVertexPositions && this.originalVertexPositions.length > 0) {
        const currentVertices = this.selectedObject.vertices as number[];
        let vertexMoved = false;
        if (currentVertices && currentVertices.length === this.originalVertexPositions.length) {
          for (let i = 0; i < currentVertices.length; i++) {
            if (Math.abs(currentVertices[i] - this.originalVertexPositions[i]) > 0.0001) {
              vertexMoved = true;
              break;
            }
          }
        }
        if (vertexMoved) {
          if (this.selectedObject.geometry) {
            this.selectedObject.geometry.Vertices = this.selectedObject.vertices;
            this.selectedObject.geometry.Normals = this.selectedObject.normals;
          }
          const prevVertices = [...this.originalVertexPositions];
          const newVertices = [...currentVertices];
          this.originalVertexPositions = [...currentVertices];
          if (this.onGeometryChange) {
            this.onGeometryChange(this.selectedObject, prevVertices, newVertices);
          }
        }
      }
      this.activeButton = -1;

      // Clear all active states for gizmo parts
      this.scene.objects.forEach((obj: any) => {
        if (obj.isGizmoPart) {
          obj.isActive = false;
        }
      });

      if (this.isObjectSelected && this.selectedObject) {
        this.objectPivotPosition = {
          x: this.selectedObject.position.x,
          y: this.selectedObject.position.y,
          z: this.selectedObject.position.z,
        };
        this.originalObjectPosition = {
          x: this.selectedObject.position.x,
          y: this.selectedObject.position.y,
          z: this.selectedObject.position.z,
        };
        this.originalObjectRotation = {
          x: this.selectedObject.rotate.x,
          y: this.selectedObject.rotate.y,
          z: this.selectedObject.rotate.z,
        };
      }

      // Persist camera view after orbit / pan / zoom
      if (this.hasDragged && this.onViewChange) {
        this.onViewChange();
      }
    });
  }
  checkIntersections(): RayIntersectionResult {
    const gizmoResult = this.checkGizmoIntersections();
    if (gizmoResult) {
      return { selectObject: [gizmoResult] };
    }

    let closestObject: RenderableMeshObject | null = null;
    let closestFaceHit: any = null;
    let minHitDistance = Infinity;
    let fallbackBoxObject: RenderableMeshObject | null = null;
    let minBoxDistance = Infinity;

    for (const object of this.scene.objects) {
      if (object.type === "Grid-Geometry" || !object.boundingBox || object.visible === false || object.isGizmoPart) continue;

      const tBox = this.intersectRayWithBoundingBox(
        this.rayOrigin,
        this.rayDirection.slice(0, 3) as Vec3,
        object.boundingBox.min,
        object.boundingBox.max
      );
      if (tBox === null || tBox <= 0) continue;

      if (tBox < minBoxDistance) {
        minBoxDistance = tBox;
        fallbackBoxObject = object;
      }

      const faceHit = this.checkFaceIntersections(object);
      if (faceHit && faceHit.intersectionPoint) {
        const dx = faceHit.intersectionPoint[0] - this.rayOrigin[0];
        const dy = faceHit.intersectionPoint[1] - this.rayOrigin[1];
        const dz = faceHit.intersectionPoint[2] - this.rayOrigin[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < minHitDistance) {
          minHitDistance = dist;
          closestObject = object;
          closestFaceHit = faceHit;
        }
      }
    }

    if (closestObject) {
      return {
        selectObject: [closestObject],
        selectedFace: closestFaceHit,
        answer: true,
      };
    }

    // Only fallback to bounding box if mesh has no indices/triangles
    if (fallbackBoxObject && (!fallbackBoxObject.indices || fallbackBoxObject.indices.length === 0)) {
      return {
        selectObject: [fallbackBoxObject],
        answer: true,
      };
    }

    return {
      selectObject: [],
      answer: false,
    };
  }

  checkFaceIntersections(mesh: RenderableMeshObject): {
    faceIndex: number;
    vertexIndices: number[];
    intersectionPoint: Vec3;
  } | null {
    const vertices = mesh.vertices || mesh.geometry?.Vertices;
    if (!vertices || vertices.length === 0) return null;
    const indices = mesh.indices || mesh.geometry?.Indices;
    const modelMatrix = mesh.getWorldMatrix();
    let closestT = Infinity;
    let closestFaceIndex = -1;
    let closestIntersectionPoint: Vec3 | null = null;

    const hasIndices = indices && indices.length > 0;
    const count = hasIndices ? indices.length : vertices.length / 3;

    for (let i = 0; i < count; i += 3) {
      const idxA = hasIndices ? indices[i] : i;
      const idxB = hasIndices ? indices[i + 1] : i + 1;
      const idxC = hasIndices ? indices[i + 2] : i + 2;

      const ai = idxA * 3;
      const bi = idxB * 3;
      const ci = idxC * 3;

      if (ci + 2 >= vertices.length) break;

      const vA = vec3.fromValues(vertices[ai], vertices[ai + 1], vertices[ai + 2]);
      const vB = vec3.fromValues(vertices[bi], vertices[bi + 1], vertices[bi + 2]);
      const vC = vec3.fromValues(vertices[ci], vertices[ci + 1], vertices[ci + 2]);

      const a = vec3.create();
      vec3.transformMat4(a, vA, modelMatrix);
      const b = vec3.create();
      vec3.transformMat4(b, vB, modelMatrix);
      const c = vec3.create();
      vec3.transformMat4(c, vC, modelMatrix);
      const t = this.intersectRayTriangle(
        this.rayOrigin.slice(0, 3) as Vec3,
        this.rayDirection.slice(0, 3) as Vec3,
        a,
        b,
        c
      );
      if (t !== null && t < closestT) {
        closestT = t;
        closestFaceIndex = i / 3;
        closestIntersectionPoint = [
          this.rayOrigin[0] + t * this.rayDirection[0],
          this.rayOrigin[1] + t * this.rayDirection[1],
          this.rayOrigin[2] + t * this.rayDirection[2],
        ];
      }
    }
    if (closestFaceIndex >= 0 && closestIntersectionPoint) {
      const completeFace = this.getCompleteFace(mesh, closestFaceIndex);
      return {
        faceIndex: closestFaceIndex,
        vertexIndices: completeFace,
        intersectionPoint: closestIntersectionPoint,
      };
    }
    return null;
  }

  checkGizmoIntersections(): RenderableMeshObject | null {
    if (!this.gizmo || !this.gizmo.visible || !this.gizmo.gizmoMeshes) {
      return null;
    }
    let closestGizmoPart: RenderableMeshObject | null = null;
    let gizmoMinDistance = Infinity;
    for (const gizmoMesh of this.gizmo.gizmoMeshes) {
      if (!gizmoMesh.visible || !gizmoMesh.boundingBox) continue;
      const t = this.intersectRayWithBoundingBox(
        this.rayOrigin,
        this.rayDirection.slice(0, 3) as Vec3,
        gizmoMesh.boundingBox.min,
        gizmoMesh.boundingBox.max
      );
      if (t !== null && t > 0 && t < gizmoMinDistance) {
        gizmoMinDistance = t;
        closestGizmoPart = gizmoMesh;
      }
    }
    return closestGizmoPart;
  }

  checkSceneIntersections(): RenderableMeshObject | null {
    const res = this.checkIntersections();
    return res.selectObject && res.selectObject.length > 0 ? res.selectObject[0] : null;
  }

  handleMouseHover(event: MouseEvent): void {
    // Clear all hover highlights for regular objects and gizmos
    this.scene.objects.forEach((obj: any) => {
      obj.hoveredFace = undefined;
      obj.hoverColor = undefined;
      obj.isHovered = false;
      obj.hoveredVertexIndex = undefined;
      obj.hoveredEdgeVertices = undefined;
    });

    if (this.editorMode === 'edit' && this.selectedObject) {
      this.setupRay(this.mouseX, this.mouseY);
      const clickedObject = this.selectedObject;
      
      if (this.editSubMode === 'vertex') {
        const hoveredVertexIndex = this.checkVertexIntersections(clickedObject);
        if (hoveredVertexIndex !== null) {
          clickedObject.hoveredVertexIndex = hoveredVertexIndex;
        }
      } else if (this.editSubMode === 'edge') {
        const hoveredEdge = this.checkEdgeIntersections(clickedObject);
        if (hoveredEdge !== null) {
          clickedObject.hoveredEdgeVertices = hoveredEdge;
        }
      } else if (this.editSubMode === 'face') {
        const faceHit = this.checkFaceIntersections(clickedObject);
        if (faceHit) {
          clickedObject.hoveredFace = faceHit.vertexIndices;
        }
      }
      return;
    }

    if (this.gizmo && this.gizmo.visible) {
      // Use the NDC coordinates already calculated in the mousemove listener
      this.setupRay(this.mouseX, this.mouseY);

      const hoveredGizmoPart = this.checkGizmoIntersections();
      if (hoveredGizmoPart) {
        // Highlight all parts that share the same axis label
        const axis = (hoveredGizmoPart as any).axis;
        if (axis) {
          const axisTarget = axis.toUpperCase();
          this.scene.objects.forEach((obj: any) => {
            if (obj.isGizmoPart && obj.axis && obj.axis.toUpperCase() === axisTarget) {
              if (axisTarget === "SCREEN") {
                if (obj.type === (hoveredGizmoPart as any).type) {
                  obj.isHovered = true;
                }
              } else {
                obj.isHovered = true;
              }
            }
          });
        } else {
          hoveredGizmoPart.isHovered = true;
        }
      }
    }
  }

  setupRay(mouseX: number, mouseY: number): void {
    const rayClip = vec4.fromValues(mouseX, mouseY, -1.0, 1.0);
    let invProjMatrix = mat4.create();
    if (!mat4.invert(invProjMatrix, this.camera.projectionMatrix)) {
      mat4.identity(invProjMatrix);
    }

    let invViewMatrix = mat4.create();
    if (!mat4.invert(invViewMatrix, this.camera.viewMatrix)) {
      mat4.identity(invViewMatrix);
    }

    if (this.camera.projectionType === "orthographic") {
      let rayOriginCamera = vec4.create();
      vec4.transformMat4(rayOriginCamera, rayClip, invProjMatrix);

      let rayOriginWorld = vec4.create();
      vec4.transformMat4(rayOriginWorld, rayOriginCamera, invViewMatrix);
      this.rayOrigin = [rayOriginWorld[0], rayOriginWorld[1], rayOriginWorld[2]];

      let forwardCamera = vec4.fromValues(0, 0, -1, 0);
      let forwardWorld = vec4.create();
      vec4.transformMat4(forwardWorld, forwardCamera, invViewMatrix);
      this.rayDirection = [forwardWorld[0], forwardWorld[1], forwardWorld[2]];
    } else {
      let rayCamera = vec4.create();
      vec4.transformMat4(rayCamera, rayClip, invProjMatrix);
      rayCamera = vec4.fromValues(rayCamera[0], rayCamera[1], -1.0, 0.0);

      let rayWorld = vec4.create();
      vec4.transformMat4(rayWorld, rayCamera, invViewMatrix);
      this.rayDirection = [rayWorld[0], rayWorld[1], rayWorld[2]];
      this.rayOrigin = [this.camera.eye.x, this.camera.eye.y, this.camera.eye.z];
    }

    vec3.normalize(this.rayDirection, this.rayDirection);
  }

  // Replace the existing getQuadFaceIndices and isQuadFace methods with these improved versions
  getCompleteFace(mesh: RenderableMeshObject, triangleIndex: number): number[] {
    const indices = mesh.geometry.Indices;
    const baseTriangleIndices = [
      indices[triangleIndex * 3],
      indices[triangleIndex * 3 + 1],
      indices[triangleIndex * 3 + 2],
    ];
    // First, try to find if this triangle is part of a quad
    const quadIndices = this.findQuadFromTriangle(
      mesh,
      triangleIndex,
      baseTriangleIndices
    );
    if (quadIndices.length === 4) {
      return quadIndices;
    }
    // If no quad found, return the triangle vertices
    return baseTriangleIndices;
  }
  findQuadFromTriangle(
    mesh: RenderableMeshObject,
    baseTriangleIndex: number,
    baseTriangleIndices: number[]
  ): number[] {
    const indices = mesh.geometry.Indices;
    const vertices = mesh.geometry.Vertices;

    // Look for another triangle that shares exactly 2 vertices with our base triangle
    for (let i = 0; i < indices.length; i += 3) {
      if (i === baseTriangleIndex * 3) continue; // Skip the same triangle

      const otherTriangleIndices = [indices[i], indices[i + 1], indices[i + 2]];

      // Check if these triangles share exactly 2 vertices (forming an edge)
      const sharedVertices = baseTriangleIndices.filter((v) =>
        otherTriangleIndices.includes(v)
      );

      if (sharedVertices.length === 2) {
        // Check if these triangles are coplanar and form a proper quad
        if (
          this.areTrianglesCoplanar(
            vertices,
            baseTriangleIndices,
            otherTriangleIndices
          )
        ) {
          // Combine the triangles to form a quad
          return this.combineTrianglesToQuad(
            baseTriangleIndices,
            otherTriangleIndices,
            sharedVertices
          );
        }
      }
    }

    return []; // No quad found
  }
  areTrianglesCoplanar(
    vertices: number[],
    tri1Indices: number[],
    tri2Indices: number[]
  ): boolean {
    // Get the normals of both triangles
    const normal1 = this.calculateTriangleNormal(vertices, tri1Indices);
    const normal2 = this.calculateTriangleNormal(vertices, tri2Indices);

    // Check if normals are similar (coplanar faces)
    const dotProduct = vec3.dot(normal1, normal2);
    const threshold = 0.99; // Adjust this threshold as needed

    return Math.abs(dotProduct) > threshold;
  }
  calculateTriangleNormal(vertices: number[], triangleIndices: number[]): Vec3 {
    const v0 = vec3.fromValues(
      vertices[triangleIndices[0] * 3],
      vertices[triangleIndices[0] * 3 + 1],
      vertices[triangleIndices[0] * 3 + 2]
    );
    const v1 = vec3.fromValues(
      vertices[triangleIndices[1] * 3],
      vertices[triangleIndices[1] * 3 + 1],
      vertices[triangleIndices[1] * 3 + 2]
    );
    const v2 = vec3.fromValues(
      vertices[triangleIndices[2] * 3],
      vertices[triangleIndices[2] * 3 + 1],
      vertices[triangleIndices[2] * 3 + 2]
    );

    const edge1 = vec3.create();
    vec3.subtract(edge1, v1, v0);
    const edge2 = vec3.create();
    vec3.subtract(edge2, v2, v0);
    const cross = vec3.create();
    vec3.cross(cross, edge1, edge2);
    return vec3.normalize(vec3.create(), cross);
  }
  combineTrianglesToQuad(
    tri1Indices: number[],
    tri2Indices: number[],
    sharedVertices: number[]
  ): number[] {
    // Find the unique vertices (not shared)
    const uniqueFromTri1 = tri1Indices.filter(
      (v) => !sharedVertices.includes(v)
    );
    const uniqueFromTri2 = tri2Indices.filter(
      (v) => !sharedVertices.includes(v)
    );

    // Create quad by ordering vertices properly
    // The quad should be ordered to maintain proper winding
    const quad = [
      uniqueFromTri1[0],
      sharedVertices[0],
      uniqueFromTri2[0],
      sharedVertices[1],
    ];

    return quad;
  }
  // Enhanced method to group faces by connectivity and planarity
  getConnectedFace(mesh: RenderableMeshObject, startTriangleIndex: number): number[] {
    const indices = mesh.geometry.Indices;
    const vertices = mesh.geometry.Vertices;
    const visited = new Set<number>();
    const faceVertices = new Set<number>();
    const trianglesToProcess = [startTriangleIndex];

    // Get the normal of the starting triangle to ensure we only group coplanar faces
    const startTriangleIndices = [
      indices[startTriangleIndex * 3],
      indices[startTriangleIndex * 3 + 1],
      indices[startTriangleIndex * 3 + 2],
    ];
    const referenceNormal = this.calculateTriangleNormal(
      vertices,
      startTriangleIndices
    );

    while (trianglesToProcess.length > 0) {
      const currentTriangleIndex = trianglesToProcess.pop()!;

      if (visited.has(currentTriangleIndex)) continue;
      visited.add(currentTriangleIndex);

      const currentTriangleIndices = [
        indices[currentTriangleIndex * 3],
        indices[currentTriangleIndex * 3 + 1],
        indices[currentTriangleIndex * 3 + 2],
      ];

      // Add vertices to the face
      currentTriangleIndices.forEach((v) => faceVertices.add(v));

      // Look for adjacent triangles that are coplanar
      for (let i = 0; i < indices.length; i += 3) {
        const triangleIndex = i / 3;
        if (visited.has(triangleIndex)) continue;

        const otherTriangleIndices = [
          indices[i],
          indices[i + 1],
          indices[i + 2],
        ];

        // Check if triangles share at least one edge (2 vertices)
        const sharedVertices = currentTriangleIndices.filter((v) =>
          otherTriangleIndices.includes(v)
        );

        if (sharedVertices.length >= 2) {
          // Check if the other triangle is coplanar with our reference
          if (
            this.areTrianglesCoplanar(
              vertices,
              startTriangleIndices,
              otherTriangleIndices
            )
          ) {
            trianglesToProcess.push(triangleIndex);
          }
        }
      }
    }

    // Convert set to ordered array for proper quad/polygon formation
    return this.orderVerticesForFace(Array.from(faceVertices), vertices);
  }
  orderVerticesForFace(vertexIndices: number[], vertices: number[]): number[] {
    if (vertexIndices.length <= 3) return vertexIndices;

    // For quads and polygons, we need to order vertices in a way that makes geometric sense
    // Calculate the centroid
    let centroidX = 0,
      centroidY = 0,
      centroidZ = 0;
    for (const idx of vertexIndices) {
      centroidX += vertices[idx * 3];
      centroidY += vertices[idx * 3 + 1];
      centroidZ += vertices[idx * 3 + 2];
    }
    centroidX /= vertexIndices.length;
    centroidY /= vertexIndices.length;
    centroidZ /= vertexIndices.length;

    // Calculate face normal
    const v0 = vec3.fromValues(
      vertices[vertexIndices[0] * 3],
      vertices[vertexIndices[0] * 3 + 1],
      vertices[vertexIndices[0] * 3 + 2]
    );
    const v1 = vec3.fromValues(
      vertices[vertexIndices[1] * 3],
      vertices[vertexIndices[1] * 3 + 1],
      vertices[vertexIndices[1] * 3 + 2]
    );
    const v2 = vec3.fromValues(
      vertices[vertexIndices[2] * 3],
      vertices[vertexIndices[2] * 3 + 1],
      vertices[vertexIndices[2] * 3 + 2]
    );

    const edge1 = vec3.create();
    vec3.subtract(edge1, v1, v0);
    const edge2 = vec3.create();
    vec3.subtract(edge2, v2, v0);
    const cross = vec3.create();
    vec3.cross(cross, edge1, edge2);
    const normal = vec3.normalize(vec3.create(), cross);

    // Sort vertices by angle around the centroid
    const sortedVertices = vertexIndices.slice().sort((a, b) => {
      const vecA = vec3.fromValues(
        vertices[a * 3] - centroidX,
        vertices[a * 3 + 1] - centroidY,
        vertices[a * 3 + 2] - centroidZ
      );
      const vecB = vec3.fromValues(
        vertices[b * 3] - centroidX,
        vertices[b * 3 + 1] - centroidY,
        vertices[b * 3 + 2] - centroidZ
      );

      // Calculate angles in the plane of the face
      const crossA = vec3.create();
      vec3.cross(crossA, vecA, normal);
      const angleA = Math.atan2(
        vec3.dot(crossA, normal),
        vec3.dot(vecA, vecA)
      );
      const crossB = vec3.create();
      vec3.cross(crossB, vecB, normal);
      const angleB = Math.atan2(
        vec3.dot(crossB, normal),
        vec3.dot(vecB, vecB)
      );

      return angleA - angleB;
    });

    return sortedVertices;
  }
  logDebugInfo(object: RenderableMeshObject): void {
    if (object.geometry.Indices) {
      const faceCount = object.indices.length / 3;
      const vertexCount = object.vertices.length / 3;
      const indicesArray =
        object.indices instanceof Uint16Array
          ? object.indices
          : new Uint16Array(object.indices);
      const edgeCount = this.calculateEdgeCount(indicesArray);
      // console.log("faceCount: ", faceCount);
      // console.log("vertexCount: ", vertexCount);
      // console.log("edgeCount: ", edgeCount);
    }
  }
  intersectRayWithBoundingBox(
    rayOrigin: any,
    rayDirection: any,
    boxMin: any,
    boxMax: any
  ): number | null {
    let tmin = -Infinity;
    let tmax = Infinity;
    const epsilon = 1e-8;

    // Support both array-like [x,y,z] and object {x,y,z}
    const getVal = (v: any, i: number) => {
      if (Array.isArray(v) || v instanceof Float32Array || v instanceof Float64Array) return v[i];
      if (i === 0) return v.x;
      if (i === 1) return v.y;
      if (i === 2) return v.z;
      return 0;
    };

    for (let i = 0; i < 3; i++) {
      const ro = getVal(rayOrigin, i);
      const rd = getVal(rayDirection, i);
      const bmin = getVal(boxMin, i);
      const bmax = getVal(boxMax, i);

      if (Math.abs(rd) < epsilon) {
        if (ro < bmin || ro > bmax) {
          return null;
        }
        continue;
      }
      const t1 = (bmin - ro) / rd;
      const t2 = (bmax - ro) / rd;
      const [tNear, tFar] = t1 < t2 ? [t1, t2] : [t2, t1];
      tmin = Math.max(tmin, tNear);
      tmax = Math.min(tmax, tFar);
      if (tmin > tmax) return null;
    }
    if (tmin >= 0) return tmin;
    if (tmax >= 0) return tmax;
    return null;
  }
  intersectRayTriangle(
    origin: Vec3,
    dir: Vec3,
    v0: Vec3,
    v1: Vec3,
    v2: Vec3
  ): number | null {
    const EPSILON = 1e-6;
    const edge1 = vec3.create();
    vec3.subtract(edge1, v1 as any, v0 as any);
    const edge2 = vec3.create();
    vec3.subtract(edge2, v2 as any, v0 as any);
    const h = vec3.create();
    vec3.cross(h, dir as any, edge2);
    const a = vec3.dot(edge1, h);
    if (Math.abs(a) < EPSILON) return null;
    const f = 1 / a;
    const s = vec3.create();
    vec3.subtract(s, origin as any, v0 as any);
    const q = vec3.create();
    vec3.cross(q, s, edge1);
    const u = f * vec3.dot(s, h);
    if (u < 0 || u > 1) return null;
    const v = f * vec3.dot(dir as any, q);
    if (v < 0 || u + v > 1) return null;
    const t = f * vec3.dot(edge2, q);
    return t > EPSILON ? t : null;
  }
  updateUI(
    events: SceneInteractionHandler,
    UUID: HTMLElement | null,
    Type: HTMLElement | null
  ): void {
    if (this.select.length === 0) return;
    const selectedObject = this.select[0];
    if (!selectedObject) return;
    this.updatePositionInputs(selectedObject);
    this.updateScaleInputs(selectedObject);
    this.updateRotationInputs(selectedObject);
    if (UUID) UUID.innerHTML = selectedObject.uuid ?? "N/A";
    if (Type) Type.innerHTML = selectedObject.type ?? "N/A";
  }
  updatePositionInputs(obj: SelectableObjectType): void {
    this.updateInputValue("posX", obj.position.x.toFixed(2));
    this.updateInputValue("posY", obj.position.y.toFixed(2));
    this.updateInputValue("posZ", obj.position.z.toFixed(2));
    this.setInputHandler("posX", (value) => {
      obj.position.x = parseFloat(value);
      obj.updateLocalMatrix();
      this.objectPivotPosition.x = obj.position.x;
      this.updateGizmoPosition(obj);
    });
    this.setInputHandler("posY", (value) => {
      obj.position.y = parseFloat(value);
      obj.updateLocalMatrix();
      this.objectPivotPosition.y = obj.position.y;
      this.updateGizmoPosition(obj);
    });
    this.setInputHandler("posZ", (value) => {
      obj.position.z = parseFloat(value);
      obj.updateLocalMatrix();
      this.objectPivotPosition.z = obj.position.z;
      this.updateGizmoPosition(obj);
    });
  }
  updateScaleInputs(obj: SelectableObjectType): void {
    this.updateInputValue("scaleX", obj.scale.x.toFixed(2));
    this.updateInputValue("scaleY", obj.scale.y.toFixed(2));
    this.updateInputValue("scaleZ", obj.scale.z.toFixed(2));
    this.setInputHandler("scaleX", (value) => {
      obj.scale.x = parseFloat(value);
      obj.updateScale();
    });
    this.setInputHandler("scaleY", (value) => {
      obj.scale.y = parseFloat(value);
      obj.updateScale();
    });
    this.setInputHandler("scaleZ", (value) => {
      obj.scale.z = parseFloat(value);
      obj.updateScale();
    });
  }
  updateRotationInputs(obj: SelectableObjectType): void {
    this.updateInputValue("rotationX", obj.rotate.x.toFixed(2));
    this.updateInputValue("rotationY", obj.rotate.y.toFixed(2));
    this.updateInputValue("rotationZ", obj.rotate.z.toFixed(2));
    this.setInputHandler("rotationX", (value) => {
      obj.rotate.x = parseFloat(value);
      obj.ObjectRotation();
      this.applyRotationUpdate(obj);
    });
    this.setInputHandler("rotationY", (value) => {
      obj.rotate.y = parseFloat(value);
      obj.ObjectRotation();
      this.applyRotationUpdate(obj);
    });
    this.setInputHandler("rotationZ", (value) => {
      obj.rotate.z = parseFloat(value);
      obj.ObjectRotation();
      this.applyRotationUpdate(obj);
    });
  }
  updateInputValue(id: string, value: string): void {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.value = value;
  }
  setInputHandler(id: string, handler: (value: string) => void): void {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) {
      input.oninput = () => {
        handler(input.value);
      };
    }
  }
  updateGizmoPosition(obj: SelectableObjectType): void {
    if (!this.gizmo || !obj) return;
    const box = (obj as any).getBoundingBox ? (obj as any).getBoundingBox() : (obj as any).boundingBox;
    if (box && isFinite(box.min[0]) && isFinite(box.max[0])) {
      this.gizmo.position.x = (box.min[0] + box.max[0]) / 2;
      this.gizmo.position.y = (box.min[1] + box.max[1]) / 2;
      this.gizmo.position.z = (box.min[2] + box.max[2]) / 2;
    } else if (obj.worldMatrix) {
      this.gizmo.position.x = obj.worldMatrix[12];
      this.gizmo.position.y = obj.worldMatrix[13];
      this.gizmo.position.z = obj.worldMatrix[14];
    } else if (obj.position) {
      this.gizmo.position.x = obj.position.x;
      this.gizmo.position.y = obj.position.y;
      this.gizmo.position.z = obj.position.z;
    }
    this.gizmo.updateLocalMatrix();
  }
  applyRotationUpdate(obj: SelectableObjectType): void {
    obj.position = this.objectPivotPosition;
    obj.updateTranslate();
  }
  isPointOnGizmo(clientX: number, clientY: number): boolean {
    if (!this.gizmo?.visible) return false;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = ((clientX - rect.left) / this.canvas.width) * 2 - 1;
    const mouseY = -((clientY - rect.top) / this.canvas.height) * 2 + 1;
    const gizmoScreenPos = this.worldToScreen(
      this.gizmo.position.x,
      this.gizmo.position.y,
      this.gizmo.position.z
    );
    const distance = Math.sqrt(
      Math.pow(mouseX - gizmoScreenPos.x, 2) +
      Math.pow(mouseY - gizmoScreenPos.y, 2)
    );
    return distance < 0.2;
  }
  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const vec = vec4.fromValues(x, y, z, 1);
    const viewProjection = mat4.create();
    mat4.multiply(
      viewProjection,
      this.camera.projectionMatrix,
      this.camera.viewMatrix
    );
    vec4.transformMat4(vec, vec, viewProjection);
    const w = vec[3];
    return {
      x: vec[0] / w,
      y: vec[1] / w,
    };
  }
  initializeInputBindings(camera: CameraController, prefix: string): void {
    if (this.inputBindingsInitialized) return;
    this.setupSpanToCameraEyeBinding(camera, prefix, "x");
    this.setupSpanToCameraEyeBinding(camera, prefix, "y");
    this.setupSpanToCameraEyeBinding(camera, prefix, "z");
    camera.OrbitCamera();
    this.updateOrbitParametersFromEye(camera);
    this.inputBindingsInitialized = true;
  }
  setupSpanToCameraEyeBinding(
    camera: CameraController,
    prefix: string,
    property: string
  ): void {
    const inputId = `${prefix}Camera${property.toUpperCase()}`;
    const inputElement = document.getElementById(inputId) as HTMLInputElement;
    if (!inputElement) return;
    const initialValue = parseFloat(inputElement.value);
    if (!isNaN(initialValue)) {
      camera.eye[property as keyof typeof camera.eye] = initialValue;
    }
    inputElement.addEventListener("input", () => {
      const value = parseFloat(inputElement.value);
      if (!isNaN(value)) {
        camera.eye[property as keyof typeof camera.eye] = value;
        camera.OrbitCamera();
        this.updateOrbitParametersFromEye(camera);
      }
    });
  }
  updateOrbitParametersFromEye(camera: CameraController): void {
    const dx = camera.eye.x - camera.center.x;
    const dy = camera.eye.y - camera.center.y;
    const dz = camera.eye.z - camera.center.z;
    this.cameraRadiuscam = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.scalervalue = this.cameraRadiuscam;
    this.rotationX =
      (Math.atan2(dx, dz) * (180 / Math.PI)) /
      this.sensitivity;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    this.rotationY =
      (Math.atan2(dy, horizDist) * (180 / Math.PI)) /
      this.sensitivity;
  }
  calculateEdgeCount(indices: Uint16Array): number {
    const edges = new Set<string>();
    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];
      const addEdge = (a: number, b: number) => {
        const key = [a, b].sort((x, y) => x - y).join(",");
        edges.add(key);
      };
      addEdge(v1, v2);
      addEdge(v2, v3);
      addEdge(v3, v1);
    }
    return edges.size;
  }
  initBoundingBoxes(): void {
    this.scene.objects.forEach((object: any) => {
      if (object.updateBoundingBox) {
        object.updateBoundingBox();
      }
    });
  }
  performRaycasting(): RenderableMeshObject[] {
    this.setupRay(this.mouseX, this.mouseY);

    const pixels = new Uint8Array(4);
    // Convert NDC (-1 to 1) to screen coordinates (0 to width/height)
    const screenX = ((this.mouseX + 1) / 2) * this.canvas.width;
    const screenY = ((this.mouseY + 1) / 2) * this.canvas.height;

    this.gl.readPixels(
      screenX,
      screenY,
      1,
      1,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      pixels
    );
    let selectObject = this.checkIntersections();
    if (
      selectObject &&
      selectObject.selectObject &&
      selectObject.selectObject.length > 0
    ) {
      return selectObject.selectObject;
    }
    return [];
  }
  handleTranslation(deltaX: number, deltaY: number): void {
    if (!this.selectedObject) return;
    const viewMatrix = this.camera.viewMatrix;
    const right = [viewMatrix[0], viewMatrix[4], viewMatrix[8]];
    const up = [viewMatrix[1], viewMatrix[5], viewMatrix[9]];
    let moveX = 0,
      moveY = 0,
      moveZ = 0;
    if (this.activeAxis === Axis.X) {
      moveX = (right[0] * deltaX + up[0] * -deltaY) * this.objectSensitivity;
    } else if (this.activeAxis === Axis.Y) {
      moveY = (right[1] * deltaX + up[1] * -deltaY) * this.objectSensitivity;
    } else if (this.activeAxis === Axis.Z) {
      moveZ = (right[2] * deltaX + up[2] * -deltaY) * this.objectSensitivity;
    } else if (this.activeAxis === Axis.XY) {
      moveX = (right[0] * deltaX + up[0] * -deltaY) * this.objectSensitivity;
      moveY = (right[1] * deltaX + up[1] * -deltaY) * this.objectSensitivity;
    } else if (this.activeAxis === Axis.XZ) {
      moveX = (right[0] * deltaX + up[0] * -deltaY) * this.objectSensitivity;
      moveZ = (right[2] * deltaX + up[2] * -deltaY) * this.objectSensitivity;
    } else if (this.activeAxis === Axis.YZ) {
      moveY = (right[1] * deltaX + up[1] * -deltaY) * this.objectSensitivity;
      moveZ = (right[2] * deltaX + up[2] * -deltaY) * this.objectSensitivity;
    } else if (this.activeAxis === Axis.XYZ) {
      moveX = (right[0] * deltaX + up[0] * -deltaY) * this.objectSensitivity;
      moveY = (right[1] * deltaX + up[1] * -deltaY) * this.objectSensitivity;
      moveZ = (right[2] * deltaX + up[2] * -deltaY) * this.objectSensitivity;
    }
    if (this.editorMode === 'edit' && this.selectedVertices.length > 0) {
      // 1. Calculate world space delta vector
      const worldDelta = vec3.fromValues(moveX, moveY, moveZ);
      
      // 2. Transform world space delta vector to local space of the mesh
      const invWorldMatrix = mat4.create();
      mat4.invert(invWorldMatrix, this.selectedObject.getWorldMatrix());
      invWorldMatrix[12] = 0;
      invWorldMatrix[13] = 0;
      invWorldMatrix[14] = 0;
      
      const localDelta = vec3.create();
      vec3.transformMat4(localDelta, worldDelta, invWorldMatrix);

      // 3. Apply local delta to all selected vertices relative to their drag start positions
      const vertices = this.selectedObject.vertices as number[];
      const original = this.originalVertexPositions;
      for (const idx of this.selectedVertices) {
        vertices[idx * 3] = original[idx * 3] + localDelta[0];
        vertices[idx * 3 + 1] = original[idx * 3 + 1] + localDelta[1];
        vertices[idx * 3 + 2] = original[idx * 3 + 2] + localDelta[2];
      }

      // 4. Force renderer update and recalculate normals
      this.selectedObject.geometryNeedsUpdate = true;
      this.selectedObject.geometry.type = "Custom-Mesh"; // Bypass primitive normals map
      this.recalculateNormals(this.selectedObject);
      if (this.selectedObject.geometry) {
        this.selectedObject.geometry.Vertices = this.selectedObject.vertices;
        this.selectedObject.geometry.Normals = this.selectedObject.normals;
      }
      this.selectedObject.updateBoundingBox();

      // 5. Update Gizmo position to the new world position of the selection center
      let avgLocal = vec3.create();
      for (const idx of this.selectedVertices) {
        avgLocal[0] += vertices[idx * 3];
        avgLocal[1] += vertices[idx * 3 + 1];
        avgLocal[2] += vertices[idx * 3 + 2];
      }
      vec3.scale(avgLocal, avgLocal, 1 / this.selectedVertices.length);

      const avgWorld = vec3.create();
      vec3.transformMat4(avgWorld, avgLocal, this.selectedObject.getWorldMatrix());

      if (this.gizmo) {
        this.gizmo.position.x = avgWorld[0];
        this.gizmo.position.y = avgWorld[1];
        this.gizmo.position.z = avgWorld[2];
        this.gizmo.updateLocalMatrix();
      }
      return;
    }

    if (this.select && this.select.length > 1) {
      for (const obj of this.select) {
        const orig = this.originalMultiPositions.get(obj.uuid);
        if (orig) {
          obj.position.x = orig.x + moveX;
          obj.position.y = orig.y + moveY;
          obj.position.z = orig.z + moveZ;
          obj.updateTranslate();
        }
      }
      this.updateGizmoPositionForMultiSelection();
      return;
    }

    this.selectedObject.position.x = this.originalObjectPosition.x + moveX;
    this.selectedObject.position.y = this.originalObjectPosition.y + moveY;
    this.selectedObject.position.z = this.originalObjectPosition.z + moveZ;
    this.selectedObject.updateTranslate();
    this.objectPivotPosition.x = this.selectedObject.position.x;
    this.objectPivotPosition.y = this.selectedObject.position.y;
    this.objectPivotPosition.z = this.selectedObject.position.z;
    if (this.gizmo) {
      this.updateGizmoPosition(this.selectedObject);
    }
  }
  handleRotation(event: PointerEvent): void {
    if (!this.selectedObject || !this.activeAxis) return;
    const deltaX = event.clientX - this.dragStartPosition.x;
    const deltaY = event.clientY - this.dragStartPosition.y;
    const rotationSpeed = 0.01;
    let rotationDelta = 0;

    switch (this.activeAxis) {
      case Axis.X:
        rotationDelta = deltaY * rotationSpeed;
        this.selectedObject.rotate.x =
          this.originalObjectRotation.x + rotationDelta;
        break;
      case Axis.Y:
        rotationDelta = deltaX * rotationSpeed;
        this.selectedObject.rotate.y =
          this.originalObjectRotation.y + rotationDelta;
        break;
      case Axis.Z:
        rotationDelta = -deltaX * rotationSpeed;
        this.selectedObject.rotate.z =
          this.originalObjectRotation.z + rotationDelta;
        break;
      case Axis.SCREEN:
      case Axis.X:
      case Axis.Y:
        const gizmoScreenPos = this.worldToScreen(
          this.gizmo!.position.x,
          this.gizmo!.position.y,
          this.gizmo!.position.z
        );
        const rect = this.canvas.getBoundingClientRect();
        const centerX = ((gizmoScreenPos.x + 1) / 2) * rect.width;
        const centerY = ((1 - gizmoScreenPos.y) / 2) * rect.height;
        const currentAngle = Math.atan2(
          event.clientY - rect.top - centerY,
          event.clientX - rect.left - centerX
        );
        rotationDelta = currentAngle - this.initialMouseAngle;

        if (this.activeAxis === Axis.SCREEN) {
          // Rotate around camera forward vector
          const viewMatrix = this.camera.viewMatrix;
          const forward = vec3.fromValues(-viewMatrix[2], -viewMatrix[6], -viewMatrix[10]);
          vec3.normalize(forward, forward);
          const speedFactor = 0.04;
          // Apply rotation to object
          this.selectedObject.rotate.z = this.originalObjectRotation.z - (rotationDelta * speedFactor) * (180 / Math.PI);
        } else if (this.activeAxis === Axis.X) {
          this.selectedObject.rotate.x = this.originalObjectRotation.x + rotationDelta * (180 / Math.PI);
        } else if (this.activeAxis === Axis.Y) {
          this.selectedObject.rotate.y = this.originalObjectRotation.y + rotationDelta * (180 / Math.PI);
        }
        break;
    }

    if (this.selectedObject.ObjectRotation) {
      this.selectedObject.ObjectRotation();
    }

    this.selectedObject.position.x = this.objectPivotPosition.x;
    this.selectedObject.position.y = this.objectPivotPosition.y;
    this.selectedObject.position.z = this.objectPivotPosition.z;

    this.selectedObject.updateTranslate();

    if (this.gizmo) {
      this.updateGizmoPosition(this.selectedObject);
    }
  }

  handleScaling(deltaX: number, deltaY: number): void {
    if (!this.selectedObject) return;

    const viewMatrix = this.camera.viewMatrix;
    const right = [viewMatrix[0], viewMatrix[4], viewMatrix[8]];
    const up = [viewMatrix[1], viewMatrix[5], viewMatrix[9]];

    if (this.activeAxis === Axis.X) {
      const axisDelta =
        (right[0] * deltaX + up[0] * -deltaY) * this.objectSensitivity;
      this.selectedObject.scale.x = Math.max(
        0.01,
        this.originalObjectScale.x + axisDelta
      );
    } else if (this.activeAxis === Axis.Y) {
      const axisDelta =
        (right[1] * deltaX + up[1] * -deltaY) * this.objectSensitivity;
      this.selectedObject.scale.y = Math.max(
        0.01,
        this.originalObjectScale.y + axisDelta
      );
    } else if (this.activeAxis === Axis.Z) {
      const axisDelta =
        (right[2] * deltaX + up[2] * -deltaY) * this.objectSensitivity;
      this.selectedObject.scale.z = Math.max(
        0.01,
        this.originalObjectScale.z + axisDelta
      );
    } else if (this.activeAxis === Axis.XYZ) {
      const scaleFactor = (deltaX - deltaY) * this.objectSensitivity * 0.1;
      const uniformDelta = 1.0 + scaleFactor;
      this.selectedObject.scale.x = Math.max(
        0.01,
        this.originalObjectScale.x * uniformDelta
      );
      this.selectedObject.scale.y = Math.max(
        0.01,
        this.originalObjectScale.y * uniformDelta
      );
      this.selectedObject.scale.z = Math.max(
        0.01,
        this.originalObjectScale.z * uniformDelta
      );
    }

    this.selectedObject.updateScale();

    if (this.gizmo) {
      this.updateGizmoPosition(this.selectedObject);
    }
  }
  controlEvent(): number[] {
    // Gizmo position is updated in handleTranslation / handleRotation / handleScaling
    // during pointermove — do not re-run getBoundingBox here every animate frame.
    const cameraAngleX = ((this.rotationX * this.sensitivity) / 180) * Math.PI;
    const cameraAngleY = ((this.rotationY * this.sensitivity) / 180) * Math.PI;
    const cameraX =
      this.camera.center.x + this.cameraRadiuscam * Math.cos(cameraAngleY) * Math.sin(cameraAngleX);
    const cameraY = this.camera.center.y + this.cameraRadiuscam * Math.sin(cameraAngleY);
    const cameraZ =
      this.camera.center.z + this.cameraRadiuscam * Math.cos(cameraAngleY) * Math.cos(cameraAngleX);
    return [cameraX, cameraY, cameraZ];
  }

  // --- EDIT MODE HELPER METHODS ---

  /** Project world point to canvas pixels; null if behind camera. */
  private worldToCanvasPixel(
    x: number,
    y: number,
    z: number
  ): { x: number; y: number; depth: number } | null {
    const vec = vec4.fromValues(x, y, z, 1);
    const viewProjection = mat4.create();
    mat4.multiply(
      viewProjection,
      this.camera.projectionMatrix,
      this.camera.viewMatrix
    );
    vec4.transformMat4(vec, vec, viewProjection);
    if (vec[3] <= 0.0001) return null;
    const ndcX = vec[0] / vec[3];
    const ndcY = vec[1] / vec[3];
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    return {
      x: ((ndcX + 1) / 2) * width,
      y: ((1 - ndcY) / 2) * height,
      depth: vec[3],
    };
  }

  private getMouseCanvasPixel(): { x: number; y: number } {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    return {
      x: ((this.mouseX + 1) / 2) * width,
      y: ((1 - this.mouseY) / 2) * height,
    };
  }

  checkVertexIntersections(mesh: RenderableMeshObject): number | null {
    const vertices = mesh.vertices || [];
    const modelMatrix = mesh.getWorldMatrix();
    const mouse = this.getMouseCanvasPixel();
    // Match ~gl_PointSize (10px) with a small pad — screen-space, not world units
    const pickRadiusPx = 14;
    let closestDist = Infinity;
    let closestVertexIndex = -1;
    let closestDepth = Infinity;

    const worldPos = vec3.create();

    for (let i = 0; i < vertices.length; i += 3) {
      const localPos = vec3.fromValues(vertices[i], vertices[i + 1], vertices[i + 2]);
      vec3.transformMat4(worldPos, localPos, modelMatrix);
      const pixel = this.worldToCanvasPixel(worldPos[0], worldPos[1], worldPos[2]);
      if (!pixel) continue;

      const dist = Math.hypot(pixel.x - mouse.x, pixel.y - mouse.y);
      if (dist > pickRadiusPx) continue;
      // Prefer nearer cursor; near-ties prefer nearer camera
      if (
        dist < closestDist - 0.25 ||
        (Math.abs(dist - closestDist) <= 0.25 && pixel.depth < closestDepth)
      ) {
        closestDist = dist;
        closestDepth = pixel.depth;
        closestVertexIndex = i / 3;
      }
    }

    return closestVertexIndex >= 0 ? closestVertexIndex : null;
  }

  checkEdgeIntersections(mesh: RenderableMeshObject): number[] | null {
    const indices = mesh.indices;
    const vertices = mesh.vertices;
    if (!indices || !vertices) return null;

    const modelMatrix = mesh.getWorldMatrix();
    const mouse = this.getMouseCanvasPixel();
    const pickRadiusPx = 12;
    let closestDist = Infinity;
    let closestEdge: number[] | null = null;
    let closestDepth = Infinity;

    const getPosKey = (idx: number) => {
      const x = vertices[idx * 3];
      const y = vertices[idx * 3 + 1];
      const z = vertices[idx * 3 + 2];
      return `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    };

    const edgeMap: Map<string, { v1: number; v2: number }> = new Map();
    for (let i = 0; i < indices.length; i += 3) {
      const v0 = indices[i];
      const v1 = indices[i + 1];
      const v2 = indices[i + 2];

      const triEdges = [[v0, v1], [v1, v2], [v2, v0]];
      for (const [a, b] of triEdges) {
        const ka = getPosKey(a);
        const kb = getPosKey(b);
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { v1: a, v2: b });
        }
      }
    }

    const worldA = vec3.create();
    const worldB = vec3.create();

    for (const edge of edgeMap.values()) {
      const localA = vec3.fromValues(
        vertices[edge.v1 * 3],
        vertices[edge.v1 * 3 + 1],
        vertices[edge.v1 * 3 + 2]
      );
      const localB = vec3.fromValues(
        vertices[edge.v2 * 3],
        vertices[edge.v2 * 3 + 1],
        vertices[edge.v2 * 3 + 2]
      );
      vec3.transformMat4(worldA, localA, modelMatrix);
      vec3.transformMat4(worldB, localB, modelMatrix);

      const pixA = this.worldToCanvasPixel(worldA[0], worldA[1], worldA[2]);
      const pixB = this.worldToCanvasPixel(worldB[0], worldB[1], worldB[2]);
      if (!pixA || !pixB) continue;

      // Distance from mouse to screen-space segment A–B
      const abx = pixB.x - pixA.x;
      const aby = pixB.y - pixA.y;
      const lenSq = abx * abx + aby * aby;
      let t = 0;
      if (lenSq > 0.0001) {
        t = ((mouse.x - pixA.x) * abx + (mouse.y - pixA.y) * aby) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const cx = pixA.x + abx * t;
      const cy = pixA.y + aby * t;
      const dist = Math.hypot(mouse.x - cx, mouse.y - cy);
      const depth = pixA.depth * (1 - t) + pixB.depth * t;

      if (dist > pickRadiusPx) continue;
      if (
        dist < closestDist - 0.25 ||
        (Math.abs(dist - closestDist) <= 0.25 && depth < closestDepth)
      ) {
        closestDist = dist;
        closestDepth = depth;
        closestEdge = [edge.v1, edge.v2];
      }
    }

    return closestEdge;
  }

  getMatchingVertices(mesh: RenderableMeshObject, targetIndices: number[]): number[] {
    const vertices = mesh.vertices;
    if (!vertices) return targetIndices;

    const matching = new Set<number>();
    const targetKeys = new Set<string>();

    const getPosKey = (idx: number) => {
      return `${vertices[idx * 3].toFixed(4)},${vertices[idx * 3 + 1].toFixed(4)},${vertices[idx * 3 + 2].toFixed(4)}`;
    };

    for (const idx of targetIndices) {
      targetKeys.add(getPosKey(idx));
    }

    for (let i = 0; i < vertices.length / 3; i++) {
      if (targetKeys.has(getPosKey(i))) {
        matching.add(i);
      }
    }

    return Array.from(matching);
  }

  recalculateNormals(mesh: RenderableMeshObject): void {
    const vertices = mesh.vertices;
    const indices = mesh.indices;
    if (!indices || !vertices) return;

    const normals = new Float32Array(vertices.length);

    for (let i = 0; i < indices.length; i += 3) {
      const v0 = indices[i];
      const v1 = indices[i + 1];
      const v2 = indices[i + 2];

      const p0 = [vertices[v0 * 3], vertices[v0 * 3 + 1], vertices[v0 * 3 + 2]];
      const p1 = [vertices[v1 * 3], vertices[v1 * 3 + 1], vertices[v1 * 3 + 2]];
      const p2 = [vertices[v2 * 3], vertices[v2 * 3 + 1], vertices[v2 * 3 + 2]];

      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];

      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;

      normals[v0 * 3] += nx;     normals[v0 * 3 + 1] += ny;     normals[v0 * 3 + 2] += nz;
      normals[v1 * 3] += nx;     normals[v1 * 3 + 1] += ny;     normals[v1 * 3 + 2] += nz;
      normals[v2 * 3] += nx;     normals[v2 * 3 + 1] += ny;     normals[v2 * 3 + 2] += nz;
    }

    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0.0001) {
        normals[i] = nx / len;
        normals[i + 1] = ny / len;
        normals[i + 2] = nz / len;
      }
    }

    mesh.normals = normals;
  }

  handleDirectSubElementTranslation(
    deltaX: number,
    deltaY: number,
    lockToFaceNormal: boolean = false
  ): void {
    if (!this.selectedObject || this.selectedVertices.length === 0) return;

    const viewMatrix = this.camera.viewMatrix;
    const right = [viewMatrix[0], viewMatrix[4], viewMatrix[8]];
    const up = [viewMatrix[1], viewMatrix[5], viewMatrix[9]];

    // Direct drag sensitivity factor
    const sensitivity = 0.015;
    const moveX = (right[0] * deltaX + up[0] * -deltaY) * sensitivity;
    const moveY = (right[1] * deltaX + up[1] * -deltaY) * sensitivity;
    const moveZ = (right[2] * deltaX + up[2] * -deltaY) * sensitivity;

    const worldDelta = vec3.fromValues(moveX, moveY, moveZ);
    
    const invWorldMatrix = mat4.create();
    mat4.invert(invWorldMatrix, this.selectedObject.getWorldMatrix());
    invWorldMatrix[12] = 0;
    invWorldMatrix[13] = 0;
    invWorldMatrix[14] = 0;
    
    const localDelta = vec3.create();
    vec3.transformMat4(localDelta, worldDelta, invWorldMatrix);

    // Face mode + Shift: slide only along the selected face normal
    if (
      lockToFaceNormal &&
      this.editSubMode === "face" &&
      this.selectedFaceNormal
    ) {
      const n = this.selectedFaceNormal;
      const amount = localDelta[0] * n[0] + localDelta[1] * n[1] + localDelta[2] * n[2];
      localDelta[0] = n[0] * amount;
      localDelta[1] = n[1] * amount;
      localDelta[2] = n[2] * amount;
    }

    const vertices = this.selectedObject.vertices as number[];
    const original = this.originalVertexPositions;
    
    for (const idx of this.selectedVertices) {
      if (idx * 3 < vertices.length && idx * 3 < original.length) {
        vertices[idx * 3] = original[idx * 3] + localDelta[0];
        vertices[idx * 3 + 1] = original[idx * 3 + 1] + localDelta[1];
        vertices[idx * 3 + 2] = original[idx * 3 + 2] + localDelta[2];
      }
    }

    this.selectedObject.geometryNeedsUpdate = true;
    this.selectedObject.geometry.type = "Custom-Mesh";
    this.recalculateNormals(this.selectedObject);
    if (this.selectedObject.geometry) {
      this.selectedObject.geometry.Vertices = this.selectedObject.vertices;
      this.selectedObject.geometry.Normals = this.selectedObject.normals;
    }
    this.selectedObject.updateBoundingBox();
  }

  updateGizmoPositionForMultiSelection(): void {
    if (!this.gizmo) return;
    if (!this.select || this.select.length === 0) {
      this.gizmo.visible = false;
      return;
    }
    if (this.select.length === 1) {
      this.updateGizmoPosition(this.select[0]);
      return;
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let hasBounds = false;

    for (const obj of this.select) {
      // Use cached bounding box — no need to recompute
      const box = (obj as any).getBoundingBox ? (obj as any).getBoundingBox() : (obj as any).boundingBox;
      if (box && isFinite(box.min[0]) && isFinite(box.max[0])) {
        minX = Math.min(minX, box.min[0]);
        minY = Math.min(minY, box.min[1]);
        minZ = Math.min(minZ, box.min[2]);
        maxX = Math.max(maxX, box.max[0]);
        maxY = Math.max(maxY, box.max[1]);
        maxZ = Math.max(maxZ, box.max[2]);
        hasBounds = true;
      } else {
        const wm = (obj as any).getWorldMatrix ? (obj as any).getWorldMatrix() : (obj as any).worldMatrix;
        const wx = wm ? wm[12] : obj.position.x;
        const wy = wm ? wm[13] : obj.position.y;
        const wz = wm ? wm[14] : obj.position.z;
        minX = Math.min(minX, wx);
        minY = Math.min(minY, wy);
        minZ = Math.min(minZ, wz);
        maxX = Math.max(maxX, wx);
        maxY = Math.max(maxY, wy);
        maxZ = Math.max(maxZ, wz);
        hasBounds = true;
      }
    }

    if (hasBounds) {
      this.gizmo.position.x = (minX + maxX) / 2;
      this.gizmo.position.y = (minY + maxY) / 2;
      this.gizmo.position.z = (minZ + maxZ) / 2;
    }
    this.gizmo.updateLocalMatrix();
    this.gizmo.visible = true;
    if (!this.gizmo.gizmoMeshes.length) {
      this.gizmo.addToScene(this.scene);
    }
  }

  private updateMarqueeVisual(currentX: number, currentY: number): void {
    if (!this.marqueeBoxEl) {
      this.marqueeBoxEl = document.getElementById("marquee-selection-box");
      if (!this.marqueeBoxEl) return;
    }
    const parentRect =
      this.canvas.parentElement?.getBoundingClientRect() ||
      this.canvas.getBoundingClientRect();

    const x1 = Math.min(this.marqueeStart.x, currentX) - parentRect.left;
    const y1 = Math.min(this.marqueeStart.y, currentY) - parentRect.top;
    const w = Math.abs(currentX - this.marqueeStart.x);
    const h = Math.abs(currentY - this.marqueeStart.y);

    this.marqueeBoxEl.style.left = `${x1}px`;
    this.marqueeBoxEl.style.top = `${y1}px`;
    this.marqueeBoxEl.style.width = `${w}px`;
    this.marqueeBoxEl.style.height = `${h}px`;
    this.marqueeBoxEl.style.display = "block";
  }

  performMarqueeSelection(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    addToSelection: boolean = false
  ): void {
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;

    const vp = mat4.create();
    mat4.multiply(vp, this.camera.projectionMatrix, this.camera.viewMatrix);

    const newlySelected: RenderableMeshObject[] = [];

    // Project each scene object to 2D screen space
    for (const obj of this.scene.objects) {
      // Exclude gizmo, grid, and invisible objects
      if (
        obj.isGizmoPart ||
        obj.type === "Grid-Geometry" ||
        (obj as any).visible === false
      ) {
        continue;
      }

      let isInside = false;

      // 1. Center projection test
      let worldCenter: [number, number, number] = [
        obj.position.x,
        obj.position.y,
        obj.position.z,
      ];
      if (obj.boundingBox) {
        const bMin = obj.boundingBox.min;
        const bMax = obj.boundingBox.max;
        worldCenter = [
          (bMin[0] + bMax[0]) * 0.5,
          (bMin[1] + bMax[1]) * 0.5,
          (bMin[2] + bMax[2]) * 0.5,
        ];
      }

      const cp = vec4.fromValues(worldCenter[0], worldCenter[1], worldCenter[2], 1.0);
      vec4.transformMat4(cp, cp, vp);

      if (cp[3] > 0.001) {
        const cScreenX = ((cp[0] / cp[3]) * 0.5 + 0.5) * canvasWidth;
        const cScreenY = (-(cp[1] / cp[3]) * 0.5 + 0.5) * canvasHeight;

        if (
          cScreenX >= minX &&
          cScreenX <= maxX &&
          cScreenY >= minY &&
          cScreenY <= maxY
        ) {
          isInside = true;
        }
      }

      // 2. Bounding Box Corners test (if mesh has boundingBox)
      if (!isInside && obj.boundingBox) {
        const bMin = obj.boundingBox.min;
        const bMax = obj.boundingBox.max;
        const corners = [
          [bMin[0], bMin[1], bMin[2]],
          [bMax[0], bMin[1], bMin[2]],
          [bMin[0], bMax[1], bMin[2]],
          [bMax[0], bMax[1], bMin[2]],
          [bMin[0], bMin[1], bMax[2]],
          [bMax[0], bMin[1], bMax[2]],
          [bMin[0], bMax[1], bMax[2]],
          [bMax[0], bMax[1], bMax[2]],
        ];

        let screenMinX = Infinity;
        let screenMaxX = -Infinity;
        let screenMinY = Infinity;
        let screenMaxY = -Infinity;
        let hasVisibleCorner = false;

        for (const corner of corners) {
          const p = vec4.fromValues(corner[0], corner[1], corner[2], 1.0);
          vec4.transformMat4(p, p, vp);

          if (p[3] > 0.001) {
            const sx = ((p[0] / p[3]) * 0.5 + 0.5) * canvasWidth;
            const sy = (-(p[1] / p[3]) * 0.5 + 0.5) * canvasHeight;
            screenMinX = Math.min(screenMinX, sx);
            screenMaxX = Math.max(screenMaxX, sx);
            screenMinY = Math.min(screenMinY, sy);
            screenMaxY = Math.max(screenMaxY, sy);
            hasVisibleCorner = true;
          }
        }

        if (hasVisibleCorner) {
          const overlapX =
            Math.max(0, Math.min(screenMaxX, maxX) - Math.max(screenMinX, minX));
          const overlapY =
            Math.max(0, Math.min(screenMaxY, maxY) - Math.max(screenMinY, minY));

          if (overlapX > 0 && overlapY > 0) {
            isInside = true;
          }
        }
      }

      if (isInside) {
        newlySelected.push(obj);
      }
    }

    // Apply selection
    let finalSelection: RenderableMeshObject[] = [];
    if (addToSelection) {
      const existingUuids = new Set(this.select.map((s) => s.uuid));
      finalSelection = [...this.select];
      for (const obj of newlySelected) {
        if (!existingUuids.has(obj.uuid)) {
          finalSelection.push(obj);
        }
      }
    } else {
      finalSelection = newlySelected;
    }

    if (finalSelection.length > 0) {
      this.isObjectSelected = true;
      this.select = finalSelection;
      this.selectedObject = finalSelection[0];
      this.webgl.selectedObject = finalSelection[0];
      this.updateGizmoPositionForMultiSelection();

      const uuids = finalSelection.map((o) => o.uuid);
      if (this.onMultiSelect) {
        this.onMultiSelect(uuids);
      } else if (this.onSelect) {
        this.onSelect(this.selectedObject.uuid || null);
      }
    } else {
      this.deselectObject();
    }
  }

}
