"use client";

import { useState } from "react";
import type { ProjectView } from "@/server/derive";
import type { AreaUnit } from "@/domain/units";
import { formatArea } from "@/domain/units";
import { areaTriplet, compactMoney, money, pct } from "./format";

interface CostPanelProps {
  view: ProjectView;
  areaUnit: AreaUnit;
  busyTool: string | null;
  onTool: (tool: string, args?: Record<string, unknown>) => Promise<unknown>;
  onUnitChange: (unit: AreaUnit) => void;
}

export function CostPanel({ view, areaUnit, busyTool, onTool, onUnitChange }: CostPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const breakdown = view.breakdown;
  const estimate = view.estimate;

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        <div>
          <h3>Room-wise, floor-wise and project cost</h3>
          <p>{estimate.package} package · {estimate.rateBook.name} · revision {estimate.revision}</p>
        </div>
        <div className="template-row">
          <button className="btn btn-xs" onClick={() => onTool("get_cost_breakdown")}>Recalculate</button>
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("export_cost_csv")}>Cost CSV</button>
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("export_pdf")}>PDF</button>
          <button className="btn btn-xs btn-primary" disabled={!!busyTool} onClick={() => onTool("generate_project_report")}>Full report</button>
        </div>
      </div>

      <div className="cards-4">
        <div className="stat-card ok">
          <div className="l">Indicative total</div>
          <div className="v">{compactMoney(breakdown.project.estimateTotal)}</div>
          <div className="s">{money(breakdown.project.estimateTotal)} · incl. GST</div>
        </div>
        <div className="stat-card info">
          <div className="l">Rate per built-up m²</div>
          <div className="v">{money(breakdown.project.perSqm)}</div>
          <div className="s">{formatArea(1, areaUnit)} basis · {breakdown.project.builtUpArea.toFixed(1)} m²</div>
        </div>
        <div className="stat-card">
          <div className="l">Measured room lines</div>
          <div className="v">{compactMoney(breakdown.project.directFinishTotal)}</div>
          <div className="s">Finishes, openings, services</div>
        </div>
        <div className="stat-card warn">
          <div className="l">Allocated shared</div>
          <div className="v">{compactMoney(breakdown.project.allocatedSharedTotal)}</div>
          <div className="s">By clear room area</div>
        </div>
      </div>

      <div className="section-title">
        <h3>Estimate composition</h3>
        <div className="pill-group">
          <button className={areaUnit === "sqm" ? "active" : ""} onClick={() => onUnitChange("sqm")}>m²</button>
          <button className={areaUnit === "sqft" ? "active" : ""} onClick={() => onUnitChange("sqft")}>ft²</button>
          <button className={areaUnit === "gaj" ? "active" : ""} onClick={() => onUnitChange("gaj")}>gaj</button>
        </div>
      </div>
      <div className="cards-3">
        <div className="stat-card"><div className="l">Materials</div><div className="v" style={{ fontSize: 18 }}>{compactMoney(estimate.totals.materials)}</div></div>
        <div className="stat-card"><div className="l">Labour</div><div className="v" style={{ fontSize: 18 }}>{compactMoney(estimate.totals.labour)}</div></div>
        <div className="stat-card"><div className="l">Equipment</div><div className="v" style={{ fontSize: 18 }}>{compactMoney(estimate.totals.equipment)}</div></div>
        <div className="stat-card"><div className="l">Overheads</div><div className="v" style={{ fontSize: 18 }}>{compactMoney(estimate.totals.overheads)}</div></div>
        <div className="stat-card"><div className="l">Margin</div><div className="v" style={{ fontSize: 18 }}>{compactMoney(estimate.totals.margin)}</div></div>
        <div className="stat-card"><div className="l">GST + contingency</div><div className="v" style={{ fontSize: 18 }}>{compactMoney(estimate.totals.gst + estimate.totals.contingency)}</div></div>
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        Planning band {compactMoney(estimate.totals.bandLow)} – {compactMoney(estimate.totals.bandHigh)}. The authoritative total is the
        estimate; room totals are an allocation view and reconcile to it. {breakdown.allocation.reconciliation}
      </div>

      <div className="section-title">
        <h3>Floor roll-up</h3>
        <p>direct + allocated shared = total</p>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Floor</th>
            <th className="num">Room area</th>
            <th className="num">Built-up</th>
            <th className="num">Direct</th>
            <th className="num">Shared</th>
            <th className="num">Total</th>
            <th className="num">Per built-up m²</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.floors.map((floor) => (
            <tr key={floor.floorId}>
              <td><b>{floor.name}</b></td>
              <td className="num">{formatArea(floor.area, areaUnit)}</td>
              <td className="num">{formatArea(floor.builtUpArea, areaUnit)}</td>
              <td className="num">{money(floor.directTotal)}</td>
              <td className="num">{money(floor.allocatedShared)}</td>
              <td className="num"><b>{money(floor.total)}</b></td>
              <td className="num">{money(floor.perSqm)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td>Project</td>
            <td className="num">{formatArea(breakdown.project.builtUpArea, areaUnit)}</td>
            <td className="num">{formatArea(breakdown.project.builtUpArea, areaUnit)}</td>
            <td className="num">{money(breakdown.project.directFinishTotal)}</td>
            <td className="num">{money(breakdown.project.allocatedSharedTotal)}</td>
            <td className="num">{money(breakdown.project.estimateTotal)}</td>
            <td className="num">{money(breakdown.project.perSqm)}</td>
          </tr>
        </tbody>
      </table>

      <div className="section-title">
        <h3>Room allocation</h3>
        <p>click a row for measured lines</p>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Floor / room</th>
            <th className="num">Area</th>
            <th className="num">Doors</th>
            <th className="num">Windows</th>
            <th className="num">Direct</th>
            <th className="num">Shared</th>
            <th className="num">Total</th>
            <th className="num">/ m²</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.rooms.map((room) => {
            const open = expanded === room.roomId;
            return (
              <FragmentRows
                key={room.roomId}
                open={open}
                onToggle={() => setExpanded(open ? null : room.roomId)}
                room={room}
                areaUnit={areaUnit}
              />
            );
          })}
        </tbody>
      </table>

      <div className="section-title">
        <h3>What is counted</h3>
      </div>
      <div className="cards-2">
        <div className="stat-card">
          <div className="l">Included</div>
          <ul style={{ paddingLeft: 16, marginTop: 6, fontSize: 11, lineHeight: 1.7 }}>
            {estimate.inclusions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="stat-card">
          <div className="l">Excluded / missing</div>
          <ul style={{ paddingLeft: 16, marginTop: 6, fontSize: 11, lineHeight: 1.7 }}>
            {estimate.exclusions.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
            {estimate.missingInputs.map((item) => <li key={item} style={{ color: "var(--red)" }}>{item}</li>)}
          </ul>
        </div>
      </div>
      <div className="note warn" style={{ marginTop: 10 }}>
        {breakdown.disclaimer}
      </div>
    </div>
  );
}

interface RoomRow {
  roomId: string;
  room: string;
  roomType: string;
  floor: string;
  area: number;
  doors: number;
  windows: number;
  directTotal: number;
  allocatedShared: number;
  total: number;
  perSqm: number;
  lines: { description: string; quantity: number; unit: string; rate: number; amount: number; formula: string; confidence: string }[];
}

function FragmentRows({
  room,
  open,
  onToggle,
  areaUnit,
}: {
  room: RoomRow;
  open: boolean;
  onToggle: () => void;
  areaUnit: AreaUnit;
}) {
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td>
          <span className="tiny muted">{room.floor} · </span>
          <b>{room.room}</b>
          <span className="tiny muted"> · {room.roomType.replace(/_/g, " ")}</span>
        </td>
        <td className="num">{formatArea(room.area, areaUnit)}</td>
        <td className="num">{room.doors}</td>
        <td className="num">{room.windows}</td>
        <td className="num">{money(room.directTotal)}</td>
        <td className="num">{money(room.allocatedShared)}</td>
        <td className="num"><b>{money(room.total)}</b></td>
        <td className="num">{money(room.perSqm)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} style={{ background: "#fffdf7" }}>
            <div className="tiny muted" style={{ marginBottom: 5 }}>
              {room.area.toFixed(2)} m² carpet · {pct((room.allocatedShared / Math.max(1, room.total)) * 100)} allocated shared ·{" "}
              {areaTriplet(room.area)}
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="num">Qty</th>
                  <th>Unit</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                  <th>Formula / confidence</th>
                </tr>
              </thead>
              <tbody>
                {room.lines.map((line) => (
                  <tr key={`${room.roomId}-${line.description}`}>
                    <td>{line.description}</td>
                    <td className="num">{line.quantity}</td>
                    <td>{line.unit}</td>
                    <td className="num">{money(line.rate)}</td>
                    <td className="num">{money(line.amount)}</td>
                    <td className="tiny muted">
                      {line.formula}
                      <div className="formula">{line.confidence}</div>
                    </td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Direct subtotal</td>
                  <td colSpan={3} />
                  <td className="num">{money(room.directTotal)}</td>
                  <td className="tiny muted">Direct room lines only</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
