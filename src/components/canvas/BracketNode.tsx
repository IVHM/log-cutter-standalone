"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { useProjectStore } from "@/lib/store";
import type { BracketNodeData } from "@/lib/types";
import { useCanvasId } from "./canvas-context";

export function BracketNode({ id, data, selected }: NodeProps & { data: BracketNodeData }) {
  const canvasId = useCanvasId();
  const updateNodeData = useProjectStore((s) => s.updateNodeData);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selected && !data.label) inputRef.current?.focus();
  }, [selected, data.label]);

  return (
    <div className="relative h-full min-h-[80px] w-full min-w-[140px] overflow-visible">
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={80}
        color="#7dd3fc"
      />
      <svg
        viewBox="0 0 28 200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-y-0 left-0 h-full w-8 text-sky-300"
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
        ref={inputRef}
        className="nodrag nopan nowheel absolute top-1/2 left-8 w-[calc(100%-2.25rem)] -translate-y-1/2 rounded-md border border-sky-700/80 bg-zinc-950 px-2 py-1 text-[12px] text-sky-100 shadow-lg outline-none placeholder:text-zinc-500 focus:border-sky-400"
        placeholder="Group label"
        value={data.label}
        onChange={(e) => updateNodeData(canvasId, id, { label: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
