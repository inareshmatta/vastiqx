"use client";

import type { ElevationSet, ElevationShape, ElevationView } from "@/domain/elevations";

function drawShape(shape: ElevationShape, view: ElevationView, index: number) {
  const y = view.height - (shape.y + shape.height);
  const opacity = shape.kind === "shadow" ? 0.35 : 1;
  return (
    <g key={`${shape.kind}-${index}`} opacity={opacity}>
      <rect
        x={shape.x}
        y={y}
        width={Math.max(0.005, shape.width)}
        height={Math.max(0.005, shape.height)}
        fill={shape.color}
        stroke={
          shape.kind === "opening" || shape.kind === "door"
            ? "rgba(20, 38, 28, 0.55)"
            : shape.kind === "ground"
              ? "none"
              : "rgba(20, 38, 28, 0.18)"
        }
        strokeWidth={shape.kind === "ground" ? 0 : 0.018}
      />
      {(shape.kind === "opening" || shape.kind === "door") && (
        <>
          <line
            x1={shape.x + shape.width / 2}
            y1={y}
            x2={shape.x + shape.width / 2}
            y2={y + shape.height}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={0.014}
          />
          <line
            x1={shape.x}
            y1={y + shape.height / 2}
            x2={shape.x + shape.width}
            y2={y + shape.height / 2}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={0.012}
          />
        </>
      )}
    </g>
  );
}

function ElevationCard({ view, facadeName }: { view: ElevationView; facadeName: string }) {
  return (
    <article className="elevation-card">
      <div className="head">
        <div>
          <b>{view.label}</b>
          <div className="tiny muted">{view.subtitle}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="badge muted">{view.openingCount} openings</span>
          <div className="tiny muted" style={{ marginTop: 3 }}>
            {view.buildingWidth.toFixed(2)} × {view.buildingHeight.toFixed(2)} m
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={`${view.label} for ${facadeName}`}>
        <defs>
          <linearGradient id={`sky-${view.direction}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef3ea" />
            <stop offset="1" stopColor="#f8f4e8" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={view.width} height={view.height} fill={`url(#sky-${view.direction})`} />
        {view.shapes.map((shape, index) => drawShape(shape, view, index))}
        <line
          x1={0.1}
          y1={view.height - view.groundY + 0.02}
          x2={view.width - 0.1}
          y2={view.height - view.groundY + 0.02}
          stroke="#5f6b5d"
          strokeWidth={0.022}
          strokeDasharray="0.18 0.12"
        />
        <text x={0.24} y={view.height - 0.22} fontSize={0.19} fill="#6d6a5c" fontFamily="ui-monospace, monospace">
          {view.width.toFixed(1)} m
        </text>
        <text
          x={view.width - 0.24}
          y={view.height - 0.22}
          fontSize={0.19}
          textAnchor="end"
          fill="#6d6a5c"
          fontFamily="ui-monospace, monospace"
        >
          concept elevation · not for construction
        </text>
      </svg>
    </article>
  );
}

export function ElevationsView({ elevations }: { elevations: ElevationSet }) {
  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        <div>
          <h3>Front, rear and side elevations</h3>
          <p>Projected from stored walls and openings · {elevations.facade.name}</p>
        </div>
        <div className="template-row">
          <span className="badge lime">facade {elevations.facade.templateId}</span>
          <span className="badge muted">{elevations.facade.roof.replace(/_/g, " ")}</span>
        </div>
      </div>
      <div className="elevation-grid">
        {elevations.views.map((view) => (
          <ElevationCard key={view.direction} view={view} facadeName={elevations.facade.name} />
        ))}
      </div>
      <div className="cards-2" style={{ marginTop: 12 }}>
        <div className="stat-card">
          <div className="l">Wall finish</div>
          <div className="v" style={{ fontSize: 16 }}>{elevations.facade.wallFinish}</div>
          <div className="s">Primary façade body</div>
        </div>
        <div className="stat-card">
          <div className="l">Accent finish</div>
          <div className="v" style={{ fontSize: 16 }}>{elevations.facade.accentFinish}</div>
          <div className="s">Louvres, bands and shadow lines</div>
        </div>
      </div>
      <div className="note" style={{ marginTop: 12 }}>{elevations.method}</div>
    </div>
  );
}
