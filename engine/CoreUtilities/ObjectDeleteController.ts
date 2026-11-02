import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
import { SceneNode } from "../SceneGraph/SceneNode";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { SceneInteractionHandler } from "../EventManager/SceneInteractionHandler";
import { CommandHistory } from "./CommandHistory";

export interface ObjectDeleteUI {
  selectObjects(uuids: string[]): void;
}

export interface ObjectDeleteDeps {
  scene: SceneHierarchyManager;
  events: SceneInteractionHandler;
  commandHistory: CommandHistory;
  createdObjects: Map<string, any>;
  lightInstances: Map<string, any>;
  getSelectedObject: () => any;
  findObjectByUUID: (uuid: string) => any;
  updateSceneGraph: () => void;
  selectSingleObject: (obj: any) => void;
  deselectInEditor: () => void;
  uiManager: ObjectDeleteUI;
  triggerAutoSave: () => void;
}

/**
 * Undoable scene-object deletion (logic only — confirm UI stays in the app).
 */
export class ObjectDeleteController {
  private readonly deps: ObjectDeleteDeps;

  constructor(deps: ObjectDeleteDeps) {
    this.deps = deps;
  }

  deleteByUUID(uuid: string): void {
    const targetNode = this.deps.findObjectByUUID(uuid);
    if (!targetNode) return;
    this.deleteNodes([targetNode]);
  }

  deleteNodes(nodes: SceneNode[]): void {
    if (!nodes || nodes.length === 0) return;

    const {
      scene,
      events,
      commandHistory,
      createdObjects,
      lightInstances,
      getSelectedObject,
      updateSceneGraph,
      selectSingleObject,
      deselectInEditor,
      uiManager,
      triggerAutoSave,
    } = this.deps;

    const records = nodes.map((node) => ({
      node,
      parent: node.parent || null,
    }));

    commandHistory.execute(
      {
        name:
          nodes.length > 1
            ? `Delete ${nodes.length} Objects`
            : `Delete ${nodes[0]?.name || "Object"}`,
        execute: () => {
          for (const rec of records) {
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
            scene.remove(rec.node);
          }

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

          const selected = getSelectedObject();
          const selectedWasDeleted = records.some(
            (rec) =>
              (selected && isDescendantOrSelf(selected, rec.node)) ||
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
        },
      },
      true
    );
  }
}
