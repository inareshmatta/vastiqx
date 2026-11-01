import { distanceToBoundary, polygonArea, polygonCentroid, polygonPerimeter, round } from "./geometry";
import { calculateEstimate, type Estimate } from "./boq";
import { PACKAGE_FACTORS, getRateBook } from "./rateBook";
import type { Floor, Opening, Project, Room } from "./types";

/**
 * Room-wise cost allocation.
 *
 * Direct lines are measured from the canonical model and multiplied by the
 * selected rate book (finish package factor applied where the project estimate
 * applies it). Structural work, labour, overheads, margin, GST and contingency
 * are not directly attributable per room, so the remaining project estimate is
 * allocated by clear room area. This is an explicit allocation view, not a
 * second estimate: the project total is always the authoritative estimate total.
 */
export interface CostLine {
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  formula: string;
  confidence: "measured" | "benchmarked" | "assumed";
}

export interface RoomCost {
  roomId: string;
  room: string;
  roomType: string;
  floorId: string;
  floor: string;
  area: number;
  perimeter: number;
  doors: number;
  windows: number;
  lines: CostLine[];
  directTotal: number;
  allocatedShared: number;
  total: number;
  perSqm: number;
}

export interface FloorCost {
  floorId: string;
  name: string;
  level: number;
  area: number;
  builtUpArea: number;
  rooms: RoomCost[];
  directTotal: number;
  allocatedShared: number;
  total: number;
  perSqm: number;
}

export interface CostBreakdown {
  projectId: string;
  revision: number;
  package: string;
  rateBookId: string;
  generatedAt: string;
  floors: FloorCost[];
  rooms: RoomCost[];
  project: {
    plotArea: number;
    builtUpArea: number;
    directFinishTotal: number;
    allocatedSharedTotal: number;
    estimateMaterial: number;
    estimateLabour: number;
    estimateTotal: number;
    bandLow: number;
    bandHigh: number;
    perSqm: number;
  };
  allocation: {
    method: string;
    sharedCostBasis: string;
    reconciliation: string;
    directTotal: number;
    sharedTotal: number;
    note: string;
  };
  disclaimer: string;
}

const ELECTRICAL_POINTS: Record<string, number> = {
  living: 8,
  dining: 4,
  kitchen: 8,
  master_bedroom: 6,
  bedroom: 6,
  study: 6,
  bathroom: 4,
  toilet: 4,
  foyer: 3,
  corridor: 2,
  stair: 2,
  parking: 1,
  pooja: 2,
  balcony: 1,
  utility: 3,
  store: 2,
  shaft: 0,
  lift: 1,
  lobby: 4,
  other: 3,
};

const WET_ROOMS = new Set(["bathroom", "toilet", "utility", "balcony"]);

function nearestRoom(floor: Floor, point: { x: number; y: number }): Room | null {
  let best: { room: Room; distance: number } | null = null;
  for (const room of floor.rooms) {
    const c = polygonCentroid(room.polygon);
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (!best || d < best.distance) best = { room, distance: d };
  }
  return best?.room ?? null;
}

function pointOnWall(start: { x: number; y: number }, end: { x: number; y: number }, offset: number): { x: number; y: number } {
  const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const ux = (end.x - start.x) / len;
  const uy = (end.y - start.y) / len;
  return { x: start.x + ux * offset, y: start.y + uy * offset };
}

function adjacentWalls(floor: Floor, room: Room): typeof floor.walls {
  return floor.walls.filter((wall) => {
    const midpoint = {
      x: (wall.start.x + wall.end.x) / 2,
      y: (wall.start.y + wall.end.y) / 2,
    };
    return distanceToBoundary(midpoint, room.polygon) < 0.85;
  });
}

function openingKey(floorId: string, openingId: string): string {
  return `${floorId}:${openingId}`;
}

export function buildCostBreakdown(project: Project, estimateInput?: Estimate): CostBreakdown {
  const estimate = estimateInput ?? calculateEstimate(project);
  const rateBook = getRateBook(estimate.rateBook.id);
  const factor = PACKAGE_FACTORS[estimate.package];
  const item = (id: string) => {
    const found = rateBook.items.find((i) => i.id === id);
    if (!found) throw new Error(`RATE_NOT_FOUND: ${id}`);
    return found;
  };
  const lineFor = (
    id: string,
    quantity: number,
    formula: string,
    options: { applyFinishFactor?: boolean; confidence?: CostLine["confidence"] } = {},
  ): CostLine | null => {
    if (quantity <= 0.0001) return null;
    const rateItem = item(id);
    const appliedFactor = options.applyFinishFactor === false ? 1 : factor;
    const gross = quantity * (1 + rateItem.waste);
    return {
      description: rateItem.description,
      quantity: round(quantity, 2),
      unit: rateItem.unit,
      rate: round(rateItem.rate * appliedFactor, 2),
      amount: round(gross * rateItem.rate * appliedFactor, 2),
      formula,
      confidence: options.confidence ?? "measured",
    };
  };

  const floorCosts: FloorCost[] = [];
  const allRooms: RoomCost[] = [];

  // Doors and windows are assigned to the nearest room centroid so a shared
  // opening is counted exactly once in the room roll-up.
  const openingOwners = new Map<string, string>();
  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      for (const opening of wall.openings) {
        const midpoint = pointOnWall(wall.start, wall.end, opening.offset);
        const room = nearestRoom(floor, midpoint);
        if (room) openingOwners.set(openingKey(floor.id, opening.id), room.id);
      }
    }
  }

  for (const floor of project.floors) {
    const rooms: RoomCost[] = [];
    for (const room of floor.rooms) {
      const area = polygonArea(room.polygon);
      const perimeter = polygonPerimeter(room.polygon);
      const walls = adjacentWalls(floor, room);
      const hostedOpenings: Opening[] = [];
      for (const wall of walls) {
        for (const opening of wall.openings) {
          if (openingOwners.get(openingKey(floor.id, opening.id)) === room.id) hostedOpenings.push(opening);
        }
      }
      const doors = hostedOpenings.filter((o) => o.kind === "door").length;
      const windows = hostedOpenings.filter((o) => o.kind === "window").length;
      const openingArea = walls.reduce(
        (sum, wall) =>
          sum +
          wall.openings
            .filter((opening) => openingOwners.get(openingKey(floor.id, opening.id)) === room.id)
            .reduce((s, opening) => s + opening.width * opening.height, 0),
        0,
      );
      const paintArea = Math.max(0, perimeter * (floor.height - 0.1) - openingArea);
      const skirting = Math.max(0, perimeter - doors * 0.95);
      const lines: CostLine[] = [];

      const flooring = lineFor("FLR-01", area, `Clear room area ${area.toFixed(2)} m2 x (1 + tile waste) x rate`, {
        applyFinishFactor: true,
      });
      if (flooring) lines.push(flooring);

      const skirtingLine = lineFor("FLR-02", skirting, `Perimeter ${perimeter.toFixed(2)} m - ${doors} door(s) x 0.95 m`, {
        applyFinishFactor: true,
      });
      if (skirtingLine) lines.push(skirtingLine);

      const paint = lineFor("PNT-01", paintArea, `Perimeter ${perimeter.toFixed(2)} m x wall height - opening area ${openingArea.toFixed(2)} m2`, {
        applyFinishFactor: true,
      });
      if (paint) lines.push(paint);

      if (WET_ROOMS.has(room.type)) {
        const wet = lineFor("WPF-01", area, `Wet-room / balcony clear area ${area.toFixed(2)} m2`, {
          applyFinishFactor: false,
        });
        if (wet) lines.push(wet);
      }

      if (doors > 0) {
        const doorLine = lineFor("DR-01", doors, `${doors} door opening(s) assigned to this room`, {
          applyFinishFactor: true,
        });
        if (doorLine) lines.push(doorLine);
      }
      if (windows > 0) {
        const windowLine = lineFor("DR-02", windows, `${windows} window opening(s) assigned to this room`, {
          applyFinishFactor: true,
        });
        if (windowLine) lines.push(windowLine);
      }

      const points = ELECTRICAL_POINTS[room.type] ?? 3;
      const electrical = lineFor("MEP-01", points, `${points} points allowance for a ${room.type.replace(/_/g, " ")}`, {
        applyFinishFactor: true,
        confidence: "assumed",
      });
      if (electrical) lines.push(electrical);

      if (room.type === "bathroom" || room.type === "toilet") {
        const plumbing = lineFor("MEP-02", 1, "One bathroom plumbing set", {
          applyFinishFactor: true,
          confidence: "assumed",
        });
        if (plumbing) lines.push(plumbing);
      }
      if (room.type === "kitchen") {
        const kitchen = lineFor("INT-01", 1, "Basic modular kitchen allowance", {
          applyFinishFactor: true,
          confidence: "assumed",
        });
        if (kitchen) lines.push(kitchen);
      }
      if (room.type === "master_bedroom" || room.type === "bedroom") {
        const wardrobe = lineFor("INT-02", 1, "Wardrobe allowance per bedroom", {
          applyFinishFactor: true,
          confidence: "assumed",
        });
        if (wardrobe) lines.push(wardrobe);
      }

      const directTotal = round(lines.reduce((s, l) => s + l.amount, 0), 2);
      rooms.push({
        roomId: room.id,
        room: room.name,
        roomType: room.type,
        floorId: floor.id,
        floor: floor.name,
        area: round(area, 2),
        perimeter: round(perimeter, 2),
        doors,
        windows,
        lines,
        directTotal,
        allocatedShared: 0,
        total: directTotal,
        perSqm: area > 0 ? round(directTotal / area, 2) : 0,
      });
    }

    const floorMetric = estimate.perFloor.find((f) => f.floorId === floor.id);
    floorCosts.push({
      floorId: floor.id,
      name: floor.name,
      level: floor.level,
      area: round(rooms.reduce((s, r) => s + r.area, 0), 2),
      builtUpArea: round(floorMetric?.builtUpArea ?? 0, 2),
      rooms,
      directTotal: round(rooms.reduce((s, r) => s + r.directTotal, 0), 2),
      allocatedShared: 0,
      total: 0,
      perSqm: 0,
    });
    allRooms.push(...rooms);
  }

  const directTotal = round(allRooms.reduce((s, r) => s + r.directTotal, 0), 2);
  const sharedTotal = round(Math.max(0, estimate.totals.total - directTotal), 2);
  const roomAreaTotal = allRooms.reduce((s, r) => s + r.area, 0);

  if (roomAreaTotal > 0) {
    for (const room of allRooms) {
      room.allocatedShared = round((sharedTotal * room.area) / roomAreaTotal, 2);
      room.total = round(room.directTotal + room.allocatedShared, 2);
      room.perSqm = room.area > 0 ? round(room.total / room.area, 2) : 0;
    }
  }

  for (const floor of floorCosts) {
    floor.allocatedShared = round(floor.rooms.reduce((s, r) => s + r.allocatedShared, 0), 2);
    floor.total = round(floor.directTotal + floor.allocatedShared, 2);
    floor.perSqm = floor.builtUpArea > 0 ? round(floor.total / floor.builtUpArea, 2) : 0;
  }

  return {
    projectId: project.id,
    revision: project.revision,
    package: estimate.package,
    rateBookId: estimate.rateBook.id,
    generatedAt: new Date().toISOString(),
    floors: floorCosts,
    rooms: allRooms,
    project: {
      plotArea: project.site.area,
      builtUpArea: estimate.perFloor.reduce((s, f) => s + f.builtUpArea, 0),
      directFinishTotal: directTotal,
      allocatedSharedTotal: round(allRooms.reduce((s, r) => s + r.allocatedShared, 0), 2),
      estimateMaterial: estimate.totals.materials,
      estimateLabour: estimate.totals.labour,
      estimateTotal: estimate.totals.total,
      bandLow: estimate.totals.bandLow,
      bandHigh: estimate.totals.bandHigh,
      perSqm: estimate.totals.perSqm,
    },
    allocation: {
      method: "Direct room lines are measured from room polygons and hosted openings, then priced with the active rate book and finish package factor. Shared costs are allocated by clear room area.",
      sharedCostBasis:
        "Shared cost = project indicative total - measured room finish/services lines. It covers structure, common areas, labour, equipment, overheads, margin, GST and contingency.",
      reconciliation:
        Math.abs(allRooms.reduce((s, r) => s + r.total, 0) - estimate.totals.total) < 1
          ? "Room totals reconcile to the project estimate total within INR 1."
          : "Room totals are an allocation view; refer to the project estimate for the authoritative total.",
      directTotal,
      sharedTotal,
      note: "Per-room totals are planning allocations, not quotations. Structural quantities remain benchmarks until engineered.",
    },
    disclaimer:
      "Indicative planning estimate. Not a quotation, tender, statutory valuation or certification. Rates are regional planning benchmarks; verify current market rates and statutory requirements before committing.",
  };
}

export function breakdownCsv(breakdown: CostBreakdown): string {
  const rows: string[][] = [
    ["Floor", "Room", "Type", "Area m2", "Direct finish INR", "Allocated shared INR", "Total INR", "Per m2 INR"],
    ...breakdown.rooms.map((r) => [
      r.floor,
      r.room,
      r.roomType,
      r.area.toFixed(2),
      r.directTotal.toFixed(2),
      r.allocatedShared.toFixed(2),
      r.total.toFixed(2),
      r.perSqm.toFixed(2),
    ]),
    [],
    ["Floor roll-up", "", "", "", "Direct INR", "Shared INR", "Total INR", "Per m2 INR"],
    ...breakdown.floors.map((f) => [
      f.name,
      "",
      "",
      f.area.toFixed(2),
      f.directTotal.toFixed(2),
      f.allocatedShared.toFixed(2),
      f.total.toFixed(2),
      f.perSqm.toFixed(2),
    ]),
    [],
    ["Project", "", "", "", "Materials INR", "Labour INR", "Total INR", "Per m2 INR"],
    [
      "Project total",
      "",
      "",
      breakdown.project.builtUpArea.toFixed(2),
      breakdown.project.estimateMaterial.toFixed(2),
      breakdown.project.estimateLabour.toFixed(2),
      breakdown.project.estimateTotal.toFixed(2),
      breakdown.project.perSqm.toFixed(2),
    ],
  ];
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(escape).join(",")).join("\r\n");
}
