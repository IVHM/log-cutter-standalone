"use client";

import { FolderInput } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useProjectStore } from "@/lib/store";

type Mode = "button" | "menuitem";

export function ImportProjectControl({
  mode = "button",
  variant = "outline",
}: {
  mode?: Mode;
  variant?: "outline" | "default";
}) {
  const importProjectFile = useProjectStore((s) => s.importProjectFile);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      await importProjectFile(file);
      toast.success(`Opened “${file.name}”.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open that project file.");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      onChange={(e) => void onFile(e.target.files?.[0])}
    />
  );

  if (mode === "menuitem") {
    return (
      <>
        {input}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            inputRef.current?.click();
          }}
        >
          <FolderInput className="size-3.5" />
          Import project file
        </DropdownMenuItem>
      </>
    );
  }

  return (
    <>
      {input}
      <Button variant={variant} onClick={() => inputRef.current?.click()}>
        <FolderInput className="size-3.5" />
        Import project file
      </Button>
    </>
  );
}
