import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
import { SceneNode } from "../SceneGraph/SceneNode";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { CameraController } from "../CameraSystem/CameraController";
import { SceneInteractionHandler } from "../EventManager/SceneInteractionHandler";
import { CommandHistory } from "./CommandHistory";
import { cloneSceneNode, getTopLevelNodes } from "./SceneNodeCloner";

export interface ObjectClipboardUI {
  selectObject(uuid: string | null): void;
  selectObjects(uuids: string[]): void;
  showToast?(
    message: string,
    options?: { type?: "success" | "info" | "error"; durationMs?: number }
  ): void;
}

export interface ObjectClipboardDeps {
  scene: SceneHierarchyManager;
  camera: CameraController;
  events: SceneInteractionHandler;
  commandHistory: CommandHistory;
  createdObjects: Map<string, any>;
  lightInstances: Map<string, any>;
  getSelectedObject: () => any;
  setSelectedObject: (obj: any) => void;
  getPreviousSelectedUUID: () => string | null;
  setPreviousSelectedUUID: (uuid: string | null) => void;
  findObjectByUUID: (uuid: string) => any;
  updateSceneGraph: () => void;
  updateObjectProperties: (obj: any) => void;
  selectSingleObject: (obj: any) => void;
  deselectInEditor: () => void;
  uiManager: ObjectClipboardUI;
  triggerAutoSave: () => void;
}

/**
 * Copy / Paste / Duplicate for scene objects.
 * Paste places at the current mouse cursor (ground Y=0).
 * Duplicate offsets along +X.
 */
export class ObjectClipboardController {
  private clipboard: SceneNode[] = [];
  private readonly duplicateOffset = 1.5;
  private readonly deps: ObjectClipboardDeps;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(deps: ObjectClipboardDeps) {
    this.deps = deps;
  }

  bindKeyboard(): void {
    if (this.keyHandler) return;
    this.keyHandler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "c") {
        if (this.copy()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (mod && key === "v") {
        if (this.paste()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (mod && key === "d") {
        if (this.duplicate()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  copy(): boolean {
    const targets = this.getSelectedCloneTargets();
    if (targets.length === 0) return false;
    this.clipboard = targets.map((n) => cloneSceneNode(n));
    this.deps.uiManager.showToast?.(
      targets.length > 1 ? `Copied ${targets.length} objects` : "Copied",
      { type: "info" }
    );
    return true;
  }

  paste(): boolean {
    if (!this.clipboard.length) {
      this.deps.uiManager.showToast?.("Clipboard empty", { type: "info" });
      return false;
    }

    const { commandHistory, events, updateSceneGraph, triggerAutoSave, deselectInEditor } =
      this.deps;

    const roots = this.clipboard.map((n) => cloneSceneNode(n));
    this.applyCursorPlacement(roots, this.getCursorWorldPosition());

    commandHistory.execute(
      {
        name:
          roots.length > 1
            ? `Paste ${roots.length} Objects`
            : `Paste ${roots[0].name || "Object"}`,
        execute: () => {
          for (const root of roots) this.finalizeCloneRoot(root);
          this.selectClonedNodes(roots);
          updateSceneGraph();
          triggerAutoSave();
        },
        undo: () => {
          this.removeClonesFromScene(roots);
          const selected = this.deps.getSelectedObject();
          if (
            (selected && roots.some((r) => r.uuid === selected?.uuid)) ||
            events.select.some((s: any) => roots.some((r) => r.uuid === s.uuid))
          ) {
            deselectInEditor();
          }
          updateSceneGraph();
          triggerAutoSave();
        },
      },
      true
    );
    this.deps.uiManager.showToast?.(
      roots.length > 1 ? `Pasted ${roots.length} objects` : "Pasted",
      { type: "success" }
    );
    return true;
  }

  duplicate(): boolean {
    const targets = this.getSelectedCloneTargets();
    if (targets.length === 0) return false;

    const { commandHistory, events, updateSceneGraph, triggerAutoSave, deselectInEditor } =
      this.deps;

    const roots = targets.map((n) => cloneSceneNode(n));
    for (const root of roots) {
      root.position = {
        x: root.position.x + this.duplicateOffset,
        y: root.position.y,
        z: root.position.z,
      };
    }

    commandHistory.execute(
      {
        name:
          roots.length > 1
            ? `Duplicate ${roots.length} Objects`
            : `Duplicate ${roots[0].name || "Object"}`,
        execute: () => {
          for (const root of roots) this.finalizeCloneRoot(root);
          this.selectClonedNodes(roots);
          updateSceneGraph();
          triggerAutoSave();
        },
        undo: () => {
          const selected = this.deps.getSelectedObject();
          const selectedWasDuped =
            (selected && roots.some((r) => selected === r || selected?.uuid === r.uuid)) ||
            events.select.some((s: any) => roots.some((r) => s === r || s.uuid === r.uuid));
          this.removeClonesFromScene(roots);
          if (selectedWasDuped) deselectInEditor();
          updateSceneGraph();
          triggerAutoSave();
        },
      },
      true
    );
    this.deps.uiManager.showToast?.(
      roots.length > 1 ? `Duplicated ${roots.length} objects` : "Duplicated",
      { type: "success" }
    );
    return true;
  }

  private getCursorWorldPosition(): { x: number; y: number; z: number } {
    const { events } = this.deps;
    events.setupRay(events.mouseX, events.mouseY);
    const ox = events.rayOrigin[0];
    const oy = events.rayOrigin[1];
    const oz = events.rayOrigin[2];
    const dx = events.rayDirection[0];
    const dy = events.rayDirection[1];
    const dz = events.rayDirection[2];

    if (Math.abs(dy) > 1e-6) {
      const t = -oy / dy;
      if (t > 0.01) {
        return { x: ox + dx * t, y: 0, z: oz + dz * t };
      }
    }

    const dist = Math.max(2, events.cameraRadiuscam || 10);
    return { x: ox + dx * dist, y: oy + dy * dist, z: oz + dz * dist };
  }

  private isCloneableNode(node: any): node is SceneNode {
    if (!node || !(node instanceof SceneNode)) return false;
    if (node === (this.deps.camera as any)) return false;
    if ((node as any).isGizmoPart) return false;
    if (node.type === "Grid-Geometry") return false;
    if (typeof node.type === "string" && node.type.startsWith("Gizmo-")) return false;
    return true;
  }

  private getSelectedCloneTargets(): SceneNode[] {
    const { events, findObjectByUUID, getSelectedObject, getPreviousSelectedUUID } = this.deps;
    let candidates: SceneNode[] = [];
    if (events.select && events.select.length > 0) {
      candidates = events.select.filter((n) => this.isCloneableNode(n)) as SceneNode[];
    } else {
      const selected = getSelectedObject();
      if (selected && this.isCloneableNode(selected)) {
        candidates = [selected as SceneNode];
      } else {
        const prev = getPreviousSelectedUUID();
        if (prev) {
          const node = findObjectByUUID(prev);
          if (node && this.isCloneableNode(node)) candidates = [node];
        }
      }
    }
    return getTopLevelNodes(candidates);
  }

  private registerClonedNode(node: SceneNode) {
    if (node instanceof RenderableMeshObject) {
      this.deps.createdObjects.set(node.uuid, node);
    }
    if (node.children) {
      for (const child of node.children) {
        this.registerClonedNode(child);
      }
    }
  }

  private unregisterClonedNode(node: SceneNode) {
    this.deps.createdObjects.delete(node.uuid);
    if (this.deps.lightInstances.has(node.uuid)) {
      this.deps.lightInstances.delete(node.uuid);
    }
    if (node.children) {
      for (const child of node.children) {
        this.unregisterClonedNode(child);
      }
    }
  }

  private selectClonedNodes(roots: SceneNode[]) {
    if (roots.length === 0) return;
    const {
      events,
      scene,
      uiManager,
      updateObjectProperties,
      selectSingleObject,
      setSelectedObject,
      setPreviousSelectedUUID,
    } = this.deps;

    const meshes: RenderableMeshObject[] = [];
    const collect = (n: SceneNode) => {
      if (n instanceof RenderableMeshObject) meshes.push(n);
      if (n.children) n.children.forEach(collect);
    };
    roots.forEach(collect);

    if (meshes.length > 0) {
      events.select = meshes;
      events.selectedObject = meshes[0];
      events.isObjectSelected = true;
      setSelectedObject(meshes[0]);
      setPreviousSelectedUUID(meshes[0].uuid);
      if (events.webgl) events.webgl.selectedObject = meshes[0];
      if (events.gizmo) {
        events.gizmo.visible = true;
        if (meshes.length === 1) {
          events.updateGizmoPosition(meshes[0]);
        } else {
          events.updateGizmoPositionForMultiSelection();
        }
        if (!events.gizmo.gizmoMeshes.length) {
          events.gizmo.addToScene(scene);
        }
      }
      if (meshes.length === 1) {
        uiManager.selectObject(meshes[0].uuid);
        updateObjectProperties(meshes[0]);
      } else {
        uiManager.selectObjects(meshes.map((m) => m.uuid));
      }
    } else {
      selectSingleObject(roots[0]);
    }
  }

  private finalizeCloneRoot(root: SceneNode) {
    root.updateLocalMatrix();
    if (root instanceof RenderableMeshObject) {
      root.updateTranslate();
      if (root.updateBoundingBox) root.updateBoundingBox();
    }
    this.deps.scene.add(root);
    this.registerClonedNode(root);
  }

  private applyCursorPlacement(
    roots: SceneNode[],
    cursor: { x: number; y: number; z: number }
  ) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const root of roots) {
      cx += root.position.x;
      cy += root.position.y;
      cz += root.position.z;
    }
    const n = roots.length || 1;
    const dx = cursor.x - cx / n;
    const dy = cursor.y - cy / n;
    const dz = cursor.z - cz / n;

    for (const root of roots) {
      root.position = {
        x: root.position.x + dx,
        y: root.position.y + dy,
        z: root.position.z + dz,
      };
    }
  }

  private removeClonesFromScene(roots: SceneNode[]) {
    for (const root of roots) {
      this.unregisterClonedNode(root);
      this.deps.scene.remove(root);
    }
  }
}
