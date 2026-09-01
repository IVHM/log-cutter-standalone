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
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AddLogsDialog } from "@/components/canvas/AddLogsDialog";
import { Button } from "@/components/ui/button";
import { handleFlowPosition, nearestHandle, type EdgeHandleId } from "@/lib/arrow-anchor";
import { useProjectStore } from "@/lib/store";
import type { AppEdge, AppNode } from "@/lib/types";
import { BracketNode } from "./BracketNode";
import { CanvasArrowContext, CanvasIdContext, type CanvasTool } from "./canvas-context";
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
  const [bracketStart, setBracketStart] = useState<{ x: number; y: number } | null>(null);
  const [bracketCursor, setBracketCursor] = useState<{ x: number; y: number } | null>(null);
  const [addLogsOpen, setAddLogsOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setTool("select");
        setArrowStart(null);
        setArrowCursor(null);
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

  const onAnchorClick = useCallback(
    (nodeId: string, handle: EdgeHandleId) => {
      if (tool !== "arrow") return;
      if (!arrowStart) {
        setArrowStart({ nodeId, handle });
        toast.message("Click an anchor on the destination card.");
        return;
      }
      finishArrow(arrowStart, { nodeId, handle });
    },
    [arrowStart, finishArrow, tool],
  );

  const applyEdgeStyle = useCallback(
    (style: EdgeStyle) => {
      setEdgeStyle(style);
      const current = useProjectStore.getState().project?.canvases.find((c) => c.id === canvasId);
      if (!current) return;
      for (const edge of current.edges) {
        if (edge.selected) updateEdge(canvasId, edge.id, { type: style });
      }
    },
    [canvasId, updateEdge],
  );

  const selectedEdge = canvas?.edges.find((e) => e.selected);
  useEffect(() => {
    if (!selectedEdge) return;
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

  const placing = tool !== "select";
  const arrowStartNode = arrowStart
    ? canvas.nodes.find((n) => n.id === arrowStart.nodeId)
    : undefined;
  const arrowStartPos =
    arrowStart && arrowStartNode ? handleFlowPosition(arrowStartNode, arrowStart.handle) : null;

  return (
    <CanvasArrowContext.Provider value={{ tool, onAnchorClick }}>
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
        nodesConnectable={tool === "arrow"}
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
        proOptions={{ hideAttribution: true }}
        onPaneContextMenu={(e) => e.preventDefault()}
        onPointerMove={(e) => {
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          if (tool === "bracket" && bracketStart) setBracketCursor(pos);
          if (tool === "arrow" && arrowStart) setArrowCursor(pos);
        }}
        onNodeClick={(e, node) => {
          if (tool !== "arrow") return;
          if (node.type === "bracket") return;
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          onAnchorClick(node.id, nearestHandle(node, pos));
        }}
        onEdgeClick={() => {
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
          if (tool === "arrow") return;
          if (e.detail === 2) addNote(canvasId, pos);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#3f3f46" />
        {tool === "arrow" && arrowStartPos && arrowCursor ? (
          <ViewportPortal>
            <svg
              className="pointer-events-none absolute overflow-visible"
              style={{ left: 0, top: 0, width: 1, height: 1 }}
              aria-hidden
            >
              <line
                x1={arrowStartPos.x}
                y1={arrowStartPos.y}
                x2={arrowCursor.x}
                y2={arrowCursor.y}
                stroke="#7dd3fc"
                strokeWidth={1.75}
                strokeDasharray="7 5"
                strokeLinecap="round"
              />
              <circle cx={arrowStartPos.x} cy={arrowStartPos.y} r={3.5} fill="#7dd3fc" />
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
              }}
            >
              <Braces className="size-3.5" />
              Brace
            </Button>
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            <EdgeStyleButton current={edgeStyle} value="smoothstep" onClick={applyEdgeStyle} icon={Workflow} label="Elbow" />
            <EdgeStyleButton current={edgeStyle} value="default" onClick={applyEdgeStyle} icon={Spline} label="Curve" />
            <EdgeStyleButton current={edgeStyle} value="straight" onClick={applyEdgeStyle} icon={Slash} label="Straight" />
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
        {tool === "arrow" ? (
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
  current: string;
  value: "smoothstep" | "default" | "straight";
  onClick: (v: "smoothstep" | "default" | "straight") => void;
  icon: typeof Spline;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant={current === value ? "secondary" : "ghost"}
      onClick={() => onClick(value)}
      title={`${label} arrows`}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}
