import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { calculateEstimate, formatINR, takeoffQuantities } from "@/domain/boq";
import { buildAreaCompliance } from "@/domain/compliance";
import { buildCostBreakdown } from "@/domain/breakdown";
import { projectMaterialPack } from "@/domain/calculator";
import { buildElevations } from "@/domain/elevations";
import { furnitureSchedule } from "@/domain/furniture";
import { bbox, round } from "@/domain/geometry";
import { projectMetrics } from "@/domain/measure";
import { areaSchedule } from "@/domain/schedule";
import { buildScene } from "@/domain/threed";
import { ROOM_LABELS, ROOM_COLORS, SECTORS, type Project } from "@/domain/types";
import { formatArea, formatVolume } from "@/domain/units";
import { assessVastu } from "@/domain/vastu";
import { checkSiteRules } from "@/domain/rules";

const A3_LANDSCAPE: [number, number] = [1191, 842];
const INK = rgb(0.16, 0.15, 0.13);
const MUTED = rgb(0.42, 0.4, 0.35);
const LINE = rgb(0.82, 0.79, 0.73);
const PAPER = rgb(0.985, 0.976, 0.957);
const ACCENT = rgb(0.72, 0.46, 0.2);

function safe(text: string | number): string {
  return String(text)
    .replace(/₹/g, "Rs ")
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/[²]/g, "2")
    .replace(/[³]/g, "3")
    .replace(/≈/g, "~")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, "");
}

function hexRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function tint(hex: string, amount: number): RGB {
  const base = hexRgb(hex);
  return rgb(
    base.red + (1 - base.red) * amount,
    base.green + (1 - base.green) * amount,
    base.blue + (1 - base.blue) * amount,
  );
}

function text(
  page: PDFPage,
  value: string | number,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB = INK,
): void {
  page.drawText(safe(value), { x, y, size, font, color });
}

function wrapLine(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(value).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function footer(page: PDFPage, font: PDFFont, project: Project, label: string): void {
  const { width } = page.getSize();
  page.drawLine({ start: { x: 40, y: 38 }, end: { x: width - 40, y: 38 }, thickness: 0.5, color: LINE });
  text(page, `VastiqX · ${project.name} · revision ${project.revision} · ${label}`, 40, 24, 7.5, font, MUTED);
  text(
    page,
    "Concept-stage planning output. Not for construction, statutory submission or certification.",
    width - 430,
    24,
    7.5,
    font,
    MUTED,
  );
}

function drawPlanPage(
  doc: PDFDocument,
  project: Project,
  floorIndex: number,
  font: PDFFont,
  bold: PDFFont,
): void {
  const page = doc.addPage(A3_LANDSCAPE);
  const { width, height } = page.getSize();
  const floor = project.floors[floorIndex]!;
  const metrics = projectMetrics(project);
  const floorMetric = metrics.floors[floorIndex];
  const bounds = bbox(project.site.boundary);

  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });

  // Title block.
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: rgb(0.09, 0.1, 0.11) });
  text(page, "VASTIQX", 42, height - 48, 11, bold, rgb(0.93, 0.73, 0.47));
  text(page, project.name, 42, height - 72, 18, bold, rgb(0.97, 0.95, 0.9));
  text(
    page,
    `Floor plan · ${floor.name} · revision ${project.revision} · ${project.location.city}, ${project.location.state}`,
    42,
    height - 86,
    9,
    font,
    rgb(0.72, 0.71, 0.67),
  );

  const drawing = { x: 42, y: 128, w: 800, h: height - 240 };
  const plotW = bounds.maxX - bounds.minX;
  const plotD = bounds.maxY - bounds.minY;
  const scale = Math.min((drawing.w - 60) / Math.max(plotW, 0.1), (drawing.h - 40) / Math.max(plotD, 0.1));
  const ox = drawing.x + (drawing.w - plotW * scale) / 2;
  const oy = drawing.y + (drawing.h - plotD * scale) / 2;
  const tx = (x: number) => ox + (x - bounds.minX) * scale;
  const ty = (y: number) => oy + (y - bounds.minY) * scale;

  // Plot boundary.
  const boundaryPath = project.site.boundary
    .map((p, i) => `${i === 0 ? "M" : "L"} ${tx(p.x)} ${ty(p.y)}`)
    .join(" ");
  page.drawSvgPath(`${boundaryPath} Z`, {
    x: 0,
    y: 0,
    borderColor: MUTED,
    borderWidth: 1.1,
    borderDashArray: [7, 4],
  });

  // Setbacks.
  const plate = {
    x0: bounds.minX + project.site.setbacks.left,
    y0: bounds.minY + project.site.setbacks.front,
    x1: bounds.maxX - project.site.setbacks.right,
    y1: bounds.maxY - project.site.setbacks.rear,
  };
  page.drawSvgPath(
    `M ${tx(plate.x0)} ${ty(plate.y0)} L ${tx(plate.x1)} ${ty(plate.y0)} L ${tx(plate.x1)} ${ty(plate.y1)} L ${tx(plate.x0)} ${ty(plate.y1)} Z`,
    { x: 0, y: 0, borderColor: rgb(0.76, 0.71, 0.6), borderWidth: 0.7, borderDashArray: [4, 4] },
  );

  // Room fills.
  for (const room of floor.rooms) {
    const colour = tint(ROOM_COLORS[room.type] ?? "#9a9a9a", 0.55);
    const path = room.polygon.map((p, i) => `${i === 0 ? "M" : "L"} ${tx(p.x)} ${ty(p.y)}`).join(" ");
    page.drawSvgPath(`${path} Z`, { x: 0, y: 0, color: colour, borderColor: rgb(0.55, 0.51, 0.44), borderWidth: 0.35 });
  }

  // Furniture presentation layer (axis-aligned footprint).
  for (const item of (project.furniture ?? []).filter((entry) => entry.floorId === floor.id)) {
    const r = item.rect;
    page.drawRectangle({
      x: tx(r.x),
      y: ty(r.y + r.depth),
      width: r.width * scale,
      height: r.depth * scale,
      color: hexRgb(item.color),
      opacity: 0.8,
      borderColor: rgb(0.31, 0.35, 0.31),
      borderWidth: 0.4,
    });
  }

  // Walls as solid segments around openings.
  for (const wall of floor.walls) {
    const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (len < 0.03) continue;
    const ux = (wall.end.x - wall.start.x) / len;
    const uy = (wall.end.y - wall.start.y) / len;
    const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
    const segments: [number, number][] = [];
    let cursor = 0;
    for (const opening of openings) {
      const start = Math.max(0, opening.offset - opening.width / 2);
      const end = Math.min(len, opening.offset + opening.width / 2);
      if (start > cursor + 0.01) segments.push([cursor, start]);
      cursor = end;
    }
    if (cursor < len - 0.01) segments.push([cursor, len]);
    for (const [start, end] of segments) {
      page.drawLine({
        start: { x: tx(wall.start.x + ux * start), y: ty(wall.start.y + uy * start) },
        end: { x: tx(wall.start.x + ux * end), y: ty(wall.start.y + uy * end) },
        thickness: Math.max(1, wall.thickness * scale),
        color: rgb(0.2, 0.19, 0.17),
      });
    }
    for (const opening of openings) {
      const start = Math.max(0, opening.offset - opening.width / 2);
      const end = Math.min(len, opening.offset + opening.width / 2);
      const p1 = { x: tx(wall.start.x + ux * start), y: ty(wall.start.y + uy * start) };
      const p2 = { x: tx(wall.start.x + ux * end), y: ty(wall.start.y + uy * end) };
      if (opening.kind === "window") {
        page.drawLine({ start: p1, end: p2, thickness: 1.2, color: rgb(0.36, 0.55, 0.64) });
      } else {
        const angle = Math.atan2(uy, ux);
        const w = (end - start) * scale;
        const hinge = p1;
        const leaf = { x: hinge.x + Math.cos(angle - Math.PI / 2) * w, y: hinge.y + Math.sin(angle - Math.PI / 2) * w };
        page.drawLine({ start: hinge, end: leaf, thickness: 0.8, color: rgb(0.5, 0.4, 0.29) });
        const arc = [];
        for (let i = 0; i <= 12; i++) {
          const a = angle - Math.PI / 2 + (Math.PI / 2) * (i / 12);
          arc.push(`${i === 0 ? "M" : "L"} ${hinge.x + Math.cos(a) * w} ${hinge.y + Math.sin(a) * w}`);
        }
        page.drawSvgPath(arc.join(" "), { x: 0, y: 0, borderColor: rgb(0.68, 0.62, 0.52), borderWidth: 0.4, borderDashArray: [2, 2] });
      }
    }
  }

  // Labels.
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
    const size = Math.max(6, Math.min(9, (b.maxX - b.minX) * scale * 0.1));
    const nameWidth = bold.widthOfTextAtSize(safe(room.name), size);
    text(page, room.name, cx - nameWidth / 2, cy + 1, size, bold, INK);
    const areaLabel = `${area.toFixed(1)} m2`;
    const areaWidth = font.widthOfTextAtSize(areaLabel, size * 0.8);
    text(page, areaLabel, cx - areaWidth / 2, cy - size * 0.95, size * 0.8, font, MUTED);
  }

  // North arrow.
  const northAngle = (project.site.northBearing * Math.PI) / 180;
  const nx = drawing.x + drawing.w - 40;
  const ny = drawing.y + drawing.h - 30;
  const dir = { x: Math.sin(northAngle), y: Math.cos(northAngle) };
  page.drawLine({
    start: { x: nx - dir.x * 14, y: ny - dir.y * 14 },
    end: { x: nx + dir.x * 20, y: ny + dir.y * 20 },
    thickness: 1.1,
    color: INK,
  });
  page.drawCircle({ x: nx, y: ny, size: 1.6, color: INK });
  text(page, "N", nx + dir.x * 22, ny + dir.y * 22 - 3, 9, bold, INK);

  // Scale note.
  const scaleDenominator = Math.round(1000 / (scale * 0.3528));
  text(page, `Scale approx 1:${scaleDenominator} at A3`, drawing.x, 112, 7.5, font, MUTED);
  const scaleBarLength = 2 * scale;
  page.drawLine({ start: { x: drawing.x + 130, y: 108 }, end: { x: drawing.x + 130 + scaleBarLength, y: 108 }, thickness: 1.2, color: INK });
  text(page, "2 m", drawing.x + 130 + scaleBarLength + 6, 105, 7, font, MUTED);

  // Right-hand title block.
  const rightX = 866;
  const rightW = width - rightX - 40;
  let y = height - 128;
  page.drawRectangle({ x: rightX, y: y - 250, width: rightW, height: 250, color: rgb(0.96, 0.95, 0.92), borderColor: LINE, borderWidth: 0.6 });
  text(page, "PROJECT DATA", rightX + 14, y - 18, 7.5, bold, ACCENT);
  const rows: [string, string][] = [
    ["Plot area", `${metrics.plotArea.toFixed(2)} m2`],
    ["Buildable area", `${metrics.buildableArea.toFixed(2)} m2`],
    ["Ground coverage", `${(metrics.groundCoverageRatio * 100).toFixed(1)} %`],
    ["Total built-up", `${metrics.totalBuiltUp.toFixed(2)} m2`],
    ["Carpet / net rooms", `${metrics.totalCarpet.toFixed(2)} m2`],
    ["FSI", metrics.fsi.toFixed(2)],
    ["Rooms / floors", `${metrics.roomCount} / ${project.floors.length}`],
    ["True north", `${project.site.northBearing.toFixed(1)} deg`],
    ["Floor built-up", `${(floorMetric?.builtUpArea ?? 0).toFixed(2)} m2`],
    ["Doors / windows", `${metrics.doorCount} / ${metrics.windowCount}`],
  ];
  rows.forEach(([label, value], index) => {
    text(page, label, rightX + 14, y - 38 - index * 18, 8, font, MUTED);
    const w = bold.widthOfTextAtSize(safe(value), 8);
    text(page, value, rightX + rightW - 14 - w, y - 38 - index * 18, 8, bold, INK);
  });

  y -= 274;
  text(page, "DEFINITIONS", rightX + 14, y, 7.5, bold, ACCENT);
  const defs = [
    "Built-up: union of room polygons + wall footprints, 10 cm raster.",
    "Carpet: sum of clear room polygons.",
    "Room area: exact shoelace area of the stored polygon.",
    "Coverage and FSI use measured floor areas at this revision.",
  ];
  let defY = y - 16;
  for (const def of defs) {
    for (const line of wrapLine(def, font, 7, rightW - 28)) {
      text(page, line, rightX + 14, defY, 7, font, MUTED);
      defY -= 10;
    }
    defY -= 3;
  }

  // Legend.
  y = defY - 14;
  text(page, "LEGEND", rightX + 14, y, 7.5, bold, ACCENT);
  const types = [...new Set(floor.rooms.map((r) => r.type))];
  let ly = y - 18;
  for (const type of types.slice(0, 9)) {
    page.drawRectangle({ x: rightX + 14, y: ly - 2, width: 9, height: 9, color: tint(ROOM_COLORS[type] ?? "#9a9a9a", 0.35), borderColor: LINE, borderWidth: 0.3 });
    text(page, ROOM_LABELS[type], rightX + 30, ly, 7.5, font, INK);
    ly -= 14;
  }

  // Disclaimer strip.
  page.drawRectangle({ x: 0, y: 46, width, height: 36, color: rgb(0.96, 0.95, 0.92) });
  text(
    page,
    "PRELIMINARY CONCEPT - dimensions and areas derive from the canonical parametric model. Not a construction drawing. Structural and MEP design are excluded.",
    42,
    58,
    7.5,
    font,
    MUTED,
  );

  footer(page, font, project, `Plan · ${floor.name}`);
}

function drawTablePage(
  doc: PDFDocument,
  project: Project,
  title: string,
  subtitle: string,
  headers: { label: string; width: number; align?: "left" | "right" }[],
  rows: string[][],
  font: PDFFont,
  bold: PDFFont,
  totals?: string[][],
): void {
  const pageSize = A3_LANDSCAPE;
  const left = 48;
  const top = pageSize[1] - 120;
  let page = doc.addPage(pageSize);
  let y = top;
  const drawHeader = (p: PDFPage) => {
    p.drawRectangle({ x: 0, y: 0, width: pageSize[0], height: pageSize[1], color: PAPER });
    p.drawRectangle({ x: 0, y: pageSize[1] - 92, width: pageSize[0], height: 92, color: rgb(0.09, 0.1, 0.11) });
    text(p, "VASTIQX", left, pageSize[1] - 48, 10, bold, rgb(0.93, 0.73, 0.47));
    text(p, title, left, pageSize[1] - 72, 17, bold, rgb(0.97, 0.95, 0.9));
    text(p, `${subtitle} · revision ${project.revision}`, left, pageSize[1] - 86, 8.5, font, rgb(0.72, 0.71, 0.67));

    let x = left;
    p.drawLine({ start: { x: left, y: top + 12 }, end: { x: pageSize[0] - left, y: top + 12 }, thickness: 0.8, color: rgb(0.3, 0.29, 0.26) });
    for (const header of headers) {
      const labelWidth = bold.widthOfTextAtSize(header.label, 7.5);
      text(
        p,
        header.label,
        header.align === "right" ? x + header.width - labelWidth - 4 : x + 4,
        top + 18,
        7.5,
        bold,
        MUTED,
      );
      x += header.width;
    }
  };
  drawHeader(page);

  for (const row of rows) {
    if (y < 80) {
      footer(page, font, project, title);
      page = doc.addPage(pageSize);
      drawHeader(page);
      y = top;
    }
    let x = left;
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      const value = row[i] ?? "";
      const lines = wrapLine(value, font, 7.5, header.width - 8);
      for (const line of lines) {
        const w = font.widthOfTextAtSize(line, 7.5);
        text(page, line, header.align === "right" ? x + header.width - w - 4 : x + 4, y, 7.5, font, INK);
        x += 0;
        y -= 10;
      }
      x += header.width;
    }
    y += 10;
    page.drawLine({ start: { x: left, y: y - 3 }, end: { x: pageSize[0] - left, y: y - 3 }, thickness: 0.3, color: LINE });
    y -= 12;
  }

  if (totals && totals.length > 0) {
    if (y < 160) {
      footer(page, font, project, title);
      page = doc.addPage(pageSize);
      drawHeader(page);
      y = top;
    }
    y -= 6;
    page.drawLine({ start: { x: left, y }, end: { x: pageSize[0] - left, y }, thickness: 0.8, color: rgb(0.35, 0.33, 0.29) });
    y -= 18;
    for (const [label, value] of totals) {
      const labelWidth = bold.widthOfTextAtSize(safe(label), 9);
      text(page, label, pageSize[0] - left - 300, y, 9, bold, MUTED);
      const valueWidth = bold.widthOfTextAtSize(safe(value), 9);
      text(page, value, pageSize[0] - left - valueWidth, y, 9, bold, INK);
      void labelWidth;
      y -= 15;
    }
  }

  footer(page, font, project, title);
}

function drawElevationsPage(doc: PDFDocument, project: Project, font: PDFFont, bold: PDFFont): void {
  const elevations = buildElevations(project);
  const page = doc.addPage(A3_LANDSCAPE);
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: rgb(0.043, 0.141, 0.094) });
  text(page, "VASTIQX", 42, height - 48, 10, bold, rgb(0.47, 0.76, 0.18));
  text(page, "Front, rear and side elevations", 42, height - 72, 18, bold, rgb(0.97, 0.95, 0.9));
  text(
    page,
    `${elevations.facade.name} · ${elevations.facade.wallFinish} · ${elevations.facade.accentFinish} · revision ${project.revision}`,
    42,
    height - 86,
    8.5,
    font,
    rgb(0.72, 0.71, 0.67),
  );

  const gap = 16;
  const left = 42;
  const top = height - 112;
  const cardW = (width - left * 2 - gap) / 2;
  const cardH = (top - 70 - gap) / 2;
  elevations.views.forEach((view, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x0 = left + col * (cardW + gap);
    const y0 = top - cardH - row * (cardH + gap);
    page.drawRectangle({ x: x0, y: y0, width: cardW, height: cardH, color: rgb(0.985, 0.976, 0.957), borderColor: LINE, borderWidth: 0.7 });
    text(page, view.label, x0 + 12, y0 + cardH - 18, 10.5, bold, INK);
    text(page, `${view.openingCount} openings · ${view.buildingWidth.toFixed(2)} x ${view.buildingHeight.toFixed(2)} m`, x0 + 110, y0 + cardH - 18, 7.5, font, MUTED);

    const inner = { x: x0 + 14, y: y0 + 16, w: cardW - 28, h: cardH - 46 };
    const scale = Math.min(inner.w / Math.max(0.1, view.width), inner.h / Math.max(0.1, view.height));
    const ox = inner.x + (inner.w - view.width * scale) / 2;
    const oy = inner.y + (inner.h - view.height * scale) / 2;
    for (const shape of view.shapes) {
      const rx = ox + shape.x * scale;
      const ry = oy + (view.height - (shape.y + shape.height)) * scale;
      page.drawRectangle({
        x: rx,
        y: ry,
        width: Math.max(0.3, shape.width * scale),
        height: Math.max(0.3, shape.height * scale),
        color: hexRgb(shape.color.length === 7 ? shape.color : "#9a9a9a"),
        borderColor: shape.kind === "ground" ? undefined : rgb(0.22, 0.2, 0.16),
        borderWidth: shape.kind === "ground" ? 0 : 0.25,
        opacity: shape.kind === "shadow" ? 0.35 : 1,
      });
    }
    page.drawLine({
      start: { x: inner.x, y: oy + (view.height - view.groundY) * scale },
      end: { x: inner.x + inner.w, y: oy + (view.height - view.groundY) * scale },
      thickness: 0.5,
      color: rgb(0.45, 0.43, 0.37),
      dashArray: [3, 2],
    });
  });

  text(
    page,
    elevations.method,
    42,
    50,
    7.5,
    font,
    MUTED,
  );
  footer(page, font, project, "Elevations");
}

export async function buildPlanPdf(project: Project): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`VastiqX - ${project.name} - revision ${project.revision}`);
  doc.setAuthor("VastiqX");
  doc.setSubject("Concept floor plans, area schedule and preliminary estimate");
  doc.setProducer("VastiqX deterministic export pipeline");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < project.floors.length; i++) {
    drawPlanPage(doc, project, i, font, bold);
  }

  const schedule = areaSchedule(project);
  drawTablePage(
    doc,
    project,
    "Area schedule",
    "Floor-wise clear areas from canonical room polygons",
    [
      { label: "Floor", width: 90 },
      { label: "Room", width: 170 },
      { label: "Type", width: 130 },
      { label: "Area m2", width: 80, align: "right" },
      { label: "Perimeter m", width: 90, align: "right" },
      { label: "W x D m", width: 100, align: "right" },
      { label: "Target m2", width: 80, align: "right" },
      { label: "Variance", width: 80, align: "right" },
      { label: "Direction", width: 90 },
    ],
    schedule.rows.map((r) => [
      r.floor,
      r.room,
      r.type,
      r.area.toFixed(2),
      r.perimeter.toFixed(2),
      `${r.width.toFixed(2)} x ${r.depth.toFixed(2)}`,
      r.targetArea ? r.targetArea.toFixed(1) : "-",
      r.variance !== undefined ? `${r.variance.toFixed(1)}%` : "-",
      r.direction,
    ]),
    font,
    bold,
    [
      ["Plot area", `${schedule.totals.plotArea.toFixed(2)} m2`],
      ["Ground coverage", `${(schedule.totals.coverageRatio * 100).toFixed(1)} %`],
      ["Total built-up", `${schedule.totals.totalBuiltUp.toFixed(2)} m2`],
      ["Carpet / net rooms", `${schedule.totals.totalCarpet.toFixed(2)} m2`],
      ["FSI", schedule.totals.fsi.toFixed(2)],
    ],
  );

  const compliance = buildAreaCompliance(project);
  drawTablePage(
    doc,
    project,
    "Area compliance",
    `${compliance.summary.headline} · ${compliance.summary.pass} pass / ${compliance.summary.warn} advisory / ${compliance.summary.fail} fail`,
    [
      { label: "Floor", width: 105 },
      { label: "Rooms", width: 55, align: "right" },
      { label: "Sum rooms m2", width: 105, align: "right" },
      { label: "ft2 / gaj", width: 150, align: "right" },
      { label: "Union m2", width: 85, align: "right" },
      { label: "Built-up m2", width: 100, align: "right" },
      { label: "Wall share", width: 110, align: "right" },
      { label: "Status", width: 80 },
    ],
    compliance.floors.map((floor) => [
      floor.name,
      String(floor.roomCount),
      floor.carpetArea.toFixed(2),
      `${formatArea(floor.carpetArea, "sqft")} / ${formatArea(floor.carpetArea, "gaj")}`,
      floor.roomUnionArea.toFixed(2),
      floor.builtUpArea.toFixed(2),
      `${floor.wallAndCommonShare.toFixed(2)} (${floor.builtUpGapPct.toFixed(1)}%)`,
      floor.status.replace(/_/g, " "),
    ]),
    font,
    bold,
    [
      ["Plot", `${compliance.project.plotArea.toFixed(2)} m2 / ${formatArea(compliance.project.plotArea, "sqft")} / ${formatArea(compliance.project.plotArea, "gaj")}`],
      ["Carpet", `${compliance.project.totalCarpet.toFixed(2)} m2 / ${formatArea(compliance.project.totalCarpet, "sqft")} / ${formatArea(compliance.project.totalCarpet, "gaj")}`],
      ["Built-up", `${compliance.project.totalBuiltUp.toFixed(2)} m2 / ${formatArea(compliance.project.totalBuiltUp, "sqft")} / ${formatArea(compliance.project.totalBuiltUp, "gaj")}`],
      ["Wall / common share", `${compliance.project.wallShare.toFixed(2)} m2`],
      ["Summary", compliance.summary.headline],
      ["Method", compliance.method],
      ["Disclaimer", compliance.disclaimer],
    ],
  );

  const complianceRows = [...compliance.project.checks, ...compliance.floors.flatMap((floor) => floor.checks)].map((check) => [
    check.title,
    check.status.replace(/_/g, " "),
    `${check.value} ${check.valueUnit}`,
    check.limit,
    check.note,
    check.formula,
  ]);
  drawTablePage(
    doc,
    project,
    "Area reconciliation checks",
    "Room sum, union, built-up and program checks",
    [
      { label: "Check", width: 300 },
      { label: "Status", width: 80 },
      { label: "Value", width: 110, align: "right" },
      { label: "Limit", width: 170 },
      { label: "Result", width: 310 },
      { label: "Formula", width: 150 },
    ],
    complianceRows,
    font,
    bold,
  );

  const vastu = assessVastu(project);
  const rules = checkSiteRules(project);
  const advisoryRows: string[][] = [
    ...rules.checks.map((c) => [rules.pack.name, c.title, c.status.toUpperCase().replace("_", " "), c.value]),
    ...vastu.findings
      .filter((f) => f.status === "fail" || f.status === "advisory")
      .map((f) => [`Vastu ${f.ruleVersion}`, `${f.entityName} - ${f.title}`, f.status.toUpperCase(), `${f.sector ?? "-"} · ${f.explanation}`]),
  ];
  drawTablePage(
    doc,
    project,
    "Advisory checks",
    "Source-linked Vastu guidance and indicative jurisdiction checks",
    [
      { label: "Source", width: 160 },
      { label: "Check", width: 240 },
      { label: "Status", width: 80 },
      { label: "Detail", width: 640 },
    ],
    advisoryRows,
    font,
    bold,
    [
      ["Rule pack", rules.pack.id],
      ["Vastu rules", `${vastu.summary.assessed} assessed · ${vastu.summary.fail} attention · ${vastu.summary.not_assessed} not assessed`],
      ["Compliance", "NOT A STATUTORY CERTIFICATE"],
    ],
  );

  const estimate = calculateEstimate(project);
  const lineRows = [...estimate.materialLines, ...estimate.labourLines].map((l) => [
    l.packageName,
    l.description,
    l.quantity.toFixed(2),
    l.unit,
    formatINR(l.rate),
    formatINR(l.amount),
    l.confidence,
  ]);
  drawTablePage(
    doc,
    project,
    "Preliminary estimate",
    `${estimate.rateBook.name} · ${estimate.package} finish package · rate book valid to ${estimate.rateBook.validTo}`,
    [
      { label: "Package", width: 120 },
      { label: "Description", width: 500 },
      { label: "Qty", width: 70, align: "right" },
      { label: "Unit", width: 50 },
      { label: "Rate", width: 100, align: "right" },
      { label: "Amount", width: 120, align: "right" },
      { label: "Basis", width: 100 },
    ],
    lineRows,
    font,
    bold,
    [
      ["Materials", formatINR(estimate.totals.materials)],
      ["Labour", formatINR(estimate.totals.labour)],
      ["Equipment (2%)", formatINR(estimate.totals.equipment)],
      ["Overheads (6%)", formatINR(estimate.totals.overheads)],
      ["Margin (8%)", formatINR(estimate.totals.margin)],
      ["GST (18%)", formatINR(estimate.totals.gst)],
      ["Contingency (5%)", formatINR(estimate.totals.contingency)],
      ["TOTAL", formatINR(estimate.totals.total)],
      ["Planning band", `${formatINR(estimate.totals.bandLow)} - ${formatINR(estimate.totals.bandHigh)}`],
      ["Rate per m2 built-up", formatINR(estimate.totals.perSqm)],
    ],
  );

  const cost = buildCostBreakdown(project);
  drawTablePage(
    doc,
    project,
    "Room and floor cost",
    `${cost.rateBookId} · ${cost.package} package · reconciled to the project estimate`,
    [
      { label: "Floor", width: 100 },
      { label: "Room", width: 150 },
      { label: "Type", width: 110 },
      { label: "Area m2", width: 70, align: "right" },
      { label: "ft2 / gaj", width: 130, align: "right" },
      { label: "Direct INR", width: 110, align: "right" },
      { label: "Shared INR", width: 110, align: "right" },
      { label: "Total INR", width: 120, align: "right" },
      { label: "Per m2", width: 90, align: "right" },
    ],
    cost.rooms.map((room) => [
      room.floor,
      room.room,
      room.roomType.replace(/_/g, " "),
      room.area.toFixed(2),
      `${formatArea(room.area, "sqft")} / ${formatArea(room.area, "gaj")}`,
      formatINR(room.directTotal),
      formatINR(room.allocatedShared),
      formatINR(room.total),
      formatINR(room.perSqm),
    ]),
    font,
    bold,
    [
      ...cost.floors.map((floor) => [floor.name, `direct ${formatINR(floor.directTotal)} · shared ${formatINR(floor.allocatedShared)} · total ${formatINR(floor.total)}`] as [string, string]),
      ["Exact project estimate total", formatINR(cost.project.estimateTotal)],
      ["Measured direct room lines", formatINR(cost.project.directFinishTotal)],
      ["Allocated shared", formatINR(cost.project.allocatedSharedTotal)],
      ["Per built-up m2", formatINR(cost.project.perSqm)],
      ["Reconciliation", cost.allocation.reconciliation],
      ["Disclaimer", cost.disclaimer],
    ],
  );

  const costLineRows = cost.rooms.flatMap((room) =>
    room.lines.map((line) => [
      `${room.floor} / ${room.room}`,
      line.description,
      `${line.quantity} ${line.unit}`,
      formatINR(line.rate),
      formatINR(line.amount),
      line.confidence,
      line.formula,
    ]),
  );
  drawTablePage(
    doc,
    project,
    "Measured room lines",
    "Finishes, openings, services and allocations at revision " + project.revision,
    [
      { label: "Floor / room", width: 150 },
      { label: "Line", width: 300 },
      { label: "Qty", width: 90, align: "right" },
      { label: "Rate", width: 100, align: "right" },
      { label: "Amount", width: 110, align: "right" },
      { label: "Basis", width: 90 },
      { label: "Formula", width: 280 },
    ],
    costLineRows,
    font,
    bold,
    [
      ["Direct room lines", formatINR(cost.project.directFinishTotal)],
      ["Allocated shared", formatINR(cost.project.allocatedSharedTotal)],
      ["Room total", formatINR(cost.project.estimateTotal)],
    ],
  );

  const takeoff = takeoffQuantities(project);
  const materialPack = projectMaterialPack(takeoff);
  drawTablePage(
    doc,
    project,
    "Construction material estimate",
    "Measured takeoff converted to planning quantities · cement in 50 kg bags",
    [
      { label: "Material", width: 160 },
      { label: "Quantity", width: 160, align: "right" },
      { label: "Basis", width: 790 },
    ],
    materialPack.items.map((item) => [item.name, `${item.quantity.toLocaleString("en-IN")} ${item.unit}`, item.basis]),
    font,
    bold,
    [
      ["Brickwork volume", `${materialPack.measured.brickworkM3.toFixed(2)} m3 / ${formatVolume(materialPack.measured.brickworkM3, "cft")}`],
      ["RCC volume", `${materialPack.measured.concreteM3.toFixed(2)} m3 / ${formatVolume(materialPack.measured.concreteM3, "cft")}`],
      ["Plaster area", `${materialPack.measured.plasterM2.toFixed(2)} m2 / ${formatArea(materialPack.measured.plasterM2, "sqft")}`],
      ["Steel benchmark", `${materialPack.measured.steelKg.toLocaleString("en-IN")} kg`],
      ...materialPack.notes.map((note) => ["Note", note] as [string, string]),
    ],
  );

  drawElevationsPage(doc, project, font, bold);

  const furniture = furnitureSchedule(project);
  if (furniture.length > 0) {
    drawTablePage(
      doc,
      project,
      "Furniture layout",
      "Presentation layer only · excluded from room area, built-up, Vastu and cost",
      [
        { label: "Floor", width: 110 },
        { label: "Room", width: 160 },
        { label: "Item", width: 220 },
        { label: "Kind", width: 150 },
        { label: "Footprint", width: 160, align: "right" },
        { label: "Rotation", width: 80, align: "right" },
        { label: "Basis", width: 230 },
      ],
      furniture.map((item) => [
        item.floor,
        item.room,
        item.label,
        item.kind.replace(/_/g, " "),
        `${item.width.toFixed(2)} x ${item.depth.toFixed(2)} m`,
        `${item.rotation} deg`,
        "presentation only",
      ]),
      font,
      bold,
      [["Furniture items", String(furniture.length)], ["Area / cost impact", "NONE - excluded by design"]],
    );
  }

  // Assumptions page.
  const page = doc.addPage(A3_LANDSCAPE);
  page.drawRectangle({ x: 0, y: 0, width: A3_LANDSCAPE[0], height: A3_LANDSCAPE[1], color: PAPER });
  page.drawRectangle({ x: 0, y: A3_LANDSCAPE[1] - 92, width: A3_LANDSCAPE[0], height: 92, color: rgb(0.09, 0.1, 0.11) });
  text(page, "VASTIQX", 48, A3_LANDSCAPE[1] - 48, 10, bold, rgb(0.93, 0.73, 0.47));
  text(page, "Assumptions & exclusions", 48, A3_LANDSCAPE[1] - 72, 17, bold, rgb(0.97, 0.95, 0.9));
  text(page, `Revision ${project.revision} · ${new Date().toISOString().slice(0, 10)}`, 48, A3_LANDSCAPE[1] - 86, 8.5, font, rgb(0.72, 0.71, 0.67));

  let ay = A3_LANDSCAPE[1] - 130;
  const blocks: { title: string; items: string[] }[] = [
    { title: "ESTIMATE ASSUMPTIONS", items: estimate.assumptions },
    { title: "INCLUDED", items: estimate.inclusions },
    { title: "EXCLUDED", items: estimate.exclusions },
    { title: "MISSING INPUTS (NOT ASSUMED AS COMPLETE)", items: estimate.missingInputs },
  ];
  for (const block of blocks) {
    text(page, block.title, 48, ay, 8, bold, ACCENT);
    ay -= 18;
    for (const item of block.items) {
      for (const line of wrapLine(`• ${item}`, font, 8.5, 520)) {
        text(page, line, 56, ay, 8.5, font, INK);
        ay -= 12;
      }
    }
    ay -= 12;
    if (ay < 100) break;
  }

  const provenance = [
    ["Engine", estimate.engineVersion],
    ["Scene engine", buildScene(project).engineVersion],
    ["Rate book", `${estimate.rateBook.id} (${estimate.rateBook.source})`],
    ["Vastu pack", `${vastu.profile.id} v${vastu.profile.version}`],
    ["Rule pack", rules.pack.id],
    ["Project revision", String(project.revision)],
    ["Sectors", SECTORS.join(" · ")],
  ];
  let py = A3_LANDSCAPE[1] - 130;
  text(page, "PROVENANCE", 640, py, 8, bold, ACCENT);
  py -= 18;
  for (const [label, value] of provenance) {
    text(page, label, 640, py, 8, font, MUTED);
    for (const line of wrapLine(value, font, 8, 400)) {
      text(page, line, 760, py, 8, font, INK);
      py -= 11;
    }
    py -= 4;
  }

  text(
    page,
    "This document was generated deterministically from the canonical parametric model. The AI agent cannot calculate or persist any value shown here; it can only invoke the same domain services used by the editor.",
    48,
    78,
    8,
    font,
    MUTED,
  );
  footer(page, font, project, "Assumptions");

  return doc.save();
}

export function pdfLineCount(project: Project): number {
  return project.floors.length + 5;
}

export function inlinePdfSummary(project: Project): { pages: number; rooms: number; revision: number } {
  return {
    pages: pdfLineCount(project),
    rooms: project.floors.reduce((s, f) => s + f.rooms.length, 0),
    revision: project.revision,
  };
}

export function summaryNumber(project: Project): string {
  return round(projectMetrics(project).totalBuiltUp, 2).toString();
}
