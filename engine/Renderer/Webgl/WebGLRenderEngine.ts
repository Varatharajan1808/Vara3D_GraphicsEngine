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
  resolveAttribLocation,
  resolveUniformLocation,
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
  /** Set by interaction handler while dragging gizmo — skip per-mesh selection overlays */
  isGizmoDragging: boolean = false;
  private combinedBoxBuffer: WebGLBuffer | null = null;
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
      gl.uniform3fv(resolveUniformLocation(gl, program, "uAmbientLightColor"), baselight.ambient || defaultAmbient);
      gl.uniform3fv(resolveUniformLocation(gl, program, "uDiffuseLightColor"), baselight.diffuse || defaultDiffuse);
      gl.uniform3fv(resolveUniformLocation(gl, program, "uSpecularLightColor"), baselight.specular || defaultSpecular);
    } else {
      gl.uniform3fv(resolveUniformLocation(gl, program, "uAmbientLightColor"), defaultAmbient);
      gl.uniform3fv(resolveUniformLocation(gl, program, "uDiffuseLightColor"), defaultDiffuse);
      gl.uniform3fv(resolveUniformLocation(gl, program, "uSpecularLightColor"), defaultSpecular);
    }

    const MAX_LIGHTS = 10;

    // Categorize lights (skip scene-graph hidden lights)
    const isLit = (l: LightNode) => (l as any).visible !== false;
    const pointLights = lights.filter(l => l instanceof PointLightNode && isLit(l)) as PointLightNode[];
    const spotLights = lights.filter(l => l instanceof SpotLightNode && isLit(l)) as SpotLightNode[];
    const directionalLights = lights.filter(l => l instanceof DirectionalLightNode && isLit(l)) as DirectionalLightNode[];

    // Point lights
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const posLoc = resolveUniformLocation(gl, program, `uLightPosition[${i}]`);
      const radiusLoc = resolveUniformLocation(gl, program, `uLightRadius[${i}]`);
      const colorLoc = resolveUniformLocation(gl, program, `uPointLightColor[${i}]`);
      const intensityLoc = resolveUniformLocation(gl, program, `uPointLightIntensity[${i}]`);

      if (i < pointLights.length) {
        const light = pointLights[i];
        light.updateWorldMatrix();
        const wp = light.getWorldPosition();
        if (posLoc) gl.uniform3fv(posLoc, new Float32Array([wp.x, wp.y, wp.z]));
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
      const posLoc = resolveUniformLocation(gl, program, `uSpotLightPosition[${i}]`);
      const dirLoc = resolveUniformLocation(gl, program, `uSpotLightDirection[${i}]`);
      const angleLoc = resolveUniformLocation(gl, program, `uSpotLightAngle[${i}]`);
      const colorLoc = resolveUniformLocation(gl, program, `uSpotLightColor[${i}]`);
      const intensityLoc = resolveUniformLocation(gl, program, `uSpotLightIntensity[${i}]`);

      if (i < spotLights.length) {
        const light = spotLights[i];
        light.updateWorldMatrix();
        const wp = light.getWorldPosition();
        const m = light.worldMatrix;
        const ld = light.direction;
        let dx = m[0] * ld[0] + m[4] * ld[1] + m[8] * ld[2];
        let dy = m[1] * ld[0] + m[5] * ld[1] + m[9] * ld[2];
        let dz = m[2] * ld[0] + m[6] * ld[1] + m[10] * ld[2];
        const dlen = Math.hypot(dx, dy, dz) || 1;
        dx /= dlen; dy /= dlen; dz /= dlen;
        if (posLoc) gl.uniform3fv(posLoc, new Float32Array([wp.x, wp.y, wp.z]));
        if (dirLoc) gl.uniform3fv(dirLoc, new Float32Array([dx, dy, dz]));
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
      const dirLoc = resolveUniformLocation(gl, program, `uLightDirection[${i}]`);
      const colorLoc = resolveUniformLocation(gl, program, `uDirectionalLightColor[${i}]`);
      const intensityLoc = resolveUniformLocation(gl, program, `uDirectionalLightIntensity[${i}]`);

      if (i < directionalLights.length) {
        const light = directionalLights[i];
        light.updateWorldMatrix();
        const m = light.worldMatrix;
        const ld = light.direction;
        let dx = m[0] * ld[0] + m[4] * ld[1] + m[8] * ld[2];
        let dy = m[1] * ld[0] + m[5] * ld[1] + m[9] * ld[2];
        let dz = m[2] * ld[0] + m[6] * ld[1] + m[10] * ld[2];
        const dlen = Math.hypot(dx, dy, dz) || 1;
        dx /= dlen; dy /= dlen; dz /= dlen;
        if (dirLoc) gl.uniform3fv(dirLoc, new Float32Array([dx, dy, dz]));
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
    const modelCameraLoc = resolveUniformLocation(
      gl,
      program,
      "u_modelCameraMatrix"
    );
    const viewLoc = resolveUniformLocation(gl, program, "u_viewMatrix");
    const projectionLoc = resolveUniformLocation(gl, program, "u_projectionMatrix");
    const cameraPosLoc = resolveUniformLocation(gl, program, "uCameraPosition");

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
    const colorLoc = resolveUniformLocation(gl, program, "uColor");
    if (colorLoc) {
      const c = material.color ?? [1, 1, 1];
      gl.uniform3f(colorLoc, c[0], c[1], c[2]);
    }
    const roughnessLoc = resolveUniformLocation(gl, program, "uRoughness");
    if (roughnessLoc) gl.uniform1f(roughnessLoc, material.roughness ?? 0.5);
    const metallicLoc = resolveUniformLocation(gl, program, "uMetallic");
    if (metallicLoc) gl.uniform1f(metallicLoc, material.metallic ?? 0.0);
    const specularLoc = resolveUniformLocation(gl, program, "uSpecular");
    if (specularLoc) gl.uniform1f(specularLoc, material.specular ?? 0.5);
    const emissionColorLoc = resolveUniformLocation(gl, program, "uEmissionColor");
    if (emissionColorLoc) {
      gl.uniform3fv(emissionColorLoc, material.emissionColor ?? [0, 0, 0]);
    }
    const emissionIntensityLoc = resolveUniformLocation(gl, program, "uEmissionIntensity");
    if (emissionIntensityLoc) {
      gl.uniform1f(emissionIntensityLoc, material.emissionIntensity ?? 0.0);
    }
    const alphaLoc = resolveUniformLocation(gl, program, "uAlpha");
    if (alphaLoc) gl.uniform1f(alphaLoc, material.alpha ?? 1.0);
    const metallicFactorLoc = resolveUniformLocation(gl, program, "uMetallicFactor");
    if (metallicFactorLoc) gl.uniform1f(metallicFactorLoc, 1.0);
    const roughnessFactorLoc = resolveUniformLocation(gl, program, "uRoughnessFactor");
    if (roughnessFactorLoc) gl.uniform1f(roughnessFactorLoc, 1.0);
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

    // Camera uniforms are program-global — set once per frame, not per mesh
    this.gl.useProgram(program);
    this.setCameraUniforms(this.gl, program, camera);

    // Hierarchy / multi-select already get a combined AABB — skip per-mesh outlines
    const selectedPreview = objects.filter(
      (m: any) => m && m.isSelected && m.visible !== false && m.type !== "Grid-Geometry"
    );
    const useCombinedSelectionOutline =
      selectedPreview.length >= 2 ||
      selectedPreview.some(
        (m: any) =>
          (m.parent !== null && m.parent !== undefined) ||
          (m.children && m.children.length > 0)
      );
    // Skip expensive/per-mesh selection overlays while gizmo-dragging
    const skipPerMeshSelectionOutline =
      this.isGizmoDragging || useCombinedSelectionOutline;

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
        mesh.normalBuffer = createBuffer(this.gl, mesh.normals || data.Normals || []);
      }
      if (!mesh.textureBuffer || mesh.geometryNeedsUpdate) {
        mesh.textureBuffer = createBuffer(
          this.gl,
          data.TextureCoordinates || []
        );
      }
      if (!mesh.tangentBuffer || mesh.geometryNeedsUpdate) {
        mesh.tangentBuffer = createBuffer(this.gl, mesh.tangent || data.Tangents || []);
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
        resolveUniformLocation(this.gl, program, "uHasTexture"),
        hasTexture
      );
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(
        this.gl.TEXTURE_2D,
        mesh.texture || this.defaultTexture
      );
      this.gl.uniform1i(resolveUniformLocation(this.gl, program, "uSampler"), 0);

      const hasNormalMap = mesh.normalMap ? 1 : 0;
      this.gl.uniform1i(
        resolveUniformLocation(this.gl, program, "uHasNormalMap"),
        hasNormalMap
      );
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(
        this.gl.TEXTURE_2D,
        mesh.normalMap || this.defaultNormalMap
      );
      this.gl.uniform1i(resolveUniformLocation(this.gl, program, "uNormalMap"), 1);

      getUniformLocation(this.gl, program, "u_modelMatrix", worldMatrix);

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

      // Cheap selection outline: world AABB only (no per-frame silhouette). Skipped for
      // hierarchy/multi-select (combined box) and while gizmo dragging.
      if (mesh.isSelected && !skipPerMeshSelectionOutline) {
        const box = mesh.boundingBox;
        if (box && isFinite(box.min[0]) && isFinite(box.max[0])) {
          this.drawCombinedBoundingBox(
            [box.min[0], box.min[1], box.min[2]],
            [box.max[0], box.max[1], box.max[2]],
            program,
            camera
          );
          // Restore mesh model matrix / program state for subsequent draws
          this.gl.useProgram(program);
          getUniformLocation(this.gl, program, "u_modelMatrix", worldMatrix);
        }
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

        const pointColorLoc = resolveUniformLocation(this.gl, this.pointProgram, "uColor");

        // Draw all vertex handles in cyan
        if (pointColorLoc) this.gl.uniform3f(pointColorLoc, 0.0, 0.8, 1.0); // Cyan
        this.gl.drawArrays(this.gl.POINTS, 0, mesh.vertices.length / 3);

        // Draw selected vertex handle in yellow
        if (this.editSubMode === "vertex" && mesh.selectedVertexIndex !== undefined && mesh.selectedVertexIndex >= 0) {
          this.gl.disable(this.gl.DEPTH_TEST); // Render on top
          if (pointColorLoc) this.gl.uniform3f(pointColorLoc, 1.0, 0.9, 0.0); // Yellow
          this.gl.drawArrays(this.gl.POINTS, mesh.selectedVertexIndex, 1);
          this.gl.enable(this.gl.DEPTH_TEST);
        }

        // Draw hovered vertex handle in orange
        if (this.editSubMode === "vertex" && mesh.hoveredVertexIndex !== undefined && mesh.hoveredVertexIndex >= 0 && mesh.hoveredVertexIndex !== mesh.selectedVertexIndex) {
          this.gl.disable(this.gl.DEPTH_TEST);
          if (pointColorLoc) this.gl.uniform3f(pointColorLoc, 1.0, 0.5, 0.0); // Orange
          this.gl.drawArrays(this.gl.POINTS, mesh.hoveredVertexIndex, 1);
          this.gl.enable(this.gl.DEPTH_TEST);
        }

        // Draw selected edge vertices in yellow
        if (this.editSubMode === "edge" && mesh.selectedEdgeVertices && mesh.selectedEdgeVertices.length > 0) {
          this.gl.disable(this.gl.DEPTH_TEST);
          if (pointColorLoc) this.gl.uniform3f(pointColorLoc, 1.0, 0.9, 0.0); // Yellow
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
          if (pointColorLoc) this.gl.uniform3f(pointColorLoc, 1.0, 0.5, 0.0); // Orange
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

    // Draw single combined bounding box helper enclosing all selected meshes when 2 or more are selected, or when an imported model hierarchy is selected
    const shouldDrawCombinedBox = selectedObjects.length >= 2 || (selectedObjects.length === 1 && (selectedObjects[0].parent !== null || (selectedObjects[0].children && selectedObjects[0].children.length > 0)));
    if (shouldDrawCombinedBox) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      let hasBounds = false;

      for (const mesh of selectedObjects) {
        // Use cached bounding box — no per-frame recomputation
        const box = mesh.getBoundingBox ? mesh.getBoundingBox() : mesh.boundingBox;
        if (box && isFinite(box.min[0]) && isFinite(box.max[0])) {
          minX = Math.min(minX, box.min[0]);
          minY = Math.min(minY, box.min[1]);
          minZ = Math.min(minZ, box.min[2]);
          maxX = Math.max(maxX, box.max[0]);
          maxY = Math.max(maxY, box.max[1]);
          maxZ = Math.max(maxZ, box.max[2]);
          hasBounds = true;
        }
      }

      if (hasBounds) {
        // Selection helper outline — draw but do not count toward scene draw calls
        this.drawCombinedBoundingBox([minX, minY, minZ], [maxX, maxY, maxZ], program, camera);
      }
    }

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

  // Helper method to draw a combined bounding box around multi-selected objects (Three.js Editor BoxHelper style)
  drawCombinedBoundingBox(
    min: [number, number, number],
    max: [number, number, number],
    program: WebGLProgram,
    camera: any
  ): void {
    const [x1, y1, z1] = min;
    const [x2, y2, z2] = max;

    // 12 edges of an axis-aligned bounding box (24 vertices = 72 floats)
    const boxVertices = new Float32Array([
      // Bottom face edges
      x1, y1, z1,  x2, y1, z1,
      x2, y1, z1,  x2, y1, z2,
      x2, y1, z2,  x1, y1, z2,
      x1, y1, z2,  x1, y1, z1,

      // Top face edges
      x1, y2, z1,  x2, y2, z1,
      x2, y2, z1,  x2, y2, z2,
      x2, y2, z2,  x1, y2, z2,
      x1, y2, z2,  x1, y2, z1,

      // Vertical connecting edges
      x1, y1, z1,  x1, y2, z1,
      x2, y1, z1,  x2, y2, z1,
      x2, y1, z2,  x2, y2, z2,
      x1, y1, z2,  x1, y2, z2,
    ]);

    if (!this.combinedBoxBuffer) {
      this.combinedBoxBuffer = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.combinedBoxBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, boxVertices, this.gl.DYNAMIC_DRAW);

    // Disable non-position vertex attributes to prevent shader mismatch
    const aNormalLoc = resolveAttribLocation(this.gl, program, "aVertexNormal");
    if (aNormalLoc >= 0) {
      this.gl.disableVertexAttribArray(aNormalLoc);
      this.gl.vertexAttrib3f(aNormalLoc, 0.0, 1.0, 0.0);
    }
    const aTexLoc = resolveAttribLocation(this.gl, program, "aTextureCoord");
    if (aTexLoc >= 0) {
      this.gl.disableVertexAttribArray(aTexLoc);
      this.gl.vertexAttrib2f(aTexLoc, 0.0, 0.0);
    }
    const aTangentLoc = resolveAttribLocation(this.gl, program, "aTangent");
    if (aTangentLoc >= 0) {
      this.gl.disableVertexAttribArray(aTangentLoc);
      this.gl.vertexAttrib3f(aTangentLoc, 1.0, 0.0, 0.0);
    }

    getAttribLocation(this.gl, program, "aPosition", this.combinedBoxBuffer, 3);

    const identityMat = (mat4.create() as unknown) as Float32Array;
    getUniformLocation(this.gl, program, "u_modelMatrix", identityMat);
    this.setCameraUniforms(this.gl, program, camera);

    // Three.js selection yellow/gold
    const boxColor: [number, number, number] = [1.0, 0.88, 0.1];
    this.setMaterialUniforms(this.gl, program, {
      color: boxColor,
      roughness: 0.0,
      metallic: 0.0,
      emissionColor: boxColor,
      emissionIntensity: 1.0,
      alpha: 1.0,
    });

    this.gl.uniform1i(resolveUniformLocation(this.gl, program, "uHasTexture"), 0);
    this.gl.uniform1i(resolveUniformLocation(this.gl, program, "uHasNormalMap"), 0);

    // Render over scene objects without depth occlusion
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.drawArrays(this.gl.LINES, 0, 24);
    this.gl.enable(this.gl.DEPTH_TEST);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
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
      mesh.normalBuffer = createBuffer(this.gl, mesh.normals || data.Normals || []);
    }
    if (!mesh.textureBuffer || mesh.geometryNeedsUpdate) {
      mesh.textureBuffer = createBuffer(this.gl, mesh.texCoord || data.TextureCoordinates || []);
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
      resolveUniformLocation(this.gl, program, "uHasTexture"),
      hasTexture
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(
      this.gl.TEXTURE_2D,
      mesh.texture || this.defaultTexture
    );
    this.gl.uniform1i(resolveUniformLocation(this.gl, program, "uSampler"), 0);

    const hasNormalMap = mesh.normalMap ? 1 : 0;
    this.gl.uniform1i(
      resolveUniformLocation(this.gl, program, "uHasNormalMap"),
      hasNormalMap
    );
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(
      this.gl.TEXTURE_2D,
      mesh.normalMap || this.defaultNormalMap
    );
    this.gl.uniform1i(resolveUniformLocation(this.gl, program, "uNormalMap"), 1);

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
