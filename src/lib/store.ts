import { nanoid } from "nanoid";
import { create } from "zustand";
import {
  deleteProject as dbDelete,
  getLastProjectId,
  getProject,
  listProjects,
  putProject,
  setLastProjectId,
} from "./db";
import { toLogRecords, type ParsedRow } from "./import-parse";
import { suggestColumns, inferSchema, suggestPins } from "./schema";
import { buildSampleProject } from "./sample";
import type {
  AppEdge,
  AppNode,
  AppNodeData,
  BrowserView,
  Canvas,
  EdgeConnection,
  Project,
  ProjectSettings,
  Tab,
  Viewport,
} from "./types";
import { DEFAULT_SETTINGS, NOTE_COLORS } from "./types";

export type ProjectSummary = Pick<Project, "id" | "name" | "updatedAt" | "createdAt">;

type Store = {
  hydrated: boolean;
  dirty: boolean;
  saving: boolean;
  project: Project | null;
  projects: ProjectSummary[];
  importOpen: boolean;
  queuedImportFile: File | null;
  setImportOpen: (open: boolean) => void;
  queueImportFile: (file: File | null) => void;

  hydrate: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  loadSample: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  renameProject: (name: string) => void;
  deleteCurrentProject: () => Promise<void>;
  saveNow: () => Promise<void>;
  exportProject: () => void;
  importProjectFile: (file: File) => Promise<void>;

  openItem: (item: SidebarTarget) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;

  createCanvas: (name?: string) => string;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  setCanvasNodes: (canvasId: string, nodes: AppNode[]) => void;
  setCanvasEdges: (canvasId: string, edges: AppEdge[]) => void;
  setViewport: (canvasId: string, viewport: Viewport) => void;
  addLogsToCanvas: (
    canvasId: string,
    logIds: string[],
    origin?: { x: number; y: number },
  ) => void;
  addNote: (canvasId: string, position?: { x: number; y: number }, color?: string) => void;
  addBracket: (
    canvasId: string,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) => void;
  updateNodeData: (canvasId: string, nodeId: string, data: Partial<AppNodeData>) => void;
  connectEdge: (canvasId: string, connection: EdgeConnection) => void;
  updateEdge: (canvasId: string, edgeId: string, patch: Partial<AppEdge>) => void;

  createLogSet: (name: string) => string;
  renameLogSet: (id: string, name: string) => void;
  deleteLogSet: (id: string) => void;
  importRows: (
    logSetId: string | "new",
    name: string,
    rows: ParsedRow[],
    sourceFile?: string,
  ) => Promise<{ added: number; duplicates: number; logSetId: string }>;
  removeLogs: (ids: string[]) => void;
  setLogNote: (id: string, note: string) => void;

  createView: (logSetId: string | "all", name?: string) => string;
  updateView: (id: string, patch: Partial<BrowserView>) => void;
  deleteView: (id: string) => void;

  updateSettings: (patch: Partial<ProjectSettings>) => void;
};

export type SidebarTarget =
  | { type: "canvas"; id: string }
  | { type: "view"; id: string }
  | { type: "logSet"; id: string }
  | { type: "settings" };

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emptyProject(name: string): Project {
  const now = Date.now();
  const canvasId = nanoid();
  const logSetId = nanoid();
  const viewId = nanoid();
  const canvasTabId = nanoid();
  const viewTabId = nanoid();
  return {
    id: nanoid(),
    name,
    createdAt: now,
    updatedAt: now,
    logSets: [{ id: logSetId, name: "Logs", createdAt: now }],
    logs: [],
    hashIndex: {},
    views: [
      {
        id: viewId,
        name: "All logs",
        logSetId,
        columns: [],
        search: "",
        shapeFilter: null,
      },
    ],
    canvases: [
      {
        id: canvasId,
        name: "Canvas 1",
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      },
    ],
    settings: { ...DEFAULT_SETTINGS },
    openTabs: [
      { id: canvasTabId, kind: "canvas", canvasId },
      { id: viewTabId, kind: "browser", viewId },
    ],
    activeTabId: canvasTabId,
    lastCanvasId: canvasId,
  };
}

function patchProject(set: (fn: (s: Store) => Partial<Store>) => void, get: () => Store, fn: (p: Project) => Project) {
  const current = get().project;
  if (!current) return;
  const next = { ...fn(current), updatedAt: Date.now() };
  set(() => ({ project: next, dirty: true }));
  scheduleSave(get);
}

function scheduleSave(get: () => Store) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void get().saveNow();
  }, 700);
}

function mapCanvas(project: Project, canvasId: string, fn: (c: Canvas) => Canvas): Project {
  return {
    ...project,
    canvases: project.canvases.map((c) => (c.id === canvasId ? fn(c) : c)),
  };
}

function upsertTab(project: Project, tab: Tab, active = true): Project {
  const existing = project.openTabs.find((t) => {
    if (t.kind !== tab.kind) return false;
    if (t.kind === "canvas" && tab.kind === "canvas") return t.canvasId === tab.canvasId;
    if (t.kind === "browser" && tab.kind === "browser") return t.viewId === tab.viewId;
    return t.kind === "settings" && tab.kind === "settings";
  });
  if (existing) {
    return { ...project, activeTabId: active ? existing.id : project.activeTabId };
  }
  return {
    ...project,
    openTabs: [...project.openTabs, tab],
    activeTabId: active ? tab.id : project.activeTabId,
  };
}

export const useProjectStore = create<Store>((set, get) => ({
  hydrated: true,
  dirty: false,
  saving: false,
  project: null,
  projects: [],
  importOpen: false,
  queuedImportFile: null,
  setImportOpen: (open) => set({ importOpen: open }),
  queueImportFile: (file) => set({ queuedImportFile: file, importOpen: file ? true : get().importOpen }),

  hydrate: async () => {
    try {
      const projects = await listProjects();
      const lastId = await getLastProjectId();
      const openId = lastId && projects.some((p) => p.id === lastId) ? lastId : projects[0]?.id;
      const project = openId ? ((await getProject(openId)) ?? null) : null;
      set({ hydrated: true, projects, project, dirty: false });
    } catch (err) {
      console.warn("Failed to restore projects; starting empty.", err);
      set({ hydrated: true, projects: [], project: null, dirty: false });
    }
  },

  createProject: async (name) => {
    await get().saveNow();
    const project = emptyProject(name.trim() || "Untitled project");
    await putProject(project);
    await setLastProjectId(project.id);
    const projects = await listProjects();
    set({ project, projects, dirty: false });
  },

  loadSample: async () => {
    await get().saveNow();
    const project = await buildSampleProject();
    await putProject(project);
    await setLastProjectId(project.id);
    const projects = await listProjects();
    set({ project, projects, dirty: false });
  },

  openProject: async (id) => {
    await get().saveNow();
    const project = await getProject(id);
    if (!project) return;
    await setLastProjectId(id);
    set({ project, dirty: false });
  },

  renameProject: (name) => {
    patchProject(set, get, (p) => ({ ...p, name }));
  },

  deleteCurrentProject: async () => {
    const project = get().project;
    if (!project) return;
    await dbDelete(project.id);
    const projects = await listProjects();
    const next = projects[0] ? await getProject(projects[0].id) : null;
    if (next) await setLastProjectId(next.id);
    else await setLastProjectId(null);
    set({ project: next ?? null, projects, dirty: false });
  },

  saveNow: async () => {
    const { project, dirty } = get();
    if (!project || !dirty) return;
    set({ saving: true });
    try {
      await putProject(project);
      await setLastProjectId(project.id);
      const projects = await listProjects();
      set({ dirty: false, saving: false, projects });
    } catch {
      set({ saving: false });
    }
  },

  exportProject: () => {
    const project = get().project;
    if (!project) return;
    const payload = {
      format: "json-log-explorer",
      version: 1,
      project,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^\w.-]+/g, "-") || "project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importProjectFile: async (file) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as { format?: string; project?: Project } | Project;
    const raw = "project" in parsed && parsed.project ? parsed.project : (parsed as Project);
    if (!raw || !Array.isArray(raw.logs) || !Array.isArray(raw.canvases)) {
      throw new Error("Not a JSON Log Explorer project file.");
    }
    const project: Project = {
      ...emptyProject(raw.name || file.name),
      ...raw,
      id: nanoid(),
      updatedAt: Date.now(),
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    };
    await putProject(project);
    await setLastProjectId(project.id);
    const projects = await listProjects();
    set({ project, projects, dirty: false });
  },

  openItem: (item) => {
    patchProject(set, get, (p) => {
      if (item.type === "canvas") {
        const tab: Tab = { id: nanoid(), kind: "canvas", canvasId: item.id };
        return { ...upsertTab(p, tab), lastCanvasId: item.id };
      }
      if (item.type === "view") {
        const tab: Tab = { id: nanoid(), kind: "browser", viewId: item.id };
        return upsertTab(p, tab);
      }
      if (item.type === "settings") {
        return upsertTab(p, { id: nanoid(), kind: "settings" });
      }
      const existing = p.views.find((v) => v.logSetId === item.id);
      if (existing) {
        return upsertTab(p, { id: nanoid(), kind: "browser", viewId: existing.id });
      }
      const view: BrowserView = {
        id: nanoid(),
        name: p.logSets.find((s) => s.id === item.id)?.name ?? "Logs",
        logSetId: item.id,
        columns: suggestColumns(
          inferSchema(p.logs.filter((l) => l.logSetId === item.id)),
          p.logs.filter((l) => l.logSetId === item.id).length,
        ),
        search: "",
        shapeFilter: null,
      };
      return upsertTab({ ...p, views: [...p.views, view] }, { id: nanoid(), kind: "browser", viewId: view.id });
    });
  },

  closeTab: (id) => {
    patchProject(set, get, (p) => {
      const openTabs = p.openTabs.filter((t) => t.id !== id);
      const activeTabId =
        p.activeTabId === id ? (openTabs[openTabs.length - 1]?.id ?? null) : p.activeTabId;
      return { ...p, openTabs, activeTabId };
    });
  },

  setActiveTab: (id) => {
    patchProject(set, get, (p) => {
      const tab = p.openTabs.find((t) => t.id === id);
      const lastCanvasId =
        tab?.kind === "canvas" ? tab.canvasId : p.lastCanvasId;
      return { ...p, activeTabId: id, lastCanvasId };
    });
  },

  createCanvas: (name) => {
    const id = nanoid();
    const count = (get().project?.canvases.length ?? 0) + 1;
    patchProject(set, get, (p) => {
      const canvas: Canvas = {
        id,
        name: name?.trim() || `Canvas ${count}`,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      };
      return upsertTab(
        { ...p, canvases: [...p.canvases, canvas], lastCanvasId: id },
        { id: nanoid(), kind: "canvas", canvasId: id },
      );
    });
    return id;
  },

  renameCanvas: (id, name) => {
    patchProject(set, get, (p) => ({
      ...p,
      canvases: p.canvases.map((c) => (c.id === id ? { ...c, name } : c)),
    }));
  },

  deleteCanvas: (id) => {
    patchProject(set, get, (p) => {
      const canvases = p.canvases.filter((c) => c.id !== id);
      const openTabs = p.openTabs.filter((t) => !(t.kind === "canvas" && t.canvasId === id));
      return {
        ...p,
        canvases,
        openTabs,
        lastCanvasId: p.lastCanvasId === id ? (canvases[0]?.id ?? null) : p.lastCanvasId,
        activeTabId:
          p.openTabs.find((t) => t.id === p.activeTabId && t.kind === "canvas" && t.canvasId === id)
            ? (openTabs[openTabs.length - 1]?.id ?? null)
            : p.activeTabId,
      };
    });
  },

  setCanvasNodes: (canvasId, nodes) => {
    patchProject(set, get, (p) => mapCanvas(p, canvasId, (c) => ({ ...c, nodes })));
  },

  setCanvasEdges: (canvasId, edges) => {
    patchProject(set, get, (p) => mapCanvas(p, canvasId, (c) => ({ ...c, edges })));
  },

  setViewport: (canvasId, viewport) => {
    patchProject(set, get, (p) => mapCanvas(p, canvasId, (c) => ({ ...c, viewport })));
  },

  addLogsToCanvas: (canvasId, logIds, origin) => {
    const project = get().project;
    if (!project) return;
    const canvas = project.canvases.find((c) => c.id === canvasId);
    if (!canvas) return;
    const existing = new Set(
      canvas.nodes.filter((n) => n.type === "log").map((n) => (n.data as { logId: string }).logId),
    );
    const toAdd = logIds.filter((id) => !existing.has(id));
    if (toAdd.length === 0) return;
    const start = origin ?? {
      x: -canvas.viewport.x / (canvas.viewport.zoom || 1) + 80,
      y: -canvas.viewport.y / (canvas.viewport.zoom || 1) + 80,
    };
    const autoPin = project.settings.autoPinCommonFields;
    const nodes: AppNode[] = toAdd.map((logId, i) => {
      const log = project.logs.find((l) => l.id === logId);
      const col = i % 3;
      const row = Math.floor(i / 3);
      return {
        id: nanoid(),
        type: "log",
        position: { x: start.x + col * 340, y: start.y + row * 220 },
        data: {
          kind: "log",
          logId,
          collapsed: true,
          pinnedPaths: autoPin && log ? suggestPins(log.data) : [],
          collapsedPaths: [],
        },
      };
    });
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({ ...c, nodes: [...c.nodes, ...nodes] })),
    );
  },

  addNote: (canvasId, position, color) => {
    const project = get().project;
    const canvas = project?.canvases.find((c) => c.id === canvasId);
    const pos = position ?? {
      x: canvas ? -canvas.viewport.x / (canvas.viewport.zoom || 1) + 120 : 120,
      y: canvas ? -canvas.viewport.y / (canvas.viewport.zoom || 1) + 120 : 120,
    };
    const node: AppNode = {
      id: nanoid(),
      type: "note",
      position: pos,
      data: {
        kind: "note",
        text: "",
        color: color ?? NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)].hex,
      },
      style: { width: 220, height: 160 },
    };
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({ ...c, nodes: [...c.nodes, node] })),
    );
  },

  addBracket: (canvasId, start, end) => {
    const top = Math.min(start.y, end.y);
    const height = Math.max(120, Math.abs(end.y - start.y));
    const x = Math.min(start.x, end.x) - 24;
    const node: AppNode = {
      id: nanoid(),
      type: "bracket",
      position: { x, y: top },
      style: { width: 168, height, overflow: "visible" },
      width: 168,
      height,
      selected: true,
      data: { kind: "bracket", label: "" },
    };
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({
        ...c,
        nodes: [...c.nodes.map((n) => ({ ...n, selected: false })), node],
      })),
    );
  },

  updateNodeData: (canvasId, nodeId, data) => {
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({
        ...c,
        nodes: c.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } as AppNodeData } : n,
        ),
      })),
    );
  },

  connectEdge: (canvasId, connection) => {
    if (!connection.source || !connection.target) return;
    const edge: AppEdge = {
      id: nanoid(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      type: "smoothstep",
      markerEnd: { type: "arrowclosed", width: 16, height: 16 },
      data: { label: "" },
    };
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({
        ...c,
        edges: [...c.edges, edge],
      })),
    );
  },

  updateEdge: (canvasId, edgeId, patch) => {
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({
        ...c,
        edges: c.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
      })),
    );
  },

  createLogSet: (name) => {
    const id = nanoid();
    patchProject(set, get, (p) => ({
      ...p,
      logSets: [...p.logSets, { id, name: name.trim() || "Log set", createdAt: Date.now() }],
    }));
    return id;
  },

  renameLogSet: (id, name) => {
    patchProject(set, get, (p) => ({
      ...p,
      logSets: p.logSets.map((s) => (s.id === id ? { ...s, name } : s)),
    }));
  },

  deleteLogSet: (id) => {
    patchProject(set, get, (p) => {
      const logs = p.logs.filter((l) => l.logSetId !== id);
      const removed = new Set(p.logs.filter((l) => l.logSetId === id).map((l) => l.id));
      const hashIndex = { ...p.hashIndex };
      for (const log of p.logs) {
        if (log.logSetId === id) delete hashIndex[log.hash];
      }
      const views = p.views.filter((v) => v.logSetId !== id);
      const removedViewIds = new Set(p.views.filter((v) => v.logSetId === id).map((v) => v.id));
      return {
        ...p,
        logSets: p.logSets.filter((s) => s.id !== id),
        logs,
        hashIndex,
        views,
        canvases: p.canvases.map((c) => ({
          ...c,
          nodes: c.nodes.filter((n) => n.type !== "log" || !removed.has((n.data as { logId: string }).logId)),
        })),
        openTabs: p.openTabs.filter((t) => !(t.kind === "browser" && removedViewIds.has(t.viewId))),
      };
    });
  },

  importRows: async (logSetId, name, rows, sourceFile) => {
    const project = get().project;
    if (!project) return { added: 0, duplicates: 0, logSetId: "" };
    const setId = logSetId === "new" ? nanoid() : logSetId;
    const { records, duplicates } = await toLogRecords(rows, {
      logSetId: setId,
      sourceFile,
      dedupeMode: project.settings.dedupeMode,
      existingHashes: project.hashIndex,
    });
    const withIds = records.map((r) => ({ ...r, id: nanoid() }));
    patchProject(set, get, (p) => {
      const logSets =
        logSetId === "new"
          ? [...p.logSets, { id: setId, name: name.trim() || sourceFile || "Import", createdAt: Date.now(), sourceFile }]
          : p.logSets.map((s) => (s.id === setId ? { ...s, sourceFile: s.sourceFile ?? sourceFile } : s));
      const hashIndex = { ...p.hashIndex };
      for (const rec of withIds) hashIndex[rec.hash] = rec.id;
      const logs = [...p.logs, ...withIds];
      const fields = inferSchema(logs.filter((l) => l.logSetId === setId));
      let views = p.views;
      const hasView = views.some((v) => v.logSetId === setId);
      if (!hasView) {
        views = [
          ...views,
          {
            id: nanoid(),
            name: logSets.find((s) => s.id === setId)?.name ?? "Imported",
            logSetId: setId,
            columns: suggestColumns(fields, logs.filter((l) => l.logSetId === setId).length),
            search: "",
            shapeFilter: null,
          },
        ];
      } else {
        views = views.map((v) =>
          v.logSetId === setId && v.columns.length === 0
            ? { ...v, columns: suggestColumns(fields, logs.filter((l) => l.logSetId === setId).length) }
            : v,
        );
      }
      const view = views.find((v) => v.logSetId === setId);
      const next = { ...p, logSets, logs, hashIndex, views };
      return view ? upsertTab(next, { id: nanoid(), kind: "browser", viewId: view.id }) : next;
    });
    return { added: withIds.length, duplicates, logSetId: setId };
  },

  removeLogs: (ids) => {
    const drop = new Set(ids);
    patchProject(set, get, (p) => {
      const hashIndex = { ...p.hashIndex };
      for (const log of p.logs) {
        if (drop.has(log.id)) delete hashIndex[log.hash];
      }
      return {
        ...p,
        logs: p.logs.filter((l) => !drop.has(l.id)),
        hashIndex,
        canvases: p.canvases.map((c) => ({
          ...c,
          nodes: c.nodes.filter((n) => n.type !== "log" || !drop.has((n.data as { logId: string }).logId)),
        })),
      };
    });
  },

  setLogNote: (id, note) => {
    patchProject(set, get, (p) => ({
      ...p,
      logs: p.logs.map((l) => (l.id === id ? { ...l, note } : l)),
    }));
  },

  createView: (logSetId, name) => {
    const id = nanoid();
    patchProject(set, get, (p) => {
      const logs =
        logSetId === "all" ? p.logs : p.logs.filter((l) => l.logSetId === logSetId);
      const view: BrowserView = {
        id,
        name: name?.trim() || "New view",
        logSetId,
        columns: suggestColumns(inferSchema(logs), logs.length),
        search: "",
        shapeFilter: null,
      };
      return upsertTab({ ...p, views: [...p.views, view] }, { id: nanoid(), kind: "browser", viewId: id });
    });
    return id;
  },

  updateView: (id, patch) => {
    patchProject(set, get, (p) => ({
      ...p,
      views: p.views.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  },

  deleteView: (id) => {
    patchProject(set, get, (p) => ({
      ...p,
      views: p.views.filter((v) => v.id !== id),
      openTabs: p.openTabs.filter((t) => !(t.kind === "browser" && t.viewId === id)),
    }));
  },

  updateSettings: (patch) => {
    patchProject(set, get, (p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  },
}));
