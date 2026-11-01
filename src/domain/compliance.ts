import { bboxOfPolygons, polygonArea, polygonBoundsInside, round, unionArea, wallFootprint } from "./geometry";
import { projectMetrics } from "./measure";
import { sqmToArea } from "./units";
import type { Project, Severity } from "./types";

export type ComplianceStatus = "pass" | "warn" | "fail" | "not_assessed";

export interface ComplianceCheck {
  id: string;
  title: string;
  status: ComplianceStatus;
  value: number;
  valueUnit: string;
  limit: string;
  variance: number;
  varianceUnit: string;
  formula: string;
  note: string;
  floorId?: string;
  severity: Severity;
}

export interface FloorReconciliation {
  floorId: string;
  name: string;
  level: number;
  roomCount: number;
  carpetArea: number;
  roomUnionArea: number;
  builtUpArea: number;
  wallAndCommonShare: number;
  roomUnionVariance: number;
  roomUnionVariancePct: number;
  builtUpGapPct: number;
  status: ComplianceStatus;
  checks: ComplianceCheck[];
  conversions: { sqm: number; sqft: number; gaj: number };
}

export interface AreaCompliance {
  projectId: string;
  revision: number;
  generatedAt: string;
  summary: {
    status: ComplianceStatus;
    pass: number;
    warn: number;
    fail: number;
    notAssessed: number;
    headline: string;
  };
  project: {
    plotArea: number;
    buildableArea: number;
    groundCoverage: number;
    totalCarpet: number;
    totalBuiltUp: number;
    wallShare: number;
    fsi: number;
    rooms: number;
    floors: number;
    status: ComplianceStatus;
    checks: ComplianceCheck[];
    conversions: {
      plot: { sqm: number; sqft: number; gaj: number };
      builtUp: { sqm: number; sqft: number; gaj: number };
      carpet: { sqm: number; sqft: number; gaj: number };
    };
  };
  floors: FloorReconciliation[];
  method: string;
  disclaimer: string;
}

function check(
  id: string,
  title: string,
  status: ComplianceStatus,
  options: {
    value: number;
    valueUnit: string;
    limit: string;
    variance?: number;
    varianceUnit?: string;
    formula: string;
    note: string;
    floorId?: string;
  },
): ComplianceCheck {
  const severity: Severity = status === "fail" ? "error" : status === "warn" ? "warning" : "info";
  return {
    id,
    title,
    status,
    value: round(options.value, 2),
    valueUnit: options.valueUnit,
    limit: options.limit,
    variance: round(options.variance ?? 0, 2),
    varianceUnit: options.varianceUnit ?? options.valueUnit,
    formula: options.formula,
    note: options.note,
    floorId: options.floorId,
    severity,
  };
}

function conversions(area: number) {
  return {
    sqm: round(area, 2),
    sqft: round(sqmToArea(area, "sqft"), 2),
    gaj: round(sqmToArea(area, "gaj"), 3),
  };
}

function statusOf(checks: ComplianceCheck[]): ComplianceStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.every((c) => c.status === "not_assessed")) return "not_assessed";
  return "pass";
}

/**
 * Area reconciliation is intentionally a separate, explicit check rather than
 * a hidden normalisation. Room clear areas are exact shoelace areas; built-up
 * area is the deterministic union of room polygons and wall footprints. The
 * difference is reported as the wall/common share, so a mismatch is visible.
 */
export function buildAreaCompliance(project: Project): AreaCompliance {
  const metrics = projectMetrics(project);
  const floors: FloorReconciliation[] = [];

  for (const floor of project.floors) {
    const metric = metrics.floors.find((f) => f.floorId === floor.id);
    const carpet = floor.rooms.reduce((s, room) => s + polygonArea(room.polygon), 0);
    const roomUnion = unionArea(
      floor.rooms.map((room) => room.polygon),
      0.1,
    );
    const wallUnion = unionArea(
      floor.walls.map((wall) => wallFootprint(wall.start, wall.end, wall.thickness)),
      0.05,
    );
    const builtUp = metric?.builtUpArea ?? carpet;
    const wallShare = builtUp - carpet;
    const roomUnionVariance = carpet - roomUnion;
    const roomUnionVariancePct = carpet > 0 ? (roomUnionVariance / carpet) * 100 : 0;
    const builtUpGapPct = builtUp > 0 ? (wallShare / builtUp) * 100 : 0;
    const zeroRooms = floor.rooms.filter((room) => polygonArea(room.polygon) < 0.35);
    const unionTolerance = Math.max(0.15, carpet * 0.01);

    const checks: ComplianceCheck[] = [
      check(
        "room_sum_vs_union",
        "Room clear areas reconcile with the room union",
        floor.rooms.length === 0 ? "not_assessed" : Math.abs(roomUnionVariance) <= unionTolerance ? "pass" : "fail",
        {
          value: carpet,
          valueUnit: "m²",
          limit: `±${unionTolerance.toFixed(2)} m²`,
          variance: roomUnionVariance,
          formula: "Σ room shoelace areas − 10 cm raster union of room polygons",
          note:
            floor.rooms.length === 0
              ? "No rooms on this floor."
              : Math.abs(roomUnionVariance) <= unionTolerance
                ? "The sum of individual room areas matches the union of the room polygons. Rooms do not double-count overlaps."
                : "Room polygons overlap or do not tile the floor. Fix the overlapping rooms before relying on the area schedule.",
          floorId: floor.id,
        },
      ),
      check(
        "builtup_covers_carpet",
        "Built-up area covers all room clear area",
        floor.rooms.length === 0 ? "not_assessed" : wallShare >= -Math.max(0.1, carpet * 0.002) ? "pass" : "fail",
        {
          value: builtUp,
          valueUnit: "m²",
          limit: "Built-up ≥ Σ room clear areas",
          variance: wallShare,
          formula: "Built-up union − Σ room clear areas = wall footprint share outside rooms",
          note:
            wallShare >= 0
              ? `The remaining ${wallShare.toFixed(2)} m² is the wall footprint share not inside a clear room polygon.`
              : "Built-up is smaller than the room area sum, which is geometrically impossible. Re-run measurement.",
          floorId: floor.id,
        },
      ),
      check(
        "wall_share_plausible",
        "Wall / common share is within a plausible band",
        floor.rooms.length === 0 ? "not_assessed" : builtUpGapPct >= 2 && builtUpGapPct <= 35 ? "pass" : builtUpGapPct > 35 ? "warn" : "warn",
        {
          value: builtUpGapPct,
          valueUnit: "%",
          limit: "2% – 35% of built-up",
          variance: builtUpGapPct - 18.5,
          varianceUnit: "%",
          formula: "(Built-up − Σ room clear areas) ÷ built-up × 100",
          note:
            builtUpGapPct > 35
              ? "A large share of the floor is not assigned to a room. This is often a terrace, balcony or unclosed outline; check whether it should be a room."
              : builtUpGapPct < 2
                ? "Very little wall share was measured. Check wall thickness and room polygon insets."
                : "Wall thickness and room insets produce a normal structural share.",
          floorId: floor.id,
        },
      ),
      check(
        "room_area_positive",
        "Every room has a usable clear area",
        floor.rooms.length === 0 ? "not_assessed" : zeroRooms.length === 0 ? "pass" : "fail",
        {
          value: zeroRooms.length,
          valueUnit: "rooms",
          limit: "0 rooms below 0.35 m²",
          formula: "Count rooms whose clear polygon area is below 0.35 m²",
          note:
            zeroRooms.length === 0
              ? "No degenerate room polygons."
              : `Degenerate rooms: ${zeroRooms.map((r) => r.name).join(", ")}.`,
          floorId: floor.id,
        },
      ),
      check(
        "wall_footprint_present",
        "Walls are present and measurable",
        floor.walls.length === 0 && floor.rooms.length > 0 ? "fail" : floor.walls.length > 0 ? "pass" : "not_assessed",
        {
          value: wallUnion,
          valueUnit: "m²",
          limit: "> 0 m² when rooms exist",
          formula: "Raster union of all wall footprint rectangles on this floor",
          note:
            floor.walls.length === 0 && floor.rooms.length > 0
              ? "Rooms exist without walls, so the built-up / carpet reconciliation cannot be trusted."
              : "Wall footprints contribute to the built-up union.",
          floorId: floor.id,
        },
      ),
    ];

    floors.push({
      floorId: floor.id,
      name: floor.name,
      level: floor.level,
      roomCount: floor.rooms.length,
      carpetArea: round(carpet, 2),
      roomUnionArea: round(roomUnion, 2),
      builtUpArea: round(builtUp, 2),
      wallAndCommonShare: round(wallShare, 2),
      roomUnionVariance: round(roomUnionVariance, 2),
      roomUnionVariancePct: round(roomUnionVariancePct, 2),
      builtUpGapPct: round(builtUpGapPct, 1),
      status: statusOf(checks),
      checks,
      conversions: conversions(carpet),
    });
  }

  const totalCarpet = floors.reduce((s, f) => s + f.carpetArea, 0);
  const totalBuiltUp = floors.reduce((s, f) => s + f.builtUpArea, 0);
  const wallShare = totalBuiltUp - totalCarpet;
  const plot = bboxOfPolygons([project.site.boundary]);
  const plate = {
    minX: plot.minX + project.site.setbacks.left,
    maxX: plot.maxX - project.site.setbacks.right,
    minY: plot.minY + project.site.setbacks.front,
    maxY: plot.maxY - project.site.setbacks.rear,
  };

  const outsideBuildable = project.floors.flatMap((floor) =>
    floor.rooms.filter((room) => !polygonBoundsInside(room.polygon, plate, 0.05)).map((room) => `${floor.name} / ${room.name}`),
  );
  const bedrooms = project.floors
    .flatMap((f) => f.rooms)
    .filter((r) => r.type === "master_bedroom" || r.type === "bedroom").length;
  const bathrooms = project.floors
    .flatMap((f) => f.rooms)
    .filter((r) => r.type === "bathroom" || r.type === "toilet").length;
  const floorCarpetSum = floors.reduce((s, f) => s + f.carpetArea, 0);

  const projectChecks: ComplianceCheck[] = [
    check(
      "floor_carpet_reconciles",
      "Σ floor room areas equals the project carpet area",
      floors.length === 0 ? "not_assessed" : Math.abs(floorCarpetSum - metrics.totalCarpet) <= 0.15 ? "pass" : "fail",
      {
        value: floorCarpetSum,
        valueUnit: "m²",
        limit: `Project carpet ${metrics.totalCarpet.toFixed(2)} m²`,
        variance: floorCarpetSum - metrics.totalCarpet,
        formula: "Σ floor (Σ room clear areas) − project carpet area",
        note:
          Math.abs(floorCarpetSum - metrics.totalCarpet) <= 0.15
            ? "Floor roll-up and project carpet area agree."
            : "Floor areas do not add up to the project carpet area. Recalculate before issuing a report.",
      },
    ),
    check(
      "project_builtup_reconciles",
      "Σ floor built-up areas equals total built-up",
      floors.length === 0 ? "not_assessed" : Math.abs(totalBuiltUp - metrics.totalBuiltUp) <= 0.2 ? "pass" : "fail",
      {
        value: totalBuiltUp,
        valueUnit: "m²",
        limit: `Project built-up ${metrics.totalBuiltUp.toFixed(2)} m²`,
        variance: totalBuiltUp - metrics.totalBuiltUp,
        formula: "Σ floor built-up union − project built-up union",
        note:
          Math.abs(totalBuiltUp - metrics.totalBuiltUp) <= 0.2
            ? "Floor built-up areas roll up cleanly to the project total."
            : "Built-up area totals disagree across floors.",
      },
    ),
    check(
      "ground_coverage",
      "Ground coverage stays within the plot",
      metrics.groundCoverageRatio <= 1.005 ? "pass" : "fail",
      {
        value: metrics.groundCoverageRatio * 100,
        valueUnit: "%",
        limit: "≤ 100% of plot",
        variance: (metrics.groundCoverageRatio - 1) * 100,
        varianceUnit: "%",
        formula: "Ground-floor footprint ÷ plot area × 100",
        note:
          metrics.groundCoverageRatio <= 1.005
            ? "The ground footprint is inside the plot boundary."
            : "The built footprint exceeds the plot. Move or resize geometry.",
      },
    ),
    check(
      "rooms_inside_setbacks",
      "All rooms sit inside the setback envelope",
      project.floors.some((f) => f.rooms.length > 0) && outsideBuildable.length === 0
        ? "pass"
        : project.floors.some((f) => f.rooms.length > 0)
          ? "warn"
          : "not_assessed",
      {
        value: outsideBuildable.length,
        valueUnit: "rooms",
        limit: "0 rooms outside buildable envelope",
        formula: "Room polygon bounds checked against plot boundary inset by front/rear/left/right setbacks",
        note:
          outsideBuildable.length === 0
            ? "All room extents are inside the configured setback envelope."
            : `Outside the envelope: ${outsideBuildable.join("; ")}. This is advisory until the jurisdiction check is run.`,
      },
    ),
    check(
      "brief_bedrooms",
      "Bedrooms meet the brief",
      bedrooms >= project.brief.bedrooms ? "pass" : "warn",
      {
        value: bedrooms,
        valueUnit: "bedrooms",
        limit: `${project.brief.bedrooms} requested`,
        variance: bedrooms - project.brief.bedrooms,
        varianceUnit: "rooms",
        formula: "Count master/bedroom rooms − brief bedrooms",
        note:
          bedrooms >= project.brief.bedrooms
            ? "The plan provides the requested bedroom count."
            : "The plan provides fewer bedrooms than the brief. Add a bedroom or update the brief.",
      },
    ),
    check(
      "brief_bathrooms",
      "Bathrooms meet the brief",
      bathrooms >= project.brief.bathrooms ? "pass" : "warn",
      {
        value: bathrooms,
        valueUnit: "bathrooms",
        limit: `${project.brief.bathrooms} requested`,
        variance: bathrooms - project.brief.bathrooms,
        varianceUnit: "rooms",
        formula: "Count bathroom/toilet rooms − brief bathrooms",
        note:
          bathrooms >= project.brief.bathrooms
            ? "The plan provides the requested bathroom count."
            : "The plan provides fewer bathrooms than the brief. Add a bathroom or update the brief.",
      },
    ),
    check(
      "fsi",
      "Floor space index (informational)",
      floors.length === 0 ? "not_assessed" : "pass",
      {
        value: metrics.fsi,
        valueUnit: "×",
        limit: "Compare with the local jurisdiction pack",
        formula: "Total built-up ÷ plot area",
        note: "FSI is reported for information. A jurisdiction-specific allowable FSI is not asserted in this demo pack.",
      },
    ),
  ];

  const allChecks = [...projectChecks, ...floors.flatMap((f) => f.checks)];
  const pass = allChecks.filter((c) => c.status === "pass").length;
  const warn = allChecks.filter((c) => c.status === "warn").length;
  const fail = allChecks.filter((c) => c.status === "fail").length;
  const notAssessed = allChecks.filter((c) => c.status === "not_assessed").length;
  const status = fail > 0 ? "fail" : warn > 0 ? "warn" : notAssessed === allChecks.length ? "not_assessed" : "pass";

  const headline =
    fail > 0
      ? `${fail} area reconciliation check(s) fail. The room sum and project totals do not yet agree.`
      : warn > 0
        ? `Room areas reconcile with built-up area within tolerance; ${warn} advisory check(s) need attention.`
        : floors.length === 0
          ? "No rooms yet. Draw or generate a plan, then area compliance will be checked."
          : `Compliant: ${totalCarpet.toFixed(2)} m² of room area reconciles with ${totalBuiltUp.toFixed(2)} m² built-up (${wallShare.toFixed(2)} m² wall/common share).`;

  return {
    projectId: project.id,
    revision: project.revision,
    generatedAt: new Date().toISOString(),
    summary: { status, pass, warn, fail, notAssessed, headline },
    project: {
      plotArea: round(metrics.plotArea, 2),
      buildableArea: round(metrics.buildableArea, 2),
      groundCoverage: round(metrics.groundCoverage, 2),
      totalCarpet: round(metrics.totalCarpet, 2),
      totalBuiltUp: round(metrics.totalBuiltUp, 2),
      wallShare: round(wallShare, 2),
      fsi: round(metrics.fsi, 3),
      rooms: metrics.roomCount,
      floors: metrics.floors.length,
      status: statusOf(projectChecks),
      checks: projectChecks,
      conversions: {
        plot: conversions(metrics.plotArea),
        builtUp: conversions(metrics.totalBuiltUp),
        carpet: conversions(metrics.totalCarpet),
      },
    },
    floors,
    method:
      "Room area = exact shoelace area of the stored clear polygon. Built-up = deterministic 10 cm raster union of room polygons and wall footprints (±1%). Carpet = Σ clear room areas. Compliance compares Σ rooms with the union and with built-up, and surfaces the wall/common share instead of hiding it.",
    disclaimer:
      "Area reconciliation is a planning check, not a statutory measurement. Jurisdiction definitions of carpet, built-up and FAR/FSI may differ; confirm with the local authority before submission.",
  };
}
