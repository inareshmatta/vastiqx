import { z } from "zod";
import { newId } from "@/domain/project";
import type { Project } from "@/domain/types";
import { round } from "@/domain/geometry";
import type { ToolDef } from "./types";
import { ToolError } from "./types";

export const governanceTools: ToolDef[] = [
  {
    name: "get_audit_log",
    version: "1.0.0",
    group: "Governance",
    description: "Read the append-only audit trail for this project (newest first).",
    permission: "read",
    mutating: false,
    schema: z.object({ limit: z.number().int().min(1).max(200).default(40) }),
    handler: async (_draft, args, ctx) => {
      const entries = await ctx.readAudit(args.limit);
      return { result: { entries, count: entries.length }, changed: false };
    },
  },
  {
    name: "create_checkpoint",
    version: "1.0.0",
    group: "Governance",
    description:
      "Create a named snapshot checkpoint of the current canonical revision. Checkpoints are immutable and can be restored with approval.",
    permission: "write",
    mutating: true,
    schema: z.object({ label: z.string().min(2).max(120) }),
    handler: (draft, args, ctx) => {
      const checkpoint: Project["checkpoints"][number] = {
        id: newId("chk"),
        label: args.label,
        revision: draft.revision,
        createdAt: new Date().toISOString(),
        actorId: ctx.actorId,
        // Nested checkpoints would create recursive snapshots; keep the snapshot geometry only.
        snapshot: structuredClone({ ...draft, checkpoints: [] }),
      };
      draft.checkpoints.push(checkpoint);
      if (draft.checkpoints.length > 12) draft.checkpoints = draft.checkpoints.slice(-12);
      return {
        result: {
          checkpoint_id: checkpoint.id,
          label: checkpoint.label,
          revision: checkpoint.revision,
          created_at: checkpoint.createdAt,
          total_checkpoints: draft.checkpoints.length,
        },
        createdIds: [checkpoint.id],
      };
    },
  },
  {
    name: "restore_checkpoint",
    version: "1.0.0",
    group: "Governance",
    description:
      "Restore a checkpoint snapshot as a new revision. Requires approval; the current state is kept in undo history.",
    permission: "admin",
    mutating: true,
    requiresApproval: true,
    schema: z.object({ checkpoint_id: z.string().min(1) }),
    approval: (args, project) => {
      const checkpoint = project.checkpoints.find((c) => c.id === args.checkpoint_id);
      return {
        summary: checkpoint
          ? `Restore checkpoint "${checkpoint.label}" from revision ${checkpoint.revision} as a new revision.`
          : `Restore checkpoint ${args.checkpoint_id}.`,
        affected: checkpoint ? [{ kind: "checkpoint", id: checkpoint.id, label: checkpoint.label }] : [],
        warnings: ["The current geometry is replaced by the snapshot. Undo history preserves the previous state."],
      };
    },
    handler: (draft, args) => {
      const checkpoint = draft.checkpoints.find((c) => c.id === args.checkpoint_id);
      if (!checkpoint || !checkpoint.snapshot) {
        throw new ToolError("MISSING_INPUT", `Checkpoint ${args.checkpoint_id} has no restorable snapshot.`, {
          hints: ["Create a new checkpoint with create_checkpoint."],
        });
      }
      const snapshot = structuredClone(checkpoint.snapshot);
      const currentCheckpoints = draft.checkpoints;
      Object.assign(draft, snapshot, {
        id: draft.id,
        ownerId: draft.ownerId,
        actorName: draft.actorName,
        revision: draft.revision,
        createdAt: draft.createdAt,
        updatedAt: new Date().toISOString(),
        checkpoints: currentCheckpoints,
      });
      return {
        result: {
          restored_checkpoint_id: checkpoint.id,
          restored_from_revision: checkpoint.revision,
          rooms: draft.floors.reduce((s, f) => s + f.rooms.length, 0),
          note: "Restored as a new revision; the previous state is available through undo.",
        },
        updatedIds: [draft.id],
        invalidated: ["areas", "schedules", "3d", "vastu", "boq", "estimate"],
      };
    },
  },
  {
    name: "list_checkpoints",
    version: "1.0.0",
    group: "Governance",
    description: "List available restore checkpoints with revision and room count.",
    permission: "read",
    mutating: false,
    schema: z.object({}),
    handler: (draft) => ({
      result: {
        checkpoints: draft.checkpoints.map((c) => ({
          checkpoint_id: c.id,
          label: c.label,
          revision: c.revision,
          created_at: c.createdAt,
          actor_id: c.actorId,
          rooms: c.snapshot?.floors.reduce((s, f) => s + f.rooms.length, 0) ?? 0,
        })),
      },
      changed: false,
    }),
  },
  {
    name: "undo_operation",
    version: "1.0.0",
    group: "Governance",
    description: "Undo the last committed mutation. Handled by the revision service; undo/redo never bypass validation.",
    permission: "write",
    mutating: true,
    schema: z.object({}),
    handler: () => {
      throw new ToolError("INTERNAL", "undo_operation must be executed by the revision service.");
    },
  },
  {
    name: "redo_operation",
    version: "1.0.0",
    group: "Governance",
    description: "Redo the last undone mutation. Handled by the revision service.",
    permission: "write",
    mutating: true,
    schema: z.object({}),
    handler: () => {
      throw new ToolError("INTERNAL", "redo_operation must be executed by the revision service.");
    },
  },
  {
    name: "approve_operation",
    version: "1.0.0",
    group: "Governance",
    description: "Approve a pending operation and execute it against the expected revision. Handled by the revision service.",
    permission: "admin",
    mutating: true,
    schema: z.object({ approval_id: z.string().min(1) }),
    handler: () => {
      throw new ToolError("INTERNAL", "approve_operation must be executed by the revision service.");
    },
  },
  {
    name: "reject_operation",
    version: "1.0.0",
    group: "Governance",
    description: "Reject a pending operation without changing the canonical model. Handled by the revision service.",
    permission: "admin",
    mutating: false,
    schema: z.object({ approval_id: z.string().min(1), reason: z.string().max(400).optional() }),
    handler: () => {
      throw new ToolError("INTERNAL", "reject_operation must be executed by the revision service.");
    },
  },
];

export function approvalSummaryFor(project: Project, tool: string, args: unknown): string {
  const def = governanceTools.find((t) => t.name === tool);
  void def;
  return `${tool} on revision ${round(project.revision, 0)} with ${JSON.stringify(args)}`;
}
