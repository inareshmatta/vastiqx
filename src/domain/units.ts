/** Unit conversion utilities. Canonical model is always metres; display units are derived. */

export type AreaUnit = "sqm" | "sqft" | "gaj" | "sqyd" | "acre" | "hectare";
export type VolumeUnit = "cum" | "cft" | "litre";
export type LengthUnit = "m" | "ft" | "in" | "cm" | "mm";

export const AREA_UNITS: { id: AreaUnit; label: string; symbol: string; toSqm: number }[] = [
  { id: "sqm", label: "Square metre", symbol: "m²", toSqm: 1 },
  { id: "sqft", label: "Square foot", symbol: "ft²", toSqm: 0.09290304 },
  { id: "gaj", label: "Gaj (square yard)", symbol: "gaj", toSqm: 0.83612736 },
  { id: "sqyd", label: "Square yard", symbol: "yd²", toSqm: 0.83612736 },
  { id: "acre", label: "Acre", symbol: "acre", toSqm: 4046.8564224 },
  { id: "hectare", label: "Hectare", symbol: "ha", toSqm: 10_000 },
];

export const VOLUME_UNITS: { id: VolumeUnit; label: string; symbol: string; toCum: number }[] = [
  { id: "cum", label: "Cubic metre", symbol: "m³", toCum: 1 },
  { id: "cft", label: "Cubic foot", symbol: "ft³", toCum: 0.028316846592 },
  { id: "litre", label: "Litre", symbol: "L", toCum: 0.001 },
];

export const LENGTH_UNITS: { id: LengthUnit; label: string; symbol: string; toM: number }[] = [
  { id: "m", label: "Metre", symbol: "m", toM: 1 },
  { id: "ft", label: "Foot", symbol: "ft", toM: 0.3048 },
  { id: "in", label: "Inch", symbol: "in", toM: 0.0254 },
  { id: "cm", label: "Centimetre", symbol: "cm", toM: 0.01 },
  { id: "mm", label: "Millimetre", symbol: "mm", toM: 0.001 },
];

export function areaToSqm(value: number, unit: AreaUnit): number {
  return value * (AREA_UNITS.find((u) => u.id === unit)?.toSqm ?? 1);
}
export function sqmToArea(value: number, unit: AreaUnit): number {
  return value / (AREA_UNITS.find((u) => u.id === unit)?.toSqm ?? 1);
}
export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  return sqmToArea(areaToSqm(value, from), to);
}
export function volumeToCum(value: number, unit: VolumeUnit): number {
  return value * (VOLUME_UNITS.find((u) => u.id === unit)?.toCum ?? 1);
}
export function cumToVolume(value: number, unit: VolumeUnit): number {
  return value / (VOLUME_UNITS.find((u) => u.id === unit)?.toCum ?? 1);
}
export function convertVolume(value: number, from: VolumeUnit, to: VolumeUnit): number {
  return cumToVolume(volumeToCum(value, from), to);
}
export function lengthToM(value: number, unit: LengthUnit): number {
  return value * (LENGTH_UNITS.find((u) => u.id === unit)?.toM ?? 1);
}
export function mToLength(value: number, unit: LengthUnit): number {
  return value / (LENGTH_UNITS.find((u) => u.id === unit)?.toM ?? 1);
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatArea(sqm: number, unit: AreaUnit = "sqm", digits = 2): string {
  const meta = AREA_UNITS.find((u) => u.id === unit)!;
  return `${formatNumber(sqmToArea(sqm, unit), digits)} ${meta.symbol}`;
}

export function formatVolume(cum: number, unit: VolumeUnit = "cum", digits = 2): string {
  const meta = VOLUME_UNITS.find((u) => u.id === unit)!;
  return `${formatNumber(cumToVolume(cum, unit), digits)} ${meta.symbol}`;
}

export function formatLength(m: number, unit: LengthUnit = "m", digits = 2): string {
  const meta = LENGTH_UNITS.find((u) => u.id === unit)!;
  return `${formatNumber(mToLength(m, unit), digits)} ${meta.symbol}`;
}

export const UNIT_REFERENCE = [
  { label: "1 m²", value: "10.7639 ft² · 1.19599 gaj · 0.000247105 acre" },
  { label: "1 ft²", value: "0.092903 m² · 0.111111 gaj" },
  { label: "1 gaj", value: "0.836127 m² · 9 ft²" },
  { label: "1 acre", value: "4046.86 m² · 4840 yd² · 43,560 ft²" },
  { label: "1 m³", value: "35.3147 ft³ · 1000 litres" },
  { label: "1 bag cement", value: "50 kg · ~0.0347 m³ loose volume" },
];
