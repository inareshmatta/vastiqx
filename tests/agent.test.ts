import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("the agent reaches the project only through the same typed tools", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vastiqx-agent-"));
  process.env.VASTIQX_DATA_DIR = root;
  const previousKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { createProject } = await import("../src/domain/project");
    const { saveProject, readProject } = await import("../src/server/store");
    const { executeTool } = await import("../src/server/service");
    const { runAgent } = await import("../src/agent/runtime");

    const project = createProject({
      name: "Agent contract test",
      plotWidth: 20,
      plotDepth: 20,
      plotUnit: "m",
      bedrooms: 1,
      bathrooms: 1,
      floors: 1,
    });
    await saveProject(project);
    const actor = {
      source: "ui" as const,
      actorId: "test-user",
      actorName: "Test user",
      role: "owner" as const,
    };
    const room = await executeTool(
      project.id,
      "add_room",
      { floor_id: project.floors[0]!.id, name: "Living", type: "living", rect: { x: 2, y: 2, width: 6, depth: 6 } },
      actor,
    );
    assert.equal(room.status, "succeeded");

    const events: { type: string; name?: string; status?: string; mode?: string }[] = [];
    await runAgent({
      projectId: project.id,
      message: "add a sofa to the living room",
      emit: (event) => {
        events.push({ type: event.type, ...(event.type === "tool_call" ? { name: event.name } : {}), ...(event.type === "tool_result" ? { name: event.name, status: event.status } : {}), ...(event.type === "done" ? { mode: event.mode } : {}) });
      },
    });

    assert.ok(events.some((event) => event.type === "tool_call" && event.name === "add_furniture"));
    assert.ok(events.some((event) => event.type === "tool_result" && event.name === "add_furniture" && event.status === "succeeded"));
    assert.ok(events.some((event) => event.type === "done" && event.mode === "mock"));

    const updated = await readProject(project.id);
    assert.equal(updated!.furniture?.length, 1);
    assert.equal(updated!.furniture![0]!.kind, "sofa");

    // The agent cannot approve its own operation; it can only surface the need for approval.
    const exported = await executeTool(project.id, "export_json", {}, { ...actor, expectedVersion: updated!.revision });
    assert.equal(exported.status, "needs_approval");
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    await rm(root, { recursive: true, force: true });
  }
});
