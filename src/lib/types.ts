import type { Edge, Node } from "@xyflow/react";

export type Viewport = { x: number; y: number; zoom: number };

export type EdgeConnection = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

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
  /** Up to three JSON paths shown on canvas log card headers. */
  headerPaths: string[];
  headerColor: string;
};

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "contains"
  | "is_true"
  | "is_false"
  | "is_empty"
  | "is_not_empty";

export type FilterClause = {
  kind: "clause";
  path: string;
  op: FilterOp;
  value: string;
  valueTo: string;
};

export type FilterGroup = {
  kind: "group";
  join: "and" | "or";
  children: FilterExpr[];
};

export type FilterExpr = FilterClause | FilterGroup;

export type BrowserView = {
  id: string;
  name: string;
  /** Exactly one log set. Canvases may mix sets; views may not. */
  logSetId: string;
  columns: string[];
  sortBy?: { path: string; dir: "asc" | "desc" };
  filter: FilterGroup;
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

export type BraceDirection = "left" | "right" | "up" | "down";

export type BracketNodeData = {
  kind: "bracket";
  label: string;
  direction: BraceDirection;
};

export type AppNodeData = LogNodeData | NoteNodeData | BracketNodeData;
export type AppNode = Node<AppNodeData, "log" | "note" | "bracket">;
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
  { name: "Yellow", hex: "#fde68a" },
  { name: "Light blue", hex: "#bfdbfe" },
  { name: "Light green", hex: "#bbf7d0" },
  { name: "Light purple", hex: "#e9d5ff" },
  { name: "Light orange", hex: "#fed7aa" },
  { name: "Light pink", hex: "#fbcfe8" },
] as const;

export const DEFAULT_NOTE_COLOR = NOTE_COLORS[0].hex;

export const HEADER_COLORS = [
  { name: "Zinc", hex: "#27272a" },
  { name: "Slate", hex: "#334155" },
  { name: "Sky", hex: "#0c4a6e" },
  { name: "Emerald", hex: "#065f46" },
  { name: "Amber", hex: "#92400e" },
  { name: "Rose", hex: "#9f1239" },
  { name: "Violet", hex: "#5b21b6" },
] as const;

export const DEFAULT_HEADER_COLOR = HEADER_COLORS[0].hex;
export const DEFAULT_HEADER_PATHS = ["level", "service", "event"];
