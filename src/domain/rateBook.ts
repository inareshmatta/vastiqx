export type RateCategory =
  | "Earthwork"
  | "Concrete"
  | "Steel"
  | "Masonry"
  | "Plaster"
  | "Flooring"
  | "Painting"
  | "Doors & windows"
  | "Waterproofing"
  | "MEP"
  | "Interiors";

export type Confidence = "measured" | "assumed" | "benchmarked" | "missing";

export interface RateItem {
  id: string;
  category: RateCategory;
  description: string;
  unit: string;
  rate: number;
  waste: number;
  source: string;
  effectiveDate: string;
  confidence: Confidence;
  note?: string;
}

export interface LabourNorm {
  id: string;
  trade: string;
  unit: string;
  daysPerUnit: number;
  wagePerDay: number;
  source: string;
}

export interface RateBook {
  id: string;
  name: string;
  region: string;
  currency: "INR";
  validFrom: string;
  validTo: string;
  source: string;
  disclaimer: string;
  items: RateItem[];
  labour: LabourNorm[];
}

const SOURCE = "Curated regional rate book (indicative)";
const EFFECTIVE = "2026-04-01";

const item = (
  id: string,
  category: RateCategory,
  description: string,
  unit: string,
  rate: number,
  waste: number,
  confidence: Confidence = "benchmarked",
): RateItem => ({
  id,
  category,
  description,
  unit,
  rate,
  waste,
  source: SOURCE,
  effectiveDate: EFFECTIVE,
  confidence,
});

export const RATE_BOOKS: RateBook[] = [
  {
    id: "RB-IN-BLR-2026-04",
    name: "Bengaluru residential (indicative)",
    region: "Bengaluru, Karnataka",
    currency: "INR",
    validFrom: EFFECTIVE,
    validTo: "2026-09-30",
    source: SOURCE,
    disclaimer:
      "Indicative planning rates for concept-stage estimates only. Not a quotation. Verify with current supplier and contractor quotes before committing cost.",
    items: [
      item("EXC-01", "Earthwork", "Excavation in ordinary soil incl. disposal", "m3", 480, 0),
      item("PCC-01", "Concrete", "PCC 1:4:8 foundation bed", "m3", 7400, 0.02),
      item("RCC-01", "Concrete", "RCC M25 incl. pumping and curing", "m3", 10200, 0.02),
      item("STL-01", "Steel", "TMT Fe500 reinforcement, cut/bend/fix", "kg", 82, 0.03),
      item("MAS-01", "Masonry", "AAC block masonry 200 mm", "m3", 5400, 0.05),
      item("MAS-02", "Masonry", "AAC block masonry 100 mm", "m3", 5800, 0.05),
      item("PLA-01", "Plaster", "Internal cement plaster 12 mm", "m2", 340, 0.04),
      item("PLA-02", "Plaster", "External cement plaster 15 mm", "m2", 410, 0.04),
      item("FLR-01", "Flooring", "Vitrified tile flooring 600x600", "m2", 1280, 0.08),
      item("FLR-02", "Flooring", "Skirting 100 mm", "m", 190, 0.05),
      item("PNT-01", "Painting", "Interior emulsion, 2 coats + primer", "m2", 210, 0.03),
      item("PNT-02", "Painting", "Exterior weatherproof paint, 2 coats", "m2", 280, 0.03),
      item("DR-01", "Doors & windows", "Flush door 900x2100 with frame and hardware", "unit", 13500, 0),
      item("DR-02", "Doors & windows", "UPVC window 1200x1200 with glazing", "unit", 10200, 0),
      item("WPF-01", "Waterproofing", "Terrace/wet-area waterproofing", "m2", 680, 0.03),
      item("MEP-01", "MEP", "Electrical point (light/power)", "point", 1550, 0),
      item("MEP-02", "MEP", "Bathroom plumbing set", "bathroom", 32000, 0),
      item("INT-01", "Interiors", "Modular kitchen (3 m run, basic)", "unit", 165000, 0),
      item("INT-02", "Interiors", "Wardrobe 2.4 m x 0.6 m", "unit", 42000, 0),
    ],
    labour: [
      { id: "L-MAS", trade: "Mason", unit: "m3", daysPerUnit: 0.85, wagePerDay: 1150, source: SOURCE },
      { id: "L-HLP", trade: "Helper", unit: "m3", daysPerUnit: 0.9, wagePerDay: 780, source: SOURCE },
      { id: "L-PLA", trade: "Plaster mason", unit: "m2", daysPerUnit: 0.11, wagePerDay: 1150, source: SOURCE },
      { id: "L-TIL", trade: "Tile mason", unit: "m2", daysPerUnit: 0.16, wagePerDay: 1350, source: SOURCE },
      { id: "L-PNT", trade: "Painter", unit: "m2", daysPerUnit: 0.07, wagePerDay: 980, source: SOURCE },
      { id: "L-BRB", trade: "Bar bender", unit: "kg", daysPerUnit: 0.012, wagePerDay: 1250, source: SOURCE },
      { id: "L-CRP", trade: "Carpenter", unit: "m3", daysPerUnit: 0.55, wagePerDay: 1250, source: SOURCE },
    ],
  },
  {
    id: "RB-IN-MUM-2026-04",
    name: "Mumbai residential (indicative)",
    region: "Mumbai, Maharashtra",
    currency: "INR",
    validFrom: EFFECTIVE,
    validTo: "2026-09-30",
    source: SOURCE,
    disclaimer:
      "Indicative planning rates for concept-stage estimates only. Not a quotation. Verify with current supplier and contractor quotes before committing cost.",
    items: [
      item("EXC-01", "Earthwork", "Excavation in ordinary soil incl. disposal", "m3", 560, 0),
      item("PCC-01", "Concrete", "PCC 1:4:8 foundation bed", "m3", 8200, 0.02),
      item("RCC-01", "Concrete", "RCC M25 incl. pumping and curing", "m3", 11400, 0.02),
      item("STL-01", "Steel", "TMT Fe500 reinforcement, cut/bend/fix", "kg", 88, 0.03),
      item("MAS-01", "Masonry", "AAC block masonry 200 mm", "m3", 6000, 0.05),
      item("MAS-02", "Masonry", "AAC block masonry 100 mm", "m3", 6400, 0.05),
      item("PLA-01", "Plaster", "Internal cement plaster 12 mm", "m2", 380, 0.04),
      item("PLA-02", "Plaster", "External cement plaster 15 mm", "m2", 460, 0.04),
      item("FLR-01", "Flooring", "Vitrified tile flooring 600x600", "m2", 1450, 0.08),
      item("FLR-02", "Flooring", "Skirting 100 mm", "m", 210, 0.05),
      item("PNT-01", "Painting", "Interior emulsion, 2 coats + primer", "m2", 240, 0.03),
      item("PNT-02", "Painting", "Exterior weatherproof paint, 2 coats", "m2", 320, 0.03),
      item("DR-01", "Doors & windows", "Flush door 900x2100 with frame and hardware", "unit", 15000, 0),
      item("DR-02", "Doors & windows", "UPVC window 1200x1200 with glazing", "unit", 11500, 0),
      item("WPF-01", "Waterproofing", "Terrace/wet-area waterproofing", "m2", 760, 0.03),
      item("MEP-01", "MEP", "Electrical point (light/power)", "point", 1750, 0),
      item("MEP-02", "MEP", "Bathroom plumbing set", "bathroom", 36000, 0),
      item("INT-01", "Interiors", "Modular kitchen (3 m run, basic)", "unit", 185000, 0),
      item("INT-02", "Interiors", "Wardrobe 2.4 m x 0.6 m", "unit", 47000, 0),
    ],
    labour: [
      { id: "L-MAS", trade: "Mason", unit: "m3", daysPerUnit: 0.85, wagePerDay: 1300, source: SOURCE },
      { id: "L-HLP", trade: "Helper", unit: "m3", daysPerUnit: 0.9, wagePerDay: 900, source: SOURCE },
      { id: "L-PLA", trade: "Plaster mason", unit: "m2", daysPerUnit: 0.11, wagePerDay: 1300, source: SOURCE },
      { id: "L-TIL", trade: "Tile mason", unit: "m2", daysPerUnit: 0.16, wagePerDay: 1500, source: SOURCE },
      { id: "L-PNT", trade: "Painter", unit: "m2", daysPerUnit: 0.07, wagePerDay: 1100, source: SOURCE },
      { id: "L-BRB", trade: "Bar bender", unit: "kg", daysPerUnit: 0.012, wagePerDay: 1400, source: SOURCE },
      { id: "L-CRP", trade: "Carpenter", unit: "m3", daysPerUnit: 0.55, wagePerDay: 1400, source: SOURCE },
    ],
  },
];

export function getRateBook(id: string): RateBook {
  return RATE_BOOKS.find((b) => b.id === id) ?? RATE_BOOKS[0]!;
}

export const PACKAGE_FACTORS: Record<"economy" | "standard" | "premium", number> = {
  economy: 0.82,
  standard: 1,
  premium: 1.38,
};
