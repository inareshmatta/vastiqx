import type { Project } from "@/domain/types";

/**
 * Minimal ASCII DXF (R12-compatible) exporter. Walls are emitted as LINE
 * entities on typed layers, rooms as closed LWPOLYLINEs and labels as TEXT.
 * Coordinates are metres (INSUNITS = 6).
 */
export function buildDxf(project: Project): string {
  const lines: string[] = [];
  const push = (...values: (string | number)[]) => {
    for (const value of values) lines.push(String(value));
  };

  push("0", "SECTION", "2", "HEADER");
  push("9", "$ACADVER", "1", "AC1009");
  push("9", "$INSUNITS", "70", 6);
  push("9", "$EXTMIN", "10", 0, "20", 0, "30", 0);
  push("9", "$EXTMAX", "10", 100, "20", 100, "30", 0);
  push("0", "ENDSEC");

  push("0", "SECTION", "2", "TABLES");
  push("0", "TABLE", "2", "LAYER", "70", 5);
  const layer = (name: string, colour: number) => {
    push("0", "LAYER", "2", name, "70", 0, "62", colour, "6", "CONTINUOUS");
  };
  layer("A-WALL-EXT", 7);
  layer("A-WALL-INT", 8);
  layer("A-ROOM", 3);
  layer("A-OPENING", 4);
  layer("A-TEXT", 2);
  push("0", "ENDTAB");
  push("0", "ENDSEC");

  push("0", "SECTION", "2", "ENTITIES");

  const line = (layerName: string, x1: number, y1: number, x2: number, y2: number) => {
    push("0", "LINE", "8", layerName);
    push("10", x1, "20", y1, "30", 0);
    push("11", x2, "21", y2, "31", 0);
  };

  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      const layerName = wall.type === "external_masonry" || wall.type === "party_wall" ? "A-WALL-EXT" : "A-WALL-INT";
      line(layerName, round(wall.start.x), round(wall.start.y), round(wall.end.x), round(wall.end.y));
      // Wall faces give thickness in DXF viewers that only stroke lines.
      const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      if (len > 0.05) {
        const nx = (-(wall.end.y - wall.start.y) / len) * (wall.thickness / 2);
        const ny = ((wall.end.x - wall.start.x) / len) * (wall.thickness / 2);
        line(layerName, round(wall.start.x + nx), round(wall.start.y + ny), round(wall.end.x + nx), round(wall.end.y + ny));
        line(layerName, round(wall.start.x - nx), round(wall.start.y - ny), round(wall.end.x - nx), round(wall.end.y - ny));
      }
      for (const opening of wall.openings) {
        const start = Math.max(0, opening.offset - opening.width / 2);
        const end = Math.min(len, opening.offset + opening.width / 2);
        const ux = (wall.end.x - wall.start.x) / (len || 1);
        const uy = (wall.end.y - wall.start.y) / (len || 1);
        line(
          "A-OPENING",
          round(wall.start.x + ux * start),
          round(wall.start.y + uy * start),
          round(wall.start.x + ux * end),
          round(wall.start.y + uy * end),
        );
      }
    }

    for (const room of floor.rooms) {
      push("0", "LWPOLYLINE", "8", "A-ROOM", "90", room.polygon.length, "70", 1);
      for (const p of room.polygon) {
        push("10", round(p.x), "20", round(p.y));
      }
      const cx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
      const cy = room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length;
      push("0", "TEXT", "8", "A-TEXT");
      push("10", round(cx), "20", round(cy), "30", 0, "40", 0.22);
      push("1", sanitize(room.name));
      push("50", 0);
    }
  }

  push("0", "ENDSEC");
  push("0", "EOF");
  return lines.join("\r\n") + "\r\n";
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function sanitize(value: string): string {
  return value.replace(/[\r\n]/g, " ").slice(0, 200);
}
