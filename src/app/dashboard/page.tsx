import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/Brand";
import { DashboardClient } from "@/components/DashboardClient";
import { ensureDemoProject } from "@/server/seed";
import { listProjects } from "@/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
  description: "Create or open a VastiqX architectural planning project.",
  alternates: { canonical: "/dashboard" },
};

export default async function DashboardPage() {
  await ensureDemoProject();
  const projects = await listProjects();
  return (
    <>
      <header className="site-header">
        <div className="container inner">
          <Link href="/" className="brand" aria-label="VastiqX home">
            <BrandLockup size={36} />
          </Link>
          <nav className="site-nav">
            <Link href="/">Home</Link>
            <a href="/api/tools">Tool catalogue</a>
            <a href="https://github.com/inareshmatta/vastiqx" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </header>
      <main className="dash">
        <div className="container" style={{ marginBottom: 28 }}>
          <span className="eyebrow">Workspace</span>
          <h1 style={{ fontSize: "clamp(36px, 5vw, 56px)", marginTop: 10 }}>Projects</h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8 }}>
            Open the demo or start from a real plot. Every plan, elevation, area check, cost line and report is derived from
            the same canonical model.
          </p>
        </div>
        <DashboardClient projects={projects} />
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <span>VastiqX · concept-stage planning only.</span>
          <a href="https://github.com/inareshmatta/vastiqx" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </>
  );
}
