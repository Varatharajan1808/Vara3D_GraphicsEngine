interface BoundingSphere {
  center: [number, number, number];
  radius: number;
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

  // Extract the planes from the view projection matrix
  for (let i = 0; i < 6; i++) {
    const sign: number = i % 2 === 0 ? 1 : -1;
    const col: number = Math.floor(i / 2);

    planes[i] = [
      viewProjectionMatrix[3] + sign * viewProjectionMatrix[col],
      viewProjectionMatrix[7] + sign * viewProjectionMatrix[col + 4],
      viewProjectionMatrix[11] + sign * viewProjectionMatrix[col + 8],
      viewProjectionMatrix[15] + sign * viewProjectionMatrix[col + 12],
    ];

    // Normalize the plane
    const length: number = Math.hypot(planes[i][0], planes[i][1], planes[i][2]);
    planes[i] = planes[i].map((val) => val / length);
  }

  return planes;
}
export function isSphereInFrustum(
  planes: number[][],
  sphere: BoundingSphere
): boolean {
  if (!planes || !sphere || !sphere.center) return true; // Skip culling if data is invalid
  return planes.every(
    (plane) =>
      plane[0] * sphere.center[0] +
        plane[1] * sphere.center[1] +
        plane[2] * sphere.center[2] +
        plane[3] >=
      -sphere.radius
  );
}