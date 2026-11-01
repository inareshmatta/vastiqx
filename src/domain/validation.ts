import {
  bbox,
  bboxWidth,
  bboxDepth,
  distancePointToSegment,
  distance,
  polygonArea,
  polygonBoundsInside,
  polygonOverlapArea,
  polygonSelfIntersects,
  samePoint,
  segmentsOverlapCollinear,
} from "./geometry";
import { buildableRect, floorMetrics } from "./measure";
import type { Project, ValidationFinding } from "./types";

export interface ValidationResult {
  ok: boolean;
  findings: ValidationFinding[];
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
}

const MIN_WALL_LENGTH = 0.15;
const MIN_ROOM_AREA = 0.5;

export function validateProject(project: Project): ValidationResult {
  const findings: ValidationFinding[] = [];

  const site = project.site;
  if (site.boundary.length < 3) {
    findings.push({
      code: "INVALID_SITE_BOUNDARY",
      severity: "error",
      message: "The plot boundary needs at least three vertices.",
      entityKind: "site",
    });
  }
  if (polygonSelfIntersects(site.boundary)) {
    findings.push({
      code: "INVALID_SITE_BOUNDARY",
      severity: "error",
      message: "The plot boundary is self-intersecting.",
      entityKind: "site",
    });
  }
  if (polygonArea(site.boundary) < 9) {
    findings.push({
      code: "INVALID_SITE_BOUNDARY",
      severity: "error",
      message: "Plot area is below the 9 m2 minimum.",
      entityKind: "site",
    });
  }
  const buildable = buildableRect(project);
  if (buildable.x1 - buildable.x0 < 1.5 || buildable.y1 - buildable.y0 < 1.5) {
    findings.push({
      code: "SETBACKS_CONSUME_PLOT",
      severity: "error",
      message: "Setbacks leave less than 1.5 m of buildable width or depth.",
      entityKind: "site",
      hint: "Reduce front/rear/side setbacks.",
    });
  }

  for (const floor of project.floors) {
    const b = bbox(floor.walls.flatMap((w) => [w.start, w.end]));
    if (floor.walls.length > 0 && bboxWidth(b) === 0 && bboxDepth(b) === 0) {
      findings.push({
        code: "INVALID_GEOMETRY",
        severity: "error",
        message: `Floor ${floor.name} has no usable extents.`,
        floorId: floor.id,
      });
    }

    for (const wall of floor.walls) {
      const len = distance(wall.start, wall.end);
      if (!Number.isFinite(len) || len < MIN_WALL_LENGTH) {
        findings.push({
          code: "INVALID_GEOMETRY",
          severity: "error",
          message: `Wall is shorter than ${MIN_WALL_LENGTH} m.`,
          entityId: wall.id,
          entityKind: "wall",
          floorId: floor.id,
          hint: "Delete the wall or give it a valid length.",
        });
      }
      if (!Number.isFinite(wall.thickness) || wall.thickness < 0.05 || wall.thickness > 0.6) {
        findings.push({
          code: "INVALID_GEOMETRY",
          severity: "error",
          message: "Wall thickness must be between 0.05 m and 0.60 m.",
          entityId: wall.id,
          entityKind: "wall",
          floorId: floor.id,
        });
      }
      if (!Number.isFinite(wall.height) || wall.height < 1.8 || wall.height > 6) {
        findings.push({
          code: "INVALID_GEOMETRY",
          severity: "error",
          message: "Wall height must be between 1.8 m and 6.0 m.",
          entityId: wall.id,
          entityKind: "wall",
          floorId: floor.id,
        });
      }
      for (const opening of wall.openings) {
        if (opening.width <= 0 || opening.height <= 0) {
          findings.push({
            code: "INVALID_GEOMETRY",
            severity: "error",
            message: "Openings need positive width and height.",
            entityId: opening.id,
            entityKind: "opening",
            floorId: floor.id,
          });
        }
        if (opening.offset - opening.width / 2 < -0.01 || opening.offset + opening.width / 2 > len + 0.01) {
          findings.push({
            code: "OPENING_OUT_OF_BOUNDS",
            severity: "error",
            message: `Opening "${opening.label ?? opening.kind}" does not fit on its host wall.`,
            entityId: opening.id,
            entityKind: "opening",
            floorId: floor.id,
            hint: "Move the opening or shorten it.",
          });
        }
      }
    }

    for (const room of floor.rooms) {
      const area = polygonArea(room.polygon);
      if (room.polygon.length < 3 || !Number.isFinite(area) || area < MIN_ROOM_AREA) {
        findings.push({
          code: "INVALID_GEOMETRY",
          severity: "error",
          message: `Room "${room.name}" has an invalid or too-small polygon.`,
          entityId: room.id,
          entityKind: "room",
          floorId: floor.id,
        });
        continue;
      }
      if (polygonSelfIntersects(room.polygon)) {
        findings.push({
          code: "INVALID_GEOMETRY",
          severity: "error",
          message: `Room "${room.name}" has a self-intersecting boundary.`,
          entityId: room.id,
          entityKind: "room",
          floorId: floor.id,
        });
      }
      if (!polygonBoundsInside(room.polygon, { minX: buildable.x0, minY: buildable.y0, maxX: buildable.x1, maxY: buildable.y1 }, 0.35)) {
        findings.push({
          code: "OUT_OF_BOUNDS",
          severity: "warning",
          message: `Room "${room.name}" extends into the setback envelope.`,
          entityId: room.id,
          entityKind: "room",
          floorId: floor.id,
          hint: "Move the room inside the buildable area to satisfy setbacks.",
        });
      }
      if (room.type !== "balcony" && room.type !== "parking") {
        const hasDoor = floor.walls.some((w) =>
          w.openings.some((o) => {
            if (o.kind !== "door") return false;
            const a = w.start;
            const b = w.end;
            const len = distance(a, b);
            if (len < 1e-6) return false;
            const ux = (b.x - a.x) / len;
            const uy = (b.y - a.y) / len;
            const centre = { x: a.x + ux * o.offset, y: a.y + uy * o.offset };
            for (let i = 0; i < room.polygon.length; i++) {
              const p1 = room.polygon[i]!;
              const p2 = room.polygon[(i + 1) % room.polygon.length]!;
              if (distancePointToSegment(centre, p1, p2) < 0.45) return true;
            }
            return false;
          }),
        );
        if (!hasDoor) {
          findings.push({
            code: "NO_DOOR",
            severity: "warning",
            message: `Room "${room.name}" has no door on a bounding wall.`,
            entityId: room.id,
            entityKind: "room",
            floorId: floor.id,
            hint: "Add a door for circulation.",
          });
        }
      }
    }

    for (let i = 0; i < floor.rooms.length; i++) {
      for (let j = i + 1; j < floor.rooms.length; j++) {
        const a = floor.rooms[i]!;
        const b = floor.rooms[j]!;
        const ba = bbox(a.polygon);
        const bb = bbox(b.polygon);
        if (ba.maxX <= bb.minX || bb.maxX <= ba.minX || ba.maxY <= bb.minY || bb.maxY <= ba.minY) continue;
        const overlap = polygonOverlapArea(a.polygon, b.polygon, 0.05);
        if (overlap > 0.25) {
          findings.push({
            code: "ROOM_OVERLAP",
            severity: "error",
            message: `Rooms "${a.name}" and "${b.name}" overlap by ${overlap.toFixed(2)} m2.`,
            entityId: a.id,
            entityKind: "room",
            floorId: floor.id,
            hint: "Resize or move one of the rooms.",
          });
        }
      }
    }

    for (let i = 0; i < floor.walls.length; i++) {
      for (let j = i + 1; j < floor.walls.length; j++) {
        const a = floor.walls[i]!;
        const b = floor.walls[j]!;
        if (samePoint(a.start, b.start) && samePoint(a.end, b.end)) {
          findings.push({
            code: "DUPLICATE_WALL",
            severity: "warning",
            message: "Two walls share the same baseline.",
            entityId: a.id,
            entityKind: "wall",
            floorId: floor.id,
          });
        } else if (segmentsOverlapCollinear(a.start, a.end, b.start, b.end)) {
          findings.push({
            code: "DUPLICATE_WALL",
            severity: "warning",
            message: "Two walls partially overlap along the same baseline.",
            entityId: a.id,
            entityKind: "wall",
            floorId: floor.id,
            hint: "Merge the walls or move an endpoint.",
          });
        }
      }
    }

    const metrics = floorMetrics(project, floor);
    if (metrics.builtUpArea > 0 && metrics.roomArea > metrics.builtUpArea + 0.5) {
      findings.push({
        code: "AREA_RECONCILIATION",
        severity: "error",
        message: "Net room area exceeds built-up area on this floor.",
        floorId: floor.id,
      });
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  return { ok: errors.length === 0, findings, errors, warnings };
}
