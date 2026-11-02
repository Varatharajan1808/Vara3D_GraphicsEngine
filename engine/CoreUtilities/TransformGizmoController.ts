import { PBRMaterialProperties } from "../MaterialSystem/PBRMaterialProperties";
import { mat4 } from "../MathLibrary/gl-matrix";
import { RenderableMeshObject } from "../MeshRenderer/RenderableMeshObject";

// Types for axis directions
type Axis = "x" | "y" | "z";

interface VertexData {
  type: string;
  Vertices: Float32Array;
  Indices: Uint16Array;
  Normals: Float32Array;
  TextureCoordinates?: Float32Array;
  tangents?: Float32Array | null;
  id: string;
  axis: string;
  isRing?: boolean;
  boundingBox?: BoundingBox;
}
interface CylinderVertexParams {
  vertices: number[];
  normals: number[];
  uvs: number[];
}

interface CylinderGeometryConfig {
  cos: number;
  sin: number;
  segmentIndex: number;
  totalSegments: number;
  height: number;
  radius: number;
  direction: Axis;
}
interface BoundingBox {
  min: number[];
  max: number[];
  visible?: boolean;
}

interface GizmoButtonMap {
  translate: HTMLButtonElement;
  rotate: HTMLButtonElement;
  scale: HTMLButtonElement;
}

export class TransformGizmoController {
  material: PBRMaterialProperties;
  MaterialColor: Record<string, number[]>;
  geometries: VertexData[];
  gizmoMeshes: RenderableMeshObject[];
  axisColors: number[][];
  id: string;
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotate: { x: number; y: number; z: number };
  localMatrix: Float32Array;
  visible: boolean;
  shouldRender: boolean = false;
  currentGizmoType: "translate" | "rotate" | "scale" | null;
  mode: "translate" | "rotate" | "scale" | null;
  parent?: { getWorldMatrix: () => any }; // Optional parent property
  modelMatrix: any = mat4.create(); // Add modelMatrix for getWorldMatrix

  cylinderLength: number;
  arrowSize: number;
  ringRadius: number;
  ringThickness: number;

  buttons!: GizmoButtonMap;
  buttonStyle!: string;
  activeButtonStyle!: string;
  translateButton!: HTMLButtonElement;
  rotateButton!: HTMLButtonElement;
  scene: any;
  canvas!: HTMLCanvasElement;
  geometry: {
    Vertices: number[];
    Indices: number[];
  } = { Vertices: [], Indices: [] };
  positionBuffer?: WebGLBuffer;
  indexBuffer?: WebGLBuffer;
  constructor() {
    this.material = new PBRMaterialProperties();
    this.MaterialColor = this.material.BaseColors();
    this.geometries = [];
    this.gizmoMeshes = [];
    this.axisColors = [
      this.MaterialColor.red, // X
      this.MaterialColor.green, // Y
      this.MaterialColor.blue, // Z
    ];
    this.id = "Gizmo";
    this.position = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1 };
    this.rotate = { x: 0, y: 0, z: 0 };
    this.localMatrix = mat4.create() as any;
    this.visible = false;
    this.currentGizmoType = "translate"; // Set default mode
    this.mode = this.currentGizmoType; // Current active mode
    this.cylinderLength = 1.0;
    this.arrowSize = 0.15;
    this.ringRadius = 1.0;
    this.ringThickness = 0.05;
    this.createControlButtons();
  }
  // Updated addToScene method with better cleanup
  addToScene(scene: any): void {
    this.scene = scene;
    this.drawGizmo();

    this.geometries.forEach((geo) => {
      const color = this.getColorForGeometry(geo);
      const materialProps = this.getMaterialPropsForGeometry(geo, color);
      const gizmoMesh = this.createGizmoMesh(geo, materialProps);

      this.applyAdditionalTransforms(gizmoMesh, geo);
      this.setupAndAddMesh(gizmoMesh, geo);
    });

    this.updateLocalMatrix();
  }
  getColorForGeometry(geo: any): number[] {
    // Plane handles use the color of the axis they DON'T include
    if (geo.type === "Gizmo-PlaneHandle-XY") return this.axisColors[1]; // Green
    if (geo.type === "Gizmo-PlaneHandle-XZ") return this.axisColors[2]; // Blue
    if (geo.type === "Gizmo-PlaneHandle-YZ") return this.axisColors[0]; // Red
    // Outer rings
    if (geo.type === "Gizmo-Ring-Outer") return [0.7, 0.7, 0.7]; // White/Gray
    if (geo.type === "Gizmo-Ring-Screen") return [0.7, 0.7, 0.2]; // Yellow
    if (geo.type.includes("X")) return this.axisColors[0];
    if (geo.type.includes("Y")) return this.axisColors[1];
    if (geo.type.includes("Z")) return this.axisColors[2];
    return [0.8, 0.8, 0.8];
  }
  getMaterialPropsForGeometry(geo: any, color: number[]): any {
    let materialProps: any;
    const emissionProps = {
      emissionColor: color,
      emissionIntensity: 1.0,
    };

    if (geo.type.includes("Ring")) {
      materialProps = {
        color: [...color, 0.7],
        metallic: 0.3,
        roughness: 0.7,
        specular: 2,
        ...emissionProps,
      };
    } else if (geo.type.includes("PlaneHandle")) {
      materialProps = {
        color: [...color, 0.5], // Semi-transparent
        metallic: 0.1,
        roughness: 0.8,
        specular: 1,
        ...emissionProps,
        emissionIntensity: 0.5, // Slightly lower for transparency
      };
    } else if (geo.type.includes("ArrowHead")) {
      materialProps = {
        color,
        metallic: 0.8,
        roughness: 0.2,
        specular: 10,
        ...emissionProps,
      };
    } else if (geo.type.includes("Axis")) {
      materialProps = {
        color,
        metallic: 0.2,
        roughness: 0.4,
        specular: 5,
        ...emissionProps,
      };
    } else {
      materialProps = {
        color,
        metallic: 0,
        roughness: 0.5,
        specular: 1,
        ...emissionProps,
      };
    }

    return materialProps;
  }

  createGizmoMesh(geo: any, materialProps: any): RenderableMeshObject {
    const mesh = new RenderableMeshObject(
      {
        type: geo.type || "Gizmo-Part",
        Vertices: geo.Vertices || new Float32Array(0),
        Indices: geo.Indices || new Uint16Array(0),
        Normals: geo.Normals || new Float32Array(0),
        TextureCoordinates: geo.TextureCoordinates || new Float32Array(0),
        ID: geo.id || "Gizmo",
      },
      this.material.getMaterialProperties(materialProps)
    );

    mesh.axis = geo.axis;
    mesh.isGizmoPart = true;
    mesh.isRing = geo.isRing || false;
    mesh.geometry = geo;
    mesh.visible = true;
    mesh.position = { ...this.position };
    mesh.scale = { x: 1, y: 1, z: 1 };
    mesh.rotate = { x: 0, y: 0, z: 0 };

    return mesh;
  }
  applyAdditionalTransforms(mesh: any, geo: any): void {
    if (geo.type.includes("ArrowHead")) {
      mesh.additionalTransform = mat4.create() as any;
      mat4.identity(mesh.additionalTransform);
      const arrowPosition = this.cylinderLength;

      if (geo.type === "Gizmo-ArrowHead-X") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [arrowPosition, 0, 0]
        );
      } else if (geo.type === "Gizmo-ArrowHead-Y") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [0, arrowPosition, 0]
        );
      } else if (geo.type === "Gizmo-ArrowHead-Z") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [0, 0, arrowPosition]
        );
      }
    }

    if (geo.type.includes("Ring")) {
      mesh.additionalTransform = mat4.create() as any;
      mat4.identity(mesh.additionalTransform);
      const ringScale = 1.1;
      mat4.scale(
        mesh.additionalTransform,
        mesh.additionalTransform,
        [ringScale, ringScale, ringScale]
      );
    }

    if (geo.type.includes("ScaleHandle")) {
      mesh.additionalTransform = mat4.create() as any;
      mat4.identity(mesh.additionalTransform);
      const handlePosition = this.cylinderLength;
      const negOffset = -0.5; // Position for floating negative handles

      if (geo.type === "Gizmo-ScaleHandle-X") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [handlePosition, 0, 0]
        );
      } else if (geo.type === "Gizmo-ScaleHandle-Y") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [0, handlePosition, 0]
        );
      } else if (geo.type === "Gizmo-ScaleHandle-Z") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [0, 0, handlePosition]
        );
      } else if (geo.type === "Gizmo-ScaleHandle-X-Neg") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [negOffset, 0, 0]
        );
      } else if (geo.type === "Gizmo-ScaleHandle-Y-Neg") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [0, negOffset, 0]
        );
      } else if (geo.type === "Gizmo-ScaleHandle-Z-Neg") {
        mat4.translate(
          mesh.additionalTransform,
          mesh.additionalTransform,
          [0, 0, negOffset]
        );
      }
    }
  }
  setupAndAddMesh(mesh: any, geo: any): void {
    this.gizmoMeshes.push(mesh);

    try {
      if (this.scene?.add) {
        this.scene.add(mesh);
      }
    } catch (error) {
      console.error("Failed to add gizmo mesh to scene:", error);
    }
  }
  // Updated removeFromScene method for GizmoGeometry class
  removeFromScene(scene: any): void {
    this.gizmoMeshes.forEach((mesh) => {
      if (scene?.meshes?.includes(mesh)) {
        const index = scene.meshes.indexOf(mesh);
        scene.meshes.splice(index, 1);
      } else if (scene?.objects?.includes(mesh)) {
        const index = scene.objects.indexOf(mesh);
        scene.objects.splice(index, 1);
      }

      mesh.additionalTransform = undefined;
      mesh.isGizmoPart = false;
      mesh.visible = false;
    });

    this.gizmoMeshes.length = 0;
    this.geometries.length = 0;
  }
  // Enhanced setMode method with better state management
  setMode(mode: "translate" | "rotate" | "scale"): void {
    if (this.mode === mode) return;

    console.log(`Switching gizmo mode from ${this.mode} to ${mode}`);

    // Update internal state first
    this.mode = mode;
    this.currentGizmoType = mode;
    this.rotate = { x: 0, y: 0, z: 0 };

    // Update UI buttons if they exist
    if (this.buttons) {
      Object.keys(this.buttons).forEach((key) => {
        const btnMode = key as keyof GizmoButtonMap;
        const button = this.buttons[btnMode];
        if (button) {
          if (btnMode === mode) {
            button.style.cssText = `${this.buttonStyle} ${this.activeButtonStyle}`;
          } else {
            button.style.cssText = this.buttonStyle;
          }
        }
      });
    }
    // Complete removal and re-addition with new mode
    if (this.scene) {
      // Force complete removal
      this.removeFromScene(this.scene);
      // Add gizmo back to scene with new mode
      this.addToScene(this.scene);
    }
  }
  drawGizmo(): VertexData[] {
    if (!this.currentGizmoType) return [];

    // Clear existing geometries completely
    this.geometries.length = 0;

    switch (this.currentGizmoType) {
      case "translate":
        return this.generateTranslateGizmo();
      case "rotate":
        return this.generateRotateGizmo();
      case "scale":
        return this.generateScaleGizmo();
      default:
        return [];
    }
  }
  updateGizmoMeshes(): void {
    if (!this.gizmoMeshes.length) return;

    this.gizmoMeshes.forEach((mesh) => {
      mesh.position = { ...this.position };
      mesh.rotate = { ...this.rotate };
      mesh.updateLocalMatrix();
    });
  }
  createControlButtons(): void {
    const buttonContainer = document.createElement("div");
    buttonContainer.id = "gizmo-controls";
    buttonContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            display: flex;
            gap: 10px;
            z-index: 1000;
            font-family: Arial, sans-serif;
        `;

    const buttonStyle = `
            padding: 10px 15px;
            border: 2px solid #333;
            background: #f0f0f0;
            cursor: pointer;
            border-radius: 5px;
            font-weight: bold;
            color:black;
            transition: all 0.3s ease;
        `;
    const activeButtonStyle = `
            background: #007bff;
            color: white;
            border-color: #0056b3;
        `;

    // Store styles for potential future use, but do not create DOM buttons.
    // The editor now provides its own toolbar UI for translate/rotate,
    // so these legacy screen-space buttons are removed to avoid duplicates.
    this.buttonStyle = buttonStyle;
    this.activeButtonStyle = activeButtonStyle;

    this.buttons = {
      translate: null as any,
      rotate: null as any,
      scale: null as any,
    };
  }
  createAxisCylinder(
    type: string,
    height: number,
    radius: number,
    segments: number,
    direction: Axis
  ): VertexData {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      this.generateCylinderVerticesForSegment(
        { vertices, normals, uvs },
        {
          cos,
          sin,
          segmentIndex: i,
          totalSegments: segments,
          height,
          radius,
          direction,
        }
      );
    }

    this.generateCylinderIndices(segments, indices);

    return {
      type,
      Vertices: new Float32Array(vertices),
      Indices: new Uint16Array(indices),
      Normals: new Float32Array(normals),
      TextureCoordinates: new Float32Array(uvs),
      id: "Gizmo",
      axis: direction.toUpperCase(),
    };
  }
  generateCylinderVerticesForSegment(
    params: CylinderVertexParams,
    config: CylinderGeometryConfig
  ): void {
    const { vertices, normals, uvs } = params;
    const { cos, sin, height, radius, direction, segmentIndex, totalSegments } =
      config;

    for (let j = 0; j <= 1; j++) {
      const pos = j * height;

      const { x, y, z } = this.getPositionOnAxis(
        pos,
        radius,
        cos,
        sin,
        direction
      );
      const { nx, ny, nz } = this.getNormalOnAxis(cos, sin, direction);

      vertices.push(x ?? 0, y ?? 0, z ?? 0);
      normals.push(nx ?? 0, ny ?? 0, nz ?? 0);

      uvs.push(segmentIndex / totalSegments, j);
    }
  }
  createArrowHead(type: string, size: number, direction: Axis): VertexData {
    const height = size * 2.5;
    const radius = size * 1.0;
    const segments = 12;
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    this.addBaseAndTipVertices(vertices, normals, uvs, direction, height);
    this.addCircleVertices(
      vertices,
      normals,
      uvs,
      direction,
      segments,
      radius,
      height
    );
    this.generateIndices(indices, segments);

    return {
      type,
      Vertices: new Float32Array(vertices),
      Indices: new Uint16Array(indices),
      Normals: new Float32Array(normals),
      TextureCoordinates: new Float32Array(uvs),
      id: "Gizmo",
      axis: direction.toUpperCase(),
    };
  }
  getPositionOnAxis(
    pos: number,
    radius: number,
    cos: number,
    sin: number,
    direction: Axis
  ): { x: number; y: number; z: number } {
    switch (direction) {
      case "x":
        return { x: pos, y: cos * radius, z: sin * radius };
      case "y":
        return { x: cos * radius, y: pos, z: sin * radius };
      case "z":
        return { x: cos * radius, y: sin * radius, z: pos };
    }
  }
  getNormalOnAxis(
    cos: number,
    sin: number,
    direction: Axis
  ): { nx: number; ny: number; nz: number } {
    switch (direction) {
      case "x":
        return { nx: 0, ny: cos, nz: sin };
      case "y":
        return { nx: cos, ny: 0, nz: sin };
      case "z":
        return { nx: cos, ny: sin, nz: 0 };
    }
  }
  generateCylinderIndices(segments: number, Indices: number[]): void {
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      Indices.push(a, b, c, b, d, c);
    }
  }
  getDirectionVector(direction: Axis, value: number): [number, number, number] {
    const vectors = {
      x: [value, 0, 0] as [number, number, number],
      y: [0, value, 0] as [number, number, number],
      z: [0, 0, value] as [number, number, number],
    };
    return vectors[direction];
  }
  getCirclePosition(
    direction: Axis,
    cos: number,
    sin: number,
    radius: number
  ): [number, number, number] {
    const positions = {
      x: [0, cos * radius, sin * radius] as [number, number, number],
      y: [cos * radius, 0, sin * radius] as [number, number, number],
      z: [cos * radius, sin * radius, 0] as [number, number, number],
    };
    return positions[direction];
  }
  calculateNormal(
    direction: Axis,
    cos: number,
    sin: number,
    height: number,
    radius: number,
    normalLength: number
  ): [number, number, number] {
    const normals = {
      x: [
        radius / normalLength,
        (height * cos) / normalLength,
        (height * sin) / normalLength,
      ] as [number, number, number],
      y: [
        (height * cos) / normalLength,
        radius / normalLength,
        (height * sin) / normalLength,
      ] as [number, number, number],
      z: [
        (height * cos) / normalLength,
        (height * sin) / normalLength,
        radius / normalLength,
      ] as [number, number, number],
    };
    return normals[direction];
  }
  addBaseAndTipVertices(
    vertices: number[],
    normals: number[],
    uvs: number[],
    direction: Axis,
    height: number
  ): void {
    vertices.push(0, 0, 0);
    const [baseNx, baseNy, baseNz] = this.getDirectionVector(direction, -1);
    normals.push(baseNx, baseNy, baseNz);
    uvs.push(0.5, 0.0);

    const [tipX, tipY, tipZ] = this.getDirectionVector(direction, height);
    vertices.push(tipX, tipY, tipZ);
    const [tipNx, tipNy, tipNz] = this.getDirectionVector(direction, 1);
    normals.push(tipNx, tipNy, tipNz);
    uvs.push(0.5, 1.0);
  }
  addCircleVertices(
    vertices: number[],
    normals: number[],
    uvs: number[],
    direction: Axis,
    segments: number,
    radius: number,
    height: number
  ): void {
    const normalLength = Math.sqrt(height * height + radius * radius);

    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      const [x, y, z] = this.getCirclePosition(direction, cos, sin, radius);
      vertices.push(x, y, z);

      const [nx, ny, nz] = this.calculateNormal(
        direction,
        cos,
        sin,
        height,
        radius,
        normalLength
      );
      normals.push(nx, ny, nz);

      uvs.push((cos + 1) * 0.5, (sin + 1) * 0.5);
    }
  }
  generateIndices(indices: number[], segments: number): void {
    for (let i = 0; i < segments; i++) {
      const current = i + 2;
      const next = ((i + 1) % segments) + 2;
      indices.push(0, current, next);
    }

    for (let i = 0; i < segments; i++) {
      const current = i + 2;
      const next = ((i + 1) % segments) + 2;
      indices.push(1, next, current);
    }
  }
  createBox(size = 0.15): VertexData {
    const hs = size / 2;
    return {
      type: "Gizmo-Center",
      Vertices: new Float32Array([
        -hs,
        -hs,
        -hs,
        hs,
        -hs,
        -hs,
        hs,
        hs,
        -hs,
        -hs,
        hs,
        -hs,
        -hs,
        -hs,
        hs,
        hs,
        -hs,
        hs,
        hs,
        hs,
        hs,
        -hs,
        hs,
        hs,
      ]),
      Indices: new Uint16Array([
        0, 1, 2, 2, 3, 0, 4, 5, 6, 6, 7, 4, 0, 4, 7, 7, 3, 0, 1, 5, 6, 6, 2, 1,
        3, 2, 6, 6, 7, 3, 0, 1, 5, 5, 4, 0,
      ]),
      Normals: new Float32Array(this.generateFilledArray(24, [0, 0, 1])),
      TextureCoordinates: undefined,
      id: "Gizmo",
      axis: "XYZ",
    };
  }
  createTorusRing(
    type: string,
    radius: number,
    tubeRadius: number,
    segments: number,
    direction: Axis
  ): VertexData {
    const Vertices: number[] = [];
    const Normals: number[] = [];
    const uvs: number[] = [];
    const Indices: number[] = [];
    const radialSegments = 32; // Fixed number of radial segments for the tube
    const tubularSegments = segments;

    // Generate vertices, normals and uvs
    for (let i = 0; i <= tubularSegments; i++) {
      const u = (i / tubularSegments) * Math.PI * 2;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);

      // Center point of the current tube segment
      const centerX = radius * cosU;
      const centerY = radius * sinU;
      const centerZ = 0;

      for (let j = 0; j <= radialSegments; j++) {
        const v = (j / radialSegments) * Math.PI * 2;
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);

        // Vertex position
        const x = (radius + tubeRadius * cosV) * cosU;
        const y = (radius + tubeRadius * cosV) * sinU;
        const z = tubeRadius * sinV;

        // Normal (same as position but normalized and centered)
        const nx = cosV * cosU;
        const ny = cosV * sinU;
        const nz = sinV;

        Vertices.push(x, y, z);
        Normals.push(nx, ny, nz);
        uvs.push(i / tubularSegments, j / radialSegments);
      }
    }

    // Generate indices
    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = (i + 1) * (radialSegments + 1) + j;
        const c = (i + 1) * (radialSegments + 1) + j + 1;
        const d = i * (radialSegments + 1) + j + 1;

        // Two triangles per segment
        Indices.push(a, b, d);
        Indices.push(b, c, d);
      }
    }

    // Rotate vertices and normals based on direction
    if (direction.toLowerCase() !== "z") {
      this.rotateGeometry(Vertices, Normals, direction);
    }

    return {
      type,
      Vertices: new Float32Array(Vertices),
      Indices: new Uint16Array(Indices),
      Normals: new Float32Array(Normals),
      TextureCoordinates: new Float32Array(uvs),
      id: "Gizmo",
      axis: direction.toUpperCase(),
      isRing: true,
    };
  }

  // Create a semicircle arc ring (partial torus)
  createArcRing(
    type: string,
    radius: number,
    tubeRadius: number,
    segments: number,
    direction: Axis,
    startAngle: number = 0,
    arcAngle: number = Math.PI // Default to semicircle
  ): VertexData {
    const Vertices: number[] = [];
    const Normals: number[] = [];
    const uvs: number[] = [];
    const Indices: number[] = [];
    const radialSegments = 16;
    const tubularSegments = segments;

    for (let i = 0; i <= tubularSegments; i++) {
      const u = startAngle + (i / tubularSegments) * arcAngle;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);

      for (let j = 0; j <= radialSegments; j++) {
        const v = (j / radialSegments) * Math.PI * 2;
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);

        const x = (radius + tubeRadius * cosV) * cosU;
        const y = (radius + tubeRadius * cosV) * sinU;
        const z = tubeRadius * sinV;

        const nx = cosV * cosU;
        const ny = cosV * sinU;
        const nz = sinV;

        Vertices.push(x, y, z);
        Normals.push(nx, ny, nz);
        uvs.push(i / tubularSegments, j / radialSegments);
      }
    }

    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = (i + 1) * (radialSegments + 1) + j;
        const c = (i + 1) * (radialSegments + 1) + j + 1;
        const d = i * (radialSegments + 1) + j + 1;

        Indices.push(a, b, d);
        Indices.push(b, c, d);
      }
    }

    if (direction.toLowerCase() !== "z") {
      this.rotateGeometry(Vertices, Normals, direction);
    }

    return {
      type,
      Vertices: new Float32Array(Vertices),
      Indices: new Uint16Array(Indices),
      Normals: new Float32Array(Normals),
      TextureCoordinates: new Float32Array(uvs),
      id: "Gizmo",
      axis: direction.toUpperCase(),
      isRing: true,
    };
  }

  private rotateGeometry(
    vertices: number[],
    normals: number[],
    direction: Axis
  ): void {
    const rotationMatrix = this.getRotationMatrix(direction.toLowerCase());

    // Rotate vertices
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];

      vertices[i] =
        rotationMatrix[0] * x + rotationMatrix[1] * y + rotationMatrix[2] * z;
      vertices[i + 1] =
        rotationMatrix[3] * x + rotationMatrix[4] * y + rotationMatrix[5] * z;
      vertices[i + 2] =
        rotationMatrix[6] * x + rotationMatrix[7] * y + rotationMatrix[8] * z;
    }

    // Rotate normals
    for (let i = 0; i < normals.length; i += 3) {
      const x = normals[i];
      const y = normals[i + 1];
      const z = normals[i + 2];

      normals[i] =
        rotationMatrix[0] * x + rotationMatrix[1] * y + rotationMatrix[2] * z;
      normals[i + 1] =
        rotationMatrix[3] * x + rotationMatrix[4] * y + rotationMatrix[5] * z;
      normals[i + 2] =
        rotationMatrix[6] * x + rotationMatrix[7] * y + rotationMatrix[8] * z;
    }
  }

  private getRotationMatrix(direction: string): number[] {
    switch (direction) {
      case "x":
        return [0, 0, -1, 0, 1, 0, 1, 0, 0];
      case "y":
        return [1, 0, 0, 0, 0, -1, 0, 1, 0];
      default: // z
        return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
  }
  generateTranslateGizmo(): VertexData[] {
    this.geometries = [
      this.createAxisCylinder(
        "Gizmo-Axis-X",
        this.cylinderLength,
        0.05,
        16,
        "x"
      ),
      this.createAxisCylinder(
        "Gizmo-Axis-Y",
        this.cylinderLength,
        0.05,
        16,
        "y"
      ),
      this.createAxisCylinder(
        "Gizmo-Axis-Z",
        this.cylinderLength,
        0.05,
        16,
        "z"
      ),
      this.createArrowHead("Gizmo-ArrowHead-X", this.arrowSize, "x"),
      this.createArrowHead("Gizmo-ArrowHead-Y", this.arrowSize, "y"),
      this.createArrowHead("Gizmo-ArrowHead-Z", this.arrowSize, "z"),
      this.createPlaneHandle("Gizmo-PlaneHandle-XY", 0.25, "xy"),
      this.createPlaneHandle("Gizmo-PlaneHandle-XZ", 0.25, "xz"),
      this.createPlaneHandle("Gizmo-PlaneHandle-YZ", 0.25, "yz"),
      this.createBox(),
    ];
    this.geometries.forEach((geo) => {
      geo.boundingBox = this.calculateBoundingBox(geo);
    });
    return this.geometries;
  }
  generateRotateGizmo(): VertexData[] {
    this.geometries = [
      // Semicircle arcs for X, Y, Z rotation
      this.createArcRing(
        "Gizmo-Ring-X",
        this.ringRadius,
        this.ringThickness,
        32,
        "x",
        0,
        Math.PI
      ),
      this.createArcRing(
        "Gizmo-Ring-Y",
        this.ringRadius,
        this.ringThickness,
        32,
        "y",
        0,
        Math.PI
      ),
      this.createArcRing(
        "Gizmo-Ring-Z",
        this.ringRadius,
        this.ringThickness,
        32,
        "z",
        0,
        Math.PI
      ),

      // Yellow screen-space rotation ring
      this.createTorusRing(
        "Gizmo-Ring-Screen",
        this.ringRadius * 1.50,
        this.ringThickness * 0.4,
        64,
        "SCREEN" as any
      ),
    ];
    this.geometries.forEach((geo) => {
      geo.boundingBox = this.calculateBoundingBox(geo);
    });
    return this.geometries;
  }
  generateScaleGizmo(): VertexData[] {
    this.geometries = [
      this.createAxisCylinder(
        "Gizmo-ScaleAxis-X",
        this.cylinderLength,
        0.05,
        16,
        "x"
      ),
      this.createAxisCylinder(
        "Gizmo-ScaleAxis-Y",
        this.cylinderLength,
        0.05,
        16,
        "y"
      ),
      this.createAxisCylinder(
        "Gizmo-ScaleAxis-Z",
        this.cylinderLength,
        0.05,
        16,
        "z"
      ),
      // Positive axis handles
      this.createScaleHandle("Gizmo-ScaleHandle-X", 0.15, "x"),
      this.createScaleHandle("Gizmo-ScaleHandle-Y", 0.15, "y"),
      this.createScaleHandle("Gizmo-ScaleHandle-Z", 0.15, "z"),
      // Negative axis handles (floating cubes)
      this.createScaleHandle("Gizmo-ScaleHandle-X-Neg", 0.12, "x"),
      this.createScaleHandle("Gizmo-ScaleHandle-Y-Neg", 0.12, "y"),
      this.createScaleHandle("Gizmo-ScaleHandle-Z-Neg", 0.12, "z"),
      this.createBox(),
    ];
    this.geometries.forEach((geo) => {
      geo.boundingBox = this.calculateBoundingBox(geo);
    });
    return this.geometries;
  }
  createScaleHandle(type: string, size: number, direction: Axis): VertexData {
    const hs = size / 2;
    return {
      type,
      Vertices: new Float32Array([
        -hs, -hs, -hs, hs, -hs, -hs, hs, hs, -hs, -hs, hs, -hs,
        -hs, -hs, hs, hs, -hs, hs, hs, hs, hs, -hs, hs, hs,
      ]),
      Indices: new Uint16Array([
        0, 1, 2, 2, 3, 0, 4, 5, 6, 6, 7, 4, 0, 4, 7, 7, 3, 0, 1, 5, 6, 6, 2, 1,
        3, 2, 6, 6, 7, 3, 0, 1, 5, 5, 4, 0,
      ]),
      Normals: new Float32Array(this.generateFilledArray(24, [0, 1, 0])),
      id: "Gizmo",
      axis: direction.toUpperCase(),
    };
  }
  createPlaneHandle(type: string, size: number, plane: "xy" | "xz" | "yz"): VertexData {
    const offset = 0.35; // Offset from center
    const hs = size / 2;
    let vertices: number[];
    let normals: number[];
    let axis: string;

    switch (plane) {
      case "xy":
        // XY plane (Z normal)
        vertices = [
          offset, offset, 0,
          offset + size, offset, 0,
          offset + size, offset + size, 0,
          offset, offset + size, 0,
        ];
        normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
        axis = "XY";
        break;
      case "xz":
        // XZ plane (Y normal)
        vertices = [
          offset, 0, offset,
          offset + size, 0, offset,
          offset + size, 0, offset + size,
          offset, 0, offset + size,
        ];
        normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        axis = "XZ";
        break;
      case "yz":
        // YZ plane (X normal)
        vertices = [
          0, offset, offset,
          0, offset + size, offset,
          0, offset + size, offset + size,
          0, offset, offset + size,
        ];
        normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
        axis = "YZ";
        break;
    }

    return {
      type,
      Vertices: new Float32Array(vertices),
      Indices: new Uint16Array([0, 1, 2, 2, 3, 0]),
      Normals: new Float32Array(normals),
      TextureCoordinates: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      id: "Gizmo",
      axis: axis,
    };
  }
  updateLocalMatrix(): void {
    mat4.identity(this.localMatrix);
    mat4.translate(
      this.localMatrix,
      this.localMatrix,
      [this.position.x, this.position.y, this.position.z]
    );
    mat4.rotateX(
      this.localMatrix,
      this.localMatrix,
      this.rotate.x
    );
    mat4.rotateY(
      this.localMatrix,
      this.localMatrix,
      this.rotate.y
    );
    mat4.rotateZ(
      this.localMatrix,
      this.localMatrix,
      this.rotate.z
    );
    mat4.scale(
      this.localMatrix,
      this.localMatrix,
      [this.scale.x, this.scale.y, this.scale.z]
    );
    this.updateGizmoMeshes();
  }
  calculateBoundingBox(geometry: VertexData): BoundingBox {
    const vertices = geometry.Vertices;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < vertices.length; i += 3) {
      min[0] = Math.min(min[0], vertices[i]);
      min[1] = Math.min(min[1], vertices[i + 1]);
      min[2] = Math.min(min[2], vertices[i + 2]);

      max[0] = Math.max(max[0], vertices[i]);
      max[1] = Math.max(max[1], vertices[i + 1]);
      max[2] = Math.max(max[2], vertices[i + 2]);
    }

    const padding = 0.1;
    return {
      min: [min[0] - padding, min[1] - padding, min[2] - padding],
      max: [max[0] + padding, max[1] + padding, max[2] + padding],
    };
  }
  private generateFilledArray(count: number, value: number[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      result.push(...value);
    }
    return result;
  }
}
