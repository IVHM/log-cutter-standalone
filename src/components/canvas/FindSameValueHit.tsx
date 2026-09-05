"use client";

import { Link2, Search } from "lucide-react";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sameValueQueries, type SameValueQuery } from "@/lib/fields";
import { cn } from "@/lib/utils";

type Props = {
  path: string;
  value: unknown;
  onFind: (query: SameValueQuery) => void;
  onLink?: (query: SameValueQuery) => void;
  isLinkedPath?: (path: string) => boolean;
  children: ReactNode;
  className?: string;
};

export function FindSameValueHit({ path, value, onFind, onLink, isLinkedPath, children, className }: Props) {
  const queries = sameValueQueries(path, value);
  if (queries.length === 0) return <span className={className}>{children}</span>;
  const linked = queries.filter((query) => isLinkedPath?.(query.path));
  const findQueries = queries.filter((query) => !isLinkedPath?.(query.path));

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span
          className={cn(
            "nodrag nopan nowheel group/find inline-flex min-w-0 max-w-full items-start gap-0.5",
            className,
          )}
          onContextMenu={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="min-w-0 break-all">{children}</span>
          {linked.length === 1 && onLink ? (
            <button
              type="button"
              title={linked[0].display}
              aria-label="Open linked ID"
              className="nodrag nopan nowheel mt-0.5 shrink-0 rounded p-0.5 text-sky-400 hover:bg-white/10 hover:text-sky-200"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLink(linked[0]);
              }}
            >
              <Link2 className="size-3" />
            </button>
          ) : linked.length > 1 && onLink ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Open linked ID"
                  aria-label="Open linked ID"
                  className="nodrag nopan nowheel mt-0.5 shrink-0 rounded p-0.5 text-sky-400 hover:bg-white/10 hover:text-sky-200"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link2 className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="z-[80] min-w-48" align="start">
                {linked.map((query) => (
                  <DropdownMenuItem key={`link:${query.path}:${query.valueKey}`} onSelect={() => onLink(query)}>
                    {query.display}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {findQueries.length === 1 ? (
            <button
              type="button"
              title="Find same value"
              aria-label="Find same value"
              className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-500 opacity-0 hover:bg-white/10 hover:text-zinc-200 group-hover/find:opacity-100"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onFind(findQueries[0]);
              }}
            >
              <Search className="size-3" />
            </button>
          ) : findQueries.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Find same value"
                  aria-label="Find same value"
                  className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-500 opacity-0 hover:bg-white/10 hover:text-zinc-200 group-hover/find:opacity-100"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Search className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="z-[80] min-w-48" align="start">
                {findQueries.map((query) => (
                  <DropdownMenuItem
                    key={`${query.path}:${query.valueKey}`}
                    onSelect={() => onFind(query)}
                  >
                    Find same value · {query.display}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[80] min-w-48">
        {linked.map((query) => (
          <ContextMenuItem
            key={`link:${query.path}:${query.valueKey}`}
            onSelect={() => onLink?.(query)}
          >
            <Link2 className="size-3.5" />
            Open linked ID{linked.length > 1 ? ` · ${query.display}` : ""}
          </ContextMenuItem>
        ))}
        {findQueries.map((query) => (
          <ContextMenuItem key={`${query.path}:${query.valueKey}`} onSelect={() => onFind(query)}>
            <Search className="size-3.5" />
            {findQueries.length === 1 ? "Find same value" : `Find same value · ${query.display}`}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
