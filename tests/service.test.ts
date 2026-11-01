import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("same tool service powers manual edits, furniture, compliance and approvals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vastiqx-service-"));
  process.env.VASTIQX_DATA_DIR = root;
  try {
    const { createProject } = await import("../src/domain/project");
    const { buildAreaCompliance } = await import("../src/domain/compliance");
    const { executeTool } = await import("../src/server/service");
    const store = await import("../src/server/store");

    const project = createProject({
      name: "Tool contract test",
      plotWidth: 20,
      plotDepth: 20,
      plotUnit: "m",
      city: "Bengaluru",
      state: "Karnataka",
      bedrooms: 1,
      bathrooms: 1,
      floors: 1,
    });
    await store.saveProject(project);
    const floorId = project.floors[0]!.id;

    const actor = {
      source: "ui" as const,
      actorId: "test-user",
      actorName: "Test user",
      role: "owner" as const,
    };

    const living = await executeTool(
      project.id,
      "add_room",
      { floor_id: floorId, name: "Living", type: "living", rect: { x: 2, y: 2, width: 6, depth: 5 } },
      actor,
    );
    assert.equal(living.status, "succeeded");
    assert.equal(living.result && (living.result as { room_id?: string }).room_id !== undefined, true);

    const bedroom = await executeTool(
      project.id,
      "add_room",
      { floor_id: floorId, name: "Bedroom", type: "bedroom", rect: { x: 8, y: 2, width: 5, depth: 5 } },
      { ...actor, expectedVersion: living.revision },
    );
    assert.equal(bedroom.status, "succeeded");

    const afterRooms = await store.readProject(project.id);
    assert.ok(afterRooms);
    assert.equal(afterRooms!.floors[0]!.rooms.length, 2);

    const compliance = buildAreaCompliance(afterRooms!);
    assert.ok(compliance.floors[0]!.carpetArea > 45 && compliance.floors[0]!.carpetArea < 55);
    assert.ok(Math.abs(compliance.floors[0]!.roomUnionVariance) < 0.6);
    assert.ok(compliance.project.totalBuiltUp >= compliance.project.totalCarpet);
    assert.equal(compliance.summary.fail, 0);

    const livingRoomId = afterRooms!.floors[0]!.rooms.find((room) => room.type === "living")!.id;
    const furniture = await executeTool(
      project.id,
      "add_furniture",
      { template_id: "living-sofa-3", room_id: livingRoomId },
      { ...actor, expectedVersion: bedroom.revision },
    );
    assert.equal(furniture.status, "succeeded");
    const furnitureId = (furniture.result as { furniture_id: string }).furniture_id;
    assert.ok(furnitureId);

    const afterFurniture = await store.readProject(project.id);
    assert.equal(afterFurniture!.furniture?.length, 1);
    assert.ok(afterFurniture!.floors[0]!.rooms.length === 2, "furniture must not create rooms");

    const removed = await executeTool(
      project.id,
      "remove_furniture",
      { furniture_id: furnitureId },
      { ...actor, expectedVersion: furniture.revision },
    );
    assert.equal(removed.status, "succeeded", removed.error_message ?? JSON.stringify(removed));

    const view = await store.readProject(project.id);
    const exportAttempt = await executeTool(project.id, "export_json", {}, { ...actor, expectedVersion: view!.revision });
    assert.equal(exportAttempt.status, "needs_approval");
    assert.ok(exportAttempt.approval?.approval_id);

    const approved = await executeTool(
      project.id,
      "approve_operation",
      { approval_id: exportAttempt.approval!.approval_id },
      { ...actor, expectedVersion: view!.revision },
    );
    assert.equal(approved.status, "succeeded");
    const artifacts = await store.listArtifacts(project.id);
    assert.ok(artifacts.some((artifact) => artifact.fileName.endsWith(".json")));

    const audit = await store.readAudit(project.id, 50);
    assert.ok(audit.some((entry) => entry.tool === "add_room" && entry.status === "succeeded"));
    assert.ok(audit.some((entry) => entry.tool === "add_furniture" && entry.status === "succeeded"));
    assert.ok(audit.some((entry) => entry.tool === "export_json" && entry.status === "needs_approval"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
