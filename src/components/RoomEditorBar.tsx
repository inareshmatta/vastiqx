"use client";

import { useEffect, useState } from "react";
import { bbox, polygonArea, polygonCentroid } from "@/domain/geometry";
import { ROOM_LABELS, type Floor, type Room, type RoomType } from "@/domain/types";
import { areaTriplet } from "./format";

const TYPES: RoomType[] = [
  "living", "dining", "kitchen", "master_bedroom", "bedroom", "bathroom", "toilet",
  "study", "pooja", "balcony", "utility", "store", "corridor", "foyer", "stair",
  "parking", "shaft", "lift", "lobby", "other",
];

interface RoomEditorBarProps {
  room: Room;
  floor: Floor;
  busy: boolean;
  onTool: (tool: string, args?: Record<string, unknown>) => Promise<unknown>;
  onClear: () => void;
}

export function RoomEditorBar({ room, floor, busy, onTool, onClear }: RoomEditorBarProps) {
  const bounds = bbox(room.polygon);
  const area = polygonArea(room.polygon);
  const [name, setName] = useState(room.name);
  const [type, setType] = useState<RoomType>(room.type);
  const [width, setWidth] = useState((bounds.maxX - bounds.minX).toFixed(2));
  const [depth, setDepth] = useState((bounds.maxY - bounds.minY).toFixed(2));
  const [wallId, setWallId] = useState("");

  useEffect(() => {
    setName(room.name);
    setType(room.type);
    setWidth((bounds.maxX - bounds.minX).toFixed(2));
    setDepth((bounds.maxY - bounds.minY).toFixed(2));
    const centroid = polygonCentroid(room.polygon);
    const nearest = [...floor.walls]
      .map((wall) => ({
        wall,
        distance: Math.hypot((wall.start.x + wall.end.x) / 2 - centroid.x, (wall.start.y + wall.end.y) / 2 - centroid.y),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6);
    setWallId((current) => (nearest.some((item) => item.wall.id === current) ? current : (nearest[0]?.wall.id ?? "")));
  }, [room.id, room.name, room.type, room.polygon, floor.id, floor.walls, bounds.maxX, bounds.maxY, bounds.minX, bounds.minY]);

  const wall = floor.walls.find((item) => item.id === wallId) ?? null;
  const wallLength = wall ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) : 0;
  const changed =
    name.trim() !== room.name ||
    type !== room.type ||
    Math.abs(Number(width) - (bounds.maxX - bounds.minX)) > 0.01 ||
    Math.abs(Number(depth) - (bounds.maxY - bounds.minY)) > 0.01;

  async function apply() {
    if (name.trim() && name.trim() !== room.name) await onTool("update_room", { room_id: room.id, name: name.trim() });
    if (type !== room.type) await onTool("update_room", { room_id: room.id, type });
    if (
      Math.abs(Number(width) - (bounds.maxX - bounds.minX)) > 0.01 ||
      Math.abs(Number(depth) - (bounds.maxY - bounds.minY)) > 0.01
    ) {
      await onTool("resize_room", {
        room_id: room.id,
        width_m: Math.max(1.2, Number(width) || 1.2),
        depth_m: Math.max(1.2, Number(depth) || 1.2),
        anchor: "sw",
      });
    }
  }

  async function addOpening(kind: "door" | "window") {
    if (!wall) return;
    const args = {
      wall_id: wall.id,
      offset: Math.round((wallLength / 2) * 100) / 100,
      width: kind === "door" ? 0.9 : 1.2,
      height: kind === "door" ? 2.1 : 1.2,
    };
    await onTool(kind === "door" ? "add_door" : "add_window", args);
  }

  return (
    <div className="quick-editor">
      <div className="quick-editor-head">
        <span className="badge lime">Editing room</span>
        <b>{room.name}</b>
        <span className="tiny muted">{areaTriplet(area)}</span>
      </div>
      <div className="quick-editor-fields">
        <div className="field">
          <label htmlFor="quick-name">Name</label>
          <input id="quick-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="quick-type">Type</label>
          <select id="quick-type" value={type} onChange={(event) => setType(event.target.value as RoomType)}>
            {TYPES.map((item) => <option key={item} value={item}>{ROOM_LABELS[item]}</option>)}
          </select>
        </div>
        <div className="field quick-number">
          <label htmlFor="quick-width">Width m</label>
          <input id="quick-width" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} />
        </div>
        <div className="field quick-number">
          <label htmlFor="quick-depth">Depth m</label>
          <input id="quick-depth" inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="quick-wall">Opening wall</label>
          <select id="quick-wall" value={wallId} onChange={(event) => setWallId(event.target.value)}>
            {floor.walls
              .map((item) => ({
                wall: item,
                length: Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y),
              }))
              .sort((a, b) => b.length - a.length)
              .map((item, index) => (
                <option key={item.wall.id} value={item.wall.id}>
                  Wall {index + 1} · {item.length.toFixed(2)} m
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="quick-editor-actions">
        <button className="btn btn-xs btn-primary" disabled={busy || !changed} onClick={apply}>Apply changes</button>
        <button className="btn btn-xs" disabled={busy || !wall} onClick={() => addOpening("door")}>+ Door</button>
        <button className="btn btn-xs" disabled={busy || !wall} onClick={() => addOpening("window")}>+ Window</button>
        <button className="btn btn-xs" disabled={busy} onClick={() => onTool("delete_room", { room_id: room.id })}>Delete room</button>
        <button className="btn btn-xs btn-ghost" onClick={onClear}>Done</button>
        <span className="tiny muted">Drag a corner handle on the plan for direct resize.</span>
      </div>
    </div>
  );
}
