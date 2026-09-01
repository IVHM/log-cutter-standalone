import { emptyFilter, filterHasClauses } from "./filter";
import type { BrowserView, LogSet, Project } from "./types";
import { DEFAULT_HEADER_COLOR, DEFAULT_HEADER_PATHS } from "./types";

export function normalizeLogSet(set: LogSet): LogSet {
  return {
    ...set,
    headerPaths: Array.isArray(set.headerPaths) && set.headerPaths.length > 0
      ? set.headerPaths.slice(0, 3)
      : [...DEFAULT_HEADER_PATHS],
    headerColor: set.headerColor || DEFAULT_HEADER_COLOR,
  };
}

export function normalizeView(view: BrowserView, fallbackSetId: string): BrowserView {
  const raw = view as BrowserView & { search?: string; logSetId: string | "all" };
  const logSetId = !raw.logSetId || raw.logSetId === "all" ? fallbackSetId : raw.logSetId;
  let filter = view.filter ?? emptyFilter();
  const legacySearch = typeof raw.search === "string" ? raw.search.trim().toLowerCase() : "";
  if (!filterHasClauses(filter) && LEGACY_LEVELS.has(legacySearch)) {
    filter = {
      kind: "group",
      join: "and",
      children: [{ kind: "clause", path: "level", op: "eq", value: legacySearch, valueTo: "" }],
    };
  }
  return {
    id: view.id,
    name: view.name,
    logSetId,
    columns: view.columns ?? [],
    sortBy: view.sortBy,
    filter,
  };
}

const LEGACY_LEVELS = new Set(["error", "warn", "warning", "info", "debug", "fatal", "trace"]);

export function normalizeProject(project: Project): Project {
  const fallbackSetId = project.logSets[0]?.id ?? "";
  return {
    ...project,
    logSets: project.logSets.map(normalizeLogSet),
    views: project.views
      .map((v) => normalizeView(v, fallbackSetId))
      .filter((v) => v.logSetId),
  };
}
