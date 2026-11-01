import { bbox } from "@/domain/geometry";
import { ROOM_COLORS, type Floor, type Project } from "@/domain/types";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface PlanSvgOptions {
  pxPerMetre?: number;
  margin?: number;
  showVastu?: boolean;
  showGrid?: boolean;
  title?: string;
}

export function planSvg(project: Project, floor: Floor, options: PlanSvgOptions = {}): string {
  const scale = options.pxPerMetre ?? 40;
  const margin = options.margin ?? 46;
  const bounds = bbox(project.site.boundary);
  const width = (bounds.maxX - bounds.minX) * scale + margin * 2;
  const height = (bounds.maxY - bounds.minY) * scale + margin * 2;
  const tx = (x: number) => margin + (x - bounds.minX) * scale;
  const ty = (y: number) => height - margin - (y - bounds.minY) * scale;

  const pathOf = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(" ") + " Z";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" width="100%" role="img" aria-label="Floor plan ${escapeXml(floor.name)}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#fbf9f4"/>`);

  if (options.showGrid) {
    const step = 1 * scale;
    for (let x = margin; x < width - margin; x += step) {
      parts.push(`<line x1="${x.toFixed(1)}" y1="${margin}" x2="${x.toFixed(1)}" y2="${(height - margin).toFixed(1)}" stroke="#e7e1d3" stroke-width="0.5"/>`);
    }
    for (let y = margin; y < height - margin; y += step) {
      parts.push(`<line x1="${margin}" y1="${y.toFixed(1)}" x2="${(width - margin).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e7e1d3" stroke-width="0.5"/>`);
    }
  }

  // Setback envelope.
  const plate = {
    x0: bounds.minX + project.site.setbacks.left,
    y0: bounds.minY + project.site.setbacks.front,
    x1: bounds.maxX - project.site.setbacks.right,
    y1: bounds.maxY - project.site.setbacks.rear,
  };
  parts.push(
    `<polygon points="${[
      { x: plate.x0, y: plate.y0 },
      { x: plate.x1, y: plate.y0 },
      { x: plate.x1, y: plate.y1 },
      { x: plate.x0, y: plate.y1 },
    ]
      .map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`)
      .join(" ")}" fill="none" stroke="#b9ad95" stroke-width="1" stroke-dasharray="5 4"/>`,
  );

  // Site amenities are presentation/site geometry and never part of built-up.
  if (floor.level === 0) {
    for (const amenity of project.amenities ?? []) {
      if (!amenity.rect) continue;
      const r = amenity.rect;
      const fill = amenity.kind === "pool" ? "#9cc8d6" : amenity.kind === "driveway" ? "#d8d3c8" : "#b9d3a6";
      parts.push(
        `<rect x="${tx(r.x).toFixed(1)}" y="${ty(r.y + r.depth).toFixed(1)}" width="${(r.width * scale).toFixed(1)}" height="${(r.depth * scale).toFixed(1)}" fill="${fill}" fill-opacity="0.8" stroke="#6f8a63" stroke-width="0.8"/>`,
      );
      parts.push(
        `<text x="${tx(r.x + r.width / 2).toFixed(1)}" y="${ty(r.y + r.depth / 2).toFixed(1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#2f4a38">${escapeXml(amenity.label)}</text>`,
      );
    }
  }

  // Rooms.
  for (const room of floor.rooms) {
    const colour = ROOM_COLORS[room.type] ?? "#9a9a9a";
    parts.push(`<path d="${pathOf(room.polygon)}" fill="${colour}" fill-opacity="0.22" stroke="none"/>`);
  }

  // Furniture presentation layer.
  for (const item of (project.furniture ?? []).filter((entry) => entry.floorId === floor.id)) {
    const r = item.rect;
    const cx = tx(r.x + r.width / 2);
    const cy = ty(r.y + r.depth / 2);
    parts.push(
      `<g transform="rotate(${item.rotation} ${cx.toFixed(1)} ${cy.toFixed(1)})"><rect x="${tx(r.x).toFixed(1)}" y="${ty(r.y + r.depth).toFixed(1)}" width="${(r.width * scale).toFixed(1)}" height="${(r.depth * scale).toFixed(1)}" rx="3" fill="${item.color}" fill-opacity="0.78" stroke="#4f5a50" stroke-width="0.8"/>`,
    );
    if (r.width > 0.75) {
      parts.push(
        `<text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="7" fill="#26352a">${escapeXml(item.label.slice(0, 16))}</text>`,
      );
    }
    parts.push(`</g>`);
  }

  // Walls and openings.
  for (const wall of floor.walls) {
    const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (len < 0.02) continue;
    const thickness = Math.max(1.2, wall.thickness * scale);
    const ux = (wall.end.x - wall.start.x) / len;
    const uy = (wall.end.y - wall.start.y) / len;
    parts.push(
      `<line x1="${tx(wall.start.x).toFixed(1)}" y1="${ty(wall.start.y).toFixed(1)}" x2="${tx(wall.end.x).toFixed(1)}" y2="${ty(wall.end.y).toFixed(1)}" stroke="#3f3a33" stroke-width="${thickness.toFixed(2)}" stroke-linecap="butt"/>`,
    );
    for (const opening of wall.openings) {
      const start = Math.max(0, opening.offset - opening.width / 2);
      const end = Math.min(len, opening.offset + opening.width / 2);
      const p1 = { x: wall.start.x + ux * start, y: wall.start.y + uy * start };
      const p2 = { x: wall.start.x + ux * end, y: wall.start.y + uy * end };
      parts.push(
        `<line x1="${tx(p1.x).toFixed(1)}" y1="${ty(p1.y).toFixed(1)}" x2="${tx(p2.x).toFixed(1)}" y2="${ty(p2.y).toFixed(1)}" stroke="#fbf9f4" stroke-width="${(thickness + 1).toFixed(2)}"/>`,
      );
      if (opening.kind === "window") {
        parts.push(
          `<line x1="${tx(p1.x).toFixed(1)}" y1="${ty(p1.y).toFixed(1)}" x2="${tx(p2.x).toFixed(1)}" y2="${ty(p2.y).toFixed(1)}" stroke="#5f8fa3" stroke-width="1.4"/>`,
        );
      } else {
        // Door leaf + swing.
        const w = end - start;
        const angle = Math.atan2(uy, ux);
        const hinge = p1;
        const leaf = { x: hinge.x + Math.cos(angle - Math.PI / 2) * w, y: hinge.y + Math.sin(angle - Math.PI / 2) * w };
        parts.push(
          `<line x1="${tx(hinge.x).toFixed(1)}" y1="${ty(hinge.y).toFixed(1)}" x2="${tx(leaf.x).toFixed(1)}" y2="${ty(leaf.y).toFixed(1)}" stroke="#8a6a45" stroke-width="1.2"/>`,
        );
        const arcPts: string[] = [];
        for (let i = 0; i <= 12; i++) {
          const a = angle - Math.PI / 2 + (Math.PI / 2) * (i / 12);
          arcPts.push(`${tx(hinge.x + Math.cos(a) * w).toFixed(1)},${ty(hinge.y + Math.sin(a) * w).toFixed(1)}`);
        }
        parts.push(`<polyline points="${arcPts.join(" ")}" fill="none" stroke="#b6a58f" stroke-width="0.8" stroke-dasharray="2 2"/>`);
      }
    }
  }

  // Room labels.
  for (const room of floor.rooms) {
    const b = bbox(room.polygon);
    const cx = tx((b.minX + b.maxX) / 2);
    const cy = ty((b.minY + b.maxY) / 2);
    const area = Math.abs(
      room.polygon.reduce((sum, p, i) => {
        const n = room.polygon[(i + 1) % room.polygon.length]!;
        return sum + p.x * n.y - n.x * p.y;
      }, 0) / 2,
    );
    const fontSize = Math.max(8, Math.min(13, (b.maxX - b.minX) * scale * 0.09));
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${(cy - 2).toFixed(1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize.toFixed(1)}" fill="#38332c">${escapeXml(room.name)}</text>`,
    );
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${(cy + fontSize * 0.95).toFixed(1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${(fontSize * 0.78).toFixed(1)}" fill="#6b6458">${area.toFixed(1)} m2</text>`,
    );
  }

  // Plot boundary + overall dimensions.
  parts.push(`<path d="${pathOf(project.site.boundary)}" fill="none" stroke="#6f6759" stroke-width="1.6" stroke-dasharray="8 5"/>`);
  const plotW = bounds.maxX - bounds.minX;
  const plotD = bounds.maxY - bounds.minY;
  parts.push(
    `<text x="${(width / 2).toFixed(1)}" y="${(height - 18).toFixed(1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#5d5649">Plot ${plotW.toFixed(2)} m</text>`,
  );
  parts.push(
    `<text x="16" y="${(height / 2).toFixed(1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#5d5649" transform="rotate(-90 16 ${(height / 2).toFixed(1)})">Plot ${plotD.toFixed(2)} m</text>`,
  );

  // North arrow.
  const northAngle = (project.site.northBearing * Math.PI) / 180;
  const nx = width - 34;
  const ny = 34;
  const dir = { x: Math.sin(northAngle), y: -Math.cos(northAngle) };
  const tip = { x: nx + dir.x * 18, y: ny + dir.y * 18 };
  const base = { x: nx - dir.x * 10, y: ny - dir.y * 10 };
  parts.push(`<line x1="${base.x.toFixed(1)}" y1="${base.y.toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="#4c463c" stroke-width="1.6"/>`);
  parts.push(`<circle cx="${nx}" cy="${ny}" r="2.2" fill="#4c463c"/>`);
  parts.push(
    `<text x="${(tip.x + 8).toFixed(1)}" y="${(tip.y - 2).toFixed(1)}" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="bold" fill="#4c463c">N</text>`,
  );

  if (options.title) {
    parts.push(
      `<text x="${margin}" y="20" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#5d5649">${escapeXml(options.title)}</text>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

export function planSvgDataUri(project: Project, floor: Floor, options?: PlanSvgOptions): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(planSvg(project, floor, options))}`;
}
