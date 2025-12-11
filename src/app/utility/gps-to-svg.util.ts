/**
 * GPS to SVG Coordinate Conversion Utility
 * 
 * Converts GPS coordinates (latitude/longitude) into SVG coordinates
 * for race track visualization in Angular components.
 * 
 * @example
 * ```typescript
 * import { convertGpsToSvg } from './utility/gps-to-svg.util';
 * 
 * // From JSON input
 * const jsonInput = {
 *   "points": [
 *     { "lat": 13.7563, "lng": 100.5018, "afr": 13.2 },
 *     { "lat": 13.7565, "lng": 100.5022, "afr": 13.4 }
 *   ],
 *   "svgWidth": 800,
 *   "svgHeight": 660,
 *   "margin": 50
 * };
 * 
 * const result = convertGpsToSvg(jsonInput);
 * // result.segments - array of line segments for the SVG
 * // result.startPointPx - { x, y } coordinates for the start marker
 * // result.boundingBox - geographic bounds and scale information
 * 
 * // To get JSON output:
 * const jsonOutput = JSON.stringify(result);
 * ```
 */

export interface GpsPoint {
  lat: number;
  lng: number;
  afr?: number;
}

export interface GpsToSvgInput {
  points: GpsPoint[];
  svgWidth: number;
  svgHeight: number;
  margin: number;
}

export interface Segment {
  i: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c: string;
  afr?: number;
}

export interface StartPointPx {
  x: number;
  y: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  scale: number;
  margin: number;
}

export interface GpsToSvgOutput {
  segments: Segment[];
  startPointPx: StartPointPx;
  boundingBox: BoundingBox;
}

/**
 * Converts GPS coordinates to SVG coordinates for race track visualization.
 * 
 * @param input - Input containing GPS points, SVG dimensions, and margin
 * @returns Output with segments, start point, and bounding box information
 */
export function convertGpsToSvg(input: GpsToSvgInput): GpsToSvgOutput {
  const { points, svgWidth, svgHeight, margin } = input;

  // Handle empty or invalid input
  if (!points || points.length === 0) {
    return {
      segments: [],
      startPointPx: { x: 0, y: 0 },
      boundingBox: {
        minLat: 0,
        maxLat: 0,
        minLng: 0,
        maxLng: 0,
        scale: 0,
        margin
      }
    };
  }

  // Filter valid points
  const validPoints = points.filter(p => 
    Number.isFinite(p.lat) && 
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );

  if (validPoints.length === 0) {
    return {
      segments: [],
      startPointPx: { x: 0, y: 0 },
      boundingBox: {
        minLat: 0,
        maxLat: 0,
        minLng: 0,
        maxLng: 0,
        scale: 0,
        margin
      }
    };
  }

  // Step 2: Compute geographic bounding box
  const lats = validPoints.map(p => p.lat);
  const lngs = validPoints.map(p => p.lng);
  
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Step 3: Compute drawable area
  const drawableWidth = svgWidth - 2 * margin;
  const drawableHeight = svgHeight - 2 * margin;

  // Step 4: Compute the scale
  const spanLng = Math.max(0.000001, maxLng - minLng);
  const spanLat = Math.max(0.000001, maxLat - minLat);
  
  const scaleX = drawableWidth / spanLng;
  const scaleY = drawableHeight / spanLat;
  const scale = Math.min(scaleX, scaleY);

  // Step 5: Convert (lat, lng) to SVG coordinates
  const svgPoints = validPoints.map(p => {
    const x = (p.lng - minLng) * scale + margin;
    const y = (maxLat - p.lat) * scale + margin; // invert Y so north is up
    return {
      x,
      y,
      afr: p.afr
    };
  });

  // Step 6: Build array of segments
  const segments: Segment[] = [];
  for (let i = 0; i < svgPoints.length - 1; i++) {
    const p1 = svgPoints[i];
    const p2 = svgPoints[i + 1];
    
    segments.push({
      i,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      c: '#FF0000', // Default red color
      afr: p2.afr // AFR value from the second point (destination)
    });
  }

  // Step 7: Determine the startPointPx (first point)
  const startPointPx: StartPointPx = {
    x: svgPoints[0].x,
    y: svgPoints[0].y
  };

  // Step 8: Return the output
  return {
    segments,
    startPointPx,
    boundingBox: {
      minLat,
      maxLat,
      minLng,
      maxLng,
      scale,
      margin
    }
  };
}

/**
 * Telemetry Point Interface
 */
export interface TelemetryPoint {
  lat: number;
  lon: number;
  AFR?: number;
  RPM?: number;
  timestamp?: string;
}

/**
 * Telemetry to SVG Input Interface
 */
export interface TelemetryToSvgInput {
  width: number;
  height: number;
  margin: number;
  points: TelemetryPoint[];
}

/**
 * Converts telemetry points to SVG polyline with first point centered.
 * Treats lat/lon as arbitrary 2D coordinates (not real GPS).
 * The first point stays at the center of the SVG.
 * 
 * @param input - Input containing telemetry points, SVG dimensions, and margin
 * @returns SVG element as string
 */
export function convertTelemetryToSvgPolyline(input: TelemetryToSvgInput): string {
  const { width, height, margin, points } = input;

  // Handle empty or invalid input
  if (!points || points.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  // Filter valid points
  const validPoints = points.filter(p => 
    Number.isFinite(p.lat) && 
    Number.isFinite(p.lon)
  );

  if (validPoints.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  // Step 1: First point is the origin
  const lat0 = validPoints[0].lat;
  const lon0 = validPoints[0].lon;

  // Step 2: Normalize coordinates relative to first point
  const deltas = validPoints.map(p => ({
    dx: p.lon - lon0,
    dy: p.lat - lat0
  }));

  // Step 3: Compute maximum extents
  const maxAbsDx = Math.max(...deltas.map(d => Math.abs(d.dx)), 1);
  const maxAbsDy = Math.max(...deltas.map(d => Math.abs(d.dy)), 1);

  // Step 4: Compute scale
  const centerX = width / 2;
  const centerY = height / 2;
  const scaleX = maxAbsDx > 0 ? (centerX - margin) / maxAbsDx : 1;
  const scaleY = maxAbsDy > 0 ? (centerY - margin) / maxAbsDy : 1;
  const scale = Math.min(scaleX, scaleY);

  // Step 5: Convert to SVG coordinates
  const svgPoints = deltas.map(d => {
    const x = centerX + d.dx * scale;
    const y = centerY - d.dy * scale; // invert Y so positive dy goes "up"
    return { x, y };
  });

  // Step 6: Create points string for polyline
  const pointsString = svgPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Step 7: Return SVG element
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="black" stroke-width="2" points="${pointsString}"/></svg>`;
}

