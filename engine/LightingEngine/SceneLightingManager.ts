import { uuidv4 } from "../IdentifierSystem/UniqueIdentifierGenerator";

interface BaseLightData {
    ambient: Float32Array | null;
    diffuse: Float32Array | null;
    specular: Float32Array | null;
}

interface PointLightData {
    position: Float32Array[];
    radius: number[];
    color: Float32Array[];
    intensity: number[];
}

interface SpotLightData {
    position: Float32Array[];
    direction: Float32Array[];
    angle: number[];
    color: Float32Array[];
    intensity: number[];
}

interface DirectionalLightData {
    direction: Float32Array[];
    color: Float32Array[];
    intensity: number[];
}

interface LightData {
    baselight: BaseLightData;
    point: PointLightData;
    spot: SpotLightData;
    directional: DirectionalLightData;
}

interface BaseLightParams {
    ambientLight: number[];
    diffuseLight: number[];
    specularLight: number[];
}

interface PointLightParams {
    lightPosition: number[];
    radius: number;
    lightColor: number[];
    intensity: number;
}

interface SpotLightParams {
    lightPosition: number[];
    spotLightDirection: number[];
    spotLightAngle: number;
    lightColor: number[];
    intensity: number;
}

interface DirectionalLightParams {
    lightDirection: number[];
    lightColor: number[];
    intensity: number;
}

export class SceneLightingManager {
    uuid: string;
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    lightType: string | null;
    lightData: LightData;

    constructor(gl: WebGLRenderingContext, program: WebGLProgram) {
        this.uuid = uuidv4();
        this.gl = gl;
        this.program = program;
        this.lightType = null;

        // Initialize light data structure with pre-allocated arrays
        this.lightData = {
            baselight: {
                ambient: null,
                diffuse: null,
                specular: null
            },
            point: {
                position: [],
                radius: [],
                color: [],
                intensity: []
            },
            spot: {
                position: [],
                direction: [],
                angle: [],
                color: [],
                intensity: []
            },
            directional: {
                direction: [],
                color: [],
                intensity: []
            }
        };
    }

    BaseLight({ ambientLight, diffuseLight, specularLight }: BaseLightParams): void {
        const { baselight } = this.lightData;
        baselight.ambient = new Float32Array(ambientLight);
        baselight.diffuse = new Float32Array(diffuseLight);
        baselight.specular = new Float32Array(specularLight);
    }

    PointLight({ lightPosition, radius, lightColor, intensity }: PointLightParams): void {
        const { point } = this.lightData;
        point.position.push(new Float32Array(lightPosition));
        point.radius.push(radius);
        point.color.push(new Float32Array(lightColor));
        point.intensity.push(intensity);
    }

    SpotLight({ lightPosition, spotLightDirection, spotLightAngle, lightColor, intensity }: SpotLightParams): void {
        const { spot } = this.lightData;
        spot.position.push(new Float32Array(lightPosition));
        spot.direction.push(new Float32Array(spotLightDirection));
        spot.angle.push(spotLightAngle);
        spot.color.push(new Float32Array(lightColor));
        spot.intensity.push(intensity);
    }

    DirectionalLight({ lightDirection, lightColor, intensity }: DirectionalLightParams): void {
        const { directional } = this.lightData;
        directional.direction.push(new Float32Array(lightDirection));
        directional.color.push(new Float32Array(lightColor));
        directional.intensity.push(intensity);
    }
}