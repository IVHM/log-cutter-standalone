import { nanoid } from "nanoid";
import { jsonType } from "./hash";
import { collectAtPath, formatCellValue, joinPath, toSchemaPath } from "./json-path";
import { SCHEMA_MAX_ARRAY, SCHEMA_MAX_DEPTH } from "./schema";
import type { LogFieldKind, LogFieldRow, LogRecord } from "./types";

export function valueKey(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  return value;
}

export function asLeaf(
  value: unknown,
): { jsonType: LogFieldRow["jsonType"]; value: string | number | boolean | null } | null {
  if (value === null) return { jsonType: "null", value: null };
  if (typeof value === "boolean") return { jsonType: "boolean", value };
  if (typeof value === "number" && Number.isFinite(value)) return { jsonType: "number", value };
  if (typeof value === "string") return { jsonType: "string", value };
  return null;
}

function leafRow(
  projectId: string,
  log: LogRecord,
  path: string,
  kind: LogFieldKind,
  value: unknown,
): LogFieldRow | null {
  const leaf = asLeaf(value);
  if (!leaf || !path) return null;
  return {
    id: nanoid(),
    projectId,
    sourceId: log.logSetId,
    logId: log.id,
    path: toSchemaPath(path),
    kind,
    jsonType: leaf.jsonType,
    value: leaf.value,
    valueKey: valueKey(leaf.value),
  };
}

function walkLeaves(
  value: unknown,
  path: string,
  out: LogFieldRow[],
  projectId: string,
  log: LogRecord,
  depth: number,
): void {
  if (depth > SCHEMA_MAX_DEPTH) return;
  const type = jsonType(value);
  if (type === "string" || type === "number" || type === "boolean" || type === "null") {
    const row = leafRow(projectId, log, path, "data", value);
    if (row) out.push(row);
    return;
  }
  if (type === "object" && value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walkLeaves(child, joinPath(path, key), out, projectId, log, depth + 1);
    }
    return;
  }
  if (type === "array" && Array.isArray(value)) {
    const limit = Math.min(value.length, SCHEMA_MAX_ARRAY);
    for (let i = 0; i < limit; i += 1) {
      walkLeaves(value[i], joinPath(path, i), out, projectId, log, depth + 1);
    }
  }
}

export function fieldsForLog(projectId: string, log: LogRecord): LogFieldRow[] {
  const out: LogFieldRow[] = [];
  walkLeaves(log.data, "", out, projectId, log, 0);
  for (const [key, value] of Object.entries(log.meta ?? {})) {
    const row = leafRow(projectId, log, joinPath("meta", key), "meta", value);
    if (row) out.push(row);
  }
  if (log.note) {
    const row = leafRow(projectId, log, "note", "note", log.note);
    if (row) out.push(row);
  }
  return out;
}

export function noteFieldRow(projectId: string, log: LogRecord): LogFieldRow | null {
  return log.note ? leafRow(projectId, log, "note", "note", log.note) : null;
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
