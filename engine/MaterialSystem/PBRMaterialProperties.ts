export class PBRMaterialProperties {
  color: [number, number, number];
  metallic: number;
  roughness: number;
  specular: number;
  alpha: number;
  emissionColor: [number, number, number];
  emissionIntensity: number;

  constructor(
    color: [number, number, number] = [1.0, 1.0, 1.0],
    metallic: number = 0.0,
    roughness: number = 0.5,
    specular: number = 32.0,
    alpha: number = 1.0,
    emissionColor: [number, number, number] = [0.0, 0.0, 0.0],
    emissionIntensity: number = 0.0,
  ) {
    this.color = color;
    this.metallic = metallic;
    this.roughness = roughness;
    this.specular = specular;
    this.alpha = alpha;
    this.emissionColor = emissionColor;
    this.emissionIntensity = emissionIntensity;
  }

  BaseColors() {
    return {
      red: [1.0, 0.0, 0.0] as [number, number, number],
      pink: [1.0, 0.5, 0.9] as [number, number, number],
      yellow: [1.0, 1.0, 0.0] as [number, number, number],
      grey: [0.4, 0.4, 0.4] as [number, number, number],
      silver: [0.75, 0.75, 0.75] as [number, number, number],
      skyBlue: [0.1, 0.8, 0.9] as [number, number, number],
      orange: [1.0, 0.4, 0.1] as [number, number, number],
      purple: [0.5, 0.0, 0.8] as [number, number, number],
      white: [1.0, 1.0, 1.0] as [number, number, number],
      black: [0.0, 0.0, 0.0] as [number, number, number],
      green: [0.0, 1.0, 0.0] as [number, number, number],
      blue: [0.0, 0.0, 1.0] as [number, number, number],
      brown: [0.65, 0.16, 0.16] as [number, number, number],
    };
  }

  getMaterialProperties(params: {
    color?: [number, number, number];
    metallic?: number;
    roughness?: number;
    specular?: number;
    alpha?: number;
    emissionColor?: [number, number, number];
    emissionIntensity?: number;
  }): PBRMaterialProperties {
    return new PBRMaterialProperties(
      params.color ?? this.color,
      params.metallic ?? this.metallic,
      params.roughness ?? this.roughness,
      params.specular ?? this.specular,
      params.alpha ?? this.alpha,
      params.emissionColor ?? this.emissionColor,
      params.emissionIntensity ?? this.emissionIntensity
    );
  }
}
