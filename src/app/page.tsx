import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup, BrandLogo, BrandMark } from "@/components/Brand";
import { FACADE_TEMPLATES, LANDSCAPE_TEMPLATES } from "@/domain/templates";
import { formatINR } from "@/domain/boq";
import { buildProjectView } from "@/server/derive";
import { planSvg } from "@/server/export/svg";
import { ensureDemoProject } from "@/server/seed";
import { listProjects } from "@/server/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "VastiqX — agentic architecture, Vastu, estimate and build planning",
  description:
    "Turn a plot and brief into a traceable plan, 3D massing, front/back/side elevations, Vastu advisory, room-wise cost and construction material quantities. Every AI action is a typed domain tool call.",
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    title: "Parametric plan, drawn live",
    body: "Draw rooms with a ghost rectangle and exact dimensions, then see area, perimeter, built-up, coverage and FSI update from the canonical model — not a screenshot.",
    points: ["Ghost drawing with live dimensions", "Multi-floor rooms, walls, doors, windows", "Optimistic revisions with undo/redo"],
  },
  {
    title: "Front, back and side elevations",
    body: "Deterministic elevations are projected from stored walls and openings. Choose a ready façade style for finish, roof and accent expression, then inspect all four faces.",
    points: ["9 façade templates, including four modern styles", "Parapet, roof and glazing expression", "No invented geometry"],
  },
  {
    title: "Area compliance that reconciles",
    body: "The sum of room clear areas must reconcile with the floor union and built-up area. Wall/common share is surfaced instead of hidden, with m², ft² and gaj together.",
    points: ["Σ rooms ↔ built-up check", "Pass / warn / fail with formula", "Per-floor and project roll-up"],
  },
  {
    title: "Room-wise and floor-wise cost",
    body: "Measured finishes, openings and services are priced per room. Shared structure, labour, overheads and GST are allocated by room area and reconciled to the authoritative estimate.",
    points: ["Material and finish lines per room", "Floor roll-ups and per-m² cost", "Downloadable CSV cost pack"],
  },
  {
    title: "Construction material calculator",
    body: "Convert takeoff into bricks, cement bags, sand, aggregate, steel, tiles, paint and primer. Includes cubic-metre ↔ cubic-foot and gaj ↔ square-foot conversions.",
    points: ["Brickwork, RCC, plaster, flooring, paint", "Documented planning norms", "m³, ft³, litres and kg"],
  },
  {
    title: "Agentic, but never a black box",
    body: "Gemma 4 via OpenRouter can plan, draw, set a façade, add a pool, cost the job and export — but only by calling the same typed tools the manual UI calls.",
    points: ["Streamed tool calls and results", "Approvals remain human-only", "Audit log and provenance"],
  },
];

const FAQS = [
  {
    q: "Does VastiqX calculate areas from the drawing or from the AI?",
    a: "Neither. Room area is the exact shoelace area of the stored clear polygon. Built-up area is a deterministic 10 cm raster union of rooms and wall footprints. The AI can only read those results through tools; it never computes or persists them.",
  },
  {
    q: "How does the room-area compliance check work?",
    a: "For every floor, VastiqX compares the sum of room clear areas with the union of the room polygons, then with built-up area. The difference is reported as wall/common share. A mismatch fails the check instead of being silently normalised. Project and floor totals are reconciled again at the top level.",
  },
  {
    q: "Can I see gaj, square yards, square feet and cubic metres?",
    a: "Yes. Every area is shown in m² with ft² and gaj in the compliance and cost panels. The calculator converts area, volume and length, and converts measured takeoff into brick, cement, sand, aggregate and steel quantities with m³ and ft³.",
  },
  {
    q: "Does it design front, back and side elevations?",
    a: "Yes, as concept elevations. VastiqX projects four faces from the stored external walls and openings and applies the selected façade template. These are deterministic planning views, not construction elevations or structural drawings.",
  },
  {
    q: "Can the AI build a completely new design?",
    a: "The agent can update the brief, generate three deterministic layout candidates, set a façade, add landscape amenities, check Vastu and cost the result. Applying a layout or exporting a document still requires explicit human approval.",
  },
  {
    q: "Is the cost a quotation?",
    a: "No. It is an indicative planning estimate from a regional rate book. Structural quantities remain benchmarks until engineered. VastiqX labels confidence, exclusions and missing inputs, and never presents the result as a tender or valuation.",
  },
];

export default async function LandingPage() {
  const demoId = await ensureDemoProject();
  const [view, projects] = await Promise.all([buildProjectView(demoId), listProjects()]);
  const demo = view?.project;
  const demoFloor = demo?.floors[0];
  const heroPlan = demo && demoFloor ? planSvg(demo, demoFloor, { pxPerMetre: 34, margin: 30, showGrid: true }) : "";
  const builtUp = view?.metrics.totalBuiltUp ?? 0;
  const estimateTotal = view?.estimate.totals.total ?? 0;
  const roomCount = demo?.floors.reduce((s, f) => s + f.rooms.length, 0) ?? 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://vastiqx.vercel.app/#organization",
        name: "VastiqX",
        url: "https://vastiqx.vercel.app",
        logo: "https://vastiqx.vercel.app/brand/vastiqx-logo.svg",
        sameAs: ["https://github.com/inareshmatta/vastiqx"],
      },
      {
        "@type": "SoftwareApplication",
        name: "VastiqX",
        applicationCategory: "DesignApplication",
        operatingSystem: "Web",
        description:
          "Agentic architecture and construction-planning workspace: parametric 2D plans, 3D massing, elevations, Vastu advisory, area compliance, room-wise cost, material quantities and downloadable reports.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR", description: "Open-source demo" },
        featureList: [
          "Parametric floor plans with exact dimensions",
          "3D massing and front/back/side elevations",
          "Vastu advisory with versioned rule packs",
          "Room and floor area reconciliation",
          "Room-wise, floor-wise and project cost",
          "Construction material calculator",
          "Downloadable PDF, HTML, DXF, JSON and CSV",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      },
      {
        "@type": "WebSite",
        "@id": "https://vastiqx.vercel.app/#website",
        url: "https://vastiqx.vercel.app",
        name: "VastiqX",
        publisher: { "@id": "https://vastiqx.vercel.app/#organization" },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="site-header">
        <div className="container inner">
          <Link href="/" className="brand" aria-label="VastiqX home">
            <BrandLockup size={36} />
          </Link>
          <nav className="site-nav" aria-label="Main">
            <a href="#features">Features</a>
            <a href="#templates">Design templates</a>
            <a href="#contract">Tool contract</a>
            <a href="#faq">FAQ</a>
            <Link href="/dashboard">Projects</Link>
          </nav>
          <div className="header-cta">
            <a className="btn btn-ghost btn-sm" href="https://github.com/inareshmatta/vastiqx" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link className="btn btn-primary btn-sm" href={`/projects/${demoId}`}>
              Open live workspace
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">Agentic architecture · Vastu · estimate · build</span>
              <h1>
                From brief to <em>buildable plan</em>, every number traceable.
              </h1>
              <p className="hero-lead">
                VastiqX is a live architectural workspace where a Gemma 4 agent designs, draws, costs and documents through the
                same typed domain tools as the manual UI. Plans, 3D, elevations, Vastu, area compliance, room-wise cost and
                material quantities all derive from one canonical parametric model.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href={`/projects/${demoId}`}>
                  Open the demo project →
                </Link>
                <Link className="btn" href="/dashboard">
                  Start from a plot
                </Link>
              </div>
              <div className="hero-note">
                <span><i className="dot" /> Tool-executed AI</span>
                <span><i className="dot amber" /> Area reconciliation</span>
                <span><i className="dot blue" /> m² · ft² · gaj</span>
                <span>Gemma 4 via OpenRouter</span>
              </div>
            </div>

            <div>
              <div className="brand-plate">
                <BrandLogo />
                <div className="caption">
                  <span>Design · Vastu · Estimate · Build</span>
                  <span>vastiqx</span>
                </div>
              </div>
              <div className="hero-sheet" style={{ marginTop: 16 }}>
                <div className="hero-sheet-head">
                  <span><b>Live sheet</b> · {demo?.name ?? "Demo project"}</span>
                  <span className="badge lime">R{demo?.revision ?? 1}</span>
                </div>
                <div className="hero-sheet-body">
                  <div dangerouslySetInnerHTML={{ __html: heroPlan }} />
                </div>
                <div className="hero-stats">
                  <div><b>{roomCount}</b><span className="tiny muted">rooms</span></div>
                  <div><b>{builtUp.toFixed(1)}</b><span className="tiny muted">m² built-up</span></div>
                  <div><b>{formatINR(estimateTotal)}</b><span className="tiny muted">planning estimate</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">What is inside</span>
                <h2>One model. Every deliverable.</h2>
              </div>
              <p>
                The 2D plan, 3D massing, elevations, schedules, Vastu findings, BOQ, cost breakdown and reports are all
                projections of the same stored geometry. Nothing is re-keyed and nothing is invented by the model.
              </p>
            </div>
            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <article className="feature" key={feature.title}>
                  <div className="icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                  <ul>
                    {feature.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="templates">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">Design studio</span>
                <h2>Start from a look, then make it yours.</h2>
              </div>
              <p>
                Ready façade styles for the street face, rear and sides, plus landscape templates for a garden, courtyard,
                lap pool, deck, pergola, driveway and roof terrace. The AI can apply them, and so can you.
              </p>
            </div>
            <div className="two-col">
              <div>
                <div className="section-title">
                  <h3>Façade templates</h3>
                  <p>front · back · left · right</p>
                </div>
                <div className="cards-2">
                  {[...FACADE_TEMPLATES]
                    .sort((a, b) => Number(b.id.startsWith("modern")) - Number(a.id.startsWith("modern")))
                    .map((template) => (
                    <article className="stat-card" key={template.id}>
                      <div className="swatches">
                        <span className="swatch" style={{ background: template.palette.primary, width: 22, height: 22 }} />
                        <span className="swatch" style={{ background: template.palette.accent, width: 22, height: 22 }} />
                        <span className="swatch" style={{ background: template.palette.roof, width: 22, height: 22 }} />
                        <span className="swatch" style={{ background: template.palette.glazing, width: 22, height: 22 }} />
                      </div>
                      <div className="v" style={{ fontSize: 18 }}>{template.name}</div>
                      <div className="s">{template.tagline}</div>
                      <p className="tiny muted" style={{ marginTop: 6 }}>{template.description}</p>
                    </article>
                  ))}
                </div>
              </div>
              <div>
                <div className="section-title">
                  <h3>Landscape & site</h3>
                  <p>excluded from built-up</p>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {LANDSCAPE_TEMPLATES.map((template) => (
                    <div className="amenity-item" key={template.id} style={{ padding: "10px 12px" }}>
                      <span className="swatch" style={{ background: template.palette.fill }} />
                      <div>
                        <b style={{ fontSize: 12.5 }}>{template.name}</b>
                        <div className="tiny muted">{template.tagline} · {template.defaultWidth} × {template.defaultDepth} m</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="note" style={{ marginTop: 12 }}>
                  Amenities are a site layer. They are deliberately excluded from built-up, carpet and room schedules, and
                  pool/deck structures still need engineering.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="contract">
          <div className="container two-col">
            <div>
              <span className="eyebrow">Release-blocking contract</span>
              <h2 style={{ fontSize: 38, marginTop: 12, marginBottom: 14 }}>The agent has no side door.</h2>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.75 }}>
                Every AI action is validated against the same typed domain tool the manual UI calls. The model reads project
                state, calls a tool, receives a typed envelope with validation and provenance, and can only claim what the
                envelope reports. Approvals, undo and redo are user-only.
              </p>
              <ul className="list" style={{ marginTop: 14, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8, color: "var(--ink-faint)" }}>
                <li>No direct database writes from the model.</li>
                <li>Optimistic revision checks and idempotency keys.</li>
                <li>Approval required for applying a layout and for every export.</li>
                <li>Audit log records tool, args, status, revision and provenance.</li>
              </ul>
            </div>
            <pre className="code-card">
{`// The only write path
const envelope = await executeTool(
  projectId,
  call.name,
  call.arguments,
  { source: "agent" }
);

// The model sees the result, not a promise
{
  status: "succeeded",
  revision: 12,
  result: { room_id: "rm_...", area_m2: 14.2 },
  validation: { ok: true, errors: 0 },
  invalidated: ["areas", "3d", "boq", "estimate"]
}`}
            </pre>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">Workflow</span>
                <h2>Brief → plan → evidence → documents.</h2>
              </div>
              <p>Use the agent or draw manually. Both paths produce the same auditable revision history.</p>
            </div>
            <div className="steps">
              <div className="step">
                <h3>Set the plot and brief</h3>
                <p>Dimensions, setbacks, road edge, north bearing, bedrooms, bathrooms and the outcomes you care about.</p>
              </div>
              <div className="step">
                <h3>Generate or draw</h3>
                <p>Three deterministic layout candidates, or draw rooms with ghost geometry and exact live dimensions.</p>
              </div>
              <div className="step">
                <h3>Inspect every projection</h3>
                <p>2D, 3D, four elevations, Vastu, jurisdiction checks, area reconciliation and room/floor cost.</p>
              </div>
              <div className="step">
                <h3>Approve and download</h3>
                <p>Approve a proposal or an export, then download PDF, HTML report, DXF, JSON or the CSV cost pack.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container two-col">
            <div>
              <span className="eyebrow">Answers</span>
              <h2 style={{ fontSize: 38, marginTop: 12 }}>Questions a client actually asks.</h2>
              <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                VastiqX is concept-stage planning software. It is not a statutory submission, structural design, valuation or
                construction certification.
              </p>
            </div>
            <div className="faq">
              {FAQS.map((faq) => (
                <details key={faq.q}>
                  <summary>{faq.q}</summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {projects.length > 0 && (
          <section className="section">
            <div className="container">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Your workspace</span>
                  <h2>Recent projects</h2>
                </div>
                <Link className="btn btn-sm" href="/dashboard">All projects →</Link>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {projects.slice(0, 3).map((project) => (
                  <Link className="project-card" href={`/projects/${project.id}`} key={project.id}>
                    <div className="thumb">{project.name.slice(0, 1)}</div>
                    <div className="meta">
                      <b>{project.name}</b>
                      <span>{project.city} · {project.floors} floors · {project.rooms} rooms · R{project.revision}</span>
                    </div>
                    <span className="badge muted">{project.builtUp.toFixed(0)} m²</span>
                    <span className="btn btn-sm btn-ghost">Open →</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="section" style={{ paddingTop: 46 }}>
          <div className="container" style={{ textAlign: "center" }}>
            <BrandMark size={64} />
            <h2 style={{ marginTop: 16, fontSize: 42 }}>Design it. Check it. Cost it. Build it.</h2>
            <p className="muted" style={{ maxWidth: 560, margin: "10px auto 22px" }}>
              Open the live project and ask the agent to redesign the plan, add a pool, set the façade or produce the full
              report — or draw the next room yourself.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href={`/projects/${demoId}`}>Open workspace</Link>
              <a className="btn" href="https://github.com/inareshmatta/vastiqx" target="_blank" rel="noreferrer">View source</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <BrandLogo height={30} />
            <p style={{ marginTop: 8 }}>Agentic architecture & construction planning. Concept-stage only.</p>
          </div>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <Link href="/dashboard">Projects</Link>
            <a href="/api/tools">Tool catalogue</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="/sitemap.xml">Sitemap</a>
            <a href="https://github.com/inareshmatta/vastiqx" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </>
  );
}
