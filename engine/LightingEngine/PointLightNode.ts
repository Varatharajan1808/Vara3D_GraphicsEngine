import { LightNode } from "./LightNode";

export class PointLightNode extends LightNode {
    radius: number = 10;

    constructor(name: string = "PointLight") {
        super(name);
        this.type = "PointLight";
    }
}
