import Dexie, { type Table } from "dexie";
import { fieldsForLog, hashIndexFromLogs, noteFieldRow } from "./fields";
import { inferSchema } from "./schema";
import type { LogFieldRow, LogRecord, LogRow, Project, ProjectDoc } from "./types";
import { SCHEMA_VERSION } from "./types";

export type ProjectSummary = Pick<Project, "id" | "name" | "updatedAt" | "createdAt">;
export type MigrateProgress = { done: number; total: number };

type LegacyStored = ProjectDoc & {
  logs?: LogRecord[];
  hashIndex?: Record<string, string>;
  schemaVersion?: number;
};

type MemoryState = {
  docs: Map<string, ProjectDoc>;
  logs: Map<string, LogRow>;
  fields: LogFieldRow[];
  lastId: string | null;
};

const memory: MemoryState = {
  docs: new Map(),
  logs: new Map(),
  fields: [],
  lastId: null,
};

const WRITE_CHUNK = 80;

let mode: "idb" | "memory" | "unknown" = "unknown";
let dexie: LogExplorerDB | null = null;
let ready: Promise<"idb" | "memory"> | null = null;

class LogExplorerDB extends Dexie {
  projects!: Table<ProjectDoc, string>;
  meta!: Table<{ key: string; value: string }, string>;
  logs!: Table<LogRow, string>;
  logFields!: Table<LogFieldRow, string>;

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

function yieldUi(): Promise<void> {
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
    await withTimeout(dexie.open(), 2000, "Dexie.open");
    mode = "idb";
  } catch {
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
  memory.fields = memory.fields.filter((f) => f.projectId !== projectId);
}

function memDeleteLogs(ids: string[]) {
  const drop = new Set(ids);
  for (const id of ids) memory.logs.delete(id);
  memory.fields = memory.fields.filter((f) => !drop.has(f.logId));
}

async function idbClearProjectData(projectId: string): Promise<void> {
  if (!dexie) return;
  await dexie.transaction("rw", dexie.logs, dexie.logFields, async () => {
    await dexie!.logs.where("projectId").equals(projectId).delete();
    await dexie!.logFields.where("projectId").equals(projectId).delete();
  });
}

async function writeLogChunk(projectId: string, logs: LogRecord[]): Promise<void> {
  const rows = logs.map((log) => toLogRow(projectId, log));
  const fields = logs.flatMap((log) => fieldsForLog(projectId, log));
  for (const row of rows) memory.logs.set(row.id, row);
  memory.fields.push(...fields);
  if (mode !== "idb" || !dexie) return;
  try {
    await dexie.transaction("rw", dexie.logs, dexie.logFields, async () => {
      await dexie!.logs.bulkPut(rows);
      if (fields.length > 0) await dexie!.logFields.bulkPut(fields);
    });
  } catch {
    mode = "memory";
  }
}

async function writeLogsChunked(
  projectId: string,
  logs: LogRecord[],
  onProgress?: (progress: MigrateProgress) => void,
): Promise<void> {
  const total = logs.length;
  onProgress?.({ done: 0, total });
  for (let i = 0; i < logs.length; i += WRITE_CHUNK) {
    await writeLogChunk(projectId, logs.slice(i, i + WRITE_CHUNK));
    onProgress?.({ done: Math.min(i + WRITE_CHUNK, total), total });
    await yieldUi();
  }
  if (total === 0) onProgress?.({ done: 0, total: 0 });
}

function catalogSources(project: Pick<Project, "logSets" | "logs">): Project["logSets"] {
  return project.logSets.map((set) => {
    const setLogs = project.logs.filter((log) => log.logSetId === set.id);
    return { ...set, schemaFields: inferSchema(setLogs) };
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
    const project = assemble(raw, rows.map(fromLogRow));
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
  await writeLogsChunked(projectId, logs);
}

export async function deleteLogs(projectId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  memDeleteLogs(ids);
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await dexie.transaction("rw", dexie.logs, dexie.logFields, async () => {
      await dexie!.logs.bulkDelete(ids);
      for (const id of ids) {
        await dexie!.logFields.where("[projectId+logId]").equals([projectId, id]).delete();
      }
    });
  } catch {
    mode = "memory";
  }
}

export async function deleteLogsForSource(projectId: string, sourceId: string): Promise<void> {
  const ids = memLogsForProject(projectId)
    .filter((row) => row.sourceId === sourceId)
    .map((row) => row.id);
  memDeleteLogs(ids);
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await dexie.transaction("rw", dexie.logs, dexie.logFields, async () => {
      await dexie!.logs.where("[projectId+sourceId]").equals([projectId, sourceId]).delete();
      await dexie!.logFields.where("[projectId+sourceId]").equals([projectId, sourceId]).delete();
    });
  } catch {
    mode = "memory";
  }
}

export async function putLogNote(projectId: string, log: LogRecord): Promise<void> {
  const row = toLogRow(projectId, log);
  memory.logs.set(row.id, row);
  memory.fields = memory.fields.filter((f) => !(f.logId === log.id && f.kind === "note"));
  const note = noteFieldRow(projectId, log);
  if (note) memory.fields.push(note);
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await dexie.logs.put(row);
    const existing = await dexie.logFields.where("[projectId+logId]").equals([projectId, log.id]).toArray();
    await dexie.logFields.bulkDelete(existing.filter((f) => f.kind === "note").map((f) => f.id));
    if (note) await dexie.logFields.put(note);
  } catch {
    mode = "memory";
  }
}

export async function deleteProject(id: string): Promise<void> {
  memory.docs.delete(id);
  memClearProjectData(id);
  if (memory.lastId === id) memory.lastId = null;
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await dexie.transaction("rw", dexie.projects, dexie.logs, dexie.logFields, async () => {
      await dexie!.projects.delete(id);
      await dexie!.logs.where("projectId").equals(id).delete();
      await dexie!.logFields.where("projectId").equals(id).delete();
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
 * B1: exact same path + valueKey in one source, via logFields (not a full log scan).
 * Results are unique logs, newest importedAt first.
 */
export async function findLogsBySameValue(opts: {
  projectId: string;
  sourceId: string;
  path: string;
  valueKey: string;
}): Promise<LogRecord[]> {
  const { projectId, sourceId, path, valueKey } = opts;
  const logIds = new Set<string>();
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) {
      for (const field of memory.fields) {
        if (
          field.projectId === projectId &&
          field.sourceId === sourceId &&
          field.path === path &&
          field.valueKey === valueKey
        ) {
          logIds.add(field.logId);
        }
      }
    } else {
      const matches = await dexie.logFields
        .where("[projectId+sourceId+path+valueKey]")
        .equals([projectId, sourceId, path, valueKey])
        .toArray();
      for (const field of matches) logIds.add(field.logId);
    }
  } catch {
    mode = "memory";
    for (const field of memory.fields) {
      if (
        field.projectId === projectId &&
        field.sourceId === sourceId &&
        field.path === path &&
        field.valueKey === valueKey
      ) {
        logIds.add(field.logId);
      }
    }
  }

  const ids = [...logIds];
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
