import * as fflate from "fflate";

export class ZipArchiveLoader {
  /**
   * Unzips a .zip archive and returns a Map of filename -> File objects.
   * Both basename ("scene.bin") and relative path ("textures/diffuse.png")
   * are stored in the Map so GLTFAssetLoader can resolve external references.
   */
  static async unzipModelArchive(zipFile: File): Promise<Map<string, File>> {
    const arrayBuffer = await zipFile.arrayBuffer();
    const u8 = new Uint8Array(arrayBuffer);

    return new Promise((resolve, reject) => {
      fflate.unzip(u8, (err, unzipped) => {
        if (err) {
          return reject(new Error(`Failed to extract ZIP archive: ${err.message}`));
        }

        const fileMap = new Map<string, File>();

        for (const [relativePath, data] of Object.entries(unzipped)) {
          // Skip directory entries or empty items
          if (relativePath.endsWith("/") || data.length === 0) continue;

          const fileName = relativePath.split("/").pop() || relativePath;
          const mimeType = ZipArchiveLoader.getMimeType(fileName);
          const file = new File([data], fileName, { type: mimeType });

          // Store both fileName ("diffuse.png") and relativePath ("textures/diffuse.png")
          fileMap.set(fileName, file);
          fileMap.set(relativePath, file);
        }

        resolve(fileMap);
      });
    });
  }

  static getMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png":
        return "image/png";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "webp":
        return "image/webp";
      case "bin":
        return "application/octet-stream";
      case "gltf":
        return "application/json";
      case "glb":
        return "model/gltf-binary";
      default:
        return "application/octet-stream";
    }
  }
}

