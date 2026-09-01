import type { Edge, Node, Viewport } from "@xyflow/react";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonTypeName =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object";

export type SchemaField = {
  path: string;
  types: Record<JsonTypeName, number>;
  occurrences: number;
  isArrayItem: boolean;
};

export type LogRecord = {
  id: string;
  logSetId: string;
  hash: string;
  data: unknown;
  meta: Record<string, string>;
  note: string;
  shapeId: string;
  importedAt: number;
  sourceFile?: string;
};

export type LogSet = {
  id: string;
  name: string;
  createdAt: number;
  sourceFile?: string;
};

export type BrowserView = {
  id: string;
  name: string;
  logSetId: string | "all";
  columns: string[];
  sortBy?: { path: string; dir: "asc" | "desc" };
  search: string;
  shapeFilter: string | null;
};

export type LogNodeData = {
  kind: "log";
  logId: string;
  collapsed: boolean;
  pinnedPaths: string[];
  collapsedPaths: string[];
};

export type NoteNodeData = {
  kind: "note";
  text: string;
  color: string;
};

export type AppNodeData = LogNodeData | NoteNodeData;
export type AppNode = Node<AppNodeData, "log" | "note">;
export type AppEdge = Edge<{ label?: string }>;

export type Canvas = {
  id: string;
  name: string;
  viewport: Viewport;
  nodes: AppNode[];
  edges: AppEdge[];
};

export type Tab =
  | { id: string; kind: "canvas"; canvasId: string }
  | { id: string; kind: "browser"; viewId: string }
  | { id: string; kind: "settings" };

export type DedupeMode = "payload" | "payload+meta";

export type ProjectSettings = {
  theme: "dark" | "light";
  snapToGrid: boolean;
  gridSize: number;
  showMinimap: boolean;
  dedupeMode: DedupeMode;
  autoPinCommonFields: boolean;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  logSets: LogSet[];
  logs: LogRecord[];
  /** hash -> log id. Cheap O(1) duplicate detection; a few dozen bytes per log. */
  hashIndex: Record<string, string>;
  views: BrowserView[];
  canvases: Canvas[];
  settings: ProjectSettings;
  openTabs: Tab[];
  activeTabId: string | null;
  lastCanvasId: string | null;
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  theme: "dark",
  snapToGrid: false,
  gridSize: 16,
  showMinimap: true,
  dedupeMode: "payload",
  autoPinCommonFields: true,
};

export const NOTE_COLORS = [
  "#f5d76e",
  "#f5a6c8",
  "#8ecae6",
  "#b8e994",
  "#e2c2ff",
  "#ffd6a5",
] as const;
