"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent } from "@/agent/types";
import type { LayoutCandidate, RoomType } from "@/domain/types";
import { formatArea, type AreaUnit } from "@/domain/units";
import type { ProjectView } from "@/server/derive";
import { BrandMark } from "./Brand";
import { ChecksPanel } from "./ChecksPanel";
import { CompliancePanel } from "./CompliancePanel";
import { CostPanel } from "./CostPanel";
import { ElevationsView } from "./ElevationsView";
import { FilesPanel } from "./FilesPanel";
import { Inspector } from "./Inspector";
import { PlanCanvas } from "./PlanCanvas";
import { RoomEditorBar } from "./RoomEditorBar";
import { Scene3D } from "./Scene3D";
import { area as areaLabel, compactMoney } from "./format";

type Tab = "plan" | "3d" | "elevations" | "cost" | "checks" | "compliance" | "files";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "error";
  text: string;
  toolName?: string;
  status?: string;
}

interface ApprovalLite {
  approval_id: string;
  summary: string;
  affected: { kind: string; id: string; label: string }[];
  warnings: string[];
}

export interface AgentInfo {
  configured: boolean;
  mode: "live" | "mock";
  model: string;
  provider: string;
  note: string;
}

interface WorkspaceProps {
  initialView: ProjectView;
  agent: AgentInfo;
}

const SUGGESTIONS = [
  "Redesign this as a Vastu-led 3-bedroom home",
  "Add a pool and a rear garden",
  "Show the front, back and side elevations",
  "Check area compliance",
  "Give me room-wise and floor-wise cost",
  "Generate the full report",
];

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function Workspace({ initialView, agent }: WorkspaceProps) {
  const projectId = initialView.project.id;
  const [view, setView] = useState<ProjectView>(initialView);
  const [tab, setTab] = useState<Tab>("plan");
  const [activeFloorId, setActiveFloorId] = useState(initialView.project.floors[0]?.id ?? "");
  const [visibleFloorIds, setVisibleFloorIds] = useState<string[]>(initialView.project.floors.map((floor) => floor.id));
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("sqm");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        `This is ${initialView.project.name}. I can redesign the plan, add landscape amenities, choose a façade, check Vastu and area compliance, cost the job room by room, and prepare the documents. ` +
        `Every change goes through the same typed tool as the manual UI. Applying a layout or generating a file asks for your approval.` +
        (agent.configured ? "" : " No OPENROUTER_API_KEY is set, so the deterministic demo planner is running the same tools."),
    },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState("");
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalLite | null>(null);
  const [approvalTool, setApprovalTool] = useState("");
  const [candidates, setCandidates] = useState<LayoutCandidate[]>(initialView.candidates);
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [mode, setMode] = useState(agent.mode);

  const versionRef = useRef(initialView.project.revision);
  const knownFloorIdsRef = useRef(new Set(initialView.project.floors.map((floor) => floor.id)));
  const logRef = useRef<HTMLDivElement | null>(null);

  const floors = view.project.floors;
  const floor = floors.find((item) => item.id === activeFloorId) ?? floors[0];
  const activeFloorIndex = Math.max(0, floors.findIndex((item) => item.id === floor?.id));
  const previewCandidate = candidates.find((candidate) => candidate.candidateId === previewCandidateId) ?? null;
  const previewFloor = previewCandidate ? (previewCandidate.floors[activeFloorIndex] ?? previewCandidate.floors[0] ?? null) : null;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, activity, running]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    const allowed: Tab[] = ["plan", "3d", "elevations", "cost", "checks", "compliance", "files"];
    if (requested && (allowed as string[]).includes(requested)) setTab(requested as Tab);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!floors.some((item) => item.id === activeFloorId) && floors[0]) setActiveFloorId(floors[0].id);
  }, [floors, activeFloorId]);

  useEffect(() => {
    if (visibleFloorIds.length > 0 && !visibleFloorIds.includes(activeFloorId)) {
      setActiveFloorId(visibleFloorIds[0]!);
    }
  }, [visibleFloorIds, activeFloorId]);

  function toggleFloor(floorId: string) {
    const visible = visibleFloorIds.includes(floorId);
    if (visible && visibleFloorIds.length === 1) {
      setToast({ message: "Keep at least one floor visible so the plan has context." });
      return;
    }
    const next = visible ? visibleFloorIds.filter((id) => id !== floorId) : [...visibleFloorIds, floorId];
    setVisibleFloorIds(next);
    if (!visible) setActiveFloorId(floorId);
    else if (activeFloorId === floorId) setActiveFloorId(next[0]!);
  }

  const refresh = useCallback(async (): Promise<ProjectView | null> => {
    const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (!response.ok) return null;
    const next = (await response.json()) as ProjectView;
    setView(next);
    versionRef.current = next.project.revision;
    setCandidates(next.candidates ?? []);
    setVisibleFloorIds((previous) => {
      const valid = previous.filter((id) => next.project.floors.some((floor) => floor.id === id));
      const added = next.project.floors
        .filter((floor) => !knownFloorIdsRef.current.has(floor.id))
        .map((floor) => floor.id);
      knownFloorIdsRef.current = new Set(next.project.floors.map((floor) => floor.id));
      return [...new Set([...valid, ...added])];
    });
    setActiveFloorId((previous) =>
      next.project.floors.some((item) => item.id === previous) ? previous : (next.project.floors[0]?.id ?? ""),
    );
    setSelectedRoomId((previous) =>
      next.project.floors.some((item) => item.rooms.some((room) => room.id === previous)) ? previous : null,
    );
    return next;
  }, [projectId]);

  const postTool = useCallback(
    async (tool: string, args: Record<string, unknown> = {}) => {
      const response = await fetch(`/api/projects/${projectId}/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool,
          args,
          expectedVersion: versionRef.current,
          idempotencyKey: `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok && !payload.status) {
        throw new Error((payload.error as string) ?? `Tool ${tool} failed with HTTP ${response.status}.`);
      }
      return payload;
    },
    [projectId],
  );

  const runTool = useCallback(
    async (tool: string, args: Record<string, unknown> = {}) => {
      setBusyTool(tool);
      try {
        const envelope = await postTool(tool, args);
        const status = String(envelope.status ?? "failed");
        const result = envelope.result as { candidates?: LayoutCandidate[]; summary?: string } | undefined;
        if (status === "needs_approval") {
          const approval = envelope.approval as ApprovalLite | undefined;
          if (approval) {
            setPendingApproval(approval);
            setApprovalTool(tool);
          }
          setToast({ message: "Approval required. Review the affected changes." });
        } else if (status === "failed") {
          setToast({ message: String(envelope.error_message ?? "The tool failed."), error: true });
        } else if (status === "conflict") {
          setToast({ message: "The revision changed. I refreshed the workspace; try again.", error: true });
          await refresh();
        } else {
          if (Array.isArray(result?.candidates) && result.candidates.length > 0) {
            setCandidates(result.candidates);
            setPreviewCandidateId(result.candidates[0]?.candidateId ?? null);
            setTab("plan");
          }
          if (tool === "apply_design_proposal") {
            setCandidates([]);
            setPreviewCandidateId(null);
          }
          if (Array.isArray(envelope.invalidated) && envelope.invalidated.length > 0) {
            await refresh();
          }
          setToast({ message: result?.summary ?? `${tool.replace(/_/g, " ")} succeeded at revision ${envelope.revision}.` });
        }
        return envelope;
      } catch (reason) {
        setToast({ message: reason instanceof Error ? reason.message : String(reason), error: true });
        return { status: "failed", error_message: reason instanceof Error ? reason.message : String(reason) } as Record<string, unknown>;
      } finally {
        setBusyTool(null);
      }
    },
    [postTool, refresh],
  );

  async function resolveApproval(approve: boolean, approvalId: string) {
    const tool = approve ? "approve_operation" : "reject_operation";
    setBusyTool(tool);
    try {
      const envelope = await postTool(tool, approve ? { approval_id: approvalId } : { approval_id: approvalId, reason: "Rejected by the user in the workspace." });
      if (envelope.status === "failed") {
        setToast({ message: String(envelope.error_message ?? "Approval could not be resolved."), error: true });
      } else {
        setPendingApproval(null);
        setToast({ message: approve ? "Approved and committed." : "Rejected. The canonical model is unchanged.", error: !approve });
        await refresh();
        if (approve && approvalTool === "apply_design_proposal") {
          setCandidates([]);
          setPreviewCandidateId(null);
          setSelectedRoomId(null);
        }
        if (approve) setTab("files");
      }
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : String(reason), error: true });
    } finally {
      setBusyTool(null);
    }
  }

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "status") {
        setActivity(event.message);
        return;
      }
      if (event.type === "assistant") {
        setMessages((previous) => [...previous, { id: newId("a"), role: "assistant", text: event.content }]);
        return;
      }
      if (event.type === "tool_call") {
        setMessages((previous) => [
          ...previous,
          {
            id: event.id,
            role: "tool",
            toolName: event.name,
            status: "running",
            text: JSON.stringify(event.args ?? {}),
          },
        ]);
        return;
      }
      if (event.type === "tool_result") {
        const result = event.result as { summary?: string; note?: string } | undefined;
        const text =
          event.error_message ??
          result?.summary ??
          result?.note ??
          `${event.status.replace(/_/g, " ")} · revision ${event.revision}`;
        setMessages((previous) => {
          const index = [...previous]
            .map((message, position) => ({ message, position }))
            .reverse()
            .find((entry) => entry.message.role === "tool" && entry.message.toolName === event.name && entry.message.status === "running");
          if (!index) {
            return [...previous, { id: newId("t"), role: "tool", toolName: event.name, status: event.status, text }];
          }
          const copy = [...previous];
          copy[index.position] = { ...copy[index.position]!, status: event.status, text };
          return copy;
        });
        return;
      }
      if (event.type === "candidates") {
        const incoming = (event.candidates as LayoutCandidate[]).filter((candidate) => candidate && candidate.candidateId);
        setCandidates((previous) => {
          const map = new Map(previous.map((candidate) => [candidate.candidateId, candidate]));
          for (const candidate of incoming) map.set(candidate.candidateId, candidate);
          return [...map.values()];
        });
        if (incoming[0]) setPreviewCandidateId((previous) => previous ?? incoming[0]!.candidateId);
        return;
      }
      if (event.type === "needs_approval") {
        setPendingApproval(event.approval);
        setApprovalTool(event.tool);
        setMessages((previous) => [
          ...previous,
          {
            id: newId("n"),
            role: "system",
            text: `Approval required: ${event.approval.summary}`,
          },
        ]);
        return;
      }
      if (event.type === "project_changed") {
        void refresh();
        return;
      }
      if (event.type === "done") {
        setMode(event.mode);
        setActivity("");
        return;
      }
      if (event.type === "error") {
        setMessages((previous) => [...previous, { id: newId("e"), role: "error", text: event.message }]);
        setActivity("");
      }
    },
    [refresh],
  );

  async function send(message: string) {
    const text = message.trim();
    if (!text || running) return;
    setInput("");
    setRunning(true);
    setActivity("Contacting the agent…");
    const history = messages
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-12)
      .map((item) => ({ role: item.role, content: item.text }));
    setMessages((previous) => [...previous, { id: newId("u"), role: "user", text }]);
    try {
      const response = await fetch(`/api/projects/${projectId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, correlationId: newId("corr") }),
      });
      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || `Agent request failed with HTTP ${response.status}.`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = chunk
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (data) {
            try {
              handleEvent(JSON.parse(data) as AgentEvent);
            } catch {
              setMessages((previous) => [...previous, { id: newId("e"), role: "error", text: "The agent stream returned malformed data." }]);
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (reason) {
      setMessages((previous) => [
        ...previous,
        { id: newId("e"), role: "error", text: reason instanceof Error ? reason.message : String(reason) },
      ]);
    } finally {
      setRunning(false);
      setActivity("");
      await refresh();
    }
  }

  async function handleAddRoom(roomInput: {
    name: string;
    type: RoomType;
    rect: { x: number; y: number; width: number; depth: number };
  }) {
    if (!floor) return;
    const sameType = floor.rooms.filter((item) => item.type === roomInput.type).length;
    const envelope = await runTool("add_room", {
      floor_id: floor.id,
      name: sameType > 0 ? `${roomInput.name} ${sameType + 1}` : roomInput.name,
      type: roomInput.type,
      rect: roomInput.rect,
    });
    const created = envelope.created_ids as string[] | undefined;
    if (created?.[0]) setSelectedRoomId(created[0]);
    setTab("plan");
  }

  const activeFloor = floor ?? floors[0]!;
  const selectedRoom = activeFloor.rooms.find((room) => room.id === selectedRoomId) ?? null;
  const candidatePreviewLabel = previewCandidate ? `${previewCandidate.name} (proposal)` : undefined;

  const planMetrics = view.metrics;
  const estimate = view.estimate;

  return (
    <div className="workspace">
      <header className="ws-header">
        <Link href="/" className="ws-brand" aria-label="VastiqX home">
          <BrandMark size={34} />
          <div className="ws-project">
            <b>{view.project.name}</b>
            <span>Revision {view.project.revision} · {view.project.location.city} · {view.project.floors.length} floor(s)</span>
          </div>
        </Link>
        <span className={`badge ${mode === "live" ? "lime" : "warn"}`}>
          {mode === "live" ? "Gemma 4 live" : "Demo planner"}
        </span>
        <span className="badge muted">AI = typed tools</span>
        <div className="ws-header-actions">
          <button className="btn btn-xs" aria-expanded={chatOpen} onClick={() => setChatOpen((open) => !open)}>
            {chatOpen ? "Hide agent" : "Show agent"}
          </button>
          <button className="btn btn-xs" disabled={view.history.undo === 0 || !!busyTool} onClick={() => runTool("undo_operation")}>
            Undo
          </button>
          <button className="btn btn-xs" disabled={view.history.redo === 0 || !!busyTool} onClick={() => runTool("redo_operation")}>
            Redo
          </button>
          <button
            className="btn btn-xs"
            disabled={!!busyTool}
            onClick={() => {
              const label = window.prompt("Checkpoint label", `Revision ${view.project.revision} checkpoint`);
              if (label) void runTool("create_checkpoint", { label });
            }}
          >
            Checkpoint
          </button>
          <select
            aria-label="Area unit"
            value={areaUnit}
            onChange={(event) => setAreaUnit(event.target.value as AreaUnit)}
            style={{ border: "1px solid var(--line-dark)", borderRadius: 999, background: "#fffdf7", padding: "5px 9px", fontSize: 11 }}
          >
            <option value="sqm">m²</option>
            <option value="sqft">ft²</option>
            <option value="gaj">gaj</option>
          </select>
          <button className="btn btn-xs right-drawer-toggle" style={{ display: "none" }} onClick={() => setInspectorOpen(true)}>
            Inspector
          </button>
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => runTool("generate_project_report")}>
            Report
          </button>
          <Link className="btn btn-xs btn-ghost" href="/dashboard">Projects</Link>
        </div>
      </header>

      <div className={`ws-grid ${chatOpen ? "" : "chat-collapsed"}`}>
        <aside className="ws-panel left" hidden={!chatOpen}>
          <div className="ws-panel-head">
            <span className="dot" style={{ background: running ? "var(--amber)" : "var(--lime)" }} />
            <h2>Agent</h2>
            <span className="tiny muted" style={{ marginLeft: "auto" }}>{mode === "live" ? "Gemma 4 · OpenRouter" : "deterministic"}</span>
          </div>
          <div className="ws-panel-body chat-log" ref={logRef}>
            {messages.map((message) => {
              if (message.role === "tool") {
                const ok = message.status === "succeeded";
                const failed = message.status === "failed";
                return (
                  <div className={`tool-chip ${ok ? "ok" : failed ? "fail" : ""}`} key={message.id}>
                    <b>{message.toolName}</b>
                    <span className="tiny muted" style={{ maxWidth: "100%" }}>{message.text}</span>
                    <span className="status">{message.status ?? "running"}</span>
                  </div>
                );
              }
              if (message.role === "system") {
                return <div className="msg system" key={message.id}>{message.text}</div>;
              }
              if (message.role === "error") {
                return <div className="msg error" key={message.id}>{message.text}</div>;
              }
              return (
                <div className={`msg ${message.role}`} key={message.id}>
                  {message.role === "assistant" && <div className="who">VastiqX · {mode === "live" ? "Gemma 4" : "demo planner"}</div>}
                  {message.text}
                </div>
              );
            })}
            {activity && (
              <div className="msg system">
                <span className="dot amber" style={{ marginRight: 6 }} />
                {activity}
              </div>
            )}
          </div>
          <div className="suggestions">
            {SUGGESTIONS.slice(0, 4).map((suggestion) => (
              <button className="suggestion" key={suggestion} disabled={running} onClick={() => send(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
          <div className="chat-compose">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask VastiqX to redesign, add a pool, set a façade, check compliance or cost the job…"
              aria-label="Message the agent"
            />
            <div className="compose-row">
              <span className="tiny muted">
                {agent.configured ? "Live Gemma 4 · tools only" : "No API key · mock planner, real tools"}
              </span>
              <button className="btn btn-primary btn-sm" disabled={running || !input.trim()} onClick={() => send(input)}>
                {running ? "Thinking…" : "Send →"}
              </button>
            </div>
          </div>
        </aside>

        <main className="ws-center">
          <div className="ws-tabs" role="tablist" aria-label="Workspace views">
            {([
              ["plan", "Plan", view.metrics.roomCount],
              ["3d", "3D", 0],
              ["elevations", "Elevations", 4],
              ["cost", "Cost", view.breakdown.rooms.length],
              ["checks", "Vastu & checks", view.vastu.findings.length],
              ["compliance", "Compliance", view.compliance.floors.length],
              ["files", "Files", view.artifacts.length],
            ] as [Tab, string, number][]).map(([id, label, count]) => (
              <button key={id} className={`ws-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>
                {label}
                {count > 0 && <span className="count">{count}</span>}
              </button>
            ))}
          </div>

          <div className="ws-content">
            <div className="metric-strip">
              <div className="m"><div className="l">Plot</div><div className="v">{areaLabel(planMetrics.plotArea, areaUnit, 1)}</div></div>
              <div className="m"><div className="l">Built-up</div><div className="v">{areaLabel(planMetrics.totalBuiltUp, areaUnit, 1)}</div></div>
              <div className="m"><div className="l">Carpet</div><div className="v">{areaLabel(planMetrics.totalCarpet, areaUnit, 1)}</div></div>
              <div className="m"><div className="l">Coverage</div><div className="v">{(planMetrics.groundCoverageRatio * 100).toFixed(1)}<small>%</small></div></div>
              <div className="m"><div className="l">Estimate</div><div className="v">{compactMoney(estimate.totals.total)}</div></div>
              <div className="m"><div className="l">Vastu</div><div className="v">{view.vastu.summary.pass}<small> pass</small></div></div>
            </div>

            {tab === "plan" && activeFloor && (
              <div>
                <div className="floor-bar">
                  <div className="floor-toggles" aria-label="Visible floors">
                    {floors.map((item) => {
                      const visible = visibleFloorIds.includes(item.id);
                      const active = item.id === activeFloor.id;
                      return (
                        <span className={`floor-chip ${visible ? "on" : ""} ${active ? "active" : ""}`} key={item.id}>
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={() => toggleFloor(item.id)}
                            aria-label={`Show ${item.name} rooms`}
                          />
                          <button
                            type="button"
                            className="floor-name"
                            onClick={() => {
                              if (!visible) setVisibleFloorIds((current) => [...current, item.id]);
                              setActiveFloorId(item.id);
                            }}
                          >
                            {item.name}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => setVisibleFloorIds(floors.map((item) => item.id))}
                  >
                    All floors
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => setVisibleFloorIds([activeFloor.id])}
                  >
                    Active only
                  </button>
                  <button className="btn btn-xs" disabled={!!busyTool || floors.length >= 4} onClick={() => runTool("add_floor", { height: 3.05 })}>
                    + Floor
                  </button>
                  <div style={{ marginLeft: "auto" }} className="template-row">
                    <span className="tiny muted">Active: {activeFloor.name} · {visibleFloorIds.length} visible</span>
                    <button className="btn btn-xs" disabled={!!busyTool} onClick={() => runTool("generate_layout_options", { max_options: 3 })}>
                      Generate 3 options
                    </button>
                    <button className="btn btn-xs" disabled={!!busyTool} onClick={() => runTool("validate_geometry")}>
                      Validate
                    </button>
                  </div>
                </div>

                {previewFloor ? (
                  <div className="manual-hint">
                    <b>Proposal preview.</b> This layout is not committed. Apply the proposal with approval, or clear the preview to return to manual editing.
                  </div>
                ) : selectedRoom ? (
                  <RoomEditorBar
                    room={selectedRoom}
                    floor={activeFloor}
                    busy={!!busyTool}
                    onTool={runTool}
                    onClear={() => setSelectedRoomId(null)}
                  />
                ) : (
                  <div className="manual-hint">
                    <b>Manual design:</b> tap any room to edit its name, type, exact width/depth and openings. Or choose <b>Draw room</b> and drag a rectangle. Select a room to drag its lime corner handles for direct resize.
                  </div>
                )}

                {candidates.length > 0 && (
                  <>
                    <div className="section-title" style={{ marginTop: 0 }}>
                      <h3>Layout proposals</h3>
                      <p>hover to preview · apply requires approval</p>
                    </div>
                    <div className="candidate-tray">
                      {candidates.map((candidate) => (
                        <div
                          key={candidate.candidateId}
                          className={`candidate-card ${previewCandidateId === candidate.candidateId ? "active" : ""}`}
                          onMouseEnter={() => setPreviewCandidateId(candidate.candidateId)}
                          onFocus={() => setPreviewCandidateId(candidate.candidateId)}
                          tabIndex={0}
                        >
                          <h4>{candidate.name}</h4>
                          <p>{candidate.description}</p>
                          <div className="score-row">
                            <span>score <b>{Math.round(candidate.scores.total * 100)}</b>/100</span>
                            <span>vastu <b>{Math.round(candidate.scores.vastu_alignment * 100)}</b></span>
                            <span>daylight <b>{Math.round(candidate.scores.daylight_potential * 100)}</b></span>
                          </div>
                          <div className="score-row">
                            <span>built-up <b>{candidate.metrics.totalBuiltUp.toFixed(1)} m²</b></span>
                            <span>est. <b>{compactMoney(candidate.estimateTotal)}</b></span>
                          </div>
                          <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                            <button className="btn btn-xs" onClick={() => setPreviewCandidateId(candidate.candidateId)}>
                              Preview
                            </button>
                            <button
                              className="btn btn-xs btn-lime"
                              disabled={!!busyTool}
                              onClick={(event) => {
                                event.stopPropagation();
                                void runTool("apply_design_proposal", { candidate_id: candidate.candidateId });
                              }}
                            >
                              Apply…
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        className="btn btn-xs btn-ghost"
                        style={{ alignSelf: "center" }}
                        onClick={() => { setPreviewCandidateId(null); setCandidates([]); }}
                      >
                        Clear proposals
                      </button>
                    </div>
                  </>
                )}

                <PlanCanvas
                  project={view.project}
                  floor={previewFloor ?? activeFloor}
                  proposal={Boolean(previewFloor)}
                  proposalName={candidatePreviewLabel}
                  selectedRoomId={previewFloor ? null : selectedRoomId}
                  onSelectRoom={setSelectedRoomId}
                  onAddRoom={handleAddRoom}
                  busy={!!busyTool}
                  areaUnit={areaUnit}
                  visibleFloors={floors.filter((item) => visibleFloorIds.includes(item.id))}
                  onResizeRoom={previewFloor ? undefined : async ({ roomId, width, depth, anchor }) => {
                    await runTool("resize_room", {
                      room_id: roomId,
                      width_m: width,
                      depth_m: depth,
                      anchor,
                    });
                  }}
                />

                <div className="section-title">
                  <h3>Room dimensions</h3>
                  <p>{view.schedule.rows.filter((row) => visibleFloorIds.includes(row.floorId)).length} rooms on visible floors · click a row to select</p>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Floor</th>
                      <th>Room</th>
                      <th>Type</th>
                      <th className="num">Width</th>
                      <th className="num">Depth</th>
                      <th className="num">Clear area</th>
                      <th className="num">ft² / gaj</th>
                      <th className="num">Perimeter</th>
                      <th>Direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.schedule.rows
                      .filter((row) => visibleFloorIds.includes(row.floorId))
                      .map((row) => (
                        <tr
                          className="clickable"
                          key={row.roomId}
                          onClick={() => {
                            setActiveFloorId(row.floorId);
                            setSelectedRoomId(row.roomId);
                          }}
                        >
                          <td className="tiny muted">{row.floor}</td>
                          <td><b>{row.room}</b></td>
                          <td className="tiny muted">{row.type}</td>
                          <td className="num">{row.width.toFixed(2)} m</td>
                          <td className="num">{row.depth.toFixed(2)} m</td>
                          <td className="num">{formatArea(row.area, areaUnit)}</td>
                          <td className="num tiny muted">{formatArea(row.area, "sqft")} · {formatArea(row.area, "gaj")}</td>
                          <td className="num">{row.perimeter.toFixed(2)} m</td>
                          <td className="tiny muted">{row.direction}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                <div className="cards-2" style={{ marginTop: 10 }}>
                  <div className="stat-card">
                    <div className="l">This floor</div>
                    <div className="kv"><span>Rooms</span><b>{activeFloor.rooms.length}</b></div>
                    <div className="kv"><span>Walls</span><b>{activeFloor.walls.length}</b></div>
                    <div className="kv"><span>Openings</span><b>{activeFloor.walls.reduce((sum, wall) => sum + wall.openings.length, 0)}</b></div>
                    <div className="kv"><span>Height</span><b>{activeFloor.height.toFixed(2)} m</b></div>
                  </div>
                  <div className="stat-card">
                    <div className="l">Plan method</div>
                    <div className="tiny muted" style={{ marginTop: 5 }}>{planMetrics.methods.roomArea}</div>
                    <div className="tiny muted" style={{ marginTop: 5 }}>{planMetrics.methods.builtUp}</div>
                    <div className="tiny muted" style={{ marginTop: 5 }}>North bearing {view.project.site.northBearing}°; amenities excluded from built-up.</div>
                  </div>
                </div>
              </div>
            )}

            {tab === "3d" && (
              <div>
                <div className="section-title" style={{ marginTop: 0 }}>
                  <h3>3D massing</h3>
                  <p>{view.scene.counts.boxes} boxes · {view.scene.counts.walls} walls · {view.scene.counts.openings} openings</p>
                </div>
                <Scene3D scene={view.scene} />
                <div className="cards-4" style={{ marginTop: 10 }}>
                  <div className="stat-card"><div className="l">Floors</div><div className="v">{view.scene.floors.length}</div><div className="s">stacked elevations</div></div>
                  <div className="stat-card"><div className="l">Façade</div><div className="v" style={{ fontSize: 16 }}>{view.scene.facade.name}</div><div className="s">{view.scene.facade.roof.replace(/_/g, " ")}</div></div>
                  <div className="stat-card"><div className="l">Footprint</div><div className="v">{view.scene.bounds.width.toFixed(1)} × {view.scene.bounds.depth.toFixed(1)} m</div><div className="s">plot {view.scene.plot.width.toFixed(1)} × {view.scene.plot.depth.toFixed(1)} m</div></div>
                  <div className="stat-card"><div className="l">Site + furniture</div><div className="v">{view.scene.counts.amenities} / {view.scene.counts.furniture}</div><div className="s">amenities / furniture items</div></div>
                </div>
                <div className="note" style={{ marginTop: 10 }}>
                  Massing is generated deterministically from walls, openings, slabs and the active façade palette. Drag to orbit; scroll to zoom. Door and window trim is presentational, not a construction model.
                </div>
              </div>
            )}

            {tab === "elevations" && <ElevationsView elevations={view.elevations} />}

            {tab === "cost" && (
              <CostPanel view={view} areaUnit={areaUnit} busyTool={busyTool} onTool={runTool} onUnitChange={setAreaUnit} />
            )}

            {tab === "checks" && <ChecksPanel view={view} busyTool={busyTool} onTool={runTool} />}

            {tab === "compliance" && (
              <CompliancePanel view={view} areaUnit={areaUnit} onUnitChange={setAreaUnit} onTool={runTool} busyTool={busyTool} />
            )}

            {tab === "files" && (
              <FilesPanel view={view} busyTool={busyTool} onTool={runTool} onApprove={(id) => resolveApproval(true, id)} onReject={(id) => resolveApproval(false, id)} />
            )}
          </div>
        </main>

        <aside className="ws-panel right">
          <div className="ws-panel-head">
            <h2>Inspector</h2>
            <span className="tiny muted" style={{ marginLeft: "auto" }}>{floors.length} floor(s)</span>
          </div>
          <div className="ws-panel-body">
            {activeFloor && (
              <Inspector
                view={view}
                floor={activeFloor}
                selectedRoomId={selectedRoomId}
                areaUnit={areaUnit}
                busyTool={busyTool}
                onSelectRoom={setSelectedRoomId}
                onTool={runTool}
                onApprove={(id) => resolveApproval(true, id)}
                onReject={(id) => resolveApproval(false, id)}
              />
            )}
          </div>
        </aside>
      </div>

      {pendingApproval && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Approval required">
          <div className="modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Human approval</span>
                <h2 style={{ marginTop: 4 }}>Commit this change?</h2>
              </div>
              <button className="btn btn-xs btn-ghost" onClick={() => setPendingApproval(null)}>Close</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, fontWeight: 600 }}>{pendingApproval.summary}</p>
              <p className="tiny muted" style={{ marginTop: 5 }}>
                Tool <span className="mono">{approvalTool}</span>. The canonical model is unchanged until you approve.
              </p>
              {pendingApproval.affected.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="l tiny muted">Affected</div>
                  <ul style={{ paddingLeft: 16, fontSize: 12 }}>
                    {pendingApproval.affected.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>{item.label} <span className="tiny muted">({item.kind})</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {pendingApproval.warnings.length > 0 && (
                <div className="note warn" style={{ marginTop: 12 }}>
                  {pendingApproval.warnings.map((warning) => <div key={warning}>{warning}</div>)}
                </div>
              )}
              <div className="note" style={{ marginTop: 12 }}>
                Approving executes the exact validated tool against the expected revision. If the revision moved, the service will reject the stale approval instead of overwriting newer work.
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" disabled={!!busyTool} onClick={() => resolveApproval(false, pendingApproval.approval_id)}>Reject</button>
              <button className="btn btn-primary" disabled={!!busyTool} onClick={() => resolveApproval(true, pendingApproval.approval_id)}>
                {busyTool ? "Working…" : "Approve & commit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {inspectorOpen && activeFloor && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Inspector">
          <div className="modal" style={{ width: "min(520px, 100%)" }}>
            <div className="modal-head">
              <h2>Inspector</h2>
              <button className="btn btn-xs btn-ghost" onClick={() => setInspectorOpen(false)}>Close</button>
            </div>
            <div className="modal-body">
              <Inspector
                view={view}
                floor={activeFloor}
                selectedRoomId={selectedRoomId}
                areaUnit={areaUnit}
                busyTool={busyTool}
                onSelectRoom={setSelectedRoomId}
                onTool={runTool}
                onApprove={(id) => resolveApproval(true, id)}
                onReject={(id) => resolveApproval(false, id)}
              />
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.error ? "error" : ""}`}>{toast.message}</div>}
    </div>
  );
}
