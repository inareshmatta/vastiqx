import { polygonArea, rectPolygon } from "./geometry";
import type { Floor, Project, ProjectType, Unit } from "./types";

export function newId(prefix: string): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${uuid.replace(/-/g, "").slice(0, 12)}`;
}

export function toMetres(value: number, unit: "m" | "ft" | "mm"): number {
  if (unit === "ft") return value * 0.3048;
  if (unit === "mm") return value / 1000;
  return value;
}

export function emptyFloor(level: number, height = 3.05): Floor {
  return {
    id: newId("flr"),
    name: level === 0 ? "Ground" : level === 1 ? "First" : level === 2 ? "Second" : `Level ${level}`,
    level,
    elevation: level === 0 ? 0 : level * height,
    height,
    walls: [],
    rooms: [],
    elements: [],
    source: "manual",
  };
}

export interface CreateProjectInput {
  name: string;
  type?: ProjectType;
  plotWidth?: number;
  plotDepth?: number;
  plotUnit?: "m" | "ft";
  city?: string;
  state?: string;
  northBearing?: number;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  description?: string;
}

export function createProject(input: CreateProjectInput): Project {
  const now = new Date().toISOString();
  const width = Math.max(3, toMetres(input.plotWidth ?? 9.14, input.plotUnit ?? "m"));
  const depth = Math.max(3, toMetres(input.plotDepth ?? 12.19, input.plotUnit ?? "m"));
  const units: Unit = "m";
  const floorCount = Math.max(1, Math.min(4, input.floors ?? 1));
  const boundary = rectPolygon(0, 0, width, depth);
  const floors: Floor[] = [];
  for (let i = 0; i < floorCount; i++) {
    const floor = emptyFloor(i);
    if (i === 0) floor.source = "manual";
    floors.push(floor);
  }
  const setbacks = {
    front: width < 7 ? 0.9 : 1.2,
    rear: 1.0,
    left: Math.min(1.0, width * 0.08),
    right: Math.min(1.0, width * 0.08),
  };
  return {
    schemaVersion: 1,
    id: newId("prj"),
    name: input.name.trim() || "Untitled project",
    type: input.type ?? "independent_house",
    units,
    currency: "INR",
    location: {
      city: input.city ?? "Bengaluru",
      state: input.state ?? "Karnataka",
      country: "India",
      jurisdictionPackId: "IN-KA-BLR-DEMO-2026",
    },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ownerId: "demo-user",
    actorName: "Demo architect",
    brief: {
      description: input.description ?? "",
      floors: floorCount,
      bedrooms: input.bedrooms ?? 2,
      bathrooms: input.bathrooms ?? 2,
      parking: false,
      pooja: false,
      requirements: [],
      updatedAt: now,
    },
    site: {
      boundary,
      area: Math.round(polygonArea(boundary) * 100) / 100,
      northBearing: input.northBearing ?? 0,
      roadEdges: [{ side: "south", width: 9 }],
      setbacks,
      source: "manual",
    },
    floors,
    constraints: [],
    vastu: { profileId: "vastu-general-v1", overrides: [] },
    rateBookId: "RB-IN-BLR-2026-04",
    checkpoints: [],
    facade: {
      templateId: "warm-contemporary",
      wallFinish: "Warm lime plaster",
      accentFinish: "Teak louvres",
      roof: "flat_parapet",
      notes: [],
    },
    amenities: [],
  };
}

export function getFloor(project: Project, floorId: string | undefined): Floor {
  if (floorId) {
    const found = project.floors.find((f) => f.id === floorId);
    if (found) return found;
  }
  return project.floors[0]!;
}

export function findRoomByName(project: Project, query: string): { floor: Floor; room: Project["floors"][number]["rooms"][number] } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const floor of project.floors) {
    const exact = floor.rooms.find((r) => r.name.toLowerCase() === q);
    if (exact) return { floor, room: exact };
  }
  for (const floor of project.floors) {
    const partial = floor.rooms.find((r) => r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase()));
    if (partial) return { floor, room: partial };
  }
  return null;
}
