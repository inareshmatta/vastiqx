import { zodToJsonSchema } from "zod-to-json-schema";
import { projectTools } from "./projectTools";
import { spaceTools } from "./spaceTools";
import { generationTools } from "./generationTools";
import { designTools } from "./designTools";
import { furnitureTools } from "./furnitureTools";
import { analysisTools } from "./analysisTools";
import { exportTools } from "./exportTools";
import { governanceTools } from "./governanceTools";
import type { ToolDef } from "./types";

export const TOOLS: ToolDef[] = [
  ...projectTools,
  ...spaceTools,
  ...generationTools,
  ...designTools,
  ...furnitureTools,
  ...analysisTools,
  ...exportTools,
  ...governanceTools,
];

export const TOOL_MAP = new Map<string, ToolDef>(TOOLS.map((tool) => [tool.name, tool]));

export const SERVICE_ONLY_TOOLS = new Set([
  "approve_operation",
  "reject_operation",
  "undo_operation",
  "redo_operation",
]);

export const AGENT_EXCLUDED_TOOLS = new Set([
  "approve_operation",
  "reject_operation",
  "undo_operation",
  "redo_operation",
]);

export function toolGroups(): { group: string; tools: { name: string; description: string; permission: string; mutating: boolean; requires_approval: boolean }[] }[] {
  const groups = new Map<string, ToolDef[]>();
  for (const tool of TOOLS) {
    const list = groups.get(tool.group) ?? [];
    list.push(tool);
    groups.set(tool.group, list);
  }
  return [...groups.entries()].map(([group, tools]) => ({
    group,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      permission: t.permission,
      mutating: t.mutating,
      requires_approval: Boolean(t.requiresApproval),
    })),
  }));
}

export interface AgentToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * The agent model receives exactly the tools the manual UI can call, minus
 * approval / undo controls which remain user-only. There is no second
 * "AI backend" that can mutate the model.
 */
export function agentToolDefinitions(): AgentToolDefinition[] {
  return TOOLS.filter((tool) => !AGENT_EXCLUDED_TOOLS.has(tool.name)).map((tool) => {
    const schema = zodToJsonSchema(tool.schema, {
      target: "openAi",
      $refStrategy: "none",
    }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters:
          (schema as { type?: string }).type === "object"
            ? schema
            : { type: "object", properties: {}, additionalProperties: false },
      },
    };
  });
}

export function describeTool(name: string): string {
  return TOOL_MAP.get(name)?.description ?? "";
}
