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
        "relative h-full w-full cursor-grab overflow-visible rounded-sm",
        vertical ? "min-h-[80px] min-w-[140px]" : "min-h-[64px] min-w-[160px]",
        selected ? "bg-sky-400/15 ring-1 ring-sky-400/70" : "bg-transparent",
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={vertical ? 140 : 180}
        minHeight={vertical ? 80 : 64}
        color="#7dd3fc"
        lineClassName="!pointer-events-none"
      />
      <div
        className={cn(
          "flex h-full w-full justify-end",
          direction === "right" && "flex-row",
          direction === "left" && "flex-row-reverse",
          direction === "down" && "flex-col",
          direction === "up" && "flex-col-reverse",
        )}
      >
        <div
          className={cn(
            "flex items-center",
            vertical
              ? cn("min-w-0 flex-1 px-1.5", direction === "right" ? "justify-end" : "justify-start")
              : "min-h-10 shrink-0 justify-center px-2",
          )}
        >
          <input
            ref={inputRef}
            size={Math.max(10, data.label.length + 2)}
            className={cn(
              "nodrag nopan nowheel z-10 max-w-full cursor-text rounded-md px-2 py-1 text-[15px] font-bold text-sky-50/95 outline-none placeholder:font-semibold placeholder:text-sky-200/40",
              selected
                ? "border border-sky-500/40 bg-sky-950/40 focus:border-sky-400/80"
                : "border border-transparent bg-transparent",
              direction === "right" && "text-right",
              direction === "left" && "text-left",
              (direction === "up" || direction === "down") && "text-center",
            )}
            placeholder="Group label"
            value={data.label}
            onChange={(e) => updateNodeData(canvasId, id, { label: e.target.value })}
            onPointerDown={(e) => {
              if (selected) e.stopPropagation();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
        <BraceGlyph direction={direction} />
      </div>
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
  const vertical = direction === "left" || direction === "right";
  return (
    <svg
      viewBox={vertical ? "0 0 28 200" : "0 0 200 28"}
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none shrink-0 origin-center text-sky-300",
        vertical ? "h-full w-8" : "h-8 w-full",
        direction === "left" && "-scale-x-100",
      )}
      aria-hidden
    >
      <path
        d={direction === "up" ? PATH_UP : direction === "down" ? PATH_DOWN : PATH_RIGHT}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
