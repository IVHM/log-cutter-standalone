"use client";

import { FolderClosed, Funnel, LayoutDashboard, Settings, X } from "lucide-react";
import { useProjectStore } from "@/lib/store";
import type { Tab } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TabBar() {
  const project = useProjectStore((s) => s.project);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const closeTab = useProjectStore((s) => s.closeTab);

  if (!project) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-zinc-800 bg-zinc-950">
      {project.openTabs.length === 0 ? (
        <div className="flex items-center px-3 text-[12px] text-zinc-500">
          Open a canvas, source, view, or settings from the sidebar.
        </div>
      ) : null}
      {project.openTabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group flex max-w-[220px] min-w-[120px] items-center gap-1 border-r border-zinc-800 px-2 text-[12px]",
            project.activeTabId === tab.id
              ? "bg-zinc-900 text-zinc-100"
              : "text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300",
          )}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
            onClick={() => setActiveTab(tab.id)}
          >
            <TabIcon tab={tab} />
            <span className="truncate">{tabTitle(project, tab)}</span>
          </button>
          <button
            type="button"
            className="rounded p-0.5 opacity-0 hover:bg-zinc-800 group-hover:opacity-100"
            onClick={() => closeTab(tab.id)}
            aria-label="Close tab"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.kind === "canvas") return <LayoutDashboard className="size-3 shrink-0" />;
  if (tab.kind === "source") return <FolderClosed className="size-3 shrink-0" />;
  if (tab.kind === "browser") return <Funnel className="size-3 shrink-0" />;
  return <Settings className="size-3 shrink-0" />;
}

function tabTitle(project: NonNullable<ReturnType<typeof useProjectStore.getState>["project"]>, tab: Tab) {
  if (tab.kind === "canvas") {
    return project.canvases.find((c) => c.id === tab.canvasId)?.name ?? "Canvas";
  }
  if (tab.kind === "source") {
    return project.logSets.find((s) => s.id === tab.logSetId)?.name ?? "Source";
  }
  if (tab.kind === "browser") {
    return project.views.find((v) => v.id === tab.viewId)?.name ?? "View";
  }
  return "Settings";
}
