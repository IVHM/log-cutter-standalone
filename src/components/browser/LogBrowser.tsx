"use client";

import { Columns3, Eye, EyeOff, Pin, Plus, Search, Trash2, LayoutDashboard } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { formatCellValue } from "@/lib/json-path";
import { logCellValue } from "@/lib/fields";
import { coveragePercent, schemaForSource, suggestColumns, typeLabel } from "@/lib/schema";
import { VirtualLogTable } from "@/components/browser/VirtualLogTable";
import { useProjectStore } from "@/lib/store";
import { HEADER_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { logsInView } from "@/lib/views";

type Props = { viewId?: string; logSetId?: string };

export function LogBrowser({ viewId, logSetId }: Props) {
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

  const view = viewId ? project?.views.find((v) => v.id === viewId) : undefined;
  const resolvedSetId = view?.logSetId ?? logSetId;
  const logSet = project?.logSets.find((s) => s.id === resolvedSetId);
  const isView = Boolean(view);

  const scopedLogs = useMemo(() => {
    if (!project || !resolvedSetId) return [];
    return project.logs.filter((l) => l.logSetId === resolvedSetId);
  }, [project, resolvedSetId]);

  const filtered = useMemo(() => {
    if (!project || !resolvedSetId) return [];
    if (view) return logsInView(project.logs, view, search);
    const q = search.trim().toLowerCase();
    if (!q) return scopedLogs;
    return scopedLogs.filter((log) => {
      const blob = `${JSON.stringify(log.data)} ${JSON.stringify(log.meta)} ${log.note}`.toLowerCase();
      return blob.includes(q);
    });
  }, [project, resolvedSetId, view, search, scopedLogs]);

  const schema = useMemo(() => schemaForSource(logSet, scopedLogs), [logSet, scopedLogs]);
  const fieldPaths = useMemo(() => schema.map((f) => f.path), [schema]);

  useEffect(() => {
    if (!logSet || isView || logSet.columns.length > 0 || schema.length === 0) return;
    const suggested = suggestColumns(schema, scopedLogs.length);
    if (suggested.length === 0) return;
    updateLogSet(logSet.id, { columns: suggested });
  }, [isView, logSet, schema, scopedLogs.length, updateLogSet]);

  const columns = view ? view.columns : (logSet?.columns ?? []);
  const sortBy = view ? view.sortBy : logSet?.sortBy;

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const { path, dir } = sortBy;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = logCellValue(a, path);
      const bv = logCellValue(b, path);
      const as = formatCellValue(av, 200);
      const bs = formatCellValue(bv, 200);
      return dir === "asc" ? as.localeCompare(bs, undefined, { numeric: true }) : bs.localeCompare(as, undefined, { numeric: true });
    });
    return copy;
  }, [filtered, sortBy]);

  if (!project || !logSet || (viewId && !view)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This {viewId ? "view" : "source"} was removed.
      </div>
    );
  }

  const preview = previewId ? project.logs.find((l) => l.id === previewId) : null;
  const sourceId = logSet.id;
  const headerPaths = logSet.headerPaths ?? [];
  const defaultPins = logSet.defaultPinnedPaths ?? [];
  const hiddenPaths = logSet.hiddenPaths ?? [];

  function setColumns(next: string[]) {
    if (view) updateView(view.id, { columns: next });
    else updateLogSet(sourceId, { columns: next });
  }

  function toggleColumn(path: string) {
    setColumns(columns.includes(path) ? columns.filter((c) => c !== path) : [...columns, path]);
  }

  function toggleDefaultPin(path: string) {
    const next = defaultPins.includes(path)
      ? defaultPins.filter((p) => p !== path)
      : [...defaultPins, path];
    updateLogSet(sourceId, { defaultPinnedPaths: next });
  }

  function toggleHidden(path: string) {
    const next = hiddenPaths.includes(path)
      ? hiddenPaths.filter((p) => p !== path)
      : [...hiddenPaths, path];
    updateLogSet(sourceId, { hiddenPaths: next });
  }

  function setHeaderPath(index: number, path: string) {
    const slots = [headerPaths[0] ?? "", headerPaths[1] ?? "", headerPaths[2] ?? ""];
    slots[index] = path === "__none__" ? "" : path;
    updateLogSet(sourceId, { headerPaths: slots.filter(Boolean).slice(0, 3) });
  }

  function setSort(path: string) {
    const dir = sortBy?.path === path && sortBy.dir === "asc" ? "desc" : "asc";
    const patch = { sortBy: { path, dir } as const };
    if (view) updateView(view.id, patch);
    else updateLogSet(sourceId, patch);
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
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Columns3 className="size-3.5" />
            Schema
          </div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            Inferred from {scopedLogs.length} logs in {logSet.name}. Check a field for a column.
            Pin and hide apply to canvas cards from this source.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {schema.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12px] text-zinc-500">
              No fields yet. Import a CSV or JSONL to populate this source.
            </p>
          ) : (
            schema.map((field) => {
              const pinned = defaultPins.includes(field.path);
              const hidden = hiddenPaths.includes(field.path);
              return (
                <div
                  key={field.path}
                  className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-zinc-900"
                >
                  <Checkbox
                    checked={columns.includes(field.path)}
                    onCheckedChange={() => toggleColumn(field.path)}
                    className="shrink-0"
                    aria-label={`Column ${field.path}`}
                  />
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-200"
                    title={field.path}
                  >
                    {field.path}
                  </span>
                  <span
                    className="shrink-0 pl-2 text-right font-mono text-[10px] tabular-nums text-[color-mix(in_oklab,var(--color-zinc-500),black_10%)]"
                    title={`${field.occurrences}/${scopedLogs.length}`}
                  >
                    {typeLabel(field)} · {coveragePercent(field.occurrences, scopedLogs.length)}%
                  </span>
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      title="Default pin for new canvas cards"
                      aria-label={pinned ? "Remove default pin" : "Default pin for new canvas cards"}
                      onClick={() => toggleDefaultPin(field.path)}
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded",
                        pinned ? "text-amber-300" : "text-zinc-400 hover:text-zinc-200",
                      )}
                    >
                      <Pin className={cn("size-3", pinned && "fill-current")} />
                    </button>
                    <button
                      type="button"
                      title={hidden ? "Show field on canvas cards" : "Hide field on canvas cards"}
                      aria-label={hidden ? "Show field" : "Hide field"}
                      onClick={() => toggleHidden(field.path)}
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded",
                        hidden ? "text-zinc-200" : "text-zinc-400 hover:text-zinc-200",
                      )}
                    >
                      {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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

        {view ? (
          <div className="border-b border-zinc-800 px-3 py-2">
            <FilterBuilder
              value={view.filter ?? emptyFilter()}
              fields={fieldPaths.length > 0 ? fieldPaths : columns}
              onChange={(filter) => updateView(view.id, { filter })}
            />
          </div>
        ) : null}

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

        <div className="flex min-h-0 flex-1 flex-col">
          {scopedLogs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-zinc-300">This source is empty.</p>
              <p className="max-w-md text-[13px] text-zinc-500">
                Drop a CSV (JSON in a cell, or one JSON blob per row) or a JSON/JSONL file. Identical
                payloads are skipped using a SHA-256 hash map so duplicates never sit in memory twice.
              </p>
              <Button onClick={() => setImportOpen(true)}>Import logs</Button>
            </div>
          ) : columns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm text-zinc-300">Pick fields from the schema to build this table.</p>
              <p className="text-[13px] text-zinc-500">
                {view
                  ? "Columns are JSON paths. The filter above is what makes this view different from others on the same source."
                  : "Columns are JSON paths. Create a view to save a filter on this source."}
              </p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              No logs match this {view ? "filter" : "search"}
              {view && search.trim() ? " or search" : ""}.
            </div>
          ) : (
            <VirtualLogTable
              logs={sorted}
              columns={columns}
              selected={selected}
              previewId={previewId}
              sortBy={sortBy}
              onToggleSort={setSort}
              onToggleSelect={(id, checked) => {
                const next = new Set(selected);
                if (checked) next.add(id);
                else next.delete(id);
                setSelected(next);
              }}
              onToggleSelectAll={() => {
                if (sorted.length > 0 && sorted.every((l) => selected.has(l.id))) setSelected(new Set());
                else setSelected(new Set(sorted.map((l) => l.id)));
              }}
              onRowClick={(log) => setPreviewId(log.id)}
            />
          )}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-500">
          <span>
            {sorted.length} shown · {scopedLogs.length} in source · {project.logs.length} in project
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
