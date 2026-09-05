"use client";

import {
  ChevronRight,
  FolderClosed,
  FolderKanban,
  Funnel,
  Layers,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Settings,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ImportProjectControl } from "@/components/project/ImportProjectControl";
import { AddCanvasDialog } from "@/components/workspace/AddCanvasDialog";
import { AddSourceDialog } from "@/components/workspace/AddSourceDialog";
import { canvasGroupOf, sourceGroupOf } from "@/lib/groups";
import { useProjectStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { logsInView } from "@/lib/views";

export function Sidebar() {
  const project = useProjectStore((s) => s.project);
  const projects = useProjectStore((s) => s.projects);
  const openProject = useProjectStore((s) => s.openProject);
  const createProject = useProjectStore((s) => s.createProject);
  const loadSample = useProjectStore((s) => s.loadSample);
  const openItem = useProjectStore((s) => s.openItem);
  const createView = useProjectStore((s) => s.createView);
  const renameCanvas = useProjectStore((s) => s.renameCanvas);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addCanvasOpen, setAddCanvasOpen] = useState(false);
  const renameLogSet = useProjectStore((s) => s.renameLogSet);
  const updateView = useProjectStore((s) => s.updateView);
  const deleteCanvas = useProjectStore((s) => s.deleteCanvas);
  const deleteLogSet = useProjectStore((s) => s.deleteLogSet);
  const deleteView = useProjectStore((s) => s.deleteView);
  const renameSourceGroup = useProjectStore((s) => s.renameSourceGroup);
  const renameCanvasGroup = useProjectStore((s) => s.renameCanvasGroup);
  const deleteSourceGroup = useProjectStore((s) => s.deleteSourceGroup);
  const deleteCanvasGroup = useProjectStore((s) => s.deleteCanvasGroup);
  const moveSourceToGroup = useProjectStore((s) => s.moveSourceToGroup);
  const moveCanvasToGroup = useProjectStore((s) => s.moveCanvasToGroup);
  const setImportOpen = useProjectStore((s) => s.setImportOpen);
  const activeTabId = project?.activeTabId;
  const activeTab = project?.openTabs.find((t) => t.id === activeTabId);

  if (!project) return null;

  const viewsBySource = project.logSets
    .map((set) => ({
      set,
      views: project.views.filter((v) => v.logSetId === set.id),
    }))
    .filter((group) => group.views.length > 0);

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-1 border-b border-zinc-800 p-2">
        <FolderKanban className="size-4 text-sky-400" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-sm font-medium hover:bg-zinc-900"
            >
              <span className="truncate">{project.name}</span>
              <ChevronRight className="size-3 shrink-0 rotate-90 text-zinc-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => void openProject(p.id)}
                className={cn(p.id === project.id && "bg-accent")}
              >
                {p.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const name = window.prompt("Project name", "New investigation");
                if (name) void createProject(name);
              }}
            >
              New project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void loadSample()}>
              Load sample investigation
            </DropdownMenuItem>
            <ImportProjectControl mode="menuitem" />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2">
        <Section title="Canvases" onAdd={() => setAddCanvasOpen(true)}>
          {(project.canvasGroups ?? []).map((group) => (
            <div key={group.id} className="mb-1">
              <GroupHeader
                label={group.name}
                active={activeTab?.kind === "canvasGroup" && activeTab.canvasGroupId === group.id}
                onClick={() => openItem({ type: "canvasGroup", id: group.id })}
                onRename={(name) => renameCanvasGroup(group.id, name)}
                onDelete={() => deleteCanvasGroup(group.id)}
              />
              {group.canvasIds.map((id) => {
                const c = project.canvases.find((item) => item.id === id);
                if (!c) return null;
                return (
                  <OutlineRow
                    key={c.id}
                    icon={<LayoutDashboard className="size-3.5" />}
                    label={c.name}
                    active={activeTab?.kind === "canvas" && activeTab.canvasId === c.id}
                    count={c.nodes.filter((n) => n.type === "log").length}
                    indented
                    onClick={() => openItem({ type: "canvas", id: c.id })}
                    onRename={(name) => renameCanvas(c.id, name)}
                    onDelete={() => deleteCanvas(c.id)}
                    groups={project.canvasGroups}
                    currentGroupId={group.id}
                    onMoveToGroup={(groupId) => moveCanvasToGroup(c.id, groupId)}
                  />
                );
              })}
            </div>
          ))}
          {project.canvases
            .filter((c) => !canvasGroupOf(project, c.id))
            .map((c) => (
              <OutlineRow
                key={c.id}
                icon={<LayoutDashboard className="size-3.5" />}
                label={c.name}
                active={activeTab?.kind === "canvas" && activeTab.canvasId === c.id}
                count={c.nodes.filter((n) => n.type === "log").length}
                onClick={() => openItem({ type: "canvas", id: c.id })}
                onRename={(name) => renameCanvas(c.id, name)}
                onDelete={() => deleteCanvas(c.id)}
                groups={project.canvasGroups}
                currentGroupId={null}
                onMoveToGroup={(groupId) => moveCanvasToGroup(c.id, groupId)}
              />
            ))}
        </Section>

        <Section title="Sources" onAdd={() => setAddSourceOpen(true)}>
          {(project.sourceGroups ?? []).map((group) => (
            <div key={group.id} className="mb-1">
              <GroupHeader
                label={group.name}
                active={activeTab?.kind === "sourceGroup" && activeTab.sourceGroupId === group.id}
                onClick={() => openItem({ type: "sourceGroup", id: group.id })}
                onRename={(name) => renameSourceGroup(group.id, name)}
                onDelete={() => deleteSourceGroup(group.id)}
              />
              {group.sourceIds.map((id) => {
                const set = project.logSets.find((item) => item.id === id);
                if (!set) return null;
                const count = project.logs.filter((l) => l.logSetId === set.id).length;
                return (
                  <OutlineRow
                    key={set.id}
                    icon={<FolderClosed className="size-3.5" />}
                    label={set.name}
                    active={activeTab?.kind === "source" && activeTab.logSetId === set.id}
                    count={count}
                    indented
                    onClick={() => openItem({ type: "logSet", id: set.id })}
                    onRename={(name) => renameLogSet(set.id, name)}
                    onDelete={() => deleteLogSet(set.id)}
                    groups={project.sourceGroups}
                    currentGroupId={group.id}
                    onMoveToGroup={(groupId) => moveSourceToGroup(set.id, groupId)}
                  />
                );
              })}
            </div>
          ))}
          {project.logSets
            .filter((set) => !sourceGroupOf(project, set.id))
            .map((set) => {
              const count = project.logs.filter((l) => l.logSetId === set.id).length;
              return (
                <OutlineRow
                  key={set.id}
                  icon={<FolderClosed className="size-3.5" />}
                  label={set.name}
                  active={activeTab?.kind === "source" && activeTab.logSetId === set.id}
                  count={count}
                  onClick={() => openItem({ type: "logSet", id: set.id })}
                  onRename={(name) => renameLogSet(set.id, name)}
                  onDelete={() => deleteLogSet(set.id)}
                  groups={project.sourceGroups}
                  currentGroupId={null}
                  onMoveToGroup={(groupId) => moveSourceToGroup(set.id, groupId)}
                />
              );
            })}
        </Section>

        <Section
          title="Views"
          addControl={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="Add view"
                >
                  <Plus className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {project.logSets.length === 0 ? (
                  <DropdownMenuItem disabled>Import a source first</DropdownMenuItem>
                ) : (
                  project.logSets.map((set) => (
                    <DropdownMenuItem key={set.id} onClick={() => createView(set.id)}>
                      {set.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        >
          {viewsBySource.length === 0 ? (
            <p className="px-3 py-1 text-[11px] text-zinc-600">User-made filters on a source.</p>
          ) : (
            viewsBySource.map(({ set, views }) => (
              <div key={set.id} className="mb-1">
                <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1">
                  <span className="h-3 w-0.5 shrink-0 rounded-full bg-zinc-600" aria-hidden="true" />
                  <div className="truncate text-[11px] text-zinc-500">{set.name}</div>
                </div>
                {views.map((v) => (
                  <OutlineRow
                    key={v.id}
                    icon={<Funnel className="size-3.5" />}
                    label={v.name}
                    active={activeTab?.kind === "browser" && activeTab.viewId === v.id}
                    count={logsInView(project.logs, v).length}
                    onClick={() => openItem({ type: "view", id: v.id })}
                    onRename={(name) => updateView(v.id, { name })}
                    onDelete={() => deleteView(v.id)}
                    indented
                  />
                ))}
              </div>
            ))
          )}
        </Section>
      </div>

      <div className="space-y-1 border-t border-zinc-800 p-2">
        <Button size="sm" className="w-full justify-start" variant="outline" onClick={() => setImportOpen(true)}>
          <Plus className="size-3.5" />
          Import logs
        </Button>
        <Button
          size="sm"
          className="w-full justify-start"
          variant={activeTab?.kind === "settings" ? "secondary" : "ghost"}
          onClick={() => openItem({ type: "settings" })}
        >
          <Settings className="size-3.5" />
          Settings
        </Button>
      </div>
      <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
      <AddCanvasDialog open={addCanvasOpen} onOpenChange={setAddCanvasOpen} />
    </aside>
  );
}

function Section({
  title,
  onAdd,
  addControl,
  children,
}: {
  title: string;
  onAdd?: () => void;
  addControl?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center px-2 pb-1">
        <span className="flex-1 text-[14px] font-medium uppercase tracking-wider text-zinc-500">
          {title}
        </span>
        {addControl ?? (
          <button
            type="button"
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onAdd}
            aria-label={`Add ${title}`}
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function GroupHeader({
  label,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  return (
    <div
      className={cn(
        "group mx-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px]",
        active ? "bg-zinc-800 text-zinc-50" : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2"
        onClick={onClick}
        onDoubleClick={() => {
          setDraft(label);
          setEditing(true);
        }}
      >
        <span className="shrink-0 text-zinc-500">
          <Layers className="size-3.5" />
        </span>
        {editing ? (
          <Input
            autoFocus
            value={draft}
            className="h-6 px-1 text-[13px]"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim()) onRename(draft.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className="truncate font-medium">{label}</span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-0.5 opacity-0 hover:bg-zinc-700 group-hover:opacity-100"
            aria-label="Group actions"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setDraft(label);
              setEditing(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function OutlineRow({
  icon,
  label,
  active,
  count,
  onClick,
  onRename,
  onDelete,
  indented,
  groups,
  currentGroupId,
  onMoveToGroup,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  indented?: boolean;
  groups?: { id: string; name: string }[];
  currentGroupId?: string | null;
  onMoveToGroup?: (groupId: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  return (
    <div
      className={cn(
        "group mx-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px]",
        indented && "ml-3",
        active ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
      )}
    >
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2" onClick={onClick} onDoubleClick={() => { setDraft(label); setEditing(true); }}>
        <span className="shrink-0 text-zinc-500">{icon}</span>
        {editing ? (
          <Input
            autoFocus
            value={draft}
            className="h-6 px-1 text-[13px]"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim()) onRename(draft.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className="truncate">{label}</span>
        )}
      </button>
      {count != null && !editing ? (
        <span
          className="shrink-0 text-[11px] tabular-nums text-zinc-500"
          title={`${count} logs`}
        >
          {count}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-0.5 opacity-0 hover:bg-zinc-700 group-hover:opacity-100"
            aria-label="Item actions"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setDraft(label);
              setEditing(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          {onMoveToGroup ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to group</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(groups ?? []).length === 0 ? (
                  <DropdownMenuItem disabled>No groups yet</DropdownMenuItem>
                ) : (
                  (groups ?? []).map((group) => (
                    <DropdownMenuItem
                      key={group.id}
                      disabled={group.id === currentGroupId}
                      onClick={() => onMoveToGroup(group.id)}
                    >
                      {group.name}
                    </DropdownMenuItem>
                  ))
                )}
                {currentGroupId ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onMoveToGroup(null)}>Ungroup</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
