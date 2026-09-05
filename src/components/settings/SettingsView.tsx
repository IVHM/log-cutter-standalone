"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportProjectControl } from "@/components/project/ImportProjectControl";
import { probeQuitRuntime, requestShutdown, type QuitKind } from "@/lib/runtime";
import { useProjectStore } from "@/lib/store";

export function SettingsView() {
  const project = useProjectStore((s) => s.project);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const renameProject = useProjectStore((s) => s.renameProject);
  const exportProject = useProjectStore((s) => s.exportProject);
  const deleteCurrentProject = useProjectStore((s) => s.deleteCurrentProject);
  const saveNow = useProjectStore((s) => s.saveNow);
  const [quitKind, setQuitKind] = useState<QuitKind | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [quitting, setQuitting] = useState(false);

  useEffect(() => {
    void probeQuitRuntime().then(setQuitKind);
  }, []);

  if (!project) return null;
  const s = project.settings;

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-6 overflow-auto p-6">
      <div>
        <h2 className="text-lg font-medium">Project settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything lives in this browser via IndexedDB. Export a project file to move an
          investigation to another machine — no server required.
        </p>
      </div>

      <section className="space-y-2">
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          value={project.name}
          onChange={(e) => renameProject(e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Appearance</h3>
        <div className="flex items-center justify-between gap-3">
          <Label>Theme</Label>
          <Select value={s.theme} onValueChange={(v) => updateSettings({ theme: v as "dark" | "light" })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={s.showMinimap}
            onCheckedChange={(v) => updateSettings({ showMinimap: Boolean(v) })}
          />
          Show canvas minimap
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={s.snapToGrid}
            onCheckedChange={(v) => updateSettings({ snapToGrid: Boolean(v) })}
          />
          Snap nodes to grid
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Logs</h3>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Duplicate detection</Label>
            <p className="text-[12px] text-muted-foreground">
              Within a source, a SHA-256 hash of the canonical JSON skips a second copy of the same
              payload. The same log can still be imported into a different source.
            </p>
          </div>
        </div>
        <Select
          value={s.dedupeMode}
          onValueChange={(v) => updateSettings({ dedupeMode: v as "payload" | "payload+meta" })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="payload">JSON payload only</SelectItem>
            <SelectItem value="payload+meta">JSON payload + ancillary CSV columns</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={s.autoPinCommonFields}
            onCheckedChange={(v) => updateSettings({ autoPinCommonFields: Boolean(v) })}
          />
          When a source has no default pins, auto-pin common fields (ts, level, message, …) on new cards
        </label>
      </section>

      <section className="flex flex-wrap gap-2">
        <Button onClick={() => void saveNow()}>Save now</Button>
        <Button variant="outline" onClick={exportProject}>
          Export project file
        </Button>
        <ImportProjectControl />
        {quitKind ? (
          <Button variant="outline" onClick={() => setConfirmQuit(true)}>
            {quitKind === "electron" ? "Quit app" : "Shut down server"}
          </Button>
        ) : null}
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("Delete this project from local storage? This cannot be undone.")) {
              void deleteCurrentProject();
            }
          }}
        >
          Delete project
        </Button>
      </section>

      <Dialog open={confirmQuit} onOpenChange={setConfirmQuit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{quitKind === "electron" ? "Quit LogSplitter?" : "Shut down server?"}</DialogTitle>
            <DialogDescription>
              {quitKind === "electron"
                ? "LogSplitter will close. Your project stays in local storage on this machine."
                : "This stops the local HTTP server. This tab will stop working until you start it again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmQuit(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={quitting}
              onClick={() => {
                setQuitting(true);
                void requestShutdown();
              }}
            >
              {quitting ? "Stopping…" : quitKind === "electron" ? "Quit" : "Shut down"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
