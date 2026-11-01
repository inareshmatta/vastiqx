import {
  add,
  bbox,
  distance,
  isOrthogonalPolygon,
  pointInPolygon,
  polygonArea,
  polygonOverlapArea,
  polygonSelfIntersects,
  rectPolygon,
  samePoint,
} from "@/domain/geometry";
import { buildableRect } from "@/domain/measure";
import { newId } from "@/domain/project";
import type { Floor, Opening, Project, Room, RoomType, Vec2, Wall } from "@/domain/types";
import { ToolError } from "./types";

export function wallLength(wall: Wall): number {
  return distance(wall.start, wall.end);
}

export function findWall(project: Project, wallId: string): { floor: Floor; wall: Wall } {
  for (const floor of project.floors) {
    const wall = floor.walls.find((w) => w.id === wallId);
    if (wall) return { floor, wall };
  }
  throw new ToolError("MISSING_INPUT", `Wall ${wallId} was not found in this project.`, {
    hints: ["Read the floor with get_floors and use an existing wall id."],
  });
}

export function findRoom(project: Project, roomId: string): { floor: Floor; room: Room } {
  for (const floor of project.floors) {
    const room = floor.rooms.find((r) => r.id === roomId);
    if (room) return { floor, room };
  }
  throw new ToolError("MISSING_INPUT", `Room ${roomId} was not found in this project.`, {
    hints: ["Read the floors with get_floors and use an existing room id."],
  });
}

export function roomByName(project: Project, name: string): { floor: Floor; room: Room } {
  const lower = name.toLowerCase();
  for (const floor of project.floors) {
    const room = floor.rooms.find((r) => r.name.toLowerCase() === lower);
    if (room) return { floor, room };
  }
  for (const floor of project.floors) {
    const room = floor.rooms.find((r) => r.name.toLowerCase().includes(lower));
    if (room) return { floor, room };
  }
  throw new ToolError("MISSING_INPUT", `No room matching "${name}" exists.`, {
    hints: ["Use an exact room name from the area schedule."],
  });
}

export function findOpening(
  project: Project,
  openingId: string,
): { floor: Floor; wall: Wall; opening: Opening } {
  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      const opening = wall.openings.find((o) => o.id === openingId);
      if (opening) return { floor, wall, opening };
    }
  }
  throw new ToolError("MISSING_INPUT", `Opening ${openingId} was not found.`);
}

export function resolveFloor(project: Project, floorId?: string): Floor {
  if (floorId) {
    const floor = project.floors.find((f) => f.id === floorId);
    if (!floor) throw new ToolError("MISSING_INPUT", `Floor ${floorId} does not exist.`);
    return floor;
  }
  return project.floors[0]!;
}

export function recomputeSite(project: Project): void {
  project.site.area = Math.round(polygonArea(project.site.boundary) * 100) / 100;
}

export function nearBoundary(project: Project, side: "north" | "south" | "east" | "west", value: number): boolean {
  const plate = buildableRect(project);
  const tol = 0.2;
  if (side === "west") return Math.abs(value - plate.x0) < tol;
  if (side === "east") return Math.abs(value - plate.x1) < tol;
  if (side === "south") return Math.abs(value - plate.y0) < tol;
  return Math.abs(value - plate.y1) < tol;
}

export function wallKey(a: Vec2, b: Vec2): string {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const p1 = `${r(a.x)},${r(a.y)}`;
  const p2 = `${r(b.x)},${r(b.y)}`;
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

export function findWallBySegment(floor: Floor, a: Vec2, b: Vec2): Wall | null {
  const key = wallKey(a, b);
  return floor.walls.find((w) => wallKey(w.start, w.end) === key) ?? null;
}

export interface RectInput {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface AddRoomResult {
  room: Room;
  walls: Wall[];
  createdWallIds: string[];
}

/**
 * Adds a room whose rect is the outside structural rectangle. Four semantic
 * walls are created (or reused when a baseline already exists), and the room's
 * clear polygon is inset by half the wall thickness on each side.
 */
export function addRoomWithWalls(
  project: Project,
  floor: Floor,
  rect: RectInput,
  name: string,
  type: RoomType,
  options: { thickness?: number; height?: number; source?: "manual" | "agent" | "generated" } = {},
): AddRoomResult {
  if (rect.width < 0.9 || rect.depth < 0.9) {
    throw new ToolError("INVALID_GEOMETRY", "Rooms must be at least 0.9 m x 0.9 m.", {
      hints: ["Increase the rectangle dimensions."],
    });
  }
  const structural = { x0: rect.x, y0: rect.y, x1: rect.x + rect.width, y1: rect.y + rect.depth };
  const candidatePoly = rectPolygon(structural.x0, structural.y0, structural.x1, structural.y1);
  for (const existing of floor.rooms) {
    const overlap = polygonOverlapArea(candidatePoly, existing.polygon, 0.05);
    if (overlap > 0.2) {
      throw new ToolError(
        "ROOM_OVERLAP",
        `The new room would overlap "${existing.name}" by ${overlap.toFixed(2)} m2.`,
        { hints: ["Move or resize the existing room, or choose a free rectangle."] },
      );
    }
  }

  const thickness = options.thickness ?? 0.115;
  const source = options.source ?? "manual";
  const height = options.height ?? Math.max(2.4, floor.height - 0.05);
  const createdWallIds: string[] = [];
  const walls: Wall[] = [];

  const sides: { side: "north" | "south" | "east" | "west"; a: Vec2; b: Vec2 }[] = [
    { side: "south", a: { x: structural.x0, y: structural.y0 }, b: { x: structural.x1, y: structural.y0 } },
    { side: "north", a: { x: structural.x0, y: structural.y1 }, b: { x: structural.x1, y: structural.y1 } },
    { side: "west", a: { x: structural.x0, y: structural.y0 }, b: { x: structural.x0, y: structural.y1 } },
    { side: "east", a: { x: structural.x1, y: structural.y0 }, b: { x: structural.x1, y: structural.y1 } },
  ];

  const sideThickness: Record<string, number> = {};
  for (const { side, a, b } of sides) {
    const existing = findWallBySegment(floor, a, b);
    if (existing) {
      walls.push(existing);
      sideThickness[side] = existing.thickness;
    } else {
      const external = nearBoundary(project, side, side === "east" ? b.x : side === "north" ? b.y : side === "west" ? a.x : a.y);
      const t = external ? Math.max(0.2, thickness) : thickness;
      sideThickness[side] = t;
      const wall: Wall = {
        id: newId("wl"),
        start: a,
        end: b,
        thickness: t,
        height,
        type: external ? "external_masonry" : "internal_masonry",
        material: external ? "AAC block 200 mm" : "AAC block 100 mm",
        openings: [],
        source,
      };
      floor.walls.push(wall);
      walls.push(wall);
      createdWallIds.push(wall.id);
    }
  }

  const clear = {
    x0: structural.x0 + (sideThickness.west ?? thickness) / 2,
    y0: structural.y0 + (sideThickness.south ?? thickness) / 2,
    x1: structural.x1 - (sideThickness.east ?? thickness) / 2,
    y1: structural.y1 - (sideThickness.north ?? thickness) / 2,
  };
  const room: Room = {
    id: newId("rm"),
    name,
    type,
    polygon: rectPolygon(clear.x0, clear.y0, clear.x1, clear.y1),
    targetArea: Math.round(polygonArea(rectPolygon(clear.x0, clear.y0, clear.x1, clear.y1)) * 10) / 10,
    vastuTags: [],
    source,
  };
  floor.rooms.push(room);
  return { room, walls, createdWallIds };
}

/**
 * Reflect a wall translation / endpoint edit into adjacent orthogonal room
 * polygons. Non-orthogonal edits and T-junction trimming are not silently
 * approximated: they raise a constraint error instead.
 */
export function applyWallChangeToRooms(
  floor: Floor,
  wall: Wall,
  newStart: Vec2,
  newEnd: Vec2,
): { adjustedRoomIds: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const adjusted: string[] = [];
  const oldStart = wall.start;
  const oldEnd = wall.end;
  const horizontal = Math.abs(oldStart.y - oldEnd.y) < 0.02;
  const vertical = Math.abs(oldStart.x - oldEnd.x) < 0.02;
  const oldLen = distance(oldStart, oldEnd);
  const newLen = distance(newStart, newEnd);

  if (!horizontal && !vertical) {
    return { adjustedRoomIds: [], warnings: ["Room polygons were not re-derived for a non-orthogonal wall edit."] };
  }

  const delta = { x: newStart.x - oldStart.x, y: newStart.y - oldStart.y };
  const translated =
    samePoint(newEnd, { x: oldEnd.x + delta.x, y: oldEnd.y + delta.y }, 0.001) &&
    Math.abs(newLen - oldLen) < 0.001;

  const wallMin = {
    x: Math.min(oldStart.x, oldEnd.x),
    y: Math.min(oldStart.y, oldEnd.y),
  };
  const wallMax = {
    x: Math.max(oldStart.x, oldEnd.x),
    y: Math.max(oldStart.y, oldEnd.y),
  };

  if (translated) {
    const perpendicular = horizontal ? delta.y : delta.x;
    const along = horizontal ? delta.x : delta.y;
    if (Math.abs(along) > 0.3) {
      return {
        adjustedRoomIds: [],
        warnings: ["Wall moved along its own axis; room polygons were left unchanged. Use resize_room for area changes."],
      };
    }
    if (Math.abs(perpendicular) < 0.001) return { adjustedRoomIds: [], warnings: [] };

    for (const room of floor.rooms) {
      let changed = false;
      for (let i = 0; i < room.polygon.length; i++) {
        const p1 = room.polygon[i]!;
        const p2 = room.polygon[(i + 1) % room.polygon.length]!;
        const edgeHorizontal = Math.abs(p1.y - p2.y) < 0.02;
        const edgeVertical = Math.abs(p1.x - p2.x) < 0.02;
        if (horizontal && edgeHorizontal) {
          if (
            Math.abs(p1.y - oldStart.y) < 0.3 &&
            Math.min(Math.max(p1.x, p2.x), wallMax.x) - Math.max(Math.min(p1.x, p2.x), wallMin.x) > 0.2
          ) {
            p1.y += perpendicular;
            p2.y += perpendicular;
            changed = true;
          }
        } else if (vertical && edgeVertical) {
          if (
            Math.abs(p1.x - oldStart.x) < 0.3 &&
            Math.min(Math.max(p1.y, p2.y), wallMax.y) - Math.max(Math.min(p1.y, p2.y), wallMin.y) > 0.2
          ) {
            p1.x += perpendicular;
            p2.x += perpendicular;
            changed = true;
          }
        }
      }
      if (changed) adjusted.push(room.id);
    }
  } else {
    // Endpoint edit: only along-axis changes are reflected into room corners.
    if (horizontal) {
      if (Math.abs(newStart.y - oldStart.y) > 0.02 || Math.abs(newEnd.y - oldEnd.y) > 0.02) {
        return {
          adjustedRoomIds: [],
          warnings: ["Angled endpoint edit: room polygons were left unchanged."],
        };
      }
      for (const room of floor.rooms) {
        let changed = false;
        for (const p of room.polygon) {
          if (samePoint(p, oldStart, 0.25)) {
            p.x = newStart.x;
            changed = true;
          } else if (samePoint(p, oldEnd, 0.25)) {
            p.x = newEnd.x;
            changed = true;
          }
        }
        if (changed) adjusted.push(room.id);
      }
    } else {
      if (Math.abs(newStart.x - oldStart.x) > 0.02 || Math.abs(newEnd.x - oldEnd.x) > 0.02) {
        return {
          adjustedRoomIds: [],
          warnings: ["Angled endpoint edit: room polygons were left unchanged."],
        };
      }
      for (const room of floor.rooms) {
        let changed = false;
        for (const p of room.polygon) {
          if (samePoint(p, oldStart, 0.25)) {
            p.y = newStart.y;
            changed = true;
          } else if (samePoint(p, oldEnd, 0.25)) {
            p.y = newEnd.y;
            changed = true;
          }
        }
        if (changed) adjusted.push(room.id);
      }
    }
  }

  for (const roomId of adjusted) {
    const room = floor.rooms.find((r) => r.id === roomId);
    if (!room) continue;
    if (polygonArea(room.polygon) < 0.4 || polygonSelfIntersects(room.polygon) || !isOrthogonalPolygon(room.polygon)) {
      throw new ToolError(
        "CONSTRAINT_CONFLICT",
        `Moving this wall would make room "${room.name}" invalid. Move it less, or edit the room explicitly.`,
        { hints: ["Use smaller increments, or move the room's own boundary walls."] },
      );
    }
  }

  if (adjusted.length === 0) warnings.push("No adjacent room polygon changed; this wall may be a partition without a room boundary.");
  return { adjustedRoomIds: adjusted, warnings };
}

export function rectOfRoom(room: Room): { x0: number; y0: number; x1: number; y1: number } {
  const b = bbox(room.polygon);
  return { x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY };
}

export function roomContaining(project: Project, point: Vec2, floorId?: string): Room | null {
  const floors = floorId ? project.floors.filter((f) => f.id === floorId) : project.floors;
  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (pointInPolygon(point, room.polygon)) return room;
    }
  }
  return null;
}

export function nextOffset(wall: Wall): number {
  const len = wallLength(wall);
  const used = wall.openings.map((o) => o.offset).sort((a, b) => a - b);
  let cursor = 0.6;
  for (const offset of used) {
    if (Math.abs(cursor - offset) > 1) break;
    cursor = offset + 1;
  }
  return Math.min(Math.max(0.6, cursor), Math.max(0.6, len - 0.6));
}

export function wallCentre(wall: Wall): Vec2 {
  return add(wall.start, { x: (wall.end.x - wall.start.x) / 2, y: (wall.end.y - wall.start.y) / 2 });
}
