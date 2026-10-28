export interface BoundingSphere {
  center: [number, number, number] | number[];
  radius: number;
}

export interface BoundingBox {
  min: [number, number, number] | number[];
  max: [number, number, number] | number[];
}

export function createBoundingSphere(
  center: [number, number, number],
  radius: number
): BoundingSphere {
  return { center, radius };
}

export function extractFrustumPlanes(
  viewProjectionMatrix: Float32Array | number[]
): number[][] {
  let planes: number[][] = new Array(6);

  // Extract the planes from the view projection matrix using Gribb-Hartmann method
  for (let i = 0; i < 6; i++) {
    const sign: number = i % 2 === 0 ? 1 : -1;
    const col: number = Math.floor(i / 2);

    planes[i] = [
      viewProjectionMatrix[3] + sign * viewProjectionMatrix[col],
      viewProjectionMatrix[7] + sign * viewProjectionMatrix[col + 4],
      viewProjectionMatrix[11] + sign * viewProjectionMatrix[col + 8],
      viewProjectionMatrix[15] + sign * viewProjectionMatrix[col + 12],
    ];

    // Normalize the plane so (A, B, C) has unit length
    const length: number = Math.hypot(planes[i][0], planes[i][1], planes[i][2]);
    if (length > 0.000001) {
      planes[i] = planes[i].map((val) => val / length);
    }
  }

  return planes;
}

export function isSphereInFrustum(
  planes: number[][],
  sphere: BoundingSphere
): boolean {
  if (!planes || planes.length < 6 || !sphere || !sphere.center) return true; // Skip culling if data is invalid
  const center = sphere.center;
  const radius = sphere.radius;
  for (let i = 0; i < 6; i++) {
    const plane = planes[i];
    const distance =
      plane[0] * center[0] +
      plane[1] * center[1] +
      plane[2] * center[2] +
      plane[3];
    if (distance < -radius) {
      return false; // Outside this plane
    }
  }
  return true;
}

export function isAABBInFrustum(
  planes: number[][],
  min: [number, number, number] | number[],
  max: [number, number, number] | number[]
): boolean {
  if (!planes || planes.length < 6 || !min || !max) return true;

  for (let i = 0; i < 6; i++) {
    const plane = planes[i];
    const a = plane[0];
    const b = plane[1];
    const c = plane[2];
    const d = plane[3];

    // Find the p-vertex (the corner in the direction of the plane normal)
    const px = a > 0 ? max[0] : min[0];
    const py = b > 0 ? max[1] : min[1];
    const pz = c > 0 ? max[2] : min[2];

    // If the p-vertex is outside the plane, the entire bounding box is outside the frustum
    if (a * px + b * py + c * pz + d < -0.001) {
      return false;
    }
  }

  return true;
}
