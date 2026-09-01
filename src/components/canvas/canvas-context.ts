"use client";

import { createContext, useContext } from "react";
import type { EdgeHandleId } from "@/lib/arrow-anchor";

export type CanvasTool = "select" | "arrow" | "bracket";

export const CanvasIdContext = createContext<string>("");

export function useCanvasId() {
  return useContext(CanvasIdContext);
}

export type CanvasArrowUi = {
  tool: CanvasTool;
  onAnchorClick: (nodeId: string, handle: EdgeHandleId) => void;
};

export const CanvasArrowContext = createContext<CanvasArrowUi>({
  tool: "select",
  onAnchorClick: () => {},
});

export function useCanvasArrow() {
  return useContext(CanvasArrowContext);
}
