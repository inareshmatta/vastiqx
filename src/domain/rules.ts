import { bbox, polygonArea, polygonBoundsInside } from "./geometry";
import { buildableBounds, projectMetrics } from "./measure";
import type { Project } from "./types";

export type RuleStatus = "pass" | "fail" | "not_assessed";

export interface RuleCheck {
  ruleId: string;
  title: string;
  status: RuleStatus;
  value: string;
  limit: string;
  formula: string;
  source: string;
  effectiveDate: string;
  note?: string;
}

export interface RuleCheckReport {
  pack: {
    id: string;
    name: string;
    jurisdiction: string;
    source: string;
    effectiveDate: string;
    reviewDate: string;
    confidence: "indicative";
  };
  checks: RuleCheck[];
  summary: { pass: number; fail: number; not_assessed: number };
  disclaimer: string;
}

export const RULE_PACK = {
  id: "IN-KA-BLR-DEMO-2026",
  name: "Bengaluru residential — indicative demo pack",
  jurisdiction: "Bengaluru, Karnataka, India",
  source:
    "Curated demonstration dataset derived from commonly published plot/setback and FAR concepts. NOT an official bye-law extract and not legal advice.",
  effectiveDate: "2026-04-01",
  reviewDate: "2027-04-01",
  confidence: "indicative" as const,
};

export function checkSiteRules(project: Project): RuleCheckReport {
  const metrics = projectMetrics(project);
  const b = bbox(project.site.boundary);
  const buildable = buildableBounds(project);
  const groundFloor = project.floors[0];
  const footprintPolys = groundFloor ? groundFloor.rooms.map((r) => r.polygon) : [];
  const footprintInside = footprintPolys.every((p) => polygonBoundsInside(p, buildable, 0.05));
  const hasFootprint = footprintPolys.length > 0;
  const checks: RuleCheck[] = [];

  checks.push({
    ruleId: "BLR-SETBACK-01",
    title: "Buildings respect the setback envelope",
    status: !hasFootprint ? "not_assessed" : footprintInside ? "pass" : "fail",
    value: hasFootprint ? (footprintInside ? "Inside envelope" : "Footprint outside envelope") : "No built footprint yet",
    limit: `Front ${project.site.setbacks.front} m, rear ${project.site.setbacks.rear} m, sides ${project.site.setbacks.left}/${project.site.setbacks.right} m`,
    formula: "Every ground-floor room polygon must lie within the plot boundary inset by the site setbacks.",
    source: `${RULE_PACK.source} Setback assumptions are user-editable.`,
    effectiveDate: RULE_PACK.effectiveDate,
    note: "Actual setbacks vary by road width, plot size and authority. Treat as provisional.",
  });

  checks.push({
    ruleId: "BLR-COVERAGE-01",
    title: "Ground coverage within 65%",
    status: !hasFootprint ? "not_assessed" : metrics.groundCoverageRatio <= 0.65 ? "pass" : "fail",
    value: `${(metrics.groundCoverageRatio * 100).toFixed(1)}% (${metrics.groundCoverage.toFixed(1)} m2)`,
    limit: "<= 65% of plot area",
    formula: "Ground coverage = ground-floor built-up area (rooms + walls) / plot area.",
    source: `${RULE_PACK.source} 65% is a configurable demo limit, not a universal rule.`,
    effectiveDate: RULE_PACK.effectiveDate,
  });

  checks.push({
    ruleId: "BLR-FAR-01",
    title: "Floor area ratio within 2.25",
    status: metrics.totalBuiltUp === 0 ? "not_assessed" : metrics.fsi <= 2.25 ? "pass" : "fail",
    value: `${metrics.fsi.toFixed(2)} (${metrics.totalBuiltUp.toFixed(1)} m2 built-up / ${metrics.plotArea.toFixed(1)} m2 plot)`,
    limit: "<= 2.25 FAR (demo)",
    formula: "FAR = total built-up area across floors / plot area.",
    source: `${RULE_PACK.source} FAR depends on road width and jurisdiction; replace this pack before real use.`,
    effectiveDate: RULE_PACK.effectiveDate,
  });

  const totalHeight = project.floors.reduce((s, f) => s + f.height, 0);
  checks.push({
    ruleId: "BLR-HEIGHT-01",
    title: "Building height within 11.5 m",
    status: project.floors.length === 0 ? "not_assessed" : totalHeight <= 11.5 ? "pass" : "fail",
    value: `${totalHeight.toFixed(2)} m over ${project.floors.length} floor(s)`,
    limit: "<= 11.5 m (demo)",
    formula: "Building height = sum of floor-to-floor heights.",
    source: `${RULE_PACK.source} Height limits depend on plot size, road width and fire access.`,
    effectiveDate: RULE_PACK.effectiveDate,
  });

  checks.push({
    ruleId: "BLR-PARKING-01",
    title: "Off-street parking provided",
    status: project.floors.every((f) => f.rooms.every((r) => r.type !== "parking"))
      ? project.brief.parking
        ? "fail"
        : "not_assessed"
      : "pass",
    value: project.floors.some((f) => f.rooms.some((r) => r.type === "parking"))
      ? "Parking space present in the model"
      : project.brief.parking
        ? "Required by brief but absent from the plan"
        : "Not specified",
    limit: "At least one car space when the brief requires parking",
    formula: "Presence of a room of type 'parking' on the ground floor.",
    source: `${RULE_PACK.source} Parking norms vary by unit size and authority.`,
    effectiveDate: RULE_PACK.effectiveDate,
  });

  checks.push({
    ruleId: "BLR-ROAD-01",
    title: "Road width supports the proposed use",
    status: "not_assessed",
    value: project.site.roadEdges.map((r) => `${r.side}: ${r.width} m`).join(", ") || "No road edge recorded",
    limit: "Depends on authority and frontage",
    formula: "Requires the abutting road width from the authority record.",
    source: RULE_PACK.source,
    effectiveDate: RULE_PACK.effectiveDate,
    note: "NOT ASSESSED: the road width is user-entered and has not been verified against an authority dataset.",
  });

  checks.push({
    ruleId: "BLR-VENT-01",
    title: "Every habitable room has an external opening",
    status: "not_assessed",
    value: "Ventilation rule data not loaded",
    limit: "Habitable rooms require adequate light and ventilation",
    formula: "Requires rule-pack data for opening-to-floor-area ratios.",
    source: `${RULE_PACK.source} Ventilation dataset is not part of this demo pack.`,
    effectiveDate: RULE_PACK.effectiveDate,
    note: "NOT ASSESSED rather than reported as compliant.",
  });

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    not_assessed: checks.filter((c) => c.status === "not_assessed").length,
  };

  return {
    pack: {
      id: RULE_PACK.id,
      name: RULE_PACK.name,
      jurisdiction: RULE_PACK.jurisdiction,
      source: RULE_PACK.source,
      effectiveDate: RULE_PACK.effectiveDate,
      reviewDate: RULE_PACK.reviewDate,
      confidence: RULE_PACK.confidence,
    },
    checks,
    summary,
    disclaimer:
      "Demonstration rule pack only. VastiqX does not certify compliance, approve permits or replace a qualified local professional. Items without verified inputs are reported as NOT ASSESSED, never as compliant.",
  };
}

/** Site-level geometry diagnostics shown alongside the regulatory checks. */
export function siteDiagnostics(project: Project): string[] {
  const out: string[] = [];
  const area = polygonArea(project.site.boundary);
  out.push(`Plot area ${area.toFixed(2)} m2, perimeter ${project.site.boundary.length} vertices.`);
  const b = bbox(project.site.boundary);
  out.push(`Plot extents ${(b.maxX - b.minX).toFixed(2)} m x ${(b.maxY - b.minY).toFixed(2)} m.`);
  if (project.site.roadEdges.length === 0) out.push("No road edge recorded; front setback is assumed.");
  return out;
}
