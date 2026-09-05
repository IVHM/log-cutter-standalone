export function joinPath(parent: string, key: string | number): string {
  if (parent === "") {
    return typeof key === "number" ? `[${key}]` : escapeKey(key);
  }
  if (typeof key === "number") return `${parent}[${key}]`;
  if (isSafeKey(key)) return `${parent}.${key}`;
  return `${parent}[${JSON.stringify(key)}]`;
}

function isSafeKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function escapeKey(key: string): string {
  return isSafeKey(key) ? key : `[${JSON.stringify(key)}]`;
}

/** Rollup token for schema paths like items[].id */
export const PATH_ROLLUP: unique symbol = Symbol("[]");

export type PathToken = string | number | typeof PATH_ROLLUP;

export function tokenizePath(path: string): PathToken[] {
  const out: PathToken[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") {
      i += 1;
      continue;
    }
    if (path[i] === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) break;
      const inner = path.slice(i + 1, close);
      if (inner === "") out.push(PATH_ROLLUP);
      else if (/^\d+$/.test(inner)) out.push(Number(inner));
      else {
        try {
          out.push(String(JSON.parse(inner)));
        } catch {
          out.push(inner.replace(/^['"]|['"]$/g, ""));
        }
      }
      i = close + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") j += 1;
    out.push(path.slice(i, j));
    i = j;
  }
  return out;
}

const DEFAULT_COLLECT_CAP = 12;

/** Walk rollup `[]` tokens across array elements (capped). */
export function collectAtPath(data: unknown, path: string, cap = DEFAULT_COLLECT_CAP): unknown[] {
  if (!path) return [data];
  let cursors: unknown[] = [data];
  for (const token of tokenizePath(path)) {
    const next: unknown[] = [];
    for (const cur of cursors) {
      if (cur == null) continue;
      if (token === PATH_ROLLUP) {
        if (!Array.isArray(cur)) continue;
        const limit = Math.min(cur.length, cap);
        for (let i = 0; i < limit; i += 1) next.push(cur[i]);
      } else if (typeof token === "number") {
        if (Array.isArray(cur)) next.push(cur[token]);
      } else if (typeof cur === "object" && !Array.isArray(cur)) {
        next.push((cur as Record<string, unknown>)[token]);
      }
    }
    cursors = next;
  }
  return cursors;
}

export function getAtPath(data: unknown, path: string): unknown {
  if (!path) return data;
  if (path.includes("[]")) {
    const vals = collectAtPath(data, path);
    if (vals.length === 0) return undefined;
    if (vals.length === 1) return vals[0];
    return vals;
  }
  let cur: unknown = data;
  for (const token of tokenizePath(path)) {
    if (cur == null || token === PATH_ROLLUP) return undefined;
    if (typeof token === "number") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[token];
    } else {
      if (typeof cur !== "object" || Array.isArray(cur)) return undefined;
      cur = (cur as Record<string, unknown>)[token];
    }
  }
  return cur;
}

/** Collapse numeric indices so related fields share a schema path: items[0].id -> items[].id */
export function toSchemaPath(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

export function isPinnedUnder(
  path: string,
  pinnedPaths: string[],
): boolean {
  return pinnedPaths.some(
    (pin) => pin === path || pin.startsWith(`${path}.`) || pin.startsWith(`${path}[`),
  );
}

/** True if this instance or schema path is hidden, or sits under a hidden ancestor. */
export function isHiddenPath(path: string, hiddenPaths: string[]): boolean {
  if (!path || hiddenPaths.length === 0) return false;
  const schema = toSchemaPath(path);
  return hiddenPaths.some((hidden) => {
    const h = toSchemaPath(hidden);
    if (schema === h || path === hidden) return true;
    if (schema.startsWith(`${h}.`) || schema.startsWith(`${h}[`)) return true;
    if (path.startsWith(`${hidden}.`) || path.startsWith(`${hidden}[`)) return true;
    return false;
  });
}

export function formatScalar(value: unknown, max = 80): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    const t = value.length > max ? `${value.slice(0, max)}…` : value;
    return t;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(value);
  }
}

/** Table cells: join multiple rollup leaves instead of dumping a JSON array. */
export function formatCellValue(value: unknown, max = 80): string {
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatScalar(item, max));
    return formatScalar(parts.join(", "), max);
  }
  return formatScalar(value, max);
}
