import { NormalsData } from "../GeometryPrimitives/SurfaceNormalCalculator"; // Replace with actual path
import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";
interface TextureData {
  texture: WebGLTexture | null;
  base64Image: string | null;
}

export class TextureAssetLoader {
  private readonly gl: WebGLRenderingContext;
  private readonly textureCache = new Map<string, TextureData>();
  level: number;
  scene: SceneHierarchyManager;
  internalFormat: number;
  width: number;
  height: number;
  border: number;
  srcFormat: number;
  srcType: number;
  pixel: Uint8Array;
  constructor(gl: WebGLRenderingContext, scene: SceneHierarchyManager) {
    this.scene = scene;
    this.gl = gl;
    this.level = 0;
    this.internalFormat = gl.RGBA;
    this.width = 1;
    this.height = 1;
    this.border = 0;
    this.srcFormat = gl.RGBA;
    this.srcType = gl.UNSIGNED_BYTE;
    this.pixel = new Uint8Array([255, 255, 255, 255]); // white

  }

  loadTexture(gl: WebGLRenderingContext, url: string) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texImage2D(
      gl.TEXTURE_2D,
      this.level,
      this.internalFormat,
      this.width,
      this.height,
      this.border,
      this.srcFormat,
      this.srcType,
      this.pixel
    );

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        this.level,
        this.internalFormat,
        this.srcFormat,
        this.srcType,
        image
      );

      if (this.isPowerOf2(image.width) && this.isPowerOf2(image.height)) {
        gl.generateMipmap(gl.TEXTURE_2D);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
    };
    image.src = url;

    return texture;
  }

  isPowerOf2(value: number): boolean {
    return (value & (value - 1)) == 0;
  }
  loadTextureAsync(url: string): Promise<TextureData> {
    if (this.textureCache.has(url)) {
      return Promise.resolve(this.textureCache.get(url)!);
    }

    return new Promise((resolve) => {
      const texture = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

      // Upload placeholder
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        this.level,
        this.internalFormat,
        this.width,
        this.height,
        this.border,
        this.srcFormat,
        this.srcType,
        this.pixel
      );

      const image = new Image();
    image.crossOrigin = "anonymous";
      image.onload = () => {
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          this.level,
          this.internalFormat,
          this.srcFormat,
          this.srcType,
          image
        );

        if (this.isPowerOf2(image.width) && this.isPowerOf2(image.height)) {
          this.gl.generateMipmap(this.gl.TEXTURE_2D);
        } else {
          this.gl.texParameteri(
            this.gl.TEXTURE_2D,
            this.gl.TEXTURE_WRAP_S,
            this.gl.CLAMP_TO_EDGE
          );
          this.gl.texParameteri(
            this.gl.TEXTURE_2D,
            this.gl.TEXTURE_WRAP_T,
            this.gl.CLAMP_TO_EDGE
          );
          this.gl.texParameteri(
            this.gl.TEXTURE_2D,
            this.gl.TEXTURE_MIN_FILTER,
            this.gl.LINEAR
          );
        }

        // Create base64 from image (safeguarded)
        let base64Image: string | null = null;
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = image.width;
          canvas.height = image.height;
          ctx?.drawImage(image, 0, 0);
          base64Image = canvas.toDataURL("image/png");
        } catch (e) {
          console.warn("[TextureAssetLoader] Could not export canvas to base64:", e);
        }

        const textureData: TextureData = { texture, base64Image: base64Image || url };

        // Cache it
        this.textureCache.set(url, textureData);

        // Resolve!
        resolve(textureData);
      };

      image.onerror = () => {
        console.error("Failed to load texture:", url);
        const fallback: TextureData = {
          texture,
          base64Image: null,
        };
        this.textureCache.set(url, fallback);
        resolve(fallback);
      };

      image.src = url;
    });
  }

  async loadAndCreateMesh(
    mesh: any,
    options: {
      imageUrl?: string | null;
      normalImageUrl?: string | null;
      geometry: any;
      material: any;
      normals?: any;
    }
  ): Promise<void> {
    const {
      imageUrl,
      normalImageUrl,
      geometry,
      material,
      normals = NormalsData,
    } = options;

    let base64Image: string | null = null;

    if (imageUrl) {
      const textureData = await this.loadTextureAsync(imageUrl);
      base64Image = textureData.base64Image;
      mesh.image = base64Image;
      mesh.texture = textureData.texture; // Optional: keep WebGL texture reference
    }

    if (normalImageUrl) {
      const normalData = await this.loadTextureAsync(normalImageUrl);
      base64Image = normalData.base64Image;
      mesh.normalMapImage = base64Image;
      mesh.normalMapTexture = normalData.texture;
    }

    // Update mesh properties
    mesh.geometry = geometry;
    mesh.material = material;
    mesh.normals = normals;
  }

  async loadAllMeshes(scene: { objects: any[] }): Promise<void> {
    const existingMeshes = scene.objects;
    const meshPromises = existingMeshes.map((mesh) =>
      this.loadAndCreateMesh(mesh, {
        imageUrl: mesh.textureURL || null,
        normalImageUrl: mesh.normalMapURL || null,
        geometry: mesh.geometry,
        material: mesh.material,
        normals: mesh.normals || NormalsData,
      })
    );

    await Promise.all(meshPromises); // Load all textures in parallel
  }
}
