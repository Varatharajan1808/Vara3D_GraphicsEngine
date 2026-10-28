import { mat4, vec3 } from "../../MathLibrary/gl-matrix.js";
import { LightNode } from "../../LightingEngine/LightNode";
import { PointLightNode } from "../../LightingEngine/PointLightNode";
import { SpotLightNode } from "../../LightingEngine/SpotLightNode";
import { DirectionalLightNode } from "../../LightingEngine/DirectionalLightNode";
import { CameraController } from "../../CameraSystem/CameraController";
import { SphereGeometryBuilder } from "../../GeometryPrimitives/SphereGeometryBuilder";
import { ConeGeometryBuilder } from "../../GeometryPrimitives/ConeGeometryBuilder";
import { CylinderGeometryBuilder } from "../../GeometryPrimitives/CylinderGeometryBuilder";
import {
  createElementBuffer,
  createBuffer,
} from "./GPUBufferManager";
import { createProgram } from "./ShaderProgramLinker";
import {
  getAttribLocation,
  getUniformLocation,
} from "./AttributeLocationResolver";
import { TextureCoordinates } from "../../GeometryPrimitives/UVCoordinateMapper";
import { NormalsData } from "../../GeometryPrimitives/SurfaceNormalCalculator";
import { Tangents } from "../../GeometryPrimitives/TangentSpaceCalculator";
import {
  isSphereInFrustum,
  isAABBInFrustum,
  createBoundingSphere,
  extractFrustumPlanes,
} from "./ViewFrustumCuller";
import { TransformGizmoController } from "../../CoreUtilities/TransformGizmoController";
import { PBRMaterialProperties } from "../../MaterialSystem/PBRMaterialProperties";

interface SceneObject {
  boundingBox?: {
    min: number[];
    max: number[];
  };
}
interface Mesh {
  highlightedFace?: number[]; // Indices of the highlighted face vertices
  highlightColor?: [number, number, number]; // Optional custom highlight color
}
export class WebGLRenderEngine {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  count: number;
  lastFrameTime: number;
  frameCount: number;
  fpsUpdateInterval: number;
  lastFpsUpdate: number;
  currentFps: number;
  defaultTexture: WebGLTexture;
  defaultNormalMap: WebGLTexture;
  window: Window;
  gizmoGeometry: TransformGizmoController | null = null;
  mouseX?: number;
  mouseY?: number;
  selectedObject: any = null;
  editorMode: string = "object";
  editSubMode: string = "vertex";
  pointProgram: WebGLProgram | null = null;
  public frustumCulling: boolean = true;

  private _currentDrawCalls: number = 0;
  private _currentVertices: number = 0;
  private _currentTriangles: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl") as WebGLRenderingContext;
    this.window = window;
    this.count = 0;
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.fpsUpdateInterval = 500; // Update FPS every 500ms
    this.lastFpsUpdate = 0;
    this.currentFps = 0;
    this.resize(this.window.innerWidth, this.window.innerHeight);

    // Enable Uint32 index support for large meshes
    this.gl.getExtension('OES_element_index_uint');

    // Create default textures
    this.defaultTexture = this.createDefaultTexture();
    this.defaultNormalMap = this.createDefaultNormalMap();

    // Compile shader program for Edit Mode vertex handles
    const pointVs = `
      attribute vec4 aPosition;
      uniform mat4 u_modelMatrix;
      uniform mat4 u_viewMatrix;
      uniform mat4 u_projectionMatrix;
      uniform mat4 u_modelCameraMatrix;
      void main() {
        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelCameraMatrix * u_modelMatrix * aPosition;
        gl_PointSize = 10.0;
      }
    `;
    const pointFs = `
      precision mediump float;
      uniform vec3 uColor;
      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        if (length(coord) > 0.5) {
          discard;
        }
        gl_FragColor = vec4(uColor, 1.0);
      }
    `;
    this.pointProgram = createProgram(this.gl, pointVs, pointFs);
  }
  setGizmo(gizmo: TransformGizmoController): void {
    this.gizmoGeometry = gizmo;
  }
  // Record FPS stats
  updateFPS(now: number) {
    this.frameCount++;

    if (now - this.lastFpsUpdate > this.fpsUpdateInterval) {
      this.currentFps = Math.round(
        (this.frameCount * 1000) / (now - this.lastFpsUpdate)
      );
      this.lastFpsUpdate = now;
      this.frameCount = 0;
    }
  }

  public getStats() {
    return {
      fps: this.currentFps,
      drawCalls: this._currentDrawCalls,
      vertices: this._currentVertices,
      triangles: this._currentTriangles,
    };
  }
  resize(Width: number, Height: number): void {
    this.canvas.width = Width;
    this.canvas.height = Height;
    if (this.gl) {
      this.gl.viewport(0, 0, Width, Height);
    }
  }
  createDefaultTexture(): WebGLTexture {
    const width = 1,
      height = 1;
    const data = new Uint8Array([255, 255, 255, 255]); // White texture
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error("Failed to create texture");
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      data
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR
    );
    return texture;
  }
  createDefaultNormalMap(): WebGLTexture {
    const width = 1,
      height = 1;
    const data = new Uint8Array([128, 128, 255, 255]); // Default normal map
    const normalMap = this.gl.createTexture();
    if (!normalMap) {
      throw new Error("Failed to create normal map texture");
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, normalMap);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      data
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR
    );
    return normalMap;
  }
  setLightUniforms(program: WebGLProgram, lights: LightNode[], globalLight: any): void {
    const gl = this.gl;
    gl.useProgram(program);

    // Default values
    const defaultAmbient = new Float32Array([0.2, 0.2, 0.2]);
    const defaultDiffuse = new Float32Array([1.0, 1.0, 1.0]);
    const defaultSpecular = new Float32Array([1.0, 1.0, 1.0]);

    // Base light
    if (globalLight && globalLight.lightData && globalLight.lightData.baselight) {
      const baselight = globalLight.lightData.baselight;
      gl.uniform3fv(gl.getUniformLocation(program, "uAmbientLightColor"), baselight.ambient || defaultAmbient);
      gl.uniform3fv(gl.getUniformLocation(program, "uDiffuseLightColor"), baselight.diffuse || defaultDiffuse);
      gl.uniform3fv(gl.getUniformLocation(program, "uSpecularLightColor"), baselight.specular || defaultSpecular);
    } else {
      gl.uniform3fv(gl.getUniformLocation(program, "uAmbientLightColor"), defaultAmbient);
      gl.uniform3fv(gl.getUniformLocation(program, "uDiffuseLightColor"), defaultDiffuse);
      gl.uniform3fv(gl.getUniformLocation(program, "uSpecularLightColor"), defaultSpecular);
    }

    const MAX_LIGHTS = 10;

    // Categorize lights
    const pointLights = lights.filter(l => l instanceof PointLightNode) as PointLightNode[];
    const spotLights = lights.filter(l => l instanceof SpotLightNode) as SpotLightNode[];
    const directionalLights = lights.filter(l => l instanceof DirectionalLightNode) as DirectionalLightNode[];

    // Point lights
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const posLoc = gl.getUniformLocation(program, `uLightPosition[${i}]`);
      const radiusLoc = gl.getUniformLocation(program, `uLightRadius[${i}]`);
      const colorLoc = gl.getUniformLocation(program, `uPointLightColor[${i}]`);
      const intensityLoc = gl.getUniformLocation(program, `uPointLightIntensity[${i}]`);

      if (i < pointLights.length) {
        const light = pointLights[i];
        if (posLoc) gl.uniform3fv(posLoc, new Float32Array([light.position.x, light.position.y, light.position.z]));
        if (radiusLoc) gl.uniform1f(radiusLoc, light.radius);
        if (colorLoc) gl.uniform3fv(colorLoc, new Float32Array(light.color));
        if (intensityLoc) gl.uniform1f(intensityLoc, light.intensity);
      } else {
        if (posLoc) gl.uniform3fv(posLoc, new Float32Array([0, 0, 0]));
        if (radiusLoc) gl.uniform1f(radiusLoc, 0.0);
        if (colorLoc) gl.uniform3fv(colorLoc, new Float32Array([0, 0, 0]));
        if (intensityLoc) gl.uniform1f(intensityLoc, 0.0);
      }
    }

    // Spot lights
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const posLoc = gl.getUniformLocation(program, `uSpotLightPosition[${i}]`);
      const dirLoc = gl.getUniformLocation(program, `uSpotLightDirection[${i}]`);
      const angleLoc = gl.getUniformLocation(program, `uSpotLightAngle[${i}]`);
      const colorLoc = gl.getUniformLocation(program, `uSpotLightColor[${i}]`);
      const intensityLoc = gl.getUniformLocation(program, `uSpotLightIntensity[${i}]`);

      if (i < spotLights.length) {
        const light = spotLights[i];
        if (posLoc) gl.uniform3fv(posLoc, new Float32Array([light.position.x, light.position.y, light.position.z]));
        if (dirLoc) gl.uniform3fv(dirLoc, new Float32Array(light.direction));
        if (angleLoc) gl.uniform1f(angleLoc, light.angle);
        if (colorLoc) gl.uniform3fv(colorLoc, new Float32Array(light.color));
        if (intensityLoc) gl.uniform1f(intensityLoc, light.intensity);
      } else {
        if (posLoc) gl.uniform3fv(posLoc, new Float32Array([0, 0, 0]));
        if (dirLoc) gl.uniform3fv(dirLoc, new Float32Array([0, 0, 1]));
        if (angleLoc) gl.uniform1f(angleLoc, 0.0);
        if (colorLoc) gl.uniform3fv(colorLoc, new Float32Array([0, 0, 0]));
        if (intensityLoc) gl.uniform1f(intensityLoc, 0.0);
      }
    }

    // Directional lights
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const dirLoc = gl.getUniformLocation(program, `uLightDirection[${i}]`);
      const colorLoc = gl.getUniformLocation(program, `uDirectionalLightColor[${i}]`);
      const intensityLoc = gl.getUniformLocation(program, `uDirectionalLightIntensity[${i}]`);

      if (i < directionalLights.length) {
        const light = directionalLights[i];
        if (dirLoc) gl.uniform3fv(dirLoc, new Float32Array(light.direction));
        if (colorLoc) gl.uniform3fv(colorLoc, new Float32Array(light.color));
        if (intensityLoc) gl.uniform1f(intensityLoc, light.intensity);
      } else {
        if (dirLoc) gl.uniform3fv(dirLoc, new Float32Array([0, 0, 1]));
        if (colorLoc) gl.uniform3fv(colorLoc, new Float32Array([0, 0, 0]));
        if (intensityLoc) gl.uniform1f(intensityLoc, 0.0);
      }
    }
  }
  // Set camera uniforms
  setCameraUniforms(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    camera: CameraController
  ): void {
    const modelCameraLoc = gl.getUniformLocation(
      program,
      "u_modelCameraMatrix"
    );
    const viewLoc = gl.getUniformLocation(program, "u_viewMatrix");
    const projectionLoc = gl.getUniformLocation(program, "u_projectionMatrix");
    const cameraPosLoc = gl.getUniformLocation(program, "uCameraPosition");

    if (modelCameraLoc)
      gl.uniformMatrix4fv(modelCameraLoc, false, camera.modelMatrix);
    if (viewLoc) gl.uniformMatrix4fv(viewLoc, false, camera.viewMatrix);
    if (projectionLoc)
      gl.uniformMatrix4fv(projectionLoc, false, camera.projectionMatrix);
    if (cameraPosLoc)
      gl.uniform3fv(cameraPosLoc, new Float32Array([camera.eye.x, camera.eye.y, camera.eye.z]));
  }
  setMaterialUniforms(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    material: {
      color?: [number, number, number];
      roughness?: number;
      metallic?: number;
      specular?: number;
      emissionColor?: [number, number, number];
      emissionIntensity?: number;
      alpha?: number;
    } = {}
  ) {
    gl.uniform3f(
      gl.getUniformLocation(program, "uColor"),
      ...(material.color ?? [1, 1, 1])
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uRoughness"),
      material.roughness ?? 0.5
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uMetallic"),
      material.metallic ?? 0.0
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uSpecular"),
      material.specular ?? 0.5
    );
    gl.uniform3fv(
      gl.getUniformLocation(program, "uEmissionColor"),
      material.emissionColor ?? [0, 0, 0]
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uEmissionIntensity"),
      material.emissionIntensity ?? 0.0
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uAlpha"),
      material.alpha ?? 1.0
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uMetallicFactor"),
      1.0
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "uRoughnessFactor"),
      1.0
    );
  }
  drawMeshWithFaceHighlighting(
    mesh: any,
    program: WebGLProgram,
    materialProps: any
  ): void {
    const indices = mesh.indices || [];
    const highlightedVertices = new Set(mesh.highlightedFace || []);
    const hoveredVertices = new Set(mesh.hoveredFace || []);

    // Separate different face types
    const normalFaces: number[] = [];
    const highlightedFaces: number[] = [];
    const hoveredFaces: number[] = [];

    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      // Check if this triangle is highlighted (selected)
      if (
        highlightedVertices.has(v1) &&
        highlightedVertices.has(v2) &&
        highlightedVertices.has(v3)
      ) {
        highlightedFaces.push(v1, v2, v3);
      }
      // Check if this triangle is hovered (but not highlighted)
      else if (
        hoveredVertices.has(v1) &&
        hoveredVertices.has(v2) &&
        hoveredVertices.has(v3)
      ) {
        hoveredFaces.push(v1, v2, v3);
      }
      // Normal face
      else {
        normalFaces.push(v1, v2, v3);
      }
    }

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);

    // Draw normal faces first
    if (normalFaces.length > 0) {
      this.setMaterialUniforms(this.gl, program, materialProps);

      const normalBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, normalBuffer);
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(normalFaces),
        this.gl.STATIC_DRAW
      );

      this.gl.drawElements(
        this.gl.TRIANGLES,
        normalFaces.length,
        this.gl.UNSIGNED_SHORT,
        0
      );
      this.gl.deleteBuffer(normalBuffer);
    }

    // Draw hovered faces (if any)
    if (hoveredFaces.length > 0) {
      const hoveredMaterial = {
        ...materialProps,
        color: mesh.hoverColor || [0.8, 0.8, 0.0], // Yellow hover
      };
      this.setMaterialUniforms(this.gl, program, hoveredMaterial);

      const hoverBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, hoverBuffer);
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(hoveredFaces),
        this.gl.STATIC_DRAW
      );

      this.gl.drawElements(
        this.gl.TRIANGLES,
        hoveredFaces.length,
        this.gl.UNSIGNED_SHORT,
        0
      );
      this.gl.deleteBuffer(hoverBuffer);
    }

    // Draw highlighted faces (priority over hover)
    if (highlightedFaces.length > 0) {
      const highlightedMaterial = {
        ...materialProps,
        color: mesh.highlightColor || [0.0, 1.0, 0.0], // Green highlight
      };
      this.setMaterialUniforms(this.gl, program, highlightedMaterial);

      const highlightBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, highlightBuffer);
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(highlightedFaces),
        this.gl.STATIC_DRAW
      );

      this.gl.drawElements(
        this.gl.TRIANGLES,
        highlightedFaces.length,
        this.gl.UNSIGNED_SHORT,
        0
      );
      this.gl.deleteBuffer(highlightBuffer);
    }

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
  }
  // Modified drawMeshes method in Webgl
  drawMeshes(
    program: WebGLProgram,
    camera: any,
    objects: any[],
    frustumPlanes: any[],
    viewProjectionMatrix: number[],
    incrementDrawCall: () => void
  ): void {
    const geometryMap = {
      "Sphere-Geometry": new SphereGeometryBuilder().SphereData(),
      "Cone-Geometry": new ConeGeometryBuilder().ConeData(2.0, 1.0, 31),
      "Cylinder-Geometry": new CylinderGeometryBuilder().CylinderData(),
    };

    const drawMesh = (mesh: any, disableDepthTest: boolean = false) => {
      if (!mesh || (mesh.type === "Grid-Geometry" && mesh.visible === false)) return;
      if (mesh.visible === false) return;

      const geometryType = mesh.geometry?.type as keyof typeof geometryMap;
      const data = geometryMap[geometryType] || {
        Normals: mesh.normals || NormalsData,
        TextureCoordinates: mesh.texCoord || TextureCoordinates,
        Tangents: mesh.tangents || Tangents,
      };

      if (!mesh.positionBuffer || mesh.geometryNeedsUpdate) {
        mesh.positionBuffer = createBuffer(this.gl, mesh.vertices || []);
      }
      if (!mesh.indexBuffer || mesh.geometryNeedsUpdate) {
        mesh.indexBuffer = createElementBuffer(this.gl, mesh.indices || []);
      }
      if (!mesh.normalBuffer || mesh.geometryNeedsUpdate) {
        mesh.normalBuffer = createBuffer(this.gl, data.Normals || []);
      }
      if (!mesh.textureBuffer || mesh.geometryNeedsUpdate) {
        mesh.textureBuffer = createBuffer(
          this.gl,
          data.TextureCoordinates || []
        );
      }
      if (!mesh.tangentBuffer || mesh.geometryNeedsUpdate) {
        mesh.tangentBuffer = createBuffer(this.gl, data.Tangents || []);
      }
      // Dynamically generate silhouette index buffer if selected
      if (mesh.isSelected && mesh.indices && mesh.indices.length > 0 && mesh.vertices && mesh.vertices.length > 0) {
        const indices = mesh.indices;
        const vertices = mesh.vertices;
        const worldMatrix = mesh.getWorldMatrix();

        // 1. Transform vertices to world space
        const worldPositions: number[][] = [];
        for (let i = 0; i < vertices.length; i += 3) {
          const localPos = vec3.fromValues(vertices[i], vertices[i + 1], vertices[i + 2]);
          const worldPos = vec3.create();
          vec3.transformMat4(worldPos, localPos, worldMatrix);
          worldPositions.push([worldPos[0], worldPos[1], worldPos[2]]);
        }

        // 2. Compute normal and center for each triangle in world space
        const numTriangles = indices.length / 3;
        const triNormals: number[][] = [];
        const triCenters: number[][] = [];
        for (let i = 0; i < indices.length; i += 3) {
          const v0 = indices[i];
          const v1 = indices[i + 1];
          const v2 = indices[i + 2];

          const p0 = worldPositions[v0];
          const p1 = worldPositions[v1];
          const p2 = worldPositions[v2];

          triCenters.push([
            (p0[0] + p1[0] + p2[0]) / 3,
            (p0[1] + p1[1] + p2[1]) / 3,
            (p0[2] + p1[2] + p2[2]) / 3
          ]);

          const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
          const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
          const nx = uy * vz - uz * vy;
          const ny = uz * vx - ux * vz;
          const nz = ux * vy - uy * vx;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          triNormals.push(len > 0.0001 ? [nx / len, ny / len, nz / len] : [0, 0, 0]);
        }

        // 3. Determine if each triangle faces the camera
        const cameraPos = vec3.fromValues(camera.eye.x, camera.eye.y, camera.eye.z);
        const triFacing: boolean[] = [];
        for (let i = 0; i < numTriangles; i++) {
          const center = triCenters[i];
          const normal = triNormals[i];

          const vx = center[0] - cameraPos[0];
          const vy = center[1] - cameraPos[1];
          const vz = center[2] - cameraPos[2];

          const dot = normal[0] * vx + normal[1] * vy + normal[2] * vz;
          triFacing.push(dot < 0);
        }

        // Helper to get vertex position key (rounded to 4 decimal places)
        const getPosKey = (idx: number) => {
          const x = vertices[idx * 3];
          const y = vertices[idx * 3 + 1];
          const z = vertices[idx * 3 + 2];
          return `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
        };

        // 4. Group edges and associate them with adjacent triangles
        const edgeMap: Map<string, { v1: number; v2: number; triIndices: number[] }> = new Map();
        for (let i = 0; i < indices.length; i += 3) {
          const triIdx = i / 3;
          const v0 = indices[i];
          const v1 = indices[i + 1];
          const v2 = indices[i + 2];

          const triEdges = [[v0, v1], [v1, v2], [v2, v0]];
          for (const [a, b] of triEdges) {
            const ka = getPosKey(a);
            const kb = getPosKey(b);
            const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;

            let edge = edgeMap.get(key);
            if (!edge) {
              edge = { v1: a, v2: b, triIndices: [] };
              edgeMap.set(key, edge);
            }
            edge.triIndices.push(triIdx);
          }
        }

        // 5. Gather silhouette edges (separate facing from non-facing faces)
        const wireframeIndices = [];
        for (const edge of edgeMap.values()) {
          if (edge.triIndices.length === 1) {
            if (triFacing[edge.triIndices[0]]) {
              wireframeIndices.push(edge.v1, edge.v2);
            }
          } else if (edge.triIndices.length > 1) {
            let hasFacing = false;
            let hasNonFacing = false;
            for (const triIdx of edge.triIndices) {
              if (triFacing[triIdx]) {
                hasFacing = true;
              } else {
                hasNonFacing = true;
              }
            }
            if (hasFacing && hasNonFacing) {
              wireframeIndices.push(edge.v1, edge.v2);
            }
          }
        }

        // 6. Upload dynamically to GPU
        if (!mesh.wireframeIndexBuffer) {
          mesh.wireframeIndexBuffer = this.gl.createBuffer();
        }
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.wireframeIndexBuffer);
        const TypedArray = indices instanceof Uint32Array ? Uint32Array : Uint16Array;
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new TypedArray(wireframeIndices), this.gl.DYNAMIC_DRAW);
        mesh.wireframeIndexCount = wireframeIndices.length;
      }
      mesh.geometryNeedsUpdate = false;

      const worldMatrix = mesh.getWorldMatrix();

      if (!mesh.boundingSphere) {
        mesh.boundingSphere = createBoundingSphere(
          mesh.translate,
          mesh.radius || 6
        );
      }

      if (!isSphereInFrustum(frustumPlanes, mesh.boundingSphere)) return;

      const isHelper = mesh.type === "Grid-Geometry" || mesh.isGizmoPart;

      if (!isHelper) {
        incrementDrawCall();
        this._currentVertices += (mesh.vertices?.length || 0) / 3;
        this._currentTriangles += (mesh.indices?.length || 0) / 3;
      }

      // Handle depth testing based on selection state
      if (disableDepthTest) {
        this.gl.disable(this.gl.DEPTH_TEST);
      } else {
        this.gl.enable(this.gl.DEPTH_TEST);
      }

      this.gl.useProgram(program);
      getAttribLocation(
        this.gl,
        program,
        "aPosition",
        mesh.positionBuffer,
        3,
        0
      );
      getAttribLocation(
        this.gl,
        program,
        "aVertexNormal",
        mesh.normalBuffer,
        3
      );
      getAttribLocation(
        this.gl,
        program,
        "aTextureCoord",
        mesh.textureBuffer,
        2
      );
      getAttribLocation(this.gl, program, "aTangent", mesh.tangentBuffer, 3);

      const materialProps = mesh.material || {};

      const hasTexture = mesh.texture ? 1 : 0;
      this.gl.uniform1i(
        this.gl.getUniformLocation(program, "uHasTexture"),
        hasTexture
      );
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(
        this.gl.TEXTURE_2D,
        mesh.texture || this.defaultTexture
      );
      this.gl.uniform1i(this.gl.getUniformLocation(program, "uSampler"), 0);

      const hasNormalMap = mesh.normalMap ? 1 : 0;
      this.gl.uniform1i(
        this.gl.getUniformLocation(program, "uHasNormalMap"),
        hasNormalMap
      );
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(
        this.gl.TEXTURE_2D,
        mesh.normalMap || this.defaultNormalMap
      );
      this.gl.uniform1i(this.gl.getUniformLocation(program, "uNormalMap"), 1);

      getUniformLocation(this.gl, program, "u_modelMatrix", worldMatrix);
      this.setCameraUniforms(this.gl, program, camera);

      const hasHighlightedFace =
        mesh.highlightedFace && mesh.highlightedFace.length > 0;
      const hasHoveredFace = mesh.hoveredFace && mesh.hoveredFace.length > 0;

      if (hasHighlightedFace || hasHoveredFace) {
        this.drawMeshWithFaceHighlighting(mesh, program, materialProps);
      } else {
        // Handle object-level hover (HIGHLIGHT COLOR: [1, 1, 0] is Yellow)
        const finalMaterialProps = mesh.isHovered
          ? { ...materialProps, color: [1.0, 1.0, 0.0], roughness: 0, metallic: 0 }
          : materialProps;

        this.setMaterialUniforms(this.gl, program, finalMaterialProps);
        if (!mesh.indices || !("length" in mesh.indices)) {
          this.gl.drawArrays(this.gl.LINES, 0, mesh.vertices.length / 3);
        } else {
          this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
          const indexType = mesh.indices instanceof Uint32Array
            ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
          this.gl.drawElements(
            this.gl.TRIANGLES,
            mesh.indices.length,
            indexType,
            0
          );
        }
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
      }

      // Draw wireframe outline overlay if the mesh is selected
      if (mesh.isSelected) {
        // Vibrant Orange selection color
        const wireframeColor = [1.0, 0.5, 0.0];
        const wireframeMaterial = {
          ...materialProps,
          color: wireframeColor,
          roughness: 0.0,
          metallic: 0.0,
          emissionColor: wireframeColor,
          emissionIntensity: 1.0,
          alpha: 1.0
        };
        this.setMaterialUniforms(this.gl, program, wireframeMaterial);

        // Turn off textures/normal maps for wireframe overlay
        this.gl.uniform1i(this.gl.getUniformLocation(program, "uHasTexture"), 0);
        this.gl.uniform1i(this.gl.getUniformLocation(program, "uHasNormalMap"), 0);

        // Disable depth testing for selection wireframe so outline is fully visible
        this.gl.disable(this.gl.DEPTH_TEST);

        if (mesh.indices && "length" in mesh.indices && mesh.wireframeIndexBuffer) {
          this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.wireframeIndexBuffer);
          const indexType = mesh.indices instanceof Uint32Array
            ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
          this.gl.drawElements(
            this.gl.LINES,
            mesh.wireframeIndexCount,
            indexType,
            0
          );
          this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
        } else {
          // Fallback if no indices
          this.gl.drawArrays(this.gl.LINES, 0, mesh.vertices.length / 3);
        }

        this.gl.enable(this.gl.DEPTH_TEST);

        // Restore texture uniform states for other meshes
        const hasTexture = mesh.texture ? 1 : 0;
        this.gl.uniform1i(this.gl.getUniformLocation(program, "uHasTexture"), hasTexture);
        const hasNormalMap = mesh.normalMap ? 1 : 0;
        this.gl.uniform1i(this.gl.getUniformLocation(program, "uHasNormalMap"), hasNormalMap);
      }

      // Draw vertex handles in Edit Mode
      if (this.editorMode === "edit" && mesh.isSelected && this.pointProgram) {
        this.gl.useProgram(this.pointProgram);

        // Bind attributes
        getAttribLocation(this.gl, this.pointProgram, "aPosition", mesh.positionBuffer, 3, 0);

        // Set uniforms
        getUniformLocation(this.gl, this.pointProgram, "u_modelMatrix", worldMatrix);
        this.setCameraUniforms(this.gl, this.pointProgram, camera);

        this.gl.enable(this.gl.DEPTH_TEST);

        // Draw all vertex handles in cyan
        this.gl.uniform3f(this.gl.getUniformLocation(this.pointProgram, "uColor"), 0.0, 0.8, 1.0); // Cyan
        this.gl.drawArrays(this.gl.POINTS, 0, mesh.vertices.length / 3);

        // Draw selected vertex handle in yellow
        if (this.editSubMode === "vertex" && mesh.selectedVertexIndex !== undefined && mesh.selectedVertexIndex >= 0) {
          this.gl.disable(this.gl.DEPTH_TEST); // Render on top
          this.gl.uniform3f(this.gl.getUniformLocation(this.pointProgram, "uColor"), 1.0, 0.9, 0.0); // Yellow
          this.gl.drawArrays(this.gl.POINTS, mesh.selectedVertexIndex, 1);
          this.gl.enable(this.gl.DEPTH_TEST);
        }

        // Draw hovered vertex handle in orange
        if (this.editSubMode === "vertex" && mesh.hoveredVertexIndex !== undefined && mesh.hoveredVertexIndex >= 0 && mesh.hoveredVertexIndex !== mesh.selectedVertexIndex) {
          this.gl.disable(this.gl.DEPTH_TEST);
          this.gl.uniform3f(this.gl.getUniformLocation(this.pointProgram, "uColor"), 1.0, 0.5, 0.0); // Orange
          this.gl.drawArrays(this.gl.POINTS, mesh.hoveredVertexIndex, 1);
          this.gl.enable(this.gl.DEPTH_TEST);
        }

        // Draw selected edge vertices in yellow
        if (this.editSubMode === "edge" && mesh.selectedEdgeVertices && mesh.selectedEdgeVertices.length > 0) {
          this.gl.disable(this.gl.DEPTH_TEST);
          this.gl.uniform3f(this.gl.getUniformLocation(this.pointProgram, "uColor"), 1.0, 0.9, 0.0); // Yellow
          for (const idx of mesh.selectedEdgeVertices) {
            if (idx >= 0 && idx < mesh.vertices.length / 3) {
              this.gl.drawArrays(this.gl.POINTS, idx, 1);
            }
          }
          this.gl.enable(this.gl.DEPTH_TEST);
        }

        // Draw hovered edge vertices in orange
        if (this.editSubMode === "edge" && mesh.hoveredEdgeVertices && mesh.hoveredEdgeVertices.length > 0 && mesh.hoveredEdgeVertices !== mesh.selectedEdgeVertices) {
          this.gl.disable(this.gl.DEPTH_TEST);
          this.gl.uniform3f(this.gl.getUniformLocation(this.pointProgram, "uColor"), 1.0, 0.5, 0.0); // Orange
          for (const idx of mesh.hoveredEdgeVertices) {
            if (idx >= 0 && idx < mesh.vertices.length / 3) {
              this.gl.drawArrays(this.gl.POINTS, idx, 1);
            }
          }
          this.gl.enable(this.gl.DEPTH_TEST);
        }
      }
    };

    // Separate objects into selected and non-selected
    // Frustum culling: filter out objects outside camera view
    const visibleObjects = objects.filter((mesh: any) => {
      if (!mesh) return false;
      if (mesh.type === "Grid-Geometry") {
        return mesh.visible !== false;
      }
      if (mesh.visible === false) return false;

      // Apply frustum culling using AABB if enabled and planes exist
      if (this.frustumCulling && frustumPlanes && frustumPlanes.length === 6) {
        if (!mesh.boundingBox && mesh.updateBoundingBox) {
          mesh.updateBoundingBox();
        }
        if (mesh.boundingBox) {
          return isAABBInFrustum(frustumPlanes, mesh.boundingBox.min, mesh.boundingBox.max);
        }
        if (mesh.boundingSphere) {
          return isSphereInFrustum(frustumPlanes, mesh.boundingSphere);
        }
      }
      return true;
    });

    const selectedObjects = visibleObjects.filter((mesh: any) => mesh.isSelected);
    const nonSelectedObjects = visibleObjects.filter((mesh: any) => !mesh.isSelected);

    // Separate opaque and transparent objects for both groups
    const opaqueSelected = selectedObjects.filter(
      (mesh: any) => mesh.material?.alpha >= 1.0
    );
    const transparentSelected = selectedObjects.filter(
      (mesh: any) => mesh.material?.alpha < 1.0
    );

    const opaqueNonSelected = nonSelectedObjects.filter(
      (mesh: any) => mesh.material?.alpha >= 1.0
    );
    const transparentNonSelected = nonSelectedObjects.filter(
      (mesh: any) => mesh.material?.alpha < 1.0
    );

    // Sort transparent objects by depth
    const sortTransparentObjects = (objects: any[]) => {
      const v = vec3.create();
      return objects.sort((a: any, b: any) => {
        const aZ = vec3.transformMat4(
          v,
          a.translate || [0, 0, 0],
          viewProjectionMatrix
        )[2];
        const bZ = vec3.transformMat4(
          v,
          b.translate || [0, 0, 0],
          viewProjectionMatrix
        )[2];
        return bZ - aZ;
      });
    };

    // Render opaque objects first (with depth test enabled)
    opaqueNonSelected.forEach((mesh) => drawMesh(mesh, false));

    // Render opaque selected objects (with depth test enabled)
    opaqueSelected.forEach((mesh) => drawMesh(mesh, false));

    // Enable blending for transparent objects
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Render transparent non-selected objects (with depth test enabled)
    const sortedTransparentNonSelected = sortTransparentObjects(
      transparentNonSelected
    );
    sortedTransparentNonSelected.forEach((mesh) => drawMesh(mesh, false));

    // Render transparent selected objects (with depth test enabled)
    const sortedTransparentSelected =
      sortTransparentObjects(transparentSelected);
    sortedTransparentSelected.forEach((mesh) => drawMesh(mesh, false));

    this.gl.disable(this.gl.BLEND);

    // Ensure depth test is re-enabled for subsequent rendering
    this.gl.enable(this.gl.DEPTH_TEST);
  }
  // Modified Render method to handle gizmo rendering properly
  Render(
    program: WebGLProgram,
    camera: any,
    scene: any
  ): void {
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.enable(this.gl.DEPTH_TEST);

    const now = performance.now();
    this.updateFPS(now);

    let drawCalls = 0;
    this._currentVertices = 0;
    this._currentTriangles = 0;
    const viewProjectionMatrix = camera.viewProjectionMatrix;
    const frustumPlanes = extractFrustumPlanes(viewProjectionMatrix);

    this.setLightUniformsBatch(program, scene);

    // Separate gizmo meshes from regular objects
    const regularObjects = (scene?.objects || []).filter(
      (mesh: any) => !mesh.isGizmoPart && (mesh.type !== "Grid-Geometry" || mesh.visible !== false)
    );
    const gizmoObjects = (scene?.objects || []).filter(
      (mesh: any) => mesh.isGizmoPart
    );

    // Draw regular meshes first
    this.drawMeshes(
      program,
      camera,
      regularObjects,
      frustumPlanes,
      viewProjectionMatrix,
      () => drawCalls++
    );

    // Draw gizmo objects last with depth test disabled for better interaction
    if (gizmoObjects.length > 0) {
      this.gl.disable(this.gl.DEPTH_TEST);
      gizmoObjects.forEach((gizmoMesh: any) => {
        this.drawSingleMesh(gizmoMesh, program, camera, () => drawCalls++);
      });
      this.gl.enable(this.gl.DEPTH_TEST);
    }

    this._currentDrawCalls = drawCalls;
  }

  // Helper method to draw a single mesh (for gizmo rendering)
  drawSingleMesh(
    mesh: any,
    program: WebGLProgram,
    camera: any,
    incrementDrawCall: () => void
  ): void {
    if (!mesh || mesh.visible === false) return;

    const geometryMap = {
      "Sphere-Geometry": new SphereGeometryBuilder().SphereData(),
      "Cone-Geometry": new ConeGeometryBuilder().ConeData(2.0, 1.0, 31),
      "Cylinder-Geometry": new CylinderGeometryBuilder().CylinderData(),
    };

    const geometryType = mesh.geometry?.type as keyof typeof geometryMap;
    const data = geometryMap[geometryType] || {
      Normals: mesh.normals || NormalsData,
      TextureCoordinates: mesh.texCoord || TextureCoordinates,
      Tangents: mesh.tangents || Tangents,
    };

    if (!mesh.positionBuffer || mesh.geometryNeedsUpdate) {
      mesh.positionBuffer = createBuffer(this.gl, mesh.vertices || []);
    }
    if (!mesh.indexBuffer || mesh.geometryNeedsUpdate) {
      mesh.indexBuffer = createElementBuffer(this.gl, mesh.indices || []);
    }
    if (!mesh.normalBuffer || mesh.geometryNeedsUpdate) {
      mesh.normalBuffer = createBuffer(this.gl, data.Normals || []);
    }
    if (!mesh.textureBuffer || mesh.geometryNeedsUpdate) {
      mesh.textureBuffer = createBuffer(this.gl, data.TextureCoordinates || []);
    }
    if (!mesh.tangentBuffer || mesh.geometryNeedsUpdate) {
      mesh.tangentBuffer = createBuffer(this.gl, data.Tangents || []);
    }
    mesh.geometryNeedsUpdate = false;

    if (!mesh.isGizmoPart) {
      incrementDrawCall();
      this._currentVertices += (mesh.vertices?.length || 0) / 3;
      this._currentTriangles += (mesh.indices?.length || 0) / 3;
    }

    this.gl.useProgram(program);
    getAttribLocation(this.gl, program, "aPosition", mesh.positionBuffer, 3, 0);
    getAttribLocation(this.gl, program, "aVertexNormal", mesh.normalBuffer, 3);
    getAttribLocation(this.gl, program, "aTextureCoord", mesh.textureBuffer, 2);
    getAttribLocation(this.gl, program, "aTangent", mesh.tangentBuffer, 3);

    const materialProps = mesh.material || {};
    let finalMaterialProps = materialProps;

    if (mesh.isGizmoPart) {
      if (mesh.isActive) {
        // Active state (dragging) - Very bright white/vibrant glow
        finalMaterialProps = {
          ...materialProps,
          color: [1.0, 1.0, 1.0],
          emissionColor: [1.0, 1.0, 1.0],
          emissionIntensity: 2.0,
          roughness: 0,
          metallic: 0,
        };
      } else if (mesh.isHovered) {
        // Hover state - Bright yellow glow with emission
        finalMaterialProps = {
          ...materialProps,
          color: [1.0, 1.0, 0.0],
          emissionColor: [1.0, 1.0, 0.0],
          emissionIntensity: 0.8,
          roughness: 0,
          metallic: 0,
        };
      }
    }
    this.setMaterialUniforms(this.gl, program, finalMaterialProps);

    const hasTexture = mesh.texture ? 1 : 0;
    this.gl.uniform1i(
      this.gl.getUniformLocation(program, "uHasTexture"),
      hasTexture
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(
      this.gl.TEXTURE_2D,
      mesh.texture || this.defaultTexture
    );
    this.gl.uniform1i(this.gl.getUniformLocation(program, "uSampler"), 0);

    const hasNormalMap = mesh.normalMap ? 1 : 0;
    this.gl.uniform1i(
      this.gl.getUniformLocation(program, "uHasNormalMap"),
      hasNormalMap
    );
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(
      this.gl.TEXTURE_2D,
      mesh.normalMap || this.defaultNormalMap
    );
    this.gl.uniform1i(this.gl.getUniformLocation(program, "uNormalMap"), 1);

    const worldMatrix = mesh.getWorldMatrix();
    getUniformLocation(this.gl, program, "u_modelMatrix", worldMatrix);
    this.setCameraUniforms(this.gl, program, camera);

    if (!mesh.indices || !("length" in mesh.indices)) {
      this.gl.drawArrays(this.gl.LINES, 0, mesh.vertices.length / 2);
    } else {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      const indexType = mesh.indices instanceof Uint32Array
        ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
      this.gl.drawElements(
        this.gl.TRIANGLES,
        mesh.indices.length,
        indexType,
        0
      );
    }
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
  }

  setLightUniformsBatch(program: WebGLProgram, scene: any): void {
    if (!scene) return;
    this.setLightUniforms(program, scene.lights || [], scene.globalLight);
  }
}
