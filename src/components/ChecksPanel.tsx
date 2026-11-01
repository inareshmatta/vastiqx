"use client";

import type { ProjectView } from "@/server/derive";

interface ChecksPanelProps {
  view: ProjectView;
  busyTool: string | null;
  onTool: (tool: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function statusBadge(status: string) {
  return <span className={`badge ${status === "advisory" ? "advisory" : status === "not_assessed" ? "not_assessed" : status}`}>{status.replace(/_/g, " ")}</span>;
}

export function ChecksPanel({ view, busyTool, onTool }: ChecksPanelProps) {
  const vastu = view.vastu;
  const rules = view.rules;
  const findings = [...vastu.findings].sort((a, b) => {
    const order: Record<string, number> = { fail: 0, advisory: 1, not_assessed: 2, overridden: 3, pass: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        <div>
          <h3>Vastu advisory & jurisdiction checks</h3>
          <p>{vastu.profile.name} · {vastu.profile.version} · north {vastu.northBearing}°</p>
        </div>
        <div className="template-row">
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("run_vastu_analysis")}>Run Vastu</button>
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("validate_geometry")}>Validate geometry</button>
        </div>
      </div>

      <div className="cards-4">
        <div className="stat-card ok"><div className="l">Vastu pass</div><div className="v">{vastu.summary.pass}</div><div className="s">{vastu.summary.assessed} assessed</div></div>
        <div className="stat-card warn"><div className="l">Advisory</div><div className="v">{vastu.summary.advisory}</div><div className="s">{vastu.summary.overridden} overridden</div></div>
        <div className="stat-card fail"><div className="l">Vastu fail</div><div className="v">{vastu.summary.fail}</div><div className="s">Traditional guidance only</div></div>
        <div className="stat-card info"><div className="l">Not assessed</div><div className="v">{vastu.summary.not_assessed}</div><div className="s">Missing rooms or data</div></div>
      </div>

      <div className="note" style={{ marginTop: 10 }}>{vastu.disclaimer}</div>

      <div className="section-title">
        <h3>Vastu findings</h3>
        <p>severity, sector and a practical alternative</p>
      </div>
      <table className="data-table">
        <thead><tr><th>Finding</th><th>Status</th><th>Sector</th><th>Entity</th><th>Why & alternative</th></tr></thead>
        <tbody>
          {findings.map((finding) => (
            <tr key={finding.key}>
              <td>
                <b>{finding.title}</b>
                <div className="tiny muted">{finding.ruleId} · {finding.severity} · {finding.interpretation}</div>
              </td>
              <td>{statusBadge(finding.status)}</td>
              <td>{finding.sector ?? "—"}</td>
              <td>{finding.entityName || "—"}</td>
              <td className="tiny muted">
                {finding.explanation}
                <div style={{ marginTop: 3 }}><b>Alternative:</b> {finding.alternative}</div>
                <div className="formula">{finding.source}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-title">
        <h3>Jurisdiction pack</h3>
        <p>{rules.pack.name} · {rules.pack.effectiveDate} · indicative</p>
      </div>
      <div className="cards-3">
        <div className="stat-card ok"><div className="l">Pass</div><div className="v">{rules.summary.pass}</div></div>
        <div className="stat-card warn"><div className="l">Not assessed</div><div className="v">{rules.summary.not_assessed}</div></div>
        <div className="stat-card fail"><div className="l">Fail</div><div className="v">{rules.summary.fail}</div></div>
      </div>
      <table className="data-table" style={{ marginTop: 10 }}>
        <thead><tr><th>Rule</th><th>Status</th><th>Project value</th><th>Limit</th><th>Formula & source</th></tr></thead>
        <tbody>
          {rules.checks.map((check) => (
            <tr key={check.ruleId}>
              <td><b>{check.title}</b>{check.note && <div className="tiny muted">{check.note}</div>}</td>
              <td>{statusBadge(check.status)}</td>
              <td className="tiny muted">{check.value}</td>
              <td className="tiny muted">{check.limit}</td>
              <td className="tiny muted">{check.formula}<div className="formula">{check.source}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note warn" style={{ marginTop: 10 }}>{rules.disclaimer}</div>
    </div>
  );
}
