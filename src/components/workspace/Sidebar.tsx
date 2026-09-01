"use client";

import {
  ChevronRight,
  Database,
  FileJson,
  FolderKanban,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ImportProjectControl } from "@/components/project/ImportProjectControl";
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
  const createCanvas = useProjectStore((s) => s.createCanvas);
  const createView = useProjectStore((s) => s.createView);
  const createLogSet = useProjectStore((s) => s.createLogSet);
  const renameCanvas = useProjectStore((s) => s.renameCanvas);
  const renameLogSet = useProjectStore((s) => s.renameLogSet);
  const updateView = useProjectStore((s) => s.updateView);
  const deleteCanvas = useProjectStore((s) => s.deleteCanvas);
  const deleteLogSet = useProjectStore((s) => s.deleteLogSet);
  const deleteView = useProjectStore((s) => s.deleteView);
  const setImportOpen = useProjectStore((s) => s.setImportOpen);
  const activeTabId = project?.activeTabId;
  const activeTab = project?.openTabs.find((t) => t.id === activeTabId);

  if (!project) return null;

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
        <Section
          title="Canvases"
          onAdd={() => createCanvas()}
        >
          {project.canvases.map((c) => (
            <OutlineRow
              key={c.id}
              icon={<LayoutDashboard className="size-3.5" />}
              label={c.name}
              active={activeTab?.kind === "canvas" && activeTab.canvasId === c.id}
              count={c.nodes.filter((n) => n.type === "log").length}
              onClick={() => openItem({ type: "canvas", id: c.id })}
              onRename={(name) => renameCanvas(c.id, name)}
              onDelete={() => deleteCanvas(c.id)}
            />
          ))}
        </Section>

        <Section
          title="Log sets"
          onAdd={() => {
            const name = window.prompt("Log set name", "New set");
            if (name) createLogSet(name);
          }}
        >
          {project.logSets.map((set) => {
            const count = project.logs.filter((l) => l.logSetId === set.id).length;
            return (
              <OutlineRow
                key={set.id}
                icon={<FileJson className="size-3.5" />}
                label={set.name}
                active={
                  activeTab?.kind === "browser" &&
                  project.views.find((v) => v.id === activeTab.viewId)?.logSetId === set.id
                }
                count={count}
                onClick={() => openItem({ type: "logSet", id: set.id })}
                onRename={(name) => renameLogSet(set.id, name)}
                onDelete={() => deleteLogSet(set.id)}
              />
            );
          })}
        </Section>

        <Section
          title="Browser views"
          onAdd={() => createView("all")}
        >
          {project.views.map((v) => (
            <OutlineRow
              key={v.id}
              icon={<Database className="size-3.5" />}
              label={v.name}
              active={activeTab?.kind === "browser" && activeTab.viewId === v.id}
              count={logsInView(project.logs, v).length}
              onClick={() => openItem({ type: "view", id: v.id })}
              onRename={(name) => updateView(v.id, { name })}
              onDelete={() => deleteView(v.id)}
            />
          ))}
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
    </aside>
  );
}

function Section({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center px-2 pb-1">
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {title}
        </span>
        <button
          type="button"
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          onClick={onAdd}
          aria-label={`Add ${title}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div>{children}</div>
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
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  count?: number;
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
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
