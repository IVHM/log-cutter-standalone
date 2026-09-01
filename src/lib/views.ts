import type { BrowserView, LogRecord } from "./types";

export function logsInView(logs: LogRecord[], view: BrowserView): LogRecord[] {
  const scoped =
    view.logSetId === "all" ? logs : logs.filter((l) => l.logSetId === view.logSetId);
  const q = view.search.trim().toLowerCase();
  return scoped.filter((log) => {
    if (view.shapeFilter && log.shapeId !== view.shapeFilter) return false;
    if (!q) return true;
    const blob =
      `${JSON.stringify(log.data)} ${JSON.stringify(log.meta)} ${log.note} ${log.hash}`.toLowerCase();
    return blob.includes(q);
  });
}
