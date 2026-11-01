import type { AgentCallContext, AgentCompletion, AgentMessage, AgentModel, AgentToolCall } from "./types";
import { messageToOpenAI } from "./types";

const DEFAULT_MODEL = "google/gemma-4-31b-it";

function parseFallbackToolCalls(content: string): AgentToolCall[] {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      tool_calls?: { name?: string; arguments?: unknown }[];
      tool?: string;
      arguments?: unknown;
    };
    if (Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls
        .filter((call) => typeof call.name === "string")
        .map((call, index) => ({
          id: `call_fallback_${index}`,
          name: call.name!,
          arguments: JSON.stringify(call.arguments ?? {}),
        }));
    }
    if (typeof parsed.tool === "string") {
      return [
        {
          id: "call_fallback_0",
          name: parsed.tool,
          arguments: JSON.stringify(parsed.arguments ?? {}),
        },
      ];
    }
  } catch {
    return [];
  }
  return [];
}

export class OpenRouterAgent implements AgentModel {
  id = "openrouter";
  mode = "live" as const;
  model: string;
  label: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey?: string; model?: string; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = options.model ?? process.env.OPENROUTER_MODEL ?? process.env.GEMMA_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.label = `Gemma 4 via OpenRouter · ${this.model}`;
  }

  async complete(
    messages: AgentMessage[],
    tools: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[],
    _context: AgentCallContext,
  ): Promise<AgentCompletion> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured. Set it in .env.local and restart the server.");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": "VastiqX",
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(messageToOpenAI),
        tools,
        tool_choice: "auto",
        temperature: 0.15,
        max_tokens: 2400,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 600)}`);
    }

    const payload = (await response.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        };
      }[];
      error?: { message?: string };
    };

    if (payload.error?.message) throw new Error(`OpenRouter: ${payload.error.message}`);

    const message = payload.choices?.[0]?.message;
    const content = message?.content ?? "";
    const toolCalls: AgentToolCall[] = (message?.tool_calls ?? [])
      .filter((call) => call.function?.name)
      .map((call, index) => ({
        id: call.id ?? `call_${index}`,
        name: call.function!.name!,
        arguments: call.function!.arguments ?? "{}",
      }));

    if (toolCalls.length > 0) return { content, toolCalls };
    const fallback = parseFallbackToolCalls(content);
    return { content, toolCalls: fallback };
  }
}

export function openRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function configuredModel(): string {
  return process.env.OPENROUTER_MODEL ?? process.env.GEMMA_MODEL ?? DEFAULT_MODEL;
}
