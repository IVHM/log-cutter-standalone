import { Position, type Node } from "@xyflow/react";

/** Three handles per side; `t`/`r`/`b`/`l` stay the center so older arrows still attach. */
export type EdgeHandleId =
  | "t0"
  | "t"
  | "t2"
  | "r0"
  | "r"
  | "r2"
  | "b0"
  | "b"
  | "b2"
  | "l0"
  | "l"
  | "l2";

export type AnchorSpec = {
  id: EdgeHandleId;
  position: Position;
  /** 0–1 along the side (top/bottom = x, left/right = y). */
  along: number;
};

export const EDGE_ANCHORS: AnchorSpec[] = [
  { id: "t0", position: Position.Top, along: 0.25 },
  { id: "t", position: Position.Top, along: 0.5 },
  { id: "t2", position: Position.Top, along: 0.75 },
  { id: "r0", position: Position.Right, along: 0.25 },
  { id: "r", position: Position.Right, along: 0.5 },
  { id: "r2", position: Position.Right, along: 0.75 },
  { id: "b0", position: Position.Bottom, along: 0.25 },
  { id: "b", position: Position.Bottom, along: 0.5 },
  { id: "b2", position: Position.Bottom, along: 0.75 },
  { id: "l0", position: Position.Left, along: 0.25 },
  { id: "l", position: Position.Left, along: 0.5 },
  { id: "l2", position: Position.Left, along: 0.75 },
];

const ANCHOR_BY_ID = Object.fromEntries(EDGE_ANCHORS.map((a) => [a.id, a])) as Record<
  EdgeHandleId,
  AnchorSpec
>;

export function isEdgeHandleId(id: string | null | undefined): id is EdgeHandleId {
  return Boolean(id && id in ANCHOR_BY_ID);
}

export function nodeSize(node: Node): { w: number; h: number } {
  return {
    w: node.measured?.width ?? node.width ?? 320,
    h: node.measured?.height ?? node.height ?? 80,
  };
}

export function handleFlowPosition(node: Node, handle: string | null | undefined): { x: number; y: number } {
  const spec = isEdgeHandleId(handle) ? ANCHOR_BY_ID[handle] : ANCHOR_BY_ID.r;
  const { w, h } = nodeSize(node);
  const x = node.position.x;
  const y = node.position.y;
  switch (spec.position) {
    case Position.Top:
      return { x: x + w * spec.along, y };
    case Position.Right:
      return { x: x + w, y: y + h * spec.along };
    case Position.Bottom:
      return { x: x + w * spec.along, y: y + h };
    case Position.Left:
      return { x, y: y + h * spec.along };
    default:
      return { x: x + w / 2, y: y + h / 2 };
  }
}

/** Closest of the twelve side anchors to a flow-space point. */
export function nearestHandle(node: Node, point: { x: number; y: number }): EdgeHandleId {
  let best: EdgeHandleId = "r";
  let bestDist = Infinity;
  for (const spec of EDGE_ANCHORS) {
    const p = handleFlowPosition(node, spec.id);
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = spec.id;
    }
  }
  return best;
}

export function handleOffsetStyle(spec: AnchorSpec): { left?: string; top?: string } {
  const pct = `${spec.along * 100}%`;
  if (spec.position === Position.Top || spec.position === Position.Bottom) {
    return { left: pct };
  }
  return { top: pct };
}
