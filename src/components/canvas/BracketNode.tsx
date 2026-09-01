"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";
import { useProjectStore } from "@/lib/store";
import type { BraceDirection, BracketNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasId } from "./canvas-context";

/** `{` opening to the right. Spine on the left, tips on the right. */
const PATH_RIGHT =
  "M22 6 C8 6, 8 6, 8 28 L8 86 C8 96, 6 100, 2 100 C6 100, 8 104, 8 114 L8 172 C8 194, 8 194, 22 194";
/** `{` rotated 90° clockwise: opens downward. */
const PATH_DOWN =
  "M194 22 C194 8, 194 8, 172 8 L114 8 C104 8, 100 6, 100 2 C100 6, 96 8, 86 8 L28 8 C6 8, 6 8, 6 22";
/** `{` rotated 90° counter-clockwise: opens upward. */
const PATH_UP =
  "M6 6 C6 20, 6 20, 28 20 L86 20 C96 20, 100 22, 100 26 C100 22, 104 20, 114 20 L172 20 C194 20, 194 20, 194 6";

const DIRECTION_BUTTONS: {
  direction: BraceDirection;
  label: string;
  icon: typeof ArrowRight;
}[] = [
  { direction: "up", label: "Point up", icon: ArrowUp },
  { direction: "left", label: "Point left", icon: ArrowLeft },
  { direction: "right", label: "Point right", icon: ArrowRight },
  { direction: "down", label: "Point down", icon: ArrowDown },
];

export function BracketNode({ id, data, selected }: NodeProps & { data: BracketNodeData }) {
  const canvasId = useCanvasId();
  const updateNodeData = useProjectStore((s) => s.updateNodeData);
  const setBracketDirection = useProjectStore((s) => s.setBracketDirection);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedOnCreate = useRef(false);
  const direction: BraceDirection = data.direction ?? "right";
  const vertical = direction === "left" || direction === "right";

  useEffect(() => {
    if (focusedOnCreate.current || data.label) return;
    focusedOnCreate.current = true;
    inputRef.current?.focus();
  }, [data.label]);

  return (
    <div
      className={cn(
        "relative h-full w-full cursor-grab overflow-visible rounded-sm bg-sky-400/15",
        vertical ? "min-h-[80px] min-w-[140px]" : "min-h-[64px] min-w-[160px]",
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={vertical ? 140 : 180}
        minHeight={vertical ? 80 : 64}
        color="#7dd3fc"
        lineClassName="!pointer-events-none"
      />
      <BraceGlyph direction={direction} />
      <input
        ref={inputRef}
        size={Math.max(12, data.label.length + 2)}
        className={cn(
          "nodrag nopan nowheel absolute z-10 max-w-[calc(100%-3rem)] cursor-text rounded-md border border-sky-700/80 bg-zinc-950 px-2 py-1 text-[12px] text-sky-100 shadow-lg outline-none placeholder:text-zinc-500 focus:border-sky-400",
          direction === "right" && "top-1/2 left-1.5 -translate-y-1/2 text-right",
          direction === "left" && "top-1/2 right-1.5 -translate-y-1/2 text-left",
          direction === "down" && "top-1.5 left-1/2 -translate-x-1/2 text-center",
          direction === "up" && "bottom-1.5 left-1/2 -translate-x-1/2 text-center",
        )}
        placeholder="Group label"
        value={data.label}
        onChange={(e) => updateNodeData(canvasId, id, { label: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {selected ? (
        <div
          className="pointer-events-none absolute -top-3 -right-3 z-10 grid grid-cols-3 grid-rows-3 rounded-md border border-sky-700 bg-zinc-950/95 p-0.5 shadow"
        >
          {DIRECTION_BUTTONS.map(({ direction: dir, label, icon: Icon }) => (
            <button
              key={dir}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={direction === dir}
              className={cn(
                "nodrag nopan pointer-events-auto flex size-6 items-center justify-center rounded-sm text-sky-200 hover:bg-zinc-800",
                dir === "up" && "col-start-2 row-start-1",
                dir === "left" && "col-start-1 row-start-2",
                dir === "right" && "col-start-3 row-start-2",
                dir === "down" && "col-start-2 row-start-3",
                direction === dir && "bg-sky-800 text-sky-50",
              )}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setBracketDirection(canvasId, id, dir)}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BraceGlyph({ direction }: { direction: BraceDirection }) {
  const stroke = (
    <path
      d={direction === "up" ? PATH_UP : direction === "down" ? PATH_DOWN : PATH_RIGHT}
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );

  if (direction === "right") {
    return (
      <svg
        viewBox="0 0 28 200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-8 origin-center text-sky-300"
        aria-hidden
      >
        {stroke}
      </svg>
    );
  }
  if (direction === "left") {
    return (
      <svg
        viewBox="0 0 28 200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-y-0 left-0 h-full w-8 origin-center -scale-x-100 text-sky-300"
        aria-hidden
      >
        {stroke}
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg
        viewBox="0 0 200 28"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-0 left-0 h-8 w-full origin-center text-sky-300"
        aria-hidden
      >
        {stroke}
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 200 28"
      preserveAspectRatio="none"
      className="pointer-events-none absolute top-0 left-0 h-8 w-full origin-center text-sky-300"
      aria-hidden
    >
      {stroke}
    </svg>
  );
}
