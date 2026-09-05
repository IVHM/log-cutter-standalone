"use client";

import type { ReactNode } from "react";
import { Pin } from "lucide-react";
import { FindSameValueHit } from "@/components/canvas/FindSameValueHit";
import type { SameValueQuery } from "@/lib/fields";
import { jsonType } from "@/lib/hash";
import { formatScalar, isHiddenPath, isPinnedUnder, joinPath } from "@/lib/json-path";
import { cn } from "@/lib/utils";

const TYPE_CLASS: Record<string, string> = {
  string: "text-emerald-400",
  number: "text-sky-400",
  boolean: "text-violet-400",
  null: "text-muted-foreground",
  object: "text-amber-300",
  array: "text-amber-300",
};

type Props = {
  value: unknown;
  path?: string;
  pinnedPaths: string[];
  collapsedPaths: string[];
  hiddenPaths?: string[];
  onTogglePin: (path: string) => void;
  onToggleCollapse: (path: string) => void;
  onFindSameValue?: (query: SameValueQuery) => void;
  onDynamicLink?: (query: SameValueQuery) => void;
  isLinkedPath?: (path: string) => boolean;
  depth?: number;
};

export function JsonTree({
  value,
  path = "",
  pinnedPaths,
  collapsedPaths,
  hiddenPaths = [],
  onTogglePin,
  onToggleCollapse,
  onFindSameValue,
  onDynamicLink,
  isLinkedPath,
  depth = 0,
}: Props) {
  if (path && isHiddenPath(path, hiddenPaths)) return null;

  const type = jsonType(value);
  const collapsed = path !== "" && collapsedPaths.includes(path);

  if (type !== "object" && type !== "array") {
    return (
      <TreeRow
        path={path}
        label={pathLeaf(path)}
        pinned={pinnedPaths.includes(path)}
        onTogglePin={onTogglePin}
        depth={depth}
      >
        <span className={cn("font-mono text-[12px] break-all", TYPE_CLASS[type])}>
          {onFindSameValue && path ? (
            <FindSameValueHit
              path={path}
              value={value}
              onFind={onFindSameValue}
              onLink={onDynamicLink}
              isLinkedPath={isLinkedPath}
            >
              {type === "string" ? JSON.stringify(formatScalar(value, 120)) : formatScalar(value, 120)}
            </FindSameValueHit>
          ) : type === "string" ? (
            JSON.stringify(formatScalar(value, 120))
          ) : (
            formatScalar(value, 120)
          )}
        </span>
      </TreeRow>
    );
  }

  const entries: Array<[string | number, unknown]> = Array.isArray(value)
    ? value.map((item, i) => [i, item])
    : Object.entries(value as Record<string, unknown>);

  const visible = (collapsed
    ? entries.filter(([key]) => isPinnedUnder(joinPath(path, key), pinnedPaths))
    : entries
  ).filter(([key]) => !isHiddenPath(joinPath(path, key), hiddenPaths));

  return (
    <div>
      {path !== "" && (
        <TreeRow
          path={path}
          label={pathLeaf(path)}
          pinned={pinnedPaths.includes(path)}
          onTogglePin={onTogglePin}
          depth={depth}
          collapsible
          collapsed={collapsed}
          onToggleCollapse={() => onToggleCollapse(path)}
        >
          <span className="font-mono text-[11px] text-muted-foreground">
            {type === "array" ? `[${entries.length}]` : `{${entries.length}}`}
            {collapsed && visible.length > 0 ? " · pinned" : null}
          </span>
        </TreeRow>
      )}
      <div className={path === "" ? "" : "border-l border-border/60 ml-2"}>
        {visible.map(([key, child]) => (
          <JsonTree
            key={String(key)}
            value={child}
            path={joinPath(path, key)}
            pinnedPaths={pinnedPaths}
            collapsedPaths={collapsedPaths}
            hiddenPaths={hiddenPaths}
            onTogglePin={onTogglePin}
            onToggleCollapse={onToggleCollapse}
            onFindSameValue={onFindSameValue}
            onDynamicLink={onDynamicLink}
            isLinkedPath={isLinkedPath}
            depth={path === "" ? depth : depth + 1}
          />
        ))}
        {collapsed && visible.length === 0 && path !== "" ? (
          <div
            className="pl-6 text-[11px] text-muted-foreground/80 italic"
            style={{ paddingLeft: 16 }}
          >
            collapsed · pin a field to keep it visible
          </div>
        ) : null}
      </div>
    </div>
  );
}

function pathLeaf(path: string): string {
  if (!path) return "";
  const match = path.match(/(\[\d+\]|[^.[]+)$/);
  return match?.[1] ?? path;
}

function TreeRow({
  path,
  label,
  pinned,
  onTogglePin,
  depth,
  children,
  collapsible,
  collapsed,
  onToggleCollapse,
}: {
  path: string;
  label: string;
  pinned: boolean;
  onTogglePin: (path: string) => void;
  depth: number;
  children: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <div
      className="group flex items-start gap-1 py-[1px] pr-1 hover:bg-white/5 rounded-sm"
      style={{ paddingLeft: Math.min(depth, 8) * 8 }}
    >
      {collapsible ? (
        <button
          type="button"
          className="mt-0.5 size-4 shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      {path ? (
        <button
          type="button"
          title={pinned ? "Hide when parent is collapsed" : "Show when collapsed"}
          onClick={() => onTogglePin(path)}
          className={cn(
            "mt-0.5 size-4 shrink-0 rounded flex items-center justify-center",
            pinned ? "text-amber-400" : "text-muted-foreground/40 opacity-0 group-hover:opacity-100",
          )}
        >
          <Pin className={cn("size-3", pinned && "fill-current")} />
        </button>
      ) : null}
      {label ? (
        <span className="font-mono text-[12px] text-zinc-300 shrink-0">
          {label}
          <span className="text-muted-foreground">:</span>
        </span>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
