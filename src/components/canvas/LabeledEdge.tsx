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
import { cn } from "@/lib/utils";
import { useCanvasArrow, useCanvasId } from "./canvas-context";

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
  const { onEndpointClick, reconnectingEdgeId } = useCanvasArrow();
  const [editing, setEditing] = useState(false);
  const label = (data as { label?: string } | undefined)?.label ?? "";
  const showLabel = Boolean(label) || selected || editing;
  const reconnecting = reconnectingEdgeId === id;

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
        interactionWidth={52}
        style={{
          ...style,
          stroke: selected || reconnecting ? "#7dd3fc" : "#a1a1aa",
          strokeWidth: selected || reconnecting ? 2.8 : 2,
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={52}
        className="react-flow__edge-interaction"
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
      />
      <EdgeLabelRenderer>
        <EndpointButton
          x={sourceX}
          y={sourceY}
          active={selected || reconnecting}
          label="Move tail"
          onPick={() => onEndpointClick(id, "source")}
        />
        <EndpointButton
          x={targetX}
          y={targetY}
          active={selected || reconnecting}
          label="Move head"
          onPick={() => onEndpointClick(id, "target")}
        />
        {showLabel ? (
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
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}

function EndpointButton({
  x,
  y,
  active,
  label,
  onPick,
}: {
  x: number;
  y: number;
  active: boolean;
  label: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "nodrag nopan pointer-events-auto absolute rounded-full border-2 shadow",
        active
          ? "size-3.5 border-white bg-sky-400"
          : "size-2.5 border-sky-200/80 bg-sky-500/90",
      )}
      style={{
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        zIndex: 21,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
    />
  );
}
