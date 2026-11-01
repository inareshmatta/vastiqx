import type { Project } from "@/domain/types";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  role: AgentRole;
  content: string;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface AgentCallContext {
  project: Project;
  turn: number;
}

export interface AgentCompletion {
  content: string;
  toolCalls: AgentToolCall[];
}

export interface AgentModel {
  id: string;
  label: string;
  mode: "live" | "mock";
  model: string;
  complete(
    messages: AgentMessage[],
    tools: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[],
    context: AgentCallContext,
  ): Promise<AgentCompletion>;
}

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "assistant"; content: string; model: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | {
      type: "tool_result";
      name: string;
      status: string;
      revision: number;
      error_code?: string;
      error_message?: string;
      result?: unknown;
    }
  | { type: "candidates"; candidates: unknown[] }
  | { type: "project_changed"; revision: number; invalidated: string[] }
  | {
      type: "needs_approval";
      approval: { approval_id: string; summary: string; affected: { kind: string; id: string; label: string }[]; warnings: string[] };
      tool: string;
    }
  | { type: "done"; model: string; mode: "live" | "mock" }
  | { type: "error"; message: string };

export function messageToOpenAI(message: AgentMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}
