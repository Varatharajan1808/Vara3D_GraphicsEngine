import { mat4, vec3 } from "../MathLibrary/gl-matrix";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export type Vec3 = { x: number; y: number; z: number };

export interface SetParentOptions {
    /** Keep the node's world transform after changing parents (default true for reparent UX). */
    preserveWorldTransform?: boolean;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Euler XYZ radians matching {@link SceneNode.updateLocalMatrix}
 * (mat4.rotateX → rotateY → rotateZ).
 */
function eulerXYZFromMat4(m: Float32Array | number[]): Vec3 {
    const r02 = m[8];
    const y = Math.asin(clamp(r02, -1, 1));
    let x: number;
    let z: number;
    if (Math.abs(r02) < 0.999999) {
        x = Math.atan2(-m[9], m[10]);
        z = Math.atan2(-m[4], m[0]);
    } else {
        x = Math.atan2(m[6], m[5]);
        z = 0;
    }
    return { x, y, z };
}

function snapshotTRS(node: SceneNode): { position: Vec3; rotate: Vec3; scale: Vec3 } {
    return {
        position: { ...node.position },
        rotate: { ...node.rotate },
        scale: { ...node.scale },
    };
}

export class SceneNode {
    uuid: string;
    name: string;
    type: string = "SceneNode";

    position: Vec3 = { x: 0, y: 0, z: 0 };
    scale: Vec3 = { x: 1, y: 1, z: 1 };
    rotate: Vec3 = { x: 0, y: 0, z: 0 };

    localMatrix: any;
    worldMatrix: any;

    parent: SceneNode | null = null;
    children: SceneNode[] = [];

    constructor(name: string = "Node") {
        this.uuid = uuidv4();
        this.name = name;
        this.localMatrix = mat4.create();
        this.worldMatrix = mat4.create();
        this.updateLocalMatrix();
    }

    /** True if this node sits under `ancestor` in the hierarchy. */
    isDescendantOf(ancestor: SceneNode): boolean {
        let cur: SceneNode | null = this.parent;
        while (cur) {
            if (cur === ancestor) return true;
            cur = cur.parent;
        }
        return false;
    }

    /** True if `node` is this node or nested under it. */
    isAncestorOf(node: SceneNode): boolean {
        return node === this || node.isDescendantOf(this);
    }

    /**
     * Whether parenting under `parent` is allowed (no self-parent, no cycles).
     */
    canSetParent(parent: SceneNode | null): boolean {
        if (parent === this) return false;
        if (parent && this.isAncestorOf(parent)) return false;
        return true;
    }

    /**
     * Attach to a new parent (or root when `null`).
     * Rejects cyclic parenting. Optionally keeps world transform stable.
     * @returns false if the parent change was rejected
     */
    setParent(parent: SceneNode | null, options: SetParentOptions = {}): boolean {
        if (this.parent === parent) return true;
        if (!this.canSetParent(parent)) return false;

        const preserveWorld = options.preserveWorldTransform === true;
        let worldCopy: Float32Array | number[] | null = null;
        if (preserveWorld) {
            worldCopy = mat4.create();
            mat4.copy(worldCopy, this.worldMatrix);
        }

        if (this.parent) {
            const index = this.parent.children.indexOf(this);
            if (index !== -1) {
                this.parent.children.splice(index, 1);
            }
        }

        this.parent = parent;

        if (this.parent) {
            if (!this.parent.children.includes(this)) {
                this.parent.children.push(this);
            }
            // Ensure parent world is current before we recompute local
            this.parent.updateWorldMatrix();
        }

        if (preserveWorld && worldCopy) {
            this.applyWorldMatrixAsLocal(worldCopy);
        } else {
            this.updateWorldMatrix();
        }

        return true;
    }

    /**
     * Set local TRS so this node's world matrix matches `worldMat`
     * under the current parent (or as root).
     */
    applyWorldMatrixAsLocal(worldMat: Float32Array | number[]): void {
        const local = mat4.create();
        if (this.parent) {
            const invParent = mat4.create();
            if (!mat4.invert(invParent, this.parent.worldMatrix)) {
                mat4.copy(local, worldMat as any);
            } else {
                mat4.multiply(local, invParent, worldMat as any);
            }
        } else {
            mat4.copy(local, worldMat as any);
        }

        const t = vec3.create();
        const s = vec3.create();
        mat4.getTranslation(t, local);
        mat4.getScaling(s, local);

        // Normalize rotation basis before euler extract (remove scale)
        const rot = mat4.create();
        mat4.copy(rot, local);
        if (s[0] !== 0) {
            rot[0] /= s[0];
            rot[1] /= s[0];
            rot[2] /= s[0];
        }
        if (s[1] !== 0) {
            rot[4] /= s[1];
            rot[5] /= s[1];
            rot[6] /= s[1];
        }
        if (s[2] !== 0) {
            rot[8] /= s[2];
            rot[9] /= s[2];
            rot[10] /= s[2];
        }

        this.position = { x: t[0], y: t[1], z: t[2] };
        this.scale = { x: s[0], y: s[1], z: s[2] };
        this.rotate = eulerXYZFromMat4(rot);
        this.updateLocalMatrix();
    }

    /** Capture local TRS for undo / restore. */
    captureLocalTransform(): { position: Vec3; rotate: Vec3; scale: Vec3 } {
        return snapshotTRS(this);
    }

    restoreLocalTransform(trs: { position: Vec3; rotate: Vec3; scale: Vec3 }): void {
        this.position = { ...trs.position };
        this.rotate = { ...trs.rotate };
        this.scale = { ...trs.scale };
        this.updateLocalMatrix();
    }

    updateLocalMatrix(): void {
        mat4.identity(this.localMatrix);
        mat4.translate(this.localMatrix, this.localMatrix, [
            this.position.x,
            this.position.y,
            this.position.z,
        ]);

        mat4.rotateX(this.localMatrix, this.localMatrix, this.rotate.x);
        mat4.rotateY(this.localMatrix, this.localMatrix, this.rotate.y);
        mat4.rotateZ(this.localMatrix, this.localMatrix, this.rotate.z);

        mat4.scale(this.localMatrix, this.localMatrix, [
            this.scale.x,
            this.scale.y,
            this.scale.z,
        ]);

        this.updateWorldMatrix();
    }

    updateWorldMatrix(): void {
        if (this.parent) {
            mat4.multiply(this.worldMatrix, this.parent.worldMatrix, this.localMatrix);
        } else {
            mat4.copy(this.worldMatrix, this.localMatrix);
        }

        this.children.forEach((child) => child.updateWorldMatrix());
    }

    getWorldMatrix(): any {
        return this.worldMatrix;
    }

    getWorldPosition(): Vec3 {
        return {
            x: this.worldMatrix[12],
            y: this.worldMatrix[13],
            z: this.worldMatrix[14],
        };
    }

    updateTranslate(deltaX = 0, deltaY = 0, deltaZ = 0): void {
        this.position.x += deltaX;
        this.position.y += deltaY;
        this.position.z += deltaZ;
        this.updateLocalMatrix();
    }

    updateScale(
        scaleX: number | null = null,
        scaleY: number | null = null,
        scaleZ: number | null = null
    ): void {
        if (scaleX !== null) this.scale.x = scaleX;
        if (scaleY !== null) this.scale.y = scaleY;
        if (scaleZ !== null) this.scale.z = scaleZ;
        this.updateLocalMatrix();
    }

    ObjectRotation(): void {
        this.updateLocalMatrix();
    }

    getBoundingBox(): { min: [number, number, number]; max: [number, number, number] } | null {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let hasBounds = false;

        const collect = (node: SceneNode) => {
            // Use cached boundingBox — updateBoundingBox() is called in updateWorldMatrix()
            if ((node as any).boundingBox) {
                const b = (node as any).boundingBox;
                minX = Math.min(minX, b.min[0]);
                minY = Math.min(minY, b.min[1]);
                minZ = Math.min(minZ, b.min[2]);
                maxX = Math.max(maxX, b.max[0]);
                maxY = Math.max(maxY, b.max[1]);
                maxZ = Math.max(maxZ, b.max[2]);
                hasBounds = true;
            }
            if (node.children) {
                for (const child of node.children) {
                    collect(child);
                }
            }
        };

        collect(this);

        if (!hasBounds) return null;
        return {
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
        };
    }

}
