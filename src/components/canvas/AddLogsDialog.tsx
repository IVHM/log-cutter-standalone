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
import { formatScalar, getAtPath } from "@/lib/json-path";
import { inferSchema, suggestColumns, typeLabel } from "@/lib/schema";
import { useProjectStore } from "@/lib/store";
import type { LogRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string;
};

export function AddLogsDialog({ open, onOpenChange, canvasId }: Props) {
  const project = useProjectStore((s) => s.project);
  const addLogsToCanvas = useProjectStore((s) => s.addLogsToCanvas);
  const [setId, setSetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<string[]>([]);

  const logs = useMemo(() => {
    if (!project || !setId) return [];
    return project.logs.filter((l) => l.logSetId === setId);
  }, [project, setId]);

  const schema = useMemo(() => inferSchema(logs), [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const blob = `${JSON.stringify(log.data)} ${JSON.stringify(log.meta)} ${log.note}`.toLowerCase();
      return blob.includes(q);
    });
  }, [logs, search]);

  function pickSet(id: string) {
    setSetId(id);
    const setLogs = project?.logs.filter((l) => l.logSetId === id) ?? [];
    setColumns(suggestColumns(inferSchema(setLogs), setLogs.length));
  }

  function close(next: boolean) {
    if (!next) {
      setSetId(null);
      setSearch("");
      setSelected(new Set());
      setColumns([]);
    }
    onOpenChange(next);
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

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className={cn("flex flex-col gap-3 sm:max-w-lg", setId && "sm:max-w-4xl")}>
        <DialogHeader>
          <DialogTitle>Add log(s) to canvas</DialogTitle>
          <DialogDescription>
            {setId
              ? "Choose columns, pick the records you need, then add them."
              : "Choose a log set, then pick records to drop on this canvas."}
          </DialogDescription>
        </DialogHeader>

        {!setId ? (
          <div className="space-y-2">
            {(project?.logSets ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">No log sets in this project yet.</p>
            ) : (
              project?.logSets.map((set) => {
                const count = project.logs.filter((l) => l.logSetId === set.id).length;
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
            <div className="max-h-[360px] overflow-auto rounded-md border border-zinc-800">
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-zinc-500">No logs match.</p>
              ) : columns.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-zinc-400">
                  Choose columns to display, then select logs to add.
                </p>
              ) : (
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-zinc-950">
                    <tr className="border-b border-zinc-800">
                      <th className="w-8 px-2 py-1.5">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => {
                            if (allSelected) setSelected(new Set());
                            else setSelected(new Set(filtered.map((l) => l.id)));
                          }}
                        />
                      </th>
                      {columns.map((col) => (
                        <th key={col} className="px-2 py-1.5 font-mono text-[11px] font-medium text-zinc-400">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log) => (
                      <tr
                        key={log.id}
                        className={cn(
                          "cursor-pointer border-b border-zinc-900 hover:bg-zinc-900",
                          selected.has(log.id) && "bg-sky-950/40",
                        )}
                        onClick={() => {
                          const next = new Set(selected);
                          if (next.has(log.id)) next.delete(log.id);
                          else next.add(log.id);
                          setSelected(next);
                        }}
                      >
                        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(log.id)}
                            onCheckedChange={(v) => {
                              const next = new Set(selected);
                              if (v) next.add(log.id);
                              else next.delete(log.id);
                              setSelected(next);
                            }}
                          />
                        </td>
                        {columns.map((col) => (
                          <td key={col} className="max-w-[240px] truncate px-2 py-1.5 font-mono text-zinc-200">
                            {formatScalar(cellValue(log, col), 80)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
  );
}

function cellValue(log: LogRecord, col: string) {
  return col.startsWith("meta.") ? log.meta[col.slice(5)] : getAtPath(log.data, col);
}

function ColumnPicker({
  schema,
  columns,
  logCount,
  onToggle,
}: {
  schema: ReturnType<typeof inferSchema>;
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
                  <span className="text-[10px] text-zinc-500">
                    {typeLabel(field)} · {field.occurrences}/{logCount}
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
