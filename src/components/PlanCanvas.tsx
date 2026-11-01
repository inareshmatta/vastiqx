"use client";

import { useMemo, useRef, useState } from "react";
import { bbox, polygonCentroid } from "@/domain/geometry";
import { ROOM_COLORS, ROOM_LABELS, type Floor, type Project, type RoomType, type Vec2 } from "@/domain/types";
import { formatArea, type AreaUnit } from "@/domain/units";

interface PlanCanvasProps {
  project: Project;
  floor: Floor;
  proposal?: boolean;
  proposalName?: string;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onAddRoom: (input: { name: string; type: RoomType; rect: { x: number; y: number; width: number; depth: number } }) => Promise<void> | void;
  busy?: boolean;
  areaUnit: AreaUnit;
  /** Other selected floors are drawn as a light room outline overlay. */
  visibleFloors?: Floor[];
  onResizeRoom?: (input: { roomId: string; width: number; depth: number; anchor: "sw" | "se" | "nw" | "ne" }) => Promise<void> | void;
}

type Mode = "select" | "draw";
type Ghost = { start: Vec2; current: Vec2 } | null;

const DRAWABLE_TYPES: RoomType[] = [
  "living",
  "dining",
  "kitchen",
  "master_bedroom",
  "bedroom",
  "bathroom",
  "toilet",
  "study",
  "pooja",
  "balcony",
  "utility",
  "store",
  "corridor",
  "foyer",
  "parking",
  "other",
];

function normaliseRect(a: Vec2, b: Vec2) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    depth: Math.abs(b.y - a.y),
  };
}

export function PlanCanvas({
  project,
  floor,
  proposal,
  proposalName,
  selectedRoomId,
  onSelectRoom,
  onAddRoom,
  busy,
  areaUnit,
  visibleFloors,
  onResizeRoom,
}: PlanCanvasProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [roomType, setRoomType] = useState<RoomType>("bedroom");
  const [ghost, setGhost] = useState<Ghost>(null);
  const [resize, setResize] = useState<{
    roomId: string;
    anchor: "sw" | "se" | "nw" | "ne";
    fixed: Vec2;
    current: Vec2;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const plot = useMemo(() => bbox(project.site.boundary), [project.site.boundary]);
  const pad = Math.max(1.4, Math.max(plot.maxX - plot.minX, plot.maxY - plot.minY) * 0.1);
  const width = plot.maxX - plot.minX + pad * 2;
  const height = plot.maxY - plot.minY + pad * 2;
  const X = (x: number) => x - plot.minX + pad;
  const Y = (y: number) => plot.maxY - y + pad;
  const plate = {
    x0: plot.minX + project.site.setbacks.left,
    y0: plot.minY + project.site.setbacks.front,
    x1: plot.maxX - project.site.setbacks.right,
    y1: plot.maxY - project.site.setbacks.rear,
  };

  function pointFromEvent(event: React.PointerEvent<SVGSVGElement>): Vec2 | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const viewX = ((event.clientX - rect.left) / rect.width) * width;
    const viewY = ((event.clientY - rect.top) / rect.height) * height;
    return { x: plot.minX + viewX - pad, y: plot.maxY - (viewY - pad) };
  }

  function handleDown(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== "draw" || busy) return;
    const point = pointFromEvent(event);
    if (!point || point.x < plot.minX || point.x > plot.maxX || point.y < plot.minY || point.y > plot.maxY) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setGhost({ start: point, current: point });
  }

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const point = pointFromEvent(event);
    if (!point) return;
    if (resize) {
      setResize({ ...resize, current: point });
      return;
    }
    if (!ghost) return;
    setGhost({ start: ghost.start, current: point });
  }

  async function handleUp() {
    if (resize) {
      const width = Math.max(1.2, Math.abs(resize.current.x - resize.fixed.x));
      const depth = Math.max(1.2, Math.abs(resize.current.y - resize.fixed.y));
      setResize(null);
      await onResizeRoom?.({
        roomId: resize.roomId,
        width: Math.round(width * 100) / 100,
        depth: Math.round(depth * 100) / 100,
        anchor: resize.anchor,
      });
      return;
    }
    if (!ghost) return;
    const rect = normaliseRect(ghost.start, ghost.current);
    setGhost(null);
    if (rect.width < 0.9 || rect.depth < 0.9) return;
    setMode("select");
    await onAddRoom({
      name: ROOM_LABELS[roomType],
      type: roomType,
      rect: {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        depth: Math.round(rect.depth * 100) / 100,
      },
    });
  }

  function startResize(
    event: React.PointerEvent<SVGRectElement>,
    anchor: "sw" | "se" | "nw" | "ne",
    fixed: Vec2,
    corner: Vec2,
  ) {
    if (!selectedRoom || busy || !onResizeRoom) return;
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setResize({ roomId: selectedRoom.id, anchor, fixed, current: corner });
  }

  const ghostRect = ghost ? normaliseRect(ghost.start, ghost.current) : null;
  const resizeRect = resize
    ? {
        x: Math.min(resize.fixed.x, resize.current.x),
        y: Math.min(resize.fixed.y, resize.current.y),
        width: Math.abs(resize.current.x - resize.fixed.x),
        depth: Math.abs(resize.current.y - resize.fixed.y),
      }
    : null;
  const selectedRoom = floor.rooms.find((room) => room.id === selectedRoomId) ?? null;
  const overlayFloors = (visibleFloors ?? [floor]).filter((item) => item.id !== floor.id);
  const floorFurniture = (project.furniture ?? []).filter((item) => item.floorId === floor.id);

  const openings = floor.walls.flatMap((wall) =>
    wall.openings.map((opening) => {
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
      const ux = (wall.end.x - wall.start.x) / length;
      const uy = (wall.end.y - wall.start.y) / length;
      const centre = { x: wall.start.x + ux * opening.offset, y: wall.start.y + uy * opening.offset };
      return { wall, opening, centre, angle: (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI };
    }),
  );

  const northAngle = -project.site.northBearing;

  return (
    <div className="canvas-card">
      <div className="canvas-toolbar">
        <div className="pill-group" role="group" aria-label="Plan mode">
          <button type="button" className={mode === "select" ? "active" : ""} onClick={() => setMode("select")}>
            Select
          </button>
          <button type="button" className={mode === "draw" ? "active" : ""} onClick={() => setMode("draw")} disabled={busy}>
            Draw room
          </button>
        </div>
        {mode === "draw" && (
          <select
            aria-label="Room type to draw"
            value={roomType}
            onChange={(event) => setRoomType(event.target.value as RoomType)}
            style={{ border: "1px solid var(--line)", borderRadius: 7, background: "#fffdf7", padding: "5px 7px", fontSize: 11 }}
          >
            {DRAWABLE_TYPES.map((type) => (
              <option value={type} key={type}>{ROOM_LABELS[type]}</option>
            ))}
          </select>
        )}
        <div className="spacer" />
        <span className="tiny muted">Floor {floor.name}</span>
        <span className="tiny muted">·</span>
        <span className="tiny muted">1 grid = 1 m</span>
      </div>
      <div className="plan-wrap">
        {proposal && <div className="plan-badge proposal">Proposal preview · {proposalName} · not committed</div>}
        {mode === "draw" && <div className="plan-badge">Drag a rectangle · dimensions follow the pointer</div>}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${project.name}, ${floor.name} plan, revision ${project.revision}`}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={() => { setGhost(null); setResize(null); }}
          style={{ cursor: mode === "draw" ? "crosshair" : "default", background: "#fbf8f0" }}
        >
          <defs>
            <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e8e1d2" strokeWidth="0.012" />
            </pattern>
            <pattern id="grid5" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#d8d0be" strokeWidth="0.03" />
            </pattern>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M 0 0 L 6 3 L 0 6 z" fill="#0b2418" />
            </marker>
          </defs>

          <rect width={width} height={height} fill="#fbf8f0" />
          <rect x={X(plot.minX)} y={Y(plot.maxY)} width={plot.maxX - plot.minX} height={plot.maxY - plot.minY} fill="url(#grid)" />
          <rect x={X(plot.minX)} y={Y(plot.maxY)} width={plot.maxX - plot.minX} height={plot.maxY - plot.minY} fill="url(#grid5)" opacity="0.7" />

          {/* Plot boundary and setback envelope */}
          <polygon
            points={project.site.boundary.map((point) => `${X(point.x)},${Y(point.y)}`).join(" ")}
            fill="none"
            stroke="#0b2418"
            strokeWidth="0.07"
          />
          <rect
            x={X(plate.x0)}
            y={Y(plate.y1)}
            width={Math.max(0, plate.x1 - plate.x0)}
            height={Math.max(0, plate.y1 - plate.y0)}
            fill="none"
            stroke="#c99a3a"
            strokeWidth="0.035"
            strokeDasharray="0.3 0.22"
          />
          <text x={X(plate.x0) + 0.1} y={Y(plate.y1) + 0.42} className="dimension-label">buildable envelope</text>

          {/* Amenities (ground floor only) */}
          {floor.level === 0 &&
            (project.amenities ?? [])
              .filter((amenity) => amenity.rect)
              .map((amenity) => {
                const rect = amenity.rect!;
                const fill =
                  amenity.kind === "pool"
                    ? "#9cc8d6"
                    : amenity.kind === "driveway"
                      ? "#d8d3c8"
                      : amenity.kind === "deck"
                        ? "#d6b993"
                        : "#b9d3a6";
                return (
                  <g key={amenity.id}>
                    <rect
                      x={X(rect.x)}
                      y={Y(rect.y + rect.depth)}
                      width={rect.width}
                      height={rect.depth}
                      fill={fill}
                      fillOpacity="0.75"
                      stroke="#6f8a63"
                      strokeWidth="0.03"
                    />
                    <text x={X(rect.x) + rect.width / 2} y={Y(rect.y + rect.depth / 2)} textAnchor="middle" className="room-label" style={{ fill: "#2f4a38" }}>
                      {amenity.label}
                    </text>
                    <text x={X(rect.x) + rect.width / 2} y={Y(rect.y + rect.depth / 2) + 0.32} textAnchor="middle" className="room-area">
                      {rect.width.toFixed(1)} × {rect.depth.toFixed(1)} m
                    </text>
                  </g>
                );
              })}

          {/* Selected other floors are shown as light outlines so rooms stay visible. */}
          {overlayFloors.map((overlay) => (
            <g key={`overlay-${overlay.id}`} opacity="0.72">
              {overlay.rooms.map((room) => (
                <polygon
                  key={`${overlay.id}-${room.id}`}
                  points={room.polygon.map((point) => `${X(point.x)},${Y(point.y)}`).join(" ")}
                  fill={ROOM_COLORS[room.type]}
                  fillOpacity="0.09"
                  stroke="#72877a"
                  strokeWidth="0.022"
                  strokeDasharray="0.18 0.14"
                />
              ))}
            </g>
          ))}

          {/* Rooms (fills only; labels are drawn above furniture) */}
          {floor.rooms.map((room) => {
            const selected = room.id === selectedRoomId;
            return (
              <g key={room.id} onClick={(event) => { event.stopPropagation(); onSelectRoom(room.id); }} style={{ cursor: "pointer" }}>
                <polygon
                  points={room.polygon.map((point) => `${X(point.x)},${Y(point.y)}`).join(" ")}
                  fill={ROOM_COLORS[room.type]}
                  fillOpacity={selected ? 0.82 : 0.58}
                  stroke={selected ? "#3f8f12" : "#7c8a78"}
                  strokeWidth={selected ? 0.07 : 0.035}
                />
              </g>
            );
          })}

          {/* Walls, cut by openings */}
          {floor.walls.map((wall) => {
            const wallOpenings = [...wall.openings].sort((a, b) => a.offset - b.offset);
            const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
            const ux = (wall.end.x - wall.start.x) / length;
            const uy = (wall.end.y - wall.start.y) / length;
            const segments: { a: Vec2; b: Vec2 }[] = [];
            let cursor = 0;
            for (const opening of wallOpenings) {
              const start = Math.max(0, opening.offset - opening.width / 2);
              const end = Math.min(length, opening.offset + opening.width / 2);
              if (start > cursor) {
                segments.push({
                  a: { x: wall.start.x + ux * cursor, y: wall.start.y + uy * cursor },
                  b: { x: wall.start.x + ux * start, y: wall.start.y + uy * start },
                });
              }
              cursor = Math.max(cursor, end);
            }
            if (cursor < length) {
              segments.push({
                a: { x: wall.start.x + ux * cursor, y: wall.start.y + uy * cursor },
                b: wall.end,
              });
            }
            return (
              <g key={wall.id}>
                {segments.map((segment, index) => (
                  <line
                    key={`${wall.id}-${index}`}
                    x1={X(segment.a.x)}
                    y1={Y(segment.a.y)}
                    x2={X(segment.b.x)}
                    y2={Y(segment.b.y)}
                    stroke="#0b2418"
                    strokeWidth={Math.max(0.09, wall.thickness)}
                    strokeLinecap="butt"
                  />
                ))}
              </g>
            );
          })}

          {/* Openings */}
          {openings.map(({ opening, centre, angle, wall }) => (
            <g key={opening.id} transform={`translate(${X(centre.x)} ${Y(centre.y)}) rotate(${-angle})`}>
              <line
                x1={-opening.width / 2}
                y1={0}
                x2={opening.width / 2}
                y2={0}
                stroke={opening.kind === "door" ? "#e7a42a" : "#6f9fae"}
                strokeWidth={Math.max(0.07, wall.thickness + 0.02)}
              />
              {opening.kind === "window" && (
                <line x1={-opening.width / 2} y1={0} x2={opening.width / 2} y2={0} stroke="#fbf8f0" strokeWidth={Math.max(0.03, wall.thickness * 0.25)} />
              )}
              {opening.kind === "door" && (
                <path d={`M ${-opening.width / 2} 0 A ${opening.width} ${opening.width} 0 0 1 ${opening.width / 2} ${-opening.width}`} fill="none" stroke="#c99a3a" strokeWidth="0.025" />
              )}
            </g>
          ))}

          {/* Furniture presentation layer */}
          {floorFurniture.map((item) => {
            const cx = X(item.rect.x + item.rect.width / 2);
            const cy = Y(item.rect.y + item.rect.depth / 2);
            return (
              <g key={item.id} transform={`rotate(${item.rotation} ${cx} ${cy})`} style={{ pointerEvents: "none" }}>
                <rect
                  x={X(item.rect.x)}
                  y={Y(item.rect.y + item.rect.depth)}
                  width={item.rect.width}
                  height={item.rect.depth}
                  rx="0.08"
                  fill={item.color}
                  fillOpacity="0.82"
                  stroke="#4f5a50"
                  strokeWidth="0.025"
                />
                {item.rect.width > 0.75 && item.rect.depth > 0.4 && (
                  <text x={cx} y={cy + 0.06} textAnchor="middle" className="room-area" style={{ fill: "#26352a", fontSize: 0.16 }}>
                    {item.label.length > 16 ? `${item.label.slice(0, 15)}…` : item.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Room labels and explicit dimensions, drawn above furniture */}
          {floor.rooms.map((room) => {
            const centroid = polygonCentroid(room.polygon);
            const bounds = bbox(room.polygon);
            const width = bounds.maxX - bounds.minX;
            const depth = bounds.maxY - bounds.minY;
            let area = 0;
            for (let i = 0; i < room.polygon.length; i++) {
              const a = room.polygon[i]!;
              const b = room.polygon[(i + 1) % room.polygon.length]!;
              area += a.x * b.y - b.x * a.y;
            }
            area = Math.abs(area / 2);
            const compact = width < 2.4 || depth < 1.8;
            return (
              <g key={`label-${room.id}`} style={{ pointerEvents: "none" }}>
                <text x={X(centroid.x)} y={Y(centroid.y) - 0.12} textAnchor="middle" className="room-label" style={compact ? { fontSize: 0.21 } : undefined}>
                  {compact ? ROOM_LABELS[room.type] : room.name}
                </text>
                <text x={X(centroid.x)} y={Y(centroid.y) + 0.12} textAnchor="middle" className="room-area">
                  {formatArea(area, areaUnit)}
                </text>
                <text x={X(centroid.x)} y={Y(centroid.y) + 0.33} textAnchor="middle" className="room-area" style={{ fill: "#5c6e60" }}>
                  {width.toFixed(2)} × {depth.toFixed(2)} m
                </text>
              </g>
            );
          })}

          {overlayFloors.map((overlay, index) => (
            <text
              key={`overlay-label-${overlay.id}`}
              x={X(plot.minX) + 0.1}
              y={pad - 0.4 + index * 0.28}
              className="room-area"
              style={{ fill: "#58705f", fontSize: 0.22 }}
            >
              {overlay.name} floor · outline overlay
            </text>
          ))}

          {/* Selected room dimensions */}
          {selectedRoom && (() => {
            const bounds = bbox(selectedRoom.polygon);
            const w = bounds.maxX - bounds.minX;
            const d = bounds.maxY - bounds.minY;
            const x0 = X(bounds.minX);
            const x1 = X(bounds.maxX);
            const y0 = Y(bounds.maxY);
            const y1 = Y(bounds.minY);
            return (
              <g>
                <line x1={x0} y1={y1 + 0.55} x2={x1} y2={y1 + 0.55} stroke="#0b2418" strokeWidth="0.02" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                <text x={(x0 + x1) / 2} y={y1 + 0.48} textAnchor="middle" className="dimension-label">{w.toFixed(2)} m</text>
                <line x1={x0 - 0.55} y1={y0} x2={x0 - 0.55} y2={y1} stroke="#0b2418" strokeWidth="0.02" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                <text x={x0 - 0.65} y={(y0 + y1) / 2} textAnchor="middle" transform={`rotate(-90 ${x0 - 0.65} ${(y0 + y1) / 2})`} className="dimension-label">{d.toFixed(2)} m</text>
              </g>
            );
          })()}

          {/* Drag-to-resize handles for the selected room */}
          {selectedRoom && !proposal && onResizeRoom && mode === "select" && !busy && (() => {
            const b = bbox(selectedRoom.polygon);
            const handles = [
              { anchor: "ne" as const, fixed: { x: b.maxX, y: b.maxY }, corner: { x: b.minX, y: b.minY }, cursor: "nesw-resize" },
              { anchor: "nw" as const, fixed: { x: b.minX, y: b.maxY }, corner: { x: b.maxX, y: b.minY }, cursor: "nwse-resize" },
              { anchor: "se" as const, fixed: { x: b.maxX, y: b.minY }, corner: { x: b.minX, y: b.maxY }, cursor: "nwse-resize" },
              { anchor: "sw" as const, fixed: { x: b.minX, y: b.minY }, corner: { x: b.maxX, y: b.maxY }, cursor: "nesw-resize" },
            ];
            return (
              <g>
                {handles.map((handle) => {
                  const hx = X(handle.corner.x);
                  const hy = Y(handle.corner.y);
                  return (
                    <rect
                      key={handle.anchor}
                      x={hx - 0.11}
                      y={hy - 0.11}
                      width="0.22"
                      height="0.22"
                      fill="#a8e24a"
                      stroke="#0b2418"
                      strokeWidth="0.035"
                      style={{ cursor: handle.cursor }}
                      onPointerDown={(event) => startResize(event, handle.anchor, handle.fixed, handle.corner)}
                    />
                  );
                })}
              </g>
            );
          })()}

          {resizeRect && (
            <g style={{ pointerEvents: "none" }}>
              <rect
                x={X(resizeRect.x)}
                y={Y(resizeRect.y + resizeRect.depth)}
                width={resizeRect.width}
                height={resizeRect.depth}
                fill="#78c22d"
                fillOpacity="0.16"
                stroke="#3f8f12"
                strokeWidth="0.05"
                strokeDasharray="0.25 0.15"
              />
              <text
                x={X(resizeRect.x) + resizeRect.width / 2}
                y={Y(resizeRect.y + resizeRect.depth) - 0.14}
                textAnchor="middle"
                className="ghost-label"
              >
                {resizeRect.width.toFixed(2)} × {resizeRect.depth.toFixed(2)} m · release to resize
              </text>
            </g>
          )}

          {/* Ghost rectangle */}
          {ghostRect && (
            <g>
              <rect
                x={X(ghostRect.x)}
                y={Y(ghostRect.y + ghostRect.depth)}
                width={ghostRect.width}
                height={ghostRect.depth}
                fill="#78c22d"
                fillOpacity="0.18"
                stroke="#3f8f12"
                strokeWidth="0.045"
                strokeDasharray="0.25 0.15"
              />
              <text x={X(ghostRect.x) + ghostRect.width / 2} y={Y(ghostRect.y + ghostRect.depth) - 0.14} textAnchor="middle" className="ghost-label">
                {ghostRect.width.toFixed(2)} × {ghostRect.depth.toFixed(2)} m · {(ghostRect.width * ghostRect.depth).toFixed(2)} m²
              </text>
            </g>
          )}

          {/* North arrow */}
          <g transform={`translate(${X(plot.maxX) - 0.61} ${Y(plot.maxY) + 0.75}) rotate(${northAngle})`}>
            <circle r="0.48" fill="#fbf8f0" stroke="#0b2418" strokeWidth="0.025" />
            <path d="M 0 -0.38 L 0.16 0.18 L 0 0.08 L -0.16 0.18 Z" fill="#0b2418" />
            <text x="0" y="-0.48" textAnchor="middle" className="room-label" style={{ fontSize: 0.25 }}>N</text>
          </g>

          {/* Scale bar */}
          <g transform={`translate(${X(plot.minX) + 0.15} ${Y(plot.minY) - 0.55})`}>
            <line x1="0" y1="0" x2="5" y2="0" stroke="#0b2418" strokeWidth="0.035" />
            <line x1="0" y1="-0.08" x2="0" y2="0.08" stroke="#0b2418" strokeWidth="0.035" />
            <line x1="5" y1="-0.08" x2="5" y2="0.08" stroke="#0b2418" strokeWidth="0.035" />
            <text x="2.5" y="-0.12" textAnchor="middle" className="dimension-label">5 m</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
