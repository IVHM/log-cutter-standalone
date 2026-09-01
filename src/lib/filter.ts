import { getAtPath } from "./json-path";
import type { FilterClause, FilterExpr, FilterGroup, FilterOp, LogRecord } from "./types";

export const FILTER_OPS: { id: FilterOp; label: string; values: 0 | 1 | 2 }[] = [
  { id: "eq", label: "equals", values: 1 },
  { id: "neq", label: "not equals", values: 1 },
  { id: "gt", label: "greater than", values: 1 },
  { id: "gte", label: "at least", values: 1 },
  { id: "lt", label: "less than", values: 1 },
  { id: "lte", label: "at most", values: 1 },
  { id: "between", label: "between", values: 2 },
  { id: "contains", label: "contains", values: 1 },
  { id: "is_true", label: "is true", values: 0 },
  { id: "is_false", label: "is false", values: 0 },
  { id: "is_empty", label: "is empty", values: 0 },
  { id: "is_not_empty", label: "is not empty", values: 0 },
];

export function emptyFilter(): FilterGroup {
  return { kind: "group", join: "and", children: [] };
}

export function emptyClause(path = ""): FilterClause {
  return { kind: "clause", path, op: "eq", value: "", valueTo: "" };
}

export function filterHasClauses(expr: FilterExpr | undefined): boolean {
  if (!expr) return false;
  if (expr.kind === "clause") return Boolean(expr.path);
  return expr.children.some(filterHasClauses);
}

export function logField(log: LogRecord, path: string): unknown {
  if (!path) return undefined;
  if (path.startsWith("meta.")) return log.meta[path.slice(5)];
  const fromData = getAtPath(log.data, path);
  if (fromData !== undefined) return fromData;
  return log.meta[path];
}

export function matchFilter(log: LogRecord, expr: FilterExpr | undefined): boolean {
  if (!expr) return true;
  if (expr.kind === "clause") return matchClause(log, expr);
  if (expr.children.length === 0) return true;
  if (expr.join === "or") return expr.children.some((child) => matchFilter(log, child));
  return expr.children.every((child) => matchFilter(log, child));
}

function matchClause(log: LogRecord, clause: FilterClause): boolean {
  if (!clause.path) return true;
  const raw = logField(log, clause.path);
  switch (clause.op) {
    case "eq":
      return compare(raw, clause.value) === 0;
    case "neq":
      return compare(raw, clause.value) !== 0;
    case "gt":
      return compare(raw, clause.value) > 0;
    case "gte":
      return compare(raw, clause.value) >= 0;
    case "lt":
      return compare(raw, clause.value) < 0;
    case "lte":
      return compare(raw, clause.value) <= 0;
    case "between": {
      const lo = compare(raw, clause.value);
      const hi = compare(raw, clause.valueTo);
      return lo >= 0 && hi <= 0;
    }
    case "contains":
      return stringify(raw).toLowerCase().includes(clause.value.trim().toLowerCase());
    case "is_true":
      return raw === true || raw === 1 || String(raw).toLowerCase() === "true";
    case "is_false":
      return raw === false || raw === 0 || String(raw).toLowerCase() === "false";
    case "is_empty":
      return isEmpty(raw);
    case "is_not_empty":
      return !isEmpty(raw);
    default:
      return true;
  }
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function compare(left: unknown, rightRaw: string): number {
  const rightNum = asNumber(rightRaw);
  const leftNum = asNumber(left);
  if (leftNum != null && rightNum != null) return leftNum === rightNum ? 0 : leftNum > rightNum ? 1 : -1;
  const ls = stringify(left);
  const rs = rightRaw;
  return ls.localeCompare(rs, undefined, { numeric: true, sensitivity: "base" });
}

export function filterPreview(expr: FilterExpr | undefined): string {
  if (!expr) return "";
  if (expr.kind === "clause") {
    if (!expr.path) return "";
    const op = FILTER_OPS.find((o) => o.id === expr.op)?.label ?? expr.op;
    if (expr.op === "between") return `${expr.path} ${op} ${expr.value} and ${expr.valueTo}`;
    if (FILTER_OPS.find((o) => o.id === expr.op)?.values === 0) return `${expr.path} ${op}`;
    const quoted = needsQuotes(expr.value) ? JSON.stringify(expr.value) : expr.value;
    const symbol =
      expr.op === "eq"
        ? "=="
        : expr.op === "neq"
          ? "!="
          : expr.op === "gt"
            ? ">"
            : expr.op === "gte"
              ? ">="
              : expr.op === "lt"
                ? "<"
                : expr.op === "lte"
                  ? "<="
                  : op;
    if (expr.op === "eq" || expr.op === "neq" || expr.op === "gt" || expr.op === "gte" || expr.op === "lt" || expr.op === "lte") {
      return `${expr.path} ${symbol} ${quoted}`;
    }
    return `${expr.path} ${op} ${quoted}`;
  }
  const parts = expr.children.map(filterPreview).filter(Boolean);
  if (parts.length === 0) return "";
  const join = ` ${expr.join.toUpperCase()} `;
  const body = parts.map((part, i) => (expr.children[i]?.kind === "group" ? `(${part})` : part)).join(join);
  return body;
}

function needsQuotes(value: string): boolean {
  return /[\s"]/.test(value) || value === "" || Number.isNaN(Number(value));
}
