import { bbox, pointInPolygon, polygonOverlapArea, rectPolygon, round } from "./geometry";
import { newId } from "./project";
import type { Floor, FurnitureItem, FurnitureKind, Project, Room, RoomType, Vec2 } from "./types";

export interface FurnitureTemplate {
  id: string;
  kind: FurnitureKind;
  name: string;
  description: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  rooms: RoomType[];
  placement: "wall" | "centre" | "corner";
}

/**
 * Furniture is a presentation layer, like the façade and landscape layers.
 * It is deliberately excluded from room areas, built-up, Vastu, BOQ and cost.
 * The catalogue uses common Indian residential sizes in metres.
 */
export const FURNITURE_TEMPLATES: FurnitureTemplate[] = [
  {
    id: "living-sofa-3",
    kind: "sofa",
    name: "3-seat sofa",
    description: "2.10 × 0.90 m three-seat sofa, placed against a living-room wall.",
    width: 2.1,
    depth: 0.9,
    height: 0.82,
    color: "#6f7f86",
    rooms: ["living"],
    placement: "wall",
  },
  {
    id: "living-coffee-table",
    kind: "coffee_table",
    name: "Coffee table",
    description: "1.10 × 0.60 m low table centred in the living zone.",
    width: 1.1,
    depth: 0.6,
    height: 0.42,
    color: "#9a7a52",
    rooms: ["living"],
    placement: "centre",
  },
  {
    id: "living-tv-unit",
    kind: "tv_unit",
    name: "TV unit",
    description: "1.60 × 0.45 m media console against a wall.",
    width: 1.6,
    depth: 0.45,
    height: 0.55,
    color: "#4b4a44",
    rooms: ["living"],
    placement: "wall",
  },
  {
    id: "living-armchair",
    kind: "armchair",
    name: "Armchair",
    description: "0.85 × 0.85 m lounge chair for a reading corner.",
    width: 0.85,
    depth: 0.85,
    height: 0.82,
    color: "#8b6f5d",
    rooms: ["living", "study", "master_bedroom"],
    placement: "corner",
  },
  {
    id: "dining-table-6",
    kind: "dining_table",
    name: "6-seat dining table",
    description: "1.80 × 0.90 m dining table with six place settings.",
    width: 1.8,
    depth: 0.9,
    height: 0.75,
    color: "#8a6a48",
    rooms: ["dining", "living"],
    placement: "centre",
  },
  {
    id: "dining-chair",
    kind: "dining_chair",
    name: "Dining chair",
    description: "0.45 × 0.48 m chair; add as many as the table needs.",
    width: 0.45,
    depth: 0.48,
    height: 0.9,
    color: "#a98863",
    rooms: ["dining"],
    placement: "wall",
  },
  {
    id: "bed-king",
    kind: "bed_king",
    name: "King bed",
    description: "1.83 × 2.03 m king bed with side clearance.",
    width: 1.83,
    depth: 2.03,
    height: 0.55,
    color: "#8fa8b8",
    rooms: ["master_bedroom", "bedroom"],
    placement: "wall",
  },
  {
    id: "bed-single",
    kind: "bed_single",
    name: "Single bed",
    description: "1.00 × 2.00 m single bed for a child or guest room.",
    width: 1,
    depth: 2,
    height: 0.5,
    color: "#9db3bf",
    rooms: ["bedroom", "master_bedroom"],
    placement: "wall",
  },
  {
    id: "bedroom-wardrobe",
    kind: "wardrobe",
    name: "Wardrobe",
    description: "2.00 × 0.60 m two-door wardrobe against a bedroom wall.",
    width: 2,
    depth: 0.6,
    height: 2.2,
    color: "#a58b6b",
    rooms: ["master_bedroom", "bedroom"],
    placement: "wall",
  },
  {
    id: "bedroom-desk",
    kind: "study_desk",
    name: "Study desk",
    description: "1.20 × 0.60 m desk with a chair position.",
    width: 1.2,
    depth: 0.6,
    height: 0.75,
    color: "#9b835f",
    rooms: ["study", "bedroom", "master_bedroom"],
    placement: "wall",
  },
  {
    id: "living-bookshelf",
    kind: "bookshelf",
    name: "Bookshelf",
    description: "1.00 × 0.35 m open shelf against a wall.",
    width: 1,
    depth: 0.35,
    height: 1.9,
    color: "#7d6549",
    rooms: ["study", "living", "bedroom"],
    placement: "wall",
  },
  {
    id: "kitchen-counter",
    kind: "kitchen_counter",
    name: "Kitchen counter",
    description: "2.40 × 0.60 m base counter with sink and hob allowance.",
    width: 2.4,
    depth: 0.6,
    height: 0.9,
    color: "#b49b7a",
    rooms: ["kitchen", "utility"],
    placement: "wall",
  },
  {
    id: "kitchen-fridge",
    kind: "fridge",
    name: "Refrigerator",
    description: "0.70 × 0.70 m fridge footprint with door clearance.",
    width: 0.7,
    depth: 0.7,
    height: 1.8,
    color: "#b9c1c4",
    rooms: ["kitchen"],
    placement: "corner",
  },
  {
    id: "bath-washbasin",
    kind: "washbasin",
    name: "Washbasin",
    description: "0.60 × 0.45 m basin against a bathroom wall.",
    width: 0.6,
    depth: 0.45,
    height: 0.85,
    color: "#d7d9d4",
    rooms: ["bathroom", "toilet"],
    placement: "wall",
  },
  {
    id: "bath-wc",
    kind: "wc",
    name: "WC",
    description: "0.40 × 0.65 m water closet with clearance.",
    width: 0.4,
    depth: 0.65,
    height: 0.4,
    color: "#e2e2dc",
    rooms: ["bathroom", "toilet"],
    placement: "wall",
  },
  {
    id: "decor-plant",
    kind: "plant",
    name: "Indoor plant",
    description: "0.50 × 0.50 m planter for a corner or balcony.",
    width: 0.5,
    depth: 0.5,
    height: 1.1,
    color: "#7fa86a",
    rooms: ["living", "dining", "balcony", "study", "foyer"],
    placement: "corner",
  },
];

const HEIGHTS: Record<FurnitureKind, number> = {
  sofa: 0.82,
  coffee_table: 0.42,
  tv_unit: 0.55,
  dining_table: 0.75,
  dining_chair: 0.9,
  bed_king: 0.55,
  bed_single: 0.5,
  wardrobe: 2.2,
  study_desk: 0.75,
  bookshelf: 1.9,
  kitchen_counter: 0.9,
  fridge: 1.8,
  washbasin: 0.85,
  wc: 0.4,
  plant: 1.1,
  armchair: 0.82,
};

export function furnitureTemplate(id: string): FurnitureTemplate {
  const template = FURNITURE_TEMPLATES.find((item) => item.id === id);
  if (!template) {
    throw new Error(`Unknown furniture template "${id}". Choose one of: ${FURNITURE_TEMPLATES.map((item) => item.id).join(", ")}.`);
  }
  return template;
}

function corners(rect: { x: number; y: number; width: number; depth: number }): Vec2[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.depth },
    { x: rect.x, y: rect.y + rect.depth },
  ];
}

function insideRoom(room: Room, rect: { x: number; y: number; width: number; depth: number }): boolean {
  const test = [...corners(rect), { x: rect.x + rect.width / 2, y: rect.y + rect.depth / 2 }];
  return test.every((point) => pointInPolygon(point, room.polygon));
}

function clashes(project: Project, floorId: string, rect: { x: number; y: number; width: number; depth: number }, ignoreId?: string): boolean {
  const candidate = rectPolygon(rect.x, rect.y, rect.x + rect.width, rect.y + rect.depth);
  return (project.furniture ?? []).some((item) => {
    if (item.floorId !== floorId || item.id === ignoreId) return false;
    const other = rectPolygon(item.rect.x, item.rect.y, item.rect.x + item.rect.width, item.rect.y + item.rect.depth);
    return polygonOverlapArea(candidate, other, 0.05) > 0.015;
  });
}

function candidateRects(room: Room, width: number, depth: number, placement: FurnitureTemplate["placement"]): { rect: { x: number; y: number; width: number; depth: number }; rotation: number }[] {
  const b = bbox(room.polygon);
  const inset = 0.16;
  const out: { rect: { x: number; y: number; width: number; depth: number }; rotation: number }[] = [];
  const add = (x: number, y: number, w: number, d: number, rotation: number) => {
    out.push({ rect: { x: round(x, 2), y: round(y, 2), width: round(w, 2), depth: round(d, 2) }, rotation });
  };
  const sizes = [
    { w: width, d: depth, r: 0 },
    { w: depth, d: width, r: 90 },
  ];

  if (placement === "centre") {
    for (const size of sizes) add((b.minX + b.maxX) / 2 - size.w / 2, (b.minY + b.maxY) / 2 - size.d / 2, size.w, size.d, size.r);
    return out;
  }

  for (const size of sizes) {
    const cx = (b.minX + b.maxX) / 2 - size.w / 2;
    const cy = (b.minY + b.maxY) / 2 - size.d / 2;
    if (placement === "corner") {
      add(b.minX + inset, b.minY + inset, size.w, size.d, size.r);
      add(b.maxX - inset - size.w, b.minY + inset, size.w, size.d, size.r);
      add(b.minX + inset, b.maxY - inset - size.d, size.w, size.d, size.r);
      add(b.maxX - inset - size.w, b.maxY - inset - size.d, size.w, size.d, size.r);
    } else {
      add(cx, b.minY + inset, size.w, size.d, size.r);
      add(cx, b.maxY - inset - size.d, size.w, size.d, size.r);
      add(b.minX + inset, cy, size.w, size.d, size.r);
      add(b.maxX - inset - size.w, cy, size.w, size.d, size.r);
    }
  }
  return out;
}

export function placeFurniture(
  project: Project,
  templateId: string,
  roomId?: string,
  requested?: { x: number; y: number; width: number; depth: number },
  rotation = 0,
): { item: FurnitureItem; template: FurnitureTemplate; room: Room; floor: Floor } {
  const template = furnitureTemplate(templateId);
  const floors = project.floors;
  let floor: Floor | undefined;
  let room: Room | undefined;

  if (roomId) {
    for (const candidateFloor of floors) {
      const found = candidateFloor.rooms.find((item) => item.id === roomId);
      if (found) {
        floor = candidateFloor;
        room = found;
        break;
      }
    }
  } else {
    for (const candidateFloor of floors) {
      const found = candidateFloor.rooms.find((item) => template.rooms.includes(item.type));
      if (found) {
        floor = candidateFloor;
        room = found;
        break;
      }
    }
  }

  if (!floor || !room) {
    throw new Error(`No suitable ${template.rooms.join(" / ")} room was found for the ${template.name}. Add a room first or pass room_id.`);
  }

  if (requested) {
    if (!insideRoom(room, requested)) {
      throw new Error(`The requested ${template.name} footprint is outside ${room.name}.`);
    }
    if (clashes(project, floor.id, requested)) {
      throw new Error(`The requested ${template.name} footprint overlaps existing furniture in ${room.name}.`);
    }
  }

  let rect = requested;
  let usedRotation = rotation;
  if (!rect) {
    const options = candidateRects(room, template.width, template.depth, template.placement);
    const found = options.find((option) => insideRoom(room!, option.rect) && !clashes(project, floor!.id, option.rect));
    if (!found) {
      throw new Error(
        `No free ${template.width.toFixed(2)} × ${template.depth.toFixed(2)} m position fits the ${template.name} inside ${room.name}. Remove another item, enlarge the room, or place it manually.`,
      );
    }
    rect = found.rect;
    usedRotation = found.rotation;
  }

  const item: FurnitureItem = {
    id: newId("fur"),
    kind: template.kind,
    label: template.name,
    floorId: floor.id,
    roomId: room.id,
    rect,
    rotation: usedRotation,
    color: template.color,
    source: "manual",
  };
  project.furniture = [...(project.furniture ?? []), item];
  return { item, template, room, floor };
}

export function removeFurniture(project: Project, furnitureId: string): FurnitureItem | null {
  const list = project.furniture ?? [];
  const found = list.find((item) => item.id === furnitureId);
  if (!found) return null;
  project.furniture = list.filter((item) => item.id !== furnitureId);
  return found;
}

export function moveFurniture(project: Project, furnitureId: string, rect: { x: number; y: number; width: number; depth: number }, rotation?: number): FurnitureItem {
  const list = project.furniture ?? [];
  const item = list.find((entry) => entry.id === furnitureId);
  if (!item) throw new Error(`Furniture ${furnitureId} was not found.`);
  const floor = project.floors.find((entry) => entry.id === item.floorId);
  const room = floor?.rooms.find((entry) => entry.id === item.roomId);
  if (!floor || !room) throw new Error(`The room for ${item.label} no longer exists.`);
  if (!insideRoom(room, rect)) throw new Error(`The ${item.label} footprint is outside ${room.name}.`);
  if (clashes(project, floor.id, rect, item.id)) throw new Error(`The ${item.label} would overlap existing furniture.`);
  item.rect = { x: round(rect.x, 2), y: round(rect.y, 2), width: round(rect.width, 2), depth: round(rect.depth, 2) };
  if (rotation !== undefined) item.rotation = rotation;
  return item;
}

export function furnitureCatalogue(project: Project) {
  return {
    templates: FURNITURE_TEMPLATES.map((template) => ({
      id: template.id,
      kind: template.kind,
      name: template.name,
      description: template.description,
      size_m: { width: template.width, depth: template.depth, height: template.height },
      rooms: template.rooms,
      placement: template.placement,
      color: template.color,
    })),
    items: (project.furniture ?? []).map((item) => {
      const floor = project.floors.find((entry) => entry.id === item.floorId);
      const room = floor?.rooms.find((entry) => entry.id === item.roomId);
      return {
        furniture_id: item.id,
        kind: item.kind,
        label: item.label,
        floor: floor?.name ?? "Unknown floor",
        room: room?.name ?? "Unknown room",
        rect: item.rect,
        rotation: item.rotation,
        area_m2: round(item.rect.width * item.rect.depth, 2),
      };
    }),
    note: "Furniture is a presentation layer. It is excluded from room areas, built-up, Vastu, BOQ and cost.",
  };
}

export function furnitureHeight(kind: FurnitureKind): number {
  return HEIGHTS[kind] ?? 0.6;
}

export function furnitureSchedule(project: Project): { floor: string; room: string; label: string; kind: FurnitureKind; width: number; depth: number; rotation: number }[] {
  return (project.furniture ?? []).map((item) => {
    const floor = project.floors.find((entry) => entry.id === item.floorId);
    const room = floor?.rooms.find((entry) => entry.id === item.roomId);
    return {
      floor: floor?.name ?? "Unknown",
      room: room?.name ?? "Unknown",
      label: item.label,
      kind: item.kind,
      width: item.rect.width,
      depth: item.rect.depth,
      rotation: item.rotation,
    };
  });
}
