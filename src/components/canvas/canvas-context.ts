"use client";

import { createContext, useContext } from "react";
import type { EdgeHandleId } from "@/lib/arrow-anchor";

export type CanvasTool = "select" | "arrow" | "bracket";
export type ArrowEndpoint = "source" | "target";

export const CanvasIdContext = createContext<string>("");

export function useCanvasId() {
  return useContext(CanvasIdContext);
}

export type CanvasArrowUi = {
  tool: CanvasTool;
  showAnchors: boolean;
  reconnectingEdgeId: string | null;
  occupiedAnchors: ReadonlySet<string>;
  onAnchorClick: (nodeId: string, handle: EdgeHandleId) => void;
  onEndpointClick: (edgeId: string, end: ArrowEndpoint) => void;
};

export const CanvasArrowContext = createContext<CanvasArrowUi>({
  tool: "select",
  showAnchors: false,
  reconnectingEdgeId: null,
  occupiedAnchors: new Set(),
  onAnchorClick: () => {},
  onEndpointClick: () => {},
});

export function useCanvasArrow() {
  return useContext(CanvasArrowContext);
}
