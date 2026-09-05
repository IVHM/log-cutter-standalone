"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatLogCell } from "@/lib/fields";
import type { LogRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 29;
const SELECT_KEY = "__select__";
const DEFAULT_SELECT_WIDTH = 52;
const MIN_SELECT_WIDTH = 40;
const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 72;

type Props = {
  logs: LogRecord[];
  columns: string[];
  selected: Set<string>;
  previewId?: string | null;
  originLogId?: string;
  sortBy?: { path: string; dir: "asc" | "desc" };
  onToggleSort?: (path: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleSelectAll: () => void;
  onRowClick?: (log: LogRecord) => void;
  className?: string;
};

function defaultWidth(key: string) {
  return key === SELECT_KEY ? DEFAULT_SELECT_WIDTH : DEFAULT_COL_WIDTH;
}

function minWidth(key: string) {
  return key === SELECT_KEY ? MIN_SELECT_WIDTH : MIN_COL_WIDTH;
}

export function VirtualLogTable({
  logs,
  columns,
  selected,
  previewId,
  originLogId,
  sortBy,
  onToggleSort,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
  className,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const colElsRef = useRef(new Map<string, HTMLTableColElement>());
  const widthsRef = useRef(new Map<string, number>());
  const columnsRef = useRef(columns);
  const draggingKeyRef = useRef<string | null>(null);
  const activeHandleRef = useRef<HTMLButtonElement | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartWRef = useRef(0);
  const dragXRef = useRef(0);
  const dragRafRef = useRef(0);
  const colCount = columns.length + 1;
  const selectable = originLogId ? logs.filter((log) => log.id !== originLogId) : logs;
  const allSelected = selectable.length > 0 && selectable.every((log) => selected.has(log.id));

  columnsRef.current = columns;

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
    getItemKey: (index) => logs[index]?.id ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  function widthOf(key: string) {
    return widthsRef.current.get(key) ?? defaultWidth(key);
  }

  function tableWidthFor(cols: string[]) {
    return widthOf(SELECT_KEY) + cols.reduce((sum, col) => sum + widthOf(col), 0);
  }

  function clampColWidth(px: number, key: string) {
    const total = parentRef.current?.clientWidth ?? DEFAULT_COL_WIDTH * 2;
    const max = Math.floor(total / 2);
    const min = Math.min(minWidth(key), max);
    return Math.min(max, Math.max(min, Math.round(px)));
  }

  function paintTableWidth(cols: string[]) {
    const px = tableWidthFor(cols);
    const table = tableRef.current;
    if (table) {
      table.style.width = `${px}px`;
      table.style.minWidth = `${px}px`;
    }
  }

  function paintColWidth(key: string, px: number) {
    widthsRef.current.set(key, px);
    const col = colElsRef.current.get(key);
    if (col) col.style.width = `${px}px`;
    paintTableWidth(columnsRef.current);
  }

  function stopColumnResize() {
    draggingKeyRef.current = null;
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = 0;
    }
    activeHandleRef.current?.removeAttribute("data-resizing");
    activeHandleRef.current = null;
    if (tableRef.current) tableRef.current.style.willChange = "";
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  function applyDragX(clientX: number) {
    const key = draggingKeyRef.current;
    if (!key) return;
    paintColWidth(key, clampColWidth(dragStartWRef.current + (clientX - dragStartXRef.current), key));
  }

  function onResizePointerDown(key: string, e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.focus();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture needs a real pointer */
    }
    draggingKeyRef.current = key;
    activeHandleRef.current = e.currentTarget;
    dragStartXRef.current = e.clientX;
    dragStartWRef.current = widthOf(key);
    e.currentTarget.setAttribute("data-resizing", "true");
    if (tableRef.current) tableRef.current.style.willChange = "width";
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function onResizePointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!draggingKeyRef.current) return;
    dragXRef.current = e.clientX;
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = 0;
      applyDragX(dragXRef.current);
    });
  }

  function onResizePointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    applyDragX(e.clientX);
    stopColumnResize();
  }

  function onResizeKeyDown(key: string, e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 16 : -16;
    paintColWidth(key, clampColWidth(widthOf(key) + delta, key));
  }

  function bindCol(key: string) {
    return (el: HTMLTableColElement | null) => {
      if (el) {
        colElsRef.current.set(key, el);
        el.style.width = `${widthOf(key)}px`;
      } else {
        colElsRef.current.delete(key);
      }
    };
  }

  useEffect(() => () => stopColumnResize(), []);

  const colKeys = [SELECT_KEY, ...columns];

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-auto", className)}>
      <table
        ref={tableRef}
        className="table-fixed border-collapse text-left text-[12px] contain-layout"
        style={{ width: tableWidthFor(columns), minWidth: tableWidthFor(columns) }}
      >
        <colgroup>
          {colKeys.map((key) => (
            <col key={key} ref={bindCol(key)} style={{ width: widthOf(key) }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-zinc-950">
          <tr className="border-b border-zinc-800">
            <th className="overflow-visible p-0">
              <div className="flex min-w-0 items-stretch">
                <div className="flex min-w-0 flex-1 items-center px-2 py-1.5">
                  <Checkbox checked={allSelected} onCheckedChange={() => onToggleSelectAll()} />
                </div>
                <ColumnResizeHandle
                  label="select"
                  onPointerDown={(e) => onResizePointerDown(SELECT_KEY, e)}
                  onPointerMove={onResizePointerMove}
                  onPointerUp={onResizePointerUp}
                  onPointerCancel={onResizePointerUp}
                  onKeyDown={(e) => onResizeKeyDown(SELECT_KEY, e)}
                />
              </div>
            </th>
            {columns.map((col) => (
              <th key={col} className="overflow-visible p-0 font-mono text-[11px] font-medium text-zinc-400">
                <div className="flex min-w-0 items-stretch">
                  <div className="min-w-0 flex-1 overflow-hidden px-2 py-1.5">
                    {onToggleSort ? (
                      <button
                        type="button"
                        className="block w-full truncate text-left hover:text-zinc-100"
                        onClick={() => onToggleSort(col)}
                      >
                        {col}
                        {sortBy?.path === col ? (sortBy.dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    ) : (
                      <span className="block truncate">{col}</span>
                    )}
                  </div>
                  <ColumnResizeHandle
                    label={col}
                    onPointerDown={(e) => onResizePointerDown(col, e)}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                    onPointerCancel={onResizePointerUp}
                    onKeyDown={(e) => onResizeKeyDown(col, e)}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {virtualRows.map((virtualRow) => {
            const log = logs[virtualRow.index];
            if (!log) return null;
            return (
              <tr
                key={log.id}
                className={cn(
                  "cursor-pointer border-b border-zinc-900 hover:bg-zinc-900/80",
                  selected.has(log.id) && "bg-sky-950/40",
                  previewId === log.id && "bg-zinc-900",
                  originLogId === log.id && "bg-zinc-900/60",
                )}
                onClick={() => onRowClick?.(log)}
              >
                <td className="overflow-hidden px-2 py-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(log.id)}
                    onCheckedChange={(v) => onToggleSelect(log.id, Boolean(v))}
                  />
                </td>
                {columns.map((col, colIndex) => (
                  <td key={col} className="overflow-hidden truncate px-2 py-1 font-mono text-zinc-200">
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      <span className="truncate">{formatLogCell(log, col, 80)}</span>
                      {colIndex === 0 && originLogId === log.id ? (
                        <Badge variant="secondary" className="shrink-0 text-[9px] uppercase">
                          This card
                        </Badge>
                      ) : null}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ColumnResizeHandle({
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: {
  label: string;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Resize ${label}`}
      title="Drag to resize"
      className={cn(
        "relative z-10 shrink-0 appearance-none touch-none select-none border-0 bg-transparent px-1 py-1.5",
        "font-normal leading-none text-zinc-600 outline-none",
        "before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:cursor-col-resize before:content-['']",
        "hover:text-zinc-400",
        "data-[resizing=true]:text-zinc-200 data-[resizing=true]:shadow-[0_0_10px_rgba(255,255,255,0.22)]",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      |
    </button>
  );
}
