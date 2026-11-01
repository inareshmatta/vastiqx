import { NextResponse } from "next/server";
import { agentStatus } from "@/agent";
import { toolGroups } from "@/tools/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    agent: agentStatus(),
    groups: toolGroups(),
    contract:
      "Every AI action calls the same typed domain tool as the manual UI. The model never writes the canonical model directly.",
  });
}
