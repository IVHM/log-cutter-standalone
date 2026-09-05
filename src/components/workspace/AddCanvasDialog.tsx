"use client";

import { Layers, LayoutDashboard } from "lucide-react";
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

export function AddCanvasDialog({ open, onOpenChange }: Props) {
  const createCanvas = useProjectStore((s) => s.createCanvas);
  const createCanvasGroup = useProjectStore((s) => s.createCanvasGroup);

  function addCanvas() {
    createCanvas();
    onOpenChange(false);
  }

  function addGroup() {
    createCanvasGroup();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add canvas</DialogTitle>
          <DialogDescription>Start a blank canvas or a folder for canvases.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <button
            type="button"
            onClick={addCanvas}
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 px-3 py-3 text-left hover:bg-zinc-900"
          >
            <LayoutDashboard className="size-4 text-zinc-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-zinc-200">New canvas</span>
              <span className="block text-[12px] text-zinc-500">Open a blank investigation canvas.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={addGroup}
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
