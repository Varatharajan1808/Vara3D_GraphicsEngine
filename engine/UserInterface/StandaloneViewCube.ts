/**
 * Standalone ultra-quality 3D view cube (Canvas 2D).
 * Faces, edges, corners, compass, and drag arrow — no external deps.
 */

export interface IViewCubeCamera {
  yaw: number;
  pitch: number;
  viewMatrix: Float32Array | number[];
  canvas?: HTMLCanvasElement | null;
  updateUniforms?: () => void;
  addUpdateListener?: (listener: () => void) => void;
  removeUpdateListener?: (listener: () => void) => void;
  onViewChange?: (yaw: number, pitch: number) => void;
}

interface Face {
  indices: number[];
  normal: [number, number, number];
  label: string;
  dir: [number, number, number];
}

interface Edge {
  v1: number;
  v2: number;
  f1: number;
  f2: number;
  dir: [number, number, number];
}

interface CardinalDef {
  label: string;
  angle: number;
  yaw: number;
}

type HoverTarget =
  | { type: "face" | "edge" | "corner"; index: number; dir: [number, number, number] }
  | { type: "cardinal"; index: number; dir: [number, number, number] };

export class StandaloneViewCube {
  private camera: IViewCubeCamera;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isAnimating: boolean = false;
  private animationId: number | null = null;
  private hoverFeature: HoverTarget | null = null;
  private updateLoopId: number | null = null;
  private drawScheduled: boolean = false;
  private lastDrawnYaw: number = NaN;
  private lastDrawnPitch: number = NaN;

  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseLeave: () => void;
  private boundOnMouseUp: (e: MouseEvent) => void;
  private boundCancelAnimation: () => void;
  private boundOnMouseDown: (e: MouseEvent) => void;
  private boundOnDocumentMouseMove: (e: MouseEvent) => void;
  private boundOnDocumentMouseUp: (e: MouseEvent) => void;
  private boundOnCameraUpdate: () => void;

  private isDraggingArrow: boolean = false;
  private dragStartMouseAngle: number = 0;
  private dragStartYaw: number = 0;

  private readonly SIZE = 140;
  private readonly CENTER = 70;
  private readonly COMPASS_OUTER_R = 64;
  private readonly COMPASS_INNER_R = 60;
  private readonly COMPASS_LABEL_R = 52;
  private readonly ARROW_INNER_R = 20;
  private readonly ARROW_OUTER_R = 46;
  private readonly TICK_LEN_MAJOR = 5;
  private readonly TICK_LEN_MINOR = 2.5;
  private readonly CARDINAL_HIT_R = 11;

  private readonly S = 22;
  private readonly vertices: [number, number, number][] = [
    [-this.S, -this.S, -this.S],
    [this.S, -this.S, -this.S],
    [this.S, this.S, -this.S],
    [-this.S, this.S, -this.S],
    [-this.S, -this.S, this.S],
    [this.S, -this.S, this.S],
    [this.S, this.S, this.S],
    [-this.S, this.S, this.S],
  ];

  private readonly faces: Face[] = [
    { indices: [4, 5, 6, 7], normal: [0, 0, 1], label: "FRONT", dir: [0, 0, 1] },
    { indices: [1, 0, 3, 2], normal: [0, 0, -1], label: "BACK", dir: [0, 0, -1] },
    { indices: [0, 4, 7, 3], normal: [-1, 0, 0], label: "LEFT", dir: [-1, 0, 0] },
    { indices: [5, 1, 2, 6], normal: [1, 0, 0], label: "RIGHT", dir: [1, 0, 0] },
    { indices: [7, 6, 2, 3], normal: [0, 1, 0], label: "TOP", dir: [0, 1, 0] },
    { indices: [4, 0, 1, 5], normal: [0, -1, 0], label: "BOTTOM", dir: [0, -1, 0] },
  ];

  private readonly edges: Edge[] = [
    { v1: 6, v2: 7, f1: 4, f2: 0, dir: [0, 1, 1] },
    { v1: 2, v2: 3, f1: 4, f2: 1, dir: [0, 1, -1] },
    { v1: 3, v2: 7, f1: 4, f2: 2, dir: [-1, 1, 0] },
    { v1: 2, v2: 6, f1: 4, f2: 3, dir: [1, 1, 0] },
    { v1: 4, v2: 5, f1: 5, f2: 0, dir: [0, -1, 1] },
    { v1: 0, v2: 1, f1: 5, f2: 1, dir: [0, -1, -1] },
    { v1: 0, v2: 4, f1: 5, f2: 2, dir: [-1, -1, 0] },
    { v1: 1, v2: 5, f1: 5, f2: 3, dir: [1, -1, 0] },
    { v1: 4, v2: 7, f1: 2, f2: 0, dir: [-1, 0, 1] },
    { v1: 5, v2: 6, f1: 3, f2: 0, dir: [1, 0, 1] },
    { v1: 0, v2: 3, f1: 2, f2: 1, dir: [-1, 0, -1] },
    { v1: 1, v2: 2, f1: 3, f2: 1, dir: [1, 0, -1] },
  ];

  private readonly cardinals: CardinalDef[] = [
    { label: "N", angle: 0, yaw: 0 },
    { label: "E", angle: Math.PI / 2, yaw: Math.PI / 2 },
    { label: "S", angle: Math.PI, yaw: Math.PI },
    { label: "W", angle: -Math.PI / 2, yaw: -Math.PI / 2 },
  ];

  private readonly COL_ACCENT = "#00e5ff";
  private readonly COL_ACCENT_GLOW = "rgba(0, 229, 255, 0.45)";
  private readonly COL_WHITE = "#ffffff";
  private readonly COL_RING = "rgba(255, 255, 255, 0.20)";
  private readonly COL_RING_TICK = "rgba(0, 229, 255, 0.50)";
  private readonly COL_FACE_BORDER = "rgba(255, 255, 255, 0.22)";
  private readonly COL_FACE_HOVER = "rgba(0, 229, 255, 0.35)";
  private readonly COL_BG_GRADIENT_INNER = "rgba(18, 20, 28, 0.85)";
  private readonly COL_BG_GRADIENT_OUTER = "rgba(18, 20, 28, 0.0)";

  constructor(camera: IViewCubeCamera, container: HTMLElement = document.body) {
    this.camera = camera;

    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseLeave = this.onMouseLeave.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundCancelAnimation = this.cancelAnimation.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnDocumentMouseMove = this.onDocumentMouseMove.bind(this);
    this.boundOnDocumentMouseUp = this.onDocumentMouseUp.bind(this);
    this.boundOnCameraUpdate = this.requestRender.bind(this);

    this.initCanvas(container);
    this.setupEventListeners();

    if (this.camera.addUpdateListener) {
      this.camera.addUpdateListener(this.boundOnCameraUpdate);
    }
    this.scheduleDraw();
  }

  private initCanvas(container: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, {
      position: "absolute",
      top: "20px",
      right: "20px",
      width: `${this.SIZE}px`,
      height: `${this.SIZE}px`,
      zIndex: "9999",
      pointerEvents: "auto",
      cursor: "pointer",
      borderRadius: "50%",
      background: "rgba(22, 22, 26, 0.45)",
      backdropFilter: "blur(10px)",
      webkitBackdropFilter: "blur(10px)",
      border: "1px solid rgba(255, 255, 255, 0.10)",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45), 0 0 15px rgba(0, 229, 255, 0.1)",
    } as Partial<CSSStyleDeclaration>);

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.SIZE * dpr;
    this.canvas.height = this.SIZE * dpr;

    this.ctx = this.canvas.getContext("2d");
    container.appendChild(this.canvas);
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;

    this.canvas.addEventListener("mousemove", this.boundOnMouseMove);
    this.canvas.addEventListener("mouseleave", this.boundOnMouseLeave);
    this.canvas.addEventListener("mouseup", this.boundOnMouseUp);
    this.canvas.addEventListener("mousedown", this.boundOnMouseDown);

    if (this.camera.canvas) {
      this.camera.canvas.addEventListener("mousedown", this.boundCancelAnimation);
    }
  }

  public requestRender(): void {
    if (this.camera.yaw !== this.lastDrawnYaw || this.camera.pitch !== this.lastDrawnPitch) {
      this.scheduleDraw();
    }
  }

  private cancelAnimation(): void {
    if (this.isAnimating && this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.isAnimating = false;
      this.animationId = null;
    }
  }

  private scheduleDraw(): void {
    if (this.drawScheduled || !this.canvas) return;
    this.drawScheduled = true;
    this.updateLoopId = requestAnimationFrame(() => {
      this.drawScheduled = false;
      this.updateLoopId = null;
      this.draw();
      this.lastDrawnYaw = this.camera.yaw;
      this.lastDrawnPitch = this.camera.pitch;
    });
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.canvas) return;
    if (this.isDraggingArrow) {
      this.hoverFeature = null;
      this.scheduleDraw();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const cardinal = this.getCardinalAtMouse(mx, my);
    if (cardinal !== null) {
      this.hoverFeature = { type: "cardinal", index: cardinal, dir: [0, 0, 0] };
      this.canvas.style.cursor = "pointer";
      this.scheduleDraw();
      return;
    }

    const cubeFeature = this.getCubeFeatureAtMouse(mx, my);
    if (cubeFeature) {
      this.hoverFeature = cubeFeature;
      this.canvas.style.cursor = "pointer";
    } else {
      this.hoverFeature = null;
      const dist = Math.hypot(mx - this.CENTER, my - this.CENTER);
      this.canvas.style.cursor = dist >= 15 && dist <= 85 ? "grab" : "default";
    }
    this.scheduleDraw();
  }

  private onMouseLeave(): void {
    this.hoverFeature = null;
    this.scheduleDraw();
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || !this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dist = Math.hypot(mx - this.CENTER, my - this.CENTER);

    const isOverCube = this.getCubeFeatureAtMouse(mx, my) !== null;
    const isOverCardinal = this.getCardinalAtMouse(mx, my) !== null;

    if (!isOverCube && !isOverCardinal && dist >= 15 && dist <= 85) {
      this.isDraggingArrow = true;
      this.dragStartYaw = this.camera.yaw;
      this.dragStartMouseAngle = Math.atan2(my - this.CENTER, mx - this.CENTER);

      this.cancelAnimation();
      this.canvas.style.cursor = "grabbing";

      document.addEventListener("mousemove", this.boundOnDocumentMouseMove);
      document.addEventListener("mouseup", this.boundOnDocumentMouseUp);
      e.preventDefault();
    }
  }

  private onDocumentMouseMove(e: MouseEvent): void {
    if (!this.isDraggingArrow || !this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const currentMouseAngle = Math.atan2(my - this.CENTER, mx - this.CENTER);
    let delta = currentMouseAngle - this.dragStartMouseAngle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));

    this.camera.yaw = this.dragStartYaw + delta;
    this.triggerCameraUpdate();
    this.scheduleDraw();
  }

  private onDocumentMouseUp(): void {
    if (this.isDraggingArrow) {
      this.isDraggingArrow = false;
      if (this.canvas) this.canvas.style.cursor = "default";
      document.removeEventListener("mousemove", this.boundOnDocumentMouseMove);
      document.removeEventListener("mouseup", this.boundOnDocumentMouseUp);
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.isDraggingArrow || e.button !== 0 || !this.hoverFeature) return;

    if (this.hoverFeature.type === "cardinal") {
      const cardinal = this.cardinals[this.hoverFeature.index];
      this.animateCamera(cardinal.yaw, 0);
      return;
    }

    const [dx, dy, dz] = this.hoverFeature.dir;
    const len = Math.hypot(dx, dy, dz);
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;

    const targetPitch = Math.asin(Math.max(-1, Math.min(1, uy)));
    let targetYaw = this.camera.yaw;
    if (Math.abs(uy) < 0.999) {
      targetYaw = Math.atan2(ux, uz);
    }

    this.animateCamera(targetYaw, targetPitch);
  }

  private animateCamera(targetYaw: number, targetPitch: number): void {
    this.cancelAnimation();

    this.isAnimating = true;
    const duration = 380;
    const startTime = performance.now();
    const startYaw = this.camera.yaw;
    const startPitch = this.camera.pitch;

    let diffYaw = targetYaw - startYaw;
    diffYaw = Math.atan2(Math.sin(diffYaw), Math.cos(diffYaw));
    const diffPitch = targetPitch - startPitch;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);

      this.camera.yaw = startYaw + diffYaw * ease;
      this.camera.pitch = Math.max(-1.5, Math.min(1.5, startPitch + diffPitch * ease));

      this.triggerCameraUpdate();
      this.scheduleDraw();

      if (progress < 1) {
        this.animationId = requestAnimationFrame(tick);
      } else {
        this.isAnimating = false;
        this.animationId = null;
      }
    };

    this.animationId = requestAnimationFrame(tick);
  }

  private triggerCameraUpdate(): void {
    if (this.camera.updateUniforms) this.camera.updateUniforms();
    if (this.camera.onViewChange) this.camera.onViewChange(this.camera.yaw, this.camera.pitch);
  }

  private getCardinalAtMouse(mx: number, my: number): number | null {
    for (let i = 0; i < this.cardinals.length; i++) {
      const c = this.cardinals[i];
      const lx = this.CENTER + this.COMPASS_LABEL_R * Math.sin(c.angle);
      const ly = this.CENTER - this.COMPASS_LABEL_R * Math.cos(c.angle);
      if (Math.hypot(mx - lx, my - ly) < this.CARDINAL_HIT_R) return i;
    }
    return null;
  }

  private getCubeFeatureAtMouse(mx: number, my: number): HoverTarget | null {
    const vm = this.camera.viewMatrix;
    const visibleFaces: number[] = [];

    this.faces.forEach((face, idx) => {
      const cnz = vm[2] * face.normal[0] + vm[6] * face.normal[1] + vm[10] * face.normal[2];
      if (cnz > 0) visibleFaces.push(idx);
    });
    if (visibleFaces.length === 0) return null;

    const projected = this.vertices.map((v) => ({
      x: this.CENTER + (vm[0] * v[0] + vm[4] * v[1] + vm[8] * v[2]),
      y: this.CENTER - (vm[1] * v[0] + vm[5] * v[1] + vm[9] * v[2]),
    }));

    for (const fIdx of visibleFaces) {
      for (const cIdx of this.faces[fIdx].indices) {
        const pt = projected[cIdx];
        if (Math.hypot(mx - pt.x, my - pt.y) < 10) {
          const v = this.vertices[cIdx];
          return {
            type: "corner",
            index: cIdx,
            dir: [v[0] > 0 ? 1 : -1, v[1] > 0 ? 1 : -1, v[2] > 0 ? 1 : -1],
          };
        }
      }
    }

    for (let eIdx = 0; eIdx < this.edges.length; eIdx++) {
      const edge = this.edges[eIdx];
      if (visibleFaces.includes(edge.f1) || visibleFaces.includes(edge.f2)) {
        const p1 = projected[edge.v1];
        const p2 = projected[edge.v2];
        if (this.distanceToSegment(mx, my, p1.x, p1.y, p2.x, p2.y) < 8) {
          return { type: "edge", index: eIdx, dir: edge.dir };
        }
      }
    }

    for (const fIdx of visibleFaces) {
      const poly = this.faces[fIdx].indices.map((idx) => projected[idx]);
      if (this.isPointInPolygon({ x: mx, y: my }, poly)) {
        return { type: "face", index: fIdx, dir: this.faces[fIdx].dir };
      }
    }

    return null;
  }

  private draw(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    const vm = this.camera.viewMatrix;
    const cx = this.CENTER;
    const cy = this.CENTER;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, this.COMPASS_OUTER_R + 10);
    bgGrad.addColorStop(0, this.COL_BG_GRADIENT_INNER);
    bgGrad.addColorStop(1, this.COL_BG_GRADIENT_OUTER);
    ctx.beginPath();
    ctx.arc(cx, cy, this.COMPASS_OUTER_R + 10, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    this.drawCompass(ctx, cx, cy);
    this.drawDirectionArrow(ctx, cx, cy);
    this.drawCardinalLabels(ctx, cx, cy);
    this.drawCube(ctx, vm, cx, cy);

    ctx.restore();
  }

  private drawCompass(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath();
    ctx.arc(cx, cy, this.COMPASS_OUTER_R, 0, Math.PI * 2);
    ctx.strokeStyle = this.COL_RING;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, this.COMPASS_INNER_R, 0, Math.PI * 2);
    ctx.strokeStyle = this.COL_RING;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    const totalTicks = 36;
    const midR = (this.COMPASS_OUTER_R + this.COMPASS_INNER_R) / 2;
    for (let i = 0; i < totalTicks; i++) {
      const theta = (i / totalTicks) * Math.PI * 2 - Math.PI / 2;
      const isMajor = i % 9 === 0;
      const halfTick = (isMajor ? this.TICK_LEN_MAJOR : this.TICK_LEN_MINOR) / 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      ctx.beginPath();
      ctx.moveTo(cx + (midR - halfTick) * cosT, cy + (midR - halfTick) * sinT);
      ctx.lineTo(cx + (midR + halfTick) * cosT, cy + (midR + halfTick) * sinT);
      ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.5)" : this.COL_RING_TICK;
      ctx.lineWidth = isMajor ? 1.8 : 1.0;
      ctx.stroke();
    }
  }

  private drawDirectionArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const arrowAngle = this.camera.yaw - Math.PI / 2;
    const cosA = Math.cos(arrowAngle);
    const sinA = Math.sin(arrowAngle);

    const sx = cx + this.ARROW_INNER_R * cosA;
    const sy = cy + this.ARROW_INNER_R * sinA;
    const ex = cx + this.ARROW_OUTER_R * cosA;
    const ey = cy + this.ARROW_OUTER_R * sinA;

    ctx.save();
    ctx.shadowColor = this.COL_ACCENT;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = this.COL_ACCENT;
    ctx.lineWidth = 2.0;
    ctx.lineCap = "round";
    ctx.stroke();

    const headLen = 6;
    const headWidth = 4;
    const tipX = cx + (this.ARROW_OUTER_R + 2) * cosA;
    const tipY = cy + (this.ARROW_OUTER_R + 2) * sinA;
    const baseX = tipX - headLen * cosA;
    const baseY = tipY - headLen * sinA;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX - headWidth * sinA, baseY + headWidth * cosA);
    ctx.lineTo(baseX + headWidth * sinA, baseY - headWidth * cosA);
    ctx.closePath();
    ctx.fillStyle = this.COL_ACCENT;
    ctx.fill();
    ctx.restore();
  }

  private drawCardinalLabels(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const yaw = this.camera.yaw;
    let activeIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.cardinals.length; i++) {
      const diff = Math.atan2(
        Math.sin(yaw - this.cardinals[i].yaw),
        Math.cos(yaw - this.cardinals[i].yaw)
      );
      if (Math.abs(diff) < bestDist) {
        bestDist = Math.abs(diff);
        activeIdx = i;
      }
    }
    if (bestDist >= Math.PI / 4) activeIdx = -1;

    for (let i = 0; i < this.cardinals.length; i++) {
      const c = this.cardinals[i];
      const lx = cx + this.COMPASS_LABEL_R * Math.sin(c.angle);
      const ly = cy - this.COMPASS_LABEL_R * Math.cos(c.angle);
      const isActive = i === activeIdx;
      const isHovered = this.hoverFeature?.type === "cardinal" && this.hoverFeature.index === i;

      ctx.save();
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(lx, ly, 10, 0, Math.PI * 2);
        ctx.fillStyle = this.COL_ACCENT_GLOW;
        ctx.fill();
      } else if (isActive) {
        ctx.shadowColor = this.COL_ACCENT;
        ctx.shadowBlur = 8;
      }

      ctx.font = `bold ${isActive || isHovered ? 12 : 10}px 'Space Grotesk', 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isHovered || isActive ? this.COL_ACCENT : this.COL_WHITE;
      ctx.fillText(c.label, lx, ly);
      ctx.restore();
    }
  }

  private drawCube(
    ctx: CanvasRenderingContext2D,
    vm: Float32Array | number[],
    cx: number,
    cy: number
  ): void {
    const projected = this.vertices.map((v) => ({
      x: cx + (vm[0] * v[0] + vm[4] * v[1] + vm[8] * v[2]),
      y: cy - (vm[1] * v[0] + vm[5] * v[1] + vm[9] * v[2]),
    }));

    const faceDepths: { idx: number; depth: number }[] = [];
    this.faces.forEach((face, fIdx) => {
      const cnz = vm[2] * face.normal[0] + vm[6] * face.normal[1] + vm[10] * face.normal[2];
      if (cnz <= 0) return;
      let avgZ = 0;
      face.indices.forEach(
        (vi) =>
          (avgZ +=
            vm[2] * this.vertices[vi][0] +
            vm[6] * this.vertices[vi][1] +
            vm[10] * this.vertices[vi][2])
      );
      faceDepths.push({ idx: fIdx, depth: avgZ / face.indices.length });
    });

    faceDepths.sort((a, b) => a.depth - b.depth);

    for (const { idx: fIdx } of faceDepths) {
      const face = this.faces[fIdx];
      const pts = face.indices.map((idx) => projected[idx]);

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();

      const isHovered = this.hoverFeature?.type === "face" && this.hoverFeature.index === fIdx;
      if (isHovered) {
        ctx.fillStyle = this.COL_FACE_HOVER;
        ctx.strokeStyle = this.COL_ACCENT;
        ctx.lineWidth = 2.0;
      } else {
        const cnz = vm[2] * face.normal[0] + vm[6] * face.normal[1] + vm[10] * face.normal[2];
        const brightness = Math.floor(45 + cnz * 15);
        ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness + 8}, 0.88)`;
        ctx.strokeStyle = this.COL_FACE_BORDER;
        ctx.lineWidth = 1.0;
      }

      ctx.fill();
      ctx.stroke();

      const fx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
      const fy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
      const area = this.polygonArea(pts);
      const fontSize = area > 400 ? 8 : area > 200 ? 7 : 6;

      ctx.font = `bold ${fontSize}px 'Space Grotesk', 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.75)";
      ctx.fillText(face.label, fx, fy);
    }

    if (this.hoverFeature && this.hoverFeature.type === "edge") {
      const edge = this.edges[this.hoverFeature.index];
      const p1 = projected[edge.v1];
      const p2 = projected[edge.v2];
      ctx.save();
      ctx.shadowColor = this.COL_ACCENT;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = "rgba(248, 163, 60, 0.95)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    if (this.hoverFeature && this.hoverFeature.type === "corner") {
      const pt = projected[this.hoverFeature.index];
      ctx.save();
      ctx.shadowColor = this.COL_ACCENT;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = this.COL_ACCENT;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private polygonArea(pts: { x: number; y: number }[]): number {
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    }
    return Math.abs(area / 2);
  }

  private distanceToSegment(
    mx: number,
    my: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(mx - x1, my - y1);
    const t = Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / lenSq));
    return Math.hypot(mx - (x1 + t * dx), my - (y1 + t * dy));
  }

  private isPointInPolygon(
    p: { x: number; y: number },
    vs: { x: number; y: number }[]
  ): boolean {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x;
      const yi = vs[i].y;
      const xj = vs[j].x;
      const yj = vs[j].y;
      const intersect =
        yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  public dispose(): void {
    if (this.updateLoopId) cancelAnimationFrame(this.updateLoopId);
    this.cancelAnimation();
    document.removeEventListener("mousemove", this.boundOnDocumentMouseMove);
    document.removeEventListener("mouseup", this.boundOnDocumentMouseUp);

    if (this.camera.removeUpdateListener) {
      this.camera.removeUpdateListener(this.boundOnCameraUpdate);
    }
    if (this.camera.canvas) {
      this.camera.canvas.removeEventListener("mousedown", this.boundCancelAnimation);
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
  }
}
