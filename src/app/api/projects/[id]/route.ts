import { NextResponse } from "next/server";
import { buildProjectView } from "@/server/derive";
import { deleteProject } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const view = await buildProjectView(id);
  if (!view) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(view);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await deleteProject(id);
  return NextResponse.json({ deleted: id });
}
