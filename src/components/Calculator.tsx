"use client";

import { useMemo, useState } from "react";
import { WORK_PRESETS, calculateMaterials, type WorkType } from "@/domain/calculator";
import {
  AREA_UNITS,
  LENGTH_UNITS,
  UNIT_REFERENCE,
  VOLUME_UNITS,
  convertArea,
  convertVolume,
  formatArea,
  formatVolume,
  lengthToM,
  type AreaUnit,
  type LengthUnit,
  type VolumeUnit,
} from "@/domain/units";
import type { ProjectView } from "@/server/derive";
import { money } from "./format";

type Dimension = "area" | "volume" | "length";

export function Calculator({ view }: { view: ProjectView }) {
  const [tab, setTab] = useState<"units" | "materials">("units");
  const [dimension, setDimension] = useState<Dimension>("area");
  const [value, setValue] = useState("100");
  const [areaFrom, setAreaFrom] = useState<AreaUnit>("sqm");
  const [areaTo, setAreaTo] = useState<AreaUnit>("sqft");
  const [volumeFrom, setVolumeFrom] = useState<VolumeUnit>("cum");
  const [volumeTo, setVolumeTo] = useState<VolumeUnit>("cft");
  const [lengthFrom, setLengthFrom] = useState<LengthUnit>("m");
  const [lengthTo, setLengthTo] = useState<LengthUnit>("ft");
  const [work, setWork] = useState<WorkType>("brickwork_230");
  const [quantity, setQuantity] = useState("10");

  const numeric = Number(value) || 0;
  const preset = WORK_PRESETS.find((p) => p.id === work)!;
  const materialResult = useMemo(() => calculateMaterials(work, Math.max(0, Number(quantity) || 0)), [work, quantity]);

  const unitResult = useMemo(() => {
    if (dimension === "area") {
      const output = AREA_UNITS.map((unit) => ({ label: unit.symbol, value: formatArea(1, unit.id, 4).replace("1 ", "") , raw: convertArea(1, "sqm", unit.id) }));
      return {
        primary: `${convertArea(numeric, areaFrom, areaTo).toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${AREA_UNITS.find((u) => u.id === areaTo)?.symbol}`,
        fromLabel: AREA_UNITS.find((u) => u.id === areaFrom)?.label ?? "",
        toLabel: AREA_UNITS.find((u) => u.id === areaTo)?.label ?? "",
        all: [
          { label: "m²", value: convertArea(numeric, areaFrom, "sqm") },
          { label: "ft²", value: convertArea(numeric, areaFrom, "sqft") },
          { label: "gaj", value: convertArea(numeric, areaFrom, "gaj") },
          { label: "yd²", value: convertArea(numeric, areaFrom, "sqyd") },
          { label: "acre", value: convertArea(numeric, areaFrom, "acre") },
          { label: "ha", value: convertArea(numeric, areaFrom, "hectare") },
        ],
        note: "1 gaj = 1 square yard = 0.836127 m² = 9 ft²",
        scale: output,
      };
    }
    if (dimension === "volume") {
      return {
        primary: `${convertVolume(numeric, volumeFrom, volumeTo).toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${VOLUME_UNITS.find((u) => u.id === volumeTo)?.symbol}`,
        fromLabel: VOLUME_UNITS.find((u) => u.id === volumeFrom)?.label ?? "",
        toLabel: VOLUME_UNITS.find((u) => u.id === volumeTo)?.label ?? "",
        all: [
          { label: "m³", value: convertVolume(numeric, volumeFrom, "cum") },
          { label: "ft³", value: convertVolume(numeric, volumeFrom, "cft") },
          { label: "L", value: convertVolume(numeric, volumeFrom, "litre") },
        ],
        note: "1 m³ = 35.3147 ft³ = 1,000 litres",
        scale: [],
      };
    }
    const metres = lengthToM(numeric, lengthFrom);
    return {
      primary: `${(metres / (LENGTH_UNITS.find((u) => u.id === lengthTo)?.toM ?? 1)).toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${LENGTH_UNITS.find((u) => u.id === lengthTo)?.symbol}`,
      fromLabel: LENGTH_UNITS.find((u) => u.id === lengthFrom)?.label ?? "",
      toLabel: LENGTH_UNITS.find((u) => u.id === lengthTo)?.label ?? "",
      all: LENGTH_UNITS.map((unit) => ({ label: unit.symbol, value: metres / unit.toM })),
      note: "Canonical project geometry is always stored in metres.",
      scale: [],
    };
  }, [dimension, numeric, areaFrom, areaTo, volumeFrom, volumeTo, lengthFrom, lengthTo]);

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        <div>
          <h3>Units & construction calculator</h3>
          <p>Metric canonical · gaj and ft² display · m³/ft³ material quantities</p>
        </div>
        <div className="calc-tabs">
          <button className={`calc-tab ${tab === "units" ? "active" : ""}`} onClick={() => setTab("units")}>Unit converter</button>
          <button className={`calc-tab ${tab === "materials" ? "active" : ""}`} onClick={() => setTab("materials")}>Materials</button>
        </div>
      </div>

      {tab === "units" ? (
        <div className="cards-2">
          <div className="stat-card">
            <div className="calc-tabs">
              {(["area", "volume", "length"] as Dimension[]).map((item) => (
                <button key={item} className={`calc-tab ${dimension === item ? "active" : ""}`} onClick={() => setDimension(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="calc-row">
              <div className="field">
                <label htmlFor="unit-value">Value</label>
                <input id="unit-value" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
              </div>
              <div className="tiny muted" style={{ paddingBottom: 8 }}>in</div>
              <div className="field">
                <label htmlFor="unit-from">From</label>
                {dimension === "area" && (
                  <select id="unit-from" value={areaFrom} onChange={(event) => setAreaFrom(event.target.value as AreaUnit)}>
                    {AREA_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                )}
                {dimension === "volume" && (
                  <select id="unit-from" value={volumeFrom} onChange={(event) => setVolumeFrom(event.target.value as VolumeUnit)}>
                    {VOLUME_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                )}
                {dimension === "length" && (
                  <select id="unit-from" value={lengthFrom} onChange={(event) => setLengthFrom(event.target.value as LengthUnit)}>
                    {LENGTH_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="calc-row" style={{ marginTop: 6 }}>
              <div className="field">
                <label>Result</label>
                <div style={{ border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", background: "var(--paper-3)", fontSize: 12 }}>
                  {numeric ? unitResult.primary : "—"}
                </div>
              </div>
              <div className="tiny muted" style={{ paddingBottom: 8 }}>to</div>
              <div className="field">
                <label htmlFor="unit-to">Unit</label>
                {dimension === "area" && (
                  <select id="unit-to" value={areaTo} onChange={(event) => setAreaTo(event.target.value as AreaUnit)}>
                    {AREA_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                )}
                {dimension === "volume" && (
                  <select id="unit-to" value={volumeTo} onChange={(event) => setVolumeTo(event.target.value as VolumeUnit)}>
                    {VOLUME_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                )}
                {dimension === "length" && (
                  <select id="unit-to" value={lengthTo} onChange={(event) => setLengthTo(event.target.value as LengthUnit)}>
                    {LENGTH_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="calc-result">
              <div className="tiny muted">{numeric.toLocaleString("en-IN")} {unitResult.fromLabel} =</div>
              <div className="big">{numeric ? unitResult.primary : "—"}</div>
              <div className="calc-output">
                {numeric > 0 && unitResult.all.map((item) => (
                  <span key={item.label}>{item.label} {item.value.toLocaleString("en-IN", { maximumFractionDigits: 4 })}</span>
                ))}
              </div>
              <div className="tiny muted" style={{ marginTop: 8 }}>{unitResult.note}</div>
            </div>
          </div>

          <div>
            <div className="stat-card">
              <div className="l">Reference</div>
              <div style={{ marginTop: 6 }}>
                {UNIT_REFERENCE.map((row) => (
                  <div className="kv" key={row.label}><span>{row.label}</span><b>{row.value}</b></div>
                ))}
              </div>
            </div>
            <div className="stat-card" style={{ marginTop: 10 }}>
              <div className="l">Project area conversions</div>
              <div style={{ marginTop: 6 }}>
                <div className="kv"><span>Plot</span><b>{formatArea(view.metrics.plotArea, "sqm")} · {formatArea(view.metrics.plotArea, "sqft")} · {formatArea(view.metrics.plotArea, "gaj")}</b></div>
                <div className="kv"><span>Built-up</span><b>{formatArea(view.metrics.totalBuiltUp, "sqm")} · {formatArea(view.metrics.totalBuiltUp, "sqft")} · {formatArea(view.metrics.totalBuiltUp, "gaj")}</b></div>
                <div className="kv"><span>Carpet</span><b>{formatArea(view.metrics.totalCarpet, "sqm")} · {formatArea(view.metrics.totalCarpet, "sqft")} · {formatArea(view.metrics.totalCarpet, "gaj")}</b></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="cards-2">
            <div className="stat-card">
              <div className="l">Work preset</div>
              <div className="field" style={{ marginTop: 6 }}>
                <select value={work} onChange={(event) => setWork(event.target.value as WorkType)}>
                  {WORK_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="calc-quantity">Measured quantity ({preset.inputUnit})</label>
                <input id="calc-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </div>
              <div className="tiny muted">{preset.description}</div>
              <div className="tiny muted" style={{ marginTop: 6 }}><b>Formula:</b> {preset.formula}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}><b>Labour:</b> {preset.labour}</div>
            </div>
            <div className="stat-card">
              <div className="l">Material result</div>
              <div className="material-list">
                {materialResult.materials.map((material) => (
                  <div key={material.name}>
                    <span>{material.name}</span>
                    <b>{material.quantity.toLocaleString("en-IN")} {material.unit}</b>
                  </div>
                ))}
              </div>
              <div className="tiny muted" style={{ marginTop: 8 }}>{materialResult.note}</div>
            </div>
          </div>
          {preset.inputUnit === "m³" && (
            <div className="note" style={{ marginTop: 10 }}>
              {Number(quantity).toLocaleString("en-IN")} m³ = {formatVolume(Number(quantity), "cft")} ={" "}
              {formatVolume(Number(quantity), "litre")} of finished work volume.
            </div>
          )}
          <div className="section-title">
            <h3>Project material pack</h3>
            <p>from measured takeoff</p>
          </div>
          <table className="data-table">
            <thead><tr><th>Material</th><th className="num">Quantity</th><th>Unit</th><th>Basis</th></tr></thead>
            <tbody>
              {view.materialPack.items.map((item) => (
                <tr key={`${item.name}-${item.unit}`}>
                  <td><b>{item.name}</b></td>
                  <td className="num">{item.quantity.toLocaleString("en-IN")}</td>
                  <td>{item.unit}</td>
                  <td className="tiny muted">{item.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cards-4" style={{ marginTop: 10 }}>
            <div className="stat-card"><div className="l">Brickwork</div><div className="v" style={{ fontSize: 17 }}>{view.materialPack.measured.brickworkM3.toFixed(2)} m³</div><div className="s">{formatVolume(view.materialPack.measured.brickworkM3, "cft")}</div></div>
            <div className="stat-card"><div className="l">RCC</div><div className="v" style={{ fontSize: 17 }}>{view.materialPack.measured.concreteM3.toFixed(2)} m³</div><div className="s">{formatVolume(view.materialPack.measured.concreteM3, "cft")}</div></div>
            <div className="stat-card"><div className="l">Steel benchmark</div><div className="v" style={{ fontSize: 17 }}>{view.materialPack.measured.steelKg.toLocaleString("en-IN")} kg</div><div className="s">requires BBS</div></div>
            <div className="stat-card"><div className="l">Estimated material value</div><div className="v" style={{ fontSize: 17 }}>{money(view.estimate.totals.materials)}</div><div className="s">rate book</div></div>
          </div>
          <div className="note warn" style={{ marginTop: 10 }}>
            {view.materialPack.notes.join(" ")}
          </div>
        </>
      )}
    </div>
  );
}
