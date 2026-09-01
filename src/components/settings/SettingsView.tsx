"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectStore } from "@/lib/store";

export function SettingsView() {
  const project = useProjectStore((s) => s.project);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const renameProject = useProjectStore((s) => s.renameProject);
  const exportProject = useProjectStore((s) => s.exportProject);
  const deleteCurrentProject = useProjectStore((s) => s.deleteCurrentProject);
  const saveNow = useProjectStore((s) => s.saveNow);

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
              A hash map keyed by SHA-256 of the canonical JSON. Lookup is O(1); the map is a few
              dozen bytes per log, cheaper than storing a second copy of the payload.
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
          Auto-pin common fields (ts, level, message, …) when placing a log
        </label>
      </section>

      <section className="flex flex-wrap gap-2">
        <Button onClick={() => void saveNow()}>Save now</Button>
        <Button variant="outline" onClick={exportProject}>
          Export project file
        </Button>
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
    </div>
  );
}
