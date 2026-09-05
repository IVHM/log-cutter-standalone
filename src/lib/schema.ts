import { jsonType } from "./hash";
import { joinPath, PATH_ROLLUP, toSchemaPath, tokenizePath, type PathToken } from "./json-path";
import { DEFAULT_HEADER_PATHS } from "./types";
import type { JsonTypeName, LogRecord, LogSet, SchemaField } from "./types";

export const SCHEMA_MAX_DEPTH = 8;
export const SCHEMA_MAX_ARRAY = 12;

const EMPTY_TYPES = (): Record<JsonTypeName, number> => ({
  null: 0,
  boolean: 0,
  number: 0,
  string: 0,
  array: 0,
  object: 0,
});

export function inferSchema(logs: LogRecord[]): SchemaField[] {
  return mergeSchemaFromLogs([], logs);
}

export function mergeSchemaFromLogs(existing: SchemaField[], logs: LogRecord[]): SchemaField[] {
  const map = new Map<string, SchemaField>();
  for (const field of existing) {
    map.set(field.path, {
      path: field.path,
      types: { ...field.types },
      occurrences: field.occurrences,
      isArrayItem: field.isArrayItem,
    });
  }

  for (const log of logs) {
    const seen = new Set<string>();
    walk(log.data, "", map, seen, 0);
    if (Object.keys(log.meta).length > 0) {
      for (const [key, value] of Object.entries(log.meta)) {
        const path = joinPath("meta", key);
        bump(map, seen, path, jsonType(value), false);
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return a.path.localeCompare(b.path);
  });
}

export function schemaForSource(set: LogSet | undefined, logs: LogRecord[]): SchemaField[] {
  if (set?.schemaFields && set.schemaFields.length > 0) return set.schemaFields;
  return inferSchema(logs);
}

export type SchemaTreeNode = {
  label: string;
  path: string;
  field: SchemaField | undefined;
  children: SchemaTreeNode[];
};

function appendSchemaSegment(parent: string, token: PathToken): string {
  if (token === PATH_ROLLUP) return parent ? `${parent}[]` : "[]";
  if (typeof token === "number") return toSchemaPath(joinPath(parent, token));
  return joinPath(parent, token);
}

function subtreeOccurrences(node: SchemaTreeNode): number {
  const self = node.field?.occurrences ?? 0;
  if (node.children.length === 0) return self;
  return Math.max(self, ...node.children.map(subtreeOccurrences));
}

/** Nest dotted schema paths so customer.name.first renders under customer → name → first. */
export function schemaToTree(fields: SchemaField[]): SchemaTreeNode[] {
  const fieldByPath = new Map(fields.map((field) => [field.path, field]));
  type Mutable = { label: string; path: string; children: Map<string, Mutable> };
  const root: Mutable = { label: "", path: "", children: new Map() };

  for (const field of fields) {
    const tokens = tokenizePath(field.path);
    let node = root;
    let acc = "";
    for (const token of tokens) {
      acc = appendSchemaSegment(acc, token);
      let child = node.children.get(acc);
      if (!child) {
        child = {
          label: token === PATH_ROLLUP ? "[]" : String(token),
          path: acc,
          children: new Map(),
        };
        node.children.set(acc, child);
      }
      node = child;
    }
  }

  function toNodes(children: Map<string, Mutable>): SchemaTreeNode[] {
    const nodes: SchemaTreeNode[] = [...children.values()].map((child) => ({
      label: child.label,
      path: child.path,
      field: fieldByPath.get(child.path),
      children: toNodes(child.children),
    }));
    nodes.sort((a, b) => {
      const occ = subtreeOccurrences(b) - subtreeOccurrences(a);
      if (occ !== 0) return occ;
      return a.label.localeCompare(b.label);
    });
    return nodes;
  }

  return toNodes(root.children);
}

function walk(
  value: unknown,
  path: string,
  map: Map<string, SchemaField>,
  seen: Set<string>,
  depth: number,
): void {
  if (depth > SCHEMA_MAX_DEPTH) return;
  const type = jsonType(value);
  if (path) bump(map, seen, toSchemaPath(path), type, path.includes("[]") || /\[\d+\]/.test(path));

  if (type === "object" && value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, joinPath(path, key), map, seen, depth + 1);
    }
  } else if (type === "array" && Array.isArray(value)) {
    const limit = Math.min(value.length, SCHEMA_MAX_ARRAY);
    for (let i = 0; i < limit; i += 1) {
      walk(value[i], joinPath(path, i), map, seen, depth + 1);
    }
  }
}

function bump(
  map: Map<string, SchemaField>,
  seen: Set<string>,
  path: string,
  type: JsonTypeName,
  isArrayItem: boolean,
): void {
  let field = map.get(path);
  if (!field) {
    field = { path, types: EMPTY_TYPES(), occurrences: 0, isArrayItem };
    map.set(path, field);
  }
  field.types[type] += 1;
  if (!seen.has(path)) {
    field.occurrences += 1;
    seen.add(path);
  }
}

export function primaryType(field: SchemaField): JsonTypeName {
  let best: JsonTypeName = "string";
  let n = -1;
  for (const [type, count] of Object.entries(field.types) as [JsonTypeName, number][]) {
    if (count > n) {
      n = count;
      best = type;
    }
  }
  return best;
}

const TYPE_ABBR: Record<JsonTypeName, string> = {
  string: "str",
  number: "num",
  boolean: "bol",
  object: "obj",
  array: "arr",
  null: "nul",
};

export function typeLabel(field: SchemaField): string {
  const present = (Object.entries(field.types) as [JsonTypeName, number][])
    .filter(([, n]) => n > 0)
    .map(([t]) => TYPE_ABBR[t]);
  if (present.length === 0) return "unk";
  return present.join(" | ");
}

export function coveragePercent(occurrences: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((occurrences / total) * 100);
}

const COMMON_PIN_NAMES = [
  "timestamp",
  "time",
  "ts",
  "@timestamp",
  "level",
  "severity",
  "msg",
  "message",
  "event",
  "error",
  "status",
  "path",
  "method",
  "request_id",
  "id",
];

export function suggestPins(data: unknown, max = 4): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  const preferred = COMMON_PIN_NAMES.filter((name) => keys.includes(name)).slice(0, max);
  if (preferred.length >= 2) return preferred;
  const primitives = keys.filter((k) => {
    const t = jsonType(obj[k]);
    return t === "string" || t === "number" || t === "boolean";
  });
  const merged = [...new Set([...preferred, ...primitives])];
  return merged.slice(0, max);
}

/** Top-level JSON keys in document order — used for new-source card headers. */
export function suggestHeaderPaths(data: unknown, max = 3): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.keys(data as Record<string, unknown>).slice(0, max);
}

export function isPlaceholderHeaderPaths(paths: string[]): boolean {
  if (paths.length === 0) return true;
  return (
    paths.length === DEFAULT_HEADER_PATHS.length &&
    paths.every((path, i) => path === DEFAULT_HEADER_PATHS[i])
  );
}

export function suggestColumns(fields: SchemaField[], logCount: number, max = 6): string[] {
  const scored = fields
    .filter((f) => {
      const t = primaryType(f);
      return t === "string" || t === "number" || t === "boolean";
    })
    .map((f) => {
      const coverage = logCount === 0 ? 0 : f.occurrences / logCount;
      const common = COMMON_PIN_NAMES.includes(f.path.split(".").pop() ?? f.path) ? 2 : 0;
      const depth = f.path.split(/\.|\[/).length;
      return { path: f.path, score: coverage * 4 + common - depth * 0.2 };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.path);
}
