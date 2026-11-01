import { runAgent } from "@/agent";
import type { AgentEvent, AgentMessage } from "@/agent/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AgentRequestBody {
  message?: string;
  history?: AgentMessage[];
  correlationId?: string;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "A message is required." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      runAgent({
        projectId: id,
        message,
        history: Array.isArray(body.history) ? body.history.slice(-12) : [],
        correlationId: body.correlationId,
        signal: request.signal,
        emit: send,
      })
        .then(() => {
          if (!closed) controller.close();
        })
        .catch((error: unknown) => {
          send({ type: "error", message: error instanceof Error ? error.message : String(error) });
          if (!closed) controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
