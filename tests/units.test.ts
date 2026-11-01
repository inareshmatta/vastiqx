import assert from "node:assert/strict";
import test from "node:test";
import {
  AREA_UNITS,
  VOLUME_UNITS,
  convertArea,
  convertVolume,
  formatArea,
  formatVolume,
  sqmToArea,
} from "../src/domain/units";

test("area conversions match the documented gaj / ft2 / m2 relationships", () => {
  assert.ok(Math.abs(convertArea(1, "gaj", "sqft") - 9) < 1e-9);
  assert.ok(Math.abs(convertArea(1, "sqm", "sqft") - 10.7639104167) < 1e-8);
  assert.ok(Math.abs(convertArea(1, "gaj", "sqm") - 0.83612736) < 1e-10);
  assert.ok(Math.abs(sqmToArea(100, "gaj") - 119.599) < 1e-3);
  assert.equal(AREA_UNITS.length, 6);
});

test("volume conversions match m3 / ft3 / litre", () => {
  assert.ok(Math.abs(convertVolume(1, "cum", "cft") - 35.3146667) < 1e-6);
  assert.ok(Math.abs(convertVolume(1, "cum", "litre") - 1000) < 1e-9);
  assert.ok(Math.abs(convertVolume(1000, "litre", "cum") - 1) < 1e-12);
  assert.equal(VOLUME_UNITS.length, 3);
});

test("display formatting always labels units", () => {
  assert.match(formatArea(1, "sqm"), /m²$/);
  assert.match(formatArea(1, "sqft"), /ft²$/);
  assert.match(formatArea(1, "gaj"), /gaj$/);
  assert.match(formatVolume(1, "cum"), /m³$/);
  assert.match(formatVolume(1, "cft"), /ft³$/);
});
