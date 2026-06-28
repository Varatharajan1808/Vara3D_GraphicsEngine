import { CameraController } from "../CameraSystem/CameraController";
import { SceneInteractionHandler } from "../EventManager/SceneInteractionHandler";

interface AxisItem {
    name: string;
    oppositeName: string;
    dir: number[];
    color: string;
    label: string;
    isPositive: boolean;
    targetDegX: number;
    targetDegY: number;

    // Computed values
    vx: number;
    vy: number;
    vz: number;
    screenX: number;
    screenY: number;

    // Persistent SVG handles
    groupEl?: SVGElement;
    lineEl?: SVGElement;
    circleEl?: SVGElement;
    textEl?: SVGElement;
}

export class ViewHelper {
    private container!: HTMLDivElement;
    private svg!: SVGSVGElement;
    private camera: CameraController;
    private interactionHandler: SceneInteractionHandler;
    private centerPivot!: SVGCircleElement;

    // Animation state
    private isAnimating = false;
    private startTime = 0;
    private duration = 300;
    private startDegX = 0;
    private startDegY = 0;
    private diffX = 0;
    private diffY = 0;

    private axes: AxisItem[] = [
        { name: "+X", oppositeName: "-X", dir: [1, 0, 0], color: "#ff3b30", label: "X", isPositive: true, targetDegX: 90, targetDegY: 0, vx: 0, vy: 0, vz: 0, screenX: 0, screenY: 0 },
        { name: "-X", oppositeName: "+X", dir: [-1, 0, 0], color: "#ff3b30", label: "", isPositive: false, targetDegX: -90, targetDegY: 0, vx: 0, vy: 0, vz: 0, screenX: 0, screenY: 0 },
        { name: "+Y", oppositeName: "-Y", dir: [0, 1, 0], color: "#34c759", label: "Y", isPositive: true, targetDegX: 0, targetDegY: 89.9, vx: 0, vy: 0, vz: 0, screenX: 0, screenY: 0 },
        { name: "-Y", oppositeName: "+Y", dir: [0, -1, 0], color: "#34c759", label: "", isPositive: false, targetDegX: 0, targetDegY: -89.9, vx: 0, vy: 0, vz: 0, screenX: 0, screenY: 0 },
        { name: "+Z", oppositeName: "-Z", dir: [0, 0, 1], color: "#007aff", label: "Z", isPositive: true, targetDegX: 0, targetDegY: 0, vx: 0, vy: 0, vz: 0, screenX: 0, screenY: 0 },
        { name: "-Z", oppositeName: "+Z", dir: [0, 0, -1], color: "#007aff", label: "", isPositive: false, targetDegX: 180, targetDegY: 0, vx: 0, vy: 0, vz: 0, screenX: 0, screenY: 0 },
    ];

    constructor(viewportContainer: HTMLElement, camera: CameraController, interactionHandler: SceneInteractionHandler) {
        this.camera = camera;
        this.interactionHandler = interactionHandler;
        this.initDOM(viewportContainer);
    }

    private initDOM(viewportContainer: HTMLElement) {
        // Create view helper container
        this.container = document.createElement("div");
        this.container.id = "view-helper-container";

        // Create SVG element
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
        this.svg.id = "view-helper-svg";
        this.svg.setAttribute("width", "90");
        this.svg.setAttribute("height", "90");
        this.svg.setAttribute("viewBox", "-45 -45 90 90");
        this.svg.style.overflow = "visible";

        this.container.appendChild(this.svg);
        viewportContainer.appendChild(this.container);

        // Initialize SVG elements for each axis dynamically
        this.axes.forEach(axis => {
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("class", "view-helper-axis-group");
            group.setAttribute("data-axis", axis.name);

            if (axis.isPositive) {
                // Line
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("class", "view-helper-axis-line");
                line.setAttribute("x1", "0");
                line.setAttribute("y1", "0");
                line.setAttribute("stroke", axis.color);
                group.appendChild(line);
                axis.lineEl = line;

                // Circle
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("r", "8.5");
                circle.setAttribute("fill", axis.color);
                group.appendChild(circle);
                axis.circleEl = circle;

                // Text label
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("class", "view-helper-axis-label");
                text.setAttribute("fill", "#ffffff");
                text.setAttribute("font-size", "7.5px");
                text.setAttribute("font-weight", "bold");
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("dominant-baseline", "central");
                text.textContent = axis.label;
                group.appendChild(text);
                axis.textEl = text;
            } else {
                // Hollow circle for negative axis
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("r", "6.5");
                circle.setAttribute("fill", "transparent");
                circle.setAttribute("stroke", axis.color);
                circle.setAttribute("stroke-width", "2");
                group.appendChild(circle);
                axis.circleEl = circle;
            }

            axis.groupEl = group;
            this.svg.appendChild(group);
        });

        // Create center pivot circle
        this.centerPivot = document.createElementNS("http://www.w3.org/2000/svg", "circle") as SVGCircleElement;
        this.centerPivot.setAttribute("cx", "0");
        this.centerPivot.setAttribute("cy", "0");
        this.centerPivot.setAttribute("r", "3.5");
        this.centerPivot.setAttribute("fill", "#94a3b8");
        this.centerPivot.setAttribute("opacity", "0.9");
        this.svg.appendChild(this.centerPivot);

        // Event listener attached directly to the SVG element (delegated)
        this.svg.addEventListener("click", (e) => {
            const target = e.target as SVGElement;
            const group = target.closest(".view-helper-axis-group") as SVGElement;
            if (group && group.dataset.axis) {
                const axisName = group.dataset.axis;
                const axisItem = this.axes.find(a => a.name === axisName);
                if (axisItem) {
                    this.triggerSnap(axisItem.targetDegX, axisItem.targetDegY);
                }
            }
        });
    }

    private triggerSnap(targetDegX: number, targetDegY: number) {
        this.isAnimating = true;
        this.startTime = performance.now();

        this.startDegX = this.interactionHandler.rotationX * this.interactionHandler.sensitivity;
        this.startDegY = this.interactionHandler.rotationY * this.interactionHandler.sensitivity;

        // Shortest path interpolation for X rotation to prevent looping around
        let dX = targetDegX - this.startDegX;
        dX = ((dX + 180) % 360);
        if (dX < 0) dX += 360;
        dX -= 180;
        this.diffX = dX;

        this.diffY = targetDegY - this.startDegY;
    }

    public update() {
        if (this.isAnimating) {
            const elapsed = performance.now() - this.startTime;
            const progress = Math.min(elapsed / this.duration, 1.0);

            // cubic ease in out
            const t = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            const currX = this.startDegX + this.diffX * t;
            const currY = this.startDegY + this.diffY * t;

            this.interactionHandler.rotationX = currX / this.interactionHandler.sensitivity;
            this.interactionHandler.rotationY = currY / this.interactionHandler.sensitivity;

            if (progress >= 1.0) {
                this.isAnimating = false;
            }
        }

        this.draw();
    }

    private draw() {
        const viewMatrix = this.camera.viewMatrix;
        if (!viewMatrix) return;

        // 1. Calculate positions
        this.axes.forEach(axis => {
            // Rotation portion of view projects vectors relative to viewport screen direction
            axis.vx = axis.dir[0] * viewMatrix[0] + axis.dir[1] * viewMatrix[4] + axis.dir[2] * viewMatrix[8];
            axis.vy = axis.dir[0] * viewMatrix[1] + axis.dir[1] * viewMatrix[5] + axis.dir[2] * viewMatrix[9];
            axis.vz = axis.dir[0] * viewMatrix[2] + axis.dir[1] * viewMatrix[6] + axis.dir[2] * viewMatrix[10];

            const radius = 28;
            axis.screenX = axis.vx * radius;
            axis.screenY = -axis.vy * radius; // Negate Y because SVG viewport coordinates go down
        });

        // 2. Sort by depth (vz) to paint back-to-front (Painter's algorithm)
        const sortedAxes = [...this.axes].sort((a, b) => a.vz - b.vz);

        // 3. Re-append in correct order and update rendering attributes
        sortedAxes.forEach(axis => {
            const isBehind = axis.vz < -0.15;
            const opacityVal = isBehind ? 0.35 : 1.0;

            const group = axis.groupEl;
            if (!group) return;

            // Update line
            if (axis.isPositive && axis.lineEl) {
                axis.lineEl.setAttribute("x2", axis.screenX.toString());
                axis.lineEl.setAttribute("y2", axis.screenY.toString());
                axis.lineEl.setAttribute("stroke-width", isBehind ? "1.5" : "3");
                if (isBehind) {
                    axis.lineEl.setAttribute("stroke-dasharray", "2,2");
                } else {
                    axis.lineEl.removeAttribute("stroke-dasharray");
                }
                axis.lineEl.setAttribute("opacity", opacityVal.toString());
            }

            // Update circle
            if (axis.circleEl) {
                axis.circleEl.setAttribute("cx", axis.screenX.toString());
                axis.circleEl.setAttribute("cy", axis.screenY.toString());
                axis.circleEl.setAttribute("opacity", (axis.isPositive ? opacityVal : opacityVal * 0.85).toString());
            }

            // Update text label position
            if (axis.isPositive && axis.textEl) {
                axis.textEl.setAttribute("x", axis.screenX.toString());
                axis.textEl.setAttribute("y", (axis.screenY + 0.5).toString());
                axis.textEl.setAttribute("opacity", isBehind ? "0" : "1");
            }

            // Re-append elements to order them properly in painters stack
            this.svg.appendChild(group);
        });

        // Keep center pivot dot on top
        if (this.centerPivot) {
            this.svg.appendChild(this.centerPivot);
        }
    }
}
