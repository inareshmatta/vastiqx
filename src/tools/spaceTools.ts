import { z } from "zod";
import {
  bbox,
  distance,
  distanceToBoundary,
  polygonArea,
  polygonSelfIntersects,
  pointInPolygon,
  rectPolygon,
  round,
  wallFootprint,
} from "@/domain/geometry";
import type { Constraint, Floor, Opening, RoomType, Vec2, Wall } from "@/domain/types";
import {
  addRoomWithWalls,
  applyWallChangeToRooms,
  findOpening,
  findRoom,
  findWall,
  findWallBySegment,
  rectOfRoom,
  resolveFloor,
  roomByName,
  wallLength,
} from "./helpers";
import type { ToolContext, ToolDef } from "./types";
import { ToolError } from "./types";

const ROOM_TYPES = [
  "living",
  "dining",
  "kitchen",
  "master_bedroom",
  "bedroom",
  "bathroom",
  "toilet",
  "foyer",
  "corridor",
  "stair",
  "parking",
  "pooja",
  "balcony",
  "utility",
  "study",
  "store",
  "shaft",
  "lift",
  "lobby",
  "other",
] as const;

const roomType = z.enum(ROOM_TYPES);
const vec = z.object({ x: z.number().finite(), y: z.number().finite() });
const rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(100),
  depth: z.number().positive().max(100),
});
const wallType = z.enum(["external_masonry", "internal_masonry", "party_wall", "parapet"]);

function requireOpeningFits(wall: Wall, offset: number, width: number, height: number, sill: number): void {
  const len = wallLength(wall);
  if (offset - width / 2 < -0.01 || offset + width / 2 > len + 0.01) {
    throw new ToolError("OUT_OF_BOUNDS", `Opening does not fit on the ${len.toFixed(2)} m wall.`, {
      hints: [`Use an offset between ${(width / 2).toFixed(2)} and ${(len - width / 2).toFixed(2)} m.`],
    });
  }
  if (sill + height > wall.height + 0.01) {
    throw new ToolError("CONSTRAINT_CONFLICT", `Opening height ${height} m with a ${sill} m sill exceeds wall height ${wall.height} m.`);
  }
}

function selectEdgeWall(
  floor: Floor,
  roomBounds: { x0: number; y0: number; x1: number; y1: number },
  side: "east" | "west" | "north" | "south",
): Wall | null {
  const vertical = side === "east" || side === "west";
  const target = side === "east" ? roomBounds.x1 : side === "west" ? roomBounds.x0 : side === "north" ? roomBounds.y1 : roomBounds.y0;
  let best: { wall: Wall; overlap: number } | null = null;
  for (const wall of floor.walls) {
    const isVertical = Math.abs(wall.start.x - wall.end.x) < 0.02;
    const isHorizontal = Math.abs(wall.start.y - wall.end.y) < 0.02;
    if (vertical && !isVertical) continue;
    if (!vertical && !isHorizontal) continue;
    const coord = vertical ? wall.start.x : wall.start.y;
    if (Math.abs(coord - target) > 0.35) continue;
    const lo = vertical ? Math.min(wall.start.y, wall.end.y) : Math.min(wall.start.x, wall.end.x);
    const hi = vertical ? Math.max(wall.start.y, wall.end.y) : Math.max(wall.start.x, wall.end.x);
    const roomLo = vertical ? roomBounds.y0 : roomBounds.x0;
    const roomHi = vertical ? roomBounds.y1 : roomBounds.x1;
    const overlap = Math.min(hi, roomHi) - Math.max(lo, roomLo);
    if (overlap > 0.4 && (!best || overlap > best.overlap)) best = { wall, overlap };
  }
  return best?.wall ?? null;
}

export const spaceTools: ToolDef[] = [
  {
    name: "add_room",
    version: "1.0.0",
    group: "Spaces",
    description:
      "Create a room from an outside rectangle in project-local metres. Four semantic walls are created (or reused), and the clear room polygon is inset by half the wall thickness. Fails on room overlap.",
    permission: "write",
    mutating: true,
    schema: z.object({
      floor_id: z.string().optional(),
      name: z.string().min(1).max(80),
      type: roomType,
      rect: rect.optional(),
      polygon: z.array(vec).min(3).max(64).optional(),
      thickness: z.number().min(0.05).max(0.6).optional(),
      create_walls: z.boolean().default(true),
    }),
    handler: (draft, args, ctx) => {
      const floor = resolveFloor(draft, args.floor_id);
      if (!args.rect && !args.polygon) {
        throw new ToolError("MISSING_INPUT", "Provide either rect or polygon for the new room.");
      }
      if (args.polygon) {
        if (polygonSelfIntersects(args.polygon)) {
          throw new ToolError("INVALID_GEOMETRY", "Room polygon is self-intersecting.");
        }
        if (polygonArea(args.polygon) < 0.5) {
          throw new ToolError("INVALID_GEOMETRY", "Room area must be at least 0.5 m2.");
        }
        for (const existing of floor.rooms) {
          if (existing.polygon.some((p: Vec2) => pointInPolygon(p, args.polygon)) || args.polygon.some((p: Vec2) => pointInPolygon(p, existing.polygon))) {
            throw new ToolError("ROOM_OVERLAP", `Room polygon overlaps "${existing.name}".`);
          }
        }
        const roomId = `rm_${ctx.operationId.slice(-8)}`;
        floor.rooms.push({
          id: roomId,
          name: args.name,
          type: args.type,
          polygon: args.polygon,
          targetArea: round(polygonArea(args.polygon), 2),
          vastuTags: [],
          source: ctx.source === "agent" ? "agent" : "manual",
        });
        return { result: { room_id: roomId, area_m2: round(polygonArea(args.polygon), 2) }, createdIds: [roomId] };
      }

      if (!args.create_walls) {
        const poly = rectPolygon(args.rect!.x, args.rect!.y, args.rect!.x + args.rect!.width, args.rect!.y + args.rect!.depth);
        const roomId = `rm_${ctx.operationId.slice(-8)}`;
        floor.rooms.push({
          id: roomId,
          name: args.name,
          type: args.type,
          polygon: poly,
          targetArea: round(polygonArea(poly), 2),
          vastuTags: [],
          source: "manual",
        });
        return { result: { room_id: roomId, area_m2: round(polygonArea(poly), 2) }, createdIds: [roomId] };
      }

      const { room, walls, createdWallIds } = addRoomWithWalls(
        draft,
        floor,
        args.rect!,
        args.name,
        args.type,
        {
          thickness: args.thickness,
          height: floor.height - 0.05,
          source: ctx.source === "agent" ? "agent" : "manual",
        },
      );
      return {
        result: {
          room_id: room.id,
          name: room.name,
          area_m2: round(polygonArea(room.polygon), 2),
          wall_ids: walls.map((w) => w.id),
          created_wall_ids: createdWallIds,
        },
        createdIds: [room.id, ...createdWallIds],
      };
    },
  },
  {
    name: "update_room",
    version: "1.0.0",
    group: "Spaces",
    description: "Rename a room, change its type, record a target area, or set an explicit clear polygon.",
    permission: "write",
    mutating: true,
    schema: z.object({
      room_id: z.string().min(1),
      name: z.string().min(1).max(80).optional(),
      type: roomType.optional(),
      target_area_m2: z.number().positive().max(500).optional(),
      polygon: z.array(vec).min(3).max(64).optional(),
    }),
    handler: (draft, args) => {
      const { room } = findRoom(draft, args.room_id);
      if (args.name !== undefined) room.name = args.name;
      if (args.type !== undefined) room.type = args.type;
      if (args.target_area_m2 !== undefined) room.targetArea = args.target_area_m2;
      if (args.polygon) {
        if (polygonSelfIntersects(args.polygon) || polygonArea(args.polygon) < 0.5) {
          throw new ToolError("INVALID_GEOMETRY", "The new room polygon is invalid.");
        }
        room.polygon = args.polygon;
      }
      return {
        result: {
          room_id: room.id,
          name: room.name,
          area_m2: round(polygonArea(room.polygon), 2),
          polygon: room.polygon,
        },
        updatedIds: [room.id],
      };
    },
  },
  {
    name: "set_room_target_size",
    version: "1.0.0",
    group: "Spaces",
    description:
      "Record a target area for a room. This is a preference, not a geometry change; use resize_room to change walls.",
    permission: "write",
    mutating: true,
    schema: z.object({
      room_id: z.string().min(1),
      target_area_m2: z.number().positive().max(500),
    }),
    handler: (draft, args) => {
      const { room } = findRoom(draft, args.room_id);
      room.targetArea = args.target_area_m2;
      return {
        result: {
          room_id: room.id,
          target_area_m2: room.targetArea,
          current_area_m2: round(polygonArea(room.polygon), 2),
          note: "Target recorded. Existing geometry was not changed.",
        },
        updatedIds: [room.id],
      };
    },
  },
  {
    name: "resize_room",
    version: "1.0.0",
    group: "Spaces",
    description:
      "Resize a rectangular room by moving the walls on its edges. Neighbouring room polygons are adjusted through the same wall logic. Anchored by default at the south-west corner.",
    permission: "write",
    mutating: true,
    schema: z.object({
      room_id: z.string().min(1),
      width_m: z.number().min(1.2).max(50).optional(),
      depth_m: z.number().min(1.2).max(50).optional(),
      anchor: z.enum(["sw", "se", "nw", "ne"]).default("sw"),
    }),
    handler: (draft, args) => {
      const { floor, room } = findRoom(draft, args.room_id);
      const bounds = rectOfRoom(room);
      const oldWidth = bounds.x1 - bounds.x0;
      const oldDepth = bounds.y1 - bounds.y0;
      const newWidth = args.width_m ?? oldWidth;
      const newDepth = args.depth_m ?? oldDepth;
      if (newWidth < 1.2 || newDepth < 1.2) {
        throw new ToolError("CONSTRAINT_CONFLICT", "Rooms cannot be smaller than 1.2 m in either direction.");
      }
      const dxEast = args.anchor === "sw" || args.anchor === "nw" ? newWidth - oldWidth : 0;
      const dxWest = args.anchor === "se" || args.anchor === "ne" ? -(newWidth - oldWidth) : 0;
      const dyNorth = args.anchor === "sw" || args.anchor === "se" ? newDepth - oldDepth : 0;
      const dySouth = args.anchor === "nw" || args.anchor === "ne" ? -(newDepth - oldDepth) : 0;

      const adjusted: string[] = [];
      const warnings: string[] = [];
      const steps: { side: "east" | "west" | "north" | "south"; dx: number; dy: number }[] = [
        { side: "east", dx: dxEast, dy: 0 },
        { side: "west", dx: dxWest, dy: 0 },
        { side: "north", dx: 0, dy: dyNorth },
        { side: "south", dx: 0, dy: dySouth },
      ];
      for (const step of steps) {
        if (Math.abs(step.dx) < 0.001 && Math.abs(step.dy) < 0.001) continue;
        const wall = selectEdgeWall(floor, rectOfRoom(room), step.side);
        if (wall) {
          const newStart = { x: wall.start.x + step.dx, y: wall.start.y + step.dy };
          const newEnd = { x: wall.end.x + step.dx, y: wall.end.y + step.dy };
          const result = applyWallChangeToRooms(floor, wall, newStart, newEnd);
          wall.start = newStart;
          wall.end = newEnd;
          adjusted.push(...result.adjustedRoomIds);
          warnings.push(...result.warnings);
        } else {
          const b = rectOfRoom(room);
          if (step.side === "east") b.x1 += step.dx;
          if (step.side === "west") b.x0 += step.dx;
          if (step.side === "north") b.y1 += step.dy;
          if (step.side === "south") b.y0 += step.dy;
          room.polygon = rectPolygon(b.x0, b.y0, b.x1, b.y1);
          warnings.push(`No wall found on the ${step.side} edge; the room polygon was resized directly.`);
        }
      }
      return {
        result: {
          room_id: room.id,
          area_m2: round(polygonArea(room.polygon), 2),
          width_m: round(newWidth, 2),
          depth_m: round(newDepth, 2),
          adjusted_room_ids: [...new Set([...adjusted, room.id])],
          warnings,
        },
        updatedIds: [...new Set([...adjusted, room.id])],
        warnings,
      };
    },
  },
  {
    name: "delete_room",
    version: "1.0.0",
    group: "Spaces",
    description:
      "Delete a room. Optionally removes walls that bound only this room. Requires approval.",
    permission: "admin",
    mutating: true,
    requiresApproval: true,
    schema: z.object({
      room_id: z.string().min(1),
      remove_walls: z.boolean().default(false),
    }),
    approval: (args, project) => {
      const { room } = findRoom(project, args.room_id);
      return {
        summary: `Delete room "${room.name}" (${round(polygonArea(room.polygon), 1)} m2)${args.remove_walls ? " and its unshared bounding walls" : ""}.`,
        affected: [{ kind: "room", id: room.id, label: room.name }],
        warnings: args.remove_walls
          ? ["Walls that bound only this room will be removed from the canonical model."]
          : ["Walls are retained; the room is removed from areas and schedules."],
      };
    },
    handler: (draft, args) => {
      const { floor, room } = findRoom(draft, args.room_id);
      const deleted: string[] = [room.id];
      floor.rooms = floor.rooms.filter((r) => r.id !== room.id);
      if (args.remove_walls) {
        const others = floor.rooms;
        floor.walls = floor.walls.filter((wall) => {
          const midpoint = {
            x: (wall.start.x + wall.end.x) / 2,
            y: (wall.start.y + wall.end.y) / 2,
          };
          const touchesRoom = distanceToBoundary(midpoint, room.polygon) < 0.5 || pointInPolygon(midpoint, room.polygon);
          if (!touchesRoom) return true;
          const touchesOther = others.some(
            (other) => distanceToBoundary(midpoint, other.polygon) < 0.45 || pointInPolygon(midpoint, other.polygon),
          );
          if (!touchesOther) {
            deleted.push(wall.id);
            return false;
          }
          return true;
        });
      }
      return {
        result: { deleted_room_id: room.id, deleted_wall_ids: deleted.slice(1), removed_walls: args.remove_walls },
        deletedIds: deleted,
        warnings: ["Room polygons are explicit entities; deleting walls does not re-derive neighbouring rooms."],
      };
    },
  },
  {
    name: "add_wall",
    version: "1.0.0",
    group: "Walls",
    description:
      "Add a semantic wall from start to end (metres). Exact length is derived from the endpoints. Fails if an identical baseline already exists.",
    permission: "write",
    mutating: true,
    schema: z.object({
      floor_id: z.string().optional(),
      start: vec,
      end: vec,
      thickness: z.number().min(0.05).max(0.6).default(0.115),
      height: z.number().min(1.8).max(6).optional(),
      wall_type: wallType.default("internal_masonry"),
      material: z.string().max(100).optional(),
    }),
    handler: (draft, args, ctx) => {
      const floor = resolveFloor(draft, args.floor_id);
      const len = distance(args.start, args.end);
      if (len < 0.15) {
        throw new ToolError("INVALID_GEOMETRY", "Walls must be at least 0.15 m long.", {
          hints: ["Move the endpoints further apart."],
        });
      }
      if (findWallBySegment(floor, args.start, args.end)) {
        throw new ToolError("CONSTRAINT_CONFLICT", "A wall already exists on this baseline.", {
          hints: ["Use update_wall to change the existing wall."],
        });
      }
      const wall: Wall = {
        id: `wl_${ctx.operationId.slice(-8)}`,
        start: args.start,
        end: args.end,
        thickness: args.thickness,
        height: args.height ?? floor.height - 0.05,
        type: args.wall_type,
        material:
          args.material ??
          (args.wall_type === "external_masonry" ? "AAC block 200 mm" : "AAC block 100 mm"),
        openings: [],
        source: ctx.source === "agent" ? "agent" : "manual",
      };
      floor.walls.push(wall);
      return {
        result: {
          wall_id: wall.id,
          length_m: round(len, 3),
          angle_deg: round((Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI, 2),
          thickness_m: wall.thickness,
          height_m: wall.height,
        },
        createdIds: [wall.id],
      };
    },
  },
  {
    name: "update_wall",
    version: "1.0.0",
    group: "Walls",
    description:
      "Update a wall's endpoints, thickness, height, type or material. Room polygons are re-derived for orthogonal endpoint edits.",
    permission: "write",
    mutating: true,
    schema: z.object({
      wall_id: z.string().min(1),
      start: vec.optional(),
      end: vec.optional(),
      thickness: z.number().min(0.05).max(0.6).optional(),
      height: z.number().min(1.8).max(6).optional(),
      wall_type: wallType.optional(),
      material: z.string().max(100).optional(),
    }),
    handler: (draft, args) => {
      const { floor, wall } = findWall(draft, args.wall_id);
      const newStart = args.start ?? wall.start;
      const newEnd = args.end ?? wall.end;
      const result = applyWallChangeToRooms(floor, wall, newStart, newEnd);
      wall.start = newStart;
      wall.end = newEnd;
      if (args.thickness !== undefined) wall.thickness = args.thickness;
      if (args.height !== undefined) wall.height = args.height;
      if (args.wall_type !== undefined) wall.type = args.wall_type;
      if (args.material !== undefined) wall.material = args.material;
      if (distance(wall.start, wall.end) < 0.15) {
        throw new ToolError("INVALID_GEOMETRY", "Walls must be at least 0.15 m long.");
      }
      return {
        result: {
          wall_id: wall.id,
          length_m: round(wallLength(wall), 3),
          thickness_m: wall.thickness,
          height_m: wall.height,
          adjusted_room_ids: result.adjustedRoomIds,
          warnings: result.warnings,
        },
        updatedIds: [wall.id, ...result.adjustedRoomIds],
        warnings: result.warnings,
      };
    },
  },
  {
    name: "move_wall",
    version: "1.0.0",
    group: "Walls",
    description:
      "Translate a wall by dx/dy in metres. Adjacent orthogonal room polygons grow or shrink through the shared wall boundary.",
    permission: "write",
    mutating: true,
    schema: z.object({
      wall_id: z.string().min(1),
      dx: z.number().min(-20).max(20),
      dy: z.number().min(-20).max(20),
    }),
    handler: (draft, args) => {
      const { floor, wall } = findWall(draft, args.wall_id);
      const newStart = { x: wall.start.x + args.dx, y: wall.start.y + args.dy };
      const newEnd = { x: wall.end.x + args.dx, y: wall.end.y + args.dy };
      const result = applyWallChangeToRooms(floor, wall, newStart, newEnd);
      wall.start = newStart;
      wall.end = newEnd;
      return {
        result: {
          wall_id: wall.id,
          start: wall.start,
          end: wall.end,
          adjusted_room_ids: result.adjustedRoomIds,
          warnings: result.warnings,
        },
        updatedIds: [wall.id, ...result.adjustedRoomIds],
        warnings: result.warnings,
      };
    },
  },
  {
    name: "resize_wall",
    version: "1.0.0",
    group: "Walls",
    description: "Change one or both wall endpoints. Adjacent room corners follow along-axis edits.",
    permission: "write",
    mutating: true,
    schema: z.object({
      wall_id: z.string().min(1),
      start: vec.optional(),
      end: vec.optional(),
    }),
    handler: (draft, args) => {
      const { floor, wall } = findWall(draft, args.wall_id);
      const newStart = args.start ?? wall.start;
      const newEnd = args.end ?? wall.end;
      const result = applyWallChangeToRooms(floor, wall, newStart, newEnd);
      wall.start = newStart;
      wall.end = newEnd;
      return {
        result: {
          wall_id: wall.id,
          length_m: round(wallLength(wall), 3),
          adjusted_room_ids: result.adjustedRoomIds,
          warnings: result.warnings,
        },
        updatedIds: [wall.id, ...result.adjustedRoomIds],
        warnings: result.warnings,
      };
    },
  },
  {
    name: "split_wall",
    version: "1.0.0",
    group: "Walls",
    description:
      "Split a wall at a ratio along its baseline. Openings are reassigned to the correct segment.",
    permission: "write",
    mutating: true,
    schema: z.object({
      wall_id: z.string().min(1),
      at_ratio: z.number().min(0.1).max(0.9).default(0.5),
    }),
    handler: (draft, args, ctx) => {
      const { floor, wall } = findWall(draft, args.wall_id);
      const len = wallLength(wall);
      const splitAt = len * args.at_ratio;
      const ux = (wall.end.x - wall.start.x) / len;
      const uy = (wall.end.y - wall.start.y) / len;
      const point = { x: wall.start.x + ux * splitAt, y: wall.start.y + uy * splitAt };
      const first: Wall = {
        ...wall,
        id: wall.id,
        end: point,
        openings: wall.openings.filter((o) => o.offset < splitAt),
      };
      const second: Wall = {
        ...wall,
        id: `wl_${ctx.operationId.slice(-8)}`,
        start: point,
        openings: wall.openings
          .filter((o) => o.offset >= splitAt)
          .map((o) => ({ ...o, id: o.id, offset: o.offset - splitAt })),
      };
      floor.walls = floor.walls.filter((w) => w.id !== wall.id);
      floor.walls.push(first, second);
      return {
        result: { wall_ids: [first.id, second.id], lengths_m: [round(splitAt, 3), round(len - splitAt, 3)] },
        createdIds: [second.id],
        updatedIds: [first.id],
        deletedIds: [wall.id],
      };
    },
  },
  {
    name: "delete_wall",
    version: "1.0.0",
    group: "Walls",
    description: "Delete a wall and its hosted openings. Requires approval.",
    permission: "admin",
    mutating: true,
    requiresApproval: true,
    schema: z.object({ wall_id: z.string().min(1) }),
    approval: (args, project) => {
      const { wall } = findWall(project, args.wall_id);
      return {
        summary: `Delete a ${round(wallLength(wall), 2)} m ${wall.type.replace("_", " ")} wall with ${wall.openings.length} opening(s).`,
        affected: [{ kind: "wall", id: wall.id, label: `${round(wallLength(wall), 2)} m wall` }],
        warnings: ["Room polygons are not merged or re-derived when a wall is deleted."],
      };
    },
    handler: (draft, args) => {
      const { floor, wall } = findWall(draft, args.wall_id);
      floor.walls = floor.walls.filter((w) => w.id !== wall.id);
      return {
        result: { deleted_wall_id: wall.id, deleted_opening_ids: wall.openings.map((o) => o.id) },
        deletedIds: [wall.id, ...wall.openings.map((o) => o.id)],
      };
    },
  },
  {
    name: "add_door",
    version: "1.0.0",
    group: "Openings",
    description:
      "Add a door to a wall. Offset is the centre distance from the wall start in metres.",
    permission: "write",
    mutating: true,
    schema: z.object({
      wall_id: z.string().min(1),
      offset: z.number().min(0).max(100).optional(),
      width: z.number().min(0.6).max(3).default(0.9),
      height: z.number().min(1.8).max(3).default(2.1),
      swing: z.enum(["left", "right", "double"]).default("left"),
      label: z.string().max(60).optional(),
    }),
    handler: (draft, args, ctx) => {
      const { wall } = findWall(draft, args.wall_id);
      const offset = args.offset ?? wallLength(wall) / 2;
      requireOpeningFits(wall, offset, args.width, args.height, 0);
      const opening: Opening = {
        id: `opn_${ctx.operationId.slice(-8)}`,
        kind: "door",
        offset,
        width: args.width,
        height: args.height,
        sill: 0,
        swing: args.swing,
        label: args.label,
        source: ctx.source === "agent" ? "agent" : "manual",
      };
      wall.openings.push(opening);
      return {
        result: { opening_id: opening.id, wall_id: wall.id, kind: "door", offset, width: opening.width },
        createdIds: [opening.id],
      };
    },
  },
  {
    name: "add_window",
    version: "1.0.0",
    group: "Openings",
    description: "Add a window to a wall. Offset is the centre distance from wall start in metres.",
    permission: "write",
    mutating: true,
    schema: z.object({
      wall_id: z.string().min(1),
      offset: z.number().min(0).max(100).optional(),
      width: z.number().min(0.4).max(4).default(1.2),
      height: z.number().min(0.4).max(3).default(1.2),
      sill: z.number().min(0).max(2.4).default(0.9),
      label: z.string().max(60).optional(),
    }),
    handler: (draft, args, ctx) => {
      const { wall } = findWall(draft, args.wall_id);
      const offset = args.offset ?? wallLength(wall) / 2;
      requireOpeningFits(wall, offset, args.width, args.height, args.sill);
      const opening: Opening = {
        id: `opn_${ctx.operationId.slice(-8)}`,
        kind: "window",
        offset,
        width: args.width,
        height: args.height,
        sill: args.sill,
        label: args.label,
        source: ctx.source === "agent" ? "agent" : "manual",
      };
      wall.openings.push(opening);
      return {
        result: { opening_id: opening.id, wall_id: wall.id, kind: "window", offset, width: opening.width },
        createdIds: [opening.id],
      };
    },
  },
  {
    name: "move_opening",
    version: "1.0.0",
    group: "Openings",
    description: "Move an opening along its host wall by setting a new centre offset.",
    permission: "write",
    mutating: true,
    schema: z.object({
      opening_id: z.string().min(1),
      offset: z.number().min(0).max(100),
    }),
    handler: (draft, args) => {
      const { wall, opening } = findOpening(draft, args.opening_id);
      requireOpeningFits(wall, args.offset, opening.width, opening.height, opening.sill);
      opening.offset = args.offset;
      return {
        result: { opening_id: opening.id, wall_id: wall.id, offset: opening.offset },
        updatedIds: [opening.id],
      };
    },
  },
  {
    name: "resize_opening",
    version: "1.0.0",
    group: "Openings",
    description: "Change an opening's width, height or sill. Rejects sizes that exceed the host wall.",
    permission: "write",
    mutating: true,
    schema: z.object({
      opening_id: z.string().min(1),
      width: z.number().min(0.4).max(4).optional(),
      height: z.number().min(0.4).max(3).optional(),
      sill: z.number().min(0).max(2.4).optional(),
    }),
    handler: (draft, args) => {
      const { wall, opening } = findOpening(draft, args.opening_id);
      const width = args.width ?? opening.width;
      const height = args.height ?? opening.height;
      const sill = args.sill ?? opening.sill;
      requireOpeningFits(wall, opening.offset, width, height, sill);
      opening.width = width;
      opening.height = height;
      opening.sill = sill;
      return {
        result: { opening_id: opening.id, width, height, sill },
        updatedIds: [opening.id],
      };
    },
  },
  {
    name: "remove_opening",
    version: "1.0.0",
    group: "Openings",
    description: "Remove a door or window from its host wall.",
    permission: "write",
    mutating: true,
    schema: z.object({ opening_id: z.string().min(1) }),
    handler: (draft, args) => {
      const { wall, opening } = findOpening(draft, args.opening_id);
      wall.openings = wall.openings.filter((o) => o.id !== opening.id);
      return { result: { deleted_opening_id: opening.id, wall_id: wall.id }, deletedIds: [opening.id] };
    },
  },
  {
    name: "add_constraint",
    version: "1.0.0",
    group: "Constraints",
    description:
      "Record a hard or soft design constraint (adjacency, privacy, clearance, orientation, protected dimension, budget).",
    permission: "write",
    mutating: true,
    schema: z.object({
      kind: z.enum(["adjacency", "privacy", "clearance", "orientation", "protected_dimension", "budget"]),
      hard: z.boolean().default(true),
      scope: z.string().min(1).max(200),
      value: z.union([z.string().max(200), z.number()]),
      note: z.string().max(400).optional(),
    }),
    handler: (draft, args, ctx) => {
      const constraint: Constraint = {
        id: `cst_${ctx.operationId.slice(-8)}`,
        kind: args.kind,
        hard: args.hard,
        scope: args.scope,
        value: args.value,
        note: args.note,
        source: ctx.source === "agent" ? "agent" : "manual",
      };
      draft.constraints.push(constraint);
      return {
        result: { constraint_id: constraint.id, constraints: draft.constraints },
        createdIds: [constraint.id],
      };
    },
  },
  {
    name: "find_room_by_name",
    version: "1.0.0",
    group: "Spaces",
    description: "Resolve a room name (e.g. 'Living', 'Master bedroom') to an authoritative room id.",
    permission: "read",
    mutating: false,
    schema: z.object({ name: z.string().min(1).max(80) }),
    handler: (draft, args) => {
      const { floor, room } = roomByName(draft, args.name);
      return {
        result: {
          room_id: room.id,
          name: room.name,
          floor_id: floor.id,
          area_m2: round(polygonArea(room.polygon), 2),
          polygon: room.polygon,
        },
        changed: false,
      };
    },
  },
];

/** Exposed for verification tooling. */
export function roomBounds(room: { polygon: Vec2[] }) {
  return bbox(room.polygon);
}

export function wallFootprintArea(wall: Wall, floor: Floor): number {
  const poly = wallFootprint(wall.start, wall.end, wall.thickness);
  void floor;
  return Math.round(polygonArea(poly) * 1000) / 1000;
}

export function openingCount(context: ToolContext, project: Parameters<ToolDef["handler"]>[0]): number {
  void context;
  return project.floors.reduce((s, f) => s + f.walls.reduce((ws, w) => ws + w.openings.length, 0), 0);
}

export type RoomTypeSchema = RoomType;
