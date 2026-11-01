import {
  bbox,
  bboxCenter,
  directionOf,
  distance,
  pointInPolygon,
  polygonCentroid,
  rectPolygon,
} from "./geometry";
import { SECTOR_LABELS } from "./types";
import type { Project, RoomType, SectorCode, Vec2 } from "./types";

export type VastuStatus = "pass" | "advisory" | "fail" | "not_assessed" | "overridden";
export type VastuSeverity = "high" | "medium" | "low";

export interface VastuRule {
  id: string;
  title: string;
  category: "placement" | "entrance" | "geometry" | "centre";
  appliesTo: RoomType[] | "entrance" | "plot";
  preferred: SectorCode[];
  avoid: SectorCode[];
  severity: VastuSeverity;
  explanation: string;
  alternative: string;
  source: string;
}

export interface VastuFinding {
  key: string;
  ruleId: string;
  title: string;
  severity: VastuSeverity;
  status: VastuStatus;
  sector: SectorCode | null;
  entityId: string | null;
  entityName: string;
  floorId: string | null;
  explanation: string;
  alternative: string;
  source: string;
  ruleVersion: string;
  interpretation: "traditional guidance — not statutory code";
  overrideReason?: string;
}

export interface VastuReport {
  profile: { id: string; name: string; version: string; note: string };
  northBearing: number;
  findings: VastuFinding[];
  summary: {
    pass: number;
    advisory: number;
    fail: number;
    not_assessed: number;
    overridden: number;
    assessed: number;
  };
  disclaimer: string;
  /** Compact directional data for the 2D overlay. */
  overlay: {
    centre: Vec2;
    cells: { sector: SectorCode; label: string; polygon: Vec2[]; centre: Vec2 }[];
  };
}

export const VASTU_PROFILE = {
  id: "vastu-general-v1",
  name: "General Vastu guidance (advisory)",
  version: "1.0.0",
  note:
    "A configurable, source-linked rule pack curated for product use. Schools disagree on several rules; findings are advisory and can be overridden with a reason.",
};

export const RULE_VERSION = "vastu-general-v1.0.0";

const SRC_PLACEMENT = "Vastu Shastra general practice — directional room placement (curated v1.0)";
const SRC_ENTRANCE = "Vastu Shastra general practice — entrance orientation (curated v1.0)";
const SRC_CENTRE = "Vastu Purusha Mandala — central zone (curated v1.0)";
const SRC_PLOT = "Vastu Shastra general practice — plot geometry (curated v1.0)";

export const VASTU_RULES: VastuRule[] = [
  {
    id: "VST-KITCHEN-01",
    title: "Kitchen in the south-east (Agni zone)",
    category: "placement",
    appliesTo: ["kitchen"],
    preferred: ["SE", "E"],
    avoid: ["NE", "N", "SW"],
    severity: "high",
    explanation:
      "The south-east is traditionally associated with fire (Agni) and is the preferred kitchen zone. North-east and north kitchens are commonly discouraged.",
    alternative: "Where the south-east is not feasible, relocate cooking to the east and keep the north-east light and open.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-MASTER-01",
    title: "Master bedroom in the south-west",
    category: "placement",
    appliesTo: ["master_bedroom"],
    preferred: ["SW", "S", "W"],
    avoid: ["NE"],
    severity: "high",
    explanation:
      "The south-west is traditionally assigned to the head of the household for stability. North-east master bedrooms are generally avoided.",
    alternative: "If south-west is unavailable, a south or west bedroom is preferred over north-east.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-POOJA-01",
    title: "Pooja room in the north-east",
    category: "placement",
    appliesTo: ["pooja"],
    preferred: ["NE", "E", "N"],
    avoid: ["S", "SW", "SE", "W"],
    severity: "medium",
    explanation:
      "The north-east is traditionally the most sattvic zone and is preferred for prayer and meditation spaces.",
    alternative: "An east-facing pooja niche on the north-east side of another room may be used where a dedicated room is not feasible.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-TOILET-01",
    title: "Toilets away from the north-east",
    category: "placement",
    appliesTo: ["toilet", "bathroom"],
    preferred: ["NW", "W", "S"],
    avoid: ["NE", "E", "N"],
    severity: "medium",
    explanation:
      "Wet and waste-producing spaces are traditionally placed in the north-west, west or south, and kept out of the north-east.",
    alternative: "Relocate the toilet to the north-west or west, or buffer it from the north-east with a utility or store.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-LIVING-01",
    title: "Living space in the north / north-east / east",
    category: "placement",
    appliesTo: ["living"],
    preferred: ["NE", "N", "E", "NW"],
    avoid: [],
    severity: "low",
    explanation:
      "North, north-east and east living areas are traditionally favoured for light and openness.",
    alternative: "A west or south living room is acceptable when daylight and cross-ventilation are demonstrated.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-DINING-01",
    title: "Dining in the west / south-west",
    category: "placement",
    appliesTo: ["dining"],
    preferred: ["W", "SW", "S"],
    avoid: [],
    severity: "low",
    explanation: "The west and south-west are traditional dining zones; the exact position is a soft preference.",
    alternative: "Dining may adjoin the kitchen anywhere circulation and daylight remain adequate.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-STAIR-01",
    title: "Staircase in the south / west / south-west",
    category: "placement",
    appliesTo: ["stair"],
    preferred: ["SW", "S", "W"],
    avoid: ["NE", "N", "E"],
    severity: "medium",
    explanation:
      "Stairs are traditionally located in the south, west or south-west and kept out of the north-east and the central zone.",
    alternative: "A clockwise-rising stair in the south or west is preferred where the north-east layout is fixed.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-STUDY-01",
    title: "Study in the north / north-east / east",
    category: "placement",
    appliesTo: ["study"],
    preferred: ["NE", "N", "E"],
    avoid: [],
    severity: "low",
    explanation: "North and east study spaces are traditionally favoured for focused work and morning light.",
    alternative: "Any quiet, well-lit room can serve as a study.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-BED-01",
    title: "Secondary bedrooms in the west / south / north-west",
    category: "placement",
    appliesTo: ["bedroom"],
    preferred: ["W", "SW", "S", "NW"],
    avoid: [],
    severity: "low",
    explanation:
      "Secondary bedrooms are traditionally placed in the west, south-west or north-west; this is a soft preference.",
    alternative: "Prioritise daylight, privacy and furniture fit over this advisory placement.",
    source: SRC_PLACEMENT,
  },
  {
    id: "VST-ENTRANCE-01",
    title: "Main entrance orientation",
    category: "entrance",
    appliesTo: "entrance",
    preferred: ["N", "NE", "E", "NW"],
    avoid: ["SW", "SE"],
    severity: "high",
    explanation:
      "North, north-east and east entrances are traditionally preferred; south-west and south-east entrances are commonly discouraged.",
    alternative: "Use a north or east entrance where the road side allows; otherwise add a threshold and buffer at the entrance.",
    source: SRC_ENTRANCE,
  },
  {
    id: "VST-CENTRE-01",
    title: "Keep the Brahmasthan (centre) open",
    category: "centre",
    appliesTo: "plot",
    preferred: [],
    avoid: [],
    severity: "medium",
    explanation:
      "The central zone (Brahmasthan) is traditionally kept open. Toilets, kitchens or stairs at the exact centre are commonly discouraged.",
    alternative: "Shift service cores away from the plot centre and keep the central bay as circulation or open space.",
    source: SRC_CENTRE,
  },
  {
    id: "VST-PLOT-01",
    title: "Regular plot geometry",
    category: "geometry",
    appliesTo: "plot",
    preferred: [],
    avoid: [],
    severity: "low",
    explanation:
      "Rectangular or square plots with clean corners are traditionally preferred; irregular cut corners may be flagged for review.",
    alternative: "For irregular plots, keep the built footprint regular and treat cut corners as light wells or landscape.",
    source: SRC_PLOT,
  },
];

const RULE_BY_ID = new Map(VASTU_RULES.map((r) => [r.id, r]));

function ruleStatus(rule: VastuRule, sector: SectorCode): "pass" | "advisory" | "fail" {
  if (rule.avoid.includes(sector)) return "fail";
  if (rule.preferred.includes(sector)) return "pass";
  return "advisory";
}

export function assessVastu(project: Project): VastuReport {
  const b = bbox(project.site.boundary);
  const centre = bboxCenter(b);
  const findings: VastuFinding[] = [];
  const overrideFor = (key: string) => project.vastu.overrides.find((o) => o.findingKey === key);
  const push = (f: Omit<VastuFinding, "key" | "ruleVersion" | "interpretation">) => {
    const key = `${f.ruleId}:${f.entityId ?? "site"}`;
    const override = overrideFor(key);
    findings.push({
      ...f,
      key,
      ruleVersion: RULE_VERSION,
      interpretation: "traditional guidance — not statutory code",
      status: override ? "overridden" : f.status,
      overrideReason: override?.reason,
    });
  };

  for (const floor of project.floors) {
    for (const room of floor.rooms) {
      const rule = VASTU_RULES.find(
        (r) => Array.isArray(r.appliesTo) && (r.appliesTo as RoomType[]).includes(room.type) && r.category === "placement",
      );
      if (!rule) continue;
      const centroid = polygonCentroid(room.polygon);
      const dir = directionOf(centroid, centre, project.site.northBearing);
      push({
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        status: ruleStatus(rule, dir.sector),
        sector: dir.sector,
        entityId: room.id,
        entityName: room.name,
        floorId: floor.id,
        explanation: `${room.name} sits in the ${SECTOR_LABELS[dir.sector]} sector. ${rule.explanation}`,
        alternative: rule.alternative,
        source: rule.source,
      });
    }
  }

  // Entrance: choose the widest door on an external wall.
  const entranceCandidates = project.floors.flatMap((floor) =>
    floor.walls
      .filter((w) => w.type === "external_masonry" || w.type === "party_wall")
      .flatMap((w) =>
        w.openings
          .filter((o) => o.kind === "door")
          .map((o) => {
            const len = distance(w.start, w.end);
            const t = len > 0 ? o.offset / len : 0;
            const point = {
              x: w.start.x + (w.end.x - w.start.x) * t,
              y: w.start.y + (w.end.y - w.start.y) * t,
            };
            return { floor, opening: o, width: o.width, point };
          }),
      ),
  );
  const entrance = entranceCandidates.sort((a, c) => c.width - a.width)[0];
  if (entrance) {
    const dir = directionOf(entrance.point, centre, project.site.northBearing);
    const rule = RULE_BY_ID.get("VST-ENTRANCE-01")!;
    push({
      ruleId: rule.id,
      title: rule.title,
      severity: rule.severity,
      status: ruleStatus(rule, dir.sector),
      sector: dir.sector,
      entityId: entrance.opening.id,
      entityName: "Main entrance",
      floorId: entrance.floor.id,
      explanation: `The main entrance faces ${SECTOR_LABELS[dir.sector]}. ${rule.explanation}`,
      alternative: rule.alternative,
      source: rule.source,
    });
  } else {
    const rule = RULE_BY_ID.get("VST-ENTRANCE-01")!;
    push({
      ruleId: rule.id,
      title: rule.title,
      severity: rule.severity,
      status: "not_assessed",
      sector: null,
      entityId: null,
      entityName: "Main entrance",
      floorId: null,
      explanation: "No door on an external wall was found, so entrance orientation cannot be assessed.",
      alternative: rule.alternative,
      source: rule.source,
    });
  }

  // Brahmasthan: central third of the plot bounding box.
  const cx0 = b.minX + (b.maxX - b.minX) / 3;
  const cx1 = b.maxX - (b.maxX - b.minX) / 3;
  const cy0 = b.minY + (b.maxY - b.minY) / 3;
  const cy1 = b.maxY - (b.maxY - b.minY) / 3;
  const centrePoly = rectPolygon(cx0, cy0, cx1, cy1);
  const central = project.floors.flatMap((floor) =>
    floor.rooms
      .filter((r) => pointInPolygon(polygonCentroid(r.polygon), centrePoly))
      .map((r) => ({ floor, room: r })),
  );
  const ruleCentre = RULE_BY_ID.get("VST-CENTRE-01")!;
  if (project.floors.every((f) => f.rooms.length === 0)) {
    push({
      ruleId: ruleCentre.id,
      title: ruleCentre.title,
      severity: ruleCentre.severity,
      status: "not_assessed",
      sector: null,
      entityId: null,
      entityName: "Brahmasthan",
      floorId: null,
      explanation: "No rooms exist yet, so the central zone cannot be assessed.",
      alternative: ruleCentre.alternative,
      source: ruleCentre.source,
    });
  } else if (central.length === 0) {
    push({
      ruleId: ruleCentre.id,
      title: ruleCentre.title,
      severity: ruleCentre.severity,
      status: "pass",
      sector: null,
      entityId: null,
      entityName: "Brahmasthan",
      floorId: null,
      explanation: "No room centroid falls in the central third of the plot; the central zone remains comparatively open.",
      alternative: ruleCentre.alternative,
      source: ruleCentre.source,
    });
  } else {
    for (const { floor, room } of central) {
      const problematic = ["toilet", "bathroom", "kitchen", "stair"].includes(room.type);
      push({
        ruleId: ruleCentre.id,
        title: ruleCentre.title,
        severity: ruleCentre.severity,
        status: problematic ? "fail" : "advisory",
        sector: null,
        entityId: room.id,
        entityName: room.name,
        floorId: floor.id,
        explanation: `${room.name} occupies the central third of the plot. ${ruleCentre.explanation}`,
        alternative: ruleCentre.alternative,
        source: ruleCentre.source,
      });
    }
  }

  // Plot geometry.
  const rulePlot = RULE_BY_ID.get("VST-PLOT-01")!;
  const boundary = project.site.boundary;
  const orthogonal =
    boundary.length === 4 &&
    boundary.every((p, i) => {
      const q = boundary[(i + 1) % boundary.length]!;
      return Math.abs(p.x - q.x) < 0.02 || Math.abs(p.y - q.y) < 0.02;
    });
  push({
    ruleId: rulePlot.id,
    title: rulePlot.title,
    severity: rulePlot.severity,
    status: orthogonal ? "pass" : "advisory",
    sector: null,
    entityId: null,
    entityName: "Plot boundary",
    floorId: null,
    explanation: orthogonal
      ? "The plot is a regular orthogonal quadrilateral."
      : "The plot boundary is irregular; Vastu traditions treat cut corners differently and a designer should review the entry and corners.",
    alternative: rulePlot.alternative,
    source: rulePlot.source,
  });

  const summary = {
    pass: findings.filter((f) => f.status === "pass").length,
    advisory: findings.filter((f) => f.status === "advisory").length,
    fail: findings.filter((f) => f.status === "fail").length,
    not_assessed: findings.filter((f) => f.status === "not_assessed").length,
    overridden: findings.filter((f) => f.status === "overridden").length,
    assessed: findings.filter((f) => f.status !== "not_assessed").length,
  };

  const cellCentres: Record<SectorCode, Vec2> = {
    NW: { x: cx0, y: cy1 },
    N: { x: centre.x, y: b.maxY - (b.maxY - b.minY) / 12 },
    NE: { x: cx1, y: cy1 },
    W: { x: cx0, y: centre.y },
    E: { x: cx1, y: centre.y },
    SW: { x: cx0, y: cy0 },
    S: { x: centre.x, y: b.minY + (b.maxY - b.minY) / 12 },
    SE: { x: cx1, y: cy0 },
  };
  const overlayCells = (Object.keys(cellCentres) as SectorCode[]).map((sector) => {
    const c = cellCentres[sector];
    const w = (cx1 - cx0) / 2;
    const d = (cy1 - cy0) / 2;
    return {
      sector,
      label: SECTOR_LABELS[sector],
      centre: c,
      polygon:
        sector === "N"
          ? rectPolygon(cx0, cy1, cx1, b.maxY)
          : sector === "S"
            ? rectPolygon(cx0, b.minY, cx1, cy0)
            : sector === "W"
              ? rectPolygon(b.minX, cy0, cx0, cy1)
              : sector === "E"
                ? rectPolygon(cx1, cy0, b.maxX, cy1)
                : rectPolygon(c.x - w / 2, c.y - d / 2, c.x + w / 2, c.y + d / 2),
    };
  });
  return {
    profile: VASTU_PROFILE,
    northBearing: project.site.northBearing,
    findings,
    summary,
    disclaimer:
      "Vastu output is traditional guidance, not statutory code, engineering advice or a scientific guarantee. No composite score is shown because schools and weights differ. Overrides are recorded in project history.",
    overlay: { centre, cells: overlayCells },
  };
}

export function overrideVastuFinding(project: Project, findingKey: string, reason: string, actorId: string): void {
  project.vastu.overrides.push({ findingKey, reason, actorId, at: new Date().toISOString() });
}

export function clearVastuOverride(project: Project, findingKey: string): void {
  project.vastu.overrides = project.vastu.overrides.filter((o) => o.findingKey !== findingKey);
}
