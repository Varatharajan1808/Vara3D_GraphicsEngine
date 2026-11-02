import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
import { SceneNode } from "../SceneGraph/SceneNode";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { CameraController } from "../CameraSystem/CameraController";
import { SceneInteractionHandler } from "../EventManager/SceneInteractionHandler";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import { BoxGeometryBuilder } from "../GeometryPrimitives/BoxGeometryBuilder";
import { SphereGeometryBuilder } from "../GeometryPrimitives/SphereGeometryBuilder";
import { PlaneGeometryBuilder } from "../GeometryPrimitives/PlaneGeometryBuilder";
import { ConeGeometryBuilder } from "../GeometryPrimitives/ConeGeometryBuilder";
import { CylinderGeometryBuilder } from "../GeometryPrimitives/CylinderGeometryBuilder";
import { LightNode } from "../LightingEngine/LightNode";
import { PointLightNode } from "../LightingEngine/PointLightNode";
import { SpotLightNode } from "../LightingEngine/SpotLightNode";
import { DirectionalLightNode } from "../LightingEngine/DirectionalLightNode";
import { CommandHistory } from "./CommandHistory";

export interface ObjectFactoryUI {
  selectObject(uuid: string | null): void;
  onAddObject(handler: (type: string, subtype: string) => void): void;
}

export interface ObjectFactoryDeps {
  scene: SceneHierarchyManager;
  camera: CameraController;
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  events: SceneInteractionHandler;
  commandHistory: CommandHistory;
  createdObjects: Map<string, any>;
  material: PBRMaterialProperties;
  materialColors: { white: [number, number, number]; [key: string]: [number, number, number] };
  unifiedProgram: WebGLProgram;
  getProgram: () => any;
  setProgram: (program: any) => void;
  getSelectedObject: () => any;
  setSelectedObject: (obj: any) => void;
  setPreviousSelectedUUID: (uuid: string | null) => void;
  updateSceneGraph: () => void;
  updateObjectProperties: (obj: any) => void;
  selectSingleObject: (obj: any) => void;
  deselectInEditor: () => void;
  uiManager: ObjectFactoryUI;
}

/**
 * Creates meshes, lights, and switches camera projection from the Add menu / shortcuts.
 */
export class ObjectFactoryController {
  private readonly deps: ObjectFactoryDeps;

  constructor(deps: ObjectFactoryDeps) {
    this.deps = deps;
  }

  /** Wire UI + keyboard add shortcuts to this controller. */
  bind(): void {
    const handler = (type: string, subtype: string) => this.add(type, subtype);
    this.deps.uiManager.onAddObject(handler);
    this.deps.events.onAddObject = handler;
  }

  add(type: string, subtype: string): void {
    if (type === "mesh") {
      this.addMesh(subtype);
    } else if (type === "light") {
      this.addLight(subtype);
    } else if (type === "group" || (type === "empty" && subtype === "group")) {
      this.addGroup();
    } else if (type === "camera") {
      this.setCameraProjection(subtype);
    }
  }

  /** Empty transform parent for hierarchy (no geometry). */
  private addGroup(): void {
    const {
      scene,
      createdObjects,
      commandHistory,
      updateSceneGraph,
      updateObjectProperties,
      selectSingleObject,
      deselectInEditor,
      setSelectedObject,
      setPreviousSelectedUUID,
      getSelectedObject,
      events,
    } = this.deps;

    const group = new SceneNode("Empty");
    group.type = "Group";

    scene.add(group);
    createdObjects.set(group.uuid, group);
    updateSceneGraph();

    setSelectedObject(group);
    setPreviousSelectedUUID(group.uuid);
    updateObjectProperties(group);

    events.selectedObject = group;
    events.isObjectSelected = true;
    events.select = [group];
    if (events.gizmo && !events.gizmo.currentGizmoType) {
      events.gizmo.setMode("translate");
    }
    if (events.gizmo) events.gizmo.visible = true;
    if (events.webgl) events.webgl.selectedObject = group;

    commandHistory.execute(
      {
        name: "Add Empty",
        execute: () => {
          scene.add(group);
          createdObjects.set(group.uuid, group);
          selectSingleObject(group);
          updateSceneGraph();
        },
        undo: () => {
          scene.remove(group);
          createdObjects.delete(group.uuid);
          if (
            getSelectedObject() === group ||
            events.select.some((o: any) => o.uuid === group.uuid)
          ) {
            deselectInEditor();
          }
          updateSceneGraph();
        },
      },
      false
    );
  }

  private addMesh(subtype: string): void {
    const {
      scene,
      material,
      materialColors,
      createdObjects,
      events,
      commandHistory,
      updateSceneGraph,
      updateObjectProperties,
      selectSingleObject,
      deselectInEditor,
      setSelectedObject,
      setPreviousSelectedUUID,
      getSelectedObject,
    } = this.deps;

    let geometryData: any = null;
    switch (subtype) {
      case "box":
        geometryData = new BoxGeometryBuilder().CubeData();
        break;
      case "sphere":
        geometryData = new SphereGeometryBuilder().SphereData();
        break;
      case "plane":
        geometryData = new PlaneGeometryBuilder().PlaneData();
        break;
      case "cone":
        geometryData = new ConeGeometryBuilder().ConeData(2.0, 1.0, 31);
        break;
      case "cylinder":
        geometryData = new CylinderGeometryBuilder().CylinderData();
        break;
      default:
        return;
    }
    if (!geometryData) return;

    const meshMaterial = material.getMaterialProperties({
      color: materialColors.white,
      metallic: 0.5,
      roughness: 0.5,
      specular: 16.0,
      alpha: 1.0,
      emissionColor: [0.0, 0.0, 0.0],
      emissionIntensity: 0.0,
    });

    const mesh = new RenderableMeshObject(geometryData, meshMaterial);
    mesh.position = { x: 0, y: 0, z: 0 };
    mesh.scale = { x: 1, y: 1, z: 1 };
    mesh.rotate = { x: 0, y: 0, z: 0 };
    mesh.updateTranslate();
    mesh.updateScale();
    if (mesh.updateBoundingBox) mesh.updateBoundingBox();
    mesh.geometryNeedsUpdate = true;

    scene.add(mesh);
    createdObjects.set(mesh.uuid, mesh);
    updateSceneGraph();

    setSelectedObject(mesh);
    setPreviousSelectedUUID(mesh.uuid);
    updateObjectProperties(mesh);

    events.selectedObject = mesh;
    events.isObjectSelected = true;
    events.select = [mesh];
    if (events.gizmo && !events.gizmo.currentGizmoType) {
      events.gizmo.setMode("translate");
    }
    if (events.gizmo) events.gizmo.visible = true;
    if (events.webgl) events.webgl.selectedObject = mesh;

    commandHistory.execute(
      {
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
          if (
            getSelectedObject() === mesh ||
            events.select.some((o: any) => o.uuid === mesh.uuid)
          ) {
            deselectInEditor();
          }
          updateSceneGraph();
        },
      },
      false
    );
  }

  private addLight(subtype: string): void {
    const {
      scene,
      commandHistory,
      unifiedProgram,
      gl,
      setProgram,
      updateSceneGraph,
      updateObjectProperties,
      selectSingleObject,
      deselectInEditor,
      setSelectedObject,
      setPreviousSelectedUUID,
      getSelectedObject,
      uiManager,
    } = this.deps;

    let newLight: LightNode | null = null;
    switch (subtype) {
      case "point": {
        const pt = new PointLightNode("Point Light");
        pt.position = { x: 0, y: 3, z: 0 };
        pt.radius = 2.0;
        newLight = pt;
        break;
      }
      case "spot": {
        const spot = new SpotLightNode("Spot Light");
        spot.position = { x: 0, y: 0, z: 2 };
        spot.direction = [0, 0, -1];
        spot.angle = Math.PI / 7;
        newLight = spot;
        break;
      }
      case "directional": {
        const dir = new DirectionalLightNode("Directional Light");
        dir.direction = [0, 0, 1];
        newLight = dir;
        break;
      }
      default:
        return;
    }

    setProgram(unifiedProgram);

    if (newLight) {
      newLight.color = [1, 1, 1];
      newLight.intensity = 1.0;
      newLight.updateLocalMatrix();
      scene.add(newLight);

      setSelectedObject(newLight);
      setPreviousSelectedUUID(newLight.uuid);
      updateObjectProperties(newLight);
      uiManager.selectObject(newLight.uuid);

      const addedLight = newLight;
      commandHistory.execute(
        {
          name: `Add ${subtype} Light`,
          execute: () => {
            scene.add(addedLight);
            selectSingleObject(addedLight);
            updateSceneGraph();
          },
          undo: () => {
            scene.remove(addedLight);
            if (getSelectedObject() === addedLight) {
              deselectInEditor();
            }
            updateSceneGraph();
          },
        },
        false
      );
    }

    gl.useProgram(this.deps.getProgram());
    updateSceneGraph();
  }

  private setCameraProjection(subtype: string): void {
    const {
      camera,
      canvas,
      events,
      getSelectedObject,
      updateObjectProperties,
      updateSceneGraph,
    } = this.deps;

    if (subtype === "orthographic") {
      const aspect = canvas.clientWidth / canvas.clientHeight;
      const distance = Math.sqrt(
        camera.eye.x * camera.eye.x +
          camera.eye.y * camera.eye.y +
          camera.eye.z * camera.eye.z
      );
      camera.orthoSize = distance * Math.tan((45 * Math.PI) / 360);
      camera.OrthographicCamera(aspect);
    } else {
      const distance = camera.orthoSize / Math.tan((45 * Math.PI) / 360);
      const currentEyeVec = [camera.eye.x, camera.eye.y, camera.eye.z];
      const currentDist = Math.sqrt(
        currentEyeVec[0] ** 2 + currentEyeVec[1] ** 2 + currentEyeVec[2] ** 2
      );

      if (currentDist > 0.0001) {
        const factor = distance / currentDist;
        camera.eye.x *= factor;
        camera.eye.y *= factor;
        camera.eye.z *= factor;
      } else {
        camera.eye.z = distance;
      }

      const aspect = canvas.clientWidth / canvas.clientHeight;
      camera.PerspectiveCamera(45, aspect, 0.1, 1000);
      events.updateOrbitParametersFromEye(camera);
    }

    camera.OrbitCamera();

    if (getSelectedObject() === camera) {
      updateObjectProperties(camera);
    }
    updateSceneGraph();
  }
}
