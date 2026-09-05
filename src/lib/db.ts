import Dexie, { type Table } from "dexie";
import {
  addLogToPostingSets,
  addNoteToPostingSets,
  hashIndexFromLogs,
  NOTE_FIELD_PATH,
  postingsToSets,
  removeLogFromPath,
  removeLogsFromPostingSets,
  setsToPostings,
  sourceFieldIndexId,
  type FieldPostingSets,
} from "./fields";
import { inferSchema } from "./schema";
import type { LogRecord, LogRow, Project, ProjectDoc, SourceFieldIndexRow } from "./types";
import { SCHEMA_VERSION } from "./types";

export type ProjectSummary = Pick<Project, "id" | "name" | "updatedAt" | "createdAt">;
export type MigrateProgress = { done: number; total: number };
export type ImportProgress = {
  phase: "logs" | "index";
  done: number;
  total: number;
  blocking: boolean;
};

type LegacyStored = ProjectDoc & {
  logs?: LogRecord[];
  hashIndex?: Record<string, string>;
  schemaVersion?: number;
};

type MemoryState = {
  docs: Map<string, ProjectDoc>;
  logs: Map<string, LogRow>;
  indexes: Map<string, SourceFieldIndexRow>;
  lastId: string | null;
};

const memory: MemoryState = {
  docs: new Map(),
  logs: new Map(),
  indexes: new Map(),
  lastId: null,
};

const WRITE_CHUNK = 400;
const INDEX_CHUNK = 400;

let mode: "idb" | "memory" | "unknown" = "unknown";
let dexie: LogExplorerDB | null = null;
let ready: Promise<"idb" | "memory"> | null = null;

class LogExplorerDB extends Dexie {
  projects!: Table<ProjectDoc, string>;
  meta!: Table<{ key: string; value: string }, string>;
  logs!: Table<LogRow, string>;
  sourceFieldIndex!: Table<SourceFieldIndexRow, string>;

  constructor() {
    super("json-log-explorer");
    this.version(1).stores({
      projects: "id, name, updatedAt",
      meta: "key",
    });
    this.version(2).stores({
      projects: "id, name, updatedAt",
      meta: "key",
      logs: "id, projectId, sourceId, hash, [projectId+sourceId], [projectId+hash], importedAt",
      logFields:
        "id, projectId, [projectId+logId], [projectId+sourceId], [projectId+sourceId+path], [projectId+path+valueKey]",
    });
    this.version(3).stores({
      projects: "id, name, updatedAt",
      meta: "key",
      logs: "id, projectId, sourceId, hash, [projectId+sourceId], [projectId+hash], importedAt",
      logFields:
        "id, projectId, [projectId+logId], [projectId+sourceId], [projectId+sourceId+path], [projectId+path+valueKey], [projectId+sourceId+path+valueKey]",
    });
    this.version(4).stores({
      projects: "id, name, updatedAt",
      meta: "key",
      logs: "id, projectId, sourceId, hash, [projectId+sourceId], [projectId+hash], importedAt",
      logFields:
        "id, projectId, [projectId+logId], [projectId+sourceId], [projectId+sourceId+path+valueKey]",
    });
    this.version(5)
      .stores({
        projects: "id, name, updatedAt",
        meta: "key",
        logs: "id, projectId, sourceId, hash, [projectId+sourceId], [projectId+hash], importedAt",
        logFields:
          "id, projectId, [projectId+logId], [projectId+sourceId], [projectId+sourceId+path+valueKey]",
        sourceFieldIndex: "id, projectId",
      });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function yieldUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function probeIndexedDb(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const id = `__jle_probe_${Date.now()}`;
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(id);
        req.onerror = () => reject(req.error ?? new Error("open failed"));
        req.onblocked = () => reject(new Error("open blocked"));
        req.onsuccess = () => {
          req.result.close();
          const del = indexedDB.deleteDatabase(id);
          del.onsuccess = () => resolve();
          del.onerror = () => resolve();
        };
      }),
      1500,
      "indexedDB probe",
    );
    return true;
  } catch {
    return false;
  }
}

async function initBackend(): Promise<"idb" | "memory"> {
  const ok = await probeIndexedDb();
  if (!ok) {
    mode = "memory";
    return mode;
  }
  try {
    dexie = new LogExplorerDB();
    await withTimeout(dexie.open(), 180000, "Dexie.open");
    mode = "idb";
  } catch (err) {
    console.warn("IndexedDB open failed; using in-memory storage.", err);
    dexie = null;
    mode = "memory";
  }
  return mode;
}

async function ensureBackend(): Promise<"idb" | "memory"> {
  if (mode === "idb" || mode === "memory") return mode;
  if (!ready) ready = initBackend();
  return ready;
}

function summarize(p: ProjectDoc | Project): ProjectSummary {
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt };
}

export function toProjectDoc(project: Project): ProjectDoc {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    logSets: project.logSets,
    views: project.views,
    canvases: project.canvases,
    sourceGroups: project.sourceGroups ?? [],
    canvasGroups: project.canvasGroups ?? [],
    settings: project.settings,
    openTabs: project.openTabs,
    activeTabId: project.activeTabId,
    lastCanvasId: project.lastCanvasId,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function toLogRow(projectId: string, log: LogRecord): LogRow {
  return {
    id: log.id,
    projectId,
    sourceId: log.logSetId,
    hash: log.hash,
    shapeId: log.shapeId,
    importedAt: log.importedAt,
    sourceFile: log.sourceFile,
    note: log.note,
    meta: log.meta,
    data: log.data,
  };
}

export function fromLogRow(row: LogRow): LogRecord {
  return {
    id: row.id,
    logSetId: row.sourceId,
    hash: row.hash,
    data: row.data,
    meta: row.meta ?? {},
    note: row.note ?? "",
    shapeId: row.shapeId,
    importedAt: row.importedAt,
    sourceFile: row.sourceFile,
  };
}

function assemble(doc: ProjectDoc, logs: LogRecord[]): Project {
  return {
    ...doc,
    schemaVersion: SCHEMA_VERSION,
    logs,
    hashIndex: hashIndexFromLogs(logs),
  };
}

function needsMigrate(raw: LegacyStored): boolean {
  if (Array.isArray(raw.logs)) return true;
  if (raw.hashIndex != null) return true;
  return (raw.schemaVersion ?? 1) < SCHEMA_VERSION;
}

function memLogsForProject(projectId: string): LogRow[] {
  return [...memory.logs.values()].filter((row) => row.projectId === projectId);
}

function memClearProjectData(projectId: string) {
  for (const [id, row] of [...memory.logs.entries()]) {
    if (row.projectId === projectId) memory.logs.delete(id);
  }
  for (const [id, row] of [...memory.indexes.entries()]) {
    if (row.projectId === projectId) memory.indexes.delete(id);
  }
}

function memDeleteLogs(ids: string[]) {
  for (const id of ids) memory.logs.delete(id);
}

function memDeleteSourceIndex(projectId: string, sourceId: string) {
  memory.indexes.delete(sourceFieldIndexId(projectId, sourceId));
}

async function idbClearProjectData(projectId: string): Promise<void> {
  if (!dexie) return;
  await dexie.transaction("rw", dexie.logs, dexie.sourceFieldIndex, async () => {
    await dexie!.logs.where("projectId").equals(projectId).delete();
    await dexie!.sourceFieldIndex.where("projectId").equals(projectId).delete();
  });
}

async function writeLogPayloadChunk(projectId: string, logs: LogRecord[]): Promise<void> {
  const rows = logs.map((log) => toLogRow(projectId, log));
  for (const row of rows) memory.logs.set(row.id, row);
  if (mode !== "idb" || !dexie) return;
  try {
    await dexie.logs.bulkPut(rows);
  } catch {
    mode = "memory";
  }
}

function rememberIndex(row: SourceFieldIndexRow) {
  memory.indexes.set(row.id, row);
}

async function getSourceIndexRow(
  projectId: string,
  sourceId: string,
): Promise<SourceFieldIndexRow | undefined> {
  const id = sourceFieldIndexId(projectId, sourceId);
  const cached = memory.indexes.get(id);
  if (cached) return cached;
  if (mode === "idb" && dexie) {
    try {
      const row = await dexie.sourceFieldIndex.get(id);
      if (row) rememberIndex(row);
      return row;
    } catch {
      mode = "memory";
    }
  }
  return undefined;
}

async function loadPostingSets(projectId: string, sourceId: string): Promise<FieldPostingSets> {
  return postingsToSets((await getSourceIndexRow(projectId, sourceId))?.postings);
}

async function savePostingSets(
  projectId: string,
  sourceId: string,
  sets: FieldPostingSets,
): Promise<void> {
  const row: SourceFieldIndexRow = {
    id: sourceFieldIndexId(projectId, sourceId),
    projectId,
    sourceId,
    postings: setsToPostings(sets),
  };
  rememberIndex(row);
  if (mode !== "idb" || !dexie) return;
  try {
    await dexie.sourceFieldIndex.put(row);
  } catch {
    mode = "memory";
  }
}

async function indexSourceLogs(
  projectId: string,
  sourceId: string,
  logs: LogRecord[],
  onProgress?: (progress: MigrateProgress) => void,
  progressOffset = 0,
  progressTotal?: number,
): Promise<void> {
  const total = progressTotal ?? logs.length;
  const sets = await loadPostingSets(projectId, sourceId);
  for (let i = 0; i < logs.length; i += INDEX_CHUNK) {
    const slice = logs.slice(i, i + INDEX_CHUNK);
    for (const log of slice) addLogToPostingSets(sets, log);
    onProgress?.({ done: Math.min(progressOffset + i + slice.length, total), total });
    await yieldUi();
  }
  await savePostingSets(projectId, sourceId, sets);
}

async function writeLogsChunked(
  projectId: string,
  logs: LogRecord[],
  onProgress?: (progress: MigrateProgress) => void,
): Promise<void> {
  const total = logs.length;
  onProgress?.({ done: 0, total });
  for (let i = 0; i < logs.length; i += WRITE_CHUNK) {
    await writeLogPayloadChunk(projectId, logs.slice(i, i + WRITE_CHUNK));
    onProgress?.({ done: Math.min(i + WRITE_CHUNK, total), total });
  }
  await indexLogFields(projectId, logs, onProgress);
  if (total === 0) onProgress?.({ done: 0, total: 0 });
}

function catalogSources(project: Pick<Project, "logSets" | "logs">): Project["logSets"] {
  return project.logSets.map((set) => {
    const setLogs = project.logs.filter((log) => log.logSetId === set.id);
    return {
      ...set,
      schemaFields: inferSchema(setLogs),
      logCount: setLogs.length,
      indexedCount: setLogs.length,
    };
  });
}

export async function storageMode(): Promise<"idb" | "memory"> {
  return ensureBackend();
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) {
      return [...memory.docs.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(summarize);
    }
    const rows = await withTimeout(dexie.projects.orderBy("updatedAt").reverse().toArray(), 2000, "listProjects");
    return rows.map(summarize);
  } catch {
    mode = "memory";
    return [...memory.docs.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(summarize);
  }
}

async function migrateV1ToV2b(
  raw: LegacyStored,
  onProgress?: (progress: MigrateProgress) => void,
): Promise<Project> {
  const logs = Array.isArray(raw.logs) ? raw.logs : [];
  memClearProjectData(raw.id);
  if (mode === "idb" && dexie) await idbClearProjectData(raw.id);
  await writeLogsChunked(raw.id, logs, onProgress);
  const logSets = catalogSources({ logSets: raw.logSets ?? [], logs });
  const doc: ProjectDoc = {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    logSets,
    views: raw.views ?? [],
    canvases: raw.canvases ?? [],
    sourceGroups: raw.sourceGroups ?? [],
    canvasGroups: raw.canvasGroups ?? [],
    settings: raw.settings,
    openTabs: raw.openTabs ?? [],
    activeTabId: raw.activeTabId ?? null,
    lastCanvasId: raw.lastCanvasId ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
  memory.docs.set(doc.id, doc);
  if (mode === "idb" && dexie) await dexie.projects.put(doc);
  return assemble(doc, logs);
}

function projectFromMemory(id: string): Project | undefined {
  const doc = memory.docs.get(id);
  if (!doc) return undefined;
  return assemble(doc, memLogsForProject(id).map(fromLogRow));
}

async function withMissingPostingIndex(project: Project): Promise<Project> {
  let changed = false;
  const logSets = await Promise.all(
    project.logSets.map(async (source) => {
      if ((source.logCount ?? 0) === 0) return source;
      const row = await getSourceIndexRow(project.id, source.id);
      if (row) return source;
      changed = true;
      return { ...source, indexedCount: 0 };
    }),
  );
  return changed ? { ...project, logSets } : project;
}

export async function getProject(
  id: string,
  onProgress?: (progress: MigrateProgress) => void,
): Promise<Project | undefined> {
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return projectFromMemory(id);
    const raw = (await withTimeout(dexie.projects.get(id), 8000, "getProject")) as LegacyStored | undefined;
    if (!raw) return undefined;
    if (needsMigrate(raw)) return await migrateV1ToV2b(raw, onProgress);
    const rows = await dexie.logs.where("projectId").equals(id).toArray();
    const project = await withMissingPostingIndex(assemble(raw, rows.map(fromLogRow)));
    memory.docs.set(raw.id, toProjectDoc(project));
    for (const row of rows) memory.logs.set(row.id, row);
    return project;
  } catch {
    mode = "memory";
    return projectFromMemory(id);
  }
}

export async function putProjectDoc(project: Project): Promise<void> {
  const doc = toProjectDoc(project);
  memory.docs.set(doc.id, doc);
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await withTimeout(dexie.projects.put(doc), 4000, "putProjectDoc");
  } catch {
    mode = "memory";
  }
}

/** Write ProjectDoc + replace all logs/fields. Used for create, sample, and file import. */
export async function replaceProject(
  project: Project,
  onProgress?: (progress: MigrateProgress) => void,
): Promise<Project> {
  const next: Project = {
    ...project,
    logSets: catalogSources(project),
    schemaVersion: SCHEMA_VERSION,
    hashIndex: hashIndexFromLogs(project.logs),
  };
  const doc = toProjectDoc(next);
  memClearProjectData(next.id);
  memory.docs.set(doc.id, doc);
  try {
    await ensureBackend();
    if (mode === "idb" && dexie) {
      await idbClearProjectData(next.id);
      await dexie.projects.put(doc);
    }
  } catch {
    mode = "memory";
  }
  await writeLogsChunked(next.id, next.logs, onProgress);
  return next;
}

export async function appendLogs(projectId: string, logs: LogRecord[]): Promise<void> {
  if (logs.length === 0) return;
  await ensureBackend();
  for (let i = 0; i < logs.length; i += WRITE_CHUNK) {
    await writeLogPayloadChunk(projectId, logs.slice(i, i + WRITE_CHUNK));
  }
}

/** Merge logs into the per-source posting-list index. Idempotent (Sets). */
export async function indexLogFields(
  projectId: string,
  logs: LogRecord[],
  onProgress?: (progress: MigrateProgress) => void,
): Promise<void> {
  if (logs.length === 0) {
    onProgress?.({ done: 0, total: 0 });
    return;
  }
  await ensureBackend();
  const bySource = new Map<string, LogRecord[]>();
  for (const log of logs) {
    const list = bySource.get(log.logSetId);
    if (list) list.push(log);
    else bySource.set(log.logSetId, [log]);
  }
  const total = logs.length;
  let done = 0;
  onProgress?.({ done: 0, total });
  for (const [sourceId, sourceLogs] of bySource) {
    await indexSourceLogs(projectId, sourceId, sourceLogs, onProgress, done, total);
    done += sourceLogs.length;
  }
}

/** Payload hashes already stored for this source. Scans memory, then IDB — not project.logs. */
export async function hashesForSource(projectId: string, sourceId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const row of memory.logs.values()) {
    if (row.projectId === projectId && row.sourceId === sourceId) out.add(row.hash);
  }
  if (out.size > 0) return out;
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return out;
    const rows = await dexie.logs.where("[projectId+sourceId]").equals([projectId, sourceId]).toArray();
    for (const row of rows) {
      out.add(row.hash);
      memory.logs.set(row.id, row);
    }
  } catch {
    /* keep whatever we collected */
  }
  return out;
}

/** Logs for one source from memory/IDB. Does not allocate other sources. */
export async function getLogsForSource(projectId: string, sourceId: string): Promise<LogRecord[]> {
  const fromMem: LogRecord[] = [];
  for (const row of memory.logs.values()) {
    if (row.projectId === projectId && row.sourceId === sourceId) fromMem.push(fromLogRow(row));
  }
  if (fromMem.length > 0) return fromMem;
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return fromMem;
    const rows = await dexie.logs.where("[projectId+sourceId]").equals([projectId, sourceId]).toArray();
    for (const row of rows) memory.logs.set(row.id, row);
    return rows.map(fromLogRow);
  } catch {
    return fromMem;
  }
}

export async function deleteLogs(projectId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureBackend();
  const missing = ids.filter((id) => !memory.logs.has(id));
  if (missing.length > 0 && mode === "idb" && dexie) {
    try {
      const rows = await dexie.logs.bulkGet(missing);
      for (const row of rows) if (row) memory.logs.set(row.id, row);
    } catch {
      /* look up whatever we have */
    }
  }
  const bySource = new Map<string, Set<string>>();
  for (const id of ids) {
    const sourceId = memory.logs.get(id)?.sourceId;
    if (!sourceId) continue;
    const group = bySource.get(sourceId);
    if (group) group.add(id);
    else bySource.set(sourceId, new Set([id]));
  }
  memDeleteLogs(ids);
  try {
    if (mode === "memory" || !dexie) {
      for (const [sourceId, logIds] of bySource) {
        const sets = await loadPostingSets(projectId, sourceId);
        removeLogsFromPostingSets(sets, logIds);
        await savePostingSets(projectId, sourceId, sets);
      }
      return;
    }
    await dexie.logs.bulkDelete(ids);
    for (const [sourceId, logIds] of bySource) {
      const sets = await loadPostingSets(projectId, sourceId);
      removeLogsFromPostingSets(sets, logIds);
      await savePostingSets(projectId, sourceId, sets);
    }
  } catch {
    mode = "memory";
    for (const [sourceId, logIds] of bySource) {
      const sets = await loadPostingSets(projectId, sourceId);
      removeLogsFromPostingSets(sets, logIds);
      await savePostingSets(projectId, sourceId, sets);
    }
  }
}

export async function deleteLogsForSource(projectId: string, sourceId: string): Promise<void> {
  const ids = memLogsForProject(projectId)
    .filter((row) => row.sourceId === sourceId)
    .map((row) => row.id);
  memDeleteLogs(ids);
  memDeleteSourceIndex(projectId, sourceId);
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await dexie.transaction("rw", dexie.logs, dexie.sourceFieldIndex, async () => {
      await dexie!.logs.where("[projectId+sourceId]").equals([projectId, sourceId]).delete();
      await dexie!.sourceFieldIndex.delete(sourceFieldIndexId(projectId, sourceId));
    });
  } catch {
    mode = "memory";
  }
}

export async function putLogNote(projectId: string, log: LogRecord): Promise<void> {
  const row = toLogRow(projectId, log);
  memory.logs.set(row.id, row);
  try {
    const backend = await ensureBackend();
    if (backend === "idb" && dexie) await dexie.logs.put(row);
    const sets = await loadPostingSets(projectId, log.logSetId);
    removeLogFromPath(sets, log.id, NOTE_FIELD_PATH);
    if (log.note) addNoteToPostingSets(sets, log.id, log.note);
    await savePostingSets(projectId, log.logSetId, sets);
  } catch {
    mode = "memory";
    const sets = await loadPostingSets(projectId, log.logSetId);
    removeLogFromPath(sets, log.id, NOTE_FIELD_PATH);
    if (log.note) addNoteToPostingSets(sets, log.id, log.note);
    await savePostingSets(projectId, log.logSetId, sets);
  }
}

export async function deleteProject(id: string): Promise<void> {
  memory.docs.delete(id);
  memClearProjectData(id);
  if (memory.lastId === id) memory.lastId = null;
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await dexie.transaction("rw", dexie.projects, dexie.logs, dexie.sourceFieldIndex, async () => {
      await dexie!.projects.delete(id);
      await dexie!.logs.where("projectId").equals(id).delete();
      await dexie!.sourceFieldIndex.where("projectId").equals(id).delete();
    });
  } catch {
    mode = "memory";
  }
}

export async function getLastProjectId(): Promise<string | null> {
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return memory.lastId;
    const row = await withTimeout(dexie.meta.get("lastProjectId"), 2000, "getLastProjectId");
    return row?.value ?? null;
  } catch {
    mode = "memory";
    return memory.lastId;
  }
}

export async function setLastProjectId(id: string | null): Promise<void> {
  memory.lastId = id;
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    if (!id) {
      await dexie.meta.delete("lastProjectId");
      return;
    }
    await dexie.meta.put({ key: "lastProjectId", value: id });
  } catch {
    mode = "memory";
  }
}

/**
 * Exact same path + valueKey in one source, via the per-source posting list.
 * Results are unique logs, newest importedAt first.
 */
export async function findLogsBySameValue(opts: {
  projectId: string;
  sourceId: string;
  path: string;
  valueKey: string;
}): Promise<LogRecord[]> {
  const { projectId, sourceId, path, valueKey } = opts;
  await ensureBackend();
  const row = await getSourceIndexRow(projectId, sourceId);
  const ids = row?.postings[path]?.[valueKey] ?? [];
  if (ids.length === 0) return [];
  const rows = await getLogRowsByIds(ids);
  return rows
    .map(fromLogRow)
    .sort((a, b) => b.importedAt - a.importedAt || a.id.localeCompare(b.id));
}

async function getLogRowsByIds(ids: string[]): Promise<LogRow[]> {
  const fromMemory = ids.map((id) => memory.logs.get(id)).filter((row): row is LogRow => Boolean(row));
  if (fromMemory.length === ids.length || mode === "memory" || !dexie) return fromMemory;
  try {
    const rows = await dexie.logs.bulkGet(ids);
    const found = rows.filter((row): row is LogRow => Boolean(row));
    for (const row of found) memory.logs.set(row.id, row);
    return found;
  } catch {
    return fromMemory;
  }
}

/** True if this source already has a log with the given payload hash. */
export async function hasHash(projectId: string, sourceId: string, hash: string): Promise<boolean> {
  if (memory.logs.size > 0) {
    for (const row of memory.logs.values()) {
      if (row.projectId === projectId && row.sourceId === sourceId && row.hash === hash) return true;
    }
  }
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return false;
    const rows = await dexie.logs.where("[projectId+hash]").equals([projectId, hash]).toArray();
    return rows.some((row) => row.sourceId === sourceId);
  } catch {
    return false;
  }
}
