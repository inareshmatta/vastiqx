import { z } from "zod";
import { polygonArea, polygonSelfIntersects, rectPolygon, round } from "@/domain/geometry";
import { buildableRect, projectMetrics } from "@/domain/measure";
import { createProject, emptyFloor, newId, toMetres } from "@/domain/project";
import { RATE_BOOKS } from "@/domain/rateBook";
import type { Floor, Project } from "@/domain/types";
import { recomputeSite } from "./helpers";
import type { ToolDef } from "./types";
import { ToolError } from "./types";

const unitSchema = z.enum(["m", "ft"]);

function floorSummary(project: Project, floor: Floor) {
  return {
    floor_id: floor.id,
    name: floor.name,
    level: floor.level,
    elevation: round(floor.elevation, 3),
    height: round(floor.height, 3),
    rooms: floor.rooms.map((r) => ({
      room_id: r.id,
      name: r.name,
      type: r.type,
      area_m2: round(polygonArea(r.polygon), 2),
    })),
    wall_count: floor.walls.length,
    opening_count: floor.walls.reduce((s, w) => s + w.openings.length, 0),
  };
}

export function projectContextSummary(project: Project) {
  const metrics = projectMetrics(project);
  return {
    project_id: project.id,
    name: project.name,
    type: project.type,
    revision: project.revision,
    units: project.units,
    currency: project.currency,
    location: project.location,
    north_bearing_deg: project.site.northBearing,
    plot: {
      area_m2: project.site.area,
      boundary: project.site.boundary,
      setbacks: project.site.setbacks,
      road_edges: project.site.roadEdges,
    },
    brief: project.brief,
    floors: project.floors.map((f) => floorSummary(project, f)),
    metrics: {
      plot_area_m2: metrics.plotArea,
      buildable_area_m2: metrics.buildableArea,
      ground_coverage_pct: round(metrics.groundCoverageRatio * 100, 1),
      built_up_m2: metrics.totalBuiltUp,
      carpet_m2: metrics.totalCarpet,
      fsi: metrics.fsi,
      rooms: metrics.roomCount,
      doors: metrics.doorCount,
      windows: metrics.windowCount,
    },
    constraints: project.constraints,
    vastu_profile: project.vastu.profileId,
    rate_book_id: project.rateBookId,
    updated_at: project.updatedAt,
  };
}

export const projectTools: ToolDef[] = [
  {
    name: "get_project",
    version: "1.0.0",
    group: "Project & context",
    description:
      "Read the canonical project state: revision, plot, brief, floors, rooms, metrics and constraints. Always read before a state-changing operation.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (_draft, _args, ctx) => ({
      result: projectContextSummary(_draft),
      changed: false,
    }),
  },
  {
    name: "get_project_settings",
    version: "1.0.0",
    group: "Project & context",
    description: "Read units, currency, location, north bearing, setbacks, rate book and Vastu profile.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({
      result: {
        units: draft.units,
        currency: draft.currency,
        location: draft.location,
        north_bearing_deg: draft.site.northBearing,
        setbacks: draft.site.setbacks,
        rate_book_id: draft.rateBookId,
        vastu_profile_id: draft.vastu.profileId,
        buildable_bounds: buildableRect(draft),
      },
      changed: false,
    }),
  },
  {
    name: "get_floors",
    version: "1.0.0",
    group: "Project & context",
    description: "List floors with their rooms, wall counts and opening counts.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({
      result: { floors: draft.floors.map((f) => floorSummary(draft, f)) },
      changed: false,
    }),
  },
  {
    name: "get_revision",
    version: "1.0.0",
    group: "Project & context",
    description: "Read the current project revision and timestamps before issuing a mutation.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({
      result: {
        revision: draft.revision,
        updated_at: draft.updatedAt,
        checkpoints: draft.checkpoints.map((c) => ({ id: c.id, label: c.label, revision: c.revision, at: c.createdAt })),
      },
      changed: false,
    }),
  },
  {
    name: "get_user_requirements",
    version: "1.0.0",
    group: "Project & context",
    description: "Read the structured brief and all hard/soft constraints.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({
      result: { brief: draft.brief, constraints: draft.constraints },
      changed: false,
    }),
  },
  {
    name: "update_brief",
    version: "1.0.0",
    group: "Project setup",
    description:
      "Update the structured brief (description, bedrooms, bathrooms, budget, parking, pooja, requirements). Does not draw geometry.",
    permission: "write",
    mutating: true,
    schema: z.object({
      description: z.string().max(4000).optional(),
      bedrooms: z.number().int().min(0).max(10).optional(),
      bathrooms: z.number().int().min(0).max(10).optional(),
      budget: z.number().nonnegative().optional(),
      parking: z.boolean().optional(),
      pooja: z.boolean().optional(),
      requirements: z.array(z.string().max(300)).max(30).optional(),
    }),
    handler: (draft, args) => {
      const brief = draft.brief;
      if (args.description !== undefined) brief.description = args.description;
      if (args.bedrooms !== undefined) brief.bedrooms = args.bedrooms;
      if (args.bathrooms !== undefined) brief.bathrooms = args.bathrooms;
      if (args.budget !== undefined) brief.budget = args.budget;
      if (args.parking !== undefined) brief.parking = args.parking;
      if (args.pooja !== undefined) brief.pooja = args.pooja;
      if (args.requirements !== undefined) brief.requirements = args.requirements;
      brief.updatedAt = new Date().toISOString();
      return {
        result: { brief, note: "Brief updated. Floor count is controlled by add_floor/delete_floor." },
        updatedIds: [draft.id],
      };
    },
  },
  {
    name: "set_units",
    version: "1.0.0",
    group: "Project setup",
    description: "Set project display units. The canonical model stores metres; MVP accepts metric only.",
    permission: "write",
    mutating: true,
    schema: z.object({ units: z.enum(["m"]) }),
    handler: (draft, args) => {
      draft.units = args.units;
      return { result: { units: draft.units, canonical: "metres" }, updatedIds: [draft.id] };
    },
  },
  {
    name: "set_location",
    version: "1.0.0",
    group: "Project setup",
    description: "Set city/state and the jurisdiction rule pack id.",
    permission: "write",
    mutating: true,
    schema: z.object({
      city: z.string().min(1).max(120),
      state: z.string().min(1).max(120),
      jurisdiction_pack_id: z.string().max(120).optional(),
    }),
    handler: (draft, args) => {
      draft.location = {
        ...draft.location,
        city: args.city,
        state: args.state,
        jurisdictionPackId: args.jurisdiction_pack_id ?? draft.location.jurisdictionPackId,
        country: "India",
      };
      return { result: { location: draft.location }, updatedIds: [draft.id] };
    },
  },
  {
    name: "set_north_bearing",
    version: "1.0.0",
    group: "Project setup",
    description:
      "Set true north as degrees clockwise from the plan's +Y axis (0 = plan north). Geometry is never rotated; only Vastu and orientation outputs change.",
    permission: "write",
    mutating: true,
    schema: z.object({ bearing_deg: z.number().min(0).max(360) }),
    handler: (draft, args) => {
      draft.site.northBearing = args.bearing_deg;
      return { result: { north_bearing_deg: draft.site.northBearing }, updatedIds: [draft.id] };
    },
  },
  {
    name: "set_plot_dimensions",
    version: "1.0.0",
    group: "Plot & site",
    description:
      "Set a rectangular plot by width (east-west) and depth (north-south) in metres or feet. Anchored at the current boundary's south-west corner.",
    permission: "write",
    mutating: true,
    schema: z.object({
      width: z.number().min(3).max(200),
      depth: z.number().min(3).max(200),
      unit: unitSchema.default("m"),
    }),
    handler: (draft, args) => {
      const width = toMetres(args.width, args.unit);
      const depth = toMetres(args.depth, args.unit);
      const xs = draft.site.boundary.map((p) => p.x);
      const ys = draft.site.boundary.map((p) => p.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      draft.site.boundary = rectPolygon(x0, y0, x0 + width, y0 + depth);
      draft.site.source = "manual";
      recomputeSite(draft);
      return {
        result: {
          width_m: round(width, 3),
          depth_m: round(depth, 3),
          plot_area_m2: draft.site.area,
          note: "Existing geometry was not moved; run validate_geometry and check room setbacks.",
        },
        updatedIds: [draft.id],
      };
    },
  },
  {
    name: "create_plot_boundary",
    version: "1.0.0",
    group: "Plot & site",
    description: "Set an explicit plot boundary polygon in metres (project-local coordinates).",
    permission: "write",
    mutating: true,
    schema: z.object({
      polygon: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).min(3).max(64),
    }),
    handler: (draft, args) => {
      if (polygonSelfIntersects(args.polygon)) {
        throw new ToolError("INVALID_GEOMETRY", "The plot boundary is self-intersecting.", {
          hints: ["Provide vertices in order around the perimeter."],
        });
      }
      const area = polygonArea(args.polygon);
      if (area < 9) throw new ToolError("INVALID_GEOMETRY", "Plot area must be at least 9 m2.");
      draft.site.boundary = args.polygon;
      draft.site.source = "manual";
      recomputeSite(draft);
      return { result: { area_m2: draft.site.area, vertices: args.polygon.length }, updatedIds: [draft.id] };
    },
  },
  {
    name: "set_setbacks",
    version: "1.0.0",
    group: "Plot & site",
    description: "Set front (road side, -Y), rear, left and right setbacks in metres.",
    permission: "write",
    mutating: true,
    schema: z.object({
      front: z.number().min(0).max(30),
      rear: z.number().min(0).max(30),
      left: z.number().min(0).max(30),
      right: z.number().min(0).max(30),
    }),
    handler: (draft, args) => {
      draft.site.setbacks = {
        front: args.front,
        rear: args.rear,
        left: args.left,
        right: args.right,
      };
      return {
        result: { setbacks: draft.site.setbacks, buildable_bounds: buildableRect(draft) },
        updatedIds: [draft.id],
      };
    },
  },
  {
    name: "set_road_access",
    version: "1.0.0",
    group: "Plot & site",
    description: "Record the abutting road side and width in metres.",
    permission: "write",
    mutating: true,
    schema: z.object({
      side: z.enum(["north", "south", "east", "west"]),
      width_m: z.number().min(1).max(60),
    }),
    handler: (draft, args) => {
      draft.site.roadEdges = draft.site.roadEdges.filter((r) => r.side !== args.side);
      draft.site.roadEdges.push({ side: args.side, width: args.width_m });
      return { result: { road_edges: draft.site.roadEdges }, updatedIds: [draft.id] };
    },
  },
  {
    name: "set_rate_book",
    version: "1.0.0",
    group: "Cost",
    description: "Select the regional rate book used for estimates.",
    permission: "write",
    mutating: true,
    schema: z.object({ rate_book_id: z.string().max(80) }),
    handler: (draft, args) => {
      if (!RATE_BOOKS.some((b) => b.id === args.rate_book_id)) {
        throw new ToolError("RATE_NOT_FOUND", `Rate book ${args.rate_book_id} is not available.`, {
          details: RATE_BOOKS.map((b) => b.id),
        });
      }
      draft.rateBookId = args.rate_book_id;
      return { result: { rate_book_id: draft.rateBookId }, updatedIds: [draft.id] };
    },
  },
  {
    name: "add_floor",
    version: "1.0.0",
    group: "Floors",
    description: "Add an empty floor above the highest existing floor.",
    permission: "write",
    mutating: true,
    schema: z.object({
      name: z.string().min(1).max(60).optional(),
      height: z.number().min(2.4).max(6).default(3.05),
    }),
    handler: (draft, args) => {
      if (draft.floors.length >= 4) {
        throw new ToolError("CONSTRAINT_CONFLICT", "The MVP supports up to four floors.");
      }
      const level = draft.floors.length;
      const floor = emptyFloor(level, args.height);
      floor.name = args.name ?? floor.name;
      const previous = draft.floors[level - 1];
      floor.elevation = previous ? previous.elevation + previous.height : 0;
      draft.floors.push(floor);
      draft.brief.floors = draft.floors.length;
      return { result: { floor: floorSummary(draft, floor) }, createdIds: [floor.id] };
    },
  },
  {
    name: "update_floor",
    version: "1.0.0",
    group: "Floors",
    description: "Rename a floor or change its floor-to-floor height.",
    permission: "write",
    mutating: true,
    schema: z.object({
      floor_id: z.string().min(1),
      name: z.string().min(1).max(60).optional(),
      height: z.number().min(2.4).max(6).optional(),
    }),
    handler: (draft, args) => {
      const floor = draft.floors.find((f) => f.id === args.floor_id);
      if (!floor) throw new ToolError("MISSING_INPUT", `Floor ${args.floor_id} not found.`);
      if (args.name !== undefined) floor.name = args.name;
      if (args.height !== undefined) floor.height = args.height;
      // Recompute stacked elevations deterministically from level 0.
      draft.floors.forEach((f, index) => {
        f.level = index;
        if (index === 0) {
          f.elevation = 0;
        } else {
          const below = draft.floors[index - 1]!;
          f.elevation = below.elevation + below.height;
        }
      });
      return {
        result: {
          floor: floorSummary(draft, floor),
          note: "Wall heights are not changed automatically. Use update_wall to change existing wall heights.",
        },
        updatedIds: [floor.id],
      };
    },
  },
  {
    name: "delete_floor",
    version: "1.0.0",
    group: "Floors",
    description: "Delete a floor and all of its walls, rooms and elements. Requires approval.",
    permission: "admin",
    mutating: true,
    requiresApproval: true,
    schema: z.object({ floor_id: z.string().min(1) }),
    approval: (args, project) => {
      const floor = project.floors.find((f) => f.id === args.floor_id);
      return {
        summary: floor
          ? `Delete floor "${floor.name}" with ${floor.rooms.length} rooms and ${floor.walls.length} walls. This cannot be undone without a checkpoint.`
          : "Delete floor.",
        affected: floor ? [{ kind: "floor", id: floor.id, label: floor.name }] : [],
        warnings: ["All geometry on this floor is removed from the canonical model."],
      };
    },
    handler: (draft, args) => {
      if (draft.floors.length <= 1) {
        throw new ToolError("CONSTRAINT_CONFLICT", "A project must keep at least one floor.");
      }
      const floor = draft.floors.find((f) => f.id === args.floor_id);
      if (!floor) throw new ToolError("MISSING_INPUT", `Floor ${args.floor_id} not found.`);
      draft.floors = draft.floors.filter((f) => f.id !== floor.id);
      draft.floors.forEach((f, index) => {
        f.level = index;
      });
      draft.brief.floors = draft.floors.length;
      return {
        result: { deleted_floor: floor.id, floors: draft.floors.map((f) => f.id) },
        deletedIds: [floor.id],
      };
    },
  },
];

/** Used by the project-creation API route (same domain factory the UI uses). */
export function buildProject(input: {
  name: string;
  plotWidth?: number;
  plotDepth?: number;
  plotUnit?: "m" | "ft";
  city?: string;
  northBearing?: number;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  type?: Project["type"];
  description?: string;
}): Project {
  return createProject({
    ...input,
    state: "Karnataka",
  });
}

export function projectSlug(project: Project): string {
  return (
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || newId("project")
  );
}
