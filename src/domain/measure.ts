import {
  bbox,
  bboxArea,
  bboxCenter,
  bboxDepth,
  bboxWidth,
  directionOf,
  polygonArea,
  polygonCentroid,
  polygonExtents,
  polygonPerimeter,
  unionArea,
  wallFootprint,
} from "./geometry";
import type {
  Floor,
  FloorMetrics,
  Project,
  ProjectMetrics,
  Room,
  RoomMetrics,
} from "./types";

export function roomMetrics(room: Room, centre: { x: number; y: number }, northBearing: number): RoomMetrics {
  const ext = polygonExtents(room.polygon);
  const centroid = polygonCentroid(room.polygon);
  return {
    roomId: room.id,
    name: room.name,
    type: room.type,
    area: Math.round(polygonArea(room.polygon) * 100) / 100,
    perimeter: Math.round(polygonPerimeter(room.polygon) * 100) / 100,
    width: Math.round(ext.width * 100) / 100,
    depth: Math.round(ext.depth * 100) / 100,
    centroid,
    direction: directionOf(centroid, centre, northBearing).sector,
  };
}

/**
 * Built-up area = union of clear room polygons and wall footprints, measured on
 * a 10 cm raster. Documented tolerance: +/- 1% of floor area. Exact polygon
 * booleans are a Phase 1 geometry-kernel upgrade.
 */
export function floorMetrics(project: Project, floor: Floor): FloorMetrics {
  const siteCentre = bboxCenter(bbox(project.site.boundary));
  const rooms = floor.rooms.map((r) => roomMetrics(r, siteCentre, project.site.northBearing));
  const roomArea = rooms.reduce((sum, r) => sum + r.area, 0);
  const wallPolys: { x: number; y: number }[][] = [];
  let wallLength = 0;
  let wallVolume = 0;
  for (const wall of floor.walls) {
    const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    wallLength += len;
    const openingVolume = wall.openings.reduce((s, o) => s + o.width * o.height * wall.thickness, 0);
    wallVolume += Math.max(0, len * wall.height * wall.thickness - openingVolume);
    const fp = wallFootprint(wall.start, wall.end, wall.thickness);
    if (fp.length === 4) wallPolys.push(fp);
  }
  const roomPolys = floor.rooms.map((r) => r.polygon);
  const builtUpArea = unionArea([...roomPolys, ...wallPolys], 0.1);
  return {
    floorId: floor.id,
    name: floor.name,
    level: floor.level,
    roomArea: Math.round(roomArea * 100) / 100,
    wallLength: Math.round(wallLength * 100) / 100,
    wallVolume: Math.round(wallVolume * 1000) / 1000,
    builtUpArea,
    carpetArea: Math.round(roomArea * 100) / 100,
    rooms,
  };
}

export function buildableBounds(project: Project): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const b = bbox(project.site.boundary);
  const s = project.site.setbacks;
  return {
    minX: b.minX + s.left,
    minY: b.minY + s.front,
    maxX: b.maxX - s.right,
    maxY: b.maxY - s.rear,
  };
}

export function buildableRect(project: Project): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const b = buildableBounds(project);
  return { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY };
}

export function projectMetrics(project: Project): ProjectMetrics {
  const floors = project.floors.map((f) => floorMetrics(project, f));
  const plotArea = Math.round(polygonArea(project.site.boundary) * 100) / 100;
  const groundCoverage = floors[0]?.builtUpArea ?? 0;
  const totalBuiltUp = Math.round(floors.reduce((s, f) => s + f.builtUpArea, 0) * 100) / 100;
  const totalCarpet = Math.round(floors.reduce((s, f) => s + f.carpetArea, 0) * 100) / 100;
  const buildable = buildableRect(project);
  const doors = project.floors.reduce(
    (s, f) => s + f.walls.reduce((ws, w) => ws + w.openings.filter((o) => o.kind === "door").length, 0),
    0,
  );
  const windows = project.floors.reduce(
    (s, f) => s + f.walls.reduce((ws, w) => ws + w.openings.filter((o) => o.kind === "window").length, 0),
    0,
  );
  return {
    plotArea,
    groundCoverage,
    groundCoverageRatio: plotArea > 0 ? Math.round((groundCoverage / plotArea) * 1000) / 1000 : 0,
    totalBuiltUp,
    totalCarpet,
    fsi: plotArea > 0 ? Math.round((totalBuiltUp / plotArea) * 100) / 100 : 0,
    buildableArea: Math.round(Math.max(0, buildable.x1 - buildable.x0) * Math.max(0, buildable.y1 - buildable.y0) * 100) / 100,
    floors,
    wallLengthTotal: Math.round(floors.reduce((s, f) => s + f.wallLength, 0) * 100) / 100,
    doorCount: doors,
    windowCount: windows,
    roomCount: project.floors.reduce((s, f) => s + f.rooms.length, 0),
    northBearing: project.site.northBearing,
    methods: {
      roomArea: "Shoelace area of the clear room polygon (exact for the stored vertices).",
      builtUp: "Union of room polygons and wall footprints, 10 cm deterministic raster (tolerance +/- 1%).",
    },
  };
}

/** Convenience for overlays: plot rect dimensions in metres. */
export function plotSize(project: Project): { width: number; depth: number; centre: { x: number; y: number } } {
  const b = bbox(project.site.boundary);
  return { width: bboxWidth(b), depth: bboxDepth(b), centre: bboxCenter(b) };
}
