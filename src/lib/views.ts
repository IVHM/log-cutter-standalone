import { emptyFilter, matchFilter } from "./filter";
import type { BrowserView, FilterGroup, LogRecord } from "./types";

export function logsInView(
  logs: LogRecord[],
  view: BrowserView,
  search = "",
): LogRecord[] {
  const scoped = logs.filter((l) => l.logSetId === view.logSetId);
  const q = search.trim().toLowerCase();
  return scoped.filter((log) => {
    if (!matchFilter(log, view.filter ?? emptyFilter())) return false;
    if (!q) return true;
    const blob = `${JSON.stringify(log.data)} ${JSON.stringify(log.meta)} ${log.note}`.toLowerCase();
    return blob.includes(q);
  });
}

export function viewFilter(view: BrowserView): FilterGroup {
  return view.filter ?? emptyFilter();
}
