import { mat4, vec3, quat } from "../MathLibrary/gl-matrix";
import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

export type Vec3 = { x: number; y: number; z: number };

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

    setParent(parent: SceneNode | null) {
        if (this.parent === parent) return;

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
        }

        this.updateWorldMatrix();
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
}
