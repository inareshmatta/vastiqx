import type { z } from "zod";
import type { LayoutCandidate, Project } from "@/domain/types";
import type { AuditEntry } from "@/server/store";

export type ToolPermission = "read" | "write" | "admin";

export interface ToolContext {
  projectId: string;
  actorId: string;
  actorName: string;
  role: "owner" | "editor" | "viewer";
  source: "ui" | "agent" | "system";
  operationId: string;
  correlationId: string;
  now: string;
  candidates: LayoutCandidate[];
  progress: (event: ProgressEvent) => void;
  readAudit: (limit?: number) => Promise<AuditEntry[]>;
}

export type ProgressEvent =
  | { type: "candidate"; candidate: LayoutCandidate }
  | { type: "stage"; message: string; pct?: number };

export interface ToolOutcome {
  result: unknown;
  createdIds?: string[];
  updatedIds?: string[];
  deletedIds?: string[];
  invalidated?: string[];
  warnings?: string[];
  candidates?: LayoutCandidate[];
  changed?: boolean;
}

export interface ApprovalPreview {
  summary: string;
  affected: { kind: string; id: string; label: string }[];
  warnings: string[];
}

export interface ToolDef {
  name: string;
  version: string;
  group: string;
  description: string;
  permission: ToolPermission;
  mutating: boolean;
  requiresApproval?: boolean;
  schema: z.ZodTypeAny;
  handler: (draft: Project, args: any, ctx: ToolContext) => Promise<ToolOutcome> | ToolOutcome;
  approval?: (args: any, project: Project) => ApprovalPreview;
}

export class ToolError extends Error {
  code: string;
  details?: unknown;
  retryable: boolean;
  hints?: string[];

  constructor(code: string, message: string, options: { details?: unknown; retryable?: boolean; hints?: string[] } = {}) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.hints = options.hints;
  }
}

export interface ExecuteToolOptions {
  actorId?: string;
  actorName?: string;
  role?: "owner" | "editor" | "viewer";
  source?: "ui" | "agent" | "system";
  expectedVersion?: number;
  idempotencyKey?: string;
  approvalReference?: string;
  correlationId?: string;
  progress?: (event: ProgressEvent) => void;
}

export interface ToolEnvelope {
  status: "succeeded" | "rejected" | "needs_approval" | "conflict" | "failed";
  operation_id: string;
  project_id: string;
  revision: number;
  created_ids: string[];
  updated_ids: string[];
  deleted_ids: string[];
  result: unknown;
  validation: {
    ok: boolean;
    findings: import("@/domain/types").ValidationFinding[];
    errors: number;
    warnings: number;
  };
  provenance: {
    service: string;
    tool_version: string;
    engine: string;
    calculated_at: string;
    model_revision: number;
    source: string;
    actor_id: string;
  };
  invalidated: string[];
  warnings: string[];
  retryable: boolean;
  error_code?: string;
  error_message?: string;
  hints?: string[];
  approval?: {
    approval_id: string;
    summary: string;
    affected: { kind: string; id: string; label: string }[];
    warnings: string[];
  };
  replayed?: boolean;
}
