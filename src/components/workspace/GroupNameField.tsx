"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onCommit: (name: string) => void;
  candidates: string[];
  className?: string;
};

export function GroupNameField({ value, onCommit, candidates, className }: Props) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return candidates.filter((name) => !q || name.toLowerCase().includes(q)).slice(0, 8);
  }, [candidates, draft]);

  function commit(name: string) {
    const next = name.trim();
    setDraft(next || value);
    setOpen(false);
    if (next && next !== value) onCommit(next);
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            commit(draft);
          }, 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {open && matches.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-lg">
          {matches.map((name) => (
            <button
              key={name}
              type="button"
              className="block w-full truncate px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
