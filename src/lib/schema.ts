import { jsonType } from "./hash";
import { joinPath, toSchemaPath } from "./json-path";
import type { JsonTypeName, LogRecord, SchemaField } from "./types";

const EMPTY_TYPES = (): Record<JsonTypeName, number> => ({
  null: 0,
  boolean: 0,
  number: 0,
  string: 0,
  array: 0,
  object: 0,
});

export function inferSchema(logs: LogRecord[]): SchemaField[] {
  const map = new Map<string, SchemaField>();

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

function walk(
  value: unknown,
  path: string,
  map: Map<string, SchemaField>,
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 8) return;
  const type = jsonType(value);
  if (path) bump(map, seen, toSchemaPath(path), type, path.includes("[]") || /\[\d+\]/.test(path));

  if (type === "object" && value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, joinPath(path, key), map, seen, depth + 1);
    }
  } else if (type === "array" && Array.isArray(value)) {
    const limit = Math.min(value.length, 12);
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
