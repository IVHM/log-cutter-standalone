"use client";

import { createContext, useContext } from "react";

export const CanvasIdContext = createContext<string>("");

export function useCanvasId() {
  return useContext(CanvasIdContext);
}
