import { round } from "./geometry";
import type { TakeoffSummary } from "./boq";

export type WorkType =
  | "brickwork_230"
  | "brickwork_115"
  | "rcc_m20"
  | "rcc_m25"
  | "plaster_12_16"
  | "plaster_6_14"
  | "flooring_tiles"
  | "painting_2coat"
  | "pcc_m10";

export interface MaterialQuantity {
  name: string;
  quantity: number;
  unit: string;
  basis: string;
}

export interface WorkPreset {
  id: WorkType;
  label: string;
  inputUnit: "m³" | "m²";
  description: string;
  materials: MaterialQuantity[];
  labour: string;
  assumptions: string[];
  source: string;
  formula: string;
}

/**
 * Planning norms. These are commonly used Indian site allowances and are
 * deliberately documented as planning benchmarks, not a mix design or BBS.
 * Mortar dry volume factor 1.30; 1 bag cement = 50 kg; brick 190x90x90 mm with
 * 10 mm mortar joints assumed ~500 bricks/m³.
 */
export const WORK_PRESETS: WorkPreset[] = [
  {
    id: "brickwork_230",
    label: "Brickwork · 230 mm wall",
    inputUnit: "m³",
    description: "AAC/red brick masonry with 1:6 cement mortar",
    materials: [
      { name: "Bricks", quantity: 500, unit: "nos", basis: "500 nos per m³ of finished brickwork" },
      { name: "Cement", quantity: 1.23, unit: "bags", basis: "0.30 m³ wet mortar/m³ × 1.30 dry factor × 1/7 cement part" },
      { name: "Sand", quantity: 0.26, unit: "m³", basis: "Mortar sand = 0.30 m³ × 6/7" },
      { name: "Water", quantity: 60, unit: "L", basis: "Working allowance for mortar and curing" },
    ],
    labour: "Mason 0.65 day/m³ · helper 0.75 day/m³",
    assumptions: ["Brick 190 × 90 × 90 mm", "10 mm mortar joints", "1:6 cement mortar", "No reinforcement"],
    source: "Planning norm derived from common Indian site practice; verify with approved specification.",
    formula: "Material per m³ × measured brickwork volume",
  },
  {
    id: "brickwork_115",
    label: "Brickwork · 115 mm partition",
    inputUnit: "m³",
    description: "Half-brick partition with 1:4 cement mortar",
    materials: [
      { name: "Bricks", quantity: 500, unit: "nos", basis: "500 nos per m³ of finished brickwork" },
      { name: "Cement", quantity: 2.05, unit: "bags", basis: "0.30 m³ wet mortar × 1.30 × 1/5 cement part" },
      { name: "Sand", quantity: 0.31, unit: "m³", basis: "Mortar sand = 0.30 m³ × 4/5" },
      { name: "Water", quantity: 65, unit: "L", basis: "Working allowance" },
    ],
    labour: "Mason 0.75 day/m³ · helper 0.85 day/m³",
    assumptions: ["1:4 cement mortar", "No reinforcement", "Height ≤ 3.0 m without stiffeners"],
    source: "Planning norm; confirm with structural/architectural specification.",
    formula: "Material per m³ × measured partition volume",
  },
  {
    id: "rcc_m20",
    label: "RCC · M20 concrete",
    inputUnit: "m³",
    description: "Nominal mix M20 (1 : 1.5 : 3) with reinforcement benchmark",
    materials: [
      { name: "Cement", quantity: 6.4, unit: "bags", basis: "Nominal M20 planning norm" },
      { name: "Sand", quantity: 0.47, unit: "m³", basis: "Fine aggregate per m³ concrete" },
      { name: "Coarse aggregate", quantity: 0.88, unit: "m³", basis: "20 mm graded aggregate per m³ concrete" },
      { name: "Steel", quantity: 95, unit: "kg", basis: "BENCHMARK 95 kg/m³ until a BBS/structural design exists" },
      { name: "Water", quantity: 190, unit: "L", basis: "Planning water allowance; not a mix design" },
    ],
    labour: "Steel fixer 0.35 day/m³ · mason 0.5 day/m³ · helper 1.0 day/m³",
    assumptions: ["Nominal mix only", "Steel quantity is a benchmark", "Formwork and pumping excluded", "Requires structural design"],
    source: "Planning benchmark; not a concrete mix design or reinforcement schedule.",
    formula: "Material per m³ × measured RCC volume",
  },
  {
    id: "rcc_m25",
    label: "RCC · M25 concrete",
    inputUnit: "m³",
    description: "M25 concrete with reinforcement benchmark",
    materials: [
      { name: "Cement", quantity: 7.5, unit: "bags", basis: "M25 planning norm" },
      { name: "Sand", quantity: 0.45, unit: "m³", basis: "Fine aggregate per m³ concrete" },
      { name: "Coarse aggregate", quantity: 0.85, unit: "m³", basis: "20 mm graded aggregate per m³ concrete" },
      { name: "Steel", quantity: 110, unit: "kg", basis: "BENCHMARK 110 kg/m³ until a BBS/structural design exists" },
      { name: "Water", quantity: 185, unit: "L", basis: "Planning water allowance" },
    ],
    labour: "Steel fixer 0.4 day/m³ · mason 0.55 day/m³ · helper 1.1 day/m³",
    assumptions: ["Requires structural design", "Steel is a benchmark", "Formwork and pumping excluded"],
    source: "Planning benchmark; not a mix design.",
    formula: "Material per m³ × measured RCC volume",
  },
  {
    id: "plaster_12_16",
    label: "Plaster · 12 mm (1:6)",
    inputUnit: "m²",
    description: "Internal cement plaster 12 mm thick, 1:6 mix",
    materials: [
      { name: "Cement", quantity: 0.064, unit: "bags", basis: "0.012 m³ × 1.30 dry factor × 1/7 × 1440 kg/m³ ÷ 50 kg" },
      { name: "Sand", quantity: 0.018, unit: "m³", basis: "Mortar volume × 6/7" },
      { name: "Water", quantity: 2.5, unit: "L", basis: "Working and curing allowance" },
    ],
    labour: "Mason 0.12 day/m² · helper 0.13 day/m²",
    assumptions: ["12 mm thickness", "1:6 cement mortar", "Living/ bedroom finish standard", "Curing 7 days"],
    source: "Planning norm; confirm specification.",
    formula: "Material per m² × measured plaster area",
  },
  {
    id: "plaster_6_14",
    label: "Plaster · 6 mm (1:4)",
    inputUnit: "m²",
    description: "Ceiling plaster 6 mm thick, 1:4 mix",
    materials: [
      { name: "Cement", quantity: 0.045, unit: "bags", basis: "0.006 m³ × 1.30 × 1/5 × 1440 ÷ 50" },
      { name: "Sand", quantity: 0.0062, unit: "m³", basis: "Mortar volume × 4/5" },
      { name: "Water", quantity: 1.5, unit: "L", basis: "Working allowance" },
    ],
    labour: "Mason 0.10 day/m² · helper 0.10 day/m²",
    assumptions: ["6 mm ceiling plaster", "1:4 mix", "Excludes scaffolding"],
    source: "Planning norm.",
    formula: "Material per m² × measured ceiling area",
  },
  {
    id: "flooring_tiles",
    label: "Vitrified tile flooring",
    inputUnit: "m²",
    description: "600 × 600 mm vitrified tiles with adhesive and grout",
    materials: [
      { name: "Tiles", quantity: 1.08, unit: "m²", basis: "1 m² net + 8% cutting/waste" },
      { name: "Tile adhesive", quantity: 4, unit: "kg", basis: "3–4 kg/m² with 6 mm notched trowel" },
      { name: "Grout", quantity: 0.35, unit: "kg", basis: "Standard 2 mm joints" },
      { name: "Spacers", quantity: 6, unit: "nos", basis: "2 mm spacers allowance" },
    ],
    labour: "Tile layer 0.18 day/m² · helper 0.12 day/m²",
    assumptions: ["Tile size 600 × 600 mm", "Excludes screed/bedding", "Excludes skirting"],
    source: "Planning norm; tile size and pattern change wastage.",
    formula: "Material per m² × measured flooring area",
  },
  {
    id: "painting_2coat",
    label: "Interior paint · 2 coats",
    inputUnit: "m²",
    description: "Primer + two coats acrylic emulsion",
    materials: [
      { name: "Primer", quantity: 0.10, unit: "L", basis: "Coverage ~10 m²/L" },
      { name: "Paint", quantity: 0.22, unit: "L", basis: "2 coats at ~10 m²/L per coat" },
      { name: "Putty", quantity: 1.2, unit: "kg", basis: "Two coats of wall putty" },
    ],
    labour: "Painter 0.10 day/m² · helper 0.05 day/m²",
    assumptions: ["Smooth plaster substrate", "Excludes external paint", "Coverage varies by surface"],
    source: "Planning norm based on published coverage rates.",
    formula: "Material per m² × measured paint area",
  },
  {
    id: "pcc_m10",
    label: "PCC · M10 bedding",
    inputUnit: "m³",
    description: "Plain cement concrete 1:3:6 for bedding",
    materials: [
      { name: "Cement", quantity: 4.6, unit: "bags", basis: "M10 planning norm" },
      { name: "Sand", quantity: 0.47, unit: "m³", basis: "Fine aggregate per m³" },
      { name: "Coarse aggregate", quantity: 0.94, unit: "m³", basis: "40 mm aggregate per m³" },
      { name: "Water", quantity: 170, unit: "L", basis: "Planning allowance" },
    ],
    labour: "Mason 0.4 day/m³ · helper 0.8 day/m³",
    assumptions: ["1:3:6 nominal mix", "No reinforcement", "Excludes formwork"],
    source: "Planning benchmark.",
    formula: "Material per m³ × measured PCC volume",
  },
];

export function calculateMaterials(work: WorkType, quantity: number): { preset: WorkPreset; quantity: number; materials: MaterialQuantity[]; note: string } {
  const preset = WORK_PRESETS.find((w) => w.id === work);
  if (!preset) throw new Error(`Unknown work type: ${work}`);
  return {
    preset,
    quantity: round(quantity, 3),
    materials: preset.materials.map((m) => ({
      ...m,
      quantity: round(m.quantity * quantity, m.unit === "nos" ? 0 : m.unit === "kg" ? 1 : 2),
    })),
    note: "Planning quantities only. Confirm with approved specification, mix design/BBS and current supplier data.",
  };
}

export interface ProjectMaterialPack {
  items: { name: string; quantity: number; unit: string; basis: string }[];
  measured: {
    brickworkM3: number;
    concreteM3: number;
    plasterM2: number;
    paintM2: number;
    flooringM2: number;
    steelKg: number;
    waterproofingM2: number;
  };
  notes: string[];
}

function addItem(map: Map<string, { name: string; quantity: number; unit: string; basis: string }>, item: MaterialQuantity) {
  const key = `${item.name}:${item.unit}`;
  const existing = map.get(key);
  if (existing) {
    existing.quantity = round(existing.quantity + item.quantity, item.unit === "nos" ? 0 : 2);
  } else {
    map.set(key, { name: item.name, quantity: item.quantity, unit: item.unit, basis: item.basis });
  }
}

export function projectMaterialPack(takeoff: TakeoffSummary): ProjectMaterialPack {
  const map = new Map<string, { name: string; quantity: number; unit: string; basis: string }>();

  if (takeoff.masonryVolume > 0) {
    const brick = calculateMaterials("brickwork_230", takeoff.masonryVolume);
    for (const item of brick.materials) addItem(map, item);
  }
  if (takeoff.rccVolume > 0) {
    const rcc = calculateMaterials("rcc_m20", takeoff.rccVolume);
    for (const item of rcc.materials) addItem(map, item);
  }
  if (takeoff.plasterInternal > 0) {
    const plaster = calculateMaterials("plaster_12_16", takeoff.plasterInternal);
    for (const item of plaster.materials) addItem(map, item);
  }
  if (takeoff.plasterExternal > 0) {
    // External plaster is typically 15–20 mm; use the 12 mm norm with an uplift.
    const ext = calculateMaterials("plaster_12_16", takeoff.plasterExternal * 1.5);
    for (const item of ext.materials) addItem(map, item);
  }
  if (takeoff.flooringArea > 0) {
    const flooring = calculateMaterials("flooring_tiles", takeoff.flooringArea);
    for (const item of flooring.materials) addItem(map, item);
    map.set("Skirting:1000mm", { name: "Skirting (approx. 1000 mm tile)", quantity: round(takeoff.skirtingLength, 2), unit: "m", basis: "Room perimeters less door openings" });
  }
  if (takeoff.plasterInternal + takeoff.plasterExternal > 0) {
    const paint = calculateMaterials("painting_2coat", takeoff.plasterInternal + takeoff.plasterExternal);
    for (const item of paint.materials) addItem(map, item);
  }
  if (takeoff.excavationVolume > 0) {
    const pcc = calculateMaterials("pcc_m10", Math.max(0, takeoff.groundFootprint * 0.05));
    for (const item of pcc.materials) addItem(map, item);
  }

  return {
    items: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
    measured: {
      brickworkM3: round(takeoff.masonryVolume, 2),
      concreteM3: round(takeoff.rccVolume, 2),
      plasterM2: round(takeoff.plasterInternal + takeoff.plasterExternal, 2),
      paintM2: round(takeoff.plasterInternal + takeoff.plasterExternal, 2),
      flooringM2: round(takeoff.flooringArea, 2),
      steelKg: round(takeoff.steelKg, 0),
      waterproofingM2: round(takeoff.waterproofingArea, 2),
    },
    notes: [
      "Brickwork is priced as 230 mm masonry; internal 115 mm partitions use the same per-m³ norm.",
      "RCC is benchmarked M20 with 95 kg/m³ steel until a structural design/BBS exists.",
      "Cement is shown in 50 kg bags. Quantities exclude wastage beyond the stated factors.",
      "These are planning quantities, not a purchase order or mix design.",
    ],
  };
}
