"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emptyClause, FILTER_OPS, filterPreview } from "@/lib/filter";
import type { FilterClause, FilterExpr, FilterGroup, FilterOp } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  value: FilterGroup;
  fields: string[];
  onChange: (next: FilterGroup) => void;
};

export function FilterBuilder({ value, fields, onChange }: Props) {
  const preview = filterPreview(value);

  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-zinc-400">View filter</p>
        <span className="truncate font-mono text-[10px] text-zinc-500" title={preview || undefined}>
          {preview || "No clauses — this view shows the whole source."}
        </span>
      </div>
      <GroupEditor group={value} fields={fields} onChange={onChange} root />
    </div>
  );
}

function GroupEditor({
  group,
  fields,
  onChange,
  root,
}: {
  group: FilterGroup;
  fields: string[];
  onChange: (next: FilterGroup) => void;
  root?: boolean;
}) {
  function patchChild(index: number, next: FilterExpr) {
    onChange({ ...group, children: group.children.map((c, i) => (i === index ? next : c)) });
  }
  function removeChild(index: number) {
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) });
  }

  return (
    <div className={cn(!root && "rounded border border-zinc-800/80 bg-zinc-900/50 p-2")}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        {group.children.length > 1 ? (
          <Select value={group.join} onValueChange={(v) => onChange({ ...group, join: v as "and" | "or" })}>
            <SelectTrigger className="h-7 w-[88px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">AND</SelectItem>
              <SelectItem value="or">OR</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onChange({ ...group, children: [...group.children, emptyClause(fields[0] ?? "")] })}
        >
          <Plus className="size-3" />
          Clause
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() =>
            onChange({
              ...group,
              children: [...group.children, { kind: "group", join: "or", children: [emptyClause(fields[0] ?? "")] }],
            })
          }
        >
          <Plus className="size-3" />
          ( group )
        </Button>
      </div>
      <div className="space-y-1">
        {group.children.map((child, i) => (
          <div key={i} className="flex items-start gap-1">
            {i > 0 ? (
              <span className="w-10 shrink-0 pt-1.5 text-center font-mono text-[10px] text-zinc-500">
                {group.join.toUpperCase()}
              </span>
            ) : (
              <span className="w-10 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              {child.kind === "clause" ? (
                <ClauseEditor
                  clause={child}
                  fields={fields}
                  onChange={(next) => patchChild(i, next)}
                  onRemove={() => removeChild(i)}
                />
              ) : (
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <GroupEditor group={child} fields={fields} onChange={(next) => patchChild(i, next)} />
                  </div>
                  <Button size="xs" variant="ghost" aria-label="Remove group" onClick={() => removeChild(i)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClauseEditor({
  clause,
  fields,
  onChange,
  onRemove,
}: {
  clause: FilterClause;
  fields: string[];
  onChange: (next: FilterClause) => void;
  onRemove: () => void;
}) {
  const meta = FILTER_OPS.find((o) => o.id === clause.op) ?? FILTER_OPS[0];
  const options = fields.includes(clause.path) || !clause.path ? fields : [clause.path, ...fields];

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select value={clause.path || "__pick__"} onValueChange={(v) => onChange({ ...clause, path: v === "__pick__" ? "" : v })}>
        <SelectTrigger className="h-7 w-[140px] font-mono text-[11px]">
          <SelectValue placeholder="column" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__pick__">column</SelectItem>
          {options.map((path) => (
            <SelectItem key={path} value={path} className="font-mono text-[11px]">
              {path}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={clause.op} onValueChange={(v) => onChange({ ...clause, op: v as FilterOp })}>
        <SelectTrigger className="h-7 w-[130px] text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FILTER_OPS.map((op) => (
            <SelectItem key={op.id} value={op.id}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {meta.values >= 1 ? (
        <Input
          value={clause.value}
          onChange={(e) => onChange({ ...clause, value: e.target.value })}
          placeholder="value"
          className="h-7 w-[110px] font-mono text-[11px]"
        />
      ) : null}
      {meta.values === 2 ? (
        <>
          <span className="text-[10px] text-zinc-500">and</span>
          <Input
            value={clause.valueTo}
            onChange={(e) => onChange({ ...clause, valueTo: e.target.value })}
            placeholder="value"
            className="h-7 w-[110px] font-mono text-[11px]"
          />
        </>
      ) : null}
      <Button size="xs" variant="ghost" aria-label="Remove clause" onClick={onRemove}>
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}
