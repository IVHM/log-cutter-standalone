import type { AppNode, BraceDirection } from "./types";

const LABEL_SPAN = 168;
const BRACE_THICK = 20;
/** Label chip + brace strip, packed next to each other. */
const HORIZONTAL_THICK = 72;

export function inferBraceLayout(
  start: { x: number; y: number },
  end: { x: number; y: number },
  nodes: AppNode[],
): { direction: BraceDirection; x: number; y: number; width: number; height: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const toward = contentCentroid(nodes) ?? { x: midX + 80, y: midY + 80 };

  if (vertical) {
    const height = Math.max(120, Math.abs(dy));
    const width = LABEL_SPAN;
    const y = Math.min(start.y, end.y);
    const direction: BraceDirection = toward.x >= midX ? "right" : "left";
    const x = direction === "right" ? midX - width + BRACE_THICK : midX - BRACE_THICK;
    return { direction, x, y, width, height };
  }

  const width = Math.max(180, Math.abs(dx));
  const height = HORIZONTAL_THICK;
  const x = Math.min(start.x, end.x);
  const direction: BraceDirection = toward.y >= midY ? "down" : "up";
  const y = direction === "down" ? midY - height + BRACE_THICK : midY - BRACE_THICK;
  return { direction, x, y, width, height };
}

function contentCentroid(nodes: AppNode[]): { x: number; y: number } | null {
  const items = nodes.filter((n) => n.type === "log" || n.type === "note");
  if (items.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const n of items) {
    const w = (n.width as number | undefined) ?? (n.style?.width as number | undefined) ?? 160;
    const h = (n.height as number | undefined) ?? (n.style?.height as number | undefined) ?? 80;
    x += n.position.x + w / 2;
    y += n.position.y + h / 2;
  }
  return { x: x / items.length, y: y / items.length };
}

const CYCLE: BraceDirection[] = ["right", "down", "left", "up"];

export function nextBraceDirection(current: BraceDirection | undefined): BraceDirection {
  const i = CYCLE.indexOf(current ?? "right");
  return CYCLE[(i + 1) % CYCLE.length];
}

export function rotatedBraceBox(
  position: { x: number; y: number },
  width: number,
  height: number,
  from: BraceDirection,
  to: BraceDirection,
): { x: number; y: number; width: number; height: number } {
  const cx = position.x + width / 2;
  const cy = position.y + height / 2;
  const fromVertical = from === "left" || from === "right";
  const toVertical = to === "left" || to === "right";
  if (fromVertical === toVertical) {
    return { x: position.x, y: position.y, width, height };
  }
  if (toVertical) {
    const w = LABEL_SPAN;
    const h = Math.max(120, width);
    return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  }
  const w = Math.max(180, height);
  const h = HORIZONTAL_THICK;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

export function reorientBracketNode(node: AppNode, to: BraceDirection): AppNode {
  if (node.type !== "bracket" || node.data.kind !== "bracket") return node;
  const from = node.data.direction ?? "right";
  if (from === to) return node;
  const width =
    (node.width as number | undefined) ?? (node.style?.width as number | undefined) ?? 168;
  const height =
    (node.height as number | undefined) ?? (node.style?.height as number | undefined) ?? 120;
  const box = rotatedBraceBox(node.position, width, height, from, to);
  return {
    ...node,
    position: { x: box.x, y: box.y },
    width: box.width,
    height: box.height,
    style: { ...node.style, width: box.width, height: box.height, overflow: "visible" },
    data: { ...node.data, direction: to },
  };
}
