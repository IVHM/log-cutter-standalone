"use client";

import { Search } from "lucide-react";
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
  children: ReactNode;
  className?: string;
};

export function FindSameValueHit({ path, value, onFind, children, className }: Props) {
  const queries = sameValueQueries(path, value);
  if (queries.length === 0) return <span className={className}>{children}</span>;

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
          {queries.length === 1 ? (
            <button
              type="button"
              title="Find same value"
              aria-label="Find same value"
              className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-500 opacity-0 hover:bg-white/10 hover:text-zinc-200 group-hover/find:opacity-100"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onFind(queries[0]);
              }}
            >
              <Search className="size-3" />
            </button>
          ) : (
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
                {queries.map((query) => (
                  <DropdownMenuItem
                    key={`${query.path}:${query.valueKey}`}
                    onSelect={() => onFind(query)}
                  >
                    Find same value · {query.display}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[80] min-w-48">
        {queries.map((query) => (
          <ContextMenuItem key={`${query.path}:${query.valueKey}`} onSelect={() => onFind(query)}>
            <Search className="size-3.5" />
            {queries.length === 1 ? "Find same value" : `Find same value · ${query.display}`}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
