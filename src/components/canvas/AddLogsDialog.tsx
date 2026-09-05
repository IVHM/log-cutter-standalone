"use client";

import { ChevronLeft, Columns3, FileJson, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VirtualLogTable } from "@/components/browser/VirtualLogTable";
import { coveragePercent, schemaForSource, suggestColumns, typeLabel } from "@/lib/schema";
import { useProjectStore } from "@/lib/store";
import { sourceLogCount, sourceLogs } from "@/lib/working-logs";
import type { SchemaField } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string;
};

export function AddLogsDialog({ open, onOpenChange, canvasId }: Props) {
  const project = useProjectStore((s) => s.project);
  const logsBySource = useProjectStore((s) => s.logsBySource);
  const addLogsToCanvas = useProjectStore((s) => s.addLogsToCanvas);
  const [setId, setSetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<string[]>([]);
  const [replaceCol, setReplaceCol] = useState<string | null>(null);
  const [fieldQuery, setFieldQuery] = useState("");

  const logs = useMemo(() => {
    if (!project || !setId) return [];
    return sourceLogs(project, logsBySource, setId);
  }, [project, logsBySource, setId]);

  const logSet = project?.logSets.find((s) => s.id === setId);
  const schema = useMemo(() => schemaForSource(logSet, logs), [logSet, logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const blob = `${JSON.stringify(log.data)} ${JSON.stringify(log.meta)} ${log.note}`.toLowerCase();
      return blob.includes(q);
    });
  }, [logs, search]);

  const pickerFields = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase();
    if (!q) return schema;
    return schema.filter((field) => field.path.toLowerCase().includes(q));
  }, [schema, fieldQuery]);

  function pickSet(id: string) {
    setSetId(id);
    const setLogs = project?.logs.filter((l) => l.logSetId === id) ?? [];
    const set = project?.logSets.find((s) => s.id === id);
    setColumns(suggestColumns(schemaForSource(set, setLogs), setLogs.length));
  }

  function closeFieldPicker() {
    setReplaceCol(null);
    setFieldQuery("");
  }

  function close(next: boolean) {
    if (!next && replaceCol) {
      closeFieldPicker();
      return;
    }
    if (!next) {
      setSetId(null);
      setSearch("");
      setSelected(new Set());
      setColumns([]);
      closeFieldPicker();
    }
    onOpenChange(next);
  }

  function replaceColumn(from: string, to: string) {
    setColumns((current) => {
      if (from === to) return current;
      if (current.includes(to)) {
        return current.map((path) => (path === from ? to : path === to ? from : path));
      }
      return current.map((path) => (path === from ? to : path));
    });
    closeFieldPicker();
  }

  function add() {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.message("Select one or more logs.");
      return;
    }
    addLogsToCanvas(canvasId, ids);
    toast.success(`Added ${ids.length} log${ids.length === 1 ? "" : "s"} to the canvas.`);
    close(false);
  }

  function toggleColumn(path: string) {
    setColumns((current) =>
      current.includes(path) ? current.filter((c) => c !== path) : [...current, path],
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className={cn("flex flex-col gap-3 sm:max-w-lg", setId && "sm:max-w-4xl")}
        onPointerDownOutside={(e) => {
          if (replaceCol) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (replaceCol) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (replaceCol) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add log(s) to canvas</DialogTitle>
          <DialogDescription>
            {setId
              ? "Choose columns, pick the records you need, then add them."
              : "Choose a source, then pick records to drop on this canvas."}
          </DialogDescription>
        </DialogHeader>

        {!setId ? (
          <div className="space-y-2">
            {(project?.logSets ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">No sources in this project yet.</p>
            ) : (
              project?.logSets.map((set) => {
                const count = sourceLogCount(project, logsBySource, set);
                return (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => pickSet(set.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-3 py-3 text-left hover:bg-zinc-900"
                  >
                    <FileJson className="size-4 text-zinc-400" />
                    <span className="min-w-0 flex-1 truncate">{set.name}</span>
                    <span className="text-[12px] text-zinc-500">{count}</span>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSetId(null);
                  setSelected(new Set());
                  setSearch("");
                  setColumns([]);
                  closeFieldPicker();
                }}
              >
                <ChevronLeft className="size-3.5" />
                Sets
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                {project?.logSets.find((s) => s.id === setId)?.name}
              </span>
              <ColumnPicker schema={schema} columns={columns} logCount={logs.length} onToggle={toggleColumn} />
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search payload, notes…"
                className="pl-7"
              />
            </div>
            <div className="h-[360px] overflow-hidden rounded-md border border-zinc-800">
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-zinc-500">No logs match.</p>
              ) : columns.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-zinc-400">
                  Choose columns to display, then select logs to add.
                </p>
              ) : (
                <VirtualLogTable
                  className="h-full"
                  logs={filtered}
                  columns={columns}
                  selected={selected}
                  onHeaderClick={(path) => {
                    setFieldQuery("");
                    setReplaceCol(path);
                  }}
                  onToggleSelect={(id, checked) => {
                    const next = new Set(selected);
                    if (checked) next.add(id);
                    else next.delete(id);
                    setSelected(next);
                  }}
                  onToggleSelectAll={() => {
                    if (filtered.length > 0 && filtered.every((l) => selected.has(l.id))) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(filtered.map((l) => l.id)));
                    }
                  }}
                  onRowClick={(log) => {
                    const next = new Set(selected);
                    if (next.has(log.id)) next.delete(log.id);
                    else next.add(log.id);
                    setSelected(next);
                  }}
                />
              )}
            </div>
            <Button size="lg" className="h-11 w-full text-base" onClick={add} disabled={selected.size === 0}>
              <Plus className="size-5" />
              Add {selected.size || ""} log{selected.size === 1 ? "" : "s"} to canvas
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
      <Dialog
        open={replaceCol !== null}
        onOpenChange={(next) => {
          if (!next) closeFieldPicker();
        }}
      >
        <DialogContent
          overlayClassName="z-[60]"
          className="z-[70] flex max-h-[min(80vh,32rem)] flex-col sm:max-w-md"
          onPointerDownOutside={(e) => e.stopPropagation()}
          onInteractOutside={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Column field</DialogTitle>
            <DialogDescription>
              {replaceCol
                ? `Choose a schema field to show instead of ${replaceCol}.`
                : "Choose a schema field for this column."}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={fieldQuery}
              onChange={(e) => setFieldQuery(e.target.value)}
              placeholder="Search fields…"
              className="pl-7"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {schema.length === 0 ? (
              <p className="px-1.5 py-6 text-center text-[12px] text-zinc-500">No fields in this set.</p>
            ) : pickerFields.length === 0 ? (
              <p className="px-1.5 py-6 text-center text-[12px] text-zinc-500">No fields match that search.</p>
            ) : (
              pickerFields.map((field) => {
                const current = field.path === replaceCol;
                const shown = columns.includes(field.path);
                return (
                  <button
                    key={field.path}
                    type="button"
                    onClick={() => replaceCol && replaceColumn(replaceCol, field.path)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded px-1.5 py-1.5 text-left hover:bg-zinc-800",
                      current && "bg-zinc-800",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] text-zinc-200">{field.path}</span>
                      <span className="text-[10px] text-zinc-500">
                        {typeLabel(field)} · {coveragePercent(field.occurrences, logs.length)}%
                        {current ? " · this column" : shown ? " · already shown" : ""}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
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
      <PopoverContent align="end" className="z-[60] w-80 p-2">
        <p className="px-1.5 pb-2 text-[11px] text-zinc-500">Check fields to show them as columns.</p>
        <div className="max-h-72 overflow-auto">
          {schema.length === 0 ? (
            <p className="px-1.5 py-6 text-center text-[12px] text-zinc-500">No fields in this set.</p>
          ) : (
            schema.map((field) => (
              <label
                key={field.path}
                className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-zinc-800"
              >
                <Checkbox
                  checked={columns.includes(field.path)}
                  onCheckedChange={() => onToggle(field.path)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] text-zinc-200">{field.path}</span>
                  <span className="text-[10px] text-zinc-500" title={`${field.occurrences}/${logCount}`}>
                    {typeLabel(field)} · {coveragePercent(field.occurrences, logCount)}%
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
