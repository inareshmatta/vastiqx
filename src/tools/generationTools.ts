import { z } from "zod";
import { polygonArea, round } from "@/domain/geometry";
import { generateLayoutOptions, type LayoutWeights } from "@/domain/layout";
import { projectMetrics } from "@/domain/measure";
import { validateProject } from "@/domain/validation";
import type { LayoutCandidate } from "@/domain/types";
import { findRoom } from "./helpers";
import type { ToolDef } from "./types";
import { ToolError } from "./types";

function compactCandidate(candidate: LayoutCandidate) {
  return {
    candidate_id: candidate.candidateId,
    name: candidate.name,
    description: candidate.description,
    scores: candidate.scores,
    estimate_total_inr: candidate.estimateTotal,
    vastu: candidate.vastuSummary,
    built_up_m2: candidate.metrics.totalBuiltUp,
    carpet_m2: candidate.metrics.totalCarpet,
    rooms: candidate.metrics.roomCount,
    floors: candidate.floors.map((f) => ({
      floor_id: f.id,
      name: f.name,
      rooms: f.rooms.map((r) => ({ name: r.name, type: r.type, area_m2: round(polygonArea(r.polygon), 1) })),
      wall_count: f.walls.length,
      opening_count: f.walls.reduce((s, w) => s + w.openings.length, 0),
    })),
    persisted: false,
  };
}

const weightsSchema = z
  .object({
    space_efficiency: z.number().min(0).max(1),
    vastu_alignment: z.number().min(0).max(1),
    circulation: z.number().min(0).max(1),
    daylight_potential: z.number().min(0).max(1),
    cost: z.number().min(0).max(1),
  })
  .partial();

export const generationTools: ToolDef[] = [
  {
    name: "generate_layout_options",
    version: "1.0.0",
    group: "Generation",
    description:
      "Run the deterministic orthogonal layout engine. Returns non-persisted candidate proposals with scores, metrics, Vastu summary and estimate total. Nothing is applied to the project until apply_design_proposal succeeds.",
    permission: "write",
    mutating: false,
    schema: z.object({
      objective_weights: weightsSchema.optional(),
      max_options: z.number().int().min(1).max(3).default(3),
      floors: z.array(z.string()).max(4).optional(),
      program_description: z.string().max(1000).optional(),
    }),
    handler: (draft, args, ctx) => {
      if (draft.floors.length > 4) {
        throw new ToolError("CONSTRAINT_CONFLICT", "The MVP layout engine supports up to four floors.");
      }
      ctx.progress({ type: "stage", message: "Fitting the room program to the buildable envelope", pct: 10 });
      const candidates = generateLayoutOptions(
        draft,
        {
          objective_weights: (args.objective_weights ?? undefined) as Partial<LayoutWeights> | undefined,
          max_options: args.max_options,
          floors: args.floors,
          program_description: args.program_description,
        },
        (candidate) => ctx.progress({ type: "candidate", candidate }),
      );
      if (candidates.length === 0) {
        throw new ToolError(
          "INVALID_GEOMETRY",
          "The layout engine could not fit a plan into the buildable envelope. Increase the plot or reduce setbacks.",
          { hints: ["Check setbacks and the room program size."] },
        );
      }
      const best = candidates[0]!;
      return {
        result: {
          count: candidates.length,
          candidates: candidates.map(compactCandidate),
          recommended_candidate_id: best.candidateId,
          note: "Candidates are proposals only. Call apply_design_proposal with a candidate_id to commit one.",
        },
        candidates,
        changed: false,
      };
    },
  },
  {
    name: "get_design_candidates",
    version: "1.0.0",
    group: "Generation",
    description: "Read the current non-persisted layout candidates generated for this project revision.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (_draft, _args, ctx) => ({
      result: { candidates: ctx.candidates.map(compactCandidate), note: "Proposals only; not part of the canonical model." },
      changed: false,
    }),
  },
  {
    name: "apply_design_proposal",
    version: "1.0.0",
    group: "Generation",
    description:
      "Commit one generated candidate to the canonical model. Replaces all floors with the candidate's software-generated geometry. Requires approval.",
    permission: "admin",
    mutating: true,
    requiresApproval: true,
    schema: z.object({ candidate_id: z.string().min(1) }),
    approval: (args) => ({
      summary: `Apply design proposal ${args.candidate_id}: replace all floors with the generated plan.`,
      affected: [{ kind: "project", id: args.candidate_id, label: "Generated layout" }],
      warnings: ["This is a large-scale rearrangement and replaces the current floor geometry."],
    }),
    handler: (draft, args, ctx) => {
      const candidate = ctx.candidates.find((c) => c.candidateId === args.candidate_id);
      if (!candidate) {
        throw new ToolError("MISSING_INPUT", `Candidate ${args.candidate_id} was not generated for this project.`, {
          hints: ["Call generate_layout_options first, then apply one of the returned ids."],
        });
      }
      if (candidate.floors.length === 0) {
        throw new ToolError("INVALID_GEOMETRY", "The candidate contains no floors.");
      }
      draft.floors = structuredClone(candidate.floors);
      draft.floors.forEach((floor, index) => {
        floor.level = index;
        floor.source = "generated";
      });
      draft.brief.floors = draft.floors.length;
      const metrics = projectMetrics(draft);
      return {
        result: {
          applied_candidate_id: candidate.candidateId,
          name: candidate.name,
          revision_metrics: {
            rooms: metrics.roomCount,
            built_up_m2: metrics.totalBuiltUp,
            carpet_m2: metrics.totalCarpet,
            fsi: metrics.fsi,
          },
          note: "Candidate committed as canonical generated geometry. Dependent areas, 3D, Vastu and estimates must be recalculated.",
        },
        updatedIds: draft.floors.flatMap((f) => [f.id, ...f.rooms.map((r) => r.id)]),
        invalidated: ["areas", "schedules", "3d", "vastu", "boq", "estimate"],
      };
    },
  },
  {
    name: "validate_geometry",
    version: "1.0.0",
    group: "Validation",
    description:
      "Run deterministic topology, bounds, area, opening and overlap validation on the canonical model. Returns actionable findings with severity.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const report = validateProject(draft);
      const metrics = projectMetrics(draft);
      return {
        result: {
          ok: report.ok,
          errors: report.errors.length,
          warnings: report.warnings.length,
          findings: report.findings,
          metrics: {
            plot_area_m2: metrics.plotArea,
            built_up_m2: metrics.totalBuiltUp,
            carpet_m2: metrics.totalCarpet,
            coverage_pct: round(metrics.groundCoverageRatio * 100, 1),
            fsi: metrics.fsi,
          },
        },
        changed: false,
      };
    },
  },
  {
    name: "calculate_room_area",
    version: "1.0.0",
    group: "Geometry & measurement",
    description: "Calculate the exact clear area, perimeter and extents of a room from its canonical polygon.",
    permission: "read",
    mutating: false,
    schema: z.object({ room_id: z.string().min(1) }),
    handler: (draft, args) => {
      const { floor, room } = findRoom(draft, args.room_id);
      const m = projectMetrics(draft).floors.find((f) => f.floorId === floor.id)?.rooms.find((r) => r.roomId === room.id);
      return {
        result: m
          ? {
              room_id: room.id,
              name: room.name,
              floor_id: floor.id,
              area_m2: m.area,
              perimeter_m: m.perimeter,
              width_m: m.width,
              depth_m: m.depth,
              direction: m.direction,
              target_area_m2: room.targetArea,
              formula: "Shoelace area of the stored clear polygon",
            }
          : { room_id: room.id, area_m2: 0 },
        changed: false,
      };
    },
  },
  {
    name: "calculate_built_up_area",
    version: "1.0.0",
    group: "Geometry & measurement",
    description:
      "Calculate plot, buildable, coverage, built-up, carpet and FSI metrics for the project or one floor.",
    permission: "read",
    mutating: false,
    schema: z.object({ floor_id: z.string().optional() }),
    handler: (draft, args) => {
      const metrics = projectMetrics(draft);
      const floors = args.floor_id ? metrics.floors.filter((f) => f.floorId === args.floor_id) : metrics.floors;
      return {
        result: {
          plot_area_m2: metrics.plotArea,
          buildable_area_m2: metrics.buildableArea,
          ground_coverage_m2: metrics.groundCoverage,
          coverage_pct: round(metrics.groundCoverageRatio * 100, 2),
          total_built_up_m2: metrics.totalBuiltUp,
          total_carpet_m2: metrics.totalCarpet,
          fsi: metrics.fsi,
          floors: floors.map((f) => ({
            floor_id: f.floorId,
            name: f.name,
            room_area_m2: f.roomArea,
            built_up_m2: f.builtUpArea,
            carpet_m2: f.carpetArea,
            wall_length_m: f.wallLength,
          })),
          methods: metrics.methods,
        },
        changed: false,
      };
    },
  },
  {
    name: "compare_design_options",
    version: "1.0.0",
    group: "Generation",
    description: "Compare the scores and metrics of the current generated candidates. Proposals are not persisted.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (_draft, _args, ctx) => ({
      result: {
        candidates: ctx.candidates.map((c) => ({
          candidate_id: c.candidateId,
          name: c.name,
          scores: c.scores,
          built_up_m2: c.metrics.totalBuiltUp,
          estimate_total_inr: c.estimateTotal,
          vastu: c.vastuSummary,
        })),
        weights_note:
          "Total score is a documented weighted sum of efficiency, Vastu alignment, circulation, daylight and cost. It is not an approval verdict.",
      },
      changed: false,
    }),
  },
];
