import { z } from "zod";
import { hashString, round } from "@/domain/geometry";
import { calculateEstimate, compareCostScenarios, formatINR, takeoffQuantities } from "@/domain/boq";
import { buildCostBreakdown } from "@/domain/breakdown";
import { buildAreaCompliance } from "@/domain/compliance";
import { calculateMaterials, projectMaterialPack, WORK_PRESETS } from "@/domain/calculator";
import {
  AREA_UNITS,
  LENGTH_UNITS,
  UNIT_REFERENCE,
  VOLUME_UNITS,
  convertArea,
  convertVolume,
  formatArea,
  formatLength,
  formatVolume,
  lengthToM,
  mToLength,
  type AreaUnit,
  type LengthUnit,
  type VolumeUnit,
} from "@/domain/units";
import { getRateBook, RATE_BOOKS } from "@/domain/rateBook";
import { areaSchedule, openingSchedule } from "@/domain/schedule";
import { buildScene } from "@/domain/threed";
import { assessVastu, VASTU_PROFILE, overrideVastuFinding, clearVastuOverride } from "@/domain/vastu";
import { checkSiteRules } from "@/domain/rules";
import type { ToolDef } from "./types";
import { ToolError } from "./types";

const pkg = z.enum(["economy", "standard", "premium"]);

function estimateSummary(estimate: ReturnType<typeof calculateEstimate>) {
  return {
    package: estimate.package,
    revision: estimate.revision,
    rate_book: estimate.rateBook,
    totals: {
      materials_inr: estimate.totals.materials,
      labour_inr: estimate.totals.labour,
      equipment_inr: estimate.totals.equipment,
      direct_inr: estimate.totals.direct,
      overheads_inr: estimate.totals.overheads,
      margin_inr: estimate.totals.margin,
      gst_inr: estimate.totals.gst,
      contingency_inr: estimate.totals.contingency,
      total_inr: estimate.totals.total,
      band_low_inr: estimate.totals.bandLow,
      band_high_inr: estimate.totals.bandHigh,
      per_sqm_inr: estimate.totals.perSqm,
    },
    per_floor: estimate.perFloor,
    assumptions: estimate.assumptions,
    exclusions: estimate.exclusions,
    missing_inputs: estimate.missingInputs,
    engine_version: estimate.engineVersion,
    disclaimer: estimate.disclaimer,
  };
}

export const analysisTools: ToolDef[] = [
  {
    name: "run_vastu_analysis",
    version: "1.0.0",
    group: "Vastu",
    description:
      "Evaluate the versioned Vastu rule pack against canonical room positions, true north and openings. Returns source-linked findings; no composite score.",
    permission: "read",
    mutating: false,
    schema: z.object({ floor_id: z.string().optional() }),
    handler: (draft, args) => {
      const report = assessVastu(draft);
      const findings = args.floor_id
        ? report.findings.filter((f) => f.floorId === args.floor_id || f.floorId === null)
        : report.findings;
      return {
        result: {
          profile: report.profile,
          north_bearing_deg: report.northBearing,
          summary: report.summary,
          findings,
          disclaimer: report.disclaimer,
          rule_source: "Versioned, source-linked catalogue — see each finding's source and version.",
        },
        changed: false,
      };
    },
  },
  {
    name: "get_vastu_findings",
    version: "1.0.0",
    group: "Vastu",
    description: "Read the current Vastu findings without re-running the rule engine.",
    permission: "read",
    mutating: false,
    schema: z.object({ status: z.enum(["pass", "advisory", "fail", "not_assessed", "overridden"]).optional() }),
    handler: (draft, args) => {
      const report = assessVastu(draft);
      const findings = args.status ? report.findings.filter((f) => f.status === args.status) : report.findings;
      return { result: { findings, summary: report.summary }, changed: false };
    },
  },
  {
    name: "set_vastu_profile",
    version: "1.0.0",
    group: "Vastu",
    description: "Select the Vastu rule pack. Only the curated advisory profile is available in this MVP.",
    permission: "write",
    mutating: true,
    schema: z.object({ profile_id: z.string().max(80) }),
    handler: (draft, args) => {
      if (args.profile_id !== VASTU_PROFILE.id) {
        throw new ToolError("MISSING_INPUT", `Vastu profile ${args.profile_id} is not installed.`, {
          details: [VASTU_PROFILE.id],
          hints: ["Install a versioned rule pack before selecting it."],
        });
      }
      draft.vastu.profileId = args.profile_id;
      return { result: { profile: VASTU_PROFILE }, updatedIds: [draft.id] };
    },
  },
  {
    name: "override_vastu_finding",
    version: "1.0.0",
    group: "Vastu",
    description:
      "Override a Vastu finding with an explicit reason. The original finding and override remain in history; nothing is deleted.",
    permission: "write",
    mutating: true,
    schema: z.object({
      finding_key: z.string().min(1).max(200),
      reason: z.string().min(5).max(500),
    }),
    handler: (draft, args, ctx) => {
      const report = assessVastu(draft);
      const finding = report.findings.find((f) => f.key === args.finding_key);
      if (!finding) {
        throw new ToolError("MISSING_INPUT", `No finding with key ${args.finding_key}.`, {
          hints: ["Run run_vastu_analysis and use a returned finding key."],
        });
      }
      overrideVastuFinding(draft, args.finding_key, args.reason, ctx.actorId);
      const updated = assessVastu(draft).findings.find((f) => f.key === args.finding_key);
      return {
        result: { finding_key: args.finding_key, status: updated?.status, override_reason: args.reason },
        updatedIds: [draft.id],
      };
    },
  },
  {
    name: "clear_vastu_override",
    version: "1.0.0",
    group: "Vastu",
    description: "Remove a previously recorded Vastu override, restoring the rule result.",
    permission: "write",
    mutating: true,
    schema: z.object({ finding_key: z.string().min(1).max(200) }),
    handler: (draft, args) => {
      clearVastuOverride(draft, args.finding_key);
      return { result: { finding_key: args.finding_key, overridden: false }, updatedIds: [draft.id] };
    },
  },
  {
    name: "check_site_rules",
    version: "1.0.0",
    group: "Vastu & rules",
    description:
      "Evaluate the dated jurisdiction rule pack (setbacks, coverage, FAR, height, parking). Missing data is reported as NOT ASSESSED, never compliant.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const report = checkSiteRules(draft);
      return {
        result: {
          pack: report.pack,
          summary: report.summary,
          checks: report.checks,
          disclaimer: report.disclaimer,
        },
        changed: false,
      };
    },
  },
  {
    name: "check_setbacks",
    version: "1.0.0",
    group: "Vastu & rules",
    description: "Check only the setback-envelope rule from the active jurisdiction pack.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const report = checkSiteRules(draft);
      const check = report.checks.find((c) => c.ruleId === "BLR-SETBACK-01");
      return { result: { check, pack: report.pack }, changed: false };
    },
  },
  {
    name: "generate_area_schedule",
    version: "1.0.0",
    group: "Documents & export",
    description: "Generate a floor-wise room area schedule with explicit area definitions.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const schedule = areaSchedule(draft);
      return {
        result: {
          rows: schedule.rows,
          totals: schedule.totals,
          definitions: schedule.definitions,
          generated_at: schedule.generatedAt,
        },
        changed: false,
      };
    },
  },
  {
    name: "get_opening_schedule",
    version: "1.0.0",
    group: "Documents & export",
    description: "Return the door and window schedule derived from canonical wall openings.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({ result: { openings: openingSchedule(draft) }, changed: false }),
  },
  {
    name: "build_3d_model",
    version: "1.0.0",
    group: "3D & visualisation",
    description:
      "Build the deterministic 3D scene from the canonical model. Returns a build reference and statistics; the UI renders the same derived geometry.",
    permission: "read",
    mutating: false,
    schema: z.object({ include_roof: z.boolean().default(false) }),
    handler: (draft, args) => {
      const scene = buildScene(draft, { includeRoof: args.include_roof });
      return {
        result: {
          status: "built",
          build_id: `scene_${hashString(JSON.stringify(scene.counts) + draft.revision)}`,
          revision: draft.revision,
          counts: scene.counts,
          floors: scene.floors,
          bounds: scene.bounds,
          built_at: scene.builtAt,
          engine_version: scene.engineVersion,
          note: "Deterministic meshes derived from walls, slabs and openings. No AI-generated imagery.",
        },
        changed: false,
      };
    },
  },
  {
    name: "get_3d_scene",
    version: "1.0.0",
    group: "3D & visualisation",
    description: "Return a 3D scene reference for this revision (geometry is derived deterministically, not invented).",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const scene = buildScene(draft);
      return {
        result: {
          revision: draft.revision,
          counts: scene.counts,
          floors: scene.floors,
          bounds: scene.bounds,
          engine_version: scene.engineVersion,
          note: "The client renders buildScene(project); no mesh payload is stored in the project.",
        },
        changed: false,
      };
    },
  },
  {
    name: "generate_quantity_takeoff",
    version: "1.0.0",
    group: "BOQ & costing",
    description: "Take off model-derived quantities (masonry, plaster, flooring, skirting, openings) and flagged benchmarks.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const q = takeoffQuantities(draft);
      return {
        result: {
          quantities: q,
          methods: {
            measured: ["masonry volume", "plaster area", "flooring", "skirting", "doors", "windows", "waterproofing"],
            benchmarked: ["RCC volume", "reinforcement", "excavation", "PCC"],
            assumed: ["electrical points", "plumbing sets", "kitchen", "wardrobes"],
          },
          note: "Structural and MEP quantities are benchmarks or assumptions until engineered inputs exist.",
        },
        changed: false,
      };
    },
  },
  {
    name: "get_rate_book",
    version: "1.0.0",
    group: "BOQ & costing",
    description: "Read the active or requested regional rate book, including validity dates and labour norms.",
    permission: "read",
    mutating: false,
    schema: z.object({ rate_book_id: z.string().optional() }),
    handler: (draft, args) => {
      const book = getRateBook(args.rate_book_id ?? draft.rateBookId);
      return {
        result: {
          rate_book: {
            id: book.id,
            name: book.name,
            region: book.region,
            valid_from: book.validFrom,
            valid_to: book.validTo,
            source: book.source,
            disclaimer: book.disclaimer,
          },
          items: book.items.map((i) => ({
            id: i.id,
            category: i.category,
            description: i.description,
            unit: i.unit,
            rate_inr: i.rate,
            waste: i.waste,
            effective_date: i.effectiveDate,
            confidence: i.confidence,
          })),
          labour: book.labour,
          available_rate_books: RATE_BOOKS.map((b) => ({ id: b.id, name: b.name })),
        },
        changed: false,
      };
    },
  },
  {
    name: "calculate_estimate",
    version: "1.0.0",
    group: "BOQ & costing",
    description:
      "Calculate a traceable preliminary estimate. Every line stores its formula, quantity, waste factor, rate, source and confidence.",
    permission: "read",
    mutating: false,
    schema: z.object({
      package: pkg.default("standard"),
      rate_book_id: z.string().optional(),
    }),
    handler: (draft, args) => {
      const estimate = calculateEstimate(draft, {
        package: args.package,
        rateBookId: args.rate_book_id,
      });
      return {
        result: {
          ...estimateSummary(estimate),
          lines: [...estimate.materialLines, ...estimate.labourLines].map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            waste_factor: l.wasteFactor,
            rate_inr: l.rate,
            amount_inr: l.amount,
            confidence: l.confidence,
            formula: l.formula,
            source: l.source,
            effective_date: l.effectiveDate,
          })),
          formatted_total: formatINR(estimate.totals.total),
          formatted_range: `${formatINR(estimate.totals.bandLow)} – ${formatINR(estimate.totals.bandHigh)}`,
        },
        changed: false,
      };
    },
  },
  {
    name: "calculate_material_estimate",
    version: "1.0.0",
    group: "BOQ & costing",
    description: "Return the material-only portion of the estimate, with traceable line formulas.",
    permission: "read",
    mutating: false,
    schema: z.object({ package: pkg.default("standard") }),
    handler: (draft, args) => {
      const estimate = calculateEstimate(draft, { package: args.package });
      return {
        result: {
          package: args.package,
          totals: { materials_inr: estimate.totals.materials, per_sqm_inr: estimate.totals.perSqm },
          lines: estimate.materialLines,
          missing_inputs: estimate.missingInputs,
        },
        changed: false,
      };
    },
  },
  {
    name: "calculate_labour_estimate",
    version: "1.0.0",
    group: "BOQ & costing",
    description: "Return labour days and cost derived from productivity norms applied to model quantities.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const estimate = calculateEstimate(draft);
      return {
        result: {
          totals: { labour_inr: estimate.totals.labour },
          lines: estimate.labourLines,
          note: "Labour norms are planning assumptions; they are not contractor quotations.",
        },
        changed: false,
      };
    },
  },
  {
    name: "get_cost_breakdown",
    version: "1.0.0",
    group: "BOQ & costing",
    description:
      "Return room-wise and floor-wise cost allocation (measured finishes/services lines, allocated shared structure/overheads) reconciled to the project estimate. Use for per-room and per-floor material estimates.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const breakdown = buildCostBreakdown(draft);
      return {
        result: {
          package: breakdown.package,
          rate_book_id: breakdown.rateBookId,
          project_totals: breakdown.project,
          floors: breakdown.floors.map((f) => ({
            floor_id: f.floorId,
            name: f.name,
            area_m2: f.area,
            built_up_m2: f.builtUpArea,
            direct_finish_inr: f.directTotal,
            allocated_shared_inr: f.allocatedShared,
            total_inr: f.total,
            per_m2_inr: f.perSqm,
          })),
          rooms: breakdown.rooms.map((r) => ({
            room_id: r.roomId,
            floor: r.floor,
            room: r.room,
            type: r.roomType,
            area_m2: r.area,
            direct_finish_inr: r.directTotal,
            allocated_shared_inr: r.allocatedShared,
            total_inr: r.total,
            per_m2_inr: r.perSqm,
            lines: r.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unit: l.unit,
              rate_inr: l.rate,
              amount_inr: l.amount,
              confidence: l.confidence,
              formula: l.formula,
            })),
          })),
          allocation: breakdown.allocation,
          disclaimer: breakdown.disclaimer,
          formatted_room_totals: breakdown.rooms.map((r) => ({ room: r.room, floor: r.floor, total: formatINR(r.total) })),
        },
        changed: false,
      };
    },
  },
  {
    name: "calculate_room_cost",
    version: "1.0.0",
    group: "BOQ & costing",
    description: "Return the measured material/finish line items, allocated shared cost and total for one room.",
    permission: "read",
    mutating: false,
    schema: z.object({ room_id: z.string().min(1) }),
    handler: (draft, args) => {
      const breakdown = buildCostBreakdown(draft);
      const room = breakdown.rooms.find((r) => r.roomId === args.room_id);
      if (!room) {
        throw new ToolError("MISSING_INPUT", `Room ${args.room_id} is not present in the cost breakdown.`);
      }
      return {
        result: {
          ...room,
          formatted_total: formatINR(room.total),
          note: "Direct lines are measured; shared cost is allocated by room area. Planning allowance, not a quotation.",
        },
        changed: false,
      };
    },
  },
  {
    name: "compare_cost_scenarios",
    version: "1.0.0",
    group: "BOQ & costing",
    description: "Compare economy, standard and premium finish scenarios on identical measured quantities.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const comparison = compareCostScenarios(draft);
      return {
        result: {
          ...comparison,
          formatted: comparison.scenarios.map((s) => ({
            package: s.package,
            total: formatINR(s.total),
            range: `${formatINR(s.bandLow)} – ${formatINR(s.bandHigh)}`,
            per_sqm: formatINR(s.perSqm),
          })),
        },
        changed: false,
      };
    },
  },
  {
    name: "recalculate_estimate",
    version: "1.0.0",
    group: "BOQ & costing",
    description: "Recalculate the estimate at the current revision (alias of calculate_estimate).",
    permission: "read",
    mutating: false,
    schema: z.object({ package: pkg.default("standard") }),
    handler: (draft, args) => {
      const estimate = calculateEstimate(draft, { package: args.package });
      return {
        result: {
          ...estimateSummary(estimate),
          revision_checked: draft.revision,
          recalculated_at: estimate.calculatedAt,
        },
        changed: false,
      };
    },
  },
  {
    name: "get_area_compliance",
    version: "1.0.0",
    group: "Measurement & compliance",
    description:
      "Reconcile the sum of room areas with each floor's built-up area and the project total. Reports pass/warn/fail checks, wall/common share, conversions to m², ft² and gaj, and the program checks.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const compliance = buildAreaCompliance(draft);
      return {
        result: {
          summary: compliance.summary,
          project: compliance.project,
          floors: compliance.floors.map((floor) => ({
            floor_id: floor.floorId,
            name: floor.name,
            rooms: floor.roomCount,
            carpet_m2: floor.carpetArea,
            room_union_m2: floor.roomUnionArea,
            built_up_m2: floor.builtUpArea,
            wall_common_share_m2: floor.wallAndCommonShare,
            gap_pct: floor.builtUpGapPct,
            status: floor.status,
            conversions: floor.conversions,
            checks: floor.checks.map((c) => ({
              id: c.id,
              title: c.title,
              status: c.status,
              value: `${c.value} ${c.valueUnit}`,
              limit: c.limit,
              note: c.note,
            })),
          })),
          method: compliance.method,
          disclaimer: compliance.disclaimer,
          formatted: {
            carpet: formatArea(compliance.project.totalCarpet, "sqm"),
            carpet_sqft: formatArea(compliance.project.totalCarpet, "sqft"),
            carpet_gaj: formatArea(compliance.project.totalCarpet, "gaj"),
            built_up: formatArea(compliance.project.totalBuiltUp, "sqm"),
            built_up_sqft: formatArea(compliance.project.totalBuiltUp, "sqft"),
            built_up_gaj: formatArea(compliance.project.totalBuiltUp, "gaj"),
          },
        },
        changed: false,
      };
    },
  },
  {
    name: "get_material_pack",
    version: "1.0.0",
    group: "Construction calculator",
    description:
      "Convert the measured takeoff into purchasable planning quantities: bricks, cement bags, sand, aggregate, steel, tiles, paint, primer, putty and waterproofing. Includes m³, ft³ and litre conversions.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const takeoff = takeoffQuantities(draft);
      const pack = projectMaterialPack(takeoff);
      return {
        result: {
          measured: pack.measured,
          measured_conversions: Object.fromEntries(
            Object.entries(pack.measured).map(([key, value]) => [
              key,
              {
                cum: round(value, 2),
                cft: round(convertVolume(value, "cum", "cft"), 2),
                tonnes_steel: key === "steelKg" ? round(value / 1000, 3) : undefined,
              },
            ]),
          ),
          materials: pack.items,
          notes: pack.notes,
          formula_note:
            "Quantities are measured takeoff × documented planning norms. They are not a purchase order, mix design or BBS.",
        },
        changed: false,
      };
    },
  },
  {
    name: "list_construction_norms",
    version: "1.0.0",
    group: "Construction calculator",
    description:
      "List the construction calculator presets and their per-unit material norms (brickwork, RCC, plaster, flooring, painting, PCC) plus unit reference conversions.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: () => ({
      result: {
        work_presets: WORK_PRESETS,
        unit_reference: UNIT_REFERENCE,
        area_units: AREA_UNITS,
        volume_units: VOLUME_UNITS,
        length_units: LENGTH_UNITS,
        note: "Norms are planning benchmarks, not a mix design, BBS or supplier quotation.",
      },
      changed: false,
    }),
  },
  {
    name: "calculate_construction_materials",
    version: "1.0.0",
    group: "Construction calculator",
    description:
      "Calculate bricks, cement bags, sand, aggregate, steel, water, tiles or paint for a selected work type and measured quantity (m³ or m²).",
    permission: "read",
    mutating: false,
    schema: z.object({
      work: z.enum([
        "brickwork_230",
        "brickwork_115",
        "rcc_m20",
        "rcc_m25",
        "plaster_12_16",
        "plaster_6_14",
        "flooring_tiles",
        "painting_2coat",
        "pcc_m10",
      ]),
      quantity: z.number().positive().max(1_000_000),
    }),
    handler: (_draft, args) => {
      const result = calculateMaterials(args.work, args.quantity);
      return {
        result: {
          work: result.preset.id,
          label: result.preset.label,
          input: `${result.quantity} ${result.preset.inputUnit}`,
          description: result.preset.description,
          materials: result.materials,
          labour: result.preset.labour,
          assumptions: result.preset.assumptions,
          formula: result.preset.formula,
          source: result.preset.source,
          note: result.note,
        },
        changed: false,
      };
    },
  },
  {
    name: "convert_units",
    version: "1.0.0",
    group: "Construction calculator",
    description:
      "Convert area (m², ft², gaj/sq yd, acre, hectare), volume (m³, ft³, litre) or length (m, ft, in, cm, mm). Use for gaj/sqft/sqyard checks and cubic-metre conversions.",
    permission: "read",
    mutating: false,
    schema: z.object({
      dimension: z.enum(["area", "volume", "length"]),
      value: z.number().min(0).max(1_000_000_000),
      from: z.string().min(1),
      to: z.string().min(1),
    }),
    handler: (_draft, args) => {
      try {
        if (args.dimension === "area") {
          const value = convertArea(args.value, args.from as AreaUnit, args.to as AreaUnit);
          return {
            result: {
              dimension: "area",
              input: `${args.value} ${args.from}`,
              output: `${round(value, 6)} ${args.to}`,
              all: {
                sqm: formatArea(args.value === 0 ? 0 : convertArea(args.value, args.from as AreaUnit, "sqm"), "sqm"),
                sqft: formatArea(convertArea(args.value, args.from as AreaUnit, "sqm"), "sqft"),
                gaj: formatArea(convertArea(args.value, args.from as AreaUnit, "sqm"), "gaj"),
                sqyd: formatArea(convertArea(args.value, args.from as AreaUnit, "sqm"), "sqyd"),
                acre: formatArea(convertArea(args.value, args.from as AreaUnit, "sqm"), "acre"),
              },
            },
            changed: false,
          };
        }
        if (args.dimension === "volume") {
          const value = convertVolume(args.value, args.from as VolumeUnit, args.to as VolumeUnit);
          return {
            result: {
              dimension: "volume",
              input: `${args.value} ${args.from}`,
              output: `${round(value, 6)} ${args.to}`,
              all: {
                cum: formatVolume(convertVolume(args.value, args.from as VolumeUnit, "cum"), "cum"),
                cft: formatVolume(convertVolume(args.value, args.from as VolumeUnit, "cum"), "cft"),
                litre: formatVolume(convertVolume(args.value, args.from as VolumeUnit, "cum"), "litre"),
              },
            },
            changed: false,
          };
        }
        const value = mToLength(lengthToM(args.value, args.from as LengthUnit), args.to as LengthUnit);
        return {
          result: {
            dimension: "length",
            input: `${args.value} ${args.from}`,
            output: `${round(value, 6)} ${args.to}`,
            all: {
              m: formatLength(lengthToM(args.value, args.from as LengthUnit), "m"),
              ft: formatLength(lengthToM(args.value, args.from as LengthUnit), "ft"),
              in: formatLength(lengthToM(args.value, args.from as LengthUnit), "in"),
            },
          },
          changed: false,
        };
      } catch (error) {
        throw new ToolError("MISSING_INPUT", (error as Error).message, {
          hints: ["Area: sqm, sqft, gaj, sqyd, acre, hectare. Volume: cum, cft, litre. Length: m, ft, in, cm, mm."],
        });
      }
    },
  },
];
