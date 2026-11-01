import { polygonArea, polygonExtents, polygonPerimeter } from "./geometry";
import { projectMetrics } from "./measure";
import { ROOM_LABELS } from "./types";
import type { Project } from "./types";

export interface AreaScheduleRow {
  floorId: string;
  floor: string;
  roomId: string;
  room: string;
  type: string;
  area: number;
  perimeter: number;
  width: number;
  depth: number;
  targetArea?: number;
  variance?: number;
  direction: string;
  vastuTags: string[];
}

export interface AreaSchedule {
  rows: AreaScheduleRow[];
  totals: {
    plotArea: number;
    groundCoverage: number;
    coverageRatio: number;
    totalBuiltUp: number;
    totalCarpet: number;
    fsi: number;
    roomCount: number;
  };
  definitions: { term: string; definition: string }[];
  generatedAt: string;
}

export function areaSchedule(project: Project): AreaSchedule {
  const metrics = projectMetrics(project);
  const rows: AreaScheduleRow[] = [];
  for (const floor of project.floors) {
    const floorMetric = metrics.floors.find((f) => f.floorId === floor.id);
    const roomMetrics = floorMetric?.rooms ?? [];
    for (const room of floor.rooms) {
      const m = roomMetrics.find((r) => r.roomId === room.id);
      const ext = polygonExtents(room.polygon);
      rows.push({
        floorId: floor.id,
        floor: floor.name,
        roomId: room.id,
        room: room.name,
        type: ROOM_LABELS[room.type],
        area: Math.round(polygonArea(room.polygon) * 100) / 100,
        perimeter: Math.round(polygonPerimeter(room.polygon) * 100) / 100,
        width: Math.round(ext.width * 100) / 100,
        depth: Math.round(ext.depth * 100) / 100,
        targetArea: room.targetArea,
        variance:
          room.targetArea && room.targetArea > 0
            ? Math.round(((polygonArea(room.polygon) - room.targetArea) / room.targetArea) * 1000) / 10
            : undefined,
        direction: m?.direction ?? "—",
        vastuTags: room.vastuTags,
      });
    }
  }

  return {
    rows,
    totals: {
      plotArea: metrics.plotArea,
      groundCoverage: metrics.groundCoverage,
      coverageRatio: metrics.groundCoverageRatio,
      totalBuiltUp: metrics.totalBuiltUp,
      totalCarpet: metrics.totalCarpet,
      fsi: metrics.fsi,
      roomCount: metrics.roomCount,
    },
    definitions: [
      { term: "Plot area", definition: "Area inside the surveyed plot boundary." },
      { term: "Ground coverage", definition: "Ground-floor built-up footprint divided by plot area." },
      { term: "Built-up area", definition: "Union of room polygons and wall footprints per floor (10 cm raster, +/- 1%)." },
      { term: "Carpet / net room area", definition: "Sum of clear room polygons; excludes walls, shafts and balconies beyond their clear polygon." },
      { term: "FSI / FAR", definition: "Total built-up area across floors divided by plot area." },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export interface OpeningScheduleRow {
  floor: string;
  wallId: string;
  openingId: string;
  kind: string;
  label: string;
  width: number;
  height: number;
  sill: number;
  hostWall: string;
  wallType: string;
}

export function openingSchedule(project: Project): OpeningScheduleRow[] {
  const rows: OpeningScheduleRow[] = [];
  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      for (const opening of wall.openings) {
        const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
        rows.push({
          floor: floor.name,
          wallId: wall.id,
          openingId: opening.id,
          kind: opening.kind,
          label: opening.label ?? opening.kind,
          width: opening.width,
          height: opening.height,
          sill: opening.sill,
          hostWall: `${wall.start.x.toFixed(2)}, ${wall.start.y.toFixed(2)} → ${wall.end.x.toFixed(2)}, ${wall.end.y.toFixed(2)} (${len.toFixed(2)} m)`,
          wallType: wall.type,
        });
      }
    }
  }
  return rows;
}
