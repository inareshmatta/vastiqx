"use client";

import type { ProjectView } from "@/server/derive";

interface FilesPanelProps {
  view: ProjectView;
  busyTool: string | null;
  onTool: (tool: string, args?: Record<string, unknown>) => Promise<unknown>;
  onApprove: (approvalId: string) => Promise<void>;
  onReject: (approvalId: string) => Promise<void>;
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const EXPORTS = [
  { tool: "generate_project_report", label: "Full HTML report", hint: "plans, cost, materials, Vastu" },
  { tool: "export_pdf", label: "PDF report", hint: "paginated, print-ready" },
  { tool: "export_dxf", label: "DXF drawing", hint: "CAD layers in metres" },
  { tool: "export_svg_plan", label: "SVG plans", hint: "per-floor vector sheets" },
  { tool: "export_json", label: "Canonical JSON", hint: "schema + provenance" },
  { tool: "export_cost_csv", label: "Cost CSV", hint: "room and floor lines" },
];

export function FilesPanel({ view, busyTool, onTool, onApprove, onReject }: FilesPanelProps) {
  const pending = view.approvals.filter((approval) => approval.status === "pending");

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        <h3>Files, approvals and audit</h3>
        <p>revision {view.project.revision} · {view.artifacts.length} artifact(s)</p>
      </div>

      <div className="cards-3">
        {EXPORTS.map((item) => (
          <div className="stat-card" key={item.tool}>
            <div className="l">{item.label}</div>
            <div className="s" style={{ minHeight: 28 }}>{item.hint}</div>
            <button className="btn btn-xs btn-primary" style={{ marginTop: 8 }} disabled={!!busyTool} onClick={() => onTool(item.tool)}>
              {busyTool === item.tool ? "Working…" : "Generate"}
            </button>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <>
          <div className="section-title">
            <h3>Pending approvals</h3>
            <p>human decision required</p>
          </div>
          {pending.map((approval) => (
            <div className="approval-card" style={{ marginBottom: 8 }} key={approval.id}>
              <b>{approval.summary}</b>
              <div className="tiny muted">
                {approval.tool} · requested {when(approval.requestedAt)} · expected revision {approval.expectedVersion}
              </div>
              {approval.affected.length > 0 && (
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  Affects: {approval.affected.map((item) => item.label).join(", ")}
                </div>
              )}
              {approval.warnings.length > 0 && (
                <div className="tiny" style={{ color: "#8a5a1f", marginTop: 4 }}>{approval.warnings.join(" ")}</div>
              )}
              <div className="approval-actions">
                <button className="btn btn-xs btn-lime" onClick={() => onApprove(approval.id)}>Approve</button>
                <button className="btn btn-xs" onClick={() => onReject(approval.id)}>Reject</button>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="section-title">
        <h3>Downloads</h3>
        <p>artifacts are immutable once written</p>
      </div>
      {view.artifacts.length === 0 && (
        <div className="empty">
          <b>No files yet</b>
          Generate a report above. Every export requires your approval first.
        </div>
      )}
      {view.artifacts.map((artifact) => (
        <div className="file-row" key={artifact.fileName}>
          <div className="file-icon">{artifact.fileName.split(".").pop()?.slice(0, 4)}</div>
          <div className="meta">
            <b>{artifact.fileName}</b>
            <span>{bytes(artifact.size)} · {when(artifact.createdAt)} · {artifact.mime}</span>
          </div>
          <a className="btn btn-xs" href={artifact.url} download>Download</a>
        </div>
      ))}

      <div className="section-title">
        <h3>Checkpoints</h3>
        <p>{view.project.checkpoints.length} saved</p>
      </div>
      {view.project.checkpoints.length === 0 ? (
        <div className="note">No checkpoints yet. Use the Checkpoint button in the header to snapshot this revision.</div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Label</th><th>Revision</th><th>Created</th><th /></tr></thead>
          <tbody>
            {view.project.checkpoints.map((checkpoint) => (
              <tr key={checkpoint.id}>
                <td><b>{checkpoint.label}</b></td>
                <td>R{checkpoint.revision}</td>
                <td className="tiny muted">{when(checkpoint.createdAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="btn btn-xs"
                    disabled={!!busyTool}
                    onClick={() => onTool("restore_checkpoint", { checkpoint_id: checkpoint.id })}
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-title">
        <h3>Audit trail</h3>
        <p>newest first · {view.audit.length} entries</p>
      </div>
      <div>
        {view.audit.slice(0, 24).map((entry) => (
          <div className="audit-row" key={entry.id}>
            <span className={`badge ${entry.status === "succeeded" ? "succeeded" : entry.status === "failed" ? "failed" : "warn"}`}>{entry.status}</span>
            <div>
              <b className="mono" style={{ fontSize: 10 }}>{entry.tool}</b>
              <div className="tiny muted">
                {entry.source} · {entry.actorId} · R{entry.revision} · {entry.durationMs} ms
                {entry.message ? ` · ${entry.message}` : ""}
              </div>
            </div>
            <span className="t">{when(entry.at)}</span>
          </div>
        ))}
        {view.audit.length === 0 && <div className="empty">No audited operations yet.</div>}
      </div>

      <div className="note" style={{ marginTop: 12 }}>
        <b>Provenance.</b> {view.estimate.engineVersion} · {view.elevations.engineVersion} · {view.scene.engineVersion} · served{" "}
        {when(view.servedAt)}. The audit trail is append-only JSONL on the server; exports are written only after approval.
      </div>
    </div>
  );
}
