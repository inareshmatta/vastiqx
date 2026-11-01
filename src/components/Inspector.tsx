"use client";

import { useEffect, useState } from "react";
import { FURNITURE_TEMPLATES } from "@/domain/furniture";
import { bbox, polygonArea } from "@/domain/geometry";
import { ROOM_COLORS, ROOM_LABELS, type Floor, type RoomType } from "@/domain/types";
import { formatArea, type AreaUnit } from "@/domain/units";
import type { ProjectView } from "@/server/derive";
import { areaTriplet } from "./format";

const ROOM_TYPE_OPTIONS: RoomType[] = [
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
  "stair",
  "parking",
  "shaft",
  "lift",
  "lobby",
  "other",
];

interface InspectorProps {
  view: ProjectView;
  floor: Floor;
  selectedRoomId: string | null;
  areaUnit: AreaUnit;
  busyTool: string | null;
  onSelectRoom: (id: string | null) => void;
  onTool: (tool: string, args?: Record<string, unknown>) => Promise<unknown>;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

export function Inspector({
  view,
  floor,
  selectedRoomId,
  areaUnit,
  busyTool,
  onSelectRoom,
  onTool,
  onApprove,
  onReject,
}: InspectorProps) {
  const room = floor.rooms.find((item) => item.id === selectedRoomId) ?? null;
  const bounds = room ? bbox(room.polygon) : null;
  const roomArea = room ? polygonArea(room.polygon) : 0;

  const [name, setName] = useState("");
  const [type, setType] = useState<RoomType>("bedroom");
  const [target, setTarget] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [wallId, setWallId] = useState("");
  const [furnitureRoomId, setFurnitureRoomId] = useState("");
  const [showAllFurniture, setShowAllFurniture] = useState(false);
  const [setbacks, setSetbacks] = useState(view.project.site.setbacks);
  const [north, setNorth] = useState(String(view.project.site.northBearing));

  useEffect(() => {
    if (!room) return;
    setName(room.name);
    setType(room.type);
    setTarget(room.targetArea ? String(room.targetArea) : "");
    if (bounds) {
      setWidth((bounds.maxX - bounds.minX).toFixed(2));
      setDepth((bounds.maxY - bounds.minY).toFixed(2));
    }
    const adjacent = floor.walls.find((wall) => {
      const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      return mid.x >= (bounds?.minX ?? 0) - 1 && mid.x <= (bounds?.maxX ?? 0) + 1 && mid.y >= (bounds?.minY ?? 0) - 1 && mid.y <= (bounds?.maxY ?? 0) + 1;
    });
    setWallId(adjacent?.id ?? floor.walls[0]?.id ?? "");
  }, [room?.id, room?.name, room?.type, room?.targetArea, floor.id, floor.walls.length, bounds?.minX, bounds?.maxX, bounds?.minY, bounds?.maxY, room, bounds]);

  useEffect(() => {
    setSetbacks(view.project.site.setbacks);
    setNorth(String(view.project.site.northBearing));
  }, [view.project.revision, view.project.site.northBearing, view.project.site.setbacks]);

  useEffect(() => {
    if (selectedRoomId && floor.rooms.some((item) => item.id === selectedRoomId)) {
      setFurnitureRoomId(selectedRoomId);
    } else if (!floor.rooms.some((item) => item.id === furnitureRoomId)) {
      const preferred = floor.rooms.find((item) =>
        ["living", "master_bedroom", "bedroom", "dining", "kitchen", "study"].includes(item.type),
      );
      setFurnitureRoomId(preferred?.id ?? floor.rooms[0]?.id ?? "");
    }
  }, [selectedRoomId, floor.id, floor.rooms, furnitureRoomId]);

  const pending = view.approvals.filter((approval) => approval.status === "pending");
  const wall = floor.walls.find((item) => item.id === wallId) ?? null;
  const wallLength = wall ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : 0;
  const furnitureRoom = floor.rooms.find((item) => item.id === furnitureRoomId) ?? null;
  const compatibleFurniture = furnitureRoom
    ? FURNITURE_TEMPLATES.filter((template) => template.rooms.includes(furnitureRoom.type))
    : FURNITURE_TEMPLATES;
  const furnitureTemplates = showAllFurniture || compatibleFurniture.length === 0 ? FURNITURE_TEMPLATES : compatibleFurniture;
  const floorFurniture = (view.project.furniture ?? []).filter((item) => item.floorId === floor.id);

  async function saveRoom() {
    if (!room) return;
    const patch: Record<string, unknown> = { room_id: room.id };
    if (name.trim() && name.trim() !== room.name) patch.name = name.trim();
    if (type !== room.type) patch.type = type;
    if (target !== "" && Number(target) > 0 && Number(target) !== room.targetArea) patch.target_area_m2 = Number(target);
    if (Object.keys(patch).length > 1) await onTool("update_room", patch);
    if (bounds && (Number(width) !== bounds.maxX - bounds.minX || Number(depth) !== bounds.maxY - bounds.minY)) {
      await onTool("resize_room", {
        room_id: room.id,
        width_m: Math.max(1.2, Number(width) || 1.2),
        depth_m: Math.max(1.2, Number(depth) || 1.2),
        anchor: "sw",
      });
    }
  }

  return (
    <div>
      <section className="inspector-section">
        <h3>Project</h3>
        <div className="kv"><span>Plot</span><b>{formatArea(view.metrics.plotArea, areaUnit)}</b></div>
        <div className="kv"><span>Built-up</span><b>{formatArea(view.metrics.totalBuiltUp, areaUnit)}</b></div>
        <div className="kv"><span>Ground coverage</span><b>{(view.metrics.groundCoverageRatio * 100).toFixed(1)}%</b></div>
        <div className="kv"><span>FSI</span><b>{view.metrics.fsi.toFixed(3)}</b></div>
        <div className="kv"><span>Rooms / floors</span><b>{view.metrics.roomCount} / {view.metrics.floors.length}</b></div>
        <div className="kv"><span>Doors / windows</span><b>{view.metrics.doorCount} / {view.metrics.windowCount}</b></div>
        <div className="tiny muted" style={{ marginTop: 6 }}>{areaTriplet(view.metrics.totalBuiltUp)}</div>
      </section>

      <section className="inspector-section">
        <h3>Selected room</h3>
        {!room ? (
          <div className="empty" style={{ padding: "12px 4px" }}>
            <b>Nothing selected</b>
            Click a room on the plan, or draw a new room.
          </div>
        ) : (
          <>
            <div className="kv" style={{ borderBottom: 0 }}>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="swatch" style={{ background: ROOM_COLORS[room.type] }} />
                {ROOM_LABELS[room.type]}
              </span>
              <b>{formatArea(roomArea, areaUnit)}</b>
            </div>
            <div className="unit-conversions">
              <span>{areaTriplet(roomArea)}</span>
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="room-name">Name</label>
              <input id="room-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="room-type">Type</label>
              <select id="room-type" value={type} onChange={(event) => setType(event.target.value as RoomType)}>
                {ROOM_TYPE_OPTIONS.map((item) => <option key={item} value={item}>{ROOM_LABELS[item]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="room-target">Target clear area (m²)</label>
              <input id="room-target" inputMode="decimal" value={target} placeholder="optional" onChange={(event) => setTarget(event.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="room-width">Width (m)</label>
                <input id="room-width" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="room-depth">Depth (m)</label>
                <input id="room-depth" inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} />
              </div>
            </div>
            <div className="template-row">
              <button className="btn btn-xs btn-primary" disabled={!!busyTool} onClick={saveRoom}>Save changes</button>
              <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("delete_room", { room_id: room.id })}>Delete room</button>
            </div>
            {room.targetArea && (
              <div className="tiny muted" style={{ marginTop: 7 }}>
                Target {room.targetArea.toFixed(2)} m² · variance {(roomArea - room.targetArea).toFixed(2)} m²
              </div>
            )}
          </>
        )}
      </section>

      {room && (
        <section className="inspector-section">
          <h3>Openings</h3>
          <div className="field">
            <label htmlFor="wall-select">Host wall</label>
            <select id="wall-select" value={wallId} onChange={(event) => setWallId(event.target.value)}>
              {floor.walls.map((item, index) => (
                <option key={item.id} value={item.id}>
                  Wall {index + 1} · {Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y).toFixed(2)} m · {item.type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="tiny muted" style={{ marginBottom: 7 }}>
            {wall ? `${wall.openings.length} opening(s) · ${wallLength.toFixed(2)} m long` : "No walls on this floor."}
          </div>
          <div className="template-row">
            <button
              className="btn btn-xs"
              disabled={!wall || !!busyTool}
              onClick={() => onTool("add_door", { wall_id: wallId, offset: Math.round(wallLength / 2 * 100) / 100, width: 0.9, height: 2.1 })}
            >
              + Door
            </button>
            <button
              className="btn btn-xs"
              disabled={!wall || !!busyTool}
              onClick={() => onTool("add_window", { wall_id: wallId, offset: Math.round(wallLength / 2 * 100) / 100, width: 1.2, height: 1.2 })}
            >
              + Window
            </button>
          </div>
        </section>
      )}

      <section className="inspector-section">
        <h3>Furniture</h3>
        <div className="field">
          <label htmlFor="furniture-room">Add to room</label>
          <select id="furniture-room" value={furnitureRoomId} onChange={(event) => setFurnitureRoomId(event.target.value)}>
            {floor.rooms.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {ROOM_LABELS[item.type]}</option>
            ))}
          </select>
        </div>
        <div className="furniture-bar">
          <span className="tiny muted">{furnitureRoom ? `Compatible with ${ROOM_LABELS[furnitureRoom.type]}` : "No room selected"}</span>
          <button className="btn btn-xs btn-ghost" onClick={() => setShowAllFurniture((current) => !current)}>
            {showAllFurniture ? "Compatible only" : "Show all"}
          </button>
        </div>
        <div className="furniture-grid">
          {furnitureTemplates.map((template) => (
            <button
              key={template.id}
              className="furniture-option"
              disabled={!furnitureRoomId || !!busyTool}
              onClick={() => onTool("add_furniture", { template_id: template.id, room_id: furnitureRoomId })}
              title={template.description}
            >
              <b>{template.name}</b>
              <span>{template.width} × {template.depth} m</span>
            </button>
          ))}
        </div>
        <div className="amenity-list">
          {floorFurniture.length === 0 && <div className="tiny muted" style={{ padding: 4 }}>No furniture on this floor yet.</div>}
          {floorFurniture.map((item) => {
            const room = floor.rooms.find((entry) => entry.id === item.roomId);
            return (
              <div className="amenity-item" key={item.id}>
                <span className="swatch" style={{ background: item.color }} />
                <div>
                  <b>{item.label}</b>
                  <div className="tiny muted">
                    {room?.name ?? "Room"} · {item.rect.width.toFixed(2)} × {item.rect.depth.toFixed(2)} m
                  </div>
                </div>
                <button
                  className="x"
                  aria-label={`Remove ${item.label}`}
                  disabled={!!busyTool}
                  onClick={() => onTool("remove_furniture", { furniture_id: item.id })}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Furniture is presentation-only: it is excluded from room area, built-up, cost and Vastu.
        </div>
      </section>

      <section className="inspector-section">
        <h3>Façade & elevations</h3>
        <div className="template-grid">
          {view.design.facade_templates.map((template) => (
            <button
              key={template.id}
              className={`template-option ${view.design.current_facade.template_id === template.id ? "active" : ""}`}
              disabled={!!busyTool}
              onClick={() => onTool("set_facade_template", { template_id: template.id })}
            >
              <b>{template.name}</b>
              <span>{template.tagline}</span>
              <div className="swatches">
                <span className="swatch" style={{ background: template.palette.primary }} />
                <span className="swatch" style={{ background: template.palette.secondary }} />
                <span className="swatch" style={{ background: template.palette.accent }} />
                <span className="swatch" style={{ background: template.palette.roof }} />
                <span className="swatch" style={{ background: template.palette.glazing }} />
              </div>
            </button>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 7 }}>
          Active: {view.design.current_facade.name} · {view.design.current_facade.roof.replace(/_/g, " ")}
        </div>
        <button className="btn btn-xs" style={{ marginTop: 8 }} disabled={!!busyTool} onClick={() => onTool("generate_elevations")}>
          Refresh four elevations
        </button>
      </section>

      <section className="inspector-section">
        <h3>Site & landscape</h3>
        <div className="template-row">
          {view.design.landscape_templates.map((template) => (
            <button
              key={template.id}
              className="btn btn-xs"
              disabled={!!busyTool}
              onClick={() => onTool("add_site_amenity", { template_id: template.id })}
            >
              + {template.name}
            </button>
          ))}
        </div>
        <div className="amenity-list">
          {view.design.amenities.length === 0 && <div className="tiny muted" style={{ padding: 4 }}>No amenities yet.</div>}
          {view.design.amenities.map((amenity) => (
            <div className="amenity-item" key={amenity.amenity_id}>
              <span className="swatch" style={{ background: view.design.landscape_templates.find((t) => t.kind === amenity.kind)?.palette.fill ?? "#b9b4a9" }} />
              <div>
                <b>{amenity.label}</b>
                <div className="tiny muted">
                  {amenity.level} · {amenity.area_m2 ? `${amenity.area_m2.toFixed(1)} m²` : "no footprint"}
                </div>
              </div>
              <button
                className="x"
                aria-label={`Remove ${amenity.label}`}
                disabled={!!busyTool}
                onClick={() => onTool("remove_site_amenity", { amenity_id: amenity.amenity_id })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <h3>Site settings</h3>
        <div className="field-row">
          {(["front", "rear", "left", "right"] as const).map((side) => (
            <div className="field" key={side}>
              <label htmlFor={`setback-${side}`}>{side} (m)</label>
              <input
                id={`setback-${side}`}
                inputMode="decimal"
                value={setbacks[side]}
                onChange={(event) => setSetbacks({ ...setbacks, [side]: Number(event.target.value) })}
              />
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="north-bearing">True north bearing (° clockwise from plan +Y)</label>
          <input id="north-bearing" inputMode="decimal" value={north} onChange={(event) => setNorth(event.target.value)} />
        </div>
        <div className="template-row">
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("set_setbacks", { ...setbacks })}>Apply setbacks</button>
          <button className="btn btn-xs" disabled={!!busyTool} onClick={() => onTool("set_north_bearing", { bearing_deg: Number(north) || 0 })}>Set north</button>
        </div>
      </section>

      {pending.length > 0 && (
        <section className="inspector-section">
          <h3>Pending approval</h3>
          {pending.map((approval) => (
            <div className="approval-card" key={approval.id} style={{ marginBottom: 7 }}>
              <b>{approval.summary}</b>
              <div className="tiny muted">{approval.tool}</div>
              <div className="approval-actions">
                <button className="btn btn-xs btn-lime" onClick={() => onApprove(approval.id)}>Approve</button>
                <button className="btn btn-xs" onClick={() => onReject(approval.id)}>Reject</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="inspector-section">
        <h3>Selected floor</h3>
        <div className="kv"><span>Floor</span><b>{floor.name}</b></div>
        <div className="kv"><span>Rooms</span><b>{floor.rooms.length}</b></div>
        <div className="kv"><span>Walls</span><b>{floor.walls.length}</b></div>
        <div className="kv"><span>Openings</span><b>{floor.walls.reduce((s, item) => s + item.openings.length, 0)}</b></div>
        <div className="kv"><span>Height</span><b>{floor.height.toFixed(2)} m</b></div>
        <button className="btn btn-xs" style={{ marginTop: 8 }} disabled={!!busyTool} onClick={() => onSelectRoom(null)}>
          Clear selection
        </button>
      </section>
    </div>
  );
}
