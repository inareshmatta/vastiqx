import { NextResponse } from "next/server";
import { readArtifact } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  dxf: "application/dxf",
  json: "application/json",
  csv: "text/csv; charset=utf-8",
  html: "text/html; charset=utf-8",
  svg: "image/svg+xml",
};

export async function GET(_request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await context.params;
  const decoded = decodeURIComponent(file);
  const bytes = await readArtifact(id, decoded);
  if (!bytes) return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  const extension = decoded.split(".").pop()?.toLowerCase() ?? "bin";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[extension] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${decoded.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
