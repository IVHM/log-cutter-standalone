"use client";

import { Columns3, Plus, Search, Trash2, LayoutDashboard } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FilterBuilder } from "@/components/browser/FilterBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonTree } from "@/components/json/JsonTree";
import { PlaceOnCanvasDialog } from "@/components/canvas/PlaceOnCanvasDialog";
import { emptyFilter } from "@/lib/filter";
import { formatScalar, getAtPath } from "@/lib/json-path";
import { inferSchema, typeLabel } from "@/lib/schema";
import { useProjectStore } from "@/lib/store";
import { HEADER_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { logsInView } from "@/lib/views";

type Props = { viewId: string };

export function LogBrowser({ viewId }: Props) {
  const project = useProjectStore((s) => s.project);
  const updateView = useProjectStore((s) => s.updateView);
  const updateLogSet = useProjectStore((s) => s.updateLogSet);
  const removeLogs = useProjectStore((s) => s.removeLogs);
  const setImportOpen = useProjectStore((s) => s.setImportOpen);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState<string[]>([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const view = project?.views.find((v) => v.id === viewId);
  const logSet = project?.logSets.find((s) => s.id === view?.logSetId);

  const scopedLogs = useMemo(() => {
    if (!project || !view) return [];
    return project.logs.filter((l) => l.logSetId === view.logSetId);
  }, [project, view]);

  const filtered = useMemo(() => {
    if (!project || !view) return [];
    return logsInView(project.logs, view, search);
  }, [project, view, search]);

  const schema = useMemo(() => inferSchema(scopedLogs), [scopedLogs]);
  const fieldPaths = useMemo(() => schema.map((f) => f.path), [schema]);

  const sorted = useMemo(() => {
    if (!view?.sortBy) return filtered;
    const { path, dir } = view.sortBy;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = getAtPath(a.data, path) ?? a.meta[path.replace(/^meta\./, "")];
      const bv = getAtPath(b.data, path) ?? b.meta[path.replace(/^meta\./, "")];
      const as = av == null ? "" : String(av);
      const bs = bv == null ? "" : String(bv);
      return dir === "asc" ? as.localeCompare(bs, undefined, { numeric: true }) : bs.localeCompare(as, undefined, { numeric: true });
    });
    return copy;
  }, [filtered, view]);

  if (!project || !view) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This view was removed.
      </div>
    );
  }

  const columns = view.columns;
  const allSelected = sorted.length > 0 && sorted.every((l) => selected.has(l.id));
  const preview = previewId ? project.logs.find((l) => l.id === previewId) : null;
  const headerPaths = logSet?.headerPaths ?? [];

  function toggleColumn(path: string) {
    const next = columns.includes(path) ? columns.filter((c) => c !== path) : [...columns, path];
    updateView(viewId, { columns: next });
  }

  function setHeaderPath(index: number, path: string) {
    if (!logSet) return;
    const slots = [headerPaths[0] ?? "", headerPaths[1] ?? "", headerPaths[2] ?? ""];
    slots[index] = path === "__none__" ? "" : path;
    updateLogSet(logSet.id, { headerPaths: slots.filter(Boolean).slice(0, 3) });
  }

  function requestPlace(ids: string[]) {
    if (ids.length === 0) {
      toast.message("Select one or more rows first.");
      return;
    }
    setPlaceIds(ids);
    setPlaceOpen(true);
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Columns3 className="size-3.5" />
            Schema
          </div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            Inferred from {scopedLogs.length} logs in {logSet?.name ?? "this set"}. Check a field to
            add it as a column.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {schema.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12px] text-zinc-500">
              No fields yet. Import a CSV or JSONL to populate this set.
            </p>
          ) : (
            schema.map((field) => (
              <label
                key={field.path}
                className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-zinc-900"
              >
                <Checkbox
                  checked={columns.includes(field.path)}
                  onCheckedChange={() => toggleColumn(field.path)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] text-zinc-200">{field.path}</span>
                  <span className="text-[10px] text-zinc-500">
                    {typeLabel(field)} · {field.occurrences}/{scopedLogs.length}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {logSet ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <span className="text-[11px] font-medium text-zinc-400">Canvas card header</span>
            {[0, 1, 2].map((i) => {
              const current = headerPaths[i];
              const options = [...new Set([current, ...fieldPaths].filter(Boolean))];
              return (
                <Select
                  key={i}
                  value={current ?? "__none__"}
                  onValueChange={(v) => setHeaderPath(i, v)}
                >
                  <SelectTrigger className="h-7 w-[140px] font-mono text-[11px]">
                    <SelectValue placeholder={`Field ${i + 1}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {options.map((path) => (
                      <SelectItem key={path} value={path} className="font-mono text-[11px]">
                        {path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            })}
            <div className="flex items-center gap-1">
              {HEADER_COLORS.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.name}
                  aria-label={swatch.name}
                  className={cn(
                    "size-5 rounded-full ring-1 ring-white/20",
                    logSet.headerColor === swatch.hex && "ring-2 ring-sky-300",
                  )}
                  style={{ background: swatch.hex }}
                  onClick={() => updateLogSet(logSet.id, { headerColor: swatch.hex })}
                />
              ))}
            </div>
            <span className="text-[10px] text-zinc-600">Up to three fields · wraps to two lines on the card</span>
          </div>
        ) : null}

        <div className="border-b border-zinc-800 px-3 py-2">
          <FilterBuilder
            value={view.filter ?? emptyFilter()}
            fields={fieldPaths.length > 0 ? fieldPaths : columns}
            onChange={(filter) => updateView(viewId, { filter })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Temporary search in this tab…"
              className="h-8 pl-7"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Plus className="size-3.5" />
            Import
          </Button>
          <Button size="sm" onClick={() => requestPlace([...selected])} disabled={selected.size === 0}>
            <LayoutDashboard className="size-3.5" />
            Place on canvas
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selected.size === 0}
            onClick={() => {
              const ids = [...selected];
              removeLogs(ids);
              setSelected(new Set());
              toast.success(`Removed ${ids.length} log${ids.length === 1 ? "" : "s"} from the dataset.`);
            }}
          >
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {scopedLogs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-zinc-300">This log set is empty.</p>
              <p className="max-w-md text-[13px] text-zinc-500">
                Drop a CSV (JSON in a cell, or one JSON blob per row) or a JSON/JSONL file. Identical
                payloads are skipped using a SHA-256 hash map so duplicates never sit in memory twice.
              </p>
              <Button onClick={() => setImportOpen(true)}>Import logs</Button>
            </div>
          ) : columns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm text-zinc-300">Pick fields from the schema to build this view.</p>
              <p className="text-[13px] text-zinc-500">
                Columns are JSON paths. The filter above is what makes this view different from others
                on the same set.
              </p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              No logs match this filter{search.trim() ? " or search" : ""}.
            </div>
          ) : (
            <table className="w-full min-w-max border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-zinc-950">
                <tr className="border-b border-zinc-800">
                  <th className="w-8 px-2 py-1.5">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => {
                        if (allSelected) setSelected(new Set());
                        else setSelected(new Set(sorted.map((l) => l.id)));
                      }}
                    />
                  </th>
                  {columns.map((col) => (
                    <th key={col} className="px-2 py-1.5 font-mono text-[11px] font-medium text-zinc-400">
                      <button
                        type="button"
                        className="hover:text-zinc-100"
                        onClick={() => {
                          const dir =
                            view.sortBy?.path === col && view.sortBy.dir === "asc" ? "desc" : "asc";
                          updateView(viewId, { sortBy: { path: col, dir } });
                        }}
                      >
                        {col}
                        {view.sortBy?.path === col ? (view.sortBy.dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((log) => (
                  <tr
                    key={log.id}
                    className={cn(
                      "cursor-pointer border-b border-zinc-900 hover:bg-zinc-900/80",
                      selected.has(log.id) && "bg-sky-950/40",
                      previewId === log.id && "bg-zinc-900",
                    )}
                    onClick={() => setPreviewId(log.id)}
                  >
                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
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
                    {columns.map((col) => {
                      const value = col.startsWith("meta.")
                        ? log.meta[col.slice(5)]
                        : getAtPath(log.data, col);
                      return (
                        <td key={col} className="max-w-[280px] truncate px-2 py-1 font-mono text-zinc-200">
                          {formatScalar(value, 80)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-500">
          <span>
            {sorted.length} shown · {scopedLogs.length} in set · {project.logs.length} in project
          </span>
          <Badge variant="secondary">{selected.size} selected</Badge>
        </div>
      </div>

      {preview ? (
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="font-mono text-[11px] text-zinc-400">{preview.hash.slice(0, 12)}</span>
            <Button size="xs" variant="ghost" onClick={() => setPreviewId(null)}>
              Close
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <JsonTree
              value={preview.data}
              pinnedPaths={pinDraft}
              collapsedPaths={[]}
              onTogglePin={(path) =>
                setPinDraft((cur) => (cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path]))
              }
              onToggleCollapse={() => undefined}
            />
          </div>
          <div className="border-t border-zinc-800 p-2">
            <p className="mb-2 text-[11px] text-zinc-500">
              Pins here are a preview. Place the log on a canvas to keep pinned fields per card.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => requestPlace([preview.id])}
            >
              Place this log on canvas
            </Button>
          </div>
        </aside>
      ) : null}
      <PlaceOnCanvasDialog open={placeOpen} onOpenChange={setPlaceOpen} logIds={placeIds} />
    </div>
  );
}
