"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Eye, EyeOff, KeyRound, Pin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { looksLikeIdPath } from "@/lib/groups";
import { coveragePercent, typeLabel, type SchemaTreeNode } from "@/lib/schema";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 28;

type FlatRow = { node: SchemaTreeNode; depth: number; hasChildren: boolean };

function flattenSchema(
  nodes: SchemaTreeNode[],
  expanded: Set<string>,
  depth = 0,
  out: FlatRow[] = [],
): FlatRow[] {
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    out.push({ node, depth, hasChildren });
    if (hasChildren && expanded.has(node.path)) {
      flattenSchema(node.children, expanded, depth + 1, out);
    }
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
  idFieldPaths?: string[];
  onToggleIdField?: (path: string) => void;
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
  idFieldPaths = [],
  onToggleIdField,
  className,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => flattenSchema(nodes, expanded), [nodes, expanded]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey: (index) => rows[index]?.node.path ?? index,
  });

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-auto p-2", className)}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          const { node, depth, hasChildren } = row;
          const field = node.field;
          const pinned = defaultPins.includes(node.path);
          const hidden = hiddenPaths.includes(node.path);
          const open = expanded.has(node.path);
          return (
            <div
              key={node.path}
              className="absolute left-0 right-0"
              style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
            >
              <div
                className="flex h-full items-center gap-1 rounded pr-1.5 hover:bg-zinc-900"
                style={{ paddingLeft: 4 + depth * 10 }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
                    title={open ? "Collapse" : "Expand"}
                    onClick={() => toggleExpanded(node.path)}
                    className="flex size-4 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-zinc-200"
                  >
                    <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
                  </button>
                ) : (
                  <span className="size-4 shrink-0" aria-hidden />
                )}
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
                      {onToggleIdField ? (
                        <button
                          type="button"
                          title={
                            idFieldPaths.includes(node.path)
                              ? "ID field"
                              : looksLikeIdPath(node.path)
                                ? "Looks like an ID — click to mark"
                                : "Mark as ID field"
                          }
                          aria-label={idFieldPaths.includes(node.path) ? "Unmark ID field" : "Mark as ID field"}
                          onClick={() => onToggleIdField(node.path)}
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded",
                            idFieldPaths.includes(node.path)
                              ? "text-sky-300"
                              : looksLikeIdPath(node.path)
                                ? "text-sky-700 hover:text-sky-300"
                                : "text-zinc-400 hover:text-zinc-200",
                          )}
                        >
                          <KeyRound className={cn("size-3", idFieldPaths.includes(node.path) && "fill-current")} />
                        </button>
                      ) : null}
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
