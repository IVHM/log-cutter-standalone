"use client";

import { Columns3, Plus, Search, Trash2, LayoutDashboard } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { toast } from "sonner";
import { FilterBuilder } from "@/components/browser/FilterBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { schemaForSource, schemaToTree, suggestColumns } from "@/lib/schema";
import { SchemaTree } from "@/components/browser/SchemaTree";
import { VirtualLogTable } from "@/components/browser/VirtualLogTable";
import { useProjectStore } from "@/lib/store";
import { HEADER_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { logsInView } from "@/lib/views";
import { findWorkingLog, sourceLogs, workingLogTotal } from "@/lib/working-logs";

type Props = { viewId?: string; logSetId?: string };

const DEFAULT_SCHEMA_WIDTH = 280;
const MIN_SCHEMA_WIDTH = 180;

function clampSchemaWidth(px: number, total: number) {
  const max = Math.floor(total / 2);
  const min = Math.min(MIN_SCHEMA_WIDTH, max);
  return Math.min(max, Math.max(min, Math.round(px)));
}

export function LogBrowser({ viewId, logSetId }: Props) {
  const project = useProjectStore((s) => s.project);
  const logsBySource = useProjectStore((s) => s.logsBySource);
  const updateView = useProjectStore((s) => s.updateView);
  const updateLogSet = useProjectStore((s) => s.updateLogSet);
  const toggleIdField = useProjectStore((s) => s.toggleIdField);
  const removeLogs = useProjectStore((s) => s.removeLogs);
  const setImportOpen = useProjectStore((s) => s.setImportOpen);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState<string[]>([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const splitRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const schemaWidthRef = useRef(DEFAULT_SCHEMA_WIDTH);
  const dragXRef = useRef(0);
  const dragRafRef = useRef(0);
  const draggingRef = useRef(false);

  const view = viewId ? project?.views.find((v) => v.id === viewId) : undefined;
  const resolvedSetId = view?.logSetId ?? logSetId;
  const logSet = project?.logSets.find((s) => s.id === resolvedSetId);
  const isView = Boolean(view);

  const scopedLogs = useMemo(() => {
    if (!project || !resolvedSetId) return [];
    return sourceLogs(project, logsBySource, resolvedSetId);
  }, [project, logsBySource, resolvedSetId]);

  const filtered = useMemo(() => {
    if (!project || !resolvedSetId) return [];
    if (view) return logsInView(scopedLogs, view, search);
    const q = search.trim().toLowerCase();
    if (!q) return scopedLogs;
    return scopedLogs.filter((log) => {
      const blob = `${JSON.stringify(log.data)} ${JSON.stringify(log.meta)} ${log.note}`.toLowerCase();
      return blob.includes(q);
    });
  }, [project, resolvedSetId, view, search, scopedLogs]);

  const schema = useMemo(() => schemaForSource(logSet, scopedLogs), [logSet, scopedLogs]);
  const schemaTree = useMemo(() => schemaToTree(schema), [schema]);
  const fieldPaths = useMemo(() => schema.map((f) => f.path), [schema]);

  function paintSchemaWidth(px: number) {
    schemaWidthRef.current = px;
    if (asideRef.current) asideRef.current.style.width = `${px}px`;
  }

  function schemaWidthFromClientX(clientX: number) {
    const el = splitRef.current;
    if (!el) return schemaWidthRef.current;
    const rect = el.getBoundingClientRect();
    return clampSchemaWidth(clientX - rect.left, rect.width);
  }

  function stopSchemaResize() {
    draggingRef.current = false;
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = 0;
    }
    handleRef.current?.removeAttribute("data-resizing");
    if (asideRef.current) asideRef.current.style.willChange = "";
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  useEffect(() => {
    if (!logSet || isView || logSet.columns.length > 0 || schema.length === 0) return;
    const suggested = suggestColumns(schema, scopedLogs.length);
    if (suggested.length === 0) return;
    updateLogSet(logSet.id, { columns: suggested });
  }, [isView, logSet, schema, scopedLogs.length, updateLogSet]);

  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const clampToHalf = () => {
      if (draggingRef.current) return;
      paintSchemaWidth(clampSchemaWidth(schemaWidthRef.current, el.getBoundingClientRect().width));
    };
    clampToHalf();
    const observer = new ResizeObserver(clampToHalf);
    observer.observe(el);
    return () => observer.disconnect();
  }, [logSet?.id, viewId]);

  useEffect(() => () => stopSchemaResize(), []);

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

  const preview = previewId ? findWorkingLog(project, logsBySource, previewId) : null;
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

  function applySchemaWidth(clientX: number) {
    paintSchemaWidth(schemaWidthFromClientX(clientX));
  }

  function onResizePointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.focus();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture needs a real pointer */
    }
    draggingRef.current = true;
    handleRef.current?.setAttribute("data-resizing", "true");
    if (asideRef.current) asideRef.current.style.willChange = "width";
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    applySchemaWidth(e.clientX);
  }

  function onResizePointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return;
    dragXRef.current = e.clientX;
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = 0;
      applySchemaWidth(dragXRef.current);
    });
  }

  function onResizePointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    applySchemaWidth(e.clientX);
    stopSchemaResize();
  }

  return (
    <div className="flex h-full min-h-0">
      <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1">
      <aside
        ref={asideRef}
        className="flex shrink-0 flex-col contain-layout bg-zinc-950"
        style={{ width: schemaWidthRef.current }}
      >
        <div className="border-b border-zinc-800 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Columns3 className="size-3.5" />
            Schema
          </div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            Inferred from {scopedLogs.length} logs in {logSet.name}. Check a field for a column.
            Pin and hide apply to canvas cards. The key icon marks identity fields for 🔗.
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {schema.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12px] text-zinc-500">
              No fields yet. Import a CSV or JSONL to populate this source.
            </p>
          ) : (
            <SchemaTree
              className="h-full"
              nodes={schemaTree}
              columns={columns}
              defaultPins={defaultPins}
              hiddenPaths={hiddenPaths}
              logCount={scopedLogs.length}
              onToggleColumn={toggleColumn}
              onTogglePin={toggleDefaultPin}
              onToggleHidden={toggleHidden}
              idFieldPaths={logSet.idFieldPaths ?? []}
              onToggleIdField={(path) => toggleIdField(logSet.id, path)}
            />
          )}
        </div>
      </aside>
      <button
        ref={handleRef}
        type="button"
        aria-label="Resize schema"
        className={cn(
          "relative z-10 h-full min-h-0 w-px min-w-0 shrink-0 appearance-none touch-none select-none border-0 bg-zinc-800 p-0 outline-none",
          "before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:cursor-col-resize before:content-['']",
          "hover:bg-zinc-600 data-[resizing=true]:w-[2px] data-[resizing=true]:bg-zinc-400 data-[resizing=true]:shadow-[0_0_10px_rgba(255,255,255,0.22)]",
        )}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const el = splitRef.current;
          if (!el) return;
          const delta = e.key === "ArrowRight" ? 16 : -16;
          paintSchemaWidth(clampSchemaWidth(schemaWidthRef.current + delta, el.getBoundingClientRect().width));
        }}
      />

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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true, resolvedSetId ?? "new")}
          >
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
                payloads already in this source are skipped; the same log can still exist in another
                source.
              </p>
              <Button onClick={() => setImportOpen(true, resolvedSetId ?? "new")}>Import logs</Button>
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
            {sorted.length} shown · {scopedLogs.length} in source · {workingLogTotal(project, logsBySource)} in project
          </span>
          <Badge variant="secondary">{selected.size} selected</Badge>
        </div>
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
