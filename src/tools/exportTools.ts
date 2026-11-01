import { z } from "zod";
import { newId } from "@/domain/project";
import type { Project } from "@/domain/types";
import { round } from "@/domain/geometry";
import { writeArtifact } from "@/server/store";
import { buildPlanPdf } from "@/server/export/pdf";
import { buildDxf } from "@/server/export/dxf";
import { buildReportHtml } from "@/server/export/report";
import { breakdownCsv, buildCostBreakdown } from "@/domain/breakdown";
import type { ToolDef } from "./types";

function slug(project: Project): string {
  const base = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "project";
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function artifactSummary(project: Project, kind: string) {
  return {
    summary: `Generate ${kind} for revision ${project.revision} (${project.floors.reduce((s, f) => s + f.rooms.length, 0)} rooms, ${project.floors.length} floor(s)).`,
    affected: [{ kind: "artifact", id: "new", label: kind }],
    warnings: ["Exports are generated from the canonical model at this revision and are marked concept-stage."],
  };
}

export const exportTools: ToolDef[] = [
  {
    name: "export_pdf",
    version: "1.0.0",
    group: "Documents & export",
    description:
      "Render the revision to a paginated PDF: per-floor plans, area schedule, advisory checks, preliminary estimate and assumptions. Requires approval.",
    permission: "write",
    mutating: false,
    requiresApproval: true,
    schema: z.object({}),
    approval: (_args, project) => artifactSummary(project, "PDF drawing set"),
    handler: async (draft, _args, ctx) => {
      const bytes = await buildPlanPdf(draft);
      const fileName = `vastiqx-${slug(draft)}-r${draft.revision}-${stamp()}.pdf`;
      const artifact = await writeArtifact(ctx.projectId, fileName, bytes, "PDF drawing set");
      return {
        result: {
          artifact,
          pages_estimate: draft.floors.length + 5,
          revision: draft.revision,
          note: "Deterministic PDF generated from canonical geometry and rate data. Drawing is concept-stage.",
        },
        changed: false,
      };
    },
  },
  {
    name: "export_dxf",
    version: "1.0.0",
    group: "Documents & export",
    description:
      "Export an ASCII DXF (R12) with typed wall, room, opening and text layers in metres. Requires approval.",
    permission: "write",
    mutating: false,
    requiresApproval: true,
    schema: z.object({}),
    approval: (_args, project) => artifactSummary(project, "DXF plan"),
    handler: async (draft, _args, ctx) => {
      const dxf = buildDxf(draft);
      const fileName = `vastiqx-${slug(draft)}-r${draft.revision}-${stamp()}.dxf`;
      const artifact = await writeArtifact(ctx.projectId, fileName, dxf, "DXF plan");
      return {
        result: {
          artifact,
          entity_note: "Walls on A-WALL-EXT/A-WALL-INT, rooms on A-ROOM, openings on A-OPENING, labels on A-TEXT.",
          units: "metres",
          revision: draft.revision,
        },
        changed: false,
      };
    },
  },
  {
    name: "export_json",
    version: "1.0.0",
    group: "Documents & export",
    description:
      "Export the canonical parametric model as JSON with schema version, provenance and revision. Requires approval.",
    permission: "write",
    mutating: false,
    requiresApproval: true,
    schema: z.object({}),
    approval: (_args, project) => artifactSummary(project, "canonical JSON"),
    handler: async (draft, _args, ctx) => {
      const payload = {
        schemaVersion: draft.schemaVersion,
        exportedAt: new Date().toISOString(),
        engine: "vastiqx-export@1.0.0",
        units: "metres",
        currency: "INR",
        project: draft,
      };
      const fileName = `vastiqx-${slug(draft)}-r${draft.revision}.json`;
      const artifact = await writeArtifact(ctx.projectId, fileName, JSON.stringify(payload, null, 2), "Canonical JSON");
      return {
        result: {
          artifact,
          revision: draft.revision,
          note: "Full canonical model including walls, rooms, openings, constraints, Vastu overrides and checkpoints.",
        },
        changed: false,
      };
    },
  },
  {
    name: "generate_project_report",
    version: "1.0.0",
    group: "Documents & export",
    description:
      "Generate a self-contained printable HTML project report with plans, schedules, Vastu, jurisdiction checks, estimate and assumptions. Requires approval.",
    permission: "write",
    mutating: false,
    requiresApproval: true,
    schema: z.object({}),
    approval: (_args, project) => artifactSummary(project, "project report"),
    handler: async (draft, _args, ctx) => {
      const html = buildReportHtml(draft);
      const fileName = `vastiqx-${slug(draft)}-r${draft.revision}-report.html`;
      const artifact = await writeArtifact(ctx.projectId, fileName, html, "Project report");
      return {
        result: {
          artifact,
          printable: true,
          revision: draft.revision,
          note: "Open the file and print to PDF for a shareable report.",
        },
        changed: false,
      };
    },
  },
  {
    name: "export_cost_csv",
    version: "1.0.0",
    group: "Documents & export",
    description:
      "Export a CSV cost pack with room-wise material/finish lines, floor roll-ups and project reconciliation. Requires approval.",
    permission: "write",
    mutating: false,
    requiresApproval: true,
    schema: z.object({}),
    approval: (_args, project) => artifactSummary(project, "cost breakdown CSV"),
    handler: async (draft, _args, ctx) => {
      const breakdown = buildCostBreakdown(draft);
      const fileName = `vastiqx-${slug(draft)}-r${draft.revision}-costs.csv`;
      const artifact = await writeArtifact(ctx.projectId, fileName, breakdownCsv(breakdown), "Cost breakdown CSV");
      return {
        result: {
          artifact,
          rooms: breakdown.rooms.length,
          floors: breakdown.floors.length,
          project_total_inr: breakdown.project.estimateTotal,
          note: "CSV contains room lines, floor roll-ups and project reconciliation.",
        },
        changed: false,
      };
    },
  },
  {
    name: "export_svg_plan",
    version: "1.0.0",
    group: "Documents & export",
    description: "Export a per-floor SVG plan file (all floors in one artifact bundle) for handoff.",
    permission: "write",
    mutating: false,
    requiresApproval: true,
    schema: z.object({}),
    approval: (_args, project) => artifactSummary(project, "SVG plan"),
    handler: async (draft, _args, ctx) => {
      const { planSvg } = await import("@/server/export/svg");
      const sections = draft.floors
        .map(
          (floor) =>
            `<section style="margin:24px 0;font-family:Helvetica,Arial,sans-serif"><h2 style="font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#8a6a45">${floor.name} · revision ${draft.revision}</h2>${planSvg(draft, floor, { title: `${draft.name} — ${floor.name} — R${draft.revision}` })}</section>`,
        )
        .join("\n");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${draft.name} plans</title></head><body style="background:#f7f3ea;padding:24px;max-width:1100px;margin:0 auto">${sections}</body></html>`;
      const fileName = `vastiqx-${slug(draft)}-r${draft.revision}-plans.html`;
      const artifact = await writeArtifact(ctx.projectId, fileName, html, "SVG plan sheet");
      return {
        result: {
          artifact,
          floors: draft.floors.length,
          revision: draft.revision,
          note: "Self-contained HTML containing inline SVG plans.",
        },
        changed: false,
      };
    },
  },
];

export function defaultCheckpointLabel(project: Project): string {
  return `Checkpoint R${project.revision} · ${round(project.floors.reduce((s, f) => s + f.rooms.length, 0), 0)} rooms`;
}

export function newCheckpointId(): string {
  return newId("chk");
}
