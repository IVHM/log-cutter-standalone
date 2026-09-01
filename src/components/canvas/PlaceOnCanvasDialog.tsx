"use client";

import { useState } from "react";
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
import { useProjectStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logIds: string[];
};

export function PlaceOnCanvasDialog({ open, onOpenChange, logIds }: Props) {
  const project = useProjectStore((s) => s.project);
  const addLogsToCanvas = useProjectStore((s) => s.addLogsToCanvas);
  const createCanvas = useProjectStore((s) => s.createCanvas);
  const openItem = useProjectStore((s) => s.openItem);
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState("Investigation");
  const resolvedChoice =
    choice ?? project?.lastCanvasId ?? project?.canvases[0]?.id ?? "new";

  if (!project) return null;

  function confirm() {
    if (logIds.length === 0) {
      toast.message("Select one or more logs first.");
      return;
    }
    const canvasId =
      resolvedChoice === "new" ? createCanvas(newName.trim() || "Investigation") : resolvedChoice;
    addLogsToCanvas(canvasId, logIds);
    openItem({ type: "canvas", id: canvasId });
    toast.success(`Placed ${logIds.length} log${logIds.length === 1 ? "" : "s"} on the canvas.`);
    setChoice(null);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setChoice(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Place on canvas</DialogTitle>
          <DialogDescription>
            Add {logIds.length} selected log{logIds.length === 1 ? "" : "s"} to an existing canvas
            or start a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {project.canvases.map((canvas) => (
            <button
              key={canvas.id}
              type="button"
              onClick={() => setChoice(canvas.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
                resolvedChoice === canvas.id
                  ? "border-sky-500 bg-sky-950/40"
                  : "border-zinc-800 hover:bg-zinc-900",
              )}
            >
              <span>{canvas.name}</span>
              <span className="text-[11px] text-zinc-500">
                {canvas.nodes.filter((n) => n.type === "log").length} logs
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setChoice("new")}
            className={cn(
              "flex w-full flex-col gap-2 rounded-lg border px-3 py-2 text-left text-sm",
              resolvedChoice === "new" ? "border-sky-500 bg-sky-950/40" : "border-zinc-800 hover:bg-zinc-900",
            )}
          >
            <span>Create a new canvas</span>
            {resolvedChoice === "new" ? (
              <label className="space-y-1" onClick={(e) => e.stopPropagation()}>
                <Label htmlFor="new-canvas-name">Name</Label>
                <Input
                  id="new-canvas-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
            ) : null}
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm}>Place logs</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
