import { furnitureHeight } from "./furniture";
import { bbox, bboxOfPolygons, polygonArea } from "./geometry";
import { buildableRect } from "./measure";
import { amenityColor, currentFacade } from "./templates";
import { ROOM_COLORS } from "./types";
import type { Project, Vec2 } from "./types";

export interface SceneBox {
  id: string;
  kind: "wall" | "lintel" | "sill" | "door" | "glass" | "slab" | "floor" | "stair" | "parapet" | "amenity" | "furniture";
  center: [number, number, number];
  size: [number, number, number];
  rotation: number;
  color: string;
  floorId: string;
  roomId?: string;
}

export interface SceneStair {
  id: string;
  floorId: string;
  rect: { x: number; y: number; width: number; depth: number };
  steps: { center: [number, number, number]; size: [number, number, number] }[];
}

export interface Scene {
  boxes: SceneBox[];
  stairs: SceneStair[];
  plot: { width: number; depth: number; centre: Vec2 };
  buildable: { width: number; depth: number; centre: Vec2 };
  floors: { id: string; name: string; elevation: number; height: number; roomCount: number }[];
  bounds: { width: number; depth: number; height: number };
  northBearing: number;
  facade: { templateId: string; name: string; roof: string; primary: string; accent: string };
  counts: { walls: number; openings: number; rooms: number; boxes: number; amenities: number; furniture: number };
  builtAt: string;
  engineVersion: string;
}

const WALL_COLORS = {
  external_masonry: "#d9d2c3",
  internal_masonry: "#e7e1d4",
  party_wall: "#cfc7b8",
  parapet: "#c9c2b4",
};

function wallAngle(start: Vec2, end: Vec2): number {
  return Math.atan2(end.y - start.y, end.x - start.x);
}

function boxAt(
  id: string,
  kind: SceneBox["kind"],
  start: Vec2,
  end: Vec2,
  y0: number,
  height: number,
  thickness: number,
  color: string,
  floorId: string,
  roomId?: string,
): SceneBox {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  return {
    id,
    kind,
    center: [mid.x, y0 + height / 2, -mid.y],
    size: [len, height, thickness],
    rotation: wallAngle(start, end),
    color,
    floorId,
    roomId,
  };
}

function pointAlong(start: Vec2, end: Vec2, offset: number): Vec2 {
  const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const ux = (end.x - start.x) / len;
  const uy = (end.y - start.y) / len;
  return { x: start.x + ux * offset, y: start.y + uy * offset };
}

export function buildScene(project: Project, options: { includeRoof?: boolean; includeFurniture?: boolean } = {}): Scene {
  const boxes: SceneBox[] = [];
  const stairs: SceneStair[] = [];
  const plotB = bbox(project.site.boundary);
  const build = buildableRect(project);
  const facade = currentFacade(project);
  const palette = facade.template.palette;

  let index = 0;
  for (const floor of project.floors) {
    const base = floor.elevation;

    // Slab under this floor (ground floor slab sits slightly below datum).
    const footprint = bboxOfPolygons(floor.rooms.map((r) => r.polygon));
    const slabW = footprint.maxX - footprint.minX;
    const slabD = footprint.maxY - footprint.minY;
    if (slabW > 0.5 && slabD > 0.5) {
      boxes.push({
        id: `slab-${floor.id}`,
        kind: "slab",
        center: [(footprint.minX + footprint.maxX) / 2, base - 0.075, -(footprint.minY + footprint.maxY) / 2],
        size: [slabW, 0.15, slabD],
        rotation: 0,
        color: "#b9b3a6",
        floorId: floor.id,
      });

      for (const room of floor.rooms) {
        const rb = bbox(room.polygon);
        const w = rb.maxX - rb.minX;
        const d = rb.maxY - rb.minY;
        if (w < 0.2 || d < 0.2) continue;
        boxes.push({
          id: `fin-${room.id}`,
          kind: "floor",
          center: [(rb.minX + rb.maxX) / 2, base + 0.012, -(rb.minY + rb.maxY) / 2],
          size: [Math.max(0.1, w - 0.02), 0.024, Math.max(0.1, d - 0.02)],
          rotation: 0,
          color: ROOM_COLORS[room.type],
          floorId: floor.id,
          roomId: room.id,
        });
      }
    }

    for (const wall of floor.walls) {
      const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      if (len < 0.05) continue;
      const color =
        wall.type === "external_masonry"
          ? palette.primary
          : wall.type === "party_wall"
            ? palette.secondary
            : (WALL_COLORS[wall.type] ?? palette.secondary);
      const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
      let cursor = 0;

      for (const opening of openings) {
        const start = Math.max(0, opening.offset - opening.width / 2);
        const end = Math.min(len, opening.offset + opening.width / 2);
        if (start > cursor + 0.01) {
          boxes.push(
            boxAt(
              `wall-${wall.id}-${index++}`,
              "wall",
              pointAlong(wall.start, wall.end, cursor),
              pointAlong(wall.start, wall.end, start),
              base,
              wall.height,
              wall.thickness,
              color,
              floor.id,
            ),
          );
        }
        // Lintel above the opening.
        const openingTop = opening.sill + opening.height;
        if (openingTop < wall.height - 0.01) {
          boxes.push(
            boxAt(
              `lintel-${wall.id}-${index++}`,
              "lintel",
              pointAlong(wall.start, wall.end, start),
              pointAlong(wall.start, wall.end, end),
              base + openingTop,
              wall.height - openingTop,
              wall.thickness,
              color,
              floor.id,
            ),
          );
        }
        // Sill below a window.
        if (opening.sill > 0.01) {
          boxes.push(
            boxAt(
              `sill-${wall.id}-${index++}`,
              "sill",
              pointAlong(wall.start, wall.end, start),
              pointAlong(wall.start, wall.end, end),
              base,
              opening.sill,
              wall.thickness,
              color,
              floor.id,
            ),
          );
        }
        const mid = pointAlong(wall.start, wall.end, (start + end) / 2);
        if (opening.kind === "door") {
          boxes.push({
            id: `door-${opening.id}`,
            kind: "door",
            center: [mid.x, base + Math.min(opening.height, 2.05) / 2, -mid.y],
            size: [Math.max(0.1, end - start - 0.06), Math.min(opening.height, 2.05), 0.045],
            rotation: wallAngle(wall.start, wall.end),
            color: "#a97b4f",
            floorId: floor.id,
          });
        } else {
          boxes.push({
            id: `glass-${opening.id}`,
            kind: "glass",
            center: [mid.x, base + opening.sill + opening.height / 2, -mid.y],
            size: [Math.max(0.1, end - start - 0.05), opening.height, 0.03],
            rotation: wallAngle(wall.start, wall.end),
            color: "#8fb6c4",
            floorId: floor.id,
          });
        }
        cursor = end;
      }

      if (cursor < len - 0.01) {
        boxes.push(
          boxAt(
            `wall-${wall.id}-${index++}`,
            "wall",
            pointAlong(wall.start, wall.end, cursor),
            pointAlong(wall.start, wall.end, len),
            base,
            wall.height,
            wall.thickness,
            color,
            floor.id,
          ),
        );
      }
    }

    for (const element of floor.elements) {
      if (element.kind !== "stair" || !element.rect) continue;
      const steps = 11;
      const rise = floor.height / steps;
      const run = element.rect.depth / steps;
      const stepBoxes: SceneStair["steps"] = [];
      for (let i = 0; i < steps; i++) {
        stepBoxes.push({
          center: [
            element.rect.x + element.rect.width / 2,
            base + rise * (i + 0.5),
            -(element.rect.y + run * (i + 0.5)),
          ],
          size: [element.rect.width - 0.08, rise, run],
        });
      }
      stairs.push({ id: element.id, floorId: floor.id, rect: element.rect, steps: stepBoxes });
    }
  }

  for (const amenity of project.amenities ?? []) {
    if (amenity.level === "ground" && amenity.rect) {
      const r = amenity.rect;
      boxes.push({
        id: `amenity-${amenity.id}`,
        kind: "amenity",
        center: [r.x + r.width / 2, amenity.kind === "pool" ? 0.02 : 0.05, -(r.y + r.depth / 2)],
        size: [r.width, amenity.kind === "pool" ? 0.16 : 0.08, r.depth],
        rotation: 0,
        color: amenityColor(amenity.kind),
        floorId: project.floors[0]?.id ?? "site",
      });
    }
  }

  if (options.includeRoof) {
    const top = project.floors[project.floors.length - 1];
    if (top) {
      const f = bboxOfPolygons(top.rooms.map((r) => r.polygon));
      boxes.push({
        id: `roof-${top.id}`,
        kind: "parapet",
        center: [(f.minX + f.maxX) / 2, top.elevation + top.height + 0.1, -(f.minY + f.maxY) / 2],
        size: [f.maxX - f.minX + 0.4, 0.2, f.maxY - f.minY + 0.4],
        rotation: 0,
        color: palette.roof,
        floorId: top.id,
      });
      for (const amenity of project.amenities ?? []) {
        if (amenity.level !== "roof") continue;
        boxes.push({
          id: `amenity-${amenity.id}`,
          kind: "amenity",
          center: [(f.minX + f.maxX) / 2, top.elevation + top.height + 0.24, -(f.minY + f.maxY) / 2],
          size: [Math.max(1, f.maxX - f.minX - 1), 0.08, Math.max(1, f.maxY - f.minY - 1)],
          rotation: 0,
          color: amenityColor(amenity.kind),
          floorId: top.id,
        });
      }
    }
  }

  if (options.includeFurniture !== false) {
    for (const item of project.furniture ?? []) {
      const floor = project.floors.find((entry) => entry.id === item.floorId);
      if (!floor) continue;
      const height = furnitureHeight(item.kind);
      boxes.push({
        id: `furniture-${item.id}`,
        kind: "furniture",
        center: [item.rect.x + item.rect.width / 2, floor.elevation + height / 2, -(item.rect.y + item.rect.depth / 2)],
        size: [item.rect.width, height, item.rect.depth],
        rotation: (item.rotation * Math.PI) / 180,
        color: item.color,
        floorId: floor.id,
        roomId: item.roomId,
      });
    }
  }

  const roomCount = project.floors.reduce((s, f) => s + f.rooms.length, 0);
  const wallCount = project.floors.reduce((s, f) => s + f.walls.length, 0);
  const openingCount = project.floors.reduce(
    (s, f) => s + f.walls.reduce((ws, w) => ws + w.openings.length, 0),
    0,
  );
  const totalHeight = project.floors.reduce((s, f) => Math.max(s, f.elevation + f.height), 0);

  return {
    boxes,
    stairs,
    plot: {
      width: plotB.maxX - plotB.minX,
      depth: plotB.maxY - plotB.minY,
      centre: { x: (plotB.minX + plotB.maxX) / 2, y: (plotB.minY + plotB.maxY) / 2 },
    },
    buildable: {
      width: build.x1 - build.x0,
      depth: build.y1 - build.y0,
      centre: { x: (build.x0 + build.x1) / 2, y: (build.y0 + build.y1) / 2 },
    },
    floors: project.floors.map((f) => ({
      id: f.id,
      name: f.name,
      elevation: f.elevation,
      height: f.height,
      roomCount: f.rooms.length,
    })),
    bounds: {
      width: plotB.maxX - plotB.minX,
      depth: plotB.maxY - plotB.minY,
      height: totalHeight,
    },
    northBearing: project.site.northBearing,
    facade: {
      templateId: facade.templateId,
      name: facade.template.name,
      roof: facade.roof,
      primary: palette.primary,
      accent: palette.accent,
    },
    counts: {
      walls: wallCount,
      openings: openingCount,
      rooms: roomCount,
      boxes: boxes.length,
      amenities: (project.amenities ?? []).length,
      furniture: (project.furniture ?? []).length,
    },
    builtAt: new Date().toISOString(),
    engineVersion: "3d-builder@1.0.0",
  };
}

export function sceneSummary(scene: Scene): string {
  return `${scene.counts.boxes} deterministic meshes from ${scene.counts.walls} walls, ${scene.counts.openings} openings and ${scene.counts.rooms} rooms across ${scene.floors.length} floor(s).`;
}

export function roomAreaTotal(scene: Scene): number {
  return scene.boxes.filter((b) => b.kind === "floor").reduce((s, b) => s + b.size[0] * b.size[2], 0);
}

export function polygonAreaSafe(points: Vec2[]): number {
  return polygonArea(points);
}
