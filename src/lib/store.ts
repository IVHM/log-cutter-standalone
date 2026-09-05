import { nanoid } from "nanoid";
import { create } from "zustand";
import {
  appendLogs,
  deleteLogs,
  deleteLogsForSource,
  deleteProject as dbDelete,
  getLastProjectId,
  getProject,
  listProjects,
  putLogNote,
  putProjectDoc,
  replaceProject,
  setLastProjectId,
  type MigrateProgress,
} from "./db";
import { inferBraceLayout, nextBraceDirection, reorientBracketNode } from "./brace";
import { emptyFilter } from "./filter";
import { hashIndexFromLogs } from "./fields";
import { toLogRecords, type ParsedRow } from "./import-parse";
import { normalizeProject, projectNormalizedDirty } from "./normalize";
import { inferSchema, mergeSchemaFromLogs, schemaForSource, suggestColumns, suggestPins } from "./schema";
import { buildSampleProject } from "./sample";
import type {
  AppEdge,
  AppNode,
  AppNodeData,
  BraceDirection,
  BrowserView,
  Canvas,
  EdgeConnection,
  LogSet,
  LogRecord,
  Project,
  ProjectSettings,
  Tab,
  Viewport,
} from "./types";
import { DEFAULT_HEADER_COLOR, DEFAULT_HEADER_PATHS, DEFAULT_SETTINGS, NOTE_COLORS, SCHEMA_VERSION } from "./types";

export type ProjectSummary = Pick<Project, "id" | "name" | "updatedAt" | "createdAt">;

type Store = {
  hydrated: boolean;
  dirty: boolean;
  saving: boolean;
  migrateProgress: MigrateProgress | null;
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
  rotateBracket: (canvasId: string, nodeId: string) => void;
  setBracketDirection: (canvasId: string, nodeId: string, direction: BraceDirection) => void;
  updateNodeData: (canvasId: string, nodeId: string, data: Partial<AppNodeData>) => void;
  connectEdge: (canvasId: string, connection: EdgeConnection) => void;
  updateEdge: (canvasId: string, edgeId: string, patch: Partial<AppEdge>) => void;

  createLogSet: (name: string) => string;
  renameLogSet: (id: string, name: string) => void;
  updateLogSet: (id: string, patch: Partial<LogSet>) => void;
  deleteLogSet: (id: string) => void;
  importRows: (
    logSetId: string | "new",
    name: string,
    rows: ParsedRow[],
    sourceFile?: string,
  ) => Promise<{ added: number; duplicates: number; logSetId: string }>;
  removeLogs: (ids: string[]) => void;
  setLogNote: (id: string, note: string) => void;
  ensureWorkingLogs: (logs: LogRecord[]) => void;

  createView: (logSetId: string, name?: string) => string;
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

function emptyLogSet(id: string, name: string, now: number, sourceFile?: string): LogSet {
  return {
    id,
    name,
    createdAt: now,
    sourceFile,
    headerPaths: [...DEFAULT_HEADER_PATHS],
    headerColor: DEFAULT_HEADER_COLOR,
    columns: [],
    defaultPinnedPaths: [],
    hiddenPaths: [],
    schemaFields: [],
  };
}

function emptyProject(name: string): Project {
  const now = Date.now();
  const canvasId = nanoid();
  const logSetId = nanoid();
  const canvasTabId = nanoid();
  return {
    id: nanoid(),
    name,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    logSets: [emptyLogSet(logSetId, "Logs", now)],
    logs: [],
    hashIndex: {},
    views: [],
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
    openTabs: [{ id: canvasTabId, kind: "canvas", canvasId }],
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
    if (t.kind === "source" && tab.kind === "source") return t.logSetId === tab.logSetId;
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
  migrateProgress: null,
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
      const loaded = openId
        ? ((await getProject(openId, (progress) => set({ migrateProgress: progress }))) ?? null)
        : null;
      const project = loaded ? normalizeProject(loaded) : null;
      if (loaded && project && projectNormalizedDirty(loaded, project)) {
        await putProjectDoc(project);
      }
      set({ hydrated: true, projects, project, dirty: false, migrateProgress: null });
    } catch (err) {
      console.warn("Failed to restore projects; starting empty.", err);
      set({ hydrated: true, projects: [], project: null, dirty: false, migrateProgress: null });
    }
  },

  createProject: async (name) => {
    await get().saveNow();
    const project = emptyProject(name.trim() || "Untitled project");
    const stored = await replaceProject(project);
    await setLastProjectId(stored.id);
    const projects = await listProjects();
    set({ project: stored, projects, dirty: false });
  },

  loadSample: async () => {
    await get().saveNow();
    const project = await replaceProject(await buildSampleProject());
    await setLastProjectId(project.id);
    const projects = await listProjects();
    set({ project, projects, dirty: false });
  },

  openProject: async (id) => {
    await get().saveNow();
    const raw = await getProject(id, (progress) => set({ migrateProgress: progress }));
    set({ migrateProgress: null });
    if (!raw) return;
    const project = normalizeProject(raw);
    if (projectNormalizedDirty(raw, project)) await putProjectDoc(project);
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
    set({ project: next ? normalizeProject(next) : null, projects, dirty: false });
  },

  saveNow: async () => {
    const { project, dirty } = get();
    if (!project || !dirty) return;
    set({ saving: true });
    try {
      await putProjectDoc(project);
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
    const { hashIndex: _hashIndex, ...rest } = project;
    const payload = {
      format: "json-log-explorer",
      version: 2,
      project: rest,
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
      throw new Error("Not a LogSplitter project file.");
    }
    const project: Project = {
      ...emptyProject(raw.name || file.name),
      ...raw,
      id: nanoid(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION,
      hashIndex: hashIndexFromLogs(raw.logs ?? []),
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
    };
    const normalized = await replaceProject(normalizeProject(project));
    await setLastProjectId(normalized.id);
    const projects = await listProjects();
    set({ project: normalized, projects, dirty: false });
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
      return upsertTab(p, { id: nanoid(), kind: "source", logSetId: item.id });
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
      const source = log ? project.logSets.find((s) => s.id === log.logSetId) : undefined;
      const sourcePins = source?.defaultPinnedPaths ?? [];
      const pinnedPaths =
        sourcePins.length > 0
          ? [...sourcePins]
          : autoPin && log
            ? suggestPins(log.data)
            : [];
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
          pinnedPaths,
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
    const project = get().project;
    const canvas = project?.canvases.find((c) => c.id === canvasId);
    const layout = inferBraceLayout(start, end, canvas?.nodes ?? []);
    const node: AppNode = {
      id: nanoid(),
      type: "bracket",
      position: { x: layout.x, y: layout.y },
      style: { width: layout.width, height: layout.height, overflow: "visible" },
      width: layout.width,
      height: layout.height,
      selected: true,
      data: { kind: "bracket", label: "", direction: layout.direction },
    };
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({
        ...c,
        nodes: [...c.nodes.map((n) => ({ ...n, selected: false })), node],
      })),
    );
  },

  rotateBracket: (canvasId, nodeId) => {
    const node = get().project?.canvases.find((c) => c.id === canvasId)?.nodes.find((n) => n.id === nodeId);
    const from = node?.data.kind === "bracket" ? (node.data.direction ?? "right") : "right";
    get().setBracketDirection(canvasId, nodeId, nextBraceDirection(from));
  },

  setBracketDirection: (canvasId, nodeId, direction) => {
    patchProject(set, get, (p) =>
      mapCanvas(p, canvasId, (c) => ({
        ...c,
        nodes: c.nodes.map((n) => (n.id === nodeId ? reorientBracketNode(n, direction) : n)),
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
      logSets: [...p.logSets, emptyLogSet(id, name.trim() || "Source", Date.now())],
    }));
    return id;
  },

  renameLogSet: (id, name) => {
    patchProject(set, get, (p) => ({
      ...p,
      logSets: p.logSets.map((s) => (s.id === id ? { ...s, name } : s)),
    }));
  },

  updateLogSet: (id, patch) => {
    patchProject(set, get, (p) => ({
      ...p,
      logSets: p.logSets.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  },

  deleteLogSet: (id) => {
    const project = get().project;
    if (project) void deleteLogsForSource(project.id, id);
    patchProject(set, get, (p) => {
      const logs = p.logs.filter((l) => l.logSetId !== id);
      const removed = new Set(p.logs.filter((l) => l.logSetId === id).map((l) => l.id));
      const views = p.views.filter((v) => v.logSetId !== id);
      const removedViewIds = new Set(p.views.filter((v) => v.logSetId === id).map((v) => v.id));
      return {
        ...p,
        logSets: p.logSets.filter((s) => s.id !== id),
        logs,
        hashIndex: hashIndexFromLogs(logs),
        views,
        canvases: p.canvases.map((c) => ({
          ...c,
          nodes: c.nodes.filter((n) => n.type !== "log" || !removed.has((n.data as { logId: string }).logId)),
        })),
        openTabs: p.openTabs.filter(
          (t) =>
            !(t.kind === "browser" && removedViewIds.has(t.viewId)) &&
            !(t.kind === "source" && t.logSetId === id),
        ),
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
    await appendLogs(project.id, withIds);
    patchProject(set, get, (p) => {
      const logSets =
        logSetId === "new"
          ? [...p.logSets, emptyLogSet(setId, name.trim() || sourceFile || "Import", Date.now(), sourceFile)]
          : p.logSets.map((s) => (s.id === setId ? { ...s, sourceFile: s.sourceFile ?? sourceFile } : s));
      const hashIndex = { ...p.hashIndex };
      for (const rec of withIds) hashIndex[rec.hash] = rec.id;
      const logs = [...p.logs, ...withIds];
      const setLogs = logs.filter((l) => l.logSetId === setId);
      const existing = logSets.find((s) => s.id === setId);
      const schemaFields = mergeSchemaFromLogs(existing?.schemaFields ?? [], withIds);
      const suggested = suggestColumns(schemaFields, setLogs.length);
      const nextSets = logSets.map((s) =>
        s.id !== setId
          ? s
          : {
              ...s,
              schemaFields,
              columns: s.columns.length === 0 ? suggested : s.columns,
            },
      );
      return upsertTab(
        { ...p, logSets: nextSets, logs, hashIndex },
        { id: nanoid(), kind: "source", logSetId: setId },
      );
    });
    return { added: withIds.length, duplicates, logSetId: setId };
  },

  removeLogs: (ids) => {
    const project = get().project;
    if (project) void deleteLogs(project.id, ids);
    const drop = new Set(ids);
    patchProject(set, get, (p) => {
      const affected = new Set(p.logs.filter((l) => drop.has(l.id)).map((l) => l.logSetId));
      const logs = p.logs.filter((l) => !drop.has(l.id));
      return {
        ...p,
        logs,
        hashIndex: hashIndexFromLogs(logs),
        logSets: p.logSets.map((s) =>
          affected.has(s.id)
            ? { ...s, schemaFields: inferSchema(logs.filter((l) => l.logSetId === s.id)) }
            : s,
        ),
        canvases: p.canvases.map((c) => ({
          ...c,
          nodes: c.nodes.filter((n) => n.type !== "log" || !drop.has((n.data as { logId: string }).logId)),
        })),
      };
    });
  },

  setLogNote: (id, note) => {
    const project = get().project;
    const log = project?.logs.find((l) => l.id === id);
    if (project && log) void putLogNote(project.id, { ...log, note });
    patchProject(set, get, (p) => ({
      ...p,
      logs: p.logs.map((l) => (l.id === id ? { ...l, note } : l)),
    }));
  },

  ensureWorkingLogs: (logs) => {
    const project = get().project;
    if (!project || logs.length === 0) return;
    const have = new Set(project.logs.map((l) => l.id));
    const extra = logs.filter((l) => !have.has(l.id));
    if (extra.length === 0) return;
    set({
      project: {
        ...project,
        logs: [...project.logs, ...extra],
        hashIndex: { ...project.hashIndex, ...hashIndexFromLogs(extra) },
      },
    });
  },

  createView: (logSetId, name) => {
    const id = nanoid();
    patchProject(set, get, (p) => {
      const logs = p.logs.filter((l) => l.logSetId === logSetId);
      const set = p.logSets.find((s) => s.id === logSetId);
      const view: BrowserView = {
        id,
        name: name?.trim() || (set?.name ? `${set.name} view` : "New view"),
        logSetId,
        columns: suggestColumns(schemaForSource(set, logs), logs.length),
        filter: emptyFilter(),
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
