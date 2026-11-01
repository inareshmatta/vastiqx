import { bbox } from "@/domain/geometry";
import { findRoomByName, toMetres } from "@/domain/project";
import { buildableRect } from "@/domain/measure";
import { findFreeRect } from "@/domain/layout";
import { FACADE_TEMPLATES, LANDSCAPE_TEMPLATES } from "@/domain/templates";
import type { Project, RoomType } from "@/domain/types";
import type { AgentCallContext, AgentCompletion, AgentMessage, AgentModel, AgentToolCall } from "./types";

function lastUserMessage(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") return messages[i]!.content;
  }
  return "";
}

function toolNamesSinceUser(messages: AgentMessage[]): string[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") {
      start = i + 1;
      break;
    }
  }
  return messages
    .slice(start)
    .filter((m) => m.role === "tool")
    .map((m) => m.name ?? "");
}

function lastToolContent(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "tool") return messages[i]!.content;
  }
  return "";
}

function call(name: string, args: Record<string, unknown>): AgentCompletion {
  const toolCalls: AgentToolCall[] = [
    {
      id: `call_${name}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      arguments: JSON.stringify(args),
    },
  ];
  return { content: "", toolCalls };
}

function say(content: string): AgentCompletion {
  return { content, toolCalls: [] };
}

function parseDimensions(text: string): { width: number; depth: number; unit: "m" | "ft" } | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  // Indian plot convention: 30x40 means feet. Small values are metres.
  const unit: "m" | "ft" = Math.max(a, b) > 20 ? "ft" : "m";
  return { width: a, depth: b, unit };
}

function parseRoomType(text: string): { name: string; type: RoomType } | null {
  const map: [RegExp, string, RoomType][] = [
    [/master\s*bed/i, "Master bedroom", "master_bedroom"],
    [/guest\s*bed|bedroom|bed\b/i, "Bedroom", "bedroom"],
    [/kitchen/i, "Kitchen", "kitchen"],
    [/living|lounge/i, "Living", "living"],
    [/dining/i, "Dining", "dining"],
    [/bath|toilet|washroom/i, "Bathroom", "bathroom"],
    [/study|office/i, "Study", "study"],
    [/pooja|puja/i, "Pooja", "pooja"],
    [/store|storage/i, "Store", "store"],
    [/utility/i, "Utility", "utility"],
  ];
  for (const [pattern, name, type] of map) {
    if (pattern.test(text)) return { name, type };
  }
  return null;
}

function projectSummary(project: Project): string {
  const rooms = project.floors.reduce((s, f) => s + f.rooms.length, 0);
  const b = bbox(project.site.boundary);
  return [
    `${project.name} at revision ${project.revision}.`,
    `Plot ${(b.maxX - b.minX).toFixed(2)} x ${(b.maxY - b.minY).toFixed(2)} m (${project.site.area.toFixed(1)} m2).`,
    `${project.floors.length} floor(s), ${rooms} room(s).`,
    `Brief: ${project.brief.bedrooms} bedrooms, ${project.brief.bathrooms} bathrooms${project.brief.parking ? ", parking" : ""}${project.brief.pooja ? ", pooja" : ""}.`,
  ].join(" ");
}

export class MockAgent implements AgentModel {
  id = "mock";
  mode = "mock" as const;
  model = "deterministic-demo-planner";
  label = "Deterministic demo planner";

  async complete(messages: AgentMessage[], _tools: unknown[], context: AgentCallContext): Promise<AgentCompletion> {
    const text = lastUserMessage(messages).trim();
    const lower = text.toLowerCase();
    const completed = new Set(toolNamesSinceUser(messages));
    const project = context.project;

    if (!text) return say("Tell me what you want to design or change.");

    if (/apply|use|choose|pick/.test(lower) && /option|candidate|design|layout|one|two|three|first|second|third/i.test(lower)) {
      if (!completed.has("get_design_candidates")) return call("get_design_candidates", {});
      const ids = [...lastToolContent(messages).matchAll(/"candidate_id"\s*:\s*"([^"]+)"/g)].map((m) => m[1]!);
      if (ids.length === 0) return say("No candidates are stored for this revision. Ask me to generate options first.");
      const index = /second|two|2/.test(lower) ? 1 : /third|three|3/.test(lower) ? 2 : 0;
      const candidateId = ids[Math.min(index, ids.length - 1)]!;
      return call("apply_design_proposal", { candidate_id: candidateId });
    }

    // Landscape amenity requests are handled before the generic design intent
    // so "design a pool" adds a pool instead of regenerating the whole plan.
    const amenityMatch = LANDSCAPE_TEMPLATES.find((template) => {
      const words = [template.id, template.name, template.kind.replace(/_/g, " ")].map((w) => w.toLowerCase());
      return words.some((word) => lower.includes(word));
    });
    if (amenityMatch) {
      if (completed.has("add_site_amenity")) {
        return say(
          `${amenityMatch.name} was added to the site layer at the current revision. It is shown on the plan, 3D and elevations, and is excluded from built-up and room areas. Open the Plan tab to see it, or ask for a report to include the site concept.`,
        );
      }
      const existing = (project.amenities ?? []).find((a) => a.kind === amenityMatch.kind);
      if (existing && !/another|second|one more|again/i.test(lower)) {
        return say(
          `${existing.label} is already on the site layer. I can add another with "add another ${amenityMatch.name.toLowerCase()}", or remove it with "remove the ${amenityMatch.name.toLowerCase()}".`,
        );
      }
      return call("add_site_amenity", { template_id: amenityMatch.id });
    }

    // Furniture presentation layer. Keep room-type words out of the generic
    // design intent so "furnish the living room" does not regenerate the plan.
    const furnitureWords = /furniture|furnish|sofa|coffee table|tv unit|dining table|wardrobe|almirah|study desk|bookshelf|book shelf|kitchen counter|fridge|refrigerator|washbasin|basin|\bwc\b|indoor plant|armchair|king bed|single bed|\bbed\b|desk/i;
    const furniturePatterns: { re: RegExp; templateId: string; roomType?: RoomType }[] = [
      { re: /sofa|settee/i, templateId: "living-sofa-3", roomType: "living" },
      { re: /coffee table/i, templateId: "living-coffee-table", roomType: "living" },
      { re: /tv|television/i, templateId: "living-tv-unit", roomType: "living" },
      { re: /armchair/i, templateId: "living-armchair", roomType: "living" },
      { re: /dining table/i, templateId: "dining-table-6", roomType: "dining" },
      { re: /wardrobe|almirah/i, templateId: "bedroom-wardrobe", roomType: "bedroom" },
      { re: /single bed/i, templateId: "bed-single", roomType: "bedroom" },
      { re: /king bed|double bed|\bbed\b/i, templateId: "bed-king", roomType: "bedroom" },
      { re: /desk|study table/i, templateId: "bedroom-desk", roomType: "study" },
      { re: /bookshelf|book shelf/i, templateId: "living-bookshelf", roomType: "living" },
      { re: /kitchen counter|counter/i, templateId: "kitchen-counter", roomType: "kitchen" },
      { re: /fridge|refrigerator/i, templateId: "kitchen-fridge", roomType: "kitchen" },
      { re: /washbasin|basin|sink/i, templateId: "bath-washbasin", roomType: "bathroom" },
      { re: /\bwc\b/i, templateId: "bath-wc", roomType: "toilet" },
      { re: /plant|planter/i, templateId: "decor-plant" },
    ];
    if (furnitureWords.test(lower)) {
      if (/remove|delete|clear/i.test(lower)) {
        if (completed.has("remove_furniture")) {
          return say("The selected furniture was removed from the presentation layer. Measured areas and cost are unchanged.");
        }
        const item = (project.furniture ?? []).find((entry) => {
          const label = entry.label.toLowerCase();
          const kind = entry.kind.replace(/_/g, " ");
          return lower.includes(label) || lower.includes(kind);
        });
        if (!item) {
          return say("I could not match that furniture. Open the Furniture section in the inspector to see the placed items, or ask me to list the furniture catalogue.");
        }
        return call("remove_furniture", { furniture_id: item.id });
      }
      if (completed.has("add_furniture")) {
        return say("The furniture was added to its room. You can remove it from the Inspector's Furniture list, and it stays out of all measured areas and costs.");
      }
      if (!/sofa|coffee table|tv|dining|wardrobe|bed|desk|bookshelf|kitchen|fridge|washbasin|basin|wc|plant|armchair/i.test(lower)) {
        return call("list_furniture_catalog", {});
      }
      const match = furniturePatterns.find((entry) => entry.re.test(lower)) ?? {
        templateId: "living-sofa-3",
        roomType: "living" as RoomType,
      };
      const roomType: RoomType | undefined =
        /master/.test(lower) ? "master_bedroom" : match.roomType;
      const floorHint = /first floor|upper floor|upstairs/.test(lower) ? 1 : /ground floor|downstairs/.test(lower) ? 0 : null;
      const rooms = project.floors
        .filter((floor) => (floorHint === null ? true : floor.level === floorHint))
        .flatMap((floor) => floor.rooms);
      const room = roomType ? rooms.find((entry) => entry.type === roomType) : null;
      return call("add_furniture", {
        template_id: match.templateId,
        ...(room ? { room_id: room.id } : {}),
      });
    }

    // Façade style and elevation requests.
    const facadeMatch = FACADE_TEMPLATES.find((template) => {
      const words = [template.id, template.name].map((w) => w.toLowerCase());
      return words.some((word) => lower.includes(word));
    });
    const elevationIntent = /elevation|facade|façade|front design|back design|side design|street view|house look/i.test(lower);
    if (elevationIntent) {
      if (facadeMatch && !completed.has("set_facade_template")) {
        return call("set_facade_template", { template_id: facadeMatch.id });
      }
      if (!completed.has("generate_elevations")) return call("generate_elevations", {});
      const summaryMatch = lastToolContent(messages).match(/"summary"\s*:\s*"([^"]+)"/);
      return say(
        `${summaryMatch?.[1] ?? "Elevations are ready."} I project front, rear, left and right faces from the stored walls and openings and apply the active façade finish. These are concept elevations, not construction drawings — open the Elevations tab to review all four.`,
      );
    }

    if (/compliance|reconcil|area match|matching.*(area|sqft|square)|sum.*room/i.test(lower)) {
      return call("get_area_compliance", {});
    }

    if (/brick|cement|steel|aggregate|sand|concrete|material pack|material estimate|construction calculator|calculator/i.test(lower)) {
      if (!completed.has("get_material_pack")) return call("get_material_pack", {});
      return say(
        "I converted the measured takeoff into planning quantities — bricks, cement bags, sand, aggregate, steel, tiles and finishes — with m³/ft³ conversions. Open the Compliance & calculator tab for the full table, or ask for a cost breakdown for room and floor allocations.",
      );
    }

    // Unit conversion: parse a value and the named units.
    const numberMatch = lower.match(/(\d+(?:\.\d+)?)/);
    if (/convert|gaj|sq\s*yard|square\s*yard|sqft|sq\.?\s*ft|square\s*feet|sqm|sq\.?\s*m|cubic|m3|m³|cft|ft3|ft³|acre|hectare/.test(lower) && numberMatch) {
      const areaMap: [RegExp, string][] = [
        [/\bgaj\b/, "gaj"],
        [/\bsq\s*yard|square\s*yard|sqyd|\byd2\b|\byd²\b/, "sqyd"],
        [/\bsqft|sq\.?\s*ft|square\s*feet|square\s*foot|\bft2\b|\bft²\b/, "sqft"],
        [/\bsqm|sq\.?\s*m|square\s*met|\bm2\b|\bm²\b/, "sqm"],
        [/\bacre\b/, "acre"],
        [/\bhectare\b|\bha\b/, "hectare"],
      ];
      const volumeMap: [RegExp, string][] = [
        [/\bcum|cubic\s*met|\bm3\b|\bm³\b/, "cum"],
        [/\bcft|cubic\s*feet|cubic\s*foot|\bft3\b|\bft³\b/, "cft"],
        [/\blitre|\bliter\b|\bL\b/, "litre"],
      ];
      const foundArea = areaMap.filter(([re]) => re.test(lower)).map(([, unit]) => unit);
      const foundVolume = volumeMap.filter(([re]) => re.test(lower)).map(([, unit]) => unit);
      const dimension = foundArea.length >= 2 ? "area" : foundVolume.length >= 2 ? "volume" : null;
      if (dimension && numberMatch) {
        const from = dimension === "area" ? foundArea[0]! : foundVolume[0]!;
        const to = dimension === "area" ? foundArea[1]! : foundVolume[1]!;
        return call("convert_units", { dimension, value: Number(numberMatch[1]), from, to });
      }
    }

    if (/template|style|design option|facade|façade|garden|pool|terrace|deck|pergola|driveway|courtyard/i.test(lower)) {
      return call("list_design_templates", {});
    }

    // Re-run a design pipeline deterministically, one tool per turn.
    const designIntent = /design|layout|plan|generate|3bhk|4bhk|bhk|house|duplex|villa|regenerate|options?/i.test(lower);
    if (designIntent) {
      const dims = parseDimensions(lower);
      const bedMatch = lower.match(/(\d+)\s*(?:bhk|bed(?:room)?s?)/);
      const bathMatch = lower.match(/(\d+)\s*(?:bath(?:room)?s?|toilets?)/);
      const gPlus = lower.match(/g\s*\+\s*(\d+)/);
      const floorMatch = lower.match(/(\d+)\s*(?:floors?|storeys?|stories)/);
      const desiredFloors = gPlus ? Number(gPlus[1]) + 1 : floorMatch ? Number(floorMatch[1]) : project.brief.floors;
      const bedrooms = bedMatch ? Number(bedMatch[1]) : undefined;
      const bathrooms = bathMatch ? Number(bathMatch[1]) : bedrooms;
      const pooja = /pooja|puja/i.test(lower);
      const parking = /parking|car/i.test(lower);
      const vastu = /vastu/i.test(lower);
      const daylight = /daylight|ventilat|light/i.test(lower);

      if (dims) {
        const widthM = toMetres(dims.width, dims.unit);
        const depthM = toMetres(dims.depth, dims.unit);
        const b = bbox(project.site.boundary);
        if (Math.abs(b.maxX - b.minX - widthM) > 0.2 || Math.abs(b.maxY - b.minY - depthM) > 0.2) {
          if (!completed.has("set_plot_dimensions")) {
            return call("set_plot_dimensions", { width: dims.width, depth: dims.depth, unit: dims.unit });
          }
        }
      }

      const briefChanged =
        (bedrooms !== undefined && bedrooms !== project.brief.bedrooms) ||
        (bathrooms !== undefined && bathrooms !== project.brief.bathrooms) ||
        (pooja && !project.brief.pooja) ||
        (parking && !project.brief.parking);
      if (briefChanged && !completed.has("update_brief")) {
        return call("update_brief", {
          ...(bedrooms !== undefined ? { bedrooms } : {}),
          ...(bathrooms !== undefined ? { bathrooms } : {}),
          ...(pooja ? { pooja: true } : {}),
          ...(parking ? { parking: true } : {}),
          description: text.slice(0, 380),
        });
      }

      if (project.floors.length < Math.min(4, Math.max(1, desiredFloors))) {
        return call("add_floor", {});
      }

      if (!completed.has("generate_layout_options")) {
        return call("generate_layout_options", {
          max_options: 3,
          program_description: text.slice(0, 600),
          objective_weights: vastu
            ? { vastu_alignment: 0.45, space_efficiency: 0.25, circulation: 0.15, daylight_potential: 0.1, cost: 0.05 }
            : daylight
              ? { daylight_potential: 0.4, space_efficiency: 0.3, circulation: 0.15, vastu_alignment: 0.1, cost: 0.05 }
              : { space_efficiency: 0.35, vastu_alignment: 0.25, circulation: 0.2, daylight_potential: 0.15, cost: 0.05 },
        });
      }

      const last = lastToolContent(messages);
      const countMatch = last.match(/"count"\s*:\s*(\d+)/);
      const count = countMatch ? Number(countMatch[1]) : 3;
      return say(
        `I generated ${count} layout options with the deterministic engine at revision ${project.revision}. They are proposals, not committed geometry — the candidate cards below show each option's scores and metrics. Hover a card to preview it on the plan, then choose one to apply (this asks for your approval).`,
      );
    }

    if (/undo|revert/.test(lower)) return call("undo_operation", {});
    if (/redo/.test(lower)) return call("redo_operation", {});

    if (/apply|use|choose|pick/.test(lower) && /option|candidate|design|layout|one|two|three|first|second|third/i.test(lower)) {
      if (!completed.has("get_design_candidates")) return call("get_design_candidates", {});
      const ids = [...lastToolContent(messages).matchAll(/"candidate_id"\s*:\s*"([^"]+)"/g)].map((m) => m[1]!);
      if (ids.length === 0) return say("No candidates are stored for this revision. Ask me to generate options first.");
      const index = /second|two|2/.test(lower) ? 1 : /third|three|3/.test(lower) ? 2 : 0;
      const candidateId = ids[Math.min(index, ids.length - 1)]!;
      return call("apply_design_proposal", { candidate_id: candidateId });
    }

    if (/delete|remove/.test(lower) && /room|kitchen|bed|bath|living|dining|study/i.test(lower)) {
      const match = lower.match(/(?:delete|remove)\s+(?:the\s+)?(.+?)(?:\s+room)?[.!]?$/);
      const query = match?.[1]?.replace(/\s+room$/, "").trim() ?? "";
      const found = query ? findRoomByName(project, query) : null;
      if (found) return call("delete_room", { room_id: found.room.id, remove_walls: true });
      return say(`I could not resolve a room named "${query}". Use the exact room name from the plan, for example "Delete the Guest bedroom".`);
    }

    if (/add|create|draw/.test(lower) && /room|bedroom|kitchen|study|bathroom|toilet|pooja/i.test(lower)) {
      const room = parseRoomType(lower);
      if (!room) return say("Tell me which room type to add.");
      const dims = parseDimensions(lower);
      const width = dims ? toMetres(dims.width, dims.unit) : 3.2;
      const depth = dims ? toMetres(dims.depth, dims.unit) : 3.6;
      const free = findFreeRect(project, width, depth);
      const plate = buildableRect(project);
      const rect = free ?? { x: plate.x0 + 0.2, y: plate.y0 + 0.2, width, depth };
      return call("add_room", {
        name: room.name,
        type: room.type,
        rect,
        floor_id: project.floors[0]!.id,
      });
    }

    if (/north/.test(lower)) {
      const match = lower.match(/(\d+(?:\.\d+)?)\s*(?:deg|degree|°)?/);
      const bearing = match ? Number(match[1]) : 0;
      return call("set_north_bearing", { bearing_deg: Math.max(0, Math.min(360, bearing)) });
    }

    if (/vastu|puja|pooja direction/.test(lower)) return call("run_vastu_analysis", {});
    if (/setback/.test(lower)) {
      const nums = [...lower.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      if (nums.length >= 4) {
        return call("set_setbacks", { front: nums[0], rear: nums[1], left: nums[2], right: nums[3] });
      }
      if (nums.length >= 1) {
        return call("set_setbacks", { front: nums[0], rear: nums[0], left: nums[0], right: nums[0] });
      }
      return say("Give me setbacks in metres, for example: setbacks 1.5 1.2 1.0 1.0 (front rear left right).");
    }
    if (/cost breakdown|per room|per floor|room cost|floor cost|room-wise|floor-wise/i.test(lower)) {
      return call("get_cost_breakdown", {});
    }
    if (/estimate|cost|budget|boq|price/i.test(lower)) return call("calculate_estimate", { package: "standard" });
    if (/pdf|drawing set/i.test(lower)) return call("export_pdf", {});
    if (/dxf|cad/i.test(lower)) return call("export_dxf", {});
    if (/report|download|pdf pack/i.test(lower)) return call("generate_project_report", {});
    if (/export.*json|json export/.test(lower)) return call("export_json", {});
    if (/area|schedule|measurement/i.test(lower)) return call("generate_area_schedule", {});
    if (/3d|model|render/i.test(lower)) return call("build_3d_model", {});
    if (/validate|check|error|overlap/i.test(lower)) return call("validate_geometry", {});
    if (/checkpoint|snapshot/.test(lower)) return call("create_checkpoint", { label: `Checkpoint from chat · R${project.revision}` });

    return say(
      `${projectSummary(project)}\n\nI can design a layout, add or resize rooms, move walls, add doors and windows, run Vastu and jurisdiction checks, estimate cost, or export PDF/DXF. Tell me one change and I will call the matching domain tool.`,
    );
  }
}
