import Papa from "papaparse";
import { hashPayload, shapeIdOf } from "./hash";
import type { DedupeMode, LogRecord } from "./types";

export type ParsedRow = {
  data: unknown;
  meta: Record<string, string>;
};

export type DetectedFile = {
  kind: "csv" | "json" | "jsonl";
  fileName: string;
  rows: Record<string, string>[];
  jsonColumns: string[];
  columns: string[];
  preview: ParsedRow[];
  suggestedJsonColumn: string | null;
};

function tryParseJson(text: string): unknown | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (
    !(
      (t.startsWith("{") && t.endsWith("}")) ||
      (t.startsWith("[") && t.endsWith("]")) ||
      t === "null" ||
      t === "true" ||
      t === "false" ||
      /^-?\d+(\.\d+)?$/.test(t)
    )
  ) {
    return undefined;
  }
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

function scoreColumn(values: string[]): number {
  let hits = 0;
  const sample = values.slice(0, 80);
  for (const v of sample) {
    const parsed = tryParseJson(v ?? "");
    if (parsed && typeof parsed === "object") hits += 1;
  }
  return hits;
}

function rowToRecord(row: Record<string, string>, jsonColumn: string | null): ParsedRow {
  if (jsonColumn && jsonColumn in row) {
    const parsed = tryParseJson(row[jsonColumn] ?? "");
    const meta: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === jsonColumn) continue;
      if (value != null && String(value).length > 0) meta[key] = String(value);
    }
    if (parsed !== undefined) return { data: parsed, meta };
    return { data: row, meta: {} };
  }
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const parsed = tryParseJson(value ?? "");
    data[key] = parsed !== undefined ? parsed : value;
  }
  return { data, meta: {} };
}

function parseJsonl(text: string): unknown[] {
  const items: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      items.push(JSON.parse(t));
    } catch {
      // skip malformed lines
    }
  }
  return items;
}

export async function inspectFile(file: File): Promise<DetectedFile> {
  const text = await file.text();
  const fileName = file.name;
  const lower = fileName.toLowerCase();

  const asJsonl = lower.endsWith(".jsonl") || lower.endsWith(".ndjson");
  if (asJsonl) {
    const items = parseJsonl(text);
    const rows = items.map((item, i) => ({
      index: String(i),
      json: JSON.stringify(item),
    }));
    return {
      kind: "jsonl",
      fileName,
      rows,
      columns: ["json"],
      jsonColumns: ["json"],
      suggestedJsonColumn: "json",
      preview: items.slice(0, 8).map((data) => ({ data, meta: {} })),
    };
  }

  if (lower.endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const looksLikeJsonl = items.length === 1 && typeof parsed === "object" && !Array.isArray(parsed)
        ? parseJsonl(text)
        : items;
      const records = looksLikeJsonl.length > 1 && !Array.isArray(parsed) ? looksLikeJsonl : items;
      const rows = records.map((item, i) => ({
        index: String(i),
        json: JSON.stringify(item),
      }));
      return {
        kind: "json",
        fileName,
        rows,
        columns: ["json"],
        jsonColumns: ["json"],
        suggestedJsonColumn: "json",
        preview: records.slice(0, 8).map((data) => ({ data, meta: {} })),
      };
    } catch {
      // fall through to CSV / JSONL
      const jsonl = parseJsonl(text);
      if (jsonl.length > 0) {
        return inspectFile(new File([text], fileName.replace(/\.\w+$/, ".jsonl"), { type: "application/jsonl" }));
      }
    }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const rows = (parsed.data ?? []).filter((row) =>
    Object.values(row).some((v) => String(v ?? "").trim().length > 0),
  );
  const columns = parsed.meta.fields?.filter(Boolean) ?? Object.keys(rows[0] ?? {});
  const jsonColumns = columns.filter((col) => scoreColumn(rows.map((r) => r[col] ?? "")) >= Math.max(1, Math.min(3, rows.length * 0.3)));
  const suggested =
    jsonColumns
      .map((col) => ({ col, score: scoreColumn(rows.map((r) => r[col] ?? "")) }))
      .sort((a, b) => b.score - a.score)[0]?.col ?? (jsonColumns[0] ?? null);

  return {
    kind: "csv",
    fileName,
    rows,
    columns,
    jsonColumns,
    suggestedJsonColumn: suggested,
    preview: rows.slice(0, 8).map((row) => rowToRecord(row, suggested)),
  };
}

export function materializeRows(
  detected: DetectedFile,
  jsonColumn: string | null,
): ParsedRow[] {
  if (detected.kind !== "csv") {
    return detected.rows.map((row) => {
      const parsed = tryParseJson(row.json ?? "") ?? row;
      return { data: parsed, meta: {} };
    });
  }
  return detected.rows.map((row) => rowToRecord(row, jsonColumn));
}

export async function toLogRecords(
  rows: ParsedRow[],
  opts: {
    logSetId: string;
    sourceFile?: string;
    dedupeMode: DedupeMode;
    existingHashes: Record<string, string>;
  },
): Promise<{ records: Omit<LogRecord, "id">[]; duplicates: number; hashes: string[] }> {
  const includeMeta = opts.dedupeMode === "payload+meta";
  const records: Omit<LogRecord, "id">[] = [];
  const hashes: string[] = [];
  let duplicates = 0;
  const seen = { ...opts.existingHashes };

  for (const row of rows) {
    const hash = hashPayload(row.data, row.meta, includeMeta);
    hashes.push(hash);
    if (seen[hash]) {
      duplicates += 1;
      continue;
    }
    seen[hash] = "pending";
    records.push({
      logSetId: opts.logSetId,
      hash,
      data: row.data,
      meta: row.meta,
      note: "",
      shapeId: shapeIdOf(row.data),
      importedAt: Date.now(),
      sourceFile: opts.sourceFile,
    });
  }

  return { records, duplicates, hashes };
}
