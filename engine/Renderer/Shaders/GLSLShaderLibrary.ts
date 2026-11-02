// --- GLSL MODULAR CHUNKS ---

/**
 * Common Lighting Definitions
 */
const LIGHTING_CONFIG = `
    #define MAX_LIGHTS 10
    #define PI 3.14159265359
`;

/**
 * Shared Vertex Shader Uniforms and Attributes
 */
const VS_BASE_DATA = `
    attribute vec4 aPosition;
    attribute vec3 aVertexNormal;
    attribute vec2 aTextureCoord;
    attribute vec3 aTangent;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_modelCameraMatrix;
    uniform vec3 uCameraPosition;

    varying vec3 vNormal;
    varying vec4 vPosition;
    varying vec3 vWorldPos;
    varying vec2 vTextureCoord;
    varying vec3 vTangent;
    varying vec3 vBitangent;
`;

/**
 * Physically Based Rendering (PBR) Utility Functions
 * Based on Cook-Torrance BRDF and GGX Distribution.
 */
const PBR_UTILS = `
    // Trowbridge-Reitz GGX Normal Distribution Function
    float calculateNDF(vec3 N, vec3 H, float roughness) {
        float alpha = roughness * roughness;
        float alphaSq = max(alpha * alpha, 0.0001);
        float NdotH = max(dot(N, H), 0.0);
        float NdotH2 = NdotH * NdotH;

        float denom = (NdotH2 * (alphaSq - 1.0) + 1.0);
        return alphaSq / (PI * denom * denom);
    }

    // Geometry function (Schlick-GGX)
    float schlickGGX(float NdotV, float roughness) {
        float r = (roughness + 1.0);
        float k = (r * r) / 8.0;
        return NdotV / (NdotV * (1.0 - k) + k);
    }

    // Smith's method for Geometry Shadowing
    float calculateGeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
        float NdotV = max(dot(N, V), 0.0);
        float NdotL = max(dot(N, L), 0.0);
        return schlickGGX(NdotV, roughness) * schlickGGX(NdotL, roughness);
    }

    // Fresnel-Schlick Approximation
    vec3 calculateFresnel(float cosTheta, vec3 F0) {
        return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
    }
`;

/**
 * Tangent Space Utilities
 */
const TBN_UTILS = `
    varying vec3 vTangentViewDir; // Kept for legacy if needed, but World Space is preferred
    
    mat3 computeTBN(vec3 normal, vec3 tangent) {
        vec3 T = normalize(tangent);
        vec3 N = normalize(normal);
        // Gram-Schmidt orthonormalization
        T = normalize(T - dot(T, N) * N);
        vec3 B = cross(N, T);
        
        return mat3(T, B, N);
    }

    vec3 extractCameraPosition(mat4 viewMatrix) {
        vec3 translation = vec3(-viewMatrix[3][0], -viewMatrix[3][1], -viewMatrix[3][2]);
        return vec3(
            viewMatrix[0][0] * translation.x + viewMatrix[1][0] * translation.y + viewMatrix[2][0] * translation.z,
            viewMatrix[0][1] * translation.x + viewMatrix[1][1] * translation.y + viewMatrix[2][1] * translation.z,
            viewMatrix[0][2] * translation.x + viewMatrix[1][2] * translation.y + viewMatrix[2][2] * translation.z
        );
    }
`;

/**
 * Shared Fragment Shader Uniforms
 */
const FS_BASE_UNIFORMS = `
    uniform sampler2D uSampler;
    uniform sampler2D uNormalMap;
    uniform bool uHasTexture;
    uniform bool uHasNormalMap;

    uniform vec3 uColor;
    uniform vec3 uAmbientLightColor;
    uniform vec3 uSpecularLightColor;
    uniform vec3 uDiffuseLightColor;

    uniform float uRoughness;
    uniform float uMetallic;
    uniform float uSpecular;
    uniform float uAlpha;

    uniform float uMetallicFactor;
    uniform float uRoughnessFactor;

    uniform vec3 uEmissionColor;
    uniform float uEmissionIntensity;

    uniform sampler2D uMetallicRoughnessMap;
    uniform sampler2D uEmissiveMap;
    uniform sampler2D uOcclusionMap;

    uniform bool uHasMetallicRoughnessMap;
    uniform bool uHasEmissiveMap;
    uniform bool uHasOcclusionMap;
`;

// --- SHADER SOURCES ---

// We define WebGLShader as string to match the user's previous usage or local typedefs
type WebGLShader = string;

/**
 * UNIFIED SHADER - Supports all light types simultaneously
 * This shader handles Point, Spot, and Directional lights in a single pass
 * to match WebGPU behavior where all lights are rendered together.
 *
 * OPTIMIZED: Light directions calculated in fragment shader to avoid
 * WebGL varying packing limits.
 */
export const UnifiedLightvsShader: WebGLShader = `
    ${LIGHTING_CONFIG}
    ${VS_BASE_DATA}
    ${TBN_UTILS}

    void main() {
        vPosition = u_modelMatrix * aPosition;
        vWorldPos = vec3(vPosition);
        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelCameraMatrix * vPosition;
        vTextureCoord = aTextureCoord;

        vNormal = normalize(mat3(u_modelMatrix) * aVertexNormal);
        // Avoid normalize(0)=NaN when tangent buffer is missing/short (non-cube meshes)
        vec3 tRaw = mat3(u_modelMatrix) * aTangent;
        vTangent = dot(tRaw, tRaw) > 1e-10 ? normalize(tRaw) : vec3(1.0, 0.0, 0.0);
        vBitangent = cross(vNormal, vTangent);
    }
`;

export const UnifiedLightfsShader: WebGLShader = `
    precision highp float;
    ${LIGHTING_CONFIG}
    ${PBR_UTILS}
    
    varying vec3 vNormal;
    varying vec4 vPosition;
    varying vec3 vWorldPos;
    varying vec2 vTextureCoord;
    varying vec3 vTangent;
    varying vec3 vBitangent;

    uniform vec3 uCameraPosition;
    ${FS_BASE_UNIFORMS}

    // Point light uniforms
    uniform highp vec3 uLightPosition[MAX_LIGHTS];
    uniform float uLightRadius[MAX_LIGHTS];
    uniform float uPointLightIntensity[MAX_LIGHTS];
    uniform vec3 uPointLightColor[MAX_LIGHTS];
    
    // Spot light uniforms
    uniform highp vec3 uSpotLightPosition[MAX_LIGHTS];
    uniform vec3 uSpotLightDirection[MAX_LIGHTS];
    uniform float uSpotLightAngle[MAX_LIGHTS];
    uniform float uSpotLightIntensity[MAX_LIGHTS];
    uniform vec3 uSpotLightColor[MAX_LIGHTS];
    
    // Directional light uniforms
    uniform vec3 uLightDirection[MAX_LIGHTS];
    uniform float uDirectionalLightIntensity[MAX_LIGHTS];
    uniform vec3 uDirectionalLightColor[MAX_LIGHTS];

    void main() {
        vec4 texSample = uHasTexture ? texture2D(uSampler, vTextureCoord) : vec4(uColor, 1.0);
        vec3 albedo = texSample.rgb;
        float alpha = texSample.a * uAlpha;

        float roughness = uRoughness * uRoughnessFactor;
        float metallic = uMetallic * uMetallicFactor;

        if (uHasMetallicRoughnessMap) {
            vec4 mrSample = texture2D(uMetallicRoughnessMap, vTextureCoord);
            roughness *= mrSample.g;
            metallic *= mrSample.b;
        }
        
        vec3 ambient = uAmbientLightColor * albedo;
        if (uHasOcclusionMap) {
            ambient *= texture2D(uOcclusionMap, vTextureCoord).r;
        }
        
        vec3 N;
        if (uHasNormalMap) {
            mat3 TBN = mat3(normalize(vTangent), normalize(vBitangent), normalize(vNormal));
            vec3 mapNormal = texture2D(uNormalMap, vTextureCoord).rgb * 2.0 - 1.0;
            N = normalize(TBN * mapNormal);
        } else {
            N = normalize(vNormal);
        }

        vec3 V = normalize(uCameraPosition - vWorldPos);
        vec3 F0 = mix(vec3(0.04), albedo, metallic);

        vec3 Lo = vec3(0.0);

        // Point Lights
        for (int i = 0; i < MAX_LIGHTS; i++) {
            if (uPointLightIntensity[i] <= 0.0) continue;
            
            vec3 L_vec = uLightPosition[i] - vWorldPos;
            float distance = length(L_vec);
            vec3 L = normalize(L_vec);
            vec3 H = normalize(V + L);

            float attenuation = uPointLightIntensity[i] / (1.0 + pow(distance / max(uLightRadius[i], 0.001), 2.0));
            attenuation = clamp(attenuation, 0.0, 1.0);

            float ndf = calculateNDF(N, H, roughness);
            float geo = calculateGeometrySmith(N, V, L, roughness);
            vec3 fresnel = calculateFresnel(max(dot(H, V), 0.0), F0);

            float NdotL = max(dot(N, L), 0.0);
            vec3 kS = fresnel;
            vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

            vec3 diffuse = kD * albedo / PI;
            vec3 specular = (ndf * geo * fresnel) / max(4.0 * max(dot(N, V), 0.0) * NdotL, 0.001);

            Lo += (diffuse + specular * uSpecular) * uPointLightColor[i] * NdotL * attenuation;
        }

        // Spot Lights
        for (int i = 0; i < MAX_LIGHTS; i++) {
            if (uSpotLightIntensity[i] <= 0.0) continue;
            
            vec3 L_vec = uSpotLightPosition[i] - vWorldPos;
            vec3 L = normalize(L_vec);
            vec3 H = normalize(V + L);

            vec3 spotDir = normalize(-uSpotLightDirection[i]);
            float theta = dot(L, spotDir);
            float outerCutOff = cos(uSpotLightAngle[i]);
            float innerCutOff = cos(uSpotLightAngle[i] - radians(5.0));
            float intensity = smoothstep(outerCutOff, innerCutOff, theta);

            if (theta > outerCutOff) {
                float ndf = calculateNDF(N, H, roughness);
                float geo = calculateGeometrySmith(N, V, L, roughness);
                vec3 fresnel = calculateFresnel(max(dot(H, V), 0.0), F0);

                float NdotL = max(dot(N, L), 0.0);
                vec3 specular = (ndf * geo * fresnel) / max(4.0 * max(dot(N, V), 0.0) * NdotL, 0.001);
                vec3 diffuse = (vec3(1.0) - fresnel) * (1.0 - metallic) * albedo / PI;

                Lo += intensity * uSpotLightIntensity[i] * (diffuse + specular * uSpecular) * uSpotLightColor[i] * NdotL;
            }
        }

        // Directional Lights
        for (int i = 0; i < MAX_LIGHTS; i++) {
            if (uDirectionalLightIntensity[i] <= 0.0) continue;
            
            vec3 L = normalize(uLightDirection[i]);
            vec3 H = normalize(V + L);
            float NdotL = max(dot(N, L), 0.0);

            if (NdotL > 0.0) {
                float ndf = calculateNDF(N, H, roughness);
                float geo = calculateGeometrySmith(N, V, L, roughness);
                vec3 fresnel = calculateFresnel(max(dot(H, V), 0.0), F0);

                vec3 specular = (ndf * geo * fresnel) / max(4.0 * max(dot(N, V), 0.0) * NdotL, 0.001);
                vec3 diffuse = (vec3(1.0) - fresnel) * (1.0 - metallic) * albedo / PI;

                Lo += (diffuse + specular * uSpecular) * uDirectionalLightColor[i] * uDirectionalLightIntensity[i] * NdotL;
            }
        }

        vec3 emissive = uEmissionColor * uEmissionIntensity;
        if (uHasEmissiveMap) {
            emissive *= texture2D(uEmissiveMap, vTextureCoord).rgb;
        }

        vec3 color = ambient + Lo + emissive;
        
        color = vec3(1.0) - exp(-color);
        color = pow(color, vec3(1.0/2.2));

        gl_FragColor = vec4(color, alpha);
    }
`;