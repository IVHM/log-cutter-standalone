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

export function tokenizePath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
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
      if (/^\d+$/.test(inner)) out.push(Number(inner));
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

export function getAtPath(data: unknown, path: string): unknown {
  if (!path) return data;
  let cur: unknown = data;
  for (const token of tokenizePath(path)) {
    if (cur == null) return undefined;
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
