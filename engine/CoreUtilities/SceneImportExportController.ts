import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
import { SceneNode } from "../SceneGraph/SceneNode";
import { GLTFAssetLoader } from "../AssetImporter/GLTFAssetLoader";
import { GLTFSceneExporter } from "../AssetImporter/GLTFSceneExporter";
import { ZipArchiveLoader } from "./ZipArchiveLoader";
import { PointLightNode } from "../LightingEngine/PointLightNode";
import { SpotLightNode } from "../LightingEngine/SpotLightNode";
import { DirectionalLightNode } from "../LightingEngine/DirectionalLightNode";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";

export interface SceneImportExportUI {
  showAlert(title: string, message?: string): void;
  showToast?(
    message: string,
    options?: { type?: "success" | "info" | "error"; durationMs?: number }
  ): void;
}

export interface SceneImportExportDeps {
  scene: SceneHierarchyManager;
  loader: GLTFAssetLoader;
  uiManager: SceneImportExportUI;
  updateSceneGraph: () => void;
  triggerAutoSave: () => void;
  selectSingleObject: (obj: any) => void;
}

/**
 * GLTF / GLB / ZIP import, folder drop extraction, and scene export.
 * DOM listeners stay in the application; this holds the load/save logic.
 */
export class SceneImportExportController {
  private readonly deps: SceneImportExportDeps;

  constructor(deps: SceneImportExportDeps) {
    this.deps = deps;
  }

  async loadModelFromFiles(inputFiles: File[] | FileList): Promise<void> {
    const { loader, uiManager, updateSceneGraph, triggerAutoSave, selectSingleObject } =
      this.deps;

    const files: File[] = Array.from(inputFiles);
    if (files.length === 0) return;

    let fileMap = new Map<string, File>();
    let gltfFile: File | null = null;

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
          uiManager.showAlert(
            "ZIP Archive",
            "No .gltf or .glb model file found inside the ZIP archive."
          );
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
      const { scene } = this.deps;
      await loader.main([url], fileMap);
      if (loader.lastImportedRoot) {
        this.fitSceneLightsToModel(scene, loader.lastImportedRoot);
        // Select first mesh so Material inspector shows (Model group has none)
        selectSingleObject(
          this.findFirstRenderableMesh(loader.lastImportedRoot) ??
            loader.lastImportedRoot
        );
      }
      updateSceneGraph();
      triggerAutoSave();
      uiManager.showToast?.(
        `Imported ${gltfFile.name}`,
        { type: "success" }
      );
    } catch (error) {
      console.error("Error loading model:", error);
      uiManager.showAlert(
        "Import Error",
        `Failed to load model: ${(error as Error).message}`
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Ensure point/spot/dir lights cover the imported model (same UnifiedLight path as primitives).
   * Scales point radius / boosts intensity; adds a light if the scene has none.
   */
  private fitSceneLightsToModel(scene: SceneHierarchyManager, root: SceneNode): void {
    const box = root.getBoundingBox();
    let cx = 0;
    let cy = 2;
    let cz = 0;
    let size = 4;
    if (box) {
      cx = (box.min[0] + box.max[0]) * 0.5;
      cy = (box.min[1] + box.max[1]) * 0.5;
      cz = (box.min[2] + box.max[2]) * 0.5;
      size = Math.max(
        box.max[0] - box.min[0],
        box.max[1] - box.min[1],
        box.max[2] - box.min[2],
        0.5
      );
    }
    const fitRadius = Math.max(size * 2, 8);
    const fitIntensity = Math.max(1.25, size * 0.15);

    if (!scene.lights || scene.lights.length === 0) {
      const pt = new PointLightNode("Point Light");
      pt.position = { x: cx, y: cy + size * 0.75, z: cz + size * 0.75 };
      pt.radius = fitRadius;
      pt.intensity = fitIntensity;
      pt.color = [1, 1, 1];
      pt.updateLocalMatrix();
      scene.add(pt);
      return;
    }

    for (const light of scene.lights) {
      if (light instanceof PointLightNode) {
        if (light.radius < fitRadius) light.radius = fitRadius;
        if (light.intensity < fitIntensity) light.intensity = fitIntensity;
        light.updateLocalMatrix();
      } else if (light instanceof SpotLightNode) {
        if (light.intensity < fitIntensity) light.intensity = fitIntensity;
        // Widen reach for large imports by keeping cone but ensuring position matrix is current
        light.updateLocalMatrix();
      } else if (light instanceof DirectionalLightNode) {
        if (light.intensity < 1.0) light.intensity = 1.0;
      }
    }
  }

  /** Recursive folder & file reader for drag-and-drop without browser security warnings. */
  async extractDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
    const fileList: File[] = [];
    const items = dataTransfer.items;

    async function readAllEntries(dirReader: any): Promise<any[]> {
      const entries: any[] = [];
      const read = async () => {
        const batch: any[] = await new Promise((resolve, reject) =>
          dirReader.readEntries(resolve, reject)
        );
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
        const file = await new Promise<File>((resolve, reject) =>
          entry.file(resolve, reject)
        );
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

  async exportScene(fileName: string = "exported_scene"): Promise<void> {
    try {
      const gltfExport = new GLTFSceneExporter();
      const gltf = gltfExport.exportSceneToGLTF(this.deps.scene);
      await gltfExport.saveGLTF(fileName, gltf);
      this.deps.uiManager.showToast?.("Scene exported", { type: "success" });
    } catch (error) {
      console.error("Error exporting scene:", error);
      this.deps.uiManager.showAlert(
        "Export Error",
        `Failed to export scene: ${(error as Error).message}`
      );
    }
  }

  private findFirstRenderableMesh(root: SceneNode): RenderableMeshObject | null {
    if (root instanceof RenderableMeshObject) return root;
    for (const child of root.children ?? []) {
      const found = this.findFirstRenderableMesh(child);
      if (found) return found;
    }
    return null;
  }
}
