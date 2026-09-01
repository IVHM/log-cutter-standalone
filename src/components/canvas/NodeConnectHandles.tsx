"use client";

import { Handle, Position, useNodeId } from "@xyflow/react";
import type { EdgeHandleId } from "@/lib/arrow-anchor";
import { cn } from "@/lib/utils";
import { useCanvasArrow } from "./canvas-context";

const SIDES: { id: EdgeHandleId; position: Position }[] = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
];

/** Four side anchors. Visible while drawing an arrow; each side can be start or end. */
export function NodeConnectHandles() {
  const nodeId = useNodeId();
  const { tool, onAnchorClick } = useCanvasArrow();
  const show = tool === "arrow";

  return (
    <>
      {SIDES.map(({ id, position }) => (
        <span key={id}>
          <Handle
            type="target"
            id={id}
            position={position}
            isConnectable={show}
            className={handleClass(show, "target")}
          />
          <Handle
            type="source"
            id={id}
            position={position}
            isConnectable={show}
            className={handleClass(show, "source")}
            onClick={(e) => {
              e.stopPropagation();
              if (!nodeId || !show) return;
              onAnchorClick(nodeId, id);
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
          "!size-3.5 !opacity-100 !border-sky-200 !bg-sky-500",
          kind === "target" && "!pointer-events-none",
        )
      : "!size-2.5 !border-0 !bg-transparent !opacity-0 !pointer-events-none",
  );
}
