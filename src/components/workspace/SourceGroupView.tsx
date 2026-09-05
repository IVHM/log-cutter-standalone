"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GroupNameField } from "@/components/workspace/GroupNameField";
import { otherPoolNameCandidates } from "@/lib/groups";
import { useProjectStore } from "@/lib/store";

type Props = { sourceGroupId: string };

export function SourceGroupView({ sourceGroupId }: Props) {
  const project = useProjectStore((s) => s.project);
  const renameSourceGroup = useProjectStore((s) => s.renameSourceGroup);
  const createIdLink = useProjectStore((s) => s.createIdLink);
  const updateIdLink = useProjectStore((s) => s.updateIdLink);
  const deleteIdLink = useProjectStore((s) => s.deleteIdLink);
  const moveSourceToGroup = useProjectStore((s) => s.moveSourceToGroup);

  const group = project?.sourceGroups.find((g) => g.id === sourceGroupId);
  if (!project || !group) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">This group was deleted.</div>;
  }

  const members = group.sourceIds
    .map((id) => project.logSets.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const candidates = otherPoolNameCandidates(project.sourceGroups, project.canvasGroups, "");

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Source group</h2>
          <p className="mt-1 text-[13px] text-zinc-500">
            Organize sources and declare identity links for 🔗 on canvas cards.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Name</Label>
          <GroupNameField
            key={group.id + group.name}
            value={group.name}
            onCommit={(name) => renameSourceGroup(group.id, name)}
            candidates={candidates}
          />
          <p className="text-[11px] text-zinc-600">
            Suggestions copy a canvas group name only. The two groups stay separate.
          </p>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Members</h3>
          {members.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Empty. Use Move to group on a source in the sidebar.
            </p>
          ) : (
            members.map((set) => (
              <div
                key={set.id}
                className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-zinc-200">{set.name}</span>
                <Button size="sm" variant="ghost" onClick={() => moveSourceToGroup(set.id, null)}>
                  Ungroup
                </Button>
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-zinc-300">Identity links</h3>
            <Button size="sm" variant="outline" onClick={() => createIdLink(group.id)} disabled={members.length === 0}>
              <Plus className="size-3.5" />
              Add link
            </Button>
          </div>
          {members.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Add sources to this group before binding identity fields.</p>
          ) : group.idLinks.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              No links yet. Bind the same id across sources, then 🔗 appears on matching canvas card values.
            </p>
          ) : (
            group.idLinks.map((link) => (
              <div key={link.id} className="space-y-3 rounded-lg border border-zinc-800 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={link.label}
                    onChange={(e) => updateIdLink(group.id, link.id, { label: e.target.value })}
                    className="h-8"
                    aria-label="Link label"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete link"
                    onClick={() => deleteIdLink(group.id, link.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {members.map((set) => {
                  const fields = [...set.schemaFields].sort((a, b) => {
                    const aId = set.idFieldPaths.includes(a.path) ? 0 : 1;
                    const bId = set.idFieldPaths.includes(b.path) ? 0 : 1;
                    return aId - bId || a.path.localeCompare(b.path);
                  });
                  return (
                    <div key={set.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-2">
                      <span className="truncate text-[12px] text-zinc-400">{set.name}</span>
                      <Select
                        value={link.bindings[set.id] ?? "none"}
                        onValueChange={(path) => {
                          const bindings = { ...link.bindings };
                          if (path === "none") delete bindings[set.id];
                          else bindings[set.id] = path;
                          updateIdLink(group.id, link.id, { bindings });
                        }}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Not bound" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not bound</SelectItem>
                          {fields.map((field) => (
                            <SelectItem key={field.path} value={field.path}>
                              {field.path}
                              {set.idFieldPaths.includes(field.path) ? " · ID" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
