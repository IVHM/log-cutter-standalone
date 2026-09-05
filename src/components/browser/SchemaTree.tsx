"use client";

import { Eye, EyeOff, Pin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { coveragePercent, typeLabel, type SchemaTreeNode } from "@/lib/schema";
import { cn } from "@/lib/utils";

type Props = {
  nodes: SchemaTreeNode[];
  columns: string[];
  defaultPins: string[];
  hiddenPaths: string[];
  logCount: number;
  onToggleColumn: (path: string) => void;
  onTogglePin: (path: string) => void;
  onToggleHidden: (path: string) => void;
  depth?: number;
};

export function SchemaTree({
  nodes,
  columns,
  defaultPins,
  hiddenPaths,
  logCount,
  onToggleColumn,
  onTogglePin,
  onToggleHidden,
  depth = 0,
}: Props) {
  return (
    <div>
      {nodes.map((node) => {
        const field = node.field;
        const pinned = defaultPins.includes(node.path);
        const hidden = hiddenPaths.includes(node.path);
        return (
          <div key={node.path}>
            <div
              className="flex items-center gap-1 rounded py-1 pr-1.5 hover:bg-zinc-900"
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
            {node.children.length > 0 ? (
              <SchemaTree
                nodes={node.children}
                columns={columns}
                defaultPins={defaultPins}
                hiddenPaths={hiddenPaths}
                logCount={logCount}
                onToggleColumn={onToggleColumn}
                onTogglePin={onTogglePin}
                onToggleHidden={onToggleHidden}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
