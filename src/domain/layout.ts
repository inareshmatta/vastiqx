import {
  bbox,
  clamp,
  distance,
  hashString,
  polygonArea,
  polygonCentroid,
  rectArea,
  rectCenter,
  rectPolygon,
  rectsOverlap,
  sliceRect,
} from "./geometry";
import { buildableRect, projectMetrics } from "./measure";
import { calculateEstimate } from "./boq";
import { newId } from "./project";
import { assessVastu } from "./vastu";
import type {
  BuildingElement,
  CandidateScore,
  Floor,
  LayoutCandidate,
  Opening,
  Project,
  Room,
  RoomType,
  SectorCode,
  SourceKind,
  Vec2,
  Wall,
} from "./types";

const ENGINE_VERSION = "layout-engine@1.0.0";
const LAYOUT_GENERATED: SourceKind = "generated";

type Rect = { x0: number; y0: number; x1: number; y1: number };

export interface ProgramRoom {
  key: string;
  type: RoomType;
  name: string;
  targetArea: number;
  floorLevel: number;
  zone: "north" | "south" | "either";
  eastWest: "east" | "west" | "either";
  priority: number;
}

export interface LayoutWeights {
  space_efficiency: number;
  vastu_alignment: number;
  circulation: number;
  daylight_potential: number;
  cost: number;
}

export const DEFAULT_WEIGHTS: LayoutWeights = {
  space_efficiency: 0.3,
  vastu_alignment: 0.25,
  circulation: 0.2,
  daylight_potential: 0.1,
  cost: 0.15,
};

export interface GenerateLayoutArgs {
  objective_weights?: Partial<LayoutWeights>;
  max_options?: number;
  floors?: string[];
  program_description?: string;
}

interface Variant {
  key: string;
  name: string;
  description: string;
  corridorBias: number;
  allowCorridor: boolean;
  mergeLivingDining: boolean;
  strictVastuOrder: boolean;
}

const VARIANTS: Variant[] = [
  {
    key: "A",
    name: "Balanced",
    description: "Area-efficient orthogonal plan with a central circulation spine and balanced zoning.",
    corridorBias: 0.5,
    allowCorridor: true,
    mergeLivingDining: false,
    strictVastuOrder: false,
  },
  {
    key: "B",
    name: "Vastu-led",
    description: "Same structural logic, re-ordered so kitchen, master bedroom and pooja land closer to traditional sectors.",
    corridorBias: 0.58,
    allowCorridor: true,
    mergeLivingDining: false,
    strictVastuOrder: true,
  },
  {
    key: "C",
    name: "Daylight / open",
    description: "Open living-dining, wider external frontage for bedrooms and a higher window-to-room ratio.",
    corridorBias: 0.44,
    allowCorridor: true,
    mergeLivingDining: true,
    strictVastuOrder: false,
  },
];

const ROOM_AREA_DEFAULTS: Record<string, number> = {
  living: 17,
  dining: 10,
  kitchen: 10,
  master_bedroom: 13.5,
  bedroom: 11,
  bathroom: 4.2,
  toilet: 3,
  foyer: 4.5,
  stair: 3.2,
  parking: 13,
  pooja: 3.2,
  study: 7,
};

function roomProgram(
  key: string,
  type: RoomType,
  name: string,
  floorLevel: number,
  targetArea: number,
  zone: ProgramRoom["zone"],
  eastWest: ProgramRoom["eastWest"],
  priority = 1,
): ProgramRoom {
  return { key, type, name, targetArea, floorLevel, zone, eastWest, priority };
}

export function buildProgram(project: Project): ProgramRoom[] {
  const floors = project.floors.length;
  const b = project.brief;
  const out: ProgramRoom[] = [];
  const bedrooms = Math.max(1, b.bedrooms);
  const bathrooms = Math.max(1, b.bathrooms);

  const groundBedrooms = floors === 1 ? bedrooms : bedrooms > 1 ? 1 : 1;
  let upperBedrooms = bedrooms - groundBedrooms;

  const bathroomSplit: number[] = new Array(floors).fill(0);
  for (let i = 0; i < bathrooms; i++) {
    const idx = i % floors;
    bathroomSplit[idx] = (bathroomSplit[idx] ?? 0) + 1;
  }
  if (bathroomSplit[0] === 0) bathroomSplit[0] = 1;

  for (let level = 0; level < floors; level++) {
    const prefix = `f${level}`;
    const isGround = level === 0;
    const bedroomsThisFloor = isGround ? groundBedrooms : Math.min(upperBedrooms, Math.ceil(bedrooms / Math.max(1, floors - 1)));
    if (!isGround) upperBedrooms = Math.max(0, upperBedrooms - bedroomsThisFloor);

    if (isGround) {
      out.push(roomProgram(`${prefix}-living`, "living", "Living", level, ROOM_AREA_DEFAULTS.living!, "north", "east", 3));
      out.push(roomProgram(`${prefix}-dining`, "dining", "Dining", level, ROOM_AREA_DEFAULTS.dining!, "south", "west", 2));
      out.push(roomProgram(`${prefix}-kitchen`, "kitchen", "Kitchen", level, ROOM_AREA_DEFAULTS.kitchen!, "south", "east", 3));
      out.push(roomProgram(`${prefix}-foyer`, "foyer", "Foyer", level, ROOM_AREA_DEFAULTS.foyer!, "south", "either", 2));
      if (b.pooja) out.push(roomProgram(`${prefix}-pooja`, "pooja", "Pooja", level, ROOM_AREA_DEFAULTS.pooja!, "north", "east", 2));
    } else {
      out.push(
        roomProgram(
          `${prefix}-living`,
          "living",
          "Family lounge",
          level,
          Math.max(9, ROOM_AREA_DEFAULTS.living! * 0.65),
          "north",
          "east",
          2,
        ),
      );
    }

    for (let i = 0; i < bedroomsThisFloor; i++) {
      const globalIndex = isGround ? i + 1 : groundBedrooms + i + 1;
      const isMaster = globalIndex === 1;
      out.push(
        roomProgram(
          `${prefix}-bed${i}`,
          isMaster ? "master_bedroom" : "bedroom",
          isMaster ? "Master bedroom" : `Bedroom ${globalIndex}`,
          level,
          isMaster ? ROOM_AREA_DEFAULTS.master_bedroom! : ROOM_AREA_DEFAULTS.bedroom!,
          "south",
          isMaster ? "west" : i % 2 === 0 ? "west" : "east",
          isMaster ? 3 : 2,
        ),
      );
    }

    for (let i = 0; i < bathroomSplit[level]!; i++) {
      out.push(
        roomProgram(
          `${prefix}-bath${i}`,
          "bathroom",
          `Bathroom ${level + 1}.${i + 1}`,
          level,
          ROOM_AREA_DEFAULTS.bathroom!,
          "either",
          "west",
          1,
        ),
      );
    }

    if (floors > 1) {
      out.push(roomProgram(`${prefix}-stair`, "stair", "Stair", level, ROOM_AREA_DEFAULTS.stair!, "south", "west", 3));
    }
  }

  if (b.parking) {
    out.push(roomProgram("f0-parking", "parking", "Parking", 0, ROOM_AREA_DEFAULTS.parking!, "south", "either", 2));
  }

  return out;
}

function assignRows(rooms: ProgramRoom[], variant: Variant): { north: ProgramRoom[]; south: ProgramRoom[] } {
  const southTypes: RoomType[] = ["kitchen", "foyer", "dining", "parking", "stair"];
  const northTypes: RoomType[] = ["living", "pooja", "study"];

  const south = rooms.filter((r) => southTypes.includes(r.type));
  const north = rooms.filter((r) => northTypes.includes(r.type));
  const rest = rooms
    .filter((r) => !southTypes.includes(r.type) && !northTypes.includes(r.type))
    .sort((a, b) => b.targetArea - a.targetArea);

  const areaOf = (list: ProgramRoom[]) => list.reduce((s, r) => s + r.targetArea, 0);
  for (const r of rest) {
    const preferSouth =
      r.zone === "south" || (r.zone === "either" && areaOf(south) <= areaOf(north) && north.length > 0);
    if (preferSouth) south.push(r);
    else north.push(r);
  }

  if (south.length === 0 && north.length > 0) south.push(north.pop()!);
  if (north.length === 0 && south.length > 1) north.push(south.pop()!);

  // Keep rows viable: move smallest rooms if a row is too crowded for its width.
  const byPriority = (list: ProgramRoom[]) => list.sort((a, b) => b.priority - a.priority || b.targetArea - a.targetArea);
  byPriority(south);
  byPriority(north);

  void variant;
  return { north, south };
}

function orderRow(rooms: ProgramRoom[]): ProgramRoom[] {
  const rank = (r: ProgramRoom) => (r.eastWest === "west" ? 0 : r.eastWest === "east" ? 1 : 0.5);
  return [...rooms].sort((a, b) => rank(a) - rank(b) || b.targetArea - a.targetArea);
}

interface CellSpec {
  rect: Rect;
  kind: "room" | "corridor" | "parking" | "stair";
  program: ProgramRoom | null;
}

function insetAmount(
  plate: Rect,
  side: "north" | "south" | "east" | "west",
  rect: Rect,
): number {
  const tol = 0.02;
  switch (side) {
    case "west":
      return Math.abs(rect.x0 - plate.x0) < tol ? 0.23 : 0.115;
    case "east":
      return Math.abs(rect.x1 - plate.x1) < tol ? 0.23 : 0.115;
    case "south":
      return Math.abs(rect.y0 - plate.y0) < tol ? 0.23 : 0.115;
    case "north":
      return Math.abs(rect.y1 - plate.y1) < tol ? 0.23 : 0.115;
  }
}

interface WallDraft {
  start: Vec2;
  end: Vec2;
  thickness: number;
  type: Wall["type"];
  openings: Opening[];
}

function wallKey(a: Vec2, b: Vec2): string {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const p1 = `${r(a.x)},${r(a.y)}`;
  const p2 = `${r(b.x)},${r(b.y)}`;
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

function orderEndpoints(a: Vec2, b: Vec2): [Vec2, Vec2] {
  return a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
}

function findSideWall(
  walls: Map<string, WallDraft>,
  rect: Rect,
  side: "north" | "south" | "east" | "west",
): WallDraft | null {
  const a = side === "south"
    ? { x: rect.x0, y: rect.y0 }
    : side === "north"
      ? { x: rect.x0, y: rect.y1 }
      : side === "west"
        ? { x: rect.x0, y: rect.y0 }
        : { x: rect.x1, y: rect.y0 };
  const b = side === "south"
    ? { x: rect.x1, y: rect.y0 }
    : side === "north"
      ? { x: rect.x1, y: rect.y1 }
      : side === "west"
        ? { x: rect.x0, y: rect.y1 }
        : { x: rect.x1, y: rect.y1 };
  return walls.get(wallKey(a, b)) ?? null;
}

function addOpeningToWall(
  walls: Map<string, WallDraft>,
  wall: WallDraft,
  kind: "door" | "window",
  width: number,
  height: number,
  sill: number,
  centrePoint: Vec2,
  floorHeight: number,
): Opening | null {
  const len = distance(wall.start, wall.end);
  if (len < width + 0.25) return null;
  const ux = (wall.end.x - wall.start.x) / len;
  const uy = (wall.end.y - wall.start.y) / len;
  let offset = (centrePoint.x - wall.start.x) * ux + (centrePoint.y - wall.start.y) * uy;
  offset = clamp(offset, width / 2 + 0.12, len - width / 2 - 0.12);
  const clash = wall.openings.some((o) => Math.abs(o.offset - offset) < (o.width + width) / 2 + 0.15);
  if (clash) {
    const alternative = offset < len / 2 ? clamp(offset + 1.1, width / 2 + 0.12, len - width / 2 - 0.12) : clamp(offset - 1.1, width / 2 + 0.12, len - width / 2 - 0.12);
    if (wall.openings.some((o) => Math.abs(o.offset - alternative) < (o.width + width) / 2 + 0.15)) return null;
    offset = alternative;
  }
  const opening: Opening = {
    id: newId("opn"),
    kind,
    offset: Math.round(offset * 100) / 100,
    width,
    height: Math.min(height, floorHeight - 0.3),
    sill,
    source: LAYOUT_GENERATED,
    label: kind === "door" ? "Door" : "Window",
  };
  wall.openings.push(opening);
  return opening;
}

function rectSides(rect: Rect): { side: "north" | "south" | "east" | "west"; a: Vec2; b: Vec2; centre: Vec2; length: number }[] {
  return [
    { side: "south", a: { x: rect.x0, y: rect.y0 }, b: { x: rect.x1, y: rect.y0 }, centre: { x: (rect.x0 + rect.x1) / 2, y: rect.y0 }, length: rect.x1 - rect.x0 },
    { side: "north", a: { x: rect.x0, y: rect.y1 }, b: { x: rect.x1, y: rect.y1 }, centre: { x: (rect.x0 + rect.x1) / 2, y: rect.y1 }, length: rect.x1 - rect.x0 },
    { side: "west", a: { x: rect.x0, y: rect.y0 }, b: { x: rect.x0, y: rect.y1 }, centre: { x: rect.x0, y: (rect.y0 + rect.y1) / 2 }, length: rect.y1 - rect.y0 },
    { side: "east", a: { x: rect.x1, y: rect.y0 }, b: { x: rect.x1, y: rect.y1 }, centre: { x: rect.x1, y: (rect.y0 + rect.y1) / 2 }, length: rect.y1 - rect.y0 },
  ];
}

function buildFloorGeometry(
  project: Project,
  floor: Floor,
  plate: Rect,
  cells: CellSpec[],
  variant: Variant,
): Floor {
  const wallMap = new Map<string, WallDraft>();

  const addSide = (rect: Rect, side: "north" | "south" | "east" | "west") => {
    const seg = rectSides(rect).find((s) => s.side === side)!;
    const [start, end] = orderEndpoints(seg.a, seg.b);
    const key = wallKey(start, end);
    if (wallMap.has(key)) return;
    const thickness = insetAmount(plate, side, rect);
    const isExternal = thickness > 0.2;
    wallMap.set(key, {
      start,
      end,
      thickness,
      type: isExternal ? "external_masonry" : "internal_masonry",
      openings: [],
    });
  };

  for (const cell of cells) {
    addSide(cell.rect, "north");
    addSide(cell.rect, "south");
    addSide(cell.rect, "east");
    addSide(cell.rect, "west");
  }

  const roomCells = cells.filter((c) => c.kind !== "corridor");
  const corridor = cells.find((c) => c.kind === "corridor");
  const rooms: Room[] = [];

  const clearRectOf = (rect: Rect): Rect => {
    const w = insetAmount(plate, "west", rect) / 2;
    const e = insetAmount(plate, "east", rect) / 2;
    const s = insetAmount(plate, "south", rect) / 2;
    const n = insetAmount(plate, "north", rect) / 2;
    return { x0: rect.x0 + w, y0: rect.y0 + s, x1: rect.x1 - e, y1: rect.y1 - n };
  };

  const addRoom = (cell: CellSpec) => {
    const clear = clearRectOf(cell.rect);
    if (clear.x1 - clear.x0 < 0.8 || clear.y1 - clear.y0 < 0.8) return;
    const program = cell.program;
    const roomType: RoomType =
      cell.kind === "parking" ? "parking" : cell.kind === "stair" ? "stair" : (program?.type ?? "other");
    const room: Room = {
      id: newId("rm"),
      name: program?.name ?? (roomType === "parking" ? "Parking" : roomType === "stair" ? "Stair" : "Space"),
      type: roomType,
      polygon: rectPolygon(clear.x0, clear.y0, clear.x1, clear.y1),
      targetArea: program ? Math.round(program.targetArea * 10) / 10 : undefined,
      vastuTags: [] as SectorCode[],
      source: LAYOUT_GENERATED,
    };
    rooms.push(room);

    if (cell.kind === "stair") {
      floor.elements.push({
        id: newId("elm"),
        kind: "stair",
        roomId: room.id,
        rect: { x: clear.x0, y: clear.y0, width: clear.x1 - clear.x0, depth: clear.y1 - clear.y0 },
        height: floor.height,
        source: LAYOUT_GENERATED,
      } satisfies BuildingElement);
    }

    const sides = rectSides(cell.rect);
    const adjacentToCorridor = (s: (typeof sides)[number]) => {
      if (!corridor) return false;
      const c = corridor.rect;
      const tol = 0.02;
      if (s.side === "south") return Math.abs(c.y1 - cell.rect.y0) < tol && c.x0 <= cell.rect.x1 && c.x1 >= cell.rect.x0;
      if (s.side === "north") return Math.abs(c.y0 - cell.rect.y1) < tol && c.x0 <= cell.rect.x1 && c.x1 >= cell.rect.x0;
      return false;
    };

    const doorSides = sides.filter((s) => adjacentToCorridor(s));
    const doorSide =
      doorSides.sort((a, b) => b.length - a.length)[0] ??
      (cell.kind === "parking" ? null : sides.filter((s) => {
        const wall = findSideWall(wallMap, cell.rect, s.side);
        return wall?.type === "internal_masonry";
      }).sort((a, b) => b.length - a.length)[0]);

    const wallHeight = floor.height - 0.05;

    if (doorSide && cell.kind !== "parking") {
      const wall = findSideWall(wallMap, cell.rect, doorSide.side);
      if (wall) addOpeningToWall(wallMap, wall, "door", 0.9, 2.1, 0, doorSide.centre, wallHeight);
    }

    if (cell.kind === "parking") {
      const southWall = findSideWall(wallMap, cell.rect, "south");
      if (southWall) addOpeningToWall(wallMap, southWall, "door", 2.4, 2.1, 0, { x: (cell.rect.x0 + cell.rect.x1) / 2, y: cell.rect.y0 }, wallHeight);
    }

    if (roomType === "foyer") {
      const southWall = findSideWall(wallMap, cell.rect, "south");
      if (southWall) addOpeningToWall(wallMap, southWall, "door", 1.0, 2.2, 0, { x: (cell.rect.x0 + cell.rect.x1) / 2, y: cell.rect.y0 }, wallHeight);
    }

    const habitable: RoomType[] = ["living", "dining", "kitchen", "master_bedroom", "bedroom", "study", "pooja"];
    const wantsWindow = habitable.includes(roomType) || roomType === "bathroom" || roomType === "toilet" || roomType === "stair";
    if (wantsWindow) {
      const exteriorSides = sides.filter((s) => {
        const wall = findSideWall(wallMap, cell.rect, s.side);
        return wall?.type === "external_masonry";
      });
      const sorted = exteriorSides.sort((a, b) => b.length - a.length);
      const chosen = sorted[0];
      if (chosen) {
        const wall = findSideWall(wallMap, cell.rect, chosen.side);
        if (wall) {
          const width = roomType === "bathroom" || roomType === "toilet" ? 0.7 : clamp(chosen.length * 0.5, 0.9, variant.key === "C" ? 2.4 : 1.8);
          addOpeningToWall(wallMap, wall, "window", width, 1.35, 0.9, chosen.centre, wallHeight);
          if (variant.key === "C" && sorted[1] && roomType !== "bathroom" && roomType !== "toilet") {
            const secondWall = findSideWall(wallMap, cell.rect, sorted[1].side);
            if (secondWall) addOpeningToWall(wallMap, secondWall, "window", clamp(sorted[1].length * 0.4, 0.9, 1.8), 1.35, 0.9, sorted[1].centre, wallHeight);
          }
        }
      }
    }
  };

  for (const cell of roomCells) addRoom(cell);

  const walls: Wall[] = [...wallMap.values()].map((w) => ({
    id: newId("wl"),
    start: w.start,
    end: w.end,
    thickness: w.thickness,
    height: floor.height - 0.05,
    type: w.type,
    material: w.type === "external_masonry" ? "AAC block 200 mm" : "AAC block 100 mm",
    openings: w.openings,
    source: LAYOUT_GENERATED,
  }));

  return {
    ...floor,
    walls,
    rooms,
    elements: floor.elements,
    source: LAYOUT_GENERATED,
  };
}

function buildCandidateFloors(
  project: Project,
  program: ProgramRoom[],
  variant: Variant,
): Floor[] {
  const plateBase = buildableRect(project);
  const floors: Floor[] = [];

  for (const template of project.floors) {
    const level = template.level;
    const floorProgram = program.filter((p) => p.floorLevel === level && p.type !== "parking");
    const parkingProgram = program.find((p) => p.floorLevel === 0 && p.type === "parking");
    const stairProgram = floorProgram.find((p) => p.type === "stair");
    const roomPrograms = floorProgram.filter((p) => p.type !== "stair");

    let plate = { ...plateBase };
    const cells: CellSpec[] = [];

    if (level === 0 && parkingProgram && project.brief.parking) {
      const pw = Math.min(5.5, plate.x1 - plate.x0);
      const pd = 2.6;
      const parkingRect = { x0: plate.x0, y0: plate.y0, x1: plate.x0 + pw, y1: plate.y0 + pd };
      cells.push({ rect: parkingRect, kind: "parking", program: parkingProgram });
      plate = { ...plate, y0: plate.y0 + pd };
    }

    const width = plate.x1 - plate.x0;
    const depth = plate.y1 - plate.y0;
    if (width < 3 || depth < 3) {
      floors.push({ ...template, walls: [], rooms: [], elements: [], source: LAYOUT_GENERATED });
      continue;
    }

    // Fit the requested program to the available floor plate.
    const corridorAllowed = variant.allowCorridor && floorProgram.length >= 5 && depth >= 8;
    const corridorH = corridorAllowed ? 1.15 : 0;
    const available = Math.max(8, width * depth - corridorH * width - (stairProgram ? 3.2 : 0));
    const requested = roomPrograms.reduce((s, r) => s + r.targetArea, 0);
    const scale = requested > 0 ? clamp(available / requested, 0.55, 1.2) : 1;
    const scaled = roomPrograms.map((r) => ({ ...r, targetArea: Math.round(r.targetArea * scale * 10) / 10 }));

    const merged: ProgramRoom[] = [];
    if (variant.mergeLivingDining) {
      const living = scaled.find((r) => r.type === "living");
      const dining = scaled.find((r) => r.type === "dining");
      if (living && dining) {
        merged.push({ ...living, name: "Living / dining", targetArea: living.targetArea + dining.targetArea, type: "living", key: `${living.key}-merged` });
        merged.push(...scaled.filter((r) => r !== living && r !== dining));
      } else {
        merged.push(...scaled);
      }
    } else {
      merged.push(...scaled);
    }

    const { north, south } = assignRows(merged, variant);
    const northList = orderRow(north);
    const southList = orderRow(south);

    const minWidth = 2.05;
    const fits = (list: ProgramRoom[], rowWidth: number) => list.length === 0 || rowWidth >= list.length * minWidth;

    while (northList.length > 0 && southList.length > 0) {
      if (fits(northList, width) && fits(southList, width)) break;
      const moveFromNorth = !fits(northList, width);
      const source = moveFromNorth ? northList : southList;
      const target = moveFromNorth ? southList : northList;
      const moved = source.pop();
      if (!moved) break;
      target.push(moved);
    }

    const northArea = northList.reduce((s, r) => s + r.targetArea, 0);
    const southArea = southList.reduce((s, r) => s + r.targetArea, 0);
    const totalArea = northArea + southArea || 1;
    const usableDepth = depth - corridorH;
    let southDepth = usableDepth * (southArea / totalArea);
    if (northList.length === 0) southDepth = usableDepth;
    if (southList.length === 0) southDepth = 0;
    southDepth = clamp(southDepth, northList.length > 0 && southList.length > 0 ? 2.2 : 0, usableDepth);
    const northDepth = usableDepth - southDepth;

    const southRect = { x0: plate.x0, y0: plate.y0, x1: plate.x1, y1: plate.y0 + southDepth };
    const corridorRect = corridorH > 0
      ? { x0: plate.x0, y0: plate.y0 + southDepth, x1: plate.x1, y1: plate.y0 + southDepth + corridorH }
      : null;
    const northRect = {
      x0: plate.x0,
      y0: plate.y0 + southDepth + corridorH,
      x1: plate.x1,
      y1: plate.y1,
    };

    if (corridorRect) {
      cells.push({
        rect: corridorRect,
        kind: "corridor",
        program: roomProgram(`${level}-corridor`, "corridor", "Corridor", level, rectArea(corridorRect), "either", "either", 0),
      });
    }

    const placeRow = (list: ProgramRoom[], row: Rect, side: "north" | "south") => {
      if (list.length === 0) return;
      let rowRect = row;
      if (side === "south" && stairProgram) {
        const stairDepth = Math.min(2.7, row.y1 - row.y0);
        const stairRect = { x0: row.x0, y0: row.y0, x1: row.x0 + 1.1, y1: row.y0 + stairDepth };
        if (rowRect.x1 - rowRect.x0 > 4) {
          cells.push({ rect: stairRect, kind: "stair", program: stairProgram });
          rowRect = { ...rowRect, x0: rowRect.x0 + 1.1 };
        }
      }
      const weights = list.map((r) => r.targetArea);
      const slices = sliceRect(rowRect, weights, "x");
      list.forEach((r, i) => {
        const cell = slices[i];
        if (!cell) return;
        cells.push({ rect: cell, kind: "room", program: r });
      });
    };

    placeRow(southList, southRect, "south");
    placeRow(northList, northRect, "north");

    const built = buildFloorGeometry(project, { ...template }, plateBase, cells, variant);
    floors.push(built);
  }

  return floors;
}

function scoreCandidate(
  candidate: LayoutCandidate,
  targets: Map<RoomType, number>,
  corridorArea: number,
  plateArea: number,
  variant: Variant,
  vastuSummary: { pass: number; advisory: number; fail: number; not_assessed: number },
): CandidateScore {
  let achieved = 0;
  let target = 0;
  for (const [type, area] of targets) {
    target += area;
    achieved += candidate.floors.flatMap((f) => f.rooms).filter((r) => r.type === type).reduce((s, r) => s + polygonArea(r.polygon), 0);
  }
  const efficiency = clamp(target > 0 ? 1 - Math.abs(achieved - target) / target : 0.5, 0, 1);

  const assessed = vastuSummary.pass + vastuSummary.advisory + vastuSummary.fail;
  const vastuValue = assessed === 0 ? 0.5 : clamp((vastuSummary.pass + vastuSummary.advisory * 0.45) / assessed, 0, 1);

  const corridorRatio = plateArea > 0 ? corridorArea / plateArea : 0;
  const circulation = variant.allowCorridor
    ? clamp(1 - Math.abs(corridorRatio - 0.1) / 0.12, 0, 1)
    : 0.6;

  const habitableRooms = candidate.floors
    .flatMap((f) => f.rooms)
    .filter((r) => ["living", "dining", "kitchen", "master_bedroom", "bedroom", "study", "pooja"].includes(r.type));
  const windowCount = candidate.floors.reduce(
    (s, f) => s + f.walls.reduce((ws, w) => ws + w.openings.filter((o) => o.kind === "window").length, 0),
    0,
  );
  const daylight = habitableRooms.length > 0 ? clamp(windowCount / habitableRooms.length / 1.4, 0, 1) : 0.5;

  return {
    space_efficiency: Math.round(efficiency * 1000) / 1000,
    vastu_alignment: Math.round(vastuValue * 1000) / 1000,
    circulation: Math.round(circulation * 1000) / 1000,
    daylight_potential: Math.round(daylight * 1000) / 1000,
    cost: 0,
    total: 0,
  };
}

export function generateLayoutOptions(
  project: Project,
  args: GenerateLayoutArgs = {},
  onCandidate?: (candidate: LayoutCandidate) => void,
): LayoutCandidate[] {
  const maxOptions = clamp(args.max_options ?? 3, 1, 3);
  const weights: LayoutWeights = { ...DEFAULT_WEIGHTS, ...(args.objective_weights ?? {}) };
  const weightSum = Object.values(weights).reduce((a, b) => a + Math.max(0, b), 0) || 1;

  const program = buildProgram(project);
  const targetByType = new Map<RoomType, number>();
  for (const p of program) {
    targetByType.set(p.type, (targetByType.get(p.type) ?? 0) + p.targetArea);
  }

  const plate = buildableRect(project);
  const plateArea = rectArea(plate);
  const candidates: LayoutCandidate[] = [];

  for (const variant of VARIANTS.slice(0, maxOptions)) {
    const floors = buildCandidateFloors(project, program, variant);
    if (floors.every((f) => f.rooms.length === 0)) continue;

    const signature = JSON.stringify({
      variant: variant.key,
      floors: floors.map((f) => ({
        walls: f.walls.map((w) => [w.start, w.end, w.thickness, w.openings.map((o) => [o.kind, o.offset, o.width])]),
        rooms: f.rooms.map((r) => [r.type, r.polygon]),
      })),
    });
    const candidateId = `cand_${hashString(signature)}`;

    const tempProject: Project = { ...project, floors };
    const metrics = projectMetrics(tempProject);
    const vastu = assessVastu(tempProject);
    const estimate = calculateEstimate(tempProject);

    const corridorArea = floors
      .flatMap((f) => f.rooms)
      .filter((r) => r.type === "corridor")
      .reduce((s, r) => s + polygonArea(r.polygon), 0);

    const candidate: LayoutCandidate = {
      candidateId,
      name: `Option ${variant.key} — ${variant.name}`,
      description: variant.description,
      floors,
      metrics,
      scores: {
        space_efficiency: 0,
        vastu_alignment: 0,
        circulation: 0,
        daylight_potential: 0,
        cost: 0,
        total: 0,
      },
      vastuSummary: {
        pass: vastu.summary.pass,
        advisory: vastu.summary.advisory,
        fail: vastu.summary.fail,
        not_assessed: vastu.summary.not_assessed,
      },
      estimateTotal: estimate.totals.total,
      generatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
    };
    candidate.scores = scoreCandidate(candidate, targetByType, corridorArea, plateArea, variant, candidate.vastuSummary);
    candidates.push(candidate);
    onCandidate?.(candidate);
  }

  const minCost = Math.min(...candidates.map((c) => c.estimateTotal).filter((n) => n > 0));
  for (const c of candidates) {
    c.scores.cost = minCost > 0 && c.estimateTotal > 0 ? Math.round((minCost / c.estimateTotal) * 1000) / 1000 : 0.5;
    c.scores.total =
      Math.round(
        ((weights.space_efficiency * c.scores.space_efficiency +
          weights.vastu_alignment * c.scores.vastu_alignment +
          weights.circulation * c.scores.circulation +
          weights.daylight_potential * c.scores.daylight_potential +
          weights.cost * c.scores.cost) /
          weightSum) *
          1000,
      ) / 1000;
  }

  return candidates.sort((a, b) => b.scores.total - a.scores.total).slice(0, maxOptions);
}

/** Find an empty rectangle inside the buildable envelope (used by add_room). */
export function findFreeRect(
  project: Project,
  width: number,
  depth: number,
): { x: number; y: number; width: number; depth: number } | null {
  const plate = buildableRect(project);
  const rooms = project.floors[0]?.rooms ?? [];
  const step = 0.5;
  for (let y = plate.y0; y + depth <= plate.y1 + 0.001; y += step) {
    for (let x = plate.x0; x + width <= plate.x1 + 0.001; x += step) {
      const candidate = { x0: x, y0: y, x1: x + width, y1: y + depth };
      const clash = rooms.some((room) => {
        const rb = bbox(room.polygon);
        return rectsOverlap(candidate, { x0: rb.minX, y0: rb.minY, x1: rb.maxX, y1: rb.maxY }, 0.2);
      });
      if (!clash) return { x, y, width, depth };
    }
  }
  return null;
}

export function candidateCentre(candidate: LayoutCandidate): Vec2 {
  const rooms = candidate.floors.flatMap((f) => f.rooms);
  if (rooms.length === 0) return { x: 0, y: 0 };
  const b = bbox(rooms.flatMap((r) => r.polygon));
  return rectCenter({ x0: b.minX, y0: b.minY, x1: b.maxX, y1: b.maxY });
}

export function candidateRoomCount(candidate: LayoutCandidate): number {
  return candidate.floors.reduce((s, f) => s + f.rooms.length, 0);
}

export function candidateDirectionPreview(candidate: LayoutCandidate, northBearing: number): { name: string; sector: string }[] {
  return candidate.floors
    .flatMap((f) => f.rooms)
    .filter((r) => r.type !== "corridor")
    .map((r) => {
      const c = polygonCentroid(r.polygon);
      const dir = (Math.atan2(c.x, c.y) * 180) / Math.PI + northBearing;
      const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      return { name: r.name, sector: sectors[Math.round((((dir % 360) + 360) % 360) / 45) % 8]! };
    });
}
