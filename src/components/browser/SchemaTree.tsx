"use client";

import { memo, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, EyeOff, Pin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { coveragePercent, typeLabel, type SchemaTreeNode } from "@/lib/schema";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 28;

type FlatRow = { node: SchemaTreeNode; depth: number };

function flattenSchema(nodes: SchemaTreeNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length > 0) flattenSchema(node.children, depth + 1, out);
  }
  return out;
}

type Props = {
  nodes: SchemaTreeNode[];
  columns: string[];
  defaultPins: string[];
  hiddenPaths: string[];
  logCount: number;
  onToggleColumn: (path: string) => void;
  onTogglePin: (path: string) => void;
  onToggleHidden: (path: string) => void;
  className?: string;
};

export const SchemaTree = memo(function SchemaTree({
  nodes,
  columns,
  defaultPins,
  hiddenPaths,
  logCount,
  onToggleColumn,
  onTogglePin,
  onToggleHidden,
  className,
}: Props) {
  const rows = useMemo(() => flattenSchema(nodes), [nodes]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) => rows[index]?.node.path ?? index,
  });

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-auto p-2", className)}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const { node, depth } = row;
          const field = node.field;
          const pinned = defaultPins.includes(node.path);
          const hidden = hiddenPaths.includes(node.path);
          return (
            <div
              key={node.path}
              className="absolute left-0 right-0"
              style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
            >
              <div
                className="flex h-full items-center gap-1 rounded pr-1.5 hover:bg-zinc-900"
                style={{ paddingLeft: 6 + depth * 10 }}
              >
                {depth > 0 ? (
                  <span className="w-3 shrink-0 text-[11px] leading-none text-zinc-600" aria-hidden>
                    ↳
                  </span>
                ) : null}
                {field ? (
                  <Checkbox
                    checked={columns.includes(node.path)}
                    onCheckedChange={() => onToggleColumn(node.path)}
                    className="shrink-0"
                    aria-label={`Column ${node.path}`}
                  />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-200"
                  title={node.path}
                >
                  {node.label}
                </span>
                {field ? (
                  <>
                    <span
                      className="shrink-0 pl-1 text-right font-mono text-[10px] tabular-nums text-[color-mix(in_oklab,var(--color-zinc-500),black_10%)]"
                      title={`${field.occurrences}/${logCount}`}
                    >
                      {typeLabel(field)} · {coveragePercent(field.occurrences, logCount)}%
                    </span>
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        title="Default pin for new canvas cards"
                        aria-label={pinned ? "Remove default pin" : "Default pin for new canvas cards"}
                        onClick={() => onTogglePin(node.path)}
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
                        onClick={() => onToggleHidden(node.path)}
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded",
                          hidden ? "text-zinc-200" : "text-zinc-400 hover:text-zinc-200",
                        )}
                      >
                        {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      </button>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
