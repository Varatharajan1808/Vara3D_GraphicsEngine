import { SceneNode } from "../SceneGraph/SceneNode";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";
import { LightNode } from "../LightingEngine/LightNode";
import { PointLightNode } from "../LightingEngine/PointLightNode";
import { SpotLightNode } from "../LightingEngine/SpotLightNode";
import { DirectionalLightNode } from "../LightingEngine/DirectionalLightNode";
import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";

function copyNumberArray(src: ArrayLike<number> | null | undefined): number[] | undefined {
  if (!src) return undefined;
  return Array.from(src as ArrayLike<number>);
}

function cloneMaterial(mat: PBRMaterialProperties | any): PBRMaterialProperties {
  return new PBRMaterialProperties(
    mat?.color ? [mat.color[0], mat.color[1], mat.color[2]] : [1, 1, 1],
    mat?.metallic ?? 0.5,
    mat?.roughness ?? 0.5,
    mat?.specular ?? 16.0,
    mat?.alpha ?? 1.0,
    mat?.emissionColor
      ? [mat.emissionColor[0], mat.emissionColor[1], mat.emissionColor[2]]
      : [0, 0, 0],
    mat?.emissionIntensity ?? 0.0
  );
}

function cloneMesh(source: RenderableMeshObject): RenderableMeshObject {
  const vertices = copyNumberArray(source.vertices as any) || [];
  const indices = copyNumberArray(source.indices as any) || [];
  const normals = copyNumberArray(source.normals as any);
  const texCoords = copyNumberArray(source.texCoord as any);
  const tangents = copyNumberArray(source.tangent as any);

  const geom: any = {
    Vertices: new Float32Array(vertices),
    Indices: new Uint16Array(indices),
    type: source.geometry?.type || source.type || "Custom-Mesh",
  };
  if (normals) geom.Normals = new Float32Array(normals);
  if (texCoords) geom.TextureCoordinates = new Float32Array(texCoords);
  if (tangents) geom.Tangents = new Float32Array(tangents);

  const mesh = new RenderableMeshObject(geom, cloneMaterial(source.material));
  mesh.name = source.name || "Mesh";
  mesh.type = source.type || mesh.type;
  mesh.visible = source.visible !== false;
  mesh.position = { ...source.position };
  mesh.rotate = { ...source.rotate };
  mesh.scale = { ...source.scale };

  // Share GPU textures (read-only assets); keep URL/image refs for autosave
  mesh.texture = source.texture;
  mesh.normalMap = source.normalMap;
  mesh.textureURL = source.textureURL;
  mesh.normalMapURL = source.normalMapURL;
  mesh.image = source.image;
  mesh.normalMapImage = source.normalMapImage;

  mesh.updateTranslate();
  mesh.ObjectRotation();
  mesh.updateScale();
  if (mesh.updateBoundingBox) mesh.updateBoundingBox();
  mesh.geometryNeedsUpdate = true;
  return mesh;
}

function cloneLight(source: LightNode): LightNode {
  let light: LightNode;
  if (source instanceof SpotLightNode) {
    const spot = new SpotLightNode(source.name || "Spot Light");
    spot.direction = source.direction
      ? [source.direction[0], source.direction[1], source.direction[2]]
      : [0, 0, -1];
    spot.angle = source.angle ?? Math.PI / 7;
    light = spot;
  } else if (source instanceof DirectionalLightNode) {
    const dir = new DirectionalLightNode(source.name || "Directional Light");
    dir.direction = source.direction
      ? [source.direction[0], source.direction[1], source.direction[2]]
      : [0, 0, 1];
    light = dir;
  } else if (source instanceof PointLightNode) {
    const pt = new PointLightNode(source.name || "Point Light");
    pt.radius = source.radius ?? 2.0;
    light = pt;
  } else {
    light = new LightNode(source.name || "Light");
  }

  light.color = source.color
    ? [source.color[0], source.color[1], source.color[2]]
    : [1, 1, 1];
  light.intensity = source.intensity ?? 1.0;
  light.position = { ...source.position };
  light.rotate = { ...source.rotate };
  light.scale = { ...source.scale };
  (light as any).visible = (source as any).visible !== false;
  light.updateLocalMatrix();
  return light;
}

function cloneGroup(source: SceneNode): SceneNode {
  const group = new SceneNode(source.name || "Group");
  group.type = source.type || "SceneNode";
  group.position = { ...source.position };
  group.rotate = { ...source.rotate };
  group.scale = { ...source.scale };
  (group as any).visible = (source as any).visible !== false;
  group.updateLocalMatrix();
  return group;
}

/**
 * Deep-clone a scene node (mesh / light / group) including children.
 * Produces new UUIDs; does not attach to the scene.
 */
export function cloneSceneNode(source: SceneNode): SceneNode {
  let clone: SceneNode;
  if (source instanceof RenderableMeshObject) {
    clone = cloneMesh(source);
  } else if (source instanceof LightNode) {
    clone = cloneLight(source);
  } else {
    clone = cloneGroup(source);
  }

  if (source.children && source.children.length > 0) {
    for (const child of source.children) {
      if ((child as any).isGizmoPart) continue;
      if (child.type === "Grid-Geometry") continue;
      const childClone = cloneSceneNode(child);
      childClone.setParent(clone);
    }
  }

  return clone;
}

/** True if `node` is under `ancestor` in the hierarchy. */
export function isDescendantOf(node: SceneNode, ancestor: SceneNode): boolean {
  let cur: SceneNode | null = node.parent;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * From a selection, keep only top-level roots so cloning a parent
 * does not also separately clone its already-selected children.
 */
export function getTopLevelNodes(nodes: SceneNode[]): SceneNode[] {
  return nodes.filter(
    (n) => !nodes.some((other) => other !== n && isDescendantOf(n, other))
  );
}
