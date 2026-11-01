import { formatArea, formatVolume, type AreaUnit } from "@/domain/units";

export function money(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function compactMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)} L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return money(value);
}

export function area(value: number, unit: AreaUnit = "sqm", digits = 2): string {
  return formatArea(value, unit, digits);
}

export function areaTriplet(value: number): string {
  return `${value.toFixed(2)} m² · ${formatArea(value, "sqft")} · ${formatArea(value, "gaj")}`;
}

export function volumeTriplet(value: number): string {
  return `${formatVolume(value, "cum")} · ${formatVolume(value, "cft")} · ${formatVolume(value, "litre")}`;
}

export function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}
