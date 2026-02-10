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
      this.nodes.push(node);

      // Categorize for rendering loop convenience
      if (node instanceof RenderableMeshObject) {
        this.objects.push(node);
      } else if (node instanceof LightNode) {
        this.lights.push(node);
      }
    } else if (node instanceof GridHelper) {
      this.grids.push(node);
    }
  }

  remove(node: SceneNode | GridHelper): void {
    if (node instanceof SceneNode) {
      // Correctly detach from parent if it exists
      node.setParent(null);

      const index = this.nodes.indexOf(node);
      if (index !== -1) this.nodes.splice(index, 1);

      if (node instanceof RenderableMeshObject) {
        const idx = this.objects.indexOf(node);
        if (idx !== -1) this.objects.splice(idx, 1);
      } else if (node instanceof LightNode) {
        const idx = this.lights.indexOf(node);
        if (idx !== -1) this.lights.splice(idx, 1);
      }
    } else if (node instanceof GridHelper) {
      const index = this.grids.indexOf(node);
      if (index !== -1) this.grids.splice(index, 1);
    }
  }

  getRootNodes(): SceneNode[] {
    return this.nodes.filter(node => node.parent === null);
  }
}
