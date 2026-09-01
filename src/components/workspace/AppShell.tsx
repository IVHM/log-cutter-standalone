"use client";

import { useEffect } from "react";
import { LogBrowser } from "@/components/browser/LogBrowser";
import { CanvasView } from "@/components/canvas/CanvasView";
import { ImportDialog } from "@/components/import/ImportDialog";
import { SettingsView } from "@/components/settings/SettingsView";
import { Sidebar } from "@/components/workspace/Sidebar";
import { TabBar } from "@/components/workspace/TabBar";
import { Welcome } from "@/components/workspace/Welcome";
import { useProjectStore } from "@/lib/store";

export function AppShell() {
  const hydrate = useProjectStore((s) => s.hydrate);
  const project = useProjectStore((s) => s.project);
  const dirty = useProjectStore((s) => s.dirty);
  const saving = useProjectStore((s) => s.saving);
  const saveNow = useProjectStore((s) => s.saveNow);
  const queueImportFile = useProjectStore((s) => s.queueImportFile);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  useEffect(() => {
    if (project?.settings.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, [project?.settings.theme]);

  const active = project?.openTabs.find((t) => t.id === project.activeTabId) ?? project?.openTabs[0];

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file || !project) return;
        queueImportFile(file);
      }}
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3">
        <span className="font-mono text-[11px] tracking-wider text-zinc-500">JSON LOG EXPLORER</span>
        <span className="text-[11px] text-zinc-600">
          {saving ? "Saving…" : dirty ? "Unsaved" : project ? "Saved locally" : ""}
        </span>
      </header>
      {!project ? (
        <Welcome />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TabBar />
            <main className="min-h-0 flex-1 bg-zinc-900">
              {active?.kind === "canvas" ? (
                <CanvasView key={active.canvasId} canvasId={active.canvasId} />
              ) : active?.kind === "browser" ? (
                <LogBrowser key={active.viewId} viewId={active.viewId} />
              ) : active?.kind === "settings" ? (
                <SettingsView />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                  Select something in the sidebar to open a tab.
                </div>
              )}
            </main>
          </div>
        </div>
      )}
      <ImportDialog />
    </div>
  );
}
