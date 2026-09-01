"use client";

import { FileJson, FolderKanban, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/lib/store";

export function Welcome() {
  const createProject = useProjectStore((s) => s.createProject);
  const loadSample = useProjectStore((s) => s.loadSample);
  const importProjectFile = useProjectStore((s) => s.importProjectFile);
  const projects = useProjectStore((s) => s.projects);
  const openProject = useProjectStore((s) => s.openProject);
  const [name, setName] = useState("New investigation");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex h-full items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sky-400">
            JSON Log Explorer
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">
            Investigate JSON logs on a canvas, not in a pager dump.
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Import CSV or JSONL, pin the fields you care about, spread related events across
            canvases, and keep notes and arrows with the evidence. Everything stays on this
            machine.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
          />
          <Button onClick={() => void createProject(name)}>Create project</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadSample()}>
            Open sample incident
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await createProject(name);
              useProjectStore.getState().setImportOpen(true);
            }}
          >
            Import logs
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await importProjectFile(file);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not open project file.");
                }
              }}
            />
            <Button variant="outline" asChild>
              <span>Open project file</span>
            </Button>
          </label>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {projects.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Recent</p>
            <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-900"
                    onClick={() => void openProject(p.id)}
                  >
                    <FolderKanban className="size-4 text-zinc-500" />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-[11px] text-zinc-600">
                      {new Date(p.updatedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="grid gap-2 text-[13px] text-zinc-500 sm:grid-cols-3">
            <li className="rounded-lg border border-zinc-800 p-3">
              <FileJson className="mb-2 size-4 text-zinc-400" />
              Drop CSV with JSON in a cell. Duplicates are hashed out.
            </li>
            <li className="rounded-lg border border-zinc-800 p-3">
              <LayoutDashboard className="mb-2 size-4 text-zinc-400" />
              Pin fields so collapsed cards still show what matters.
            </li>
            <li className="rounded-lg border border-zinc-800 p-3">
              Draw arrows, drop notes, keep each investigation as its own project.
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
