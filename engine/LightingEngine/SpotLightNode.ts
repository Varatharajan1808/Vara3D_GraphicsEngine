import { LightNode } from "./LightNode";

export class SpotLightNode extends LightNode {
    direction: [number, number, number] = [0, 0, -1];
    angle: number = Math.PI / 4;

    constructor(name: string = "SpotLight") {
        super(name);
        this.type = "SpotLight";
    }
}
