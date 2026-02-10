import { LightNode } from "./LightNode";

export class DirectionalLightNode extends LightNode {
    direction: [number, number, number] = [0, -1, 0];

    constructor(name: string = "DirectionalLight") {
        super(name);
        this.type = "DirectionalLight";
    }
}
