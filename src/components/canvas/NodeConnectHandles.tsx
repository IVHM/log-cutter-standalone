"use client";

import { Handle, useNodeId } from "@xyflow/react";
import { EDGE_ANCHORS, handleOffsetStyle } from "@/lib/arrow-anchor";
import { cn } from "@/lib/utils";
import { useCanvasArrow } from "./canvas-context";

/** Three filled-circle anchors on each side. Occupied anchors are less transparent. */
export function NodeConnectHandles() {
  const nodeId = useNodeId();
  const { showAnchors, occupiedAnchors, onAnchorClick } = useCanvasArrow();

  return (
    <>
      {EDGE_ANCHORS.map((spec) => {
        const attached = Boolean(nodeId && occupiedAnchors.has(`${nodeId}:${spec.id}`));
        return (
          <span key={spec.id}>
            <Handle
              type="target"
              id={spec.id}
              position={spec.position}
              isConnectable={showAnchors}
              style={handleOffsetStyle(spec)}
              className={handleClass(showAnchors, "target", attached)}
            />
            <Handle
              type="source"
              id={spec.id}
              position={spec.position}
              isConnectable={showAnchors}
              style={handleOffsetStyle(spec)}
              className={handleClass(showAnchors, "source", attached)}
              onPointerDown={(e) => {
                if (!showAnchors) return;
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!nodeId || !showAnchors) return;
                onAnchorClick(nodeId, spec.id);
              }}
            />
          </span>
        );
      })}
    </>
  );
}

function handleClass(show: boolean, kind: "source" | "target", attached: boolean) {
  return cn(
    "!box-border !rounded-full !border-0",
    show
      ? cn(
          "arrow-anchor !size-3 !pointer-events-auto",
          attached ? "!bg-sky-400/85" : "!bg-sky-400/60",
          kind === "target" && "!pointer-events-none",
        )
      : "!size-2 !bg-transparent !opacity-0 !pointer-events-none",
  );
}
