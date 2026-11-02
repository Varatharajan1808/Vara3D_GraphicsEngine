import { SceneHierarchyManager } from "../SceneGraph/SceneHierarchyManager";

interface TextureData {
  texture: WebGLTexture | null;
  /** Prefer original URL / data-URL; null when not needed for persistence. */
  base64Image: string | null;
}

export type LoadTextureOptions = {
  /**
   * Re-encode via canvas.toDataURL (expensive). Default false.
   * Prefer passing a data: URL or keeping the source URL instead.
   */
  encodeBase64?: boolean;
};

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

  isPowerOf2(value: number): boolean {
    return (value & (value - 1)) == 0;
  }

  /** Convert a Blob/File to a data URL without re-encoding pixels (keeps original JPEG/PNG bytes). */
  static blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  }

  loadTextureAsync(url: string, options: LoadTextureOptions = {}): Promise<TextureData> {
    if (this.textureCache.has(url)) {
      return Promise.resolve(this.textureCache.get(url)!);
    }

    const encodeBase64 = options.encodeBase64 === true;

    return new Promise((resolve) => {
      const texture = this.gl.createTexture();
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

      // Upload placeholder so the mesh can render immediately
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

        let base64Image: string | null = null;
        if (url.startsWith("data:")) {
          // Already a persistable data URL — no re-encode
          base64Image = url;
        } else if (encodeBase64) {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = image.width;
          canvas.height = image.height;
          ctx?.drawImage(image, 0, 0);
          base64Image = canvas.toDataURL();
        }

        const textureData: TextureData = { texture, base64Image };
        this.textureCache.set(url, textureData);
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
}
