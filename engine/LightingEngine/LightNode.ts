import { SceneNode } from "../SceneGraph/SceneNode";

export class LightNode extends SceneNode {
    color: [number, number, number] = [1, 1, 1];
    intensity: number = 1;

    constructor(name: string = "Light") {
        super(name);
        this.type = "Light";
    }
}
