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
  /** Table columns for the unfiltered source browse. */
  columns: string[];
  sortBy?: { path: string; dir: "asc" | "desc" };
  /** Applied to newly placed canvas cards only. */
  defaultPinnedPaths: string[];
  /** Hidden on canvas cards (collapsed + expanded body). */
  hiddenPaths: string[];
  /** Incremental path catalog for this source. Do not re-walk all docs for schema UI. */
  schemaFields: SchemaField[];
  /** Paths marked as identity fields for IdLinks / 🔗. */
  idFieldPaths: string[];
  /** Row count for this source (import updates this; avoids scanning project.logs). */
  logCount?: number;
  /**
   * How many of this source's logs have field-index rows.
   * `undefined` means a pre-split project (treat as fully indexed).
   */
  indexedCount?: number;
};

export type IdLink = {
  id: string;
  label: string;
  bindings: Record<string, string>;
};

export type SourceGroup = {
  id: string;
  name: string;
  sourceIds: string[];
  idLinks: IdLink[];
};

export type CanvasGroup = {
  id: string;
  name: string;
  canvasIds: string[];
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
  /** Exactly one source. Canvases may mix sources; views may not. */
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
  | { id: string; kind: "source"; logSetId: string }
  | { id: string; kind: "browser"; viewId: string }
  | { id: string; kind: "sourceGroup"; sourceGroupId: string }
  | { id: string; kind: "canvasGroup"; canvasGroupId: string }
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

/** IndexedDB document: Project minus working-set logs and hashIndex. */
export type ProjectDoc = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  logSets: LogSet[];
  views: BrowserView[];
  canvases: Canvas[];
  sourceGroups: SourceGroup[];
  canvasGroups: CanvasGroup[];
  settings: ProjectSettings;
  openTabs: Tab[];
  activeTabId: string | null;
  lastCanvasId: string | null;
  schemaVersion: number;
};

export type Project = ProjectDoc & {
  /** Working set. Not stored on the projects row after schema v2. */
  logs: LogRecord[];
  /** Derived in memory. Import dedup uses IDB / source-scoped hashes, not a full logs scan. */
  hashIndex: Record<string, string>;
};

export const SCHEMA_VERSION = 2;

export type LogRow = {
  id: string;
  projectId: string;
  sourceId: string;
  hash: string;
  shapeId: string;
  importedAt: number;
  sourceFile?: string;
  note: string;
  meta: Record<string, string>;
  data: unknown;
};

export type LogFieldKind = "data" | "meta" | "note";

export type LogFieldRow = {
  id: string;
  projectId: string;
  sourceId: string;
  logId: string;
  path: string;
  kind: LogFieldKind;
  jsonType: "null" | "boolean" | "number" | "string";
  value: string | number | boolean | null;
  valueKey: string;
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
