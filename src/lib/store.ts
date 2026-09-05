import { nanoid } from "nanoid";
import { create } from "zustand";
import {
  appendLogs,
  deleteLogs,
  deleteLogsForSource,
  deleteProject as dbDelete,
  getLastProjectId,
  getProject,
  hashesForSource,
  listProjects,
  putLogNote,
  putProjectDoc,
  replaceProject,
  setLastProjectId,
  yieldUi,
  type MigrateProgress,
} from "./db";
import { inferBraceLayout, nextBraceDirection, reorientBracketNode } from "./brace";
import { emptyFilter } from "./filter";
import { hashIndexFromLogs } from "./fields";
import {
  moveCanvasToGroup as placeCanvasInGroup,
  moveSourceToGroup as placeSourceInGroup,
  nextGroupName,
  removeCanvasFromGroups,
  removeSourceFromGroups,
} from "./groups";
import { hashPayload, shapeIdOf } from "./hash";
import { type ParsedRow } from "./import-parse";
import { normalizeProject, projectNormalizedDirty } from "./normalize";
import {
  inferSchema,
  isPlaceholderHeaderPaths,
  mergeSchemaFromLogs,
  schemaForSource,
  suggestColumns,
  suggestHeaderPaths,
  suggestPins,
} from "./schema";
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
import { findWorkingLog, sourceLogCount, sourceLogs } from "./working-logs";

const IMPORT_CHUNK = 400;

export type ProjectSummary = Pick<Project, "id" | "name" | "updatedAt" | "createdAt">;

type Store = {
  hydrated: boolean;
  dirty: boolean;
  saving: boolean;
  migrateProgress: MigrateProgress | null;
  importProgress: MigrateProgress | null;
  project: Project | null;
  projects: ProjectSummary[];
  /** Per-source working set. Import writes here instead of cloning project.logs. */
  logsBySource: Record<string, LogRecord[]>;
  importOpen: boolean;
  importTargetLogSetId: string | "new" | null;
  queuedImportFile: File | null;
  setImportOpen: (open: boolean, target?: string | "new") => void;
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

  createSourceGroup: () => string;
  renameSourceGroup: (id: string, name: string) => void;
  deleteSourceGroup: (id: string) => void;
  moveSourceToGroup: (sourceId: string, groupId: string | null) => void;
  createCanvasGroup: () => string;
  renameCanvasGroup: (id: string, name: string) => void;
  deleteCanvasGroup: (id: string) => void;
  moveCanvasToGroup: (canvasId: string, groupId: string | null) => void;
  createIdLink: (groupId: string, label?: string) => string;
  updateIdLink: (
    groupId: string,
    linkId: string,
    patch: { label?: string; bindings?: Record<string, string> },
  ) => void;
  deleteIdLink: (groupId: string, linkId: string) => void;
  toggleIdField: (sourceId: string, path: string) => void;

  updateSettings: (patch: Partial<ProjectSettings>) => void;
};

export type SidebarTarget =
  | { type: "canvas"; id: string }
  | { type: "view"; id: string }
  | { type: "logSet"; id: string }
  | { type: "sourceGroup"; id: string }
  | { type: "canvasGroup"; id: string }
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
    idFieldPaths: [],
    logCount: 0,
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
    sourceGroups: [],
    canvasGroups: [],
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
    if (t.kind === "sourceGroup" && tab.kind === "sourceGroup") return t.sourceGroupId === tab.sourceGroupId;
    if (t.kind === "canvasGroup" && tab.kind === "canvasGroup") return t.canvasGroupId === tab.canvasGroupId;
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
  hydrated: false,
  dirty: false,
  saving: false,
  migrateProgress: null,
  importProgress: null,
  project: null,
  projects: [],
  logsBySource: {},
  importOpen: false,
  importTargetLogSetId: null,
  queuedImportFile: null,
  setImportOpen: (open, target) =>
    set({
      importOpen: open,
      importTargetLogSetId: open ? (target ?? "new") : null,
    }),
  queueImportFile: (file) => {
    if (!file) {
      set({ queuedImportFile: null });
      return;
    }
    const project = get().project;
    const tab = project?.openTabs.find((t) => t.id === project.activeTabId);
    let target: string | "new" = "new";
    if (tab?.kind === "source" && project) {
      const set = project.logSets.find((s) => s.id === tab.logSetId);
      const empty = set ? sourceLogCount(project, get().logsBySource, set) === 0 : true;
      if (empty) target = tab.logSetId;
    }
    set({ queuedImportFile: file, importOpen: true, importTargetLogSetId: target });
  },

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
      set({
        hydrated: true,
        projects,
        project,
        dirty: false,
        migrateProgress: null,
        importProgress: null,
        logsBySource: {},
      });
    } catch (err) {
      console.warn("Failed to restore projects; starting empty.", err);
      set({
        hydrated: true,
        projects: [],
        project: null,
        dirty: false,
        migrateProgress: null,
        importProgress: null,
        logsBySource: {},
      });
    }
  },

  createProject: async (name) => {
    await get().saveNow();
    const project = emptyProject(name.trim() || "Untitled project");
    const stored = await replaceProject(project);
    await setLastProjectId(stored.id);
    const projects = await listProjects();
    set({ project: stored, projects, dirty: false, logsBySource: {} });
  },

  loadSample: async () => {
    await get().saveNow();
    const project = await replaceProject(await buildSampleProject());
    await setLastProjectId(project.id);
    const projects = await listProjects();
    set({ project, projects, dirty: false, logsBySource: {} });
  },

  openProject: async (id) => {
    await get().saveNow();
    const raw = await getProject(id, (progress) => set({ migrateProgress: progress }));
    set({ migrateProgress: null });
    if (!raw) return;
    const project = normalizeProject(raw);
    if (projectNormalizedDirty(raw, project)) await putProjectDoc(project);
    await setLastProjectId(id);
    set({ project, dirty: false, logsBySource: {} });
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
    set({ project: next ? normalizeProject(next) : null, projects, dirty: false, logsBySource: {} });
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
    set({ project: normalized, projects, dirty: false, logsBySource: {} });
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
      if (item.type === "sourceGroup") {
        return upsertTab(p, { id: nanoid(), kind: "sourceGroup", sourceGroupId: item.id });
      }
      if (item.type === "canvasGroup") {
        return upsertTab(p, { id: nanoid(), kind: "canvasGroup", canvasGroupId: item.id });
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
        canvasGroups: removeCanvasFromGroups(p.canvasGroups ?? [], id),
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
    const cache = get().logsBySource;
    const start = origin ?? {
      x: -canvas.viewport.x / (canvas.viewport.zoom || 1) + 80,
      y: -canvas.viewport.y / (canvas.viewport.zoom || 1) + 80,
    };
    const autoPin = project.settings.autoPinCommonFields;
    const nodes: AppNode[] = toAdd.map((logId, i) => {
      const log = findWorkingLog(project, cache, logId);
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
    patchProject(set, get, (p) =>
      upsertTab(
        {
          ...p,
          logSets: [...p.logSets, emptyLogSet(id, name.trim() || "New source", Date.now())],
        },
        { id: nanoid(), kind: "source", logSetId: id },
      ),
    );
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
    const cached = get().logsBySource[id] ?? [];
    const { [id]: _dropped, ...restCache } = get().logsBySource;
    patchProject(set, get, (p) => {
      const logs = p.logs.filter((l) => l.logSetId !== id);
      const removed = new Set([
        ...p.logs.filter((l) => l.logSetId === id).map((l) => l.id),
        ...cached.map((l) => l.id),
      ]);
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
        sourceGroups: removeSourceFromGroups(p.sourceGroups ?? [], id),
      };
    });
    set({ logsBySource: restCache });
  },

  importRows: async (logSetId, name, rows, sourceFile) => {
    const project = get().project;
    if (!project) return { added: 0, duplicates: 0, logSetId: "" };
    const setId = logSetId === "new" ? nanoid() : logSetId;
    const includeMeta = project.settings.dedupeMode === "payload+meta";
    const dest = project.logSets.find((s) => s.id === setId);
    const seen = await hashesForSource(project.id, setId);
    for (const log of get().logsBySource[setId] ?? []) seen.add(log.hash);
    const priorCount = seen.size;
    const firstPopulate = priorCount === 0;

    let schemaFields = dest?.schemaFields ?? [];
    const hashIndexDelta: Record<string, string> = {};
    let duplicates = 0;
    let added = 0;
    let firstNew: LogRecord | undefined;
    const imported: LogRecord[] = [];

    set({ importProgress: { done: 0, total: rows.length } });
    await yieldUi();

    try {
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const slice = rows.slice(i, i + IMPORT_CHUNK);
        const hashes = await Promise.all(slice.map((row) => hashPayload(row.data, row.meta, includeMeta)));
        const batch: LogRecord[] = [];
        for (let j = 0; j < slice.length; j += 1) {
          const row = slice[j];
          const hash = hashes[j];
          if (seen.has(hash)) {
            duplicates += 1;
            continue;
          }
          seen.add(hash);
          const rec: LogRecord = {
            id: nanoid(),
            logSetId: setId,
            hash,
            data: row.data,
            meta: row.meta,
            note: "",
            shapeId: shapeIdOf(row.data),
            importedAt: Date.now(),
            sourceFile,
          };
          batch.push(rec);
          hashIndexDelta[hash] = rec.id;
          firstNew ??= rec;
        }
        if (batch.length > 0) {
          await appendLogs(project.id, batch);
          schemaFields = mergeSchemaFromLogs(schemaFields, batch);
          added += batch.length;
          imported.push(...batch);
        }
        set({ importProgress: { done: Math.min(i + slice.length, rows.length), total: rows.length } });
        await yieldUi();
      }

      const current = get().project;
      if (!current) return { added, duplicates, logSetId: setId };

      const logSets =
        logSetId === "new"
          ? [...current.logSets, emptyLogSet(setId, name.trim() || sourceFile || "Import", Date.now(), sourceFile)]
          : current.logSets.map((s) => (s.id === setId ? { ...s, sourceFile: s.sourceFile ?? sourceFile } : s));
      const suggested = suggestColumns(schemaFields, priorCount + added);
      const suggestedHeaders = firstPopulate && firstNew ? suggestHeaderPaths(firstNew.data) : [];
      const nextSets = logSets.map((s) =>
        s.id !== setId
          ? s
          : {
              ...s,
              name: firstPopulate && name.trim() ? name.trim() : s.name,
              sourceFile: firstPopulate ? (sourceFile ?? s.sourceFile) : (s.sourceFile ?? sourceFile),
              schemaFields,
              columns: s.columns.length === 0 ? suggested : s.columns,
              headerPaths:
                firstPopulate && suggestedHeaders.length > 0 && isPlaceholderHeaderPaths(s.headerPaths)
                  ? suggestedHeaders
                  : s.headerPaths,
              logCount: priorCount + added,
            },
      );
      const nextProject = upsertTab(
        {
          ...current,
          logSets: nextSets,
          hashIndex: added > 0 ? { ...current.hashIndex, ...hashIndexDelta } : current.hashIndex,
          updatedAt: Date.now(),
        },
        { id: nanoid(), kind: "source", logSetId: setId },
      );
      const nextCache = { ...get().logsBySource };
      if (added > 0) {
        const cached = nextCache[setId];
        if (cached) nextCache[setId] = cached.concat(imported);
        else {
          const fromProject = current.logs.filter((l) => l.logSetId === setId);
          nextCache[setId] = fromProject.length > 0 ? fromProject.concat(imported) : imported;
        }
      }
      set({ project: nextProject, dirty: true, logsBySource: nextCache });
      scheduleSave(get);
      return { added, duplicates, logSetId: setId };
    } finally {
      set({ importProgress: null });
    }
  },

  removeLogs: (ids) => {
    const project = get().project;
    if (project) void deleteLogs(project.id, ids);
    const drop = new Set(ids);
    const cache = get().logsBySource;
    const nextCache: Record<string, LogRecord[]> = {};
    const affected = new Set<string>();
    for (const [sid, logs] of Object.entries(cache)) {
      const kept = logs.filter((l) => !drop.has(l.id));
      if (kept.length !== logs.length) affected.add(sid);
      nextCache[sid] = kept;
    }
    patchProject(set, get, (p) => {
      for (const log of p.logs) {
        if (drop.has(log.id)) affected.add(log.logSetId);
      }
      const logs = p.logs.filter((l) => !drop.has(l.id));
      return {
        ...p,
        logs,
        hashIndex: hashIndexFromLogs(logs),
        logSets: p.logSets.map((s) => {
          if (!affected.has(s.id)) return s;
          const remaining = nextCache[s.id] ?? logs.filter((l) => l.logSetId === s.id);
          return {
            ...s,
            schemaFields: inferSchema(remaining),
            logCount: remaining.length,
          };
        }),
        canvases: p.canvases.map((c) => ({
          ...c,
          nodes: c.nodes.filter((n) => n.type !== "log" || !drop.has((n.data as { logId: string }).logId)),
        })),
      };
    });
    set({ logsBySource: nextCache });
  },

  setLogNote: (id, note) => {
    const { project, logsBySource } = get();
    const log = findWorkingLog(project, logsBySource, id);
    if (project && log) void putLogNote(project.id, { ...log, note });
    patchProject(set, get, (p) => ({
      ...p,
      logs: p.logs.map((l) => (l.id === id ? { ...l, note } : l)),
    }));
    let cacheChanged = false;
    const nextCache: Record<string, LogRecord[]> = {};
    for (const [sid, logs] of Object.entries(logsBySource)) {
      const idx = logs.findIndex((l) => l.id === id);
      if (idx < 0) {
        nextCache[sid] = logs;
        continue;
      }
      cacheChanged = true;
      nextCache[sid] = logs.map((l) => (l.id === id ? { ...l, note } : l));
    }
    if (cacheChanged) set({ logsBySource: nextCache });
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
      const logs = sourceLogs(p, get().logsBySource, logSetId);
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

  createSourceGroup: () => {
    const id = nanoid();
    patchProject(set, get, (p) => {
      const group = {
        id,
        name: nextGroupName(p.sourceGroups ?? []),
        sourceIds: [] as string[],
        idLinks: [],
      };
      return upsertTab(
        { ...p, sourceGroups: [...(p.sourceGroups ?? []), group] },
        { id: nanoid(), kind: "sourceGroup", sourceGroupId: id },
      );
    });
    return id;
  },

  renameSourceGroup: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject(set, get, (p) => ({
      ...p,
      sourceGroups: (p.sourceGroups ?? []).map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
    }));
  },

  deleteSourceGroup: (id) => {
    patchProject(set, get, (p) => {
      const openTabs = p.openTabs.filter((t) => !(t.kind === "sourceGroup" && t.sourceGroupId === id));
      return {
        ...p,
        sourceGroups: (p.sourceGroups ?? []).filter((g) => g.id !== id),
        openTabs,
        activeTabId:
          p.openTabs.find((t) => t.id === p.activeTabId && t.kind === "sourceGroup" && t.sourceGroupId === id)
            ? (openTabs[openTabs.length - 1]?.id ?? null)
            : p.activeTabId,
      };
    });
  },

  moveSourceToGroup: (sourceId, groupId) => {
    patchProject(set, get, (p) => ({
      ...p,
      sourceGroups: placeSourceInGroup(p.sourceGroups ?? [], sourceId, groupId),
    }));
  },

  createCanvasGroup: () => {
    const id = nanoid();
    patchProject(set, get, (p) => {
      const group = {
        id,
        name: nextGroupName(p.canvasGroups ?? []),
        canvasIds: [] as string[],
      };
      return upsertTab(
        { ...p, canvasGroups: [...(p.canvasGroups ?? []), group] },
        { id: nanoid(), kind: "canvasGroup", canvasGroupId: id },
      );
    });
    return id;
  },

  renameCanvasGroup: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchProject(set, get, (p) => ({
      ...p,
      canvasGroups: (p.canvasGroups ?? []).map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
    }));
  },

  deleteCanvasGroup: (id) => {
    patchProject(set, get, (p) => {
      const openTabs = p.openTabs.filter((t) => !(t.kind === "canvasGroup" && t.canvasGroupId === id));
      return {
        ...p,
        canvasGroups: (p.canvasGroups ?? []).filter((g) => g.id !== id),
        openTabs,
        activeTabId:
          p.openTabs.find((t) => t.id === p.activeTabId && t.kind === "canvasGroup" && t.canvasGroupId === id)
            ? (openTabs[openTabs.length - 1]?.id ?? null)
            : p.activeTabId,
      };
    });
  },

  moveCanvasToGroup: (canvasId, groupId) => {
    patchProject(set, get, (p) => ({
      ...p,
      canvasGroups: placeCanvasInGroup(p.canvasGroups ?? [], canvasId, groupId),
    }));
  },

  createIdLink: (groupId, label) => {
    const id = nanoid();
    patchProject(set, get, (p) => ({
      ...p,
      sourceGroups: (p.sourceGroups ?? []).map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              idLinks: [...g.idLinks, { id, label: label?.trim() || "ID", bindings: {} }],
            },
      ),
    }));
    return id;
  },

  updateIdLink: (groupId, linkId, patch) => {
    patchProject(set, get, (p) => {
      const group = (p.sourceGroups ?? []).find((g) => g.id === groupId);
      const current = group?.idLinks.find((l) => l.id === linkId);
      const nextBindings = patch.bindings ?? current?.bindings ?? {};
      const allowed = new Set(group?.sourceIds ?? []);
      const bindings = Object.fromEntries(
        Object.entries(nextBindings).filter(([sid, path]) => allowed.has(sid) && path),
      );
      const logSets = p.logSets.map((s) => {
        const bound = bindings[s.id];
        if (!bound || (s.idFieldPaths ?? []).includes(bound)) return s;
        return { ...s, idFieldPaths: [...(s.idFieldPaths ?? []), bound] };
      });
      return {
        ...p,
        logSets,
        sourceGroups: (p.sourceGroups ?? []).map((g) =>
          g.id !== groupId
            ? g
            : {
                ...g,
                idLinks: g.idLinks.map((l) =>
                  l.id !== linkId
                    ? l
                    : {
                        ...l,
                        label: patch.label !== undefined ? patch.label.trim() || l.label : l.label,
                        bindings,
                      },
                ),
              },
        ),
      };
    });
  },

  deleteIdLink: (groupId, linkId) => {
    patchProject(set, get, (p) => ({
      ...p,
      sourceGroups: (p.sourceGroups ?? []).map((g) =>
        g.id !== groupId ? g : { ...g, idLinks: g.idLinks.filter((l) => l.id !== linkId) },
      ),
    }));
  },

  toggleIdField: (sourceId, path) => {
    patchProject(set, get, (p) => ({
      ...p,
      logSets: p.logSets.map((s) => {
        if (s.id !== sourceId) return s;
        const paths = s.idFieldPaths ?? [];
        const has = paths.includes(path);
        return {
          ...s,
          idFieldPaths: has ? paths.filter((item) => item !== path) : [...paths, path],
        };
      }),
    }));
  },

  updateSettings: (patch) => {
    patchProject(set, get, (p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  },
}));
