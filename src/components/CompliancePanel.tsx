"use client";

import type { ProjectView } from "@/server/derive";
import type { AreaUnit } from "@/domain/units";
import { formatArea } from "@/domain/units";
import { areaTriplet, pct } from "./format";
import { Calculator } from "./Calculator";

interface CompliancePanelProps {
  view: ProjectView;
  areaUnit: AreaUnit;
  onUnitChange: (unit: AreaUnit) => void;
  onTool: (tool: string, args?: Record<string, unknown>) => Promise<unknown>;
  busyTool: string | null;
}

function statusBadge(status: string) {
  return <span className={`badge ${status}`}>{status.replace(/_/g, " ")}</span>;
}

export function CompliancePanel({ view, areaUnit, onUnitChange, onTool, busyTool }: CompliancePanelProps) {
  const compliance = view.compliance;
  const project = compliance.project;

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        <div>
          <h3>Area compliance & material calculator</h3>
          <p>Σ room clear areas ↔ floor union ↔ built-up · revision {compliance.revision}</p>
        </div>
        <div className="template-row">
          <div className="pill-group">
            <button className={areaUnit === "sqm" ? "active" : ""} onClick={() => onUnitChange("sqm")}>m²</button>
            <button className={areaUnit === "sqft" ? "active" : ""} onClick={() => onUnitChange("sqft")}>ft²</button>
            <button className={areaUnit === "gaj" ? "active" : ""} onClick={() => onUnitChange("gaj")}>gaj</button>
          </div>
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("get_area_compliance")}>Re-run check</button>
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("get_material_pack")}>Material pack</button>
        </div>
      </div>

      <div className={`note ${compliance.summary.status === "fail" ? "warn" : ""}`} style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          {statusBadge(compliance.summary.status)}
          <b>{compliance.summary.pass} pass · {compliance.summary.warn} advisory · {compliance.summary.fail} fail · {compliance.summary.notAssessed} not assessed</b>
        </div>
        {compliance.summary.headline}
      </div>

      <div className="cards-4">
        <div className="stat-card">
          <div className="l">Plot area</div>
          <div className="v">{formatArea(project.plotArea, areaUnit)}</div>
          <div className="s">{areaTriplet(project.plotArea)}</div>
        </div>
        <div className="stat-card ok">
          <div className="l">Room / carpet area</div>
          <div className="v">{formatArea(project.totalCarpet, areaUnit)}</div>
          <div className="s">{areaTriplet(project.totalCarpet)}</div>
        </div>
        <div className="stat-card info">
          <div className="l">Built-up area</div>
          <div className="v">{formatArea(project.totalBuiltUp, areaUnit)}</div>
          <div className="s">{areaTriplet(project.totalBuiltUp)}</div>
        </div>
        <div className="stat-card warn">
          <div className="l">Wall / common share</div>
          <div className="v">{formatArea(project.wallShare, areaUnit)}</div>
          <div className="s">{pct((project.wallShare / Math.max(1, project.totalBuiltUp)) * 100)} of built-up · FSI {project.fsi}</div>
        </div>
      </div>

      <div className="section-title">
        <h3>Floor reconciliation</h3>
        <p>room sum, union, built-up and the visible gap</p>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Floor</th>
            <th className="num">Rooms</th>
            <th className="num">Σ rooms</th>
            <th className="num">Union</th>
            <th className="num">Built-up</th>
            <th className="num">Wall share</th>
            <th className="num">Union gap</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {compliance.floors.map((floor) => (
            <tr key={floor.floorId}>
              <td><b>{floor.name}</b></td>
              <td className="num">{floor.roomCount}</td>
              <td className="num">{formatArea(floor.carpetArea, areaUnit)}</td>
              <td className="num">{formatArea(floor.roomUnionArea, areaUnit)}</td>
              <td className="num">{formatArea(floor.builtUpArea, areaUnit)}</td>
              <td className="num">{formatArea(floor.wallAndCommonShare, areaUnit)}</td>
              <td className="num">{floor.roomUnionVariance.toFixed(2)} m²</td>
              <td>{statusBadge(floor.status)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>Project</td>
            <td className="num">{project.rooms}</td>
            <td className="num">{formatArea(project.totalCarpet, areaUnit)}</td>
            <td className="num">{formatArea(project.totalCarpet, areaUnit)}</td>
            <td className="num">{formatArea(project.totalBuiltUp, areaUnit)}</td>
            <td className="num">{formatArea(project.wallShare, areaUnit)}</td>
            <td className="num">—</td>
            <td>{statusBadge(compliance.summary.status)}</td>
          </tr>
        </tbody>
      </table>

      <div className="section-title">
        <h3>Project checks</h3>
        <p>{project.checks.length} deterministic checks</p>
      </div>
      <table className="data-table">
        <thead><tr><th>Check</th><th>Status</th><th className="num">Value</th><th>Limit</th><th>Formula & result</th></tr></thead>
        <tbody>
          {project.checks.map((check) => (
            <tr key={check.id}>
              <td><b>{check.title}</b><div className="tiny muted">{check.note}</div></td>
              <td>{statusBadge(check.status)}</td>
              <td className="num">{check.value.toLocaleString("en-IN")} {check.valueUnit}</td>
              <td className="tiny muted">{check.limit}</td>
              <td className="tiny muted">{check.formula}<div className="formula">variance {check.variance} {check.varianceUnit}</div></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-title">
        <h3>Floor checks</h3>
        <p>room polygons, walls and openings</p>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {compliance.floors.map((floor) => (
          <div className="stat-card" key={floor.floorId}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
              <b>{floor.name}</b>
              <div className="template-row">{statusBadge(floor.status)}<span className="tiny muted">{pct(floor.builtUpGapPct)} wall share</span></div>
            </div>
            <table className="data-table">
              <thead><tr><th>Check</th><th>Status</th><th>Result</th><th>Formula</th></tr></thead>
              <tbody>
                {floor.checks.map((check) => (
                  <tr key={check.id}>
                    <td>{check.title}</td>
                    <td>{statusBadge(check.status)}</td>
                    <td className="tiny muted">{check.note}</td>
                    <td className="tiny muted">{check.formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="note" style={{ marginTop: 10 }}>
        <b>Method.</b> {compliance.method}
        <div style={{ marginTop: 5 }}><b>Disclaimer.</b> {compliance.disclaimer}</div>
      </div>

      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
      <Calculator view={view} />
    </div>
  );
}
