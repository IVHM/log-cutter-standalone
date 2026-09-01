"use client";

import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "@/lib/store";
import type { NoteNodeData } from "@/lib/types";
import { useCanvasId } from "./canvas-context";

export function NoteNode({ id, data, selected }: NodeProps & { data: NoteNodeData }) {
  const canvasId = useCanvasId();
  const updateNodeData = useProjectStore((s) => s.updateNodeData);

  return (
    <div
      className="relative h-full min-h-[120px] min-w-[160px] rounded-sm shadow-lg"
      style={{ background: data.color }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={120}
        color="#111"
      />
      <Handle type="target" position={Position.Left} id="l" className="!size-2 !bg-zinc-700" />
      <Handle type="target" position={Position.Top} id="t" className="!size-2 !bg-zinc-700" />
      <Handle type="source" position={Position.Right} id="r" className="!size-2 !bg-zinc-700" />
      <Handle type="source" position={Position.Bottom} id="b" className="!size-2 !bg-zinc-700" />
      <textarea
        className="nowheel nopan h-full w-full resize-none bg-transparent p-3 text-[13px] leading-snug text-zinc-900 outline-none placeholder:text-zinc-700/70"
        placeholder="Write a note…"
        value={data.text}
        onChange={(e) => updateNodeData(canvasId, id, { text: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
