"use client";

import { Handle, useNodeId } from "@xyflow/react";
import { EDGE_ANCHORS, handleOffsetStyle } from "@/lib/arrow-anchor";
import { cn } from "@/lib/utils";
import { useCanvasArrow } from "./canvas-context";

/** Three anchors on each side. Any number of arrows may share an anchor. */
export function NodeConnectHandles() {
  const nodeId = useNodeId();
  const { showAnchors, onAnchorClick } = useCanvasArrow();

  return (
    <>
      {EDGE_ANCHORS.map((spec) => (
        <span key={spec.id}>
          <Handle
            type="target"
            id={spec.id}
            position={spec.position}
            isConnectable={showAnchors}
            style={handleOffsetStyle(spec)}
            className={handleClass(showAnchors, "target")}
          />
          <Handle
            type="source"
            id={spec.id}
            position={spec.position}
            isConnectable={showAnchors}
            style={handleOffsetStyle(spec)}
            className={handleClass(showAnchors, "source")}
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
      ))}
    </>
  );
}

function handleClass(show: boolean, kind: "source" | "target") {
  return cn(
    "!rounded-full !border-2",
    show
      ? cn(
          "arrow-anchor !size-3 !opacity-100 !border-sky-100 !bg-sky-500 !pointer-events-auto",
          kind === "target" && "!pointer-events-none",
        )
      : "!size-2 !border-0 !bg-transparent !opacity-0 !pointer-events-none",
  );
}
