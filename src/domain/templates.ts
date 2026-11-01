import { bbox, polygonOverlapArea, rectPolygon, round } from "./geometry";
import { buildableRect } from "./measure";
import { newId } from "./project";
import type { Amenity, AmenityKind, FacadeRoof, FacadeSettings, Project } from "./types";

export interface FacadePalette {
  primary: string;
  secondary: string;
  accent: string;
  roof: string;
  glazing: string;
  door: string;
}

export interface FacadeTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  roof: FacadeRoof;
  wallFinish: string;
  accentFinish: string;
  palette: FacadePalette;
  materials: string[];
  bestFor: string[];
}

export interface LandscapeTemplate {
  id: string;
  name: string;
  kind: AmenityKind;
  tagline: string;
  description: string;
  level: "ground" | "roof";
  defaultWidth: number;
  defaultDepth: number;
  placement: "front" | "rear" | "side" | "any";
  palette: { fill: string; stroke: string };
  notes: string[];
}

export const FACADE_TEMPLATES: FacadeTemplate[] = [
  {
    id: "warm-contemporary",
    name: "Warm contemporary",
    tagline: "Lime plaster, teak louvres, deep shading",
    description:
      "A calm, warm elevation with a rendered body, vertical timber louvres over the stair and balcony, and a clean flat parapet. Good for south and west faces that need shading.",
    roof: "flat_parapet",
    wallFinish: "Warm lime plaster",
    accentFinish: "Teak louvres",
    palette: {
      primary: "#d9c3a5",
      secondary: "#e8d9c3",
      accent: "#9a6638",
      roof: "#c4b49c",
      glazing: "#8fb2ba",
      door: "#7d4f2a",
    },
    materials: ["Lime render", "Teak-finish aluminium louvres", "Concrete coping", "Powder-coated railings"],
    bestFor: ["South-facing plots", "Compact urban homes", "Balcony shading"],
  },
  {
    id: "coastal-white",
    name: "Coastal white",
    tagline: "White walls, blue accents, terrace garden",
    description:
      "A bright white body with sea-blue accents, wide glazing and a roof terrace planted with low greenery. Reads light and open on east-facing plots.",
    roof: "terrace_garden",
    wallFinish: "White textured plaster",
    accentFinish: "Cobalt blue steel",
    palette: {
      primary: "#f2f1ea",
      secondary: "#ffffff",
      accent: "#2f6f8f",
      roof: "#d9e3e4",
      glazing: "#9cc7d4",
      door: "#28566f",
    },
    materials: ["Weatherproof white render", "Blue powder-coated steel", "Glass balustrade", "Terrace planters"],
    bestFor: ["East-facing plots", "Coastal or humid climates", "Roof terraces"],
  },
  {
    id: "urban-brick",
    name: "Urban brick",
    tagline: "Exposed brick, black steel, tall openings",
    description:
      "Exposed brick body with black steel frames and a flush parapet. Warm and tactile at street level, crisp above. Suits narrow urban frontages.",
    roof: "flat_parapet",
    wallFinish: "Exposed wire-cut brick",
    accentFinish: "Black powder-coated steel",
    palette: {
      primary: "#a96c50",
      secondary: "#c29074",
      accent: "#2f2f2c",
      roof: "#b4a492",
      glazing: "#8aa6ad",
      door: "#3a2b23",
    },
    materials: ["Wire-cut brick", "Black steel window frames", "Concrete lintels", "Stone coping"],
    bestFor: ["Narrow urban plots", "West-facing streets", "Loft-style interiors"],
  },
  {
    id: "minimal-grey",
    name: "Minimal grey",
    tagline: "Grey render, full-height glass, shadow lines",
    description:
      "A restrained grey render with deep shadow lines, full-height glazing and a slim parapet. Low visual noise, strong geometry.",
    roof: "flat_parapet",
    wallFinish: "Grey cement render",
    accentFinish: "Charcoal shadow-line trims",
    palette: {
      primary: "#a8a8a2",
      secondary: "#c7c6bf",
      accent: "#4a4d50",
      roof: "#9b9b94",
      glazing: "#7f9ea8",
      door: "#3c4145",
    },
    materials: ["Cement render", "Anodised aluminium", "Low-iron glass", "Slim concrete coping"],
    bestFor: ["Modern villas", "North-facing light", "Minimal budgets"],
  },
  {
    id: "tropical-louvre",
    name: "Tropical louvre",
    tagline: "Sandstone, timber screens, pitched shade",
    description:
      "A sandstone-toned body with timber jaali screens and a shallow pitched roof for rain protection. Designed for warm, humid climates and cross ventilation.",
    roof: "pitched",
    wallFinish: "Sandstone-textured render",
    accentFinish: "Timber jaali screens",
    palette: {
      primary: "#cbb18c",
      secondary: "#e1cfb2",
      accent: "#8a5a33",
      roof: "#8b5f3a",
      glazing: "#8eb3a8",
      door: "#5c3a22",
    },
    materials: ["Sandstone render", "Timber jaali", "Metal standing-seam roof", "Deep verandah"],
    bestFor: ["Warm humid climates", "Garden-facing plots", "Cross ventilation"],
  },
  {
    id: "heritage-jaali",
    name: "Heritage jaali",
    tagline: "Ivory stone, carved screens, courtyard shade",
    description:
      "An ivory stone-toned elevation with carved jaali screens, a projecting cornice and a shaded courtyard edge. A contemporary reading of a traditional Indian street façade.",
    roof: "flat_parapet",
    wallFinish: "Ivory stone-textured render",
    accentFinish: "Stone jaali screens",
    palette: {
      primary: "#e3d8c2",
      secondary: "#f1eadb",
      accent: "#8c6a47",
      roof: "#d3c5ac",
      glazing: "#8fa9a3",
      door: "#6b4a2c",
    },
    materials: ["Stone dust render", "Carved jaali panels", "Projecting cornice", "Courtyard paving"],
    bestFor: ["Traditional neighbourhoods", "Courtyard homes", "Privacy from the street"],
  },
  {
    id: "modern-monolith",
    name: "Modern monolith",
    tagline: "Crisp white volumes, charcoal frames, flat roof",
    description:
      "A modern flat-roof house with crisp off-white volumes, a deep charcoal frame around full-height glazing, and a slim parapet. Strong horizontal lines and a clean street presence.",
    roof: "flat_parapet",
    wallFinish: "Off-white textured render",
    accentFinish: "Charcoal aluminium frames",
    palette: {
      primary: "#e8e5dd",
      secondary: "#f7f4ec",
      accent: "#2f3433",
      roof: "#c9c5bb",
      glazing: "#7f9aa2",
      door: "#263230",
    },
    materials: ["Off-white render", "Charcoal aluminium", "Full-height low-E glazing", "Slim concrete coping"],
    bestFor: ["Modern urban homes", "South/west sun control", "Large living-room glazing"],
  },
  {
    id: "modern-courtyard",
    name: "Modern courtyard",
    tagline: "Warm lime, dark timber, planted terrace",
    description:
      "A warm modern house organised around a shaded court: lime-plaster volumes, dark timber reveals, deep overhangs and a planted roof terrace. Calm, tactile and climate-responsive.",
    roof: "terrace_garden",
    wallFinish: "Warm lime plaster",
    accentFinish: "Dark stained timber",
    palette: {
      primary: "#d8cec0",
      secondary: "#ece4d8",
      accent: "#5f4a36",
      roof: "#bdb3a4",
      glazing: "#8ca9a8",
      door: "#3e3328",
    },
    materials: ["Lime plaster", "Dark timber battens", "Deep concrete overhangs", "Terrace planters"],
    bestFor: ["Courtyard plots", "Cross-ventilated homes", "Warm minimal interiors"],
  },
  {
    id: "modern-glass-villa",
    name: "Modern glass villa",
    tagline: "Floating white slab, glass, dark stone",
    description:
      "A contemporary glass villa with a floating white slab, dark stone base and floor-to-ceiling glazing. A sharp, low-horizon elevation for a wide frontage.",
    roof: "flat_parapet",
    wallFinish: "White fair-face render",
    accentFinish: "Dark basalt stone",
    palette: {
      primary: "#d9d9d4",
      secondary: "#f0f0eb",
      accent: "#3a3f40",
      roof: "#c1c1ba",
      glazing: "#86a9b4",
      door: "#2b2f30",
    },
    materials: ["Fair-face white render", "Basalt cladding", "Structural glazing", "Flush coping"],
    bestFor: ["Wide frontages", "Villas and duplexes", "Indoor-outdoor living"],
  },
];

export const LANDSCAPE_TEMPLATES: LandscapeTemplate[] = [
  {
    id: "rear-garden",
    name: "Rear garden",
    kind: "garden",
    tagline: "Lawn, planting bed and path",
    description: "A soft rear garden with a lawn, a 600 mm planting bed and a paved path along the house.",
    level: "ground",
    defaultWidth: 4.5,
    defaultDepth: 3,
    placement: "rear",
    palette: { fill: "#9fbd8e", stroke: "#6f9160" },
    notes: ["Excluded from built-up area", "Irrigation and drainage to be designed", "Planting is indicative"],
  },
  {
    id: "courtyard-garden",
    name: "Courtyard garden",
    kind: "courtyard",
    tagline: "Sheltered court with a tree",
    description: "A small sheltered courtyard with paving, a feature tree and a seating edge.",
    level: "ground",
    defaultWidth: 3.2,
    defaultDepth: 3.2,
    placement: "front",
    palette: { fill: "#b7c4a3", stroke: "#7e8f6a" },
    notes: ["Provides cross ventilation", "Excluded from built-up area", "Tree size to be confirmed"],
  },
  {
    id: "lap-pool",
    name: "Lap pool",
    kind: "pool",
    tagline: "6 × 3 m plunge pool with deck",
    description: "A compact 6 × 3 m pool with a surrounding deck, set in the rear or side yard.",
    level: "ground",
    defaultWidth: 6,
    defaultDepth: 3,
    placement: "rear",
    palette: { fill: "#9cc8d6", stroke: "#4f8ea3" },
    notes: ["Pool and deck are excluded from built-up area", "Structure, filtration and safety to be engineered", "Waterproofing and fencing required"],
  },
  {
    id: "timber-deck",
    name: "Timber deck",
    kind: "deck",
    tagline: "Outdoor deck for dining",
    description: "A timber-look deck sized for an outdoor dining table, adjoining the living or dining room.",
    level: "ground",
    defaultWidth: 4,
    defaultDepth: 3,
    placement: "rear",
    palette: { fill: "#c2a37f", stroke: "#8c6a47" },
    notes: ["Excluded from built-up area", "Deck framing and drainage to be designed"],
  },
  {
    id: "pergola-shade",
    name: "Pergola shade",
    kind: "pergola",
    tagline: "Shaded outdoor room",
    description: "A pergola with climbing planting that creates a shaded outdoor room beside the house.",
    level: "ground",
    defaultWidth: 4,
    defaultDepth: 3,
    placement: "side",
    palette: { fill: "#bfae8e", stroke: "#8a7656" },
    notes: ["Excluded from built-up area", "Structural fixing to be engineered", "Shade percentage indicative"],
  },
  {
    id: "car-driveway",
    name: "Car driveway",
    kind: "driveway",
    tagline: "2.7 m access with paver finish",
    description: "A 2.7 m wide driveway from the road edge to the porch or parking bay.",
    level: "ground",
    defaultWidth: 2.7,
    defaultDepth: 5,
    placement: "front",
    palette: { fill: "#b9b4a9", stroke: "#8e897f" },
    notes: ["Excluded from built-up area", "Drainage and gate position to be confirmed", "Paver specification open"],
  },
  {
    id: "roof-terrace-garden",
    name: "Roof terrace garden",
    kind: "terrace_garden",
    tagline: "Planters, shade and a seating zone",
    description: "A roof terrace with lightweight planters, a shade pergola and a seating zone over the top floor.",
    level: "roof",
    defaultWidth: 4,
    defaultDepth: 3,
    placement: "any",
    palette: { fill: "#a9bf97", stroke: "#70885f" },
    notes: ["Excluded from built-up area", "Requires waterproofing and lightweight growing medium", "Structural load to be confirmed"],
  },
];

export const DEFAULT_FACADE_ID = "modern-monolith";

export function findFacadeTemplate(id: string | undefined): FacadeTemplate {
  return FACADE_TEMPLATES.find((t) => t.id === id) ?? FACADE_TEMPLATES[0]!;
}

export function currentFacade(project: Project): FacadeSettings & { template: FacadeTemplate } {
  const template = findFacadeTemplate(project.facade?.templateId);
  return {
    templateId: project.facade?.templateId ?? template.id,
    wallFinish: project.facade?.wallFinish ?? template.wallFinish,
    accentFinish: project.facade?.accentFinish ?? template.accentFinish,
    roof: project.facade?.roof ?? template.roof,
    notes: project.facade?.notes ?? [],
    template,
  };
}

export function applyFacadeTemplate(project: Project, templateId: string): FacadeTemplate {
  const template = FACADE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`Unknown façade template "${templateId}". Choose one of: ${FACADE_TEMPLATES.map((t) => t.id).join(", ")}.`);
  }
  project.facade = {
    templateId: template.id,
    wallFinish: template.wallFinish,
    accentFinish: template.accentFinish,
    roof: template.roof,
    notes: [...template.materials],
  };
  return template;
}

export function findLandscapeTemplate(id: string): LandscapeTemplate {
  const template = LANDSCAPE_TEMPLATES.find((t) => t.id === id);
  if (!template) {
    throw new Error(`Unknown landscape template "${id}". Choose one of: ${LANDSCAPE_TEMPLATES.map((t) => t.id).join(", ")}.`);
  }
  return template;
}

function overlapsExisting(project: Project, rect: { x: number; y: number; width: number; depth: number }): boolean {
  const poly = rectPolygon(rect.x, rect.y, rect.x + rect.width, rect.y + rect.depth);
  for (const floor of project.floors) {
    for (const room of floor.rooms) {
      if (polygonOverlapArea(poly, room.polygon, 0.1) > 0.01) return true;
      const b = bbox(room.polygon);
      const padded = rectPolygon(b.minX - 0.25, b.minY - 0.25, b.maxX + 0.25, b.maxY + 0.25);
      if (polygonOverlapArea(poly, padded, 0.1) > 0.01) return true;
    }
  }
  for (const amenity of project.amenities ?? []) {
    if (!amenity.rect) continue;
    const a = rectPolygon(
      amenity.rect.x,
      amenity.rect.y,
      amenity.rect.x + amenity.rect.width,
      amenity.rect.y + amenity.rect.depth,
    );
    if (polygonOverlapArea(poly, a, 0.1) > 0.01) return true;
  }
  return false;
}

function insidePlot(project: Project, rect: { x: number; y: number; width: number; depth: number }): boolean {
  const plot = bbox(project.site.boundary);
  const margin = 0.15;
  return (
    rect.x >= plot.minX + margin &&
    rect.y >= plot.minY + margin &&
    rect.x + rect.width <= plot.maxX - margin &&
    rect.y + rect.depth <= plot.maxY - margin
  );
}

function fits(project: Project, rect: { x: number; y: number; width: number; depth: number }): boolean {
  return insidePlot(project, rect) && !overlapsExisting(project, rect);
}

/**
 * Deterministic placement in the requested setback band. Tries both
 * orientations, then falls back to a coarse scan of the whole plot. Never
 * silently overlaps a room, wall envelope or another amenity.
 */
export function placeAmenity(
  project: Project,
  template: LandscapeTemplate,
  requested?: { x: number; y: number; width: number; depth: number },
): { x: number; y: number; width: number; depth: number } | null {
  if (template.level === "roof") return null;
  if (requested && fits(project, requested)) return requested;

  const plot = bbox(project.site.boundary);
  const plate = buildableRect(project);
  const sizes: { width: number; depth: number }[] = [
    { width: template.defaultWidth, depth: template.defaultDepth },
    { width: template.defaultDepth, depth: template.defaultWidth },
  ];
  const centres = { x: (plot.minX + plot.maxX) / 2, y: (plot.minY + plot.maxY) / 2 };

  for (const size of sizes) {
    if (template.placement === "front") {
      const y = plate.y0 - size.depth - 0.35;
      if (fits(project, { x: centres.x - size.width / 2, y, ...size })) {
        return { x: round(centres.x - size.width / 2, 2), y: round(y, 2), ...size };
      }
      const yTop = plot.minY + 0.3;
      if (fits(project, { x: centres.x - size.width / 2, y: yTop, ...size })) {
        return { x: round(centres.x - size.width / 2, 2), y: yTop, ...size };
      }
    }
    if (template.placement === "rear" || template.placement === "any") {
      const y = plate.y1 + 0.35;
      if (fits(project, { x: centres.x - size.width / 2, y, ...size })) {
        return { x: round(centres.x - size.width / 2, 2), y: round(y, 2), ...size };
      }
      const yTop = plot.maxY - size.depth - 0.3;
      if (fits(project, { x: centres.x - size.width / 2, y: yTop, ...size })) {
        return { x: round(centres.x - size.width / 2, 2), y: round(yTop, 2), ...size };
      }
    }
    if (template.placement === "side" || template.placement === "any") {
      const xLeft = plot.minX + 0.3;
      if (fits(project, { x: xLeft, y: centres.y - size.depth / 2, ...size })) {
        return { x: xLeft, y: round(centres.y - size.depth / 2, 2), ...size };
      }
      const xRight = plot.maxX - size.width - 0.3;
      if (fits(project, { x: xRight, y: centres.y - size.depth / 2, ...size })) {
        return { x: round(xRight, 2), y: round(centres.y - size.depth / 2, 2), ...size };
      }
    }
  }

  // Coarse scan for the best remaining pocket.
  for (const size of sizes) {
    for (let y = plot.minY + 0.3; y + size.depth <= plot.maxY - 0.3; y += 0.5) {
      for (let x = plot.minX + 0.3; x + size.width <= plot.maxX - 0.3; x += 0.5) {
        if (fits(project, { x, y, ...size })) {
          return { x: round(x, 2), y: round(y, 2), ...size };
        }
      }
    }
  }
  return null;
}

export function addAmenity(
  project: Project,
  templateId: string,
  requested?: { x: number; y: number; width: number; depth: number },
): { amenity: Amenity; template: LandscapeTemplate } {
  const template = findLandscapeTemplate(templateId);
  const rect = template.level === "roof" ? undefined : placeAmenity(project, template, requested);
  if (template.level === "ground" && !rect) {
    throw new Error(
      `No free ground area fits the ${template.name} (${template.defaultWidth} × ${template.defaultDepth} m). Increase the plot, reduce setbacks or place it manually.`,
    );
  }
  const amenity: Amenity = {
    id: newId("amn"),
    kind: template.kind,
    label: template.name,
    templateId: template.id,
    rect: rect ?? undefined,
    level: template.level,
    notes: [...template.notes],
  };
  project.amenities = [...(project.amenities ?? []), amenity];
  return { amenity, template };
}

export function removeAmenity(project: Project, amenityId: string): Amenity | null {
  const list = project.amenities ?? [];
  const found = list.find((a) => a.id === amenityId);
  if (!found) return null;
  project.amenities = list.filter((a) => a.id !== amenityId);
  return found;
}

export function amenityColor(kind: AmenityKind): string {
  return LANDSCAPE_TEMPLATES.find((t) => t.kind === kind)?.palette.fill ?? "#b9b4a9";
}

export function designTemplateCatalogue(project: Project) {
  const facade = currentFacade(project);
  return {
    current_facade: {
      template_id: facade.templateId,
      name: facade.template.name,
      wall_finish: facade.wallFinish,
      accent_finish: facade.accentFinish,
      roof: facade.roof,
    },
    facade_templates: [...FACADE_TEMPLATES]
      .sort((a, b) => Number(b.id.startsWith("modern")) - Number(a.id.startsWith("modern")))
      .map((t) => ({
      id: t.id,
      name: t.name,
      tagline: t.tagline,
      description: t.description,
      roof: t.roof,
      materials: t.materials,
      best_for: t.bestFor,
      palette: t.palette,
    })),
    landscape_templates: LANDSCAPE_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      tagline: t.tagline,
      description: t.description,
      level: t.level,
      default_size_m: { width: t.defaultWidth, depth: t.defaultDepth },
      placement: t.placement,
      notes: t.notes,
      palette: t.palette,
    })),
    amenities: (project.amenities ?? []).map((a) => ({
      amenity_id: a.id,
      kind: a.kind,
      label: a.label,
      level: a.level,
      area_m2: a.rect ? round(a.rect.width * a.rect.depth, 2) : 0,
      rect: a.rect ?? null,
    })),
    note: "Façade and landscape layers are presentation/site layers. Amenities are excluded from built-up, carpet and room schedules.",
  };
}
