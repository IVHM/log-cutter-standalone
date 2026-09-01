import type { AppNode, BraceDirection } from "./types";

const LABEL_SPAN = 168;
const BRACE_THICK = 20;

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
  const height = 56;
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
  const w = fromVertical === toVertical ? width : Math.max(toVertical ? 140 : 180, height);
  const h = fromVertical === toVertical ? height : Math.max(toVertical ? 120 : 56, width);
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}
