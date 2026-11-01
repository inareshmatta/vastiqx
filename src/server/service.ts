import { newId } from "@/domain/project";
import { validateProject } from "@/domain/validation";
import type { Project } from "@/domain/types";
import { TOOL_MAP, SERVICE_ONLY_TOOLS } from "@/tools/registry";
import type { ExecuteToolOptions, ProgressEvent, ToolDef, ToolEnvelope } from "@/tools/types";
import { ToolError } from "@/tools/types";
import * as store from "./store";

const SERVICE_VERSION = "vastiqx-service@1.0.0";
const ENGINE = "canonical-domain-engine@1.0.0";
const DEFAULT_INVALIDATIONS = ["areas", "schedules", "3d", "vastu", "boq", "estimate"];

function invalidationFor(tool: ToolDef, outcomeInvalidated: string[] | undefined): string[] {
  if (outcomeInvalidated) return outcomeInvalidated;
  if (!tool.mutating) return [];
  const name = tool.name;
  if (name === "create_checkpoint" || name === "list_checkpoints" || name === "get_audit_log") return [];
  if (name === "set_rate_book") return ["boq", "estimate"];
  if (name.includes("vastu")) return ["vastu"];
  if (name === "set_north_bearing") return ["vastu", "3d"];
  if (name === "add_constraint") return ["boq", "estimate"];
  return DEFAULT_INVALIDATIONS;
}

function envelope(
  project: Project,
  options: {
    status: ToolEnvelope["status"];
    operationId: string;
    revision: number;
    def?: ToolDef;
    created?: string[];
    updated?: string[];
    deleted?: string[];
    result?: unknown;
    source: string;
    actorId: string;
    invalidated?: string[];
    warnings?: string[];
    errorCode?: string;
    errorMessage?: string;
    hints?: string[];
    retryable?: boolean;
    approval?: ToolEnvelope["approval"];
  },
): ToolEnvelope {
  const report = validateProject(project);
  return {
    status: options.status,
    operation_id: options.operationId,
    project_id: project.id,
    revision: options.revision,
    created_ids: options.created ?? [],
    updated_ids: options.updated ?? [],
    deleted_ids: options.deleted ?? [],
    result: options.result ?? null,
    validation: {
      ok: report.ok,
      findings: report.findings,
      errors: report.errors.length,
      warnings: report.warnings.length,
    },
    provenance: {
      service: SERVICE_VERSION,
      tool_version: options.def?.version ?? "n/a",
      engine: ENGINE,
      calculated_at: new Date().toISOString(),
      model_revision: options.revision,
      source: options.source,
      actor_id: options.actorId,
    },
    invalidated: options.invalidated ?? [],
    warnings: options.warnings ?? [],
    retryable: options.retryable ?? false,
    error_code: options.errorCode,
    error_message: options.errorMessage,
    hints: options.hints,
    approval: options.approval,
  };
}

function failedEnvelope(
  project: Project,
  operationId: string,
  source: string,
  actorId: string,
  code: string,
  message: string,
  extra: { hints?: string[]; retryable?: boolean; def?: ToolDef } = {},
): ToolEnvelope {
  return envelope(project, {
    status: "failed",
    operationId,
    revision: project.revision,
    def: extra.def,
    source,
    actorId,
    errorCode: code,
    errorMessage: message,
    hints: extra.hints,
    retryable: extra.retryable ?? false,
  });
}

interface ResolvedActor {
  actorId: string;
  actorName: string;
  role: "owner" | "editor" | "viewer";
}
function actorOf(options: ExecuteToolOptions): ResolvedActor {
  return {
    actorId: options.actorId ?? "demo-user",
    actorName: options.actorName ?? (options.source === "agent" ? "VastiqX agent" : "Demo architect"),
    role: options.role ?? "owner",
  };
}

async function audit(
  projectId: string,
  data: {
    actorId: string;
    source: "ui" | "agent" | "system";
    tool: string;
    version: string;
    args: unknown;
    status: string;
    revision: number;
    created: string[];
    updated: string[];
    deleted: string[];
    errorCode?: string;
    durationMs: number;
    operationId: string;
    correlationId: string;
    approvalRef?: string;
    warnings: number;
    message?: string;
  },
): Promise<void> {
  await store.appendAudit(projectId, {
    id: newId("aud"),
    at: new Date().toISOString(),
    actorId: data.actorId,
    source: data.source,
    tool: data.tool,
    toolVersion: data.version,
    args: data.args,
    status: data.status,
    revision: data.revision,
    createdIds: data.created,
    updatedIds: data.updated,
    deletedIds: data.deleted,
    errorCode: data.errorCode,
    durationMs: data.durationMs,
    operationId: data.operationId,
    correlationId: data.correlationId,
    approvalRef: data.approvalRef,
    warnings: data.warnings,
    message: data.message,
  });
}

export async function executeTool(
  projectId: string,
  toolName: string,
  rawArgs: unknown,
  options: ExecuteToolOptions = {},
): Promise<ToolEnvelope> {
  const actor = actorOf(options);
  const source = options.source ?? "ui";
  const operationId = newId("op");
  const correlationId = options.correlationId ?? newId("corr");
  const def = TOOL_MAP.get(toolName);

  if (!def) {
    const project = await store.readProject(projectId);
    if (!project) {
      return {
        status: "failed",
        operation_id: operationId,
        project_id: projectId,
        revision: 0,
        created_ids: [],
        updated_ids: [],
        deleted_ids: [],
        result: null,
        validation: { ok: false, findings: [], errors: 0, warnings: 0 },
        provenance: {
          service: SERVICE_VERSION,
          tool_version: "n/a",
          engine: ENGINE,
          calculated_at: new Date().toISOString(),
          model_revision: 0,
          source,
          actor_id: actor.actorId,
        },
        invalidated: [],
        warnings: [],
        retryable: false,
        error_code: "UNKNOWN_TOOL",
        error_message: `Tool ${toolName} is not registered.`,
      };
    }
    return failedEnvelope(project, operationId, source, actor.actorId, "UNKNOWN_TOOL", `Tool ${toolName} is not registered.`);
  }

  if (SERVICE_ONLY_TOOLS.has(toolName)) {
    if (toolName === "approve_operation") {
      const args = rawArgs as { approval_id?: string };
      return approveOperation(projectId, String(args?.approval_id ?? ""), options);
    }
    if (toolName === "reject_operation") {
      const args = rawArgs as { approval_id?: string; reason?: string };
      return rejectOperation(projectId, String(args?.approval_id ?? ""), args?.reason, options);
    }
    if (toolName === "undo_operation") return undoOperation(projectId, options);
    return redoOperation(projectId, options);
  }

  if (def.permission !== "read" && actor.role === "viewer") {
    const project = await store.readProject(projectId);
    if (!project) return missingProject(projectId, operationId, source, actor.actorId);
    return failedEnvelope(project, operationId, source, actor.actorId, "FORBIDDEN", "Viewers cannot run write tools.");
  }
  if (def.permission === "admin" && actor.role !== "owner") {
    const project = await store.readProject(projectId);
    if (!project) return missingProject(projectId, operationId, source, actor.actorId);
    return failedEnvelope(project, operationId, source, actor.actorId, "FORBIDDEN", "Only the project owner can run this tool.");
  }

  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const project = await store.readProject(projectId);
    if (!project) return missingProject(projectId, operationId, source, actor.actorId);
    return failedEnvelope(
      project,
      operationId,
      source,
      actor.actorId,
      "VALIDATION_ERROR",
      `Invalid arguments for ${toolName}.`,
      {
        hints: parsed.error.issues.map((issue) => `${issue.path.join(".") || "args"}: ${issue.message}`),
        def,
      },
    );
  }

  if (options.idempotencyKey) {
    const cached = await store.getIdempotent(projectId, options.idempotencyKey);
    if (cached) return { ...(cached as ToolEnvelope), replayed: true };
  }

  const started = Date.now();

  return store.withProjectLock(projectId, async () => {
    const project = await store.readProject(projectId);
    if (!project) return missingProject(projectId, operationId, source, actor.actorId);

    if (options.idempotencyKey) {
      const cached = await store.getIdempotent(projectId, options.idempotencyKey);
      if (cached) return { ...(cached as ToolEnvelope), replayed: true };
    }

    if (options.expectedVersion !== undefined && options.expectedVersion !== project.revision) {
      const response = envelope(project, {
        status: "conflict",
        operationId,
        revision: project.revision,
        def,
        source,
        actorId: actor.actorId,
        errorCode: "STALE_REVISION",
        errorMessage: `Expected revision ${options.expectedVersion}, but the project is at revision ${project.revision}.`,
        hints: ["Refresh the project, replay the user's intent, and retry with the current revision."],
        retryable: true,
      });
      await audit(projectId, {
        actorId: actor.actorId,
        source,
        tool: toolName,
        version: def.version,
        args: parsed.data,
        status: "conflict",
        revision: project.revision,
        created: [],
        updated: [],
        deleted: [],
        errorCode: "STALE_REVISION",
        durationMs: Date.now() - started,
        operationId,
        correlationId,
        approvalRef: options.approvalReference,
        warnings: response.validation.warnings,
      });
      return response;
    }

    if (def.requiresApproval && !options.approvalReference) {
      let summary = `${toolName} on revision ${project.revision}.`;
      let affected: { kind: string; id: string; label: string }[] = [];
      let warnings: string[] = [];
      try {
        const preview = def.approval
          ? def.approval(parsed.data, project)
          : { summary, affected, warnings };
        summary = preview.summary;
        affected = preview.affected;
        warnings = preview.warnings;
      } catch (error) {
        if (error instanceof ToolError) {
          const response = failedEnvelope(project, operationId, source, actor.actorId, error.code, error.message, {
            hints: error.hints,
            def,
          });
          return response;
        }
        throw error;
      }
      const approval = await store.saveApproval({
        id: newId("apr"),
        projectId,
        tool: toolName,
        args: parsed.data,
        expectedVersion: project.revision,
        idempotencyKey: options.idempotencyKey ?? newId("idem"),
        summary,
        affected,
        warnings,
        status: "pending",
        requestedAt: new Date().toISOString(),
        requestedBy: actor.actorId,
      });
      const response = envelope(project, {
        status: "needs_approval",
        operationId,
        revision: project.revision,
        def,
        source,
        actorId: actor.actorId,
        invalidated: invalidationFor(def, undefined),
        warnings,
        errorCode: "APPROVAL_REQUIRED",
        errorMessage: "This operation requires explicit human approval before it can be committed.",
        retryable: true,
        approval: {
          approval_id: approval.id,
          summary,
          affected,
          warnings,
        },
      });
      await audit(projectId, {
        actorId: actor.actorId,
        source,
        tool: toolName,
        version: def.version,
        args: parsed.data,
        status: "needs_approval",
        revision: project.revision,
        created: [],
        updated: [],
        deleted: [],
        durationMs: Date.now() - started,
        operationId,
        correlationId,
        warnings: warnings.length,
        message: summary,
      });
      if (options.idempotencyKey) await store.putIdempotent(projectId, options.idempotencyKey, response);
      return response;
    }

    let approvalRef = options.approvalReference;
    if (approvalRef) {
      const approval = await store.getApproval(projectId, approvalRef);
      if (!approval) {
        return failedEnvelope(project, operationId, source, actor.actorId, "APPROVAL_NOT_FOUND", "The approval reference does not exist.", {
          def,
          retryable: false,
        });
      }
      if (approval.status === "rejected" || approval.status === "expired") {
        return failedEnvelope(project, operationId, source, actor.actorId, "APPROVAL_NOT_PENDING", `Approval ${approvalRef} is ${approval.status}.`, {
          def,
          retryable: false,
        });
      }
      if (approval.tool !== toolName) {
        return failedEnvelope(project, operationId, source, actor.actorId, "APPROVAL_MISMATCH", "The approval was requested for a different tool.", {
          def,
        });
      }
    } else {
      approvalRef = undefined;
    }

    const candidates = await store.readCandidates(projectId);
    const draft = structuredClone(project);
    const progress = options.progress ?? (() => {});
    const ctx = {
      projectId,
      actorId: actor.actorId,
      actorName: actor.actorName,
      role: actor.role,
      source,
      operationId,
      correlationId,
      now: new Date().toISOString(),
      candidates,
      progress: (event: ProgressEvent) => progress(event),
      readAudit: (limit = 40) => store.readAudit(projectId, limit),
    };

    let outcome;
    try {
      outcome = await def.handler(draft, parsed.data, ctx);
    } catch (error) {
      const toolError =
        error instanceof ToolError
          ? error
          : new ToolError("INTERNAL", error instanceof Error ? error.message : "Unexpected tool failure.", {
              retryable: false,
            });
      const response = failedEnvelope(project, operationId, source, actor.actorId, toolError.code, toolError.message, {
        hints: toolError.hints,
        retryable: toolError.retryable,
        def,
      });
      await audit(projectId, {
        actorId: actor.actorId,
        source,
        tool: toolName,
        version: def.version,
        args: parsed.data,
        status: "failed",
        revision: project.revision,
        created: [],
        updated: [],
        deleted: [],
        errorCode: toolError.code,
        durationMs: Date.now() - started,
        operationId,
        correlationId,
        approvalRef,
        warnings: response.validation.warnings,
        message: toolError.message,
      });
      if (options.idempotencyKey) await store.putIdempotent(projectId, options.idempotencyKey, response);
      return response;
    }

    if (outcome.candidates) {
      await store.saveCandidates(projectId, outcome.candidates);
    }

    if (!def.mutating || outcome.changed === false) {
      const response = envelope(project, {
        status: "succeeded",
        operationId,
        revision: project.revision,
        def,
        created: outcome.createdIds,
        updated: outcome.updatedIds,
        deleted: outcome.deletedIds,
        result: outcome.result,
        source,
        actorId: actor.actorId,
        invalidated: [],
        warnings: outcome.warnings,
      });
      await audit(projectId, {
        actorId: actor.actorId,
        source,
        tool: toolName,
        version: def.version,
        args: parsed.data,
        status: "succeeded",
        revision: project.revision,
        created: response.created_ids,
        updated: response.updated_ids,
        deleted: response.deleted_ids,
        durationMs: Date.now() - started,
        operationId,
        correlationId,
        approvalRef,
        warnings: response.validation.warnings,
      });
      if (options.idempotencyKey) await store.putIdempotent(projectId, options.idempotencyKey, response);
      return response;
    }

    const report = validateProject(draft);
    if (!report.ok) {
      const response = envelope(project, {
        status: "failed",
        operationId,
        revision: project.revision,
        def,
        source,
        actorId: actor.actorId,
        errorCode: "INVALID_GEOMETRY",
        errorMessage: `The change was rejected because it produced ${report.errors.length} blocking validation error(s).`,
        hints: report.errors.slice(0, 6).map((f) => f.message),
        warnings: outcome.warnings,
      });
      await audit(projectId, {
        actorId: actor.actorId,
        source,
        tool: toolName,
        version: def.version,
        args: parsed.data,
        status: "failed",
        revision: project.revision,
        created: [],
        updated: [],
        deleted: [],
        errorCode: "INVALID_GEOMETRY",
        durationMs: Date.now() - started,
        operationId,
        correlationId,
        approvalRef,
        warnings: report.warnings.length,
        message: response.error_message,
      });
      if (options.idempotencyKey) await store.putIdempotent(projectId, options.idempotencyKey, response);
      return response;
    }

    draft.revision = project.revision + 1;
    draft.updatedAt = new Date().toISOString();
    draft.schemaVersion = 1;

    await store.pushHistory(projectId, project);
    await store.saveProject(draft);

    if (approvalRef) {
      await store.updateApproval(projectId, approvalRef, {
        status: "approved",
        resolvedAt: new Date().toISOString(),
        resolvedBy: actor.actorId,
        resultRevision: draft.revision,
      });
    }

    const response = envelope(draft, {
      status: "succeeded",
      operationId,
      revision: draft.revision,
      def,
      created: outcome.createdIds,
      updated: outcome.updatedIds,
      deleted: outcome.deletedIds,
      result: outcome.result,
      source,
      actorId: actor.actorId,
      invalidated: invalidationFor(def, outcome.invalidated),
      warnings: outcome.warnings,
    });

    await audit(projectId, {
      actorId: actor.actorId,
      source,
      tool: toolName,
      version: def.version,
      args: parsed.data,
      status: "succeeded",
      revision: draft.revision,
      created: response.created_ids,
      updated: response.updated_ids,
      deleted: response.deleted_ids,
      durationMs: Date.now() - started,
      operationId,
      correlationId,
      approvalRef,
      warnings: response.validation.warnings,
      message: typeof outcome.result === "object" && outcome.result && "note" in outcome.result ? String((outcome.result as { note?: string }).note) : undefined,
    });

    if (options.idempotencyKey) await store.putIdempotent(projectId, options.idempotencyKey, response);
    return response;
  });
}

function missingProject(projectId: string, operationId: string, source: string, actorId: string): ToolEnvelope {
  return {
    status: "failed",
    operation_id: operationId,
    project_id: projectId,
    revision: 0,
    created_ids: [],
    updated_ids: [],
    deleted_ids: [],
    result: null,
    validation: { ok: false, findings: [], errors: 0, warnings: 0 },
    provenance: {
      service: SERVICE_VERSION,
      tool_version: "n/a",
      engine: ENGINE,
      calculated_at: new Date().toISOString(),
      model_revision: 0,
      source,
      actor_id: actorId,
    },
    invalidated: [],
    warnings: [],
    retryable: false,
    error_code: "PROJECT_NOT_FOUND",
    error_message: `Project ${projectId} does not exist.`,
  };
}

async function approveOperation(
  projectId: string,
  approvalId: string,
  options: ExecuteToolOptions,
): Promise<ToolEnvelope> {
  const actor = actorOf(options);
  const project = await store.readProject(projectId);
  if (!project) return missingProject(projectId, newId("op"), "ui", actor.actorId);
  const approval = approvalId ? await store.getApproval(projectId, approvalId) : null;
  if (!approval) {
    return failedEnvelope(project, newId("op"), "ui", actor.actorId, "APPROVAL_NOT_FOUND", "Approval request not found.");
  }
  if (approval.status === "rejected") {
    return failedEnvelope(project, newId("op"), "ui", actor.actorId, "APPROVAL_REJECTED", "This operation was rejected.");
  }
  if (approval.status === "expired") {
    return failedEnvelope(project, newId("op"), "ui", actor.actorId, "APPROVAL_EXPIRED", "This approval expired because the project changed.");
  }

  const response = await executeTool(projectId, approval.tool, approval.args, {
    ...options,
    source: "ui",
    approvalReference: approval.id,
    idempotencyKey: approval.idempotencyKey,
    expectedVersion: approval.expectedVersion,
  });

  if (response.status === "succeeded") {
    await store.updateApproval(projectId, approval.id, {
      status: "approved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: actor.actorId,
      resultRevision: response.revision,
    });
  } else if (response.status === "conflict") {
    await store.updateApproval(projectId, approval.id, {
      status: "expired",
      resolvedAt: new Date().toISOString(),
      resolvedBy: actor.actorId,
    });
  }
  return response;
}

async function rejectOperation(
  projectId: string,
  approvalId: string,
  reason: string | undefined,
  options: ExecuteToolOptions,
): Promise<ToolEnvelope> {
  const actor = actorOf(options);
  const project = await store.readProject(projectId);
  if (!project) return missingProject(projectId, newId("op"), "ui", actor.actorId);
  const approval = approvalId ? await store.getApproval(projectId, approvalId) : null;
  if (!approval) {
    return failedEnvelope(project, newId("op"), "ui", actor.actorId, "APPROVAL_NOT_FOUND", "Approval request not found.");
  }
  const updated = await store.updateApproval(projectId, approval.id, {
    status: "rejected",
    resolvedAt: new Date().toISOString(),
    resolvedBy: actor.actorId,
  });
  const operationId = newId("op");
  await audit(projectId, {
    actorId: actor.actorId,
    source: "ui",
    tool: "reject_operation",
    version: "1.0.0",
    args: { approval_id: approval.id, reason },
    status: "succeeded",
    revision: project.revision,
    created: [],
    updated: [],
    deleted: [],
    durationMs: 0,
    operationId,
    correlationId: newId("corr"),
    approvalRef: approval.id,
    warnings: 0,
    message: reason ?? "Rejected by user.",
  });
  return envelope(project, {
    status: "succeeded",
    operationId,
    revision: project.revision,
    source: "ui",
    actorId: actor.actorId,
    result: {
      rejected: true,
      approval_id: approval.id,
      tool: approval.tool,
      reason: reason ?? null,
      status: updated?.status ?? "rejected",
      note: "No change was made to the canonical model.",
    },
  });
}

async function undoOperation(projectId: string, options: ExecuteToolOptions): Promise<ToolEnvelope> {
  const actor = actorOf(options);
  return store.withProjectLock(projectId, async () => {
    const project = await store.readProject(projectId);
    if (!project) return missingProject(projectId, newId("op"), "ui", actor.actorId);
    const previous = await store.popUndo(projectId);
    if (!previous) {
      return failedEnvelope(project, newId("op"), "ui", actor.actorId, "NO_HISTORY", "There is no operation to undo.");
    }
    await store.pushRedo(projectId, project);
    const restored: Project = {
      ...previous,
      id: project.id,
      ownerId: project.ownerId,
      actorName: project.actorName,
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await store.saveProject(restored);
    const operationId = newId("op");
    await audit(projectId, {
      actorId: actor.actorId,
      source: "ui",
      tool: "undo_operation",
      version: "1.0.0",
      args: {},
      status: "succeeded",
      revision: restored.revision,
      created: [],
      updated: [],
      deleted: [],
      durationMs: 0,
      operationId,
      correlationId: newId("corr"),
      warnings: 0,
      message: `Undid change; restored revision ${previous.revision} as revision ${restored.revision}.`,
    });
    return envelope(restored, {
      status: "succeeded",
      operationId,
      revision: restored.revision,
      source: "ui",
      actorId: actor.actorId,
      result: {
        undone: true,
        restored_from_revision: previous.revision,
        note: "The previous canonical state is now the latest revision.",
      },
      invalidated: DEFAULT_INVALIDATIONS,
    });
  });
}

async function redoOperation(projectId: string, options: ExecuteToolOptions): Promise<ToolEnvelope> {
  const actor = actorOf(options);
  return store.withProjectLock(projectId, async () => {
    const project = await store.readProject(projectId);
    if (!project) return missingProject(projectId, newId("op"), "ui", actor.actorId);
    const next = await store.popRedo(projectId);
    if (!next) {
      return failedEnvelope(project, newId("op"), "ui", actor.actorId, "NO_HISTORY", "There is no operation to redo.");
    }
    await store.pushUndoOnly(projectId, project);
    const restored: Project = {
      ...next,
      id: project.id,
      ownerId: project.ownerId,
      actorName: project.actorName,
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await store.saveProject(restored);
    const operationId = newId("op");
    await audit(projectId, {
      actorId: actor.actorId,
      source: "ui",
      tool: "redo_operation",
      version: "1.0.0",
      args: {},
      status: "succeeded",
      revision: restored.revision,
      created: [],
      updated: [],
      deleted: [],
      durationMs: 0,
      operationId,
      correlationId: newId("corr"),
      warnings: 0,
      message: `Redid change; restored revision ${next.revision} as revision ${restored.revision}.`,
    });
    return envelope(restored, {
      status: "succeeded",
      operationId,
      revision: restored.revision,
      source: "ui",
      actorId: actor.actorId,
      result: { redone: true, restored_revision: next.revision },
      invalidated: DEFAULT_INVALIDATIONS,
    });
  });
}
