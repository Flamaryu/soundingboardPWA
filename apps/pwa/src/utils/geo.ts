/**
 * Verifies if a coordinate point [lng, lat] falls within a standard GeoJSON Polygon ring structure.
 */
export function isPointInPolygon(point: [number, number], polygon: number[][][]): boolean {
  const [lng, lat] = point;
  let inside = false;
  
  // Outer boundary ring is always index 0
  const ring = polygon[0];
  if (!ring) return false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Verifies if a coordinate point [lng, lat] falls within a GeoJSON MultiPolygon array.
 */
export function isPointInMultiPolygon(point: [number, number], multiPolygon: number[][][][]): boolean {
  return multiPolygon.some(polygon => isPointInPolygon(point, polygon));
}
