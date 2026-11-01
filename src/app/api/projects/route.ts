import { NextResponse } from "next/server";
import { agentStatus } from "@/agent";
import { createProject } from "@/domain/project";
import { ensureDemoProject } from "@/server/seed";
import { listProjects, saveProject } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await ensureDemoProject();
  const projects = await listProjects();
  return NextResponse.json({
    projects,
    agent: agentStatus(),
    seeded: projects.length > 0,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Project name is required." }, { status: 400 });

  const numberOr = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

  const project = createProject({
    name,
    type: typeof body.type === "string" ? (body.type as never) : "independent_house",
    plotWidth: numberOr(body.plotWidth, 30),
    plotDepth: numberOr(body.plotDepth, 40),
    plotUnit: body.plotUnit === "m" ? "m" : "ft",
    city: typeof body.city === "string" ? body.city : "Bengaluru",
    state: typeof body.state === "string" ? body.state : "Karnataka",
    bedrooms: Math.max(1, Math.min(10, numberOr(body.bedrooms, 3))),
    bathrooms: Math.max(1, Math.min(10, numberOr(body.bathrooms, 3))),
    floors: Math.max(1, Math.min(4, numberOr(body.floors, 1))),
    description: typeof body.description === "string" ? body.description : "",
  });
  await saveProject(project);
  return NextResponse.json({ project, view: `/projects/${project.id}` }, { status: 201 });
}
