"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useProjectStore } from "@/lib/store";
import type { BraceDirection, BracketNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasId } from "./canvas-context";

const PATH_RIGHT =
  "M22 6 C8 6, 8 6, 8 28 L8 86 C8 96, 6 100, 2 100 C6 100, 8 104, 8 114 L8 172 C8 194, 8 194, 22 194";
const PATH_DOWN =
  "M6 6 C6 20, 6 20, 28 20 L86 20 C96 20, 100 22, 100 26 C100 22, 104 20, 114 20 L172 20 C194 20, 194 20, 194 6";

export function BracketNode({ id, data, selected }: NodeProps & { data: BracketNodeData }) {
  const canvasId = useCanvasId();
  const updateNodeData = useProjectStore((s) => s.updateNodeData);
  const rotateBracket = useProjectStore((s) => s.rotateBracket);
  const inputRef = useRef<HTMLInputElement>(null);
  const direction: BraceDirection = data.direction ?? "right";
  const vertical = direction === "left" || direction === "right";

  useEffect(() => {
    if (selected && !data.label) inputRef.current?.focus();
  }, [selected, data.label]);

  return (
    <div
      className={cn(
        "relative h-full w-full cursor-grab overflow-visible rounded-sm bg-sky-400/10",
        vertical ? "min-h-[80px] min-w-[140px]" : "min-h-[52px] min-w-[160px]",
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={vertical ? 140 : 180}
        minHeight={vertical ? 80 : 52}
        color="#7dd3fc"
      />
      <BraceGlyph direction={direction} />
      <input
        ref={inputRef}
        className={cn(
          "nodrag nopan nowheel absolute cursor-text rounded-md border border-sky-700/80 bg-zinc-950 px-2 py-1 text-[12px] text-sky-100 shadow-lg outline-none placeholder:text-zinc-500 focus:border-sky-400",
          direction === "right" &&
            "top-1/2 left-1.5 w-[calc(100%-2.5rem)] -translate-y-1/2 text-right",
          direction === "left" &&
            "top-1/2 right-1.5 w-[calc(100%-2.5rem)] -translate-y-1/2 text-left",
          direction === "down" &&
            "top-1.5 left-1/2 w-[calc(100%-1rem)] -translate-x-1/2 text-center",
          direction === "up" &&
            "bottom-1.5 left-1/2 w-[calc(100%-1rem)] -translate-x-1/2 text-center",
        )}
        placeholder="Group label"
        value={data.label}
        onChange={(e) => updateNodeData(canvasId, id, { label: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {selected ? (
        <button
          type="button"
          className="nodrag nopan absolute -top-3 -right-3 z-10 rounded-full border border-sky-700 bg-zinc-950 p-1 text-sky-200 shadow hover:bg-zinc-800"
          title="Rotate brace (left / up / right / down)"
          aria-label="Rotate brace"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => rotateBracket(canvasId, id)}
        >
          <RotateCw className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function BraceGlyph({ direction }: { direction: BraceDirection }) {
  if (direction === "right") {
    return (
      <svg
        viewBox="0 0 28 200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-8 text-sky-300"
        aria-hidden
      >
        <path d={PATH_RIGHT} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  if (direction === "left") {
    return (
      <svg
        viewBox="0 0 28 200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-y-0 left-0 h-full w-8 -scale-x-100 text-sky-300"
        aria-hidden
      >
        <path d={PATH_RIGHT} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg
        viewBox="0 0 200 28"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-0 left-0 h-8 w-full text-sky-300"
        aria-hidden
      >
        <path d={PATH_DOWN} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 200 28"
      preserveAspectRatio="none"
      className="pointer-events-none absolute top-0 left-0 h-8 w-full -scale-y-100 text-sky-300"
      aria-hidden
    >
      <path d={PATH_DOWN} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
