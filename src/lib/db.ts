import Dexie, { type Table } from "dexie";
import type { Project } from "./types";

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

export const db = new LogExplorerDB();

export async function listProjects(): Promise<
  Pick<Project, "id" | "name" | "updatedAt" | "createdAt">[]
> {
  const rows = await db.projects.orderBy("updatedAt").reverse().toArray();
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
  }));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function putProject(project: Project): Promise<void> {
  await db.projects.put(project);
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}

export async function getLastProjectId(): Promise<string | null> {
  const row = await db.meta.get("lastProjectId");
  return row?.value ?? null;
}

export async function setLastProjectId(id: string | null): Promise<void> {
  if (!id) {
    await db.meta.delete("lastProjectId");
    return;
  }
  await db.meta.put({ key: "lastProjectId", value: id });
}
