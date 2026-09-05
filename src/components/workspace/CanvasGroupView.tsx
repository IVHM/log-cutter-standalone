"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GroupNameField } from "@/components/workspace/GroupNameField";
import { otherPoolNameCandidates } from "@/lib/groups";
import { useProjectStore } from "@/lib/store";

type Props = { canvasGroupId: string };

export function CanvasGroupView({ canvasGroupId }: Props) {
  const project = useProjectStore((s) => s.project);
  const renameCanvasGroup = useProjectStore((s) => s.renameCanvasGroup);
  const moveCanvasToGroup = useProjectStore((s) => s.moveCanvasToGroup);
  const group = project?.canvasGroups.find((g) => g.id === canvasGroupId);

  if (!project || !group) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">This group was deleted.</div>;
  }

  const members = group.canvasIds
    .map((id) => project.canvases.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const candidates = otherPoolNameCandidates(project.canvasGroups, project.sourceGroups, "");

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Canvas group</h2>
          <p className="mt-1 text-[13px] text-zinc-500">Optional folder for canvases. Does not bind sources.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <GroupNameField
            key={group.id + group.name}
            value={group.name}
            onCommit={(name) => renameCanvasGroup(group.id, name)}
            candidates={candidates}
          />
        </div>
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Members</h3>
          {members.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Empty. Use Move to group on a canvas in the sidebar.</p>
          ) : (
            members.map((canvas) => (
              <div
                key={canvas.id}
                className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-zinc-200">{canvas.name}</span>
                <Button size="sm" variant="ghost" onClick={() => moveCanvasToGroup(canvas.id, null)}>
                  Ungroup
                </Button>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
