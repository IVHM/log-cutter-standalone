"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "@/lib/store";
import type { BracketNodeData } from "@/lib/types";
import { useCanvasId } from "./canvas-context";

export function BracketNode({ id, data, selected }: NodeProps & { data: BracketNodeData }) {
  const canvasId = useCanvasId();
  const updateNodeData = useProjectStore((s) => s.updateNodeData);

  return (
    <div className="relative h-full min-h-[80px] min-w-[48px]">
      <NodeResizer
        isVisible={selected}
        minWidth={48}
        minHeight={80}
        color="#7dd3fc"
      />
      <div className="flex h-full items-stretch">
        <svg
          viewBox="0 0 28 200"
          preserveAspectRatio="none"
          className="h-full w-7 shrink-0 text-sky-300"
          aria-hidden
        >
          <path
            d="M22 6
               C8 6, 8 6, 8 28
               L8 86
               C8 96, 6 100, 2 100
               C6 100, 8 104, 8 114
               L8 172
               C8 194, 8 194, 22 194"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <input
          className="nodrag nopan nowheel my-auto w-[4.5rem] -rotate-0 bg-transparent px-0.5 text-left font-mono text-[11px] text-sky-200 outline-none placeholder:text-zinc-500"
          placeholder="Label"
          value={data.label}
          onChange={(e) => updateNodeData(canvasId, id, { label: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
