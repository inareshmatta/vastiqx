import { bboxOfPolygons, round } from "./geometry";
import { currentFacade } from "./templates";
import type { Floor, Project, Vec2, Wall } from "./types";

export type ElevationDirection = "front" | "back" | "left" | "right";

export interface ElevationShape {
  kind: "wall" | "band" | "opening" | "door" | "parapet" | "coping" | "ground" | "amenity" | "shadow";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
}

export interface ElevationView {
  direction: ElevationDirection;
  label: string;
  subtitle: string;
  /** Drawing width/height in metres, including margins. */
  width: number;
  height: number;
  groundY: number;
  buildingWidth: number;
  buildingHeight: number;
  shapes: ElevationShape[];
  openingCount: number;
}

export interface ElevationSet {
  views: ElevationView[];
  facade: {
    templateId: string;
    name: string;
    wallFinish: string;
    accentFinish: string;
    roof: string;
    palette: { primary: string; secondary: string; accent: string; roof: string; glazing: string; door: string };
  };
  method: string;
  generatedAt: string;
  engineVersion: string;
}

function wallAlong(wall: Wall): "x" | "y" | "other" {
  if (Math.abs(wall.start.y - wall.end.y) < 0.02) return "x";
  if (Math.abs(wall.start.x - wall.end.x) < 0.02) return "y";
  return "other";
}

function openingInterval(wall: Wall, offset: number, width: number, axis: "x" | "y"): { a: number; b: number } {
  const start = axis === "x" ? wall.start.x : wall.start.y;
  const end = axis === "x" ? wall.end.x : wall.end.y;
  const direction = Math.sign(end - start) || 1;
  const centre = start + direction * offset;
  return { a: Math.min(centre - width / 2, centre + width / 2), b: Math.max(centre - width / 2, centre + width / 2) };
}

function faceWalls(floor: Floor, direction: ElevationDirection, building: { minX: number; minY: number; maxX: number; maxY: number }): Wall[] {
  return floor.walls.filter((wall) => {
    const along = wallAlong(wall);
    const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
    if (direction === "front") return along === "x" && mid.y <= building.minY + 0.4;
    if (direction === "back") return along === "x" && mid.y >= building.maxY - 0.4;
    if (direction === "left") return along === "y" && mid.x <= building.minX + 0.4;
    return along === "y" && mid.x >= building.maxX - 0.4;
  });
}

function viewFor(project: Project, direction: ElevationDirection): ElevationView {
  const facade = currentFacade(project);
  const palette = facade.template.palette;
  const allRooms = project.floors.flatMap((floor) => floor.rooms.map((room) => room.polygon));
  const fallback = bboxOfPolygons(project.floors.flatMap((floor) => floor.walls.map((wall) => [wall.start, wall.end])));
  const building = allRooms.length > 0 ? bboxOfPolygons(allRooms) : fallback;
  const margin = 0.9;
  const axis: "x" | "y" = direction === "front" || direction === "back" ? "x" : "y";
  const reverse = direction === "back" || direction === "right";
  const min = axis === "x" ? building.minX : building.minY;
  const max = axis === "x" ? building.maxX : building.maxY;
  const buildingWidth = Math.max(0.5, max - min);
  const topHeight = project.floors.reduce((h, floor) => Math.max(h, floor.elevation + floor.height), 0);
  const parapetHeight = facade.roof === "flat_parapet" || facade.roof === "terrace_garden" ? 0.95 : 0.35;
  const drawingWidth = buildingWidth + margin * 2;
  const drawingHeight = topHeight + parapetHeight + margin * 2;
  const toX = (value: number) => (reverse ? margin + (max - value) : margin + (value - min));

  const shapes: ElevationShape[] = [];
  let openingCount = 0;

  // Ground line.
  shapes.push({
    kind: "ground",
    x: 0.2,
    y: margin - 0.12,
    width: drawingWidth - 0.4,
    height: 0.1,
    color: "#6f695e",
    label: "Ground",
  });

  for (const floor of project.floors) {
    // Main rendered body: one band per storey, with a shadow line at each floor.
    shapes.push({
      kind: "wall",
      x: margin,
      y: margin + floor.elevation,
      width: buildingWidth,
      height: floor.height,
      color: floor.level === 0 ? palette.primary : palette.secondary,
      label: floor.name,
    });
    shapes.push({
      kind: "band",
      x: margin,
      y: margin + floor.elevation,
      width: buildingWidth,
      height: 0.1,
      color: palette.accent,
    });
    shapes.push({
      kind: "shadow",
      x: margin,
      y: margin + floor.elevation + floor.height - 0.08,
      width: buildingWidth,
      height: 0.08,
      color: palette.accent,
    });

    // A vertical louvre/accent field near one end reads as the stair or balcony.
    const accentWidth = Math.min(1.1, buildingWidth * 0.16);
    if (floor.level === 0) {
      shapes.push({
        kind: "band",
        x: reverse ? margin + buildingWidth - accentWidth - 0.35 : margin + 0.35,
        y: margin + floor.elevation,
        width: accentWidth,
        height: floor.height,
        color: palette.accent,
        label: "Entry / stair screen",
      });
    }

    for (const wall of faceWalls(floor, direction, building)) {
      for (const opening of wall.openings) {
        const interval = openingInterval(wall, opening.offset, opening.width, axis);
        const x = toX(interval.a);
        const width = Math.abs(interval.b - interval.a);
        if (width < 0.15) continue;
        const y = margin + floor.elevation + opening.sill;
        shapes.push({
          kind: opening.kind === "door" ? "door" : "opening",
          x: Math.min(x, toX(interval.b)),
          y,
          width,
          height: opening.height,
          color: opening.kind === "door" ? palette.door : palette.glazing,
          label: opening.kind === "door" ? "Door" : "Window",
        });
        openingCount += 1;
      }
    }
  }

  // Parapet / roof expression.
  const roofY = margin + topHeight;
  if (facade.roof === "pitched") {
    const rise = Math.min(1.4, buildingWidth * 0.1);
    shapes.push({
      kind: "parapet",
      x: margin,
      y: roofY,
      width: buildingWidth,
      height: rise,
      color: palette.roof,
      label: "Pitched roof",
    });
    shapes.push({
      kind: "coping",
      x: margin - 0.2,
      y: roofY + rise,
      width: buildingWidth + 0.4,
      height: 0.12,
      color: palette.accent,
    });
  } else {
    shapes.push({
      kind: "parapet",
      x: margin,
      y: roofY,
      width: buildingWidth,
      height: parapetHeight,
      color: palette.roof,
      label: facade.roof === "terrace_garden" ? "Planted terrace parapet" : "Parapet",
    });
    shapes.push({
      kind: "coping",
      x: margin - 0.12,
      y: roofY + parapetHeight,
      width: buildingWidth + 0.24,
      height: 0.1,
      color: palette.accent,
    });
  }

  // Site amenities visible in this elevation, shown as a ground-level strip.
  for (const amenity of project.amenities ?? []) {
    if (!amenity.rect || amenity.level !== "ground") continue;
    const inView =
      (direction === "front" && amenity.rect.y + amenity.rect.depth <= building.minY + 0.2) ||
      (direction === "back" && amenity.rect.y >= building.maxY - 0.2) ||
      (direction === "left" && amenity.rect.x + amenity.rect.width <= building.minX + 0.2) ||
      (direction === "right" && amenity.rect.x >= building.maxX - 0.2);
    if (!inView) continue;
    const a = axis === "x" ? amenity.rect.x : amenity.rect.y;
    const b = axis === "x" ? amenity.rect.x + amenity.rect.width : amenity.rect.y + amenity.rect.depth;
    const x0 = Math.max(min, Math.min(a, b));
    const x1 = Math.min(max, Math.max(a, b));
    if (x1 <= x0) continue;
    const color = amenity.kind === "pool" ? "#8fc3d4" : amenity.kind === "driveway" ? "#b8b3a8" : "#9fbd8e";
    const left = Math.min(toX(x0), toX(x1));
    shapes.push({
      kind: "amenity",
      x: left,
      y: margin,
      width: x1 - x0,
      height: amenity.kind === "pool" ? 0.32 : 0.18,
      color,
      label: amenity.label,
    });
  }

  const label =
    direction === "front"
      ? "Front elevation"
      : direction === "back"
        ? "Rear elevation"
        : direction === "left"
          ? "Left elevation"
          : "Right elevation";
  const facing =
    direction === "front"
      ? "Road / front face"
      : direction === "back"
        ? "Rear garden face"
        : direction === "left"
          ? "Left side face"
          : "Right side face";

  return {
    direction,
    label,
    subtitle: `${facing} · ${facade.template.name}`,
    width: round(drawingWidth, 2),
    height: round(drawingHeight, 2),
    groundY: round(margin, 2),
    buildingWidth: round(buildingWidth, 2),
    buildingHeight: round(topHeight, 2),
    shapes: shapes.map((shape) => ({ ...shape, x: round(shape.x, 3), y: round(shape.y, 3), width: round(shape.width, 3), height: round(shape.height, 3) })),
    openingCount,
  };
}

export function buildElevations(project: Project): ElevationSet {
  const facade = currentFacade(project);
  const views = (["front", "back", "left", "right"] as ElevationDirection[]).map((direction) => viewFor(project, direction));
  return {
    views,
    facade: {
      templateId: facade.templateId,
      name: facade.template.name,
      wallFinish: facade.wallFinish,
      accentFinish: facade.accentFinish,
      roof: facade.roof,
      palette: facade.template.palette,
    },
    method:
      "Each elevation is projected deterministically from the stored clear room extents and the openings hosted on the corresponding external walls. Floor bands, parapet, façade finish, accent field and visible ground amenities are presentation only.",
    generatedAt: new Date().toISOString(),
    engineVersion: "elevation-builder@1.0.0",
  };
}

export function elevationSummary(set: ElevationSet): string {
  return `${set.views.length} elevations (${set.views.map((v) => v.direction).join(", ")}) in ${set.facade.name}; ${set.views.reduce((s, v) => s + v.openingCount, 0)} façade openings projected.`;
}
