import { calculateEstimate, takeoffQuantities } from "@/domain/boq";
import { buildCostBreakdown } from "@/domain/breakdown";
import { buildAreaCompliance } from "@/domain/compliance";
import { buildElevations } from "@/domain/elevations";
import { projectMaterialPack } from "@/domain/calculator";
import { projectMetrics } from "@/domain/measure";
import { checkSiteRules } from "@/domain/rules";
import { areaSchedule } from "@/domain/schedule";
import { designTemplateCatalogue } from "@/domain/templates";
import { buildScene } from "@/domain/threed";
import { assessVastu } from "@/domain/vastu";
import type { Project } from "@/domain/types";
import * as store from "./store";

export interface ProjectView {
  project: Project;
  metrics: ReturnType<typeof projectMetrics>;
  schedule: ReturnType<typeof areaSchedule>;
  vastu: ReturnType<typeof assessVastu>;
  rules: ReturnType<typeof checkSiteRules>;
  estimate: ReturnType<typeof calculateEstimate>;
  breakdown: ReturnType<typeof buildCostBreakdown>;
  compliance: ReturnType<typeof buildAreaCompliance>;
  elevations: ReturnType<typeof buildElevations>;
  materialPack: ReturnType<typeof projectMaterialPack>;
  design: ReturnType<typeof designTemplateCatalogue>;
  scene: ReturnType<typeof buildScene>;
  candidates: Awaited<ReturnType<typeof store.readCandidates>>;
  approvals: Awaited<ReturnType<typeof store.listApprovals>>;
  artifacts: Awaited<ReturnType<typeof store.listArtifacts>>;
  audit: Awaited<ReturnType<typeof store.readAudit>>;
  history: { undo: number; redo: number };
  servedAt: string;
}

export async function buildProjectView(projectId: string): Promise<ProjectView | null> {
  const project = await store.readProject(projectId);
  if (!project) return null;
  const [candidates, approvals, artifacts, audit, history] = await Promise.all([
    store.readCandidates(projectId),
    store.listApprovals(projectId),
    store.listArtifacts(projectId),
    store.readAudit(projectId, 60),
    store.historyDepth(projectId),
  ]);

  const takeoff = takeoffQuantities(project);
  return {
    project,
    metrics: projectMetrics(project),
    schedule: areaSchedule(project),
    vastu: assessVastu(project),
    rules: checkSiteRules(project),
    estimate: calculateEstimate(project),
    breakdown: buildCostBreakdown(project),
    compliance: buildAreaCompliance(project),
    elevations: buildElevations(project),
    materialPack: projectMaterialPack(takeoff),
    design: designTemplateCatalogue(project),
    scene: buildScene(project, { includeRoof: true }),
    candidates,
    approvals: approvals.slice(0, 30),
    artifacts,
    audit,
    history,
    servedAt: new Date().toISOString(),
  };
}

export function compactEngineLabel(): string {
  return "vastiqx-view@1.0.0";
}
