import { calculateEstimate, formatINR, takeoffQuantities } from "@/domain/boq";
import { buildAreaCompliance } from "@/domain/compliance";
import { buildCostBreakdown } from "@/domain/breakdown";
import { projectMaterialPack } from "@/domain/calculator";
import { buildElevations, type ElevationView } from "@/domain/elevations";
import { furnitureSchedule } from "@/domain/furniture";
import { projectMetrics } from "@/domain/measure";
import { areaSchedule } from "@/domain/schedule";
import { currentFacade } from "@/domain/templates";
import { ROOM_LABELS, PROJECT_TYPE_LABELS, SECTOR_LABELS, type Project } from "@/domain/types";
import { formatArea, formatVolume } from "@/domain/units";
import { assessVastu } from "@/domain/vastu";
import { checkSiteRules } from "@/domain/rules";
import { planSvg, escapeXml } from "./svg";

function badge(status: string): string {
  const map: Record<string, string> = {
    pass: "ok",
    fail: "bad",
    advisory: "warn",
    not_assessed: "muted",
    overridden: "info",
    measured: "ok",
    benchmarked: "warn",
    assumed: "warn",
    missing: "bad",
  };
  return `<span class="badge ${map[status] ?? "muted"}">${escapeXml(status.replace(/_/g, " "))}</span>`;
}

function areaWithConversions(area: number): string {
  return `${area.toFixed(2)} m²<div class="muted small">${escapeXml(formatArea(area, "sqft"))} · ${escapeXml(formatArea(area, "gaj"))}</div>`;
}

function elevationSvg(view: ElevationView): string {
  const shapes = view.shapes
    .map((shape) => {
      const y = view.height - (shape.y + shape.height);
      return `<rect x="${shape.x}" y="${y.toFixed(3)}" width="${Math.max(0.005, shape.width)}" height="${Math.max(0.005, shape.height)}" fill="${shape.color}" stroke="${shape.kind === "ground" ? "none" : "rgba(20,38,28,0.22)"}" stroke-width="0.018"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="${escapeXml(view.label)}" class="elev">
    <rect width="${view.width}" height="${view.height}" fill="#f6f3e9"/>
    ${shapes}
    <line x1="0.1" y1="${(view.height - view.groundY + 0.02).toFixed(2)}" x2="${(view.width - 0.1).toFixed(2)}" y2="${(view.height - view.groundY + 0.02).toFixed(2)}" stroke="#5f6b5d" stroke-width="0.022" stroke-dasharray="0.18 0.12"/>
  </svg>`;
}

export function buildReportHtml(project: Project): string {
  const metrics = projectMetrics(project);
  const schedule = areaSchedule(project);
  const vastu = assessVastu(project);
  const rules = checkSiteRules(project);
  const estimate = calculateEstimate(project);
  const compliance = buildAreaCompliance(project);
  const cost = buildCostBreakdown(project);
  const materialPack = projectMaterialPack(takeoffQuantities(project));
  const elevations = buildElevations(project);
  const facade = currentFacade(project);
  const generated = new Date().toISOString();

  const planSections = project.floors
    .map(
      (floor) => `<section class="sheet">
      <div class="sheet-head">
        <div><span class="eyebrow">Floor plan</span><h3>${escapeXml(floor.name)}</h3></div>
        <span class="muted">${floor.rooms.length} rooms · ${floor.walls.length} walls</span>
      </div>
      ${planSvg(project, floor, { pxPerMetre: 46, showGrid: false, title: `${project.name} · ${floor.name} · R${project.revision}` })}
    </section>`,
    )
    .join("\n");

  const vastuRows = vastu.findings
    .map(
      (f) => `<tr>
        <td><strong>${escapeXml(f.entityName)}</strong><br><span class="muted small">${escapeXml(f.ruleId)} · ${escapeXml(f.ruleVersion)}</span></td>
        <td>${escapeXml(f.title)}${f.sector ? `<br><span class="muted small">${escapeXml(SECTOR_LABELS[f.sector])}</span>` : ""}</td>
        <td>${badge(f.status)}</td>
        <td>${escapeXml(f.explanation)}${f.overrideReason ? `<br><em>Override: ${escapeXml(f.overrideReason)}</em>` : ""}<br><span class="muted small">Source: ${escapeXml(f.source)}</span></td>
      </tr>`,
    )
    .join("\n");

  const ruleRows = rules.checks
    .map(
      (c) => `<tr>
        <td><strong>${escapeXml(c.title)}</strong><br><span class="muted small">${escapeXml(c.ruleId)} · effective ${escapeXml(c.effectiveDate)}</span></td>
        <td>${badge(c.status)}</td>
        <td>${escapeXml(c.value)}<br><span class="muted small">Limit: ${escapeXml(c.limit)}</span></td>
        <td>${escapeXml(c.formula)}${c.note ? `<br><span class="muted small">${escapeXml(c.note)}</span>` : ""}</td>
      </tr>`,
    )
    .join("\n");

  const materialRows = estimate.materialLines
    .map(
      (l) => `<tr>
        <td>${escapeXml(l.packageName)}</td>
        <td>${escapeXml(l.description)}<div class="formula">${escapeXml(l.formula)}</div></td>
        <td class="num">${l.quantity.toFixed(2)} ${escapeXml(l.unit)}</td>
        <td class="num">${escapeXml(formatINR(l.rate))}</td>
        <td class="num">${escapeXml(formatINR(l.amount))}</td>
        <td>${badge(l.confidence)}<div class="muted small">${escapeXml(l.source)} · ${escapeXml(l.effectiveDate)}</div></td>
      </tr>`,
    )
    .join("\n");

  const labourRows = estimate.labourLines
    .map(
      (l) => `<tr>
        <td>${escapeXml(l.description)}</td>
        <td class="num">${l.quantity.toFixed(2)} ${escapeXml(l.unit)}</td>
        <td class="num">${escapeXml(formatINR(l.rate))}</td>
        <td class="num">${escapeXml(formatINR(l.amount))}</td>
        <td>${badge(l.confidence)}<div class="formula">${escapeXml(l.formula)}</div></td>
      </tr>`,
    )
    .join("\n");

  const scheduleRows = schedule.rows
    .map(
      (r) => `<tr>
        <td>${escapeXml(r.floor)}</td>
        <td><strong>${escapeXml(r.room)}</strong></td>
        <td>${escapeXml(r.type)}</td>
        <td class="num">${r.area.toFixed(2)}</td>
        <td class="num">${r.perimeter.toFixed(2)}</td>
        <td class="num">${r.width.toFixed(2)} x ${r.depth.toFixed(2)}</td>
        <td class="num">${r.targetArea ? r.targetArea.toFixed(1) : "—"}</td>
        <td class="num">${r.variance !== undefined ? `${r.variance.toFixed(1)}%` : "—"}</td>
        <td>${escapeXml(r.direction)}</td>
      </tr>`,
    )
    .join("\n");

  const complianceFloorRows = compliance.floors
    .map(
      (floor) => `<tr>
        <td><strong>${escapeXml(floor.name)}</strong></td>
        <td class="num">${floor.roomCount}</td>
        <td class="num">${areaWithConversions(floor.carpetArea)}</td>
        <td class="num">${floor.roomUnionArea.toFixed(2)}</td>
        <td class="num">${areaWithConversions(floor.builtUpArea)}</td>
        <td class="num">${floor.wallAndCommonShare.toFixed(2)}<div class="muted small">${floor.builtUpGapPct.toFixed(1)}%</div></td>
        <td>${badge(floor.status)}</td>
      </tr>`,
    )
    .join("\n");

  const complianceCheckRows = [...compliance.project.checks, ...compliance.floors.flatMap((floor) => floor.checks)]
    .map(
      (check) => `<tr>
        <td><strong>${escapeXml(check.title)}</strong><div class="muted small">${escapeXml(check.id)}</div></td>
        <td>${badge(check.status)}</td>
        <td class="num">${check.value} ${escapeXml(check.valueUnit)}</td>
        <td>${escapeXml(check.limit)}</td>
        <td>${escapeXml(check.note)}<div class="formula">${escapeXml(check.formula)}</div></td>
      </tr>`,
    )
    .join("\n");

  const costFloorRows = cost.floors
    .map(
      (floor) => `<tr>
        <td><strong>${escapeXml(floor.name)}</strong></td>
        <td class="num">${areaWithConversions(floor.area)}</td>
        <td class="num">${floor.builtUpArea.toFixed(2)}</td>
        <td class="num">${escapeXml(formatINR(floor.directTotal))}</td>
        <td class="num">${escapeXml(formatINR(floor.allocatedShared))}</td>
        <td class="num"><strong>${escapeXml(formatINR(floor.total))}</strong></td>
        <td class="num">${escapeXml(formatINR(floor.perSqm))}</td>
      </tr>`,
    )
    .join("\n");

  const costRoomRows = cost.rooms
    .map(
      (room) => `<tr>
        <td>${escapeXml(room.floor)}</td>
        <td><strong>${escapeXml(room.room)}</strong><div class="muted small">${escapeXml(room.roomType.replace(/_/g, " "))}</div></td>
        <td class="num">${areaWithConversions(room.area)}</td>
        <td class="num">${room.doors} / ${room.windows}</td>
        <td class="num">${escapeXml(formatINR(room.directTotal))}</td>
        <td class="num">${escapeXml(formatINR(room.allocatedShared))}</td>
        <td class="num"><strong>${escapeXml(formatINR(room.total))}</strong></td>
        <td class="num">${escapeXml(formatINR(room.perSqm))}</td>
      </tr>`,
    )
    .join("\n");

  const costLineRows = cost.rooms
    .flatMap((room) =>
      room.lines.map(
        (line) => `<tr>
          <td>${escapeXml(room.floor)} · ${escapeXml(room.room)}</td>
          <td>${escapeXml(line.description)}<div class="formula">${escapeXml(line.formula)}</div></td>
          <td class="num">${line.quantity} ${escapeXml(line.unit)}</td>
          <td class="num">${escapeXml(formatINR(line.rate))}</td>
          <td class="num">${escapeXml(formatINR(line.amount))}</td>
          <td>${badge(line.confidence)}</td>
        </tr>`,
      ),
    )
    .join("\n");

  const materialPackRows = materialPack.items
    .map(
      (item) => `<tr>
        <td><strong>${escapeXml(item.name)}</strong></td>
        <td class="num">${item.quantity.toLocaleString("en-IN")} ${escapeXml(item.unit)}</td>
        <td>${escapeXml(item.basis)}</td>
      </tr>`,
    )
    .join("\n");

  const elevationCards = elevations.views
    .map(
      (view) => `<div class="elev-card">
        <div class="elev-head"><strong>${escapeXml(view.label)}</strong><span>${view.openingCount} openings · ${view.buildingWidth.toFixed(2)} × ${view.buildingHeight.toFixed(2)} m</span></div>
        ${elevationSvg(view)}
      </div>`,
    )
    .join("\n");

  const furnitureRows = furnitureSchedule(project)
    .map(
      (item) => `<tr>
        <td>${escapeXml(item.floor)}</td>
        <td>${escapeXml(item.room)}</td>
        <td><strong>${escapeXml(item.label)}</strong><div class="muted small">${escapeXml(item.kind.replace(/_/g, " "))}</div></td>
        <td class="num">${item.width.toFixed(2)} × ${item.depth.toFixed(2)} m</td>
        <td class="num">${item.rotation}°</td>
        <td>presentation only · excluded from built-up and cost</td>
      </tr>`,
    )
    .join("\n");

  const amenityRows = (project.amenities ?? [])
    .map(
      (amenity) => `<tr>
        <td><strong>${escapeXml(amenity.label)}</strong><div class="muted small">${escapeXml(amenity.kind.replace(/_/g, " "))}</div></td>
        <td>${escapeXml(amenity.level)}</td>
        <td class="num">${amenity.rect ? `${(amenity.rect.width * amenity.rect.depth).toFixed(2)} m²` : "—"}</td>
        <td class="num">${amenity.rect ? `${amenity.rect.width.toFixed(2)} × ${amenity.rect.depth.toFixed(2)} m` : "roof layer"}</td>
        <td>${escapeXml(amenity.notes.join(" "))}</td>
      </tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeXml(project.name)} — VastiqX project report R${project.revision}</title>
<style>
  :root { --ink:#12271b; --muted:#6f6c5e; --line:#d9d2c4; --paper:#f7f3ea; --accent:#3f8f12; --lime:#78c22d; --dark:#0b2418; --ok:#2f6b4f; --bad:#9c3a2f; --warn:#8a5a1f; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#e8e2d6; color:var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  body { padding: 28px; }
  .page { max-width: 1120px; margin: 0 auto; background: var(--paper); box-shadow: 0 20px 60px rgba(30,24,12,.18); }
  header.cover { background: var(--dark); color:#f4efe4; padding: 46px 52px 38px; }
  .brand { display:flex; align-items:center; gap:11px; font-size:17px; font-weight:800; letter-spacing:-.02em; color:#f4efe4; }
  .brand .mark { width:34px; height:34px; border-radius:8px; background:#f8f4e8; display:grid; place-items:center; overflow:hidden; }
  .brand .word { color:#f4efe4; }
  .brand .x { color:var(--lime); }
  .brand .sub { display:block; font-size:8px; letter-spacing:.18em; text-transform:uppercase; color:#b9c8b1; font-weight:600; margin-top:2px; }
  h1 { font-size: 40px; line-height:1.05; margin: 26px 0 8px; font-weight: 650; letter-spacing:-.02em; }
  .cover p { color:#b9b3a6; max-width: 700px; line-height:1.6; margin: 0; }
  .cover .meta { display:flex; gap: 28px; margin-top: 30px; flex-wrap: wrap; font-size: 12px; color:#cfc8b9; }
  .cover .meta span strong { display:block; color:#f4efe4; font-size:14px; margin-top:4px; }
  main { padding: 34px 52px 56px; }
  section { margin-bottom: 40px; }
  h2 { font-size: 13px; letter-spacing:.22em; text-transform:uppercase; color:var(--accent); margin: 0 0 14px; font-weight: 650; }
  h3 { font-size: 21px; margin: 0; letter-spacing:-.01em; }
  .eyebrow { font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:var(--muted); display:block; margin-bottom:5px; }
  .metrics { display:grid; grid-template-columns: repeat(6, 1fr); gap: 1px; background: var(--line); border:1px solid var(--line); }
  .metric { background:#fbf8f1; padding: 16px 14px; }
  .metric .label { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
  .metric .value { font-size: 22px; margin-top:6px; font-variant-numeric: tabular-nums; letter-spacing:-.02em; }
  .metric .unit { font-size: 11px; color:var(--muted); margin-left:3px; }
  .sheet { border:1px solid var(--line); background:#fbf8f1; padding: 18px; break-inside: avoid; }
  .sheet-head { display:flex; justify-content:space-between; align-items:end; margin-bottom: 10px; }
  .sheet svg { width:100%; height:auto; display:block; border:1px solid #e6dfd2; }
  table { width:100%; border-collapse: collapse; font-size: 12px; }
  th { text-align:left; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); border-bottom:1.5px solid #c6bda9; padding: 8px 8px; }
  td { border-bottom:1px solid #e5ded1; padding: 9px 8px; vertical-align: top; line-height:1.5; }
  td.num { text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .badge { display:inline-block; font-size:9px; letter-spacing:.08em; text-transform:uppercase; padding: 3px 7px; border-radius: 3px; border:1px solid; white-space:nowrap; }
  .badge.ok { color:var(--ok); border-color:#a9c4b3; background:#eef5f0; }
  .badge.bad { color:var(--bad); border-color:#d4ada6; background:#f8eeec; }
  .badge.warn { color:var(--warn); border-color:#d8c3a2; background:#f9f2e6; }
  .badge.muted { color:var(--muted); border-color:#d7d1c5; background:#f3f0e9; }
  .badge.info { color:#315a78; border-color:#aec6d6; background:#eef4f8; }
  .formula { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:10px; color:var(--muted); margin-top:4px; line-height:1.5; }
  .muted { color: var(--muted); }
  .small { font-size: 10px; }
  .totals { margin-top: 14px; margin-left:auto; width: 420px; font-size:13px; }
  .totals div { display:flex; justify-content:space-between; padding: 6px 0; border-bottom:1px dotted #cfc7b8; }
  .totals div.total { font-size: 18px; border-bottom:2px solid #37322a; border-top:2px solid #37322a; margin-top:6px; padding: 10px 0; }
  .note { border-left:3px solid var(--accent); background:#f2eadb; padding: 14px 16px; font-size:12px; line-height:1.6; margin-top: 12px; }
  .cols { display:grid; grid-template-columns: 1fr 1fr; gap: 26px; }
  .list { margin:0; padding-left: 18px; font-size:12px; line-height:1.7; }
  .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
  .grid4 { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
  .stat { border:1px solid var(--line); background:#fbf8f1; padding:12px 14px; }
  .stat .l { font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
  .stat .v { font-size:20px; margin-top:4px; font-variant-numeric: tabular-nums; letter-spacing:-.02em; }
  .elev-grid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
  .elev-card { border:1px solid var(--line); background:#fbf8f1; padding:10px; break-inside: avoid; }
  .elev-head { display:flex; justify-content:space-between; gap:10px; font-size:10.5px; margin-bottom:7px; }
  .elev-head span { color:var(--muted); font-size:9.5px; }
  .elev { width:100%; height:auto; display:block; border:1px solid #e6dfd2; }
  .pill { display:inline-block; border:1px solid #b9dd8e; background:#f0f8e7; color:var(--accent); border-radius:999px; padding:2px 8px; font-size:9.5px; margin-right:5px; }
  .callout { border:1px solid #b9dd8e; background:#f0f8e7; padding:14px 16px; font-size:12px; line-height:1.6; }
  .callout.warn { border-color:#e0c48f; background:#fbf3e3; }
  footer.doc { border-top:1px solid var(--line); padding: 22px 52px 34px; font-size:10px; color:var(--muted); display:flex; justify-content:space-between; gap:20px; }
  @media print {
    body { background:#fff; padding:0; }
    .page { box-shadow:none; max-width:none; }
    main { padding: 24px 30px; }
    header.cover { padding: 32px 30px; }
    section { break-inside: avoid; }
    .sheet { break-inside: avoid; }
    footer.doc { padding: 16px 30px; }
  }
</style>
</head>
<body>
<div class="page">
<header class="cover">
  <div class="brand">
    <span class="mark">
      <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="#f8f4e8"/>
        <path d="M 116 414 L 256 112 L 396 414 L 338 414 L 256 238 L 174 414 Z" fill="#0b2418"/>
        <path d="M 136 396 L 256 142 L 376 396 L 342 396 L 256 218 L 170 396 Z" fill="#78c22d"/>
        <rect x="216" y="274" width="80" height="76" rx="6" fill="#e7a42a" stroke="#0b2418" stroke-width="7"/>
        <line x1="256" y1="274" x2="256" y2="350" stroke="#0b2418" stroke-width="7"/>
        <line x1="216" y1="312" x2="296" y2="312" stroke="#0b2418" stroke-width="7"/>
      </svg>
    </span>
    <span>
      <span class="word">Vastiq<span class="x">X</span></span>
      <span class="sub">Design · Vastu · Estimate · Build</span>
    </span>
  </div>
  <h1>${escapeXml(project.name)}</h1>
  <p>${escapeXml(project.brief.description || "Concept-stage architectural plan, area schedule, Vastu advisory and preliminary construction estimate derived from the canonical parametric model.")}</p>
  <div class="meta">
    <span>Project type<strong>${escapeXml(PROJECT_TYPE_LABELS[project.type])}</strong></span>
    <span>Location<strong>${escapeXml(project.location.city)}, ${escapeXml(project.location.state)}</strong></span>
    <span>Revision<strong>R${project.revision}</strong></span>
    <span>Generated<strong>${escapeXml(generated.slice(0, 16).replace("T", " "))} UTC</strong></span>
    <span>Rate basis<strong>${escapeXml(estimate.rateBook.id)}</strong></span>
  </div>
</header>
<main>
  <section>
    <h2>Project metrics</h2>
    <div class="metrics">
      <div class="metric"><div class="label">Plot area</div><div class="value">${metrics.plotArea.toFixed(2)}<span class="unit">m²</span></div></div>
      <div class="metric"><div class="label">Buildable</div><div class="value">${metrics.buildableArea.toFixed(2)}<span class="unit">m²</span></div></div>
      <div class="metric"><div class="label">Built-up</div><div class="value">${metrics.totalBuiltUp.toFixed(2)}<span class="unit">m²</span></div></div>
      <div class="metric"><div class="label">Carpet</div><div class="value">${metrics.totalCarpet.toFixed(2)}<span class="unit">m²</span></div></div>
      <div class="metric"><div class="label">Coverage</div><div class="value">${(metrics.groundCoverageRatio * 100).toFixed(1)}<span class="unit">%</span></div></div>
      <div class="metric"><div class="label">FSI</div><div class="value">${metrics.fsi.toFixed(2)}<span class="unit">×</span></div></div>
    </div>
    <div class="grid4" style="margin-top:12px">
      <div class="stat"><div class="l">Plot in ft² / gaj</div><div class="v" style="font-size:14px">${escapeXml(formatArea(compliance.project.conversions.plot.sqm, "sqft"))} · ${escapeXml(formatArea(compliance.project.conversions.plot.sqm, "gaj"))}</div></div>
      <div class="stat"><div class="l">Built-up in ft² / gaj</div><div class="v" style="font-size:14px">${escapeXml(formatArea(compliance.project.conversions.builtUp.sqm, "sqft"))} · ${escapeXml(formatArea(compliance.project.conversions.builtUp.sqm, "gaj"))}</div></div>
      <div class="stat"><div class="l">Room / carpet in ft² / gaj</div><div class="v" style="font-size:14px">${escapeXml(formatArea(compliance.project.conversions.carpet.sqm, "sqft"))} · ${escapeXml(formatArea(compliance.project.conversions.carpet.sqm, "gaj"))}</div></div>
      <div class="stat"><div class="l">Wall / common share</div><div class="v" style="font-size:14px">${compliance.project.wallShare.toFixed(2)} m² · ${((compliance.project.wallShare / Math.max(1, compliance.project.totalBuiltUp)) * 100).toFixed(1)}%</div></div>
    </div>
    <div class="note"><strong>Area definitions.</strong> Room area is the exact shoelace area of the stored clear polygon. Built-up is the union of room polygons and wall footprints on a 10 cm deterministic raster (±1%). Carpet is the sum of clear room polygons. Plot, coverage, built-up and carpet are never conflated. Area compliance compares the room sum with the floor union and with built-up, and surfaces the wall/common share instead of hiding it.</div>
    <div class="callout" style="margin-top:12px">
      <span class="pill">${escapeXml(facade.template.name)}</span>
      <span class="pill">${escapeXml(facade.roof.replace(/_/g, " "))}</span>
      <strong>Façade.</strong> ${escapeXml(facade.wallFinish)} · ${escapeXml(facade.accentFinish)}. ${elevations.views.length} concept elevations are included later in this report.
    </div>
  </section>

  ${planSections}

  <section>
    <h2>Room area schedule</h2>
    <table>
      <thead><tr><th>Floor</th><th>Room</th><th>Type</th><th class="num">Area m²</th><th class="num">Perimeter m</th><th class="num">W × D</th><th class="num">Target</th><th class="num">Variance</th><th>Direction</th></tr></thead>
      <tbody>${scheduleRows || `<tr><td colspan="9" class="muted">No rooms yet. Generate a layout or draw a room.</td></tr>`}</tbody>
    </table>
  </section>

  <section>
    <h2>Area compliance &amp; reconciliation</h2>
    <div class="callout ${compliance.summary.status === "fail" ? "warn" : ""}">
      <strong>${escapeXml(compliance.summary.status.toUpperCase())}</strong> · ${compliance.summary.pass} pass · ${compliance.summary.warn} advisory · ${compliance.summary.fail} fail · ${compliance.summary.notAssessed} not assessed<br>
      ${escapeXml(compliance.summary.headline)}
    </div>
    <table style="margin-top:14px">
      <thead><tr><th>Floor</th><th class="num">Rooms</th><th class="num">Σ room clear area</th><th class="num">Room union m²</th><th class="num">Built-up</th><th class="num">Wall share</th><th>Status</th></tr></thead>
      <tbody>${complianceFloorRows}
        <tr><td><strong>Project</strong></td><td class="num">${compliance.project.rooms}</td><td class="num">${areaWithConversions(compliance.project.totalCarpet)}</td><td class="num">${compliance.project.totalCarpet.toFixed(2)}</td><td class="num">${areaWithConversions(compliance.project.totalBuiltUp)}</td><td class="num">${areaWithConversions(compliance.project.wallShare)}</td><td>${badge(compliance.summary.status)}</td></tr>
      </tbody>
    </table>
    <table style="margin-top:14px">
      <thead><tr><th>Check</th><th>Status</th><th class="num">Value</th><th>Limit</th><th>Result &amp; formula</th></tr></thead>
      <tbody>${complianceCheckRows}</tbody>
    </table>
    <div class="note">${escapeXml(compliance.method)}<br><br>${escapeXml(compliance.disclaimer)}</div>
  </section>

  <section>
    <h2>Front, rear and side elevations</h2>
    <p class="muted small">${escapeXml(elevations.facade.name)} · ${escapeXml(elevations.facade.wallFinish)} · ${escapeXml(elevations.facade.accentFinish)} · ${elevations.views.reduce((sum, view) => sum + view.openingCount, 0)} openings projected</p>
    <div class="elev-grid">${elevationCards}</div>
    <div class="note">${escapeXml(elevations.method)} Concept elevations are not construction elevations and do not replace architectural detailing.</div>
    <h3 style="margin-top:24px;font-size:15px;">Furniture layout</h3>
    ${furnitureRows ? `<table><thead><tr><th>Floor</th><th>Room</th><th>Item</th><th class="num">Footprint</th><th class="num">Rotation</th><th>Basis</th></tr></thead><tbody>${furnitureRows}</tbody></table>` : `<div class="note">No furniture has been placed. Furniture is a presentation layer and is excluded from room area, built-up, cost and Vastu.</div>`}
    ${amenityRows ? `<h3 style="margin-top:24px;font-size:15px;">Site &amp; landscape layer</h3>
    <table><thead><tr><th>Amenity</th><th>Level</th><th class="num">Area</th><th class="num">Footprint</th><th>Notes</th></tr></thead><tbody>${amenityRows}</tbody></table>
    <div class="note">Amenities are excluded from built-up, carpet and room schedules. Pool/deck structures, retaining and waterproofing still require engineering.</div>` : `<div class="note">No site amenities are placed. Landscape templates (garden, courtyard, lap pool, deck, pergola, driveway, roof terrace) can be added from the design studio.</div>`}
  </section>

  <section>
    <h2>Room-wise and floor-wise cost</h2>
    <p class="muted small">${escapeXml(cost.rateBookId)} · ${escapeXml(cost.package)} package · ${cost.rooms.length} rooms · total ${escapeXml(formatINR(cost.project.estimateTotal))}</p>
    <div class="grid4">
      <div class="stat"><div class="l">Estimate total</div><div class="v">${escapeXml(formatINR(cost.project.estimateTotal))}</div></div>
      <div class="stat"><div class="l">Measured room lines</div><div class="v">${escapeXml(formatINR(cost.project.directFinishTotal))}</div></div>
      <div class="stat"><div class="l">Allocated shared</div><div class="v">${escapeXml(formatINR(cost.project.allocatedSharedTotal))}</div></div>
      <div class="stat"><div class="l">Per built-up m²</div><div class="v">${escapeXml(formatINR(cost.project.perSqm))}</div></div>
    </div>
    <h3 style="margin-top:24px;font-size:15px;">Floor roll-up</h3>
    <table>
      <thead><tr><th>Floor</th><th class="num">Room area</th><th class="num">Built-up m²</th><th class="num">Direct</th><th class="num">Shared</th><th class="num">Total</th><th class="num">Per m²</th></tr></thead>
      <tbody>${costFloorRows}
        <tr><td><strong>Project</strong></td><td class="num">${areaWithConversions(cost.project.builtUpArea)}</td><td class="num">${cost.project.builtUpArea.toFixed(2)}</td><td class="num">${escapeXml(formatINR(cost.project.directFinishTotal))}</td><td class="num">${escapeXml(formatINR(cost.project.allocatedSharedTotal))}</td><td class="num"><strong>${escapeXml(formatINR(cost.project.estimateTotal))}</strong></td><td class="num">${escapeXml(formatINR(cost.project.perSqm))}</td></tr>
      </tbody>
    </table>
    <h3 style="margin-top:24px;font-size:15px;">Room allocation</h3>
    <table>
      <thead><tr><th>Floor</th><th>Room</th><th class="num">Area</th><th class="num">Doors / windows</th><th class="num">Direct</th><th class="num">Shared</th><th class="num">Total</th><th class="num">Per m²</th></tr></thead>
      <tbody>${costRoomRows}</tbody>
    </table>
    <h3 style="margin-top:24px;font-size:15px;">Measured room material, finish and service lines</h3>
    <table>
      <thead><tr><th>Floor · room</th><th>Line &amp; formula</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th>Confidence</th></tr></thead>
      <tbody>${costLineRows}</tbody>
    </table>
    <div class="note">${escapeXml(cost.allocation.method)} ${escapeXml(cost.allocation.sharedCostBasis)} ${escapeXml(cost.allocation.reconciliation)} ${escapeXml(cost.disclaimer)}</div>
  </section>

  <section>
    <h2>Construction material estimate</h2>
    <p class="muted small">Measured takeoff converted to planning quantities. Cement is 50 kg bags; m³ and ft³ conversions are shown for volume.</p>
    <div class="grid4">
      <div class="stat"><div class="l">Brickwork volume</div><div class="v" style="font-size:15px">${materialPack.measured.brickworkM3.toFixed(2)} m³</div><div class="muted small">${escapeXml(formatVolume(materialPack.measured.brickworkM3, "cft"))}</div></div>
      <div class="stat"><div class="l">RCC volume</div><div class="v" style="font-size:15px">${materialPack.measured.concreteM3.toFixed(2)} m³</div><div class="muted small">${escapeXml(formatVolume(materialPack.measured.concreteM3, "cft"))}</div></div>
      <div class="stat"><div class="l">Plaster area</div><div class="v" style="font-size:15px">${materialPack.measured.plasterM2.toFixed(2)} m²</div><div class="muted small">${escapeXml(formatArea(materialPack.measured.plasterM2, "sqft"))}</div></div>
      <div class="stat"><div class="l">Steel benchmark</div><div class="v" style="font-size:15px">${materialPack.measured.steelKg.toLocaleString("en-IN")} kg</div><div class="muted small">requires BBS</div></div>
    </div>
    <table style="margin-top:14px">
      <thead><tr><th>Material</th><th class="num">Quantity</th><th>Basis</th></tr></thead>
      <tbody>${materialPackRows}</tbody>
    </table>
    <div class="note">${materialPack.notes.map((note) => escapeXml(note)).join(" ")}</div>
  </section>

  <section>
    <h2>Vastu advisory</h2>
    <p class="muted small">${escapeXml(vastu.profile.name)} · ${escapeXml(vastu.profile.version)} · ${vastu.summary.pass} pass · ${vastu.summary.advisory} advisory · ${vastu.summary.fail} attention · ${vastu.summary.not_assessed} not assessed</p>
    <table>
      <thead><tr><th>Space</th><th>Rule</th><th>Status</th><th>Explanation &amp; source</th></tr></thead>
      <tbody>${vastuRows}</tbody>
    </table>
    <div class="note">${escapeXml(vastu.disclaimer)}</div>
  </section>

  <section>
    <h2>Jurisdiction checks</h2>
    <p class="muted small">${escapeXml(rules.pack.name)} · effective ${escapeXml(rules.pack.effectiveDate)} · ${rules.summary.pass} pass · ${rules.summary.fail} fail · ${rules.summary.not_assessed} not assessed</p>
    <table>
      <thead><tr><th>Rule</th><th>Status</th><th>Value</th><th>Formula / note</th></tr></thead>
      <tbody>${ruleRows}</tbody>
    </table>
    <div class="note">${escapeXml(rules.disclaimer)}</div>
  </section>

  <section>
    <h2>Preliminary estimate</h2>
    <p class="muted small">${escapeXml(estimate.rateBook.name)} · ${escapeXml(estimate.package)} package · ${escapeXml(estimate.rateBook.source)} · valid ${escapeXml(estimate.rateBook.validFrom)} to ${escapeXml(estimate.rateBook.validTo)}</p>
    <table>
      <thead><tr><th>Package</th><th>Description &amp; formula</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th>Basis</th></tr></thead>
      <tbody>${materialRows}</tbody>
    </table>
    <h3 style="margin-top:26px;font-size:15px;">Labour</h3>
    <table>
      <thead><tr><th>Trade</th><th class="num">Days</th><th class="num">Wage/day</th><th class="num">Amount</th><th>Basis</th></tr></thead>
      <tbody>${labourRows}</tbody>
    </table>
    <div class="totals">
      <div><span>Materials</span><span>${escapeXml(formatINR(estimate.totals.materials))}</span></div>
      <div><span>Labour</span><span>${escapeXml(formatINR(estimate.totals.labour))}</span></div>
      <div><span>Equipment (2%)</span><span>${escapeXml(formatINR(estimate.totals.equipment))}</span></div>
      <div><span>Overheads (6%)</span><span>${escapeXml(formatINR(estimate.totals.overheads))}</span></div>
      <div><span>Margin (8%)</span><span>${escapeXml(formatINR(estimate.totals.margin))}</span></div>
      <div><span>GST (18%)</span><span>${escapeXml(formatINR(estimate.totals.gst))}</span></div>
      <div><span>Contingency (5%)</span><span>${escapeXml(formatINR(estimate.totals.contingency))}</span></div>
      <div class="total"><span>Indicative total</span><span>${escapeXml(formatINR(estimate.totals.total))}</span></div>
      <div><span>Planning band</span><span>${escapeXml(formatINR(estimate.totals.bandLow))} – ${escapeXml(formatINR(estimate.totals.bandHigh))}</span></div>
      <div><span>Per m² built-up</span><span>${escapeXml(formatINR(estimate.totals.perSqm))}</span></div>
    </div>
    <div class="note">${escapeXml(estimate.disclaimer)}</div>
  </section>

  <section>
    <h2>Assumptions, exclusions &amp; missing inputs</h2>
    <div class="cols">
      <div>
        <h3 style="font-size:14px;">Assumptions</h3>
        <ul class="list">${estimate.assumptions.map((a) => `<li>${escapeXml(a)}</li>`).join("")}</ul>
        <h3 style="font-size:14px;margin-top:20px;">Included</h3>
        <ul class="list">${estimate.inclusions.map((a) => `<li>${escapeXml(a)}</li>`).join("")}</ul>
      </div>
      <div>
        <h3 style="font-size:14px;">Excluded</h3>
        <ul class="list">${estimate.exclusions.map((a) => `<li>${escapeXml(a)}</li>`).join("")}</ul>
        <h3 style="font-size:14px;margin-top:20px;">Missing inputs</h3>
        <ul class="list">${estimate.missingInputs.map((a) => `<li>${escapeXml(a)}</li>`).join("")}</ul>
      </div>
    </div>
  </section>
</main>
<footer class="doc">
  <span>VastiqX · agentic architecture workspace · project ${escapeXml(project.id)} · revision R${project.revision}</span>
  <span>Concept-stage planning only. Not for construction, statutory submission or certification.</span>
</footer>
</div>
</body>
</html>`;
}
