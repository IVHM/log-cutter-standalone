"use client";

import { FileUp, FolderClosed, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectStore } from "@/lib/store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddSourceDialog({ open, onOpenChange }: Props) {
  const createLogSet = useProjectStore((s) => s.createLogSet);
  const createSourceGroup = useProjectStore((s) => s.createSourceGroup);
  const setImportOpen = useProjectStore((s) => s.setImportOpen);

  function createEmpty() {
    createLogSet("New source");
    onOpenChange(false);
  }

  function newGroup() {
    createSourceGroup();
    onOpenChange(false);
  }

  function importFile() {
    onOpenChange(false);
    window.setTimeout(() => setImportOpen(true, "new"), 120);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add source</DialogTitle>
          <DialogDescription>Start from a blank source, import a file, or make a group.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <button
            type="button"
            onClick={createEmpty}
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-3 py-3 text-left hover:bg-zinc-900"
          >
            <FolderClosed className="size-4 text-zinc-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-zinc-200">New empty source</span>
              <span className="block text-[12px] text-zinc-500">Create a blank source, then import into it.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={importFile}
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-3 py-3 text-left hover:bg-zinc-900"
          >
            <FileUp className="size-4 text-zinc-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-zinc-200">Import logs</span>
              <span className="block text-[12px] text-zinc-500">CSV, JSON, or JSONL becomes a new source.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={newGroup}
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-3 py-3 text-left hover:bg-zinc-900"
          >
            <Layers className="size-4 text-zinc-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-zinc-200">New group</span>
              <span className="block text-[12px] text-zinc-500">Optional folder. Named Group001, Group002, …</span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
