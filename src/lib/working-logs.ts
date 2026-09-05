import type { LogRecord, LogSet, Project } from "./types";

/** Prefer the per-source import cache; otherwise the hydrated working set. */
export function sourceLogs(
  project: Project | null | undefined,
  cache: Record<string, LogRecord[]>,
  sourceId: string | undefined,
): LogRecord[] {
  if (!sourceId) return [];
  if (cache[sourceId]) return cache[sourceId];
  if (!project) return [];
  return project.logs.filter((log) => log.logSetId === sourceId);
}

export function findWorkingLog(
  project: Project | null | undefined,
  cache: Record<string, LogRecord[]>,
  logId: string,
): LogRecord | undefined {
  for (const logs of Object.values(cache)) {
    const hit = logs.find((log) => log.id === logId);
    if (hit) return hit;
  }
  return project?.logs.find((log) => log.id === logId);
}

export function sourceLogCount(
  project: Project | null | undefined,
  cache: Record<string, LogRecord[]>,
  set: LogSet,
): number {
  if (typeof set.logCount === "number") return set.logCount;
  return sourceLogs(project, cache, set.id).length;
}

/** Legacy sources omit indexedCount and are treated as ready. */
export function sourceIndexReady(set: LogSet | undefined): boolean {
  if (!set) return true;
  if (set.indexedCount == null) return true;
  return set.indexedCount >= (set.logCount ?? 0);
}

export function workingLogTotal(
  project: Project | null | undefined,
  cache: Record<string, LogRecord[]>,
): number {
  if (!project) return 0;
  const cachedIds = new Set(Object.keys(cache));
  if (cachedIds.size === 0) return project.logs.length;
  let n = 0;
  for (const logs of Object.values(cache)) n += logs.length;
  for (const log of project.logs) {
    if (!cachedIds.has(log.logSetId)) n += 1;
  }
  return n;
}
