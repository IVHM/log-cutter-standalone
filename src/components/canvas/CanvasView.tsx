"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { MousePointer2, StickyNote, Spline, Slash, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/lib/store";
import type { AppEdge, AppNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CanvasIdContext } from "./canvas-context";
import { LabeledEdge } from "./LabeledEdge";
import { LogNode } from "./LogNode";
import { NoteNode } from "./NoteNode";

import "@xyflow/react/dist/style.css";

const nodeTypes = { log: LogNode, note: NoteNode };
const edgeTypes = {
  default: LabeledEdge,
  smoothstep: LabeledEdge,
  straight: LabeledEdge,
  bezier: LabeledEdge,
};

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
  const logs = useProjectStore((s) => s.project?.logs ?? []);
  const applyNodeChanges = useProjectStore((s) => s.applyNodeChanges);
  const applyEdgeChanges = useProjectStore((s) => s.applyEdgeChanges);
  const setViewport = useProjectStore((s) => s.setViewport);
  const connectEdge = useProjectStore((s) => s.connectEdge);
  const addNote = useProjectStore((s) => s.addNote);
  const addLogsToCanvas = useProjectStore((s) => s.addLogsToCanvas);
  const updateEdge = useProjectStore((s) => s.updateEdge);
  const { screenToFlowPosition } = useReactFlow();
  const [spaceDown, setSpaceDown] = useState(false);
  const [edgeStyle, setEdgeStyle] = useState<"smoothstep" | "default" | "straight">("smoothstep");

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code === "Space" && !isTyping(e)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    }
    function up(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceDown(false);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => applyNodeChanges(canvasId, changes),
    [applyNodeChanges, canvasId],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<AppEdge>[]) => applyEdgeChanges(canvasId, changes),
    [applyEdgeChanges, canvasId],
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

  if (!canvas) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This canvas was removed.
      </div>
    );
  }

  return (
    <div className={cn("h-full w-full", spaceDown && "cursor-grab")}>
      <ReactFlow
        nodes={canvas.nodes}
        edges={canvas.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={defaultEdgeOptions}
        defaultViewport={canvas.viewport}
        onMoveEnd={(_, vp) => setViewport(canvasId, vp)}
        fitView={canvas.nodes.length > 0 && canvas.viewport.x === 0 && canvas.viewport.y === 0 && canvas.viewport.zoom === 1}
        selectionOnDrag={!spaceDown}
        panOnDrag={spaceDown ? true : [1, 2]}
        panOnScroll
        selectionMode={SelectionMode.Partial}
        selectNodesOnDrag
        multiSelectionKeyCode="Shift"
        deleteKeyCode={["Backspace", "Delete"]}
        snapToGrid={settings?.snapToGrid}
        snapGrid={[settings?.gridSize ?? 16, settings?.gridSize ?? 16]}
        minZoom={0.15}
        maxZoom={2.5}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        onPaneContextMenu={(e) => e.preventDefault()}
        onPaneClick={(e) => {
          if (e.detail === 2) {
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            addNote(canvasId, pos);
          }
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#3f3f46" />
        <Controls showInteractive={false} />
        {settings?.showMinimap ? (
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(0,0,0,0.55)"
            nodeColor={(n) => (n.type === "note" ? "#f5d76e" : "#38bdf8")}
          />
        ) : null}
        <Panel position="top-left" className="flex flex-wrap items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/80 p-1 backdrop-blur">
          <ToolHint />
          <Button size="sm" variant="ghost" onClick={() => addNote(canvasId)}>
            <StickyNote className="size-3.5" />
            Note
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (logs.length === 0) {
                toast.message("Import logs first, then place them from the browser.");
                return;
              }
              addLogsToCanvas(canvasId, logs.slice(0, 6).map((l) => l.id));
            }}
          >
            Place sample of dataset
          </Button>
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          <EdgeStyleButton current={edgeStyle} value="smoothstep" onClick={setEdgeStyle} icon={Workflow} label="Elbow" />
          <EdgeStyleButton current={edgeStyle} value="default" onClick={setEdgeStyle} icon={Spline} label="Curve" />
          <EdgeStyleButton current={edgeStyle} value="straight" onClick={setEdgeStyle} icon={Slash} label="Straight" />
        </Panel>
        {canvas.nodes.length === 0 ? (
          <Panel position="top-center">
            <div className="mt-16 max-w-md rounded-lg border border-zinc-800 bg-zinc-950/85 px-4 py-3 text-center text-sm text-zinc-300 shadow-xl">
              Empty canvas. Open the log browser, select rows, and place them here. Drag a box to
              multi-select, middle-click or hold Space to pan, double-click to drop a note. Drag
              from a handle to draw an arrow.
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
}

function ToolHint() {
  return (
    <span className="hidden items-center gap-1 px-2 text-[11px] text-zinc-500 md:flex">
      <MousePointer2 className="size-3" />
      Drag-select · Space pan · Wheel zoom
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

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}
