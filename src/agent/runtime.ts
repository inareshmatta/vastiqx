import { executeTool } from "@/server/service";
import * as store from "@/server/store";
import { agentToolDefinitions, TOOL_MAP } from "@/tools/registry";
import { MockAgent } from "./mock";
import { OpenRouterAgent, configuredModel, openRouterConfigured } from "./openrouter";
import type { AgentEvent, AgentMessage, AgentModel, AgentToolCall } from "./types";

const MAX_TURNS = 8;
const MAX_TOOL_MESSAGE_CHARS = 14_000;

export interface RunAgentInput {
  projectId: string;
  message: string;
  history?: AgentMessage[];
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
  correlationId?: string;
}

function systemPrompt(input: {
  projectName: string;
  revision: number;
  location: string;
  floors: number;
  rooms: number;
  mode: "live" | "mock";
  model: string;
}): string {
  return [
    "You are VastiqX, an agentic architecture and construction-planning workspace.",
    "",
    "Operating contract (release-blocking):",
    "1. You can ONLY change the project by calling the provided tools. Never calculate, invent or persist geometry, areas, costs, Vastu results or reports in prose. Every fact you state must come from a tool result.",
    "2. Read before write. Call get_project or get_revision before a state-changing step when you need ids, dimensions or the current revision.",
    "3. Approval, undo and redo are user-only. If a tool returns needs_approval, explain exactly what is pending and stop; never claim the change was committed.",
    "4. If a tool fails, state the error and the safest next action. Do not silently retry a different destructive operation.",
    "5. Room areas are exact clear-polygon areas; built-up area is a measured union. Never substitute one for the other. Use get_area_compliance when the user asks whether room areas add up.",
    "6. Canonical units are metres. When showing areas to the user, include m² and, where useful, ft² and gaj (1 gaj = 0.836127 m² = 9 ft²). Volumes are m³ with ft³/litres on request. Always label units.",
    "7. Design work: update the brief, then generate_layout_options, then apply_design_proposal. Candidates are proposals only until the user approves one.",
    "8. Façade / look: list_design_templates, set_facade_template, generate_elevations. Landscape: add_site_amenity. Templates are starting points, not a substitute for the user's brief. Modern façade styles are available.",
    "8b. Furniture: use list_furniture_catalog, add_furniture, move_furniture and remove_furniture. Furniture is a presentation layer only and must never change room area, built-up, Vastu, BOQ or cost.",
    "9. Cost: get_cost_breakdown for per-room and per-floor allocations; calculate_estimate for the project estimate; get_material_pack for bricks/cement/steel/finishes; convert_units for unit questions.",
    "10. Exports require approval. Tell the user which artefact is pending and that the Files tab will update after approval.",
    "11. Be concise and concrete. Prefer a short explanation plus the tool evidence. Never expose chain-of-thought.",
    "",
    `Project: ${input.projectName} · revision ${input.revision} · ${input.location} · ${input.floors} floor(s) · ${input.rooms} room(s).`,
    `Runtime: ${input.mode === "live" ? "live model" : "deterministic demo planner"} (${input.model}).`,
  ].join("\n");
}

function parseArgs(call: AgentToolCall): { args: unknown; error?: string } {
  try {
    const parsed = JSON.parse(call.arguments || "{}");
    if (parsed && typeof parsed === "object") return { args: parsed };
    return { args: {}, error: "Tool arguments must be a JSON object." };
  } catch (error) {
    return { args: {}, error: `Tool arguments were not valid JSON: ${(error as Error).message}` };
  }
}

function compactToolContent(envelope: Awaited<ReturnType<typeof executeTool>>): string {
  const payload = {
    status: envelope.status,
    revision: envelope.revision,
    result: envelope.result,
    warnings: envelope.warnings,
    invalidated: envelope.invalidated,
    error_code: envelope.error_code,
    error_message: envelope.error_message,
    hints: envelope.hints,
    approval: envelope.approval
      ? { approval_id: envelope.approval.approval_id, summary: envelope.approval.summary, warnings: envelope.approval.warnings }
      : undefined,
  };
  const text = JSON.stringify(payload);
  if (text.length <= MAX_TOOL_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_MESSAGE_CHARS)}\n...[tool result truncated for the model; the UI received the full envelope]`;
}

function candidatesFrom(result: unknown): unknown[] | null {
  if (!result || typeof result !== "object") return null;
  const value = (result as { candidates?: unknown }).candidates;
  return Array.isArray(value) ? value : null;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Runs a bounded multi-turn agent loop. The model never receives a direct
 * database handle: its only write path is the exact same service.executeTool
 * envelope that the manual UI uses, including approvals, validation and audit.
 */
export async function runAgent(input: RunAgentInput): Promise<void> {
  const { projectId, emit } = input;
  const project = await store.readProject(projectId);
  if (!project) {
    emit({ type: "error", message: `Project ${projectId} does not exist.` });
    return;
  }

  const configured = openRouterConfigured();
  let model: AgentModel = configured ? new OpenRouterAgent() : new MockAgent();
  let mode: "live" | "mock" = model.mode;
  let liveFailed = false;
  const modelId = configured ? configuredModel() : model.model;

  const rooms = project.floors.reduce((s, floor) => s + floor.rooms.length, 0);
  const messages: AgentMessage[] = [
    {
      role: "system",
      content: systemPrompt({
        projectName: project.name,
        revision: project.revision,
        location: `${project.location.city}, ${project.location.state}`,
        floors: project.floors.length,
        rooms,
        mode,
        model: modelId,
      }),
    },
    ...(input.history ?? []).filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    ),
    { role: "user", content: input.message },
  ];

  emit({
    type: "status",
    message: configured
      ? `Connecting to Gemma 4 via OpenRouter (${modelId}).`
      : "No OPENROUTER_API_KEY is configured, so the deterministic demo planner will execute the same domain tools.",
  });

  const tools = agentToolDefinitions();
  let finished = false;

  for (let turn = 0; turn < MAX_TURNS && !finished; turn++) {
    if (input.signal?.aborted) break;
    const current = await store.readProject(projectId);
    if (!current) {
      emit({ type: "error", message: "The project disappeared while the agent was running." });
      return;
    }

    let completion;
    try {
      completion = await model.complete(messages, tools, { project: current, turn });
    } catch (error) {
      if (mode === "live" && !liveFailed) {
        liveFailed = true;
        mode = "mock";
        model = new MockAgent();
        emit({
          type: "status",
          message: `Live Gemma 4 call failed (${safeError(error).slice(0, 220)}). Falling back to the deterministic planner so the workflow stays truthful and inspectable.`,
        });
        continue;
      }
      emit({ type: "error", message: `Agent model failed: ${safeError(error)}` });
      break;
    }

    if (completion.content.trim()) {
      emit({ type: "assistant", content: completion.content.trim(), model: model.label });
    }

    const calls = completion.toolCalls;
    if (calls.length === 0) {
      finished = true;
      break;
    }

    messages.push({
      role: "assistant",
      content: completion.content,
      toolCalls: calls,
    });

    for (const call of calls) {
      const definition = TOOL_MAP.get(call.name);
      const parsed = parseArgs(call);
      emit({
        type: "tool_call",
        id: call.id,
        name: call.name,
        args: parsed.args,
      });

      if (!definition) {
        emit({
          type: "tool_result",
          name: call.name,
          status: "failed",
          revision: current.revision,
          error_code: "UNKNOWN_TOOL",
          error_message: `Tool ${call.name} is not registered.`,
        });
        messages.push({
          role: "tool",
          name: call.name,
          toolCallId: call.id,
          content: JSON.stringify({ status: "failed", error_code: "UNKNOWN_TOOL", error_message: "Tool not registered." }),
        });
        continue;
      }

      if (parsed.error) {
        emit({
          type: "tool_result",
          name: call.name,
          status: "failed",
          revision: current.revision,
          error_code: "INVALID_TOOL_ARGUMENTS",
          error_message: parsed.error,
        });
        messages.push({
          role: "tool",
          name: call.name,
          toolCallId: call.id,
          content: JSON.stringify({ status: "failed", error_code: "INVALID_TOOL_ARGUMENTS", error_message: parsed.error }),
        });
        continue;
      }

      let envelope;
      try {
        envelope = await executeTool(projectId, call.name, parsed.args, {
          source: "agent",
          actorId: "vastiqx-agent",
          actorName: mode === "live" ? `Gemma 4 (${modelId})` : "Deterministic demo planner",
          role: "editor",
          correlationId: input.correlationId,
          progress: (event) => {
            if (event.type === "candidate") {
              emit({ type: "candidates", candidates: [event.candidate] });
            } else {
              emit({ type: "status", message: `${event.message}${event.pct !== undefined ? ` (${event.pct}%)` : ""}` });
            }
          },
        });
      } catch (error) {
        const message = safeError(error);
        emit({
          type: "tool_result",
          name: call.name,
          status: "failed",
          revision: current.revision,
          error_code: "AGENT_TOOL_EXCEPTION",
          error_message: message,
        });
        messages.push({
          role: "tool",
          name: call.name,
          toolCallId: call.id,
          content: JSON.stringify({ status: "failed", error_code: "AGENT_TOOL_EXCEPTION", error_message: message }),
        });
        continue;
      }

      if (envelope.status === "needs_approval" && envelope.approval) {
        emit({
          type: "needs_approval",
          approval: envelope.approval,
          tool: call.name,
        });
      }

      const candidates = candidatesFrom(envelope.result);
      if (candidates) emit({ type: "candidates", candidates });

      emit({
        type: "tool_result",
        name: call.name,
        status: envelope.status,
        revision: envelope.revision,
        error_code: envelope.error_code,
        error_message: envelope.error_message,
        result: envelope.result,
      });

      if (envelope.status === "succeeded" && envelope.invalidated.length > 0) {
        emit({ type: "project_changed", revision: envelope.revision, invalidated: envelope.invalidated });
      }

      messages.push({
        role: "tool",
        name: call.name,
        toolCallId: call.id,
        content: compactToolContent(envelope),
      });
    }
  }

  emit({ type: "done", model: model.label, mode });
}

export function agentStatus() {
  return {
    configured: openRouterConfigured(),
    mode: openRouterConfigured() ? ("live" as const) : ("mock" as const),
    model: openRouterConfigured() ? configuredModel() : "deterministic-demo-planner",
    provider: "OpenRouter",
    defaultModel: "google/gemma-4-31b-it",
    alternatives: ["google/gemma-4-26b-a4b-it", "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"],
    note: openRouterConfigured()
      ? "Live Gemma 4 tool-calling is enabled. If the provider call fails, the runtime falls back to the deterministic planner and says so."
      : "OPENROUTER_API_KEY is not set. The deterministic planner is active so every demo action still runs through the same typed domain tools.",
  };
}
