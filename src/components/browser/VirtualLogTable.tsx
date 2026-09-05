"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatLogCell } from "@/lib/fields";
import type { LogRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 29;

type Props = {
  logs: LogRecord[];
  columns: string[];
  selected: Set<string>;
  previewId?: string | null;
  sortBy?: { path: string; dir: "asc" | "desc" };
  onToggleSort?: (path: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleSelectAll: () => void;
  onRowClick?: (log: LogRecord) => void;
  className?: string;
};

export function VirtualLogTable({
  logs,
  columns,
  selected,
  previewId,
  sortBy,
  onToggleSort,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
  className,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const colCount = columns.length + 1;
  const allSelected = logs.length > 0 && logs.every((log) => selected.has(log.id));

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

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-auto", className)}>
      <table className="w-full min-w-max border-collapse text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-zinc-950">
          <tr className="border-b border-zinc-800">
            <th className="w-8 px-2 py-1.5">
              <Checkbox checked={allSelected} onCheckedChange={() => onToggleSelectAll()} />
            </th>
            {columns.map((col) => (
              <th key={col} className="px-2 py-1.5 font-mono text-[11px] font-medium text-zinc-400">
                {onToggleSort ? (
                  <button type="button" className="hover:text-zinc-100" onClick={() => onToggleSort(col)}>
                    {col}
                    {sortBy?.path === col ? (sortBy.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                ) : (
                  col
                )}
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
                )}
                onClick={() => onRowClick?.(log)}
              >
                <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(log.id)}
                    onCheckedChange={(v) => onToggleSelect(log.id, Boolean(v))}
                  />
                </td>
                {columns.map((col) => (
                  <td key={col} className="max-w-[280px] truncate px-2 py-1 font-mono text-zinc-200">
                    {formatLogCell(log, col, 80)}
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
