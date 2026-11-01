import { NextResponse } from "next/server";
import { executeTool } from "@/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ToolRequestBody {
  tool?: string;
  args?: unknown;
  expectedVersion?: number;
  idempotencyKey?: string;
  approvalReference?: string;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: ToolRequestBody;
  try {
    body = (await request.json()) as ToolRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!body.tool || typeof body.tool !== "string") {
    return NextResponse.json({ error: "A tool name is required." }, { status: 400 });
  }

  const envelope = await executeTool(id, body.tool, body.args ?? {}, {
    source: "ui",
    actorId: "demo-user",
    actorName: "Demo architect",
    role: "owner",
    expectedVersion: body.expectedVersion,
    idempotencyKey: body.idempotencyKey,
    approvalReference: body.approvalReference,
  });
  const httpStatus =
    envelope.status === "failed"
      ? envelope.error_code === "PROJECT_NOT_FOUND"
        ? 404
        : 422
      : envelope.status === "conflict"
        ? 409
        : 200;
  return NextResponse.json(envelope, { status: httpStatus });
}
