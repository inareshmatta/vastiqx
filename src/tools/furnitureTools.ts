import { z } from "zod";
import {
  FURNITURE_TEMPLATES,
  furnitureCatalogue,
  furnitureSchedule,
  moveFurniture,
  placeFurniture,
  removeFurniture,
} from "@/domain/furniture";
import { ToolError } from "./types";
import type { ToolDef } from "./types";

const rect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(20),
  depth: z.number().positive().max(20),
});

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const furnitureTools: ToolDef[] = [
  {
    name: "list_furniture_catalog",
    version: "1.0.0",
    group: "Furniture",
    description:
      "List the furniture catalogue and the current furniture placements. Furniture is presentation-only and excluded from room areas, built-up, Vastu, BOQ and cost.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({
      result: {
        ...furnitureCatalogue(draft),
        schedule: furnitureSchedule(draft),
      },
      changed: false,
    }),
  },
  {
    name: "add_furniture",
    version: "1.0.0",
    group: "Furniture",
    description:
      "Add a piece of furniture from the catalogue to a room. Placement is deterministic and must fit inside the room without overlapping existing furniture. Use room_id to choose a specific room, or omit it to use the first compatible room.",
    permission: "write",
    mutating: true,
    schema: z.object({
      template_id: z.string().min(1).max(80),
      room_id: z.string().min(1).optional(),
      rect: rect.optional(),
      rotation: z.number().min(0).max(360).optional(),
    }),
    handler: (draft, args) => {
      try {
        const placed = placeFurniture(draft, args.template_id, args.room_id, args.rect, args.rotation ?? 0);
        return {
          result: {
            furniture_id: placed.item.id,
            item: placed.item,
            room: { id: placed.room.id, name: placed.room.name, type: placed.room.type },
            floor: { id: placed.floor.id, name: placed.floor.name },
            note: "Furniture added to the presentation layer. It does not change room area, built-up, cost or Vastu.",
          },
          createdIds: [placed.item.id],
          invalidated: ["plan", "3d", "furniture"],
        };
      } catch (error) {
        throw new ToolError("INVALID_GEOMETRY", message(error), {
          hints: ["Call list_furniture_catalog to see item sizes.", "Choose a larger room or remove an existing item."],
        });
      }
    },
  },
  {
    name: "move_furniture",
    version: "1.0.0",
    group: "Furniture",
    description:
      "Move or rotate a placed furniture item to a new footprint inside its room. Validates room containment and furniture overlap.",
    permission: "write",
    mutating: true,
    schema: z.object({
      furniture_id: z.string().min(1),
      rect: rect,
      rotation: z.number().min(0).max(360).optional(),
    }),
    handler: (draft, args) => {
      try {
        const item = moveFurniture(draft, args.furniture_id, args.rect, args.rotation);
        return {
          result: { furniture: item, note: "Furniture moved; measured areas are unchanged." },
          updatedIds: [item.id],
          invalidated: ["plan", "3d", "furniture"],
        };
      } catch (error) {
        throw new ToolError("INVALID_GEOMETRY", message(error));
      }
    },
  },
  {
    name: "remove_furniture",
    version: "1.0.0",
    group: "Furniture",
    description: "Remove a placed furniture item. Measured areas, built-up, cost and Vastu are unchanged.",
    permission: "write",
    mutating: true,
    schema: z.object({ furniture_id: z.string().min(1) }),
    handler: (draft, args) => {
      const removed = removeFurniture(draft, args.furniture_id);
      if (!removed) {
        throw new ToolError("MISSING_INPUT", `Furniture ${args.furniture_id} was not found.`, {
          hints: ["Call list_furniture_catalog to read the placed furniture ids."],
        });
      }
      return {
        result: { removed: removed.id, label: removed.label, note: "Furniture removed from the presentation layer." },
        deletedIds: [removed.id],
        invalidated: ["plan", "3d", "furniture"],
      };
    },
  },
];

export const FURNITURE_TEMPLATE_IDS = FURNITURE_TEMPLATES.map((template) => template.id);
