"use client";

import { Handle, Position } from "@xyflow/react";

/** Invisible connection points so arrows attach to a node, not a visible latch. */
export function NodeConnectHandles() {
  const hidden = "!size-3 !border-0 !bg-transparent !opacity-0";
  return (
    <>
      <Handle type="target" position={Position.Left} id="l" className={hidden} />
      <Handle type="target" position={Position.Top} id="t" className={hidden} />
      <Handle type="source" position={Position.Right} id="r" className={hidden} />
      <Handle type="source" position={Position.Bottom} id="b" className={hidden} />
    </>
  );
}
