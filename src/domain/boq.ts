import { polygonArea, polygonPerimeter } from "./geometry";
import { projectMetrics } from "./measure";
import { PACKAGE_FACTORS, getRateBook, type Confidence, type RateBook, type RateItem } from "./rateBook";
import type { Project } from "./types";

export type ScenarioPackage = "economy" | "standard" | "premium";

export interface BoqLine {
  id: string;
  packageName: string;
  description: string;
  unit: string;
  quantity: number;
  wasteFactor: number;
  grossQuantity: number;
  rate: number;
  amount: number;
  formula: string;
  confidence: Confidence;
  source: string;
  effectiveDate: string;
  assumptions: string[];
}

export interface EstimateTotals {
  materials: number;
  labour: number;
  equipment: number;
  direct: number;
  overheads: number;
  margin: number;
  gst: number;
  contingency: number;
  total: number;
  bandLow: number;
  bandHigh: number;
  perSqm: number;
}

export interface Estimate {
  projectId: string;
  revision: number;
  package: ScenarioPackage;
  rateBook: {
    id: string;
    name: string;
    region: string;
    validFrom: string;
    validTo: string;
    source: string;
    disclaimer: string;
  };
  materialLines: BoqLine[];
  labourLines: BoqLine[];
  totals: EstimateTotals;
  perFloor: { floorId: string; name: string; builtUpArea: number; indicativeCost: number }[];
  assumptions: string[];
  inclusions: string[];
  exclusions: string[];
  missingInputs: string[];
  calculatedAt: string;
  engineVersion: string;
  disclaimer: string;
}

export interface TakeoffSummary {
  masonryVolume: number;
  externalWallArea: number;
  internalWallArea: number;
  plasterInternal: number;
  plasterExternal: number;
  flooringArea: number;
  skirtingLength: number;
  doorCount: number;
  windowCount: number;
  rccVolume: number;
  steelKg: number;
  excavationVolume: number;
  waterproofingArea: number;
  electricalPoints: number;
  bathroomCount: number;
  bedroomCount: number;
  kitchenCount: number;
  builtUpArea: number;
  groundFootprint: number;
}

const ENGINE_VERSION = "boq-engine@1.0.0";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round0(n: number): number {
  return Math.round(n);
}

function item(rateBook: RateBook, id: string): RateItem {
  const found = rateBook.items.find((i) => i.id === id);
  if (!found) throw new Error(`RATE_NOT_FOUND: ${id}`);
  return found;
}

export function takeoffQuantities(project: Project): TakeoffSummary {
  const metrics = projectMetrics(project);
  let masonryVolume = 0;
  let externalWallArea = 0;
  let internalWallArea = 0;
  let plasterInternal = 0;
  let plasterExternal = 0;
  let doorCount = 0;
  let windowCount = 0;

  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      if (len < 0.01) continue;
      const grossFace = len * wall.height;
      const openingArea = wall.openings.reduce((s, o) => s + o.width * o.height, 0);
      const netFace = Math.max(0, grossFace - openingArea);
      const wallVolume = Math.max(0, len * wall.height * wall.thickness - openingArea * wall.thickness);
      masonryVolume += wallVolume;
      const isExternal = wall.type === "external_masonry" || wall.type === "party_wall";
      if (isExternal) {
        externalWallArea += netFace;
        plasterExternal += netFace;
        plasterInternal += netFace;
      } else {
        internalWallArea += netFace;
        plasterInternal += netFace * 2;
      }
      doorCount += wall.openings.filter((o) => o.kind === "door").length;
      windowCount += wall.openings.filter((o) => o.kind === "window").length;
    }
  }

  let flooringArea = 0;
  let skirtingLength = 0;
  let bathroomCount = 0;
  let bedroomCount = 0;
  let kitchenCount = 0;
  let waterproofingArea = 0;
  for (const floor of project.floors) {
    for (const room of floor.rooms) {
      const area = polygonArea(room.polygon);
      if (room.type !== "parking") {
        flooringArea += area;
        skirtingLength += polygonPerimeter(room.polygon);
      }
      if (room.type === "bathroom" || room.type === "toilet") {
        bathroomCount += 1;
        waterproofingArea += area;
      }
      if (room.type === "balcony" || room.type === "utility") waterproofingArea += area;
      if (room.type === "master_bedroom" || room.type === "bedroom") bedroomCount += 1;
      if (room.type === "kitchen") kitchenCount += 1;
    }
  }

  const groundFootprint = metrics.floors[0]?.builtUpArea ?? 0;
  const topFloor = project.floors[project.floors.length - 1];
  const terraceArea = topFloor ? (metrics.floors[metrics.floors.length - 1]?.builtUpArea ?? 0) : 0;
  if (terraceArea > 0) waterproofingArea += terraceArea;

  // RCC, steel and excavation are benchmarked because structural member sizes
  // are not part of the parametric concept model. Labelled accordingly.
  const rccVolume = metrics.totalBuiltUp * (0.125 + 0.055) + groundFootprint * 0.03;
  const steelKg = rccVolume * 95;
  const excavationVolume = groundFootprint * 0.25;

  const electricalPoints =
    project.floors.reduce((sum, floor) => {
      return (
        sum +
        floor.rooms.reduce((s, room) => {
          switch (room.type) {
            case "living":
              return s + 8;
            case "master_bedroom":
            case "bedroom":
              return s + 6;
            case "kitchen":
              return s + 8;
            case "bathroom":
            case "toilet":
              return s + 4;
            case "dining":
              return s + 4;
            case "parking":
              return s + 2;
            default:
              return s + 3;
          }
        }, 0)
      );
    }, 0) + 6 * project.floors.length;

  return {
    masonryVolume: round2(masonryVolume),
    externalWallArea: round2(externalWallArea),
    internalWallArea: round2(internalWallArea),
    plasterInternal: round2(plasterInternal),
    plasterExternal: round2(plasterExternal),
    flooringArea: round2(flooringArea),
    skirtingLength: round2(Math.max(0, skirtingLength - doorCount * 0.95)),
    doorCount,
    windowCount,
    rccVolume: round2(rccVolume),
    steelKg: round2(steelKg),
    excavationVolume: round2(excavationVolume),
    waterproofingArea: round2(waterproofingArea),
    electricalPoints,
    bathroomCount,
    bedroomCount,
    kitchenCount,
    builtUpArea: metrics.totalBuiltUp,
    groundFootprint,
  };
}

function makeLine(
  rateBook: RateBook,
  rateItem: RateItem,
  quantity: number,
  formula: string,
  assumptions: string[],
  packageFactor = 1,
  seq = 0,
): BoqLine {
  const wasteFactor = rateItem.waste;
  const grossQuantity = round2(quantity * (1 + wasteFactor));
  const rate = round2(rateItem.rate * packageFactor);
  return {
    id: `${rateItem.id}-${String(seq).padStart(2, "0")}`,
    packageName: rateItem.category,
    description: rateItem.description,
    unit: rateItem.unit,
    quantity: round2(quantity),
    wasteFactor,
    grossQuantity,
    rate,
    amount: round2(grossQuantity * rate),
    formula,
    confidence: rateItem.confidence,
    source: rateItem.source,
    effectiveDate: rateItem.effectiveDate,
    assumptions,
  };
}

export function calculateEstimate(
  project: Project,
  options: { rateBookId?: string; package?: ScenarioPackage } = {},
): Estimate {
  const rateBook = getRateBook(options.rateBookId ?? project.rateBookId);
  const pkg: ScenarioPackage = options.package ?? "standard";
  const factor = PACKAGE_FACTORS[pkg];
  const q = takeoffQuantities(project);
  const metrics = projectMetrics(project);
  const materialLines: BoqLine[] = [];
  const finishFactor = factor;

  if (q.masonryVolume > 0) {
    const extVolume = project.floors.reduce(
      (sum, f) =>
        sum +
        f.walls
          .filter((w) => w.type === "external_masonry" || w.type === "party_wall")
          .reduce((s, w) => {
            const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
            const openingArea = w.openings.reduce((o, op) => o + op.width * op.height, 0);
            return s + Math.max(0, len * w.height * w.thickness - openingArea * w.thickness);
          }, 0),
      0,
    );
    const intVolume = Math.max(0, q.masonryVolume - extVolume);
    if (extVolume > 0) {
      materialLines.push(
        makeLine(
          rateBook,
          item(rateBook, "MAS-01"),
          extVolume,
          `Net masonry volume = sum(wall length x height x thickness) - openings, external walls = ${extVolume.toFixed(2)} m3`,
          ["Wall thickness taken from the canonical model.", "Mortar and reinforcement not separately measured."],
        ),
      );
    }
    if (intVolume > 0) {
      materialLines.push(
        makeLine(
          rateBook,
          item(rateBook, "MAS-02"),
          intVolume,
          `Net masonry volume = sum(wall length x height x thickness) - openings, internal walls = ${intVolume.toFixed(2)} m3`,
          ["Internal partitions assumed 100 mm AAC."],
        ),
      );
    }
  }

  if (q.plasterInternal > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "PLA-01"),
        q.plasterInternal,
        `Internal plaster = net wall face area (both faces of internal walls, one face of external walls) - openings = ${q.plasterInternal.toFixed(2)} m2`,
        ["Openings deducted on both faces where applicable."],
      ),
    );
  }
  if (q.plasterExternal > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "PLA-02"),
        q.plasterExternal,
        `External plaster = net external wall face area - openings = ${q.plasterExternal.toFixed(2)} m2`,
        ["Parapet and compound wall excluded."],
      ),
    );
  }

  if (q.flooringArea > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "FLR-01"),
        q.flooringArea,
        `Flooring = sum of clear room areas excluding parking = ${q.flooringArea.toFixed(2)} m2`,
        ["Areas are net room polygons from the canonical model.", "Tile pattern cutting allowance included as waste."],
        finishFactor,
      ),
    );
  }
  if (q.skirtingLength > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "FLR-02"),
        q.skirtingLength,
        `Skirting = room perimeter - 0.95 m per door = ${q.skirtingLength.toFixed(2)} m`,
        ["Door openings deducted approximately."],
        finishFactor,
      ),
    );
  }

  const paintArea = q.plasterInternal + q.plasterExternal;
  if (paintArea > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "PNT-01"),
        q.plasterInternal,
        `Interior paint = internal plaster area x 2 coats + primer = ${q.plasterInternal.toFixed(2)} m2`,
        ["Two coats with primer assumed."],
        finishFactor,
      ),
    );
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "PNT-02"),
        q.plasterExternal,
        `Exterior paint = external plaster area x 2 coats = ${q.plasterExternal.toFixed(2)} m2`,
        ["Weatherproof exterior emulsion assumed."],
        finishFactor,
      ),
    );
  }

  if (q.doorCount > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "DR-01"),
        q.doorCount,
        `Doors = count of door openings in the model = ${q.doorCount} units`,
        ["Standard 900 x 2100 flush door with frame and hardware."],
        finishFactor,
      ),
    );
  }
  if (q.windowCount > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "DR-02"),
        q.windowCount,
        `Windows = count of window openings in the model = ${q.windowCount} units`,
        ["Standard 1200 x 1200 UPVC window."],
        finishFactor,
      ),
    );
  }

  if (q.waterproofingArea > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "WPF-01"),
        q.waterproofingArea,
        `Waterproofing = wet-room area + terrace footprint = ${q.waterproofingArea.toFixed(2)} m2`,
        ["Terrace waterproofing included; upturns not measured separately."],
      ),
    );
  }

  // Benchmarked structure (explicitly not engineered quantities).
  if (q.rccVolume > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "RCC-01"),
        q.rccVolume,
        `Preliminary RCC = built-up ${q.builtUpArea.toFixed(2)} m2 x 0.180 m3/m2 + ground footprint ${q.groundFootprint.toFixed(2)} m2 x 0.030 m3/m2 = ${q.rccVolume.toFixed(2)} m3`,
        [
          "BENCHMARK ONLY: member sizes require structural design.",
          "Slab/beam/column ratios are planning allowances, not a design.",
        ],
      ),
    );
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "STL-01"),
        q.steelKg,
        `Preliminary reinforcement = RCC volume ${q.rccVolume.toFixed(2)} m3 x 95 kg/m3 = ${q.steelKg.toFixed(0)} kg`,
        ["BENCHMARK ONLY: reinforcement requires approved structural drawings/BBS."],
      ),
    );
  }
  if (q.excavationVolume > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "EXC-01"),
        q.excavationVolume,
        `Excavation = ground footprint ${q.groundFootprint.toFixed(2)} m2 x 0.25 m3/m2 = ${q.excavationVolume.toFixed(2)} m3`,
        ["ASSUMED: isolated footings on ordinary soil; no soil report."],
      ),
    );
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "PCC-01"),
        q.groundFootprint * 0.05,
        `PCC bedding = ground footprint ${q.groundFootprint.toFixed(2)} m2 x 0.05 m = ${(q.groundFootprint * 0.05).toFixed(2)} m3`,
        ["Assumed 50 mm PCC below footings and floor."],
      ),
    );
  }

  if (q.electricalPoints > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "MEP-01"),
        q.electricalPoints,
        `Electrical points = room-wise allowance (living 8, bedroom 6, kitchen 8, bath 4, other 3) + 6 per floor = ${q.electricalPoints} points`,
        ["ASSUMED: point schedule not designed; excludes DB, cabling runs and fixtures."],
        finishFactor,
      ),
    );
  }
  if (q.bathroomCount > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "MEP-02"),
        q.bathroomCount,
        `Bathroom plumbing sets = number of bathroom/toilet rooms = ${q.bathroomCount}`,
        ["ASSUMED: standard fixtures per bathroom; excludes water tank and treatment."],
        finishFactor,
      ),
    );
  }
  if (q.kitchenCount > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "INT-01"),
        q.kitchenCount,
        `Modular kitchen = count of kitchen rooms = ${q.kitchenCount}`,
        ["ASSUMED: 3 m basic modular kitchen; joinery design not provided."],
        finishFactor,
      ),
    );
  }
  if (q.bedroomCount > 0) {
    materialLines.push(
      makeLine(
        rateBook,
        item(rateBook, "INT-02"),
        q.bedroomCount,
        `Wardrobes = count of bedrooms = ${q.bedroomCount}`,
        ["ASSUMED: 2.4 m x 0.6 m wardrobe per bedroom."],
        finishFactor,
      ),
    );
  }

  const materialTotal = round2(materialLines.reduce((s, l) => s + l.amount, 0));

  const labourLines: BoqLine[] = [];
  const addLabour = (id: string, quantity: number, quantityLabel: string, formula: string) => {
    const norm = rateBook.labour.find((l) => l.id === id);
    if (!norm || quantity <= 0) return;
    const days = quantity * norm.daysPerUnit;
    const amount = round2(days * norm.wagePerDay);
    labourLines.push({
      id: `LAB-${id}-${Math.random().toString(36).slice(2, 7)}`,
      packageName: "Labour",
      description: `${norm.trade} — ${quantityLabel}`,
      unit: "day",
      quantity: round2(days),
      wasteFactor: 0,
      grossQuantity: round2(days),
      rate: norm.wagePerDay,
      amount,
      formula: `${quantityLabel} ${quantity.toFixed(2)} x ${norm.daysPerUnit} day/unit = ${days.toFixed(2)} days x Rs ${norm.wagePerDay}/day`,
      confidence: "assumed",
      source: norm.source,
      effectiveDate: rateBook.validFrom,
      assumptions: ["Productivity norm is a planning assumption; actual crew output varies."],
    });
    void formula;
  };

  addLabour("L-MAS", q.masonryVolume, "masonry volume (m3)", "");
  addLabour("L-HLP", q.masonryVolume, "masonry volume (m3)", "");
  addLabour("L-PLA", q.plasterInternal + q.plasterExternal, "plaster area (m2)", "");
  addLabour("L-TIL", q.flooringArea, "flooring area (m2)", "");
  addLabour("L-PNT", paintArea, "paint area (m2)", "");
  addLabour("L-BRB", q.steelKg, "reinforcement (kg)", "");
  addLabour("L-CRP", q.rccVolume, "RCC volume (m3)", "");

  const labourTotal = round2(labourLines.reduce((s, l) => s + l.amount, 0));
  const equipment = round2((materialTotal + labourTotal) * 0.02);
  const direct = round2(materialTotal + labourTotal + equipment);
  const overheads = round2(direct * 0.06);
  const margin = round2((direct + overheads) * 0.08);
  const gst = round2((direct + overheads + margin) * 0.18);
  const contingency = round2(direct * 0.05);
  const total = round2(direct + overheads + margin + gst + contingency);
  const perSqm = metrics.totalBuiltUp > 0 ? round2(total / metrics.totalBuiltUp) : 0;

  const perFloor = metrics.floors.map((f) => ({
    floorId: f.floorId,
    name: f.name,
    builtUpArea: f.builtUpArea,
    indicativeCost:
      metrics.totalBuiltUp > 0 ? round2((f.builtUpArea / metrics.totalBuiltUp) * total) : 0,
  }));

  return {
    projectId: project.id,
    revision: project.revision,
    package: pkg,
    rateBook: {
      id: rateBook.id,
      name: rateBook.name,
      region: rateBook.region,
      validFrom: rateBook.validFrom,
      validTo: rateBook.validTo,
      source: rateBook.source,
      disclaimer: rateBook.disclaimer,
    },
    materialLines,
    labourLines,
    totals: {
      materials: materialTotal,
      labour: labourTotal,
      equipment,
      direct,
      overheads,
      margin,
      gst,
      contingency,
      total,
      bandLow: round2(total * 0.88),
      bandHigh: round2(total * 1.15),
      perSqm,
    },
    perFloor,
    assumptions: [
      `Scenario package: ${pkg}. Finish rates scaled by ${finishFactor.toFixed(2)}; structure and labour unscaled.`,
      "Quantities derive from the canonical model at revision " + project.revision + ".",
      "Wall/room geometry is measured; structural, MEP and joinery quantities are benchmarks or assumptions.",
      "Rates are dated and indicative, not current supplier quotations.",
    ],
    inclusions: [
      "Masonry, plaster, flooring, skirting, painting",
      "Doors and windows per opening schedule",
      "Preliminary RCC, reinforcement, excavation and PCC benchmarks",
      "Waterproofing to wet areas and terrace",
      "Electrical points, bathroom plumbing sets, kitchen and wardrobes (allowances)",
    ],
    exclusions: [
      "Structural design, soil investigation and foundation engineering",
      "Statutory fees, approvals, professional fees and permits",
      "Compound wall, landscaping, external development and rainwater harvesting",
      "Lifts, solar, HVAC, home automation, furniture and loose fixtures",
      "Escalation beyond the rate book validity and site-specific transport",
    ],
    missingInputs: [
      "Approved structural design and reinforcement drawings (member sizes and BBS)",
      "Soil investigation and founding level",
      "Site levels, cut/fill and boundary survey",
      "MEP layouts, load schedule and fixture selection",
      "Final material specifications and verified supplier quotations",
      "Statutory approval status and jurisdiction-specific rule pack",
    ],
    calculatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    disclaimer:
      "Preliminary concept-stage estimate. Not a quotation or a certified cost plan. Structural and MEP quantities are benchmarks until engineered inputs are supplied. Confidence band reflects planning-stage uncertainty only.",
  };
}

export function compareCostScenarios(project: Project): {
  scenarios: { package: ScenarioPackage; total: number; perSqm: number; bandLow: number; bandHigh: number }[];
  note: string;
} {
  const scenarios = (["economy", "standard", "premium"] as ScenarioPackage[]).map((pkg) => {
    const e = calculateEstimate(project, { package: pkg });
    return {
      package: pkg,
      total: e.totals.total,
      perSqm: e.totals.perSqm,
      bandLow: e.totals.bandLow,
      bandHigh: e.totals.bandHigh,
    };
  });
  return {
    scenarios,
    note: "Finish-rate scenarios only. Structure, labour and quantities are identical across scenarios.",
  };
}

export function formatINR(value: number): string {
  const rounded = Math.round(value);
  const s = rounded.toString();
  if (s.length <= 3) return `Rs ${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `Rs ${grouped},${last3}`;
}
