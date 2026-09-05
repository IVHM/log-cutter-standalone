/** Stable JSON serialization with sorted object keys. Arrays keep order. */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (Number.isNaN(value as number)) return "null";
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (t !== "object") return JSON.stringify(String(value));
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",")}}`;
}

function hex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hexes = HEX;
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += hexes[bytes[i]];
  return out;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return hex(digest);
}

export async function hashPayload(
  data: unknown,
  meta?: Record<string, string>,
  includeMeta = false,
): Promise<string> {
  const body = includeMeta ? { data, meta: meta ?? {} } : data;
  return sha256Hex(canonicalize(body));
}

/**
 * Structural fingerprint used to relate logs with the same shape.
 * Cheap string key — not cryptographic.
 */
export function shapeIdOf(data: unknown): string {
  const keys: string[] = [];
  collectShape(data, "", keys);
  keys.sort();
  return keys.join("|") || "(empty)";
}

function collectShape(value: unknown, path: string, out: string[], depth = 0): void {
  if (depth > 6) return;
  const t = jsonType(value);
  const here = path || "$";
  out.push(`${here}:${t}`);
  if (t === "object" && value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${k}` : k;
      collectShape(v, next, out, depth + 1);
    }
  } else if (t === "array" && Array.isArray(value) && value.length > 0) {
    collectShape(value[0], `${path}[]`, out, depth + 1);
  }
}

export function jsonType(value: unknown): "null" | "boolean" | "number" | "string" | "array" | "object" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "boolean" || t === "number" || t === "string") return t;
  return "object";
}
