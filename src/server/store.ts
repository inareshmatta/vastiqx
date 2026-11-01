import { promises as fs } from "node:fs";
import path from "node:path";
import { projectMetrics } from "@/domain/measure";
import type { LayoutCandidate, Project } from "@/domain/types";

export const DATA_DIR = process.env.VASTIQX_DATA_DIR || path.join(process.cwd(), ".data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const AUDIT_DIR = path.join(DATA_DIR, "audit");
const CANDIDATE_DIR = path.join(DATA_DIR, "candidates");
const APPROVAL_DIR = path.join(DATA_DIR, "approvals");
const IDEMPOTENCY_DIR = path.join(DATA_DIR, "idempotency");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const EXPORT_DIR = path.join(DATA_DIR, "exports");

const locks = new Map<string, Promise<void>>();

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

/**
 * Serialises read-modify-write cycles per project inside this process.
 * Production would use a database transaction with optimistic concurrency;
 * the revision precondition below still protects against stale callers.
 */
export async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const id = safeId(projectId);
  const previous = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  locks.set(id, chained);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(id) === chained) locks.delete(id);
  }
}

export function projectPath(id: string): string {
  return path.join(PROJECTS_DIR, `${safeId(id)}.json`);
}

export async function saveProject(project: Project): Promise<void> {
  await writeJson(projectPath(project.id), project);
}

export async function readProject(projectId: string): Promise<Project | null> {
  return readJson<Project | null>(projectPath(projectId), null);
}

export interface ProjectSummary {
  id: string;
  name: string;
  type: Project["type"];
  revision: number;
  updatedAt: string;
  plotArea: number;
  rooms: number;
  floors: number;
  city: string;
  builtUp: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureDir(PROJECTS_DIR);
  const files = await fs.readdir(PROJECTS_DIR);
  const out: ProjectSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const project = await readJson<Project | null>(path.join(PROJECTS_DIR, file), null);
    if (!project) continue;
    const metrics = projectMetrics(project);
    out.push({
      id: project.id,
      name: project.name,
      type: project.type,
      revision: project.revision,
      updatedAt: project.updatedAt,
      plotArea: project.site.area,
      rooms: metrics.roomCount,
      floors: project.floors.length,
      city: project.location.city,
      builtUp: Math.round(metrics.totalBuiltUp * 10) / 10,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function polygonAreaSafe(poly: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

export async function deleteProject(projectId: string): Promise<void> {
  const id = safeId(projectId);
  await fs.rm(projectPath(id), { force: true });
  await fs.rm(path.join(CANDIDATE_DIR, `${id}.json`), { force: true });
  await fs.rm(path.join(AUDIT_DIR, `${id}.jsonl`), { force: true });
  await fs.rm(path.join(HISTORY_DIR, `${id}.json`), { force: true });
  await fs.rm(path.join(EXPORT_DIR, id), { recursive: true, force: true });
}

/* ---------------- audit ---------------- */

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  source: "ui" | "agent" | "system";
  tool: string;
  toolVersion: string;
  args: unknown;
  status: string;
  revision: number;
  createdIds: string[];
  updatedIds: string[];
  deletedIds: string[];
  errorCode?: string;
  durationMs: number;
  operationId: string;
  correlationId: string;
  approvalRef?: string;
  warnings: number;
  message?: string;
}

export async function appendAudit(projectId: string, entry: AuditEntry): Promise<void> {
  await ensureDir(AUDIT_DIR);
  await fs.appendFile(path.join(AUDIT_DIR, `${safeId(projectId)}.jsonl`), JSON.stringify(entry) + "\n", "utf8");
}

export async function readAudit(projectId: string, limit = 60): Promise<AuditEntry[]> {
  const file = path.join(AUDIT_DIR, `${safeId(projectId)}.jsonl`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-Math.max(1, limit))
      .map((line) => {
        try {
          return JSON.parse(line) as AuditEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is AuditEntry => Boolean(e))
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/* ---------------- candidates (derived proposals, never canonical) ---------------- */

export async function saveCandidates(projectId: string, candidates: LayoutCandidate[]): Promise<void> {
  await writeJson(path.join(CANDIDATE_DIR, `${safeId(projectId)}.json`), {
    generatedAt: new Date().toISOString(),
    candidates,
  });
}

export async function readCandidates(projectId: string): Promise<LayoutCandidate[]> {
  const data = await readJson<{ candidates?: LayoutCandidate[] }>(
    path.join(CANDIDATE_DIR, `${safeId(projectId)}.json`),
    {},
  );
  return data.candidates ?? [];
}

/* ---------------- approvals ---------------- */

export interface ApprovalRecord {
  id: string;
  projectId: string;
  tool: string;
  args: unknown;
  expectedVersion: number;
  idempotencyKey: string;
  summary: string;
  affected: { kind: string; id: string; label: string }[];
  warnings: string[];
  status: "pending" | "approved" | "rejected" | "expired";
  requestedAt: string;
  requestedBy: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resultRevision?: number;
}

async function readApprovalMap(projectId: string): Promise<Record<string, ApprovalRecord>> {
  return readJson<Record<string, ApprovalRecord>>(path.join(APPROVAL_DIR, `${safeId(projectId)}.json`), {});
}

async function writeApprovalMap(projectId: string, map: Record<string, ApprovalRecord>): Promise<void> {
  await writeJson(path.join(APPROVAL_DIR, `${safeId(projectId)}.json`), map);
}

export async function saveApproval(record: ApprovalRecord): Promise<ApprovalRecord> {
  const map = await readApprovalMap(record.projectId);
  map[record.id] = record;
  await writeApprovalMap(record.projectId, map);
  return record;
}

export async function getApproval(projectId: string, approvalId: string): Promise<ApprovalRecord | null> {
  const map = await readApprovalMap(projectId);
  return map[approvalId] ?? null;
}

export async function listApprovals(projectId: string): Promise<ApprovalRecord[]> {
  const map = await readApprovalMap(projectId);
  return Object.values(map).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function updateApproval(projectId: string, approvalId: string, patch: Partial<ApprovalRecord>): Promise<ApprovalRecord | null> {
  const map = await readApprovalMap(projectId);
  const record = map[approvalId];
  if (!record) return null;
  map[approvalId] = { ...record, ...patch };
  await writeApprovalMap(projectId, map);
  return map[approvalId]!;
}

/* ---------------- idempotency ---------------- */

interface IdempotencyRecord {
  at: string;
  response: unknown;
}

export async function getIdempotent(projectId: string, key: string): Promise<unknown | null> {
  const map = await readJson<Record<string, IdempotencyRecord>>(
    path.join(IDEMPOTENCY_DIR, `${safeId(projectId)}.json`),
    {},
  );
  return map[key]?.response ?? null;
}

export async function putIdempotent(projectId: string, key: string, response: unknown): Promise<void> {
  const file = path.join(IDEMPOTENCY_DIR, `${safeId(projectId)}.json`);
  const map = await readJson<Record<string, IdempotencyRecord>>(file, {});
  map[key] = { at: new Date().toISOString(), response };
  const entries = Object.entries(map).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 250);
  await writeJson(file, Object.fromEntries(entries));
}

/* ---------------- undo / redo history ---------------- */

interface HistoryState {
  undo: Project[];
  redo: Project[];
}

export async function pushHistory(projectId: string, snapshot: Project): Promise<void> {
  const file = path.join(HISTORY_DIR, `${safeId(projectId)}.json`);
  const state = await readJson<HistoryState>(file, { undo: [], redo: [] });
  state.undo.push(snapshot);
  if (state.undo.length > 40) state.undo.shift();
  state.redo = [];
  await writeJson(file, state);
}

/** Append an undo snapshot without clearing the redo stack (used by redo). */
export async function pushUndoOnly(projectId: string, snapshot: Project): Promise<void> {
  const file = path.join(HISTORY_DIR, `${safeId(projectId)}.json`);
  const state = await readJson<HistoryState>(file, { undo: [], redo: [] });
  state.undo.push(snapshot);
  if (state.undo.length > 40) state.undo.shift();
  await writeJson(file, state);
}

export async function popUndo(projectId: string): Promise<Project | null> {
  const file = path.join(HISTORY_DIR, `${safeId(projectId)}.json`);
  const state = await readJson<HistoryState>(file, { undo: [], redo: [] });
  const previous = state.undo.pop() ?? null;
  if (!previous) return null;
  await writeJson(file, state);
  return previous;
}

export async function popRedo(projectId: string): Promise<Project | null> {
  const file = path.join(HISTORY_DIR, `${safeId(projectId)}.json`);
  const state = await readJson<HistoryState>(file, { undo: [], redo: [] });
  const next = state.redo.pop() ?? null;
  await writeJson(file, state);
  return next;
}

export async function pushRedo(projectId: string, snapshot: Project): Promise<void> {
  const file = path.join(HISTORY_DIR, `${safeId(projectId)}.json`);
  const state = await readJson<HistoryState>(file, { undo: [], redo: [] });
  state.redo.push(snapshot);
  if (state.redo.length > 40) state.redo.shift();
  await writeJson(file, state);
}

export async function historyDepth(projectId: string): Promise<{ undo: number; redo: number }> {
  const state = await readJson<HistoryState>(path.join(HISTORY_DIR, `${safeId(projectId)}.json`), {
    undo: [],
    redo: [],
  });
  return { undo: state.undo.length, redo: state.redo.length };
}

/* ---------------- artifacts ---------------- */

export interface Artifact {
  fileName: string;
  url: string;
  size: number;
  mime: string;
  createdAt: string;
  label: string;
}

const artifactMime = (name: string): string => {
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".dxf")) return "application/dxf";
  if (name.endsWith(".html")) return "text/html";
  if (name.endsWith(".json")) return "application/json";
  return "application/octet-stream";
};

export async function writeArtifact(
  projectId: string,
  fileName: string,
  data: Uint8Array | string,
  label: string,
): Promise<Artifact> {
  const dir = path.join(EXPORT_DIR, safeId(projectId));
  await ensureDir(dir);
  const file = path.join(dir, fileName);
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  await fs.writeFile(file, bytes);
  const stats = await fs.stat(file);
  return {
    fileName,
    url: `/api/projects/${projectId}/export/${encodeURIComponent(fileName)}`,
    size: stats.size,
    mime: artifactMime(fileName),
    createdAt: new Date().toISOString(),
    label,
  };
}

export async function listArtifacts(projectId: string): Promise<Artifact[]> {
  const dir = path.join(EXPORT_DIR, safeId(projectId));
  try {
    const files = await fs.readdir(dir);
    const out: Artifact[] = [];
    for (const file of files) {
      const stats = await fs.stat(path.join(dir, file));
      out.push({
        fileName: file,
        url: `/api/projects/${projectId}/export/${encodeURIComponent(file)}`,
        size: stats.size,
        mime: artifactMime(file),
        createdAt: stats.mtime.toISOString(),
        label: file,
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function readArtifact(projectId: string, fileName: string): Promise<Buffer | null> {
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return null;
  try {
    return await fs.readFile(path.join(EXPORT_DIR, safeId(projectId), fileName));
  } catch {
    return null;
  }
}
