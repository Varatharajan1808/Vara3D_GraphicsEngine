# Vara3D Graphics Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WebGL](https://img.shields.io/badge/WebGL-990000?style=for-the-badge&logo=webgl&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](https://opensource.org/licenses/ISC)

![3D Editor Interface](./images/image.png)

Browser-based **3D graphics engine** and **visual editor**, built from scratch in **TypeScript** with **raw WebGL** (no Three.js / Babylon).

**Live demo:** [varatha3deditor.vercel.app](https://varatha3deditor.vercel.app/)

---

## What this project is

Learning-focused graphics engine work: rendering pipeline, GLSL shaders, PBR materials, scene graph hierarchy, GLTF I/O, and an interactive editor on top.

It is a **personal / independent** project for learning and experimentation — not employer or proprietary code.

---

## Highlights

| Area | What you get |
|------|----------------|
| Rendering | Custom WebGL pipeline, GLSL shaders, PBR |
| Scene | Parent–child hierarchy, world transforms, Empty groups |
| Assets | GLTF / GLB import & export (incl. zip folders) |
| Editing | Translate / Rotate / Scale gizmos, materials, lights |
| Viewport | Orbit ViewCube, grid helper, FPS / draw-call stats |
| Session | IndexedDB autosave (survives refresh; empty scene stays empty) |

WebGPU is **planned** (status chip in the editor says “WebGPU soon”) — the editor runs on **WebGL** today.

---

## Engine features

![Core Rendering Features](./images/image1.png)

- Custom WebGL render loop and shader library
- Physically Based Rendering (unified light path)
- Point / spot / directional lights (hierarchy-aware world space)
- Scene graph with cycle-safe, world-preserving reparent
- Frustum culling
- GLTF / GLB import & export
- Geometry primitives (box, sphere, plane, cone, cylinder)
- Transform gizmos and viewport picking

---

## Editor features

![Interactive Visual Editor](./images/image2.png)

- **Scene Graph** — select, show/hide, delete, drag to parent, keyboard ↑↓ / ←→
- **Inspector** — transforms, materials, textures / normal maps, light props
- **Add menu** — Empty, meshes, lights, camera projection
- **ViewCube** — face / orbit orientation control
- **Light / dark theme** (saved preference)
- **Collapsible panels** + responsive inspector (`I` to toggle)
- **Toasts** for import / export / actions
- **Keyboard shortcuts** — press **`?`** in the top bar
- Autosave to IndexedDB (meshes restore first; textures fill in async)

---

## Useful shortcuts

| Action | Keys |
|--------|------|
| File / Add menu | `Shift+F` / `Shift+A` |
| Translate / Rotate / Scale | `T` / `R` / `S` |
| Object / Edit mode | `O` / `E` |
| Focus selection | `F` |
| Toggle inspector | `I` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` |
| Copy / Paste / Duplicate | `Ctrl+C` / `Ctrl+V` / `Ctrl+D` |
| Orbit / Pan / Zoom | LMB drag (empty) / MMB or RMB / Scroll |

Full list: click **`?`** in the editor.

---

## Getting started

**Requirements:** Node.js 16+, npm

```bash
git clone https://github.com/Varatharajan1808/Vara3D-Graphics-Engine.git
cd Vara3D-Graphics-Engine
npm install
npm run dev
```

Open the URL printed by webpack-dev-server (port is chosen automatically).

```bash
npm run build    # production bundle → dist/
```

---

## Project structure

```
├── engine/
│   ├── Renderer/           # WebGL engine, shaders, buffers
│   ├── MaterialSystem/     # PBR materials
│   ├── LightingEngine/     # Light node types
│   ├── CameraSystem/       # Perspective / orthographic + orbit
│   ├── SceneGraph/         # Nodes, hierarchy, world matrices
│   ├── MeshRenderer/       # Renderable meshes
│   ├── AssetImporter/      # GLTF / GLB load & export
│   ├── GeometryPrimitives/ # Built-in shapes
│   ├── EventManager/       # Input, gizmo, picking
│   ├── CoreUtilities/      # Commands, clipboard, autosave, factory…
│   ├── UserInterface/      # Editor UI, ViewCube, styles
│   ├── MathLibrary/        # gl-matrix helpers
│   └── Textures/          # Sample textures
├── Showcase/
│   └── 3DEditor/           # Editor entry (index.html + EditorApplication)
├── images/                 # README screenshots
└── dist/                   # Build output
```

---

## Using the engine

The full editor wires WebGL, scene, lights, shaders, and UI in:

`Showcase/3DEditor/EditorApplication.ts`

Core render call shape:

```typescript
webgl.Render(program, camera, scene);
```

For day-to-day use, run the editor with `npm run dev` rather than a minimal snippet — lighting, materials, and autosave are all set up there.

---

## Tech stack

- **TypeScript**
- **WebGL** + **GLSL** (no high-level 3D framework)
- **Webpack 5** (dev server + production build)
- **fflate** (zip handling for imports)
- **Vercel** (demo hosting)

---

## Roadmap

- WebGPU backend
- Shadow mapping
- Skeletal animation
- Post-processing
- Physics integration
- Richer materials / compute paths

---

## Contact

Questions or feedback: open an issue or discussion on GitHub.

**GitHub:** [github.com/Varatharajan1808](https://github.com/Varatharajan1808)

---

Built with care by **Varatharajan**

**TypeScript · WebGL · Graphics programming · Real-time rendering**
