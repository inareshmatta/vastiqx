import assert from "node:assert/strict";
import test from "node:test";
import { calculateMaterials, projectMaterialPack, WORK_PRESETS } from "../src/domain/calculator";
import type { TakeoffSummary } from "../src/domain/boq";

test("brickwork norms convert cubic metres into bricks and cement bags", () => {
  const result = calculateMaterials("brickwork_230", 1);
  const bricks = result.materials.find((item) => item.name === "Bricks");
  const cement = result.materials.find((item) => item.name === "Cement");
  assert.equal(bricks?.quantity, 500);
  assert.equal(bricks?.unit, "nos");
  assert.equal(cement?.quantity, 1.23);
  assert.equal(cement?.unit, "bags");
});

test("RCC benchmark exposes its assumptions instead of pretending to be a mix design", () => {
  const result = calculateMaterials("rcc_m20", 2);
  const steel = result.materials.find((item) => item.name === "Steel");
  assert.equal(steel?.quantity, 190);
  assert.ok(result.preset.assumptions.some((assumption) => assumption.includes("benchmark")));
  assert.ok(result.note.includes("Planning quantities"));
});

test("there is a documented preset for every construction work type", () => {
  assert.ok(WORK_PRESETS.length >= 8);
  for (const preset of WORK_PRESETS) {
    assert.ok(preset.materials.length > 0, `${preset.id} has materials`);
    assert.ok(preset.formula.length > 0, `${preset.id} has a formula`);
    assert.ok(preset.source.length > 0, `${preset.id} has a source`);
  }
});

test("project material pack aggregates measured takeoff without inventing volume", () => {
  const takeoff: TakeoffSummary = {
    masonryVolume: 10,
    externalWallArea: 80,
    internalWallArea: 60,
    plasterInternal: 120,
    plasterExternal: 60,
    flooringArea: 100,
    skirtingLength: 80,
    doorCount: 8,
    windowCount: 10,
    rccVolume: 20,
    steelKg: 1900,
    excavationVolume: 30,
    waterproofingArea: 20,
    electricalPoints: 80,
    bathroomCount: 3,
    bedroomCount: 3,
    kitchenCount: 1,
    builtUpArea: 240,
    groundFootprint: 120,
  };
  const pack = projectMaterialPack(takeoff);
  assert.ok(pack.items.some((item) => item.name === "Bricks"));
  assert.ok(pack.items.some((item) => item.name === "Cement" && item.unit === "bags"));
  assert.equal(pack.measured.brickworkM3, 10);
  assert.equal(pack.measured.concreteM3, 20);
  assert.ok(pack.notes.length >= 3);
});
