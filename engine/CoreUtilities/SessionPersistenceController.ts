import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
import { CameraController } from "../CameraSystem/CameraController";
import { SceneInteractionHandler } from "../EventManager/SceneInteractionHandler";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import {
  CameraOrbitState,
  IndexedDBSceneStorage,
} from "./IndexedDBSceneStorage";

export interface SessionPersistenceDeps {
  scene: SceneHierarchyManager;
  camera: CameraController;
  events: SceneInteractionHandler;
  createdObjects: Map<string, any>;
  gl: WebGLRenderingContext;
  material: PBRMaterialProperties;
  debounceMs?: number;
}

/**
 * IndexedDB autosave + session restore (orbit-aware).
 * beforeunload / view-change wiring can stay in the app.
 */
export class SessionPersistenceController {
  private readonly deps: SessionPersistenceDeps;
  private readonly debounceMs: number;
  private autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: SessionPersistenceDeps) {
    this.deps = deps;
    this.debounceMs = deps.debounceMs ?? 1000;
  }

  getCameraOrbitState(): CameraOrbitState {
    const { events } = this.deps;
    return {
      rotationX: events.rotationX,
      rotationY: events.rotationY,
      radius: events.cameraRadiuscam,
    };
  }

  triggerAutoSave(): void {
    if (this.autoSaveTimeout) clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(async () => {
      try {
        await this.saveNow();
      } catch (err) {
        console.warn("[AutoSave] Error saving to IndexedDB:", err);
      }
    }, this.debounceMs);
  }

  saveNow(): Promise<void> {
    const { scene, camera } = this.deps;
    return IndexedDBSceneStorage.saveScene(scene, camera, this.getCameraOrbitState());
  }

  clearSavedScene(): Promise<void> {
    return IndexedDBSceneStorage.clearSavedScene();
  }

  /**
   * Restore last autosave if present. Syncs orbit params onto events.
   * @returns true if a session was restored
   */
  async tryRestoreSession(): Promise<boolean> {
    const { scene, camera, events, createdObjects, gl, material } = this.deps;
    try {
      const saved = await IndexedDBSceneStorage.loadScene();
      if (!saved || !saved.nodes || saved.nodes.length === 0) {
        return false;
      }

      console.log(
        `[IndexedDB] Restoring saved session from ${new Date(saved.timestamp).toLocaleTimeString()}...`
      );
      await IndexedDBSceneStorage.restoreScene(
        saved,
        scene,
        createdObjects,
        gl,
        material,
        camera
      );

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

      console.log("[IndexedDB] Session successfully restored!");
      return true;
    } catch (err) {
      console.warn("[IndexedDB] Session auto-restore error:", err);
      return false;
    }
  }
}
