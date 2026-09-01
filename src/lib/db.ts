import Dexie, { type Table } from "dexie";
import type { Project } from "./types";

export type ProjectSummary = Pick<Project, "id" | "name" | "updatedAt" | "createdAt">;

type MemoryState = {
  projects: Map<string, Project>;
  lastId: string | null;
};

const memory: MemoryState = {
  projects: new Map(),
  lastId: null,
};

let mode: "idb" | "memory" | "unknown" = "unknown";
let dexie: LogExplorerDB | null = null;
let ready: Promise<"idb" | "memory"> | null = null;

class LogExplorerDB extends Dexie {
  projects!: Table<Project, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("json-log-explorer");
    this.version(1).stores({
      projects: "id, name, updatedAt",
      meta: "key",
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

function summarize(p: Project): ProjectSummary {
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt };
}

export async function storageMode(): Promise<"idb" | "memory"> {
  return ensureBackend();
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) {
      return [...memory.projects.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(summarize);
    }
    const rows = await withTimeout(dexie.projects.orderBy("updatedAt").reverse().toArray(), 2000, "listProjects");
    return rows.map(summarize);
  } catch {
    mode = "memory";
    return [...memory.projects.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(summarize);
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return memory.projects.get(id);
    return await withTimeout(dexie.projects.get(id), 2000, "getProject");
  } catch {
    mode = "memory";
    return memory.projects.get(id);
  }
}

export async function putProject(project: Project): Promise<void> {
  memory.projects.set(project.id, project);
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await withTimeout(dexie.projects.put(project), 2000, "putProject");
  } catch {
    mode = "memory";
  }
}

export async function deleteProject(id: string): Promise<void> {
  memory.projects.delete(id);
  if (memory.lastId === id) memory.lastId = null;
  try {
    const backend = await ensureBackend();
    if (backend === "memory" || !dexie) return;
    await withTimeout(dexie.projects.delete(id), 2000, "deleteProject");
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
