"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
} from "@xyflow/react";
import { useState } from "react";
import { useProjectStore } from "@/lib/store";
import { useCanvasId } from "./canvas-context";

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  style,
  data,
  type,
}: EdgeProps) {
  const canvasId = useCanvasId();
  const updateEdge = useProjectStore((s) => s.updateEdge);
  const [editing, setEditing] = useState(false);
  const label = (data as { label?: string } | undefined)?.label ?? "";
  const showLabel = Boolean(label) || selected || editing;

  const pathFn = type === "straight" ? getStraightPath : type === "default" ? getBezierPath : getSmoothStepPath;
  const [edgePath, labelX, labelY] = pathFn({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={36}
        style={{
          ...style,
          stroke: selected ? "#7dd3fc" : "#a1a1aa",
          strokeWidth: selected ? 2.6 : 1.75,
        }}
      />
      {/* Transparent stroke so the line itself is the click target, not only a label. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={36}
        className="react-flow__edge-interaction"
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute origin-center"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {editing ? (
              <input
                autoFocus
                className="rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-100 outline-none"
                defaultValue={label}
                onBlur={(e) => {
                  updateEdge(canvasId, id, { data: { label: e.target.value } });
                  setEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded bg-zinc-900/90 px-1.5 py-0.5 text-[11px] text-zinc-200 shadow"
              >
                {label || "Add label"}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
