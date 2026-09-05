"use client";

import { FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { inspectFile, materializeRows, type DetectedFile } from "@/lib/import-parse";
import { formatScalar } from "@/lib/json-path";
import { useProjectStore } from "@/lib/store";
import type { LogSet } from "@/lib/types";
import { sourceLogCount } from "@/lib/working-logs";

function fileStem(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function norm(value: string) {
  return value.trim().toLowerCase();
}

/** Match a detected file to an existing source by name or original sourceFile. */
export function matchExistingSource(logSets: LogSet[], fileName: string): LogSet | undefined {
  const stem = norm(fileStem(fileName));
  const full = norm(fileName);
  return (
    logSets.find((set) => norm(set.name) === stem) ||
    logSets.find((set) => norm(set.name) === full) ||
    logSets.find((set) => set.sourceFile != null && norm(set.sourceFile) === full) ||
    logSets.find((set) => set.sourceFile != null && norm(fileStem(set.sourceFile)) === stem)
  );
}

export function ImportDialog() {
  const open = useProjectStore((s) => s.importOpen);
  const setOpen = useProjectStore((s) => s.setImportOpen);
  const project = useProjectStore((s) => s.project);
  const importRows = useProjectStore((s) => s.importRows);
  const queuedFile = useProjectStore((s) => s.queuedImportFile);
  const queueImportFile = useProjectStore((s) => s.queueImportFile);
  const importTarget = useProjectStore((s) => s.importTargetLogSetId);
  const logsBySource = useProjectStore((s) => s.logsBySource);
  const importProgress = useProjectStore((s) => s.importProgress);
  const [detected, setDetected] = useState<DetectedFile | null>(null);
  const [jsonColumn, setJsonColumn] = useState<string | "none">("none");
  const [logSetId, setLogSetId] = useState<string | "new">("new");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importing = Boolean(importProgress);
  const destSet = logSetId !== "new" ? project?.logSets.find((s) => s.id === logSetId) : undefined;
  const targetEmpty = logSetId !== "new" && (destSet ? sourceLogCount(project, logsBySource, destSet) === 0 : true);
  const showName = logSetId === "new" || targetEmpty;
  const explicitTarget =
    importTarget && importTarget !== "new" && (project?.logSets.some((set) => set.id === importTarget) ?? false)
      ? importTarget
      : null;

  useEffect(() => {
    if (!open) return;
    setLogSetId(explicitTarget ?? "new");
  }, [open, explicitTarget]);

  function applyDetected(result: DetectedFile) {
    setDetected(result);
    setJsonColumn(result.suggestedJsonColumn ?? (result.kind === "csv" ? "none" : "json"));
    setNewName(fileStem(result.fileName));
    if (explicitTarget) {
      setLogSetId(explicitTarget);
      return;
    }
    const match = matchExistingSource(project?.logSets ?? [], result.fileName);
    setLogSetId(match?.id ?? "new");
  }

  async function onFiles(files: FileList | File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    try {
      applyDetected(await inspectFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  useEffect(() => {
    if (!queuedFile) return;
    const file = queuedFile;
    queueImportFile(null);
    void inspectFile(file)
      .then((result) => {
        applyDetected(result);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not read that file.");
      });
  }, [queuedFile, queueImportFile]);

  async function confirm() {
    if (!detected) return;
    setBusy(true);
    setError(null);
    try {
      const col = jsonColumn === "none" ? null : jsonColumn;
      const rows = materializeRows(detected, col);
      if (rows.length === 0) {
        setError("No rows found in that file.");
        setBusy(false);
        return;
      }
      const result = await importRows(logSetId, newName || detected.fileName, rows, detected.fileName);
      toast.success(
        `Imported ${result.added} log${result.added === 1 ? "" : "s"}. Skipped ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"}.`,
      );
      setDetected(null);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && importing) return;
        setOpen(v);
        if (!v) {
          setDetected(null);
          setError(null);
        }
      }}
    >
      <DialogContent
        className="max-w-2xl sm:max-w-2xl"
        showCloseButton={!importing}
        onEscapeKeyDown={(e) => {
          if (importing) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (importing) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (importing) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Import JSON logs</DialogTitle>
          <DialogDescription>
            Drop a CSV with JSON in a cell, a CSV of flat fields, a JSON array, or JSONL. Duplicate
            payloads already in the destination source are skipped.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-8 text-center hover:border-zinc-500">
          <FileUp className="size-6 text-zinc-400" />
          <span className="text-sm text-zinc-200">Drop a file or click to browse</span>
          <span className="text-[12px] text-zinc-500">.csv · .json · .jsonl · .ndjson</span>
          <input
            type="file"
            className="hidden"
            accept=".csv,.json,.jsonl,.ndjson,.txt,text/csv,application/json"
            onChange={(e) => {
              if (e.target.files) void onFiles(e.target.files);
            }}
          />
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {detected ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>JSON column</Label>
                <Select value={jsonColumn} onValueChange={(v) => setJsonColumn(v as typeof jsonColumn)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Treat every column as fields</SelectItem>
                    {detected.columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                        {detected.jsonColumns.includes(col) ? " (looks like JSON)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={logSetId} onValueChange={(v) => setLogSetId(v as typeof logSetId)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create new source</SelectItem>
                    {(project?.logSets ?? []).map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {showName ? (
              <div className="space-y-1.5">
                <Label>{logSetId === "new" ? "New source name" : "Source name"}</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
            ) : null}
            <p className="text-[12px] text-zinc-500">
              {detected.kind.toUpperCase()} · {detected.rows.length} rows · {detected.fileName}
            </p>
            <div className="max-h-40 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-400">
              {detected.preview.map((row, i) => (
                <div key={i} className="truncate border-b border-zinc-900 py-1 last:border-0">
                  {formatScalar(row.data, 140)}
                  {Object.keys(row.meta).length > 0 ? ` · meta ${Object.keys(row.meta).join(",")}` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={busy || importing} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!detected || busy || importing} onClick={() => void confirm()}>
            {busy || importing ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
