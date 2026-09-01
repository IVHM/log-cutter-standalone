import type { Node } from "@xyflow/react";

export type EdgeHandleId = "t" | "r" | "b" | "l";

export function nodeSize(node: Node): { w: number; h: number } {
  return {
    w: node.measured?.width ?? node.width ?? 320,
    h: node.measured?.height ?? node.height ?? 80,
  };
}

export function handleFlowPosition(node: Node, handle: EdgeHandleId): { x: number; y: number } {
  const { w, h } = nodeSize(node);
  const x = node.position.x;
  const y = node.position.y;
  switch (handle) {
    case "t":
      return { x: x + w / 2, y };
    case "r":
      return { x: x + w, y: y + h / 2 };
    case "b":
      return { x: x + w / 2, y: y + h };
    case "l":
      return { x, y: y + h / 2 };
  }
}

/** Closest of the four side midpoints to a flow-space point. */
export function nearestHandle(node: Node, point: { x: number; y: number }): EdgeHandleId {
  const { w, h } = nodeSize(node);
  const x = node.position.x;
  const y = node.position.y;
  const scores: [EdgeHandleId, number][] = [
    ["t", Math.abs(point.y - y) + Math.abs(point.x - (x + w / 2)) * 0.25],
    ["b", Math.abs(point.y - (y + h)) + Math.abs(point.x - (x + w / 2)) * 0.25],
    ["l", Math.abs(point.x - x) + Math.abs(point.y - (y + h / 2)) * 0.25],
    ["r", Math.abs(point.x - (x + w)) + Math.abs(point.y - (y + h / 2)) * 0.25],
  ];
  scores.sort((a, b) => a[1] - b[1]);
  return scores[0][0];
}
