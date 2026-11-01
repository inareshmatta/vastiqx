import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { agentStatus } from "@/agent";
import { Workspace } from "@/components/Workspace";
import { buildProjectView } from "@/server/derive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const view = await buildProjectView(id);
  if (!view) return { title: "Project not found" };
  return {
    title: `${view.project.name} — live workspace`,
    description: `${view.project.name} in ${view.project.location.city}: ${view.metrics.roomCount} rooms, ${view.metrics.totalBuiltUp.toFixed(1)} m² built-up, revision ${view.project.revision}.`,
    robots: { index: false, follow: false },
  };
}

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await buildProjectView(id);
  if (!view) notFound();
  return <Workspace initialView={view} agent={agentStatus()} />;
}
