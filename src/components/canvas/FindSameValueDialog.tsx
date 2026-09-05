"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { VirtualLogTable } from "@/components/browser/VirtualLogTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { findLogsBySameValue } from "@/lib/db";
import { schemaForSource, suggestColumns } from "@/lib/schema";
import { useProjectStore } from "@/lib/store";
import type { LogRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { sourceIndexReady } from "@/lib/working-logs";

export type FindSameValueTarget = {
  originLogId: string;
  sourceId: string;
  path: string;
  valueKey: string;
  display: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string;
  target: FindSameValueTarget | null;
};

export function FindSameValueDialog({ open, onOpenChange, canvasId, target }: Props) {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<FindSameValueTarget | null>(target);
  const projectId = useProjectStore((s) => s.project?.id);
  const logSets = useProjectStore((s) => s.project?.logSets);
  const canvasNodes = useProjectStore((s) => s.project?.canvases.find((c) => c.id === canvasId)?.nodes);
  const addLogsToCanvas = useProjectStore((s) => s.addLogsToCanvas);
  const setCanvasNodes = useProjectStore((s) => s.setCanvasNodes);
  const ensureWorkingLogs = useProjectStore((s) => s.ensureWorkingLogs);
  const { fitView, getNodes } = useReactFlow();
  const source = logSets?.find((set) => set.id === (target ?? shown)?.sourceId);
  const indexReady = sourceIndexReady(source);

  const onCanvas = useMemo(() => {
    const ids = new Set<string>();
    for (const node of canvasNodes ?? []) {
      if (node.type === "log") ids.add((node.data as { logId: string }).logId);
    }
    return ids;
  }, [canvasNodes]);

  useEffect(() => {
    if (target) setShown(target);
  }, [target]);

  useEffect(() => {
    if (!open || !target || !projectId) {
      if (!open) {
        const timer = window.setTimeout(() => {
          setLogs([]);
          setSelected(new Set());
          setShown(null);
        }, 220);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    if (!indexReady) {
      setLogs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void findLogsBySameValue({
      projectId,
      sourceId: target.sourceId,
      path: target.path,
      valueKey: target.valueKey,
    }).then((rows) => {
      if (cancelled) return;
      ensureWorkingLogs(rows);
      setLogs(rows);
      setSelected(new Set(rows.filter((row) => row.id !== target.originLogId).map((row) => row.id)));
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLogs([]);
      setLoading(false);
      toast.error("Could not search field index.");
    });
    return () => {
      cancelled = true;
    };
  }, [open, target, projectId, indexReady, ensureWorkingLogs]);

  const columns = useMemo(() => {
    if (!shown) return [];
    const schema = schemaForSource(source, logs);
    const suggested = source?.columns?.length ? source.columns : suggestColumns(schema, logs.length);
    return [...new Set([shown.path, ...suggested])].slice(0, 7);
  }, [source, logs, shown]);

  const others = logs.filter((log) => log.id !== shown?.originLogId);
  const selectableSelected = [...selected].filter((id) => id !== shown?.originLogId);
  const toAddCount = selectableSelected.filter((id) => !onCanvas.has(id)).length;
  const focusCount = selectableSelected.filter((id) => onCanvas.has(id)).length;
  const actionLabel =
    toAddCount > 0 && focusCount > 0
      ? `Add ${toAddCount} · focus ${focusCount}`
      : focusCount > 0
        ? `Focus ${focusCount} on canvas`
        : `Add ${toAddCount || ""} to canvas`;

  function close(next: boolean) {
    onOpenChange(next);
  }

  function focusOnCanvas(logIds: string[]) {
    const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
    if (!current || logIds.length === 0) return;
    const want = new Set(logIds);
    const nodes = current.nodes.map((node) => ({
      ...node,
      selected: node.type === "log" && want.has((node.data as { logId: string }).logId),
    }));
    setCanvasNodes(canvasId, nodes);
    const selectedNodes = getNodes().filter(
      (node) => node.type === "log" && want.has((node.data as { logId: string }).logId),
    );
    window.requestAnimationFrame(() => {
      void fitView({
        nodes: selectedNodes.length > 0 ? selectedNodes : undefined,
        padding: 0.28,
        duration: 280,
        maxZoom: 1.15,
      });
    });
  }

  function apply() {
    if (!shown || selectableSelected.length === 0) {
      toast.message("Select one or more other logs.");
      return;
    }
    const toAdd = selectableSelected.filter((id) => !onCanvas.has(id));
    const already = selectableSelected.filter((id) => onCanvas.has(id));
    if (toAdd.length > 0) addLogsToCanvas(canvasId, toAdd);
    window.setTimeout(() => focusOnCanvas(selectableSelected), 80);
    const bits: string[] = [];
    if (toAdd.length > 0) bits.push(`Added ${toAdd.length} log${toAdd.length === 1 ? "" : "s"}`);
    if (already.length > 0) bits.push(`focused ${already.length} already on the canvas`);
    toast.success(bits.join(" · ") || "Done.");
    close(false);
  }

  const quoted = shown ? JSON.stringify(shown.display) : "";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("flex flex-col gap-3 sm:max-w-4xl")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4 text-zinc-400" />
            Find same value
          </DialogTitle>
          <DialogDescription>
            {shown ? (
              <>
                <span className="font-mono text-zinc-300">{shown.path}</span>
                {" = "}
                <span className="font-mono text-zinc-300">{quoted}</span>
                {" in "}
                {source?.name ?? "this source"}
                {" · exact match, newest first"}
              </>
            ) : (
              "Exact field match in this source."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="h-[360px] overflow-hidden rounded-md border border-zinc-800">
          { !indexReady ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">Building search index…</p>
          ) : loading ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">Searching field index…</p>
          ) : logs.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">No logs in this source have that value.</p>
          ) : columns.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-400">No columns to display.</p>
          ) : (
            <VirtualLogTable
              className="h-full"
              logs={logs}
              columns={columns}
              selected={selected}
              originLogId={shown?.originLogId}
              onToggleSelect={(id, checked) => {
                if (id === shown?.originLogId) return;
                const next = new Set(selected);
                if (checked) next.add(id);
                else next.delete(id);
                setSelected(next);
              }}
              onToggleSelectAll={() => {
                const ids = logs.filter((l) => l.id !== shown?.originLogId).map((l) => l.id);
                if (ids.length > 0 && ids.every((id) => selected.has(id))) setSelected(new Set());
                else setSelected(new Set(ids));
              }}
              onRowClick={(log) => {
                if (log.id === shown?.originLogId) return;
                const next = new Set(selected);
                if (next.has(log.id)) next.delete(log.id);
                else next.add(log.id);
                setSelected(next);
              }}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span>
            {others.length} other hit{others.length === 1 ? "" : "s"}
            {logs.length > others.length ? " · this card listed for context" : ""}
          </span>
          <Button size="lg" className="h-11 text-base" onClick={apply} disabled={selectableSelected.length === 0}>
            <Plus className="size-5" />
            {actionLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
