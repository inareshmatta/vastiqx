import { z } from "zod";
import { buildElevations, elevationSummary } from "@/domain/elevations";
import {
  addAmenity,
  applyFacadeTemplate,
  designTemplateCatalogue,
  FACADE_TEMPLATES,
  findFacadeTemplate,
  LANDSCAPE_TEMPLATES,
  removeAmenity,
} from "@/domain/templates";
import { ToolError } from "./types";
import type { ToolDef } from "./types";

export const designTools: ToolDef[] = [
  {
    name: "list_design_templates",
    version: "1.0.0",
    group: "Design studio",
    description:
      "List the ready façade styles (front/back/side elevation looks) and landscape templates (garden, courtyard, pool, deck, pergola, driveway, roof terrace), plus the currently applied façade and amenities.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({
      result: designTemplateCatalogue(draft),
      changed: false,
    }),
  },
  {
    name: "set_facade_template",
    version: "1.0.0",
    group: "Design studio",
    description:
      "Apply a ready façade template to the project. Changes wall finish, accent finish, roof expression and the palette used by 3D and front/back/side elevations. Does not change measured geometry.",
    permission: "write",
    mutating: true,
    schema: z.object({ template_id: z.string().min(1).max(80) }),
    handler: (draft, args) => {
      try {
        const template = applyFacadeTemplate(draft, args.template_id);
        return {
          result: {
            applied: template.id,
            name: template.name,
            wall_finish: template.wallFinish,
            accent_finish: template.accentFinish,
            roof: template.roof,
            materials: template.materials,
            note: "Façade applied. Measured areas, rooms and cost are unchanged; 3D and elevations now use this finish.",
          },
          updatedIds: [draft.id],
          invalidated: ["3d", "elevations"],
        };
      } catch (error) {
        throw new ToolError("MISSING_INPUT", (error as Error).message, {
          hints: [`Available façade templates: ${FACADE_TEMPLATES.map((t) => t.id).join(", ")}`],
        });
      }
    },
  },
  {
    name: "add_site_amenity",
    version: "1.0.0",
    group: "Design studio",
    description:
      "Add a landscape/site amenity from the ready templates: rear garden, courtyard, lap pool, timber deck, pergola, driveway or roof terrace garden. Placed deterministically in a free part of the plot unless a rectangle is supplied. Amenities are excluded from built-up and room schedules.",
    permission: "write",
    mutating: true,
    schema: z.object({
      template_id: z.string().min(1).max(80),
      rect: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          depth: z.number().positive(),
        })
        .optional(),
    }),
    handler: (draft, args) => {
      try {
        const { amenity, template } = addAmenity(draft, args.template_id, args.rect);
        return {
          result: {
            amenity_id: amenity.id,
            name: amenity.label,
            kind: amenity.kind,
            level: amenity.level,
            rect: amenity.rect ?? null,
            area_m2: amenity.rect ? Math.round(amenity.rect.width * amenity.rect.depth * 100) / 100 : 0,
            notes: amenity.notes,
            template: template.id,
            note:
              amenity.level === "roof"
                ? "Roof terrace added as a site concept over the top floor. It is excluded from built-up area and requires waterproofing/structural confirmation."
                : "Amenity placed on free site area. It is excluded from built-up, carpet and room schedules; pool/structures still need engineering.",
          },
          createdIds: [amenity.id],
          invalidated: ["3d", "elevations", "site"],
        };
      } catch (error) {
        throw new ToolError("NO_FREE_AREA", (error as Error).message, {
          hints: [
            "Increase the plot or setbacks, remove another amenity, or pass an explicit rect.",
            `Available landscape templates: ${LANDSCAPE_TEMPLATES.map((t) => t.id).join(", ")}`,
          ],
        });
      }
    },
  },
  {
    name: "remove_site_amenity",
    version: "1.0.0",
    group: "Design studio",
    description: "Remove a previously added garden, pool, deck, pergola, driveway or roof terrace from the site layer.",
    permission: "write",
    mutating: true,
    schema: z.object({ amenity_id: z.string().min(1) }),
    handler: (draft, args) => {
      const removed = removeAmenity(draft, args.amenity_id);
      if (!removed) {
        throw new ToolError("MISSING_INPUT", `Amenity ${args.amenity_id} was not found.`, {
          hints: ["Call list_design_templates to read the amenity ids."],
        });
      }
      return {
        result: {
          removed: removed.id,
          label: removed.label,
          note: "Amenity removed. Measured geometry and built-up area are unchanged.",
        },
        deletedIds: [removed.id],
        invalidated: ["3d", "elevations", "site"],
      };
    },
  },
  {
    name: "generate_elevations",
    version: "1.0.0",
    group: "Design studio",
    description:
      "Build deterministic front, back, left and right elevations from the stored walls and openings, using the active façade template. Returns view extents, opening counts and a summary; the UI renders the elevation geometry.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => {
      const elevations = buildElevations(draft);
      return {
        result: {
          summary: elevationSummary(elevations),
          facade: elevations.facade,
          views: elevations.views.map((view) => ({
            direction: view.direction,
            label: view.label,
            subtitle: view.subtitle,
            width_m: view.width,
            height_m: view.height,
            building_width_m: view.buildingWidth,
            building_height_m: view.buildingHeight,
            openings: view.openingCount,
          })),
          method: elevations.method,
          note: "Elevations are derived from canonical walls/openings and presentation settings. They are concept-stage, not construction elevations.",
        },
        changed: false,
      };
    },
  },
  {
    name: "get_facade_template",
    version: "1.0.0",
    group: "Design studio",
    description: "Read one façade template, including materials, palette and best-for guidance.",
    permission: "read",
    mutating: false,
    schema: z.object({ template_id: z.string().min(1) }),
    handler: (_draft, args) => {
      const template = findFacadeTemplate(args.template_id);
      return {
        result: template,
        changed: false,
      };
    },
  },
];
