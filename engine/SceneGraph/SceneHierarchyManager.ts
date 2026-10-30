import { SceneNode } from "./SceneNode";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { LightNode } from "../LightingEngine/LightNode";
import { GridHelper } from "../CoreUtilities/GridHelper";

export class SceneHierarchyManager {
  nodes: SceneNode[] = [];
  objects: RenderableMeshObject[] = []; // Keep for backward compatibility/rendering loop
  lights: LightNode[] = []; // Keep for backward compatibility/rendering loop
  grids: GridHelper[] = [];
  globalLight: any = null; // Store SceneLightingManager for ambient light

  constructor() {
    this.nodes = [];
    this.objects = [];
    this.lights = [];
    this.grids = [];
  }

  add(node: SceneNode | GridHelper): void {
    if (node instanceof SceneNode) {
      const addRecursive = (n: SceneNode) => {
        if (!this.nodes.includes(n)) {
          this.nodes.push(n);
        }

        // Categorize for rendering loop convenience
        if (n instanceof RenderableMeshObject) {
          if (!this.objects.includes(n)) {
            this.objects.push(n);
          }
        } else if (n instanceof LightNode) {
          if (!this.lights.includes(n)) {
            this.lights.push(n);
          }
        }

        if (n.children && n.children.length > 0) {
          for (const child of n.children) {
            addRecursive(child);
          }
        }
      };

      addRecursive(node);
    } else if (node instanceof GridHelper) {
      if (!this.grids.includes(node)) {
        this.grids.push(node);
      }
    }
  }

  remove(node: SceneNode | GridHelper): void {
    if (node instanceof SceneNode) {
      // Correctly detach from parent if it exists
      if (node.parent) {
        const pIdx = node.parent.children.indexOf(node);
        if (pIdx !== -1) {
          node.parent.children.splice(pIdx, 1);
        }
        node.parent = null;
      }

      const removeRecursive = (n: SceneNode) => {
        const index = this.nodes.indexOf(n);
        if (index !== -1) this.nodes.splice(index, 1);

        if (n instanceof RenderableMeshObject) {
          const idx = this.objects.indexOf(n);
          if (idx !== -1) this.objects.splice(idx, 1);
        } else if (n instanceof LightNode) {
          const idx = this.lights.indexOf(n);
          if (idx !== -1) this.lights.splice(idx, 1);
        }

        if (n.children && n.children.length > 0) {
          for (const child of n.children) {
            removeRecursive(child);
          }
        }
      };

      removeRecursive(node);
    } else if (node instanceof GridHelper) {
      const index = this.grids.indexOf(node);
      if (index !== -1) this.grids.splice(index, 1);
    }
  }

  getRootNodes(): SceneNode[] {
    return this.nodes.filter((node) => node.parent === null);
  }
}
