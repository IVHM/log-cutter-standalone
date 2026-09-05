import { toSchemaPath } from "./json-path";
import type { CanvasGroup, IdLink, Project, SourceGroup } from "./types";

const ID_LEAF =
  /(_id$|^id$|^uuid$|^guid$|^request_id$|^trace_id$|^correlation_id$|^span_id$|^session_id$|^order_id$)/i;

export function nextGroupName(existing: { name: string }[]): string {
  const used = new Set(existing.map((g) => g.name.trim().toLowerCase()));
  for (let i = 1; i < 10000; i += 1) {
    const name = `Group${String(i).padStart(3, "0")}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return `Group${Date.now()}`;
}

export function otherPoolNameCandidates(
  thisPool: { name: string }[],
  otherPool: { name: string }[],
  query: string,
): string[] {
  const used = new Set(thisPool.map((g) => g.name.trim().toLowerCase()));
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of otherPool) {
    const name = group.name.trim();
    const key = name.toLowerCase();
    if (!name || used.has(key) || seen.has(key)) continue;
    if (q && !key.includes(q)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function looksLikeIdPath(path: string): boolean {
  const leaf = path.split(".").pop()?.replace(/\[\]/g, "") ?? "";
  return ID_LEAF.test(leaf);
}

export function sourceGroupOf(project: Project, sourceId: string): SourceGroup | undefined {
  return project.sourceGroups.find((g) => g.sourceIds.includes(sourceId));
}

export function canvasGroupOf(project: Project, canvasId: string): CanvasGroup | undefined {
  return project.canvasGroups.find((g) => g.canvasIds.includes(canvasId));
}

export function idLinkForPath(
  project: Project,
  sourceId: string,
  path: string,
): { group: SourceGroup; link: IdLink } | undefined {
  const group = sourceGroupOf(project, sourceId);
  if (!group) return undefined;
  const want = toSchemaPath(path);
  const link = group.idLinks.find((item) => toSchemaPath(item.bindings[sourceId] ?? "") === want);
  return link ? { group, link } : undefined;
}

export function normalizeSourceGroups(
  groups: SourceGroup[] | undefined,
  sourceIds: Set<string>,
): SourceGroup[] {
  const claimed = new Set<string>();
  return (groups ?? []).map((group) => {
    const ids = [...new Set(group.sourceIds ?? [])].filter((id) => sourceIds.has(id) && !claimed.has(id));
    for (const id of ids) claimed.add(id);
    return {
      id: group.id,
      name: group.name?.trim() || "Group",
      sourceIds: ids,
      idLinks: (group.idLinks ?? []).map((link) => ({
        id: link.id,
        label: link.label?.trim() || "ID",
        bindings: Object.fromEntries(
          Object.entries(link.bindings ?? {}).filter(([sid, path]) => ids.includes(sid) && Boolean(path)),
        ),
      })),
    };
  });
}

export function normalizeCanvasGroups(
  groups: CanvasGroup[] | undefined,
  canvasIds: Set<string>,
): CanvasGroup[] {
  const claimed = new Set<string>();
  return (groups ?? []).map((group) => {
    const ids = [...new Set(group.canvasIds ?? [])].filter((id) => canvasIds.has(id) && !claimed.has(id));
    for (const id of ids) claimed.add(id);
    return {
      id: group.id,
      name: group.name?.trim() || "Group",
      canvasIds: ids,
    };
  });
}

export function removeSourceFromGroups(groups: SourceGroup[], sourceId: string): SourceGroup[] {
  return groups.map((group) => ({
    ...group,
    sourceIds: group.sourceIds.filter((id) => id !== sourceId),
    idLinks: group.idLinks.map((link) => {
      const { [sourceId]: _dropped, ...bindings } = link.bindings;
      return { ...link, bindings };
    }),
  }));
}

export function removeCanvasFromGroups(groups: CanvasGroup[], canvasId: string): CanvasGroup[] {
  return groups.map((group) => ({
    ...group,
    canvasIds: group.canvasIds.filter((id) => id !== canvasId),
  }));
}

export function moveSourceToGroup(groups: SourceGroup[], sourceId: string, groupId: string | null): SourceGroup[] {
  return groups.map((group) => {
    const sourceIds = group.sourceIds.filter((id) => id !== sourceId);
    const dropped = sourceIds.length !== group.sourceIds.length;
    const idLinks = dropped
      ? group.idLinks.map((link) => {
          const next = { ...link.bindings };
          delete next[sourceId];
          return { ...link, bindings: next };
        })
      : group.idLinks;
    if (group.id === groupId) {
      return { ...group, sourceIds: [...sourceIds, sourceId], idLinks };
    }
    return { ...group, sourceIds, idLinks };
  });
}

export function moveCanvasToGroup(groups: CanvasGroup[], canvasId: string, groupId: string | null): CanvasGroup[] {
  return groups.map((group) => {
    const canvasIds = group.canvasIds.filter((id) => id !== canvasId);
    if (group.id === groupId) return { ...group, canvasIds: [...canvasIds, canvasId] };
    return { ...group, canvasIds };
  });
}
