"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LogBrowser } from "@/components/browser/LogBrowser";
import { CanvasView } from "@/components/canvas/CanvasView";
import { ImportDialog } from "@/components/import/ImportDialog";
import { SettingsView } from "@/components/settings/SettingsView";
import { Button } from "@/components/ui/button";
import { CanvasGroupView } from "@/components/workspace/CanvasGroupView";
import { Sidebar } from "@/components/workspace/Sidebar";
import { SourceGroupView } from "@/components/workspace/SourceGroupView";
import { TabBar } from "@/components/workspace/TabBar";
import { Welcome } from "@/components/workspace/Welcome";
import { useProjectStore } from "@/lib/store";

export function AppShell() {
  const hydrate = useProjectStore((s) => s.hydrate);
  const hydrated = useProjectStore((s) => s.hydrated);
  const project = useProjectStore((s) => s.project);
  const dirty = useProjectStore((s) => s.dirty);
  const saving = useProjectStore((s) => s.saving);
  const migrateProgress = useProjectStore((s) => s.migrateProgress);
  const importProgress = useProjectStore((s) => s.importProgress);
  const dismissImportOverlay = useProjectStore((s) => s.dismissImportOverlay);
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
    if (importProgress?.phase !== "index" || !importProgress.blocking) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismissImportOverlay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importProgress, dismissImportOverlay]);

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
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="font-sans text-[13px] font-semibold tracking-tight text-zinc-200">
            LogSplitter
          </span>
          <span className="truncate text-[10px] text-zinc-500">A json/csv log explorer</span>
        </div>
        <span className="text-[11px] text-zinc-600">
          {importProgress?.phase === "logs"
            ? `Importing logs ${importProgress.done}/${importProgress.total}…`
            : importProgress?.phase === "index"
              ? `Building search index ${importProgress.done}/${importProgress.total}…`
              : migrateProgress
                ? "Upgrading storage…"
                : saving
                  ? "Saving…"
                  : dirty
                    ? "Unsaved"
                    : project
                      ? "Saved locally"
                      : ""}
        </span>
      </header>
      {!hydrated && !migrateProgress ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-950 text-sm text-zinc-500">
          Loading…
        </div>
      ) : migrateProgress ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-zinc-950 px-6 text-center">
          <p className="text-sm text-zinc-200">Upgrading local storage to hybrid fields…</p>
          <p className="text-[13px] text-zinc-500">
            {migrateProgress.total > 0
              ? `${migrateProgress.done} / ${migrateProgress.total} logs`
              : "Starting…"}
          </p>
        </div>
      ) : !project ? (
        <Welcome />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TabBar />
            <main className="min-h-0 flex-1 bg-zinc-900">
              {active?.kind === "canvas" ? (
                <CanvasView key={active.canvasId} canvasId={active.canvasId} />
              ) : active?.kind === "source" ? (
                <LogBrowser key={active.logSetId} logSetId={active.logSetId} />
              ) : active?.kind === "browser" ? (
                <LogBrowser key={active.viewId} viewId={active.viewId} />
              ) : active?.kind === "sourceGroup" ? (
                <SourceGroupView key={active.sourceGroupId} sourceGroupId={active.sourceGroupId} />
              ) : active?.kind === "canvasGroup" ? (
                <CanvasGroupView key={active.canvasGroupId} canvasGroupId={active.canvasGroupId} />
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
      {importProgress?.blocking
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-zinc-950/80 text-center"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <p className="text-sm font-medium text-zinc-100">
                {importProgress.phase === "index"
                  ? `Building search index ${importProgress.done}/${importProgress.total}…`
                  : `Importing logs ${importProgress.done}/${importProgress.total}…`}
              </p>
              <p className="text-[12px] text-zinc-500">
                {importProgress.phase === "index"
                  ? "Browse is ready. Find same value and 🔗 wait until this finishes."
                  : "Stay on this tab until logs finish writing."}
              </p>
              {importProgress.phase === "index" ? (
                <Button variant="secondary" onClick={dismissImportOverlay}>
                  Continue working
                </Button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
