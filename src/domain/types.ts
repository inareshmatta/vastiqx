/**
 * Canonical parametric building model.
 *
 * All coordinates are project-local metres. +X = east on the site plan,
 * +Y = north on the site plan. True north is stored separately as a bearing
 * (degrees clockwise from +Y) so rotating the site never mutates geometry.
 *
 * Everything in 2D, 3D, measurement, Vastu, BOQ and cost is derived from these
 * entities. Nothing else is authoritative.
 */

export type Unit = "m";
export type Currency = "INR";

export type ProjectType =
  | "independent_house"
  | "duplex"
  | "villa"
  | "flat"
  | "apartment_floor_plate"
  | "renovation";

export type RoomType =
  | "living"
  | "dining"
  | "kitchen"
  | "master_bedroom"
  | "bedroom"
  | "bathroom"
  | "toilet"
  | "foyer"
  | "corridor"
  | "stair"
  | "parking"
  | "pooja"
  | "balcony"
  | "utility"
  | "study"
  | "store"
  | "shaft"
  | "lift"
  | "lobby"
  | "other";

export type WallType =
  | "external_masonry"
  | "internal_masonry"
  | "party_wall"
  | "parapet";

export type SourceKind = "manual" | "agent" | "generated" | "imported";

export type SectorCode = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type Severity = "error" | "warning" | "info";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Setbacks {
  /** Front is the road-facing side, by convention -Y (south) before rotation. */
  front: number;
  rear: number;
  left: number;
  right: number;
}

export interface RoadEdge {
  side: "north" | "south" | "east" | "west";
  width: number;
}

export interface Site {
  boundary: Vec2[];
  /** Cached polygon area in m2 (recomputed from boundary by geometry service). */
  area: number;
  northBearing: number;
  roadEdges: RoadEdge[];
  setbacks: Setbacks;
  source: SourceKind;
}

export interface Opening {
  id: string;
  kind: "door" | "window";
  /** Distance of the opening centre from the wall start, along the baseline. */
  offset: number;
  width: number;
  height: number;
  sill: number;
  label?: string;
  /** Door swing direction, purely presentational metadata. */
  swing?: "left" | "right" | "double";
  source: SourceKind;
}

export interface Wall {
  id: string;
  start: Vec2;
  end: Vec2;
  thickness: number;
  height: number;
  type: WallType;
  material: string;
  openings: Opening[];
  source: SourceKind;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  /** Clear (inside-face) polygon. */
  polygon: Vec2[];
  targetArea?: number;
  vastuTags: SectorCode[];
  source: SourceKind;
}

export type ElementKind = "stair" | "column" | "slab" | "shaft" | "lift" | "roof";

export type FacadeRoof = "flat_parapet" | "pitched" | "terrace_garden";

export interface FacadeSettings {
  templateId: string;
  wallFinish: string;
  accentFinish: string;
  roof: FacadeRoof;
  notes: string[];
}

export type AmenityKind =
  | "garden"
  | "courtyard"
  | "pool"
  | "deck"
  | "pergola"
  | "driveway"
  | "terrace_garden";

export type FurnitureKind =
  | "sofa"
  | "coffee_table"
  | "tv_unit"
  | "dining_table"
  | "dining_chair"
  | "bed_king"
  | "bed_single"
  | "wardrobe"
  | "study_desk"
  | "bookshelf"
  | "kitchen_counter"
  | "fridge"
  | "washbasin"
  | "wc"
  | "plant"
  | "armchair";

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  label: string;
  floorId: string;
  roomId?: string;
  /** Axis-aligned footprint in project-local metres; rotation is presentation. */
  rect: { x: number; y: number; width: number; depth: number };
  /** Degrees clockwise from +X. */
  rotation: number;
  color: string;
  source: SourceKind;
}

export interface Amenity {
  id: string;
  kind: AmenityKind;
  label: string;
  templateId: string;
  /** Project-local rectangle for ground-level amenities. */
  rect?: { x: number; y: number; width: number; depth: number };
  /** Roof amenities are referenced to a floor level rather than a ground rect. */
  level: "ground" | "roof";
  notes: string[];
}

export interface BuildingElement {
  id: string;
  kind: ElementKind;
  roomId?: string;
  /** Axis-aligned footprint for MVP elements. */
  rect?: { x: number; y: number; width: number; depth: number };
  height?: number;
  source: SourceKind;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  elevation: number;
  height: number;
  walls: Wall[];
  rooms: Room[];
  elements: BuildingElement[];
  source: SourceKind;
}

export interface Brief {
  description: string;
  floors: number;
  bedrooms: number;
  bathrooms: number;
  budget?: number;
  parking: boolean;
  pooja: boolean;
  facing?: "north" | "south" | "east" | "west";
  requirements: string[];
  updatedAt: string;
}

export type ConstraintKind =
  | "adjacency"
  | "privacy"
  | "clearance"
  | "orientation"
  | "protected_dimension"
  | "budget";

export interface Constraint {
  id: string;
  kind: ConstraintKind;
  hard: boolean;
  scope: string;
  value: string | number;
  note?: string;
  source: SourceKind;
}

export interface VastuOverride {
  findingKey: string;
  reason: string;
  actorId: string;
  at: string;
}

export interface VastuSettings {
  profileId: string;
  overrides: VastuOverride[];
}

export interface Checkpoint {
  id: string;
  label: string;
  revision: number;
  createdAt: string;
  actorId: string;
  /** Full snapshot, so restore is exact. */
  snapshot?: Project;
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  type: ProjectType;
  units: Unit;
  currency: Currency;
  location: {
    city: string;
    state: string;
    country: string;
    jurisdictionPackId?: string;
  };
  revision: number;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  actorName: string;
  brief: Brief;
  site: Site;
  floors: Floor[];
  constraints: Constraint[];
  vastu: VastuSettings;
  rateBookId: string;
  checkpoints: Checkpoint[];
  /** Optional presentation layer; never affects measured geometry or cost. */
  facade?: FacadeSettings;
  /** Optional landscape/site amenities; excluded from built-up and room areas. */
  amenities?: Amenity[];
  /** Optional furniture/presentation layer; excluded from built-up and cost. */
  furniture?: FurnitureItem[];
}

/* ---------- derived / service result types ---------- */

export interface RoomMetrics {
  roomId: string;
  name: string;
  type: RoomType;
  area: number;
  perimeter: number;
  width: number;
  depth: number;
  centroid: Vec2;
  direction: SectorCode;
}

export interface FloorMetrics {
  floorId: string;
  name: string;
  level: number;
  roomArea: number;
  wallLength: number;
  wallVolume: number;
  builtUpArea: number;
  carpetArea: number;
  rooms: RoomMetrics[];
}

export interface ProjectMetrics {
  plotArea: number;
  groundCoverage: number;
  groundCoverageRatio: number;
  totalBuiltUp: number;
  totalCarpet: number;
  fsi: number;
  /** Area inside the buildable setback envelope, computed from the plot bbox. */
  buildableArea: number;
  floors: FloorMetrics[];
  wallLengthTotal: number;
  doorCount: number;
  windowCount: number;
  roomCount: number;
  northBearing: number;
  methods: {
    roomArea: string;
    builtUp: string;
  };
}

export interface ValidationFinding {
  code: string;
  severity: Severity;
  message: string;
  entityId?: string;
  entityKind?: string;
  hint?: string;
  floorId?: string;
}

export interface CandidateScore {
  space_efficiency: number;
  vastu_alignment: number;
  circulation: number;
  daylight_potential: number;
  cost: number;
  total: number;
}

export interface LayoutCandidate {
  candidateId: string;
  name: string;
  description: string;
  floors: Floor[];
  metrics: ProjectMetrics;
  scores: CandidateScore;
  vastuSummary: { pass: number; advisory: number; fail: number; not_assessed: number };
  estimateTotal: number;
  generatedAt: string;
  engineVersion: string;
}

export const ROOM_LABELS: Record<RoomType, string> = {
  living: "Living",
  dining: "Dining",
  kitchen: "Kitchen",
  master_bedroom: "Master bedroom",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  toilet: "Toilet",
  foyer: "Foyer",
  corridor: "Corridor",
  stair: "Stair",
  parking: "Parking",
  pooja: "Pooja",
  balcony: "Balcony",
  utility: "Utility",
  study: "Study",
  store: "Store",
  shaft: "Shaft",
  lift: "Lift",
  lobby: "Lobby",
  other: "Space",
};

export const ROOM_COLORS: Record<RoomType, string> = {
  living: "#c9a87c",
  dining: "#b9a27a",
  kitchen: "#c98a6a",
  master_bedroom: "#8fa8b8",
  bedroom: "#9db3bf",
  bathroom: "#7fa8a0",
  toilet: "#7fa8a0",
  foyer: "#a8a08c",
  corridor: "#8d8d85",
  stair: "#8c8ca8",
  parking: "#7d7f88",
  pooja: "#d4b06a",
  balcony: "#8fae8c",
  utility: "#8a9a94",
  study: "#a3a08f",
  store: "#8f8a82",
  shaft: "#75757d",
  lift: "#8a8aa0",
  lobby: "#9a9488",
  other: "#9a9a9a",
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  independent_house: "Independent house",
  duplex: "Duplex",
  villa: "Villa",
  flat: "Flat",
  apartment_floor_plate: "Apartment floor plate",
  renovation: "Renovation",
};

export const SECTORS: SectorCode[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const SECTOR_LABELS: Record<SectorCode, string> = {
  N: "North",
  NE: "North-east",
  E: "East",
  SE: "South-east",
  S: "South",
  SW: "South-west",
  W: "West",
  NW: "North-west",
};
