import { jsonType } from "./hash";
import { collectAtPath, formatCellValue, joinPath, toSchemaPath } from "./json-path";
import { SCHEMA_MAX_ARRAY, SCHEMA_MAX_DEPTH } from "./schema";
import type { LogRecord } from "./types";

export const NOTE_FIELD_PATH = toSchemaPath("note");

export type JsonLeafType = "null" | "boolean" | "number" | "string";
export type FieldPostings = Record<string, Record<string, string[]>>;
export type FieldPostingSets = Map<string, Map<string, Set<string>>>;

export function sourceFieldIndexId(projectId: string, sourceId: string): string {
  return `${projectId}\u001f${sourceId}`;
}

export function valueKey(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  return value;
}

export function asLeaf(
  value: unknown,
): { jsonType: JsonLeafType; value: string | number | boolean | null } | null {
  if (value === null) return { jsonType: "null", value: null };
  if (typeof value === "boolean") return { jsonType: "boolean", value };
  if (typeof value === "number" && Number.isFinite(value)) return { jsonType: "number", value };
  if (typeof value === "string") return { jsonType: "string", value };
  return null;
}

function addPosting(sets: FieldPostingSets, path: string, key: string, logId: string): void {
  if (!path) return;
  let byValue = sets.get(path);
  if (!byValue) {
    byValue = new Map();
    sets.set(path, byValue);
  }
  let ids = byValue.get(key);
  if (!ids) {
    ids = new Set();
    byValue.set(key, ids);
  }
  ids.add(logId);
}

function visitLeaves(
  value: unknown,
  path: string,
  depth: number,
  visit: (path: string, key: string) => void,
): void {
  if (depth > SCHEMA_MAX_DEPTH) return;
  const type = jsonType(value);
  if (type === "string" || type === "number" || type === "boolean" || type === "null") {
    const leaf = asLeaf(value);
    if (leaf && path) visit(toSchemaPath(path), valueKey(leaf.value));
    return;
  }
  if (type === "object" && value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      visitLeaves(child, joinPath(path, key), depth + 1, visit);
    }
    return;
  }
  if (type === "array" && Array.isArray(value)) {
    const limit = Math.min(value.length, SCHEMA_MAX_ARRAY);
    for (let i = 0; i < limit; i += 1) {
      visitLeaves(value[i], joinPath(path, i), depth + 1, visit);
    }
  }
}

export function addLogToPostingSets(sets: FieldPostingSets, log: LogRecord): void {
  visitLeaves(log.data, "", 0, (path, key) => addPosting(sets, path, key, log.id));
  for (const [key, value] of Object.entries(log.meta ?? {})) {
    const leaf = asLeaf(value);
    if (!leaf) continue;
    addPosting(sets, toSchemaPath(joinPath("meta", key)), valueKey(leaf.value), log.id);
  }
  if (log.note) {
    const leaf = asLeaf(log.note);
    if (leaf) addPosting(sets, NOTE_FIELD_PATH, valueKey(leaf.value), log.id);
  }
}

export function addNoteToPostingSets(sets: FieldPostingSets, logId: string, note: string): void {
  const leaf = asLeaf(note);
  if (!leaf) return;
  addPosting(sets, NOTE_FIELD_PATH, valueKey(leaf.value), logId);
}

export function removeLogsFromPostingSets(sets: FieldPostingSets, logIds: Set<string>): void {
  for (const [path, byValue] of sets) {
    for (const [key, ids] of byValue) {
      for (const id of logIds) ids.delete(id);
      if (ids.size === 0) byValue.delete(key);
    }
    if (byValue.size === 0) sets.delete(path);
  }
}

export function removeLogFromPath(sets: FieldPostingSets, logId: string, path: string): void {
  const byValue = sets.get(path);
  if (!byValue) return;
  for (const [key, ids] of byValue) {
    ids.delete(logId);
    if (ids.size === 0) byValue.delete(key);
  }
  if (byValue.size === 0) sets.delete(path);
}

export function postingsToSets(postings: FieldPostings | undefined): FieldPostingSets {
  const out: FieldPostingSets = new Map();
  if (!postings) return out;
  for (const [path, byValue] of Object.entries(postings)) {
    const inner = new Map<string, Set<string>>();
    for (const [key, ids] of Object.entries(byValue)) inner.set(key, new Set(ids));
    out.set(path, inner);
  }
  return out;
}

export function setsToPostings(sets: FieldPostingSets): FieldPostings {
  const out: FieldPostings = {};
  for (const [path, byValue] of sets) {
    const inner: Record<string, string[]> = {};
    for (const [key, ids] of byValue) {
      if (ids.size === 0) continue;
      inner[key] = [...ids];
    }
    if (Object.keys(inner).length > 0) out[path] = inner;
  }
  return out;
}

export function logCellValue(log: LogRecord, col: string): unknown {
  if (col === "note") return log.note || undefined;
  if (col.startsWith("meta.")) return log.meta[col.slice(5)];
  const direct = collectAtPath(log.data, col);
  if (direct.length === 1) return direct[0];
  if (direct.length > 1) return direct;
  return log.meta[col];
}

export function formatLogCell(log: LogRecord, col: string, max = 80): string {
  return formatCellValue(logCellValue(log, col), max);
}

export function hashIndexFromLogs(logs: LogRecord[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const log of logs) index[log.hash] = log.id;
  return index;
}

export type SameValueQuery = {
  path: string;
  valueKey: string;
  display: string;
};

function queryPathForValue(path: string, value: unknown): string {
  const schema = toSchemaPath(path);
  if (Array.isArray(value) && !schema.includes("[]")) return schema ? `${schema}[]` : "[]";
  return schema;
}

/** Leaf (or array-of-leaves) queries for Find same value. Empty if the value is not a leaf. */
export function sameValueQueries(path: string, value: unknown): SameValueQuery[] {
  if (Array.isArray(value)) {
    const schemaPath = queryPathForValue(path, value);
    const seen = new Set<string>();
    const out: SameValueQuery[] = [];
    for (const item of value) {
      const leaf = asLeaf(item);
      if (!leaf) continue;
      const key = valueKey(leaf.value);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ path: schemaPath, valueKey: key, display: formatCellValue(leaf.value, 80) });
    }
    return out;
  }
  const leaf = asLeaf(value);
  if (!leaf || !path) return [];
  return [
    {
      path: toSchemaPath(path),
      valueKey: valueKey(leaf.value),
      display: formatCellValue(leaf.value, 80),
    },
  ];
}
