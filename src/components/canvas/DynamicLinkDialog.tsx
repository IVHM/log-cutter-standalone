"use client";

import { Columns3, Link2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { VirtualLogTable } from "@/components/browser/VirtualLogTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { findLogsBySameValue } from "@/lib/db";
import { coveragePercent, schemaForSource, suggestColumns, typeLabel } from "@/lib/schema";
import { useProjectStore } from "@/lib/store";
import type { LogRecord, SchemaField } from "@/lib/types";

const HIT_CAP = 2500;

export type DynamicLinkTarget = {
  originLogId: string;
  sourceId: string;
  path: string;
  valueKey: string;
  display: string;
  label: string;
  bindings: Record<string, string>;
};

type SourceHits = {
  sourceId: string;
  name: string;
  logs: LogRecord[];
  truncated: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string;
  target: DynamicLinkTarget | null;
};

export function DynamicLinkDialog({ open, onOpenChange, canvasId, target }: Props) {
  const [tables, setTables] = useState<SourceHits[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columnsBySource, setColumnsBySource] = useState<Record<string, string[]>>({});
  const [shown, setShown] = useState<DynamicLinkTarget | null>(target);
  const project = useProjectStore((s) => s.project);
  const addLogsToCanvas = useProjectStore((s) => s.addLogsToCanvas);
  const setCanvasNodes = useProjectStore((s) => s.setCanvasNodes);
  const ensureWorkingLogs = useProjectStore((s) => s.ensureWorkingLogs);
  const { fitView, getNodes } = useReactFlow();

  const onCanvas = useMemo(() => {
    const ids = new Set<string>();
    const canvas = project?.canvases.find((c) => c.id === canvasId);
    for (const node of canvas?.nodes ?? []) {
      if (node.type === "log") ids.add((node.data as { logId: string }).logId);
    }
    return ids;
  }, [project, canvasId]);

  useEffect(() => {
    if (target) setShown(target);
  }, [target]);

  useEffect(() => {
    if (!open || !target || !project) {
      if (!open) {
        const timer = window.setTimeout(() => {
          setTables([]);
          setSelected(new Set());
          setShown(null);
          setColumnsBySource({});
        }, 220);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    const entries = Object.entries(target.bindings).filter(([, path]) => path);
    void Promise.all(
      entries.map(async ([sourceId, path]) => {
        const rows = await findLogsBySameValue({
          projectId: project.id,
          sourceId,
          path,
          valueKey: target.valueKey,
        });
        const truncated = rows.length > HIT_CAP;
        return {
          sourceId,
          name: project.logSets.find((s) => s.id === sourceId)?.name ?? "Source",
          logs: truncated ? rows.slice(0, HIT_CAP) : rows,
          truncated,
        } satisfies SourceHits;
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const hits = rows.filter((row) => row.logs.length > 0);
        ensureWorkingLogs(hits.flatMap((row) => row.logs));
        setTables(hits);
        const nextCols: Record<string, string[]> = {};
        for (const row of hits) {
          const set = project.logSets.find((s) => s.id === row.sourceId);
          const schema = schemaForSource(set, row.logs);
          const bound = target.bindings[row.sourceId];
          const suggested = set?.columns?.length ? set.columns : suggestColumns(schema, row.logs.length);
          nextCols[row.sourceId] = [...new Set([bound, ...suggested].filter(Boolean))].slice(0, 7);
        }
        setColumnsBySource(nextCols);
        const others = hits.flatMap((row) => row.logs.filter((log) => log.id !== target.originLogId).map((log) => log.id));
        setSelected(new Set(others));
        setLoading(false);
        if (hits.some((row) => row.truncated)) {
          toast.message(`Showing the newest ${HIT_CAP} hits per source.`);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTables([]);
        setLoading(false);
        toast.error("Could not search field index.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, target, project, ensureWorkingLogs]);

  const selectableSelected = [...selected].filter((id) => id !== shown?.originLogId);
  const toAddCount = selectableSelected.filter((id) => !onCanvas.has(id)).length;
  const focusCount = selectableSelected.filter((id) => onCanvas.has(id)).length;
  const actionLabel =
    toAddCount > 0 && focusCount > 0
      ? `Add ${toAddCount} · focus ${focusCount}`
      : focusCount > 0
        ? `Focus ${focusCount} on canvas`
        : `Add ${toAddCount || ""} to canvas`;

  function focusOnCanvas(logIds: string[]) {
    const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
    if (!current || logIds.length === 0) return;
    const want = new Set(logIds);
    setCanvasNodes(
      canvasId,
      current.nodes.map((node) => ({
        ...node,
        selected: node.type === "log" && want.has((node.data as { logId: string }).logId),
      })),
    );
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
    if (selectableSelected.length === 0) {
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
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-zinc-400" />
            {shown ? `${shown.label} · ${shown.display}` : "Linked ID"}
          </DialogTitle>
          <DialogDescription>
            Hits across bound sources for this identity value. Newest first in each table.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">Searching field index…</p>
          ) : tables.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">No linked logs have that value.</p>
          ) : (
            tables.map((table) => {
              const set = project?.logSets.find((s) => s.id === table.sourceId);
              const schema = schemaForSource(set, table.logs);
              const columns = columnsBySource[table.sourceId] ?? [];
              const tableSelected = new Set(table.logs.filter((log) => selected.has(log.id)).map((log) => log.id));
              return (
                <section key={table.sourceId} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                      {table.name}
                      <span className="ml-2 text-[12px] text-zinc-500">
                        {table.logs.length} hit{table.logs.length === 1 ? "" : "s"}
                        {table.truncated ? " · capped" : ""}
                      </span>
                    </h3>
                    <ColumnPicker
                      schema={schema}
                      columns={columns}
                      logCount={table.logs.length}
                      onToggle={(path) => {
                        setColumnsBySource((current) => {
                          const list = current[table.sourceId] ?? [];
                          return {
                            ...current,
                            [table.sourceId]: list.includes(path)
                              ? list.filter((item) => item !== path)
                              : [...list, path],
                          };
                        });
                      }}
                    />
                  </div>
                  <div className="h-[240px] overflow-hidden rounded-md border border-zinc-800">
                    {columns.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-zinc-400">Choose columns to display.</p>
                    ) : (
                      <VirtualLogTable
                        className="h-full"
                        logs={table.logs}
                        columns={columns}
                        selected={tableSelected}
                        originLogId={shown?.originLogId}
                        onToggleSelect={(id, checked) => {
                          if (id === shown?.originLogId) return;
                          const next = new Set(selected);
                          if (checked) next.add(id);
                          else next.delete(id);
                          setSelected(next);
                        }}
                        onToggleSelectAll={() => {
                          const ids = table.logs.filter((l) => l.id !== shown?.originLogId).map((l) => l.id);
                          const next = new Set(selected);
                          const allOn = ids.length > 0 && ids.every((id) => next.has(id));
                          for (const id of ids) {
                            if (allOn) next.delete(id);
                            else next.add(id);
                          }
                          setSelected(next);
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
                </section>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span>This card is listed and marked when it is a hit.</span>
          <Button size="lg" className="h-11 text-base" onClick={apply} disabled={selectableSelected.length === 0}>
            <Plus className="size-5" />
            {actionLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ColumnPicker({
  schema,
  columns,
  logCount,
  onToggle,
}: {
  schema: SchemaField[];
  columns: string[];
  logCount: number;
  onToggle: (path: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Columns3 className="size-3.5" />
          Columns{columns.length > 0 ? ` (${columns.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[80] w-80 p-2">
        <p className="px-1.5 pb-2 text-[11px] text-zinc-500">Check fields to show them as columns.</p>
        <div className="max-h-72 overflow-auto">
          {schema.map((field) => (
            <label
              key={field.path}
              className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1.5 hover:bg-zinc-800"
            >
              <Checkbox checked={columns.includes(field.path)} onCheckedChange={() => onToggle(field.path)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[11px] text-zinc-200">{field.path}</span>
                <span className="text-[10px] text-zinc-500">
                  {typeLabel(field)} · {coveragePercent(field.occurrences, logCount)}%
                </span>
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
