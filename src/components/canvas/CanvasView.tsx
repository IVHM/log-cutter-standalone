"use client";

import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  ViewportPortal,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import {
  ArrowRight,
  Braces,
  MousePointer2,
  Plus,
  Slash,
  Spline,
  StickyNote,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddLogsDialog } from "@/components/canvas/AddLogsDialog";
import { Button } from "@/components/ui/button";
import { handleFlowPosition, nearestHandle, type EdgeHandleId } from "@/lib/arrow-anchor";
import { useProjectStore } from "@/lib/store";
import type { AppEdge, AppNode } from "@/lib/types";
import { BracketNode } from "./BracketNode";
import {
  CanvasArrowContext,
  CanvasIdContext,
  type ArrowEndpoint,
  type CanvasTool,
} from "./canvas-context";
import { LabeledEdge } from "./LabeledEdge";
import { LogNode } from "./LogNode";
import { NoteNode } from "./NoteNode";

import "@xyflow/react/dist/style.css";

const nodeTypes = { log: LogNode, note: NoteNode, bracket: BracketNode };
const edgeTypes = {
  default: LabeledEdge,
  smoothstep: LabeledEdge,
  straight: LabeledEdge,
  bezier: LabeledEdge,
};

type EdgeStyle = "smoothstep" | "default" | "straight";

type Props = { canvasId: string };

export function CanvasView({ canvasId }: Props) {
  return (
    <ReactFlowProvider>
      <CanvasIdContext.Provider value={canvasId}>
        <CanvasInner canvasId={canvasId} />
      </CanvasIdContext.Provider>
    </ReactFlowProvider>
  );
}

function CanvasInner({ canvasId }: Props) {
  const canvas = useProjectStore((s) => s.project?.canvases.find((c) => c.id === canvasId));
  const settings = useProjectStore((s) => s.project?.settings);
  const setCanvasNodes = useProjectStore((s) => s.setCanvasNodes);
  const setCanvasEdges = useProjectStore((s) => s.setCanvasEdges);
  const setViewport = useProjectStore((s) => s.setViewport);
  const connectEdge = useProjectStore((s) => s.connectEdge);
  const addNote = useProjectStore((s) => s.addNote);
  const addBracket = useProjectStore((s) => s.addBracket);
  const updateEdge = useProjectStore((s) => s.updateEdge);
  const { screenToFlowPosition } = useReactFlow();
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>("smoothstep");
  const [tool, setTool] = useState<CanvasTool>("select");
  const [arrowStart, setArrowStart] = useState<{ nodeId: string; handle: EdgeHandleId } | null>(null);
  const [arrowCursor, setArrowCursor] = useState<{ x: number; y: number } | null>(null);
  const [reconnect, setReconnect] = useState<{ edgeId: string; end: ArrowEndpoint } | null>(null);
  const [bracketStart, setBracketStart] = useState<{ x: number; y: number } | null>(null);
  const [bracketCursor, setBracketCursor] = useState<{ x: number; y: number } | null>(null);
  const [addLogsOpen, setAddLogsOpen] = useState(false);
  const activeEdgeIds = useRef<string[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setTool("select");
        setArrowStart(null);
        setArrowCursor(null);
        setReconnect(null);
        setBracketStart(null);
        setBracketCursor(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
      if (!current) return;
      setCanvasNodes(canvasId, applyNodeChanges(changes, current.nodes) as AppNode[]);
    },
    [canvasId, setCanvasNodes],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<AppEdge>[]) => {
      const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
      if (!current) return;
      setCanvasEdges(canvasId, applyEdgeChanges(changes, current.edges) as AppEdge[]);
    },
    [canvasId, setCanvasEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      connectEdge(canvasId, connection);
      const last = useProjectStore
        .getState()
        .project?.canvases.find((x) => x.id === canvasId)
        ?.edges.at(-1);
      if (last) {
        updateEdge(canvasId, last.id, {
          type: edgeStyle,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        });
      }
    },
    [canvasId, connectEdge, edgeStyle, updateEdge],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: edgeStyle,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }),
    [edgeStyle],
  );

  const finishArrow = useCallback(
    (source: { nodeId: string; handle: EdgeHandleId }, target: { nodeId: string; handle: EdgeHandleId }) => {
      if (source.nodeId === target.nodeId && source.handle === target.handle) return;
      connectEdge(canvasId, {
        source: source.nodeId,
        target: target.nodeId,
        sourceHandle: source.handle,
        targetHandle: target.handle,
      });
      const last = useProjectStore
        .getState()
        .project?.canvases.find((x) => x.id === canvasId)
        ?.edges.at(-1);
      if (last) {
        updateEdge(canvasId, last.id, {
          type: edgeStyle,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        });
      }
      setArrowStart(null);
      setArrowCursor(null);
      setTool("select");
    },
    [canvasId, connectEdge, edgeStyle, updateEdge],
  );

  const completeReconnect = useCallback(
    (nodeId: string, handle: EdgeHandleId) => {
      if (!reconnect) return;
      const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
      const edge = current?.edges.find((e) => e.id === reconnect.edgeId);
      if (!edge) {
        setReconnect(null);
        setArrowCursor(null);
        return;
      }
      const patch =
        reconnect.end === "source"
          ? { source: nodeId, sourceHandle: handle }
          : { target: nodeId, targetHandle: handle };
      updateEdge(canvasId, edge.id, patch);
      setReconnect(null);
      setArrowCursor(null);
    },
    [canvasId, reconnect, updateEdge],
  );

  const onAnchorClick = useCallback(
    (nodeId: string, handle: EdgeHandleId) => {
      if (reconnect) {
        completeReconnect(nodeId, handle);
        return;
      }
      if (tool !== "arrow") return;
      if (!arrowStart) {
        setArrowStart({ nodeId, handle });
        toast.message("Click an anchor on the destination card.");
        return;
      }
      finishArrow(arrowStart, { nodeId, handle });
    },
    [arrowStart, completeReconnect, finishArrow, reconnect, tool],
  );

  const onEndpointClick = useCallback(
    (edgeId: string, end: ArrowEndpoint) => {
      const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
      if (!current) return;
      const edge = current.edges.find((e) => e.id === edgeId);
      setCanvasEdges(
        canvasId,
        current.edges.map((e) => ({ ...e, selected: e.id === edgeId })),
      );
      setCanvasNodes(
        canvasId,
        current.nodes.map((n) => ({ ...n, selected: false })),
      );
      setArrowStart(null);
      setTool("select");
      if (edge) {
        const movingNodeId = end === "source" ? edge.source : edge.target;
        const movingHandle = end === "source" ? edge.sourceHandle : edge.targetHandle;
        const movingNode = current.nodes.find((n) => n.id === movingNodeId);
        if (movingNode) setArrowCursor(handleFlowPosition(movingNode, movingHandle));
      }
      setReconnect({ edgeId, end });
      toast.message("Click a new anchor for this end.");
    },
    [canvasId, setCanvasEdges, setCanvasNodes],
  );

  const applyEdgeStyle = useCallback(
    (style: EdgeStyle) => {
      const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
      const selectedIds = current?.edges.filter((e) => e.selected).map((e) => e.id) ?? [];
      if (selectedIds.length === 0) {
        setEdgeStyle(style);
        return;
      }
      setEdgeStyle(style);
      for (const id of selectedIds) {
        updateEdge(canvasId, id, { type: style });
      }
    },
    [canvasId, updateEdge],
  );

  const selectOnlyEdge = useCallback(
    (edgeId: string) => {
      const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
      if (!current) return;
      activeEdgeIds.current = [edgeId];
      setCanvasEdges(
        canvasId,
        current.edges.map((e) => ({ ...e, selected: e.id === edgeId })),
      );
      setCanvasNodes(
        canvasId,
        current.nodes.map((n) => ({ ...n, selected: false })),
      );
      const next = normalizeEdgeStyle(current.edges.find((e) => e.id === edgeId)?.type);
      if (next) setEdgeStyle(next);
    },
    [canvasId, setCanvasEdges, setCanvasNodes],
  );

  const selectedEdge = canvas?.edges.find((e) => e.selected);
  const highlightedStyle = selectedEdge ? normalizeEdgeStyle(selectedEdge.type) : null;
  useEffect(() => {
    if (!selectedEdge) {
      activeEdgeIds.current = [];
      return;
    }
    activeEdgeIds.current = [selectedEdge.id];
    const next = normalizeEdgeStyle(selectedEdge.type);
    if (next) setEdgeStyle(next);
  }, [selectedEdge?.id, selectedEdge?.type]);

  if (!canvas) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This canvas was removed.
      </div>
    );
  }

  const placing = tool !== "select" || Boolean(reconnect);
  const showAnchors = tool === "arrow" || Boolean(reconnect);
  const guideStart = reconnect
    ? reconnectFixedPosition(canvas.nodes, canvas.edges, reconnect)
    : arrowStart
      ? (() => {
          const node = canvas.nodes.find((n) => n.id === arrowStart.nodeId);
          return node ? handleFlowPosition(node, arrowStart.handle) : null;
        })()
      : null;
  const showGuide = Boolean(guideStart && arrowCursor && (arrowStart || reconnect));

  return (
    <CanvasArrowContext.Provider
      value={{
        tool,
        showAnchors,
        reconnectingEdgeId: reconnect?.edgeId ?? null,
        onAnchorClick,
        onEndpointClick,
      }}
    >
    <div className="h-full w-full">
      <ReactFlow
        nodes={canvas.nodes}
        edges={canvas.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={() => true}
        nodesConnectable={showAnchors}
        elementsSelectable
        connectionLineStyle={{
          stroke: "#7dd3fc",
          strokeWidth: 1.75,
          strokeDasharray: "7 5",
        }}
        defaultEdgeOptions={defaultEdgeOptions}
        defaultViewport={canvas.viewport}
        onMoveEnd={(_, vp) => setViewport(canvasId, vp)}
        fitView={canvas.nodes.length > 0 && canvas.viewport.x === 0 && canvas.viewport.y === 0 && canvas.viewport.zoom === 1}
        selectionOnDrag={!placing}
        panOnDrag={[1, 2]}
        panOnScroll={false}
        zoomOnScroll
        zoomActivationKeyCode="Control"
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag={!placing}
        nodesDraggable={tool !== "arrow"}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={["Backspace", "Delete"]}
        snapToGrid={settings?.snapToGrid}
        snapGrid={[settings?.gridSize ?? 16, settings?.gridSize ?? 16]}
        minZoom={0.15}
        maxZoom={2.5}
        colorMode="dark"
        className={showAnchors ? "drawing-arrow" : undefined}
        proOptions={{ hideAttribution: true }}
        onPaneContextMenu={(e) => e.preventDefault()}
        onPointerMove={(e) => {
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          if (tool === "bracket" && bracketStart) setBracketCursor(pos);
          if ((tool === "arrow" && arrowStart) || reconnect) setArrowCursor(pos);
        }}
        onNodeClick={(e, node) => {
          if (tool === "select" && !reconnect) {
            const edgeId = edgeIdAtPoint(e.clientX, e.clientY);
            if (edgeId) {
              selectOnlyEdge(edgeId);
              return;
            }
          }
          if (showAnchors) {
            if (node.type === "bracket") return;
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            onAnchorClick(node.id, nearestHandle(node, pos));
          }
        }}
        onEdgeClick={(_, edge) => {
          if (reconnect) return;
          activeEdgeIds.current = [edge.id];
          if (tool === "arrow") {
            setArrowStart(null);
            setArrowCursor(null);
            setTool("select");
          }
        }}
        onPaneClick={(e) => {
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          if (tool === "bracket") {
            if (!bracketStart) {
              setBracketStart(pos);
              setBracketCursor(pos);
              toast.message("Click the other end of the brace.");
              return;
            }
            addBracket(canvasId, bracketStart, pos);
            setBracketStart(null);
            setBracketCursor(null);
            setTool("select");
            toast.message("Type a group label on the brace.");
            return;
          }
          if (reconnect) {
            setReconnect(null);
            setArrowCursor(null);
            return;
          }
          if (tool === "arrow") return;
          const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
          if (current?.edges.some((edge) => edge.selected)) {
            setCanvasEdges(
              canvasId,
              current.edges.map((edge) => ({ ...edge, selected: false })),
            );
            activeEdgeIds.current = [];
          }
          if (e.detail === 2) addNote(canvasId, pos);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#3f3f46" />
        {showGuide && guideStart && arrowCursor ? (
          <ViewportPortal>
            <svg
              className="pointer-events-none absolute overflow-visible"
              style={{ left: 0, top: 0, width: 1, height: 1 }}
              aria-hidden
            >
              <line
                x1={guideStart.x}
                y1={guideStart.y}
                x2={arrowCursor.x}
                y2={arrowCursor.y}
                stroke="#7dd3fc"
                strokeWidth={1.75}
                strokeDasharray="7 5"
                strokeLinecap="round"
              />
              <circle cx={guideStart.x} cy={guideStart.y} r={3.5} fill="#7dd3fc" />
            </svg>
          </ViewportPortal>
        ) : null}
        {tool === "bracket" && bracketStart && bracketCursor ? (
          <ViewportPortal>
            <svg
              className="pointer-events-none absolute overflow-visible"
              style={{ left: 0, top: 0, width: 1, height: 1 }}
              aria-hidden
            >
              <line
                x1={bracketStart.x}
                y1={bracketStart.y}
                x2={bracketCursor.x}
                y2={bracketCursor.y}
                stroke="#7dd3fc"
                strokeWidth={1.75}
                strokeDasharray="7 5"
                strokeLinecap="round"
              />
              <circle cx={bracketStart.x} cy={bracketStart.y} r={3.5} fill="#7dd3fc" />
            </svg>
          </ViewportPortal>
        ) : null}
        <Controls showInteractive={false} />
        {settings?.showMinimap ? (
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(0,0,0,0.55)"
            nodeColor={(n) =>
              n.type === "note" ? "#fde68a" : n.type === "bracket" ? "#7dd3fc" : "#38bdf8"
            }
          />
        ) : null}
        <Panel
          position="top-left"
          className="pointer-events-none !m-2 flex w-[calc(100%-16px)] items-start"
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/80 p-1 backdrop-blur">
            <ToolHint />
            <Button size="sm" variant="ghost" onClick={() => addNote(canvasId)}>
              <StickyNote className="size-3.5" />
              Note
            </Button>
            <Button
              size="sm"
              variant={tool === "arrow" ? "secondary" : "ghost"}
              onClick={() => {
                setTool((t) => (t === "arrow" ? "select" : "arrow"));
                setArrowStart(null);
                setArrowCursor(null);
                setReconnect(null);
                setBracketStart(null);
              }}
            >
              <ArrowRight className="size-3.5" />
              Arrow
            </Button>
            <Button
              size="sm"
              variant={tool === "bracket" ? "secondary" : "ghost"}
              onClick={() => {
                setTool((t) => (t === "bracket" ? "select" : "bracket"));
                setBracketStart(null);
                setBracketCursor(null);
                setArrowStart(null);
                setArrowCursor(null);
                setReconnect(null);
              }}
            >
              <Braces className="size-3.5" />
              Brace
            </Button>
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            <EdgeStyleButton current={highlightedStyle} value="smoothstep" onClick={applyEdgeStyle} icon={Workflow} label="Elbow" />
            <EdgeStyleButton current={highlightedStyle} value="default" onClick={applyEdgeStyle} icon={Spline} label="Curve" />
            <EdgeStyleButton current={highlightedStyle} value="straight" onClick={applyEdgeStyle} icon={Slash} label="Straight" />
          </div>
          <div className="relative min-h-9 min-w-0 flex-1">
            <Button
              size="default"
              onClick={() => setAddLogsOpen(true)}
              className="pointer-events-auto absolute top-0 left-1/2 h-9 -translate-x-1/2 gap-1.5 rounded-md border border-sky-800 bg-sky-700 px-3.5 text-[13px] font-semibold text-white shadow-none hover:bg-sky-600"
            >
              <Plus className="size-4" />
              Add Log(s)
            </Button>
          </div>
        </Panel>
        {reconnect ? (
          <Panel position="top-center">
            <div className="rounded-md border border-sky-800 bg-zinc-950/90 px-3 py-1.5 text-[12px] text-sky-200">
              Click a new anchor for this {reconnect.end === "source" ? "tail" : "head"}. Esc to cancel.
            </div>
          </Panel>
        ) : tool === "arrow" ? (
          <Panel position="top-center">
            <div className="rounded-md border border-sky-800 bg-zinc-950/90 px-3 py-1.5 text-[12px] text-sky-200">
              {arrowStart ? "Click an anchor on the destination card." : "Click a side anchor, then the other end."} Esc to cancel.
            </div>
          </Panel>
        ) : null}
        {tool === "bracket" ? (
          <Panel position="top-center">
            <div className="rounded-md border border-sky-800 bg-zinc-950/90 px-3 py-1.5 text-[12px] text-sky-200">
              {bracketStart ? "Click the other end of the brace." : "Click both ends of the span. A mostly vertical pair faces left or right; a horizontal pair faces up or down."} Esc to cancel.
            </div>
          </Panel>
        ) : null}
        {canvas.nodes.length === 0 && tool === "select" ? (
          <Panel position="top-center">
            <div className="mt-16 max-w-md rounded-lg border border-zinc-800 bg-zinc-950/85 px-4 py-3 text-center text-sm text-zinc-300 shadow-xl">
              Empty canvas. Use + Add Log(s), or place logs from the browser. Drag a box to
              multi-select, middle-click to pan, Ctrl+wheel to zoom. Click Arrow, then two side
              anchors, to connect them. Click an arrow’s line to change Elbow, Curve, or Straight.
              Click the head or tail to move that end to another anchor.
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
      <AddLogsDialog open={addLogsOpen} onOpenChange={setAddLogsOpen} canvasId={canvasId} />
    </div>
    </CanvasArrowContext.Provider>
  );
}

function normalizeEdgeStyle(type: string | undefined): EdgeStyle | null {
  if (type === "smoothstep" || type === "default" || type === "straight") return type;
  if (type === "bezier") return "default";
  return null;
}

function ToolHint() {
  return (
    <span className="hidden items-center gap-1 px-2 text-[11px] text-zinc-500 md:flex">
      <MousePointer2 className="size-3" />
      Drag-select · Ctrl+wheel zoom
    </span>
  );
}

function EdgeStyleButton({
  current,
  value,
  onClick,
  icon: Icon,
  label,
}: {
  current: string | null;
  value: "smoothstep" | "default" | "straight";
  onClick: (v: "smoothstep" | "default" | "straight") => void;
  icon: typeof Spline;
  label: string;
}) {
  const active = current === value;
  return (
    <Button
      size="sm"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      onClick={() => onClick(value)}
      title={`${label} arrows`}
      className={
        active
          ? "border-sky-500/80 bg-sky-800 text-sky-50 hover:bg-sky-800 hover:text-sky-50"
          : undefined
      }
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}

function reconnectFixedPosition(
  nodes: AppNode[],
  edges: AppEdge[],
  reconnect: { edgeId: string; end: ArrowEndpoint },
): { x: number; y: number } | null {
  const edge = edges.find((e) => e.id === reconnect.edgeId);
  if (!edge) return null;
  const fixedIsSource = reconnect.end === "target";
  const nodeId = fixedIsSource ? edge.source : edge.target;
  const handle = fixedIsSource ? edge.sourceHandle : edge.targetHandle;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return handleFlowPosition(node, handle);
}

function edgeIdAtPoint(clientX: number, clientY: number): string | null {
  if (typeof document === "undefined" || !document.elementsFromPoint) return null;
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const group = el.closest(".react-flow__edge");
    if (group) return group.getAttribute("data-id");
  }
  return null;
}
