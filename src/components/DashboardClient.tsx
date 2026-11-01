"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProjectSummary {
  id: string;
  name: string;
  type: string;
  revision: number;
  updatedAt: string;
  plotArea: number;
  rooms: number;
  floors: number;
  city: string;
  builtUp: number;
}

export function DashboardClient({ projects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "New residence",
    plotWidth: "30",
    plotDepth: "40",
    plotUnit: "ft" as "ft" | "m",
    city: "Bengaluru",
    state: "Karnataka",
    bedrooms: "3",
    bathrooms: "3",
    floors: "2",
    description: "",
  });

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          plotWidth: Number(form.plotWidth),
          plotDepth: Number(form.plotDepth),
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          floors: Number(form.floors),
        }),
      });
      const payload = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error ?? "Could not create the project.");
      router.push(`/projects/${payload.project.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  return (
    <div className="container dash-grid">
      <section>
        <div className="section-title">
          <h3>Your projects</h3>
          <p>{projects.length} saved</p>
        </div>
        {projects.length === 0 && <div className="empty"><b>No projects yet</b>Create one from a plot and brief.</div>}
        {projects.map((project) => (
          <Link className="project-card" href={`/projects/${project.id}`} key={project.id}>
            <div className="thumb">{project.name.slice(0, 1).toUpperCase()}</div>
            <div className="meta">
              <b>{project.name}</b>
              <span>{project.city} · {project.floors} floor(s) · {project.rooms} rooms · revision {project.revision}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="small num"><b>{project.builtUp.toFixed(1)} m²</b></div>
              <div className="tiny muted">plot {project.plotArea.toFixed(1)} m²</div>
            </div>
            <span className="btn btn-sm btn-ghost">Open →</span>
          </Link>
        ))}
        <div className="note" style={{ marginTop: 14 }}>
          Every project is stored as canonical JSON under <span className="mono">.data/projects</span>. This demo is
          single-tenant; a production deployment would put the same service behind authentication and a database transaction.
        </div>
      </section>

      <aside>
        <form className="form-card" onSubmit={createProject}>
          <span className="eyebrow">New project</span>
          <h2 style={{ fontSize: 26, margin: "8px 0 14px" }}>Start from a plot</h2>
          <div className="field">
            <label htmlFor="name">Project name</label>
            <input id="name" value={form.name} onChange={(event) => set("name", event.target.value)} required />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="plotWidth">Plot width</label>
              <input id="plotWidth" inputMode="decimal" value={form.plotWidth} onChange={(event) => set("plotWidth", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="plotDepth">Plot depth</label>
              <input id="plotDepth" inputMode="decimal" value={form.plotDepth} onChange={(event) => set("plotDepth", event.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="plotUnit">Plot unit</label>
            <select id="plotUnit" value={form.plotUnit} onChange={(event) => set("plotUnit", event.target.value as "ft" | "m")}>
              <option value="ft">Feet (30 × 40 = 1,200 ft²)</option>
              <option value="m">Metres</option>
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" value={form.city} onChange={(event) => set("city", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="state">State</label>
              <input id="state" value={form.state} onChange={(event) => set("state", event.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="bedrooms">Bedrooms</label>
              <input id="bedrooms" inputMode="numeric" value={form.bedrooms} onChange={(event) => set("bedrooms", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="bathrooms">Bathrooms</label>
              <input id="bathrooms" inputMode="numeric" value={form.bathrooms} onChange={(event) => set("bathrooms", event.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="floors">Floors</label>
            <select id="floors" value={form.floors} onChange={(event) => set("floors", event.target.value)}>
              <option value="1">Ground only</option>
              <option value="2">Ground + first</option>
              <option value="3">Ground + two</option>
              <option value="4">Ground + three</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="description">Brief</label>
            <textarea
              id="description"
              style={{ width: "100%", minHeight: 82, border: "1px solid var(--line)", borderRadius: 7, background: "#fffdf7", padding: "8px 9px", resize: "vertical" }}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Orientation, must-haves, Vastu priorities, budget…"
            />
          </div>
          {error && <div className="alert" style={{ marginBottom: 10 }}>{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? "Creating…" : "Create project →"}
          </button>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            You can ask the agent to generate the layout, or draw rooms manually. Applying a generated layout requires approval.
          </p>
        </form>
      </aside>
    </div>
  );
}
