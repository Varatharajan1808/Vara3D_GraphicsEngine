# 3D Web Engine & Editor

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WebGL](https://img.shields.io/badge/WebGL-990000?style=for-the-badge&logo=webgl&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](https://opensource.org/licenses/ISC)

I'm building a 3D engine and editor from scratch using TypeScript and raw WebGL — no Three.js, no Babylon, no wrapper libraries. The whole point is to learn how rendering actually works under the hood by writing everything myself: the math, the shaders, the scene graph, the material system, all of it.

**Live demo:** [varatha3deditor.vercel.app](https://varatha3deditor.vercel.app/)

---

## What it does

- Renders 3D scenes using a custom WebGL 2.0 pipeline I wrote from scratch
- PBR materials (metallic-roughness workflow, normal maps, emissive, etc.)
- Point, spot, and directional lights with proper GLSL shaders
- Frustum culling so it doesn't waste time rendering stuff off-screen
- Full scene graph with parent-child transforms
- A visual editor where you can add objects, move them around with gizmos, tweak materials, import/export GLTF files, and see everything update in real time

---

## The editor

The editor is the main way to interact with the engine right now. It has:

- A scene tree panel that shows your hierarchy
- A property inspector for transforms, materials, and light settings
- Translate / Rotate / Scale gizmos
- GLTF/GLB import and export
- Texture and normal map management
- FPS counter and draw call stats

---

## Project structure

```
├── engine/
│   ├── RenderingPipeline/    # WebGL context, shader compilation, GLSL shaders
│   ├── MaterialSystem/       # PBR material definitions
│   ├── LightingEngine/       # Light types and management
│   ├── CameraSystem/         # Perspective & orthographic cameras, orbit controls
│   ├── SceneGraph/           # Node hierarchy and transforms
│   ├── AssetImporter/        # GLTF/GLB loader and exporter
│   ├── EventManager/         # Input handling
│   ├── MathLibrary/          # Vec3, Mat4, quaternions — the usual
│   ├── GeometryPrimitives/   # Box, sphere, plane, etc.
│   └── UserInterface/        # Editor panels and controls
├── Showcase/
│   └── 3DEditor/             # The editor app
└── dist/                     # Build output
```

---

## Tech used

- **TypeScript** (strict mode)
- **WebGL 2.0** — direct API calls, no abstractions
- **Webpack 5** for bundling
- **Vercel** for hosting the demo

---

## Getting started

You'll need Node.js (v16 or newer) and npm.

```bash
git clone https://github.com/Varatharajan1808/3D-Web_Engine.git
cd 3D-Web_Engine
npm install
npm run start
```

Then open `http://localhost:8081` in your browser.

To build for production:

```bash
npm run build
```

---

## Quick example

If you want to use the engine programmatically instead of the editor:

```typescript
import { WebGLRenderEngine } from './engine/RenderingPipeline/Webgl/WebGLRenderEngine';
import { SceneHierarchyManager } from './engine/SceneGraph/SceneHierarchyManager';
import { CameraController } from './engine/CameraSystem/CameraController';
import { RenderableMeshObject } from './engine/MeshRenderer/RenderableMeshObject';

const canvas = document.getElementById('Mycanvas') as HTMLCanvasElement;
const webgl = new WebGLRenderEngine(canvas);
const scene = new SceneHierarchyManager();

const camera = new CameraController();
camera.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000);
camera.OrbitCamera();

const box = new RenderableMeshObject(new BoxGeometryBuilder().CubeData());
scene.add(box);

const animate = () => {
  webgl.render(scene, camera);
  requestAnimationFrame(animate);
};
animate();
```

---

## What I want to add next

- Shadow mapping (cascaded shadow maps)
- Skeletal animation for rigged models
- Post-processing (bloom, HDR, depth of field)
- A proper WebGPU backend
- Physics (probably Rapier or Cannon.js)
- More material types — clearcoat, sheen, iridescence

---

## Get in touch

If you have questions or want to chat about the project:
- **GitHub:** [Varatharajan1808](https://github.com/Varatharajan1808)
- Feel free to open an issue for bugs or feature ideas.

---

Built by **Varatharajan** — TypeScript + WebGL, no shortcuts.
