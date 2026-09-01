"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Hash } from "lucide-react";
import { JsonTree } from "@/components/json/JsonTree";
import { jsonType } from "@/lib/hash";
import { formatScalar, getAtPath } from "@/lib/json-path";
import { useProjectStore } from "@/lib/store";
import type { LogNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasId } from "./canvas-context";

export function LogNode({ id, data, selected }: NodeProps & { data: LogNodeData }) {
  const canvasId = useCanvasId();
  const log = useProjectStore((s) => s.project?.logs.find((l) => l.id === data.logId));
  const updateNodeData = useProjectStore((s) => s.updateNodeData);
  const setLogNote = useProjectStore((s) => s.setLogNote);

  if (!log) {
    return (
      <div className="w-[280px] rounded-lg border border-dashed border-destructive/40 bg-card p-3 text-xs text-destructive">
        Log removed from dataset
      </div>
    );
  }

  const level = getAtPath(log.data, "level") ?? getAtPath(log.data, "severity");
  const event = getAtPath(log.data, "event") ?? getAtPath(log.data, "message") ?? getAtPath(log.data, "msg");
  const service = getAtPath(log.data, "service");

  function togglePin(path: string) {
    const next = data.pinnedPaths.includes(path)
      ? data.pinnedPaths.filter((p) => p !== path)
      : [...data.pinnedPaths, path];
    updateNodeData(canvasId, id, { pinnedPaths: next });
  }

  function toggleCollapsePath(path: string) {
    const next = data.collapsedPaths.includes(path)
      ? data.collapsedPaths.filter((p) => p !== path)
      : [...data.collapsedPaths, path];
    updateNodeData(canvasId, id, { collapsedPaths: next });
  }

  return (
    <div
      className={cn(
        "w-[320px] rounded-lg border bg-zinc-950/95 shadow-xl backdrop-blur-sm",
        selected ? "border-sky-400 ring-2 ring-sky-400/30" : "border-zinc-700",
      )}
    >
      <Handle type="target" position={Position.Left} id="l" className="!size-2 !bg-zinc-400" />
      <Handle type="target" position={Position.Top} id="t" className="!size-2 !bg-zinc-400" />
      <Handle type="source" position={Position.Right} id="r" className="!size-2 !bg-zinc-400" />
      <Handle type="source" position={Position.Bottom} id="b" className="!size-2 !bg-zinc-400" />

      <div className="flex items-center gap-1.5 border-b border-zinc-800 px-2 py-1.5">
        <button
          type="button"
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={() => updateNodeData(canvasId, id, { collapsed: !data.collapsed })}
          aria-label={data.collapsed ? "Expand log" : "Collapse log"}
        >
          {data.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <LevelBadge value={level} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[11px] text-zinc-200">
            {service ? `${String(service)} · ` : ""}
            {event ? formatScalar(event, 40) : jsonType(log.data)}
          </div>
        </div>
        <span className="flex items-center gap-0.5 font-mono text-[10px] text-zinc-500">
          <Hash className="size-3" />
          {log.hash.slice(0, 8)}
        </span>
      </div>

      <div className="nowheel nopan max-h-[420px] overflow-auto p-2">
        {data.collapsed ? (
          <CollapsedBody data={log.data} pinnedPaths={data.pinnedPaths} />
        ) : (
          <JsonTree
            value={log.data}
            pinnedPaths={data.pinnedPaths}
            collapsedPaths={data.collapsedPaths}
            onTogglePin={togglePin}
            onToggleCollapse={toggleCollapsePath}
          />
        )}
        {Object.keys(log.meta).length > 0 && !data.collapsed ? (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Ancillary</div>
            {Object.entries(log.meta).map(([k, v]) => (
              <div key={k} className="flex gap-1 font-mono text-[11px]">
                <span className="text-zinc-400">{k}:</span>
                <span className="text-emerald-400/90">{v}</span>
              </div>
            ))}
          </div>
        ) : null}
        <label className="mt-2 block border-t border-zinc-800 pt-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">Note</span>
          <textarea
            className="h-14 w-full resize-none rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-zinc-500"
            placeholder="Attach an investigator note to this log…"
            value={log.note}
            onChange={(e) => setLogNote(log.id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </label>
      </div>
    </div>
  );
}

function CollapsedBody({ data, pinnedPaths }: { data: unknown; pinnedPaths: string[] }) {
  if (pinnedPaths.length === 0) {
    return (
      <p className="px-1 py-2 text-[11px] italic text-zinc-500">
        Expand this log and pin fields to keep them visible when collapsed.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {pinnedPaths.map((path) => (
        <div key={path} className="flex items-start gap-2 font-mono text-[11px]">
          <span className="shrink-0 text-zinc-500">{path}</span>
          <span className="min-w-0 break-all text-zinc-200">{formatScalar(getAtPath(data, path), 100)}</span>
        </div>
      ))}
    </div>
  );
}

function LevelBadge({ value }: { value: unknown }) {
  const text = String(value ?? "log").toLowerCase();
  const color =
    text === "error" || text === "fatal"
      ? "bg-red-500/20 text-red-300"
      : text === "warn" || text === "warning"
        ? "bg-amber-500/20 text-amber-300"
        : text === "info"
          ? "bg-sky-500/20 text-sky-300"
          : text === "debug" || text === "trace"
            ? "bg-zinc-500/20 text-zinc-300"
            : "bg-zinc-700/60 text-zinc-300";
  return (
    <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] uppercase", color)}>{text}</span>
  );
}
