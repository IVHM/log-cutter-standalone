"use client";

import { Palette } from "lucide-react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjectStore } from "@/lib/store";
import { NOTE_COLORS, type NoteNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NodeConnectHandles } from "./NodeConnectHandles";
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
      <NodeConnectHandles />
      <textarea
        className="nowheel nopan h-full w-full resize-none bg-transparent p-3 pb-8 text-[13px] leading-snug text-zinc-900 outline-none placeholder:text-zinc-700/70"
        placeholder="Write a note…"
        value={data.text}
        onChange={(e) => updateNodeData(canvasId, id, { text: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="nodrag nopan absolute bottom-1.5 right-1.5 rounded-md bg-black/15 p-1 text-zinc-800 hover:bg-black/25"
            aria-label="Note color"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Palette className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-2">
          <div className="flex gap-1.5">
            {NOTE_COLORS.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                title={swatch.name}
                aria-label={swatch.name}
                className={cn(
                  "size-6 rounded-full ring-1 ring-black/20",
                  data.color === swatch.hex && "ring-2 ring-zinc-900",
                )}
                style={{ background: swatch.hex }}
                onClick={() => updateNodeData(canvasId, id, { color: swatch.hex })}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
