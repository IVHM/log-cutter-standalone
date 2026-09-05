"use client";

import { type NodeProps } from "@xyflow/react";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FindSameValueDialog, type FindSameValueTarget } from "@/components/canvas/FindSameValueDialog";
import { DynamicLinkDialog, type DynamicLinkTarget } from "@/components/canvas/DynamicLinkDialog";
import { FindSameValueHit } from "@/components/canvas/FindSameValueHit";
import { JsonTree } from "@/components/json/JsonTree";
import { jsonType } from "@/lib/hash";
import { logField } from "@/lib/filter";
import type { SameValueQuery } from "@/lib/fields";
import { idLinkForPath } from "@/lib/groups";
import { formatScalar, getAtPath, isHiddenPath, joinPath } from "@/lib/json-path";
import { useProjectStore } from "@/lib/store";
import { findWorkingLog } from "@/lib/working-logs";
import { DEFAULT_HEADER_COLOR, DEFAULT_HEADER_PATHS, type LogNodeData, type LogRecord } from "@/lib/types";
import { NodeConnectHandles } from "./NodeConnectHandles";
import { cn } from "@/lib/utils";
import { useCanvasId } from "./canvas-context";

export function LogNode({ id, data, selected }: NodeProps & { data: LogNodeData }) {
  const canvasId = useCanvasId();
  const log = useProjectStore((s) => findWorkingLog(s.project, s.logsBySource, data.logId));
  const logSet = useProjectStore((s) =>
    s.project?.logSets.find((set) => set.id === log?.logSetId),
  );
  const updateNodeData = useProjectStore((s) => s.updateNodeData);
  const setLogNote = useProjectStore((s) => s.setLogNote);
  const [copied, setCopied] = useState(false);
  const [find, setFind] = useState<FindSameValueTarget | null>(null);
  const [link, setLink] = useState<DynamicLinkTarget | null>(null);
  const project = useProjectStore((s) => s.project);

  if (!log) {
    return (
      <div className="w-[280px] rounded-lg border border-dashed border-destructive/40 bg-card p-3 text-xs text-destructive">
        Log removed from dataset
      </div>
    );
  }

  const headerPaths = (logSet?.headerPaths?.length ? logSet.headerPaths : DEFAULT_HEADER_PATHS).slice(0, 3);
  const headerColor = logSet?.headerColor || DEFAULT_HEADER_COLOR;
  const headerText = headerFg(headerColor);
  const headerEntries = headerPaths
    .map((path) => ({ path, value: logField(log, path) }))
    .filter(({ value }) => {
      const text = formatScalar(value, 48);
      return Boolean(text) && text !== "undefined";
    });
  const titleFallback = jsonType(log.data);

  function openFind(query: SameValueQuery) {
    if (!log) return;
    setFind({
      originLogId: log.id,
      sourceId: log.logSetId,
      path: query.path,
      valueKey: query.valueKey,
      display: query.display,
    });
  }

  function isLinkedPath(path: string) {
    if (!log || !project) return false;
    return Boolean(idLinkForPath(project, log.logSetId, path));
  }

  function openLink(query: SameValueQuery) {
    if (!log || !project) return;
    const hit = idLinkForPath(project, log.logSetId, query.path);
    if (!hit) return;
    setLink({
      originLogId: log.id,
      sourceId: log.logSetId,
      path: query.path,
      valueKey: query.valueKey,
      display: query.display,
      label: hit.link.label,
      bindings: hit.link.bindings,
    });
  }

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
    <div className="relative w-[320px]">
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-zinc-950/95 shadow-xl backdrop-blur-sm",
          selected ? "border-sky-400 ring-2 ring-sky-400/30" : "border-zinc-700",
        )}
      >

      <div
        className="flex items-start gap-1.5 border-b border-black/20 px-2 py-1.5"
        style={{ background: headerColor, color: headerText }}
      >
        <button
          type="button"
          className="mt-0.5 shrink-0 rounded p-0.5 opacity-80 hover:bg-black/20 hover:opacity-100"
          onClick={() => updateNodeData(canvasId, id, { collapsed: !data.collapsed })}
          aria-label={data.collapsed ? "Expand log" : "Collapse log"}
        >
          {data.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <div className="min-w-0 flex-1 line-clamp-2 font-mono text-[11px] font-medium leading-snug break-words">
          {headerEntries.length === 0
            ? titleFallback
            : headerEntries.map((entry, i) => (
                <span key={entry.path}>
                  {i > 0 ? " · " : null}
                  <FindSameValueHit path={entry.path} value={entry.value} onFind={openFind} onLink={openLink} isLinkedPath={isLinkedPath}>
                    {formatScalar(entry.value, 48)}
                  </FindSameValueHit>
                </span>
              ))}
        </div>
        <button
          type="button"
          className="nodrag nopan nowheel mt-0.5 shrink-0 rounded p-0.5 opacity-85 hover:bg-black/20 hover:opacity-100"
          title={copied ? "Copied" : "Copy raw JSON"}
          aria-label={copied ? "Copied raw JSON" : "Copy raw JSON"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void copyRawJson(log.data, () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>

      <div className="nowheel nopan max-h-[420px] overflow-auto p-2">
        {data.collapsed ? (
          <CollapsedBody
            log={log}
            pinnedPaths={data.pinnedPaths}
            hiddenPaths={logSet?.hiddenPaths ?? []}
            onFind={openFind}
            onLink={openLink}
            isLinkedPath={isLinkedPath}
          />
        ) : (
          <JsonTree
            value={log.data}
            pinnedPaths={data.pinnedPaths}
            collapsedPaths={data.collapsedPaths}
            hiddenPaths={logSet?.hiddenPaths ?? []}
            onTogglePin={togglePin}
            onToggleCollapse={toggleCollapsePath}
            onFindSameValue={openFind}
            onDynamicLink={openLink}
            isLinkedPath={isLinkedPath}
          />
        )}
        {Object.keys(log.meta).length > 0 && !data.collapsed ? (
          <div className="mt-2 border-t border-zinc-800 pt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Ancillary</div>
            {Object.entries(log.meta).map(([k, v]) => (
              <div key={k} className="flex gap-1 font-mono text-[11px]">
                <span className="text-zinc-400">{k}:</span>
                <FindSameValueHit path={joinPath("meta", k)} value={v} onFind={openFind} onLink={openLink} isLinkedPath={isLinkedPath}>
                  <span className="text-emerald-400/90">{v}</span>
                </FindSameValueHit>
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
      <NodeConnectHandles />
      <FindSameValueDialog
        open={find !== null}
        onOpenChange={(next) => {
          if (!next) setFind(null);
        }}
        canvasId={canvasId}
        target={find}
      />
      <DynamicLinkDialog
        open={link !== null}
        onOpenChange={(next) => {
          if (!next) setLink(null);
        }}
        canvasId={canvasId}
        target={link}
      />
    </div>
  );
}

async function copyRawJson(data: unknown, onCopied: () => void) {
  const text = JSON.stringify(data, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    onCopied();
    toast.success("Copied raw JSON");
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (!ok) throw new Error("copy failed");
      onCopied();
      toast.success("Copied raw JSON");
    } catch {
      toast.error("Could not copy JSON");
    }
  }
}

function headerFg(hex: string): string {
  const n = hex.replace("#", "");
  if (n.length < 6) return "#fafafa";
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? "#18181b" : "#f4f4f5";
}

function CollapsedBody({
  log,
  pinnedPaths,
  hiddenPaths,
  onFind,
  onLink,
  isLinkedPath,
}: {
  log: LogRecord;
  pinnedPaths: string[];
  hiddenPaths: string[];
  onFind: (query: SameValueQuery) => void;
  onLink: (query: SameValueQuery) => void;
  isLinkedPath: (path: string) => boolean;
}) {
  const visiblePins = pinnedPaths.filter((path) => !isHiddenPath(path, hiddenPaths));
  if (visiblePins.length === 0) {
    return (
      <p className="px-1 py-2 text-[11px] italic text-zinc-500">
        Expand this log and pin fields to keep them visible when collapsed.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {visiblePins.map((path) => {
        const value = path.startsWith("meta.") ? log.meta[path.slice(5)] : getAtPath(log.data, path);
        return (
          <div key={path} className="flex items-start gap-2 font-mono text-[11px]">
            <span className="shrink-0 text-zinc-500">{path}</span>
            <FindSameValueHit path={path} value={value} onFind={onFind} onLink={onLink} isLinkedPath={isLinkedPath} className="min-w-0">
              <span className="text-zinc-200">{formatScalar(value, 100)}</span>
            </FindSameValueHit>
          </div>
        );
      })}
    </div>
  );
}
