import { nanoid } from "nanoid";
import { hashPayload, shapeIdOf } from "./hash";
import { suggestColumns, inferSchema, suggestPins } from "./schema";
import type { AppEdge, AppNode, BrowserView, Canvas, LogRecord, LogSet, Project } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const SAMPLE_LOGS: unknown[] = [
  {
    ts: "2026-03-12T10:01:04.221Z",
    level: "info",
    service: "api",
    event: "request",
    method: "GET",
    path: "/v1/orders",
    status: 200,
    duration_ms: 18,
    request_id: "req_8f2a",
    user: { id: "u_104", role: "customer" },
  },
  {
    ts: "2026-03-12T10:01:04.640Z",
    level: "info",
    service: "api",
    event: "request",
    method: "GET",
    path: "/v1/orders/ord_91",
    status: 200,
    duration_ms: 41,
    request_id: "req_8f2b",
    user: { id: "u_104", role: "customer" },
  },
  {
    ts: "2026-03-12T10:01:06.012Z",
    level: "error",
    service: "api",
    event: "request",
    method: "POST",
    path: "/v1/orders",
    status: 500,
    duration_ms: 412,
    request_id: "req_91bc",
    user: { id: "u_221", role: "customer" },
    error: {
      type: "TimeoutError",
      message: "upstream timeout",
      upstream: "billing",
      retryable: true,
    },
  },
  {
    ts: "2026-03-12T10:01:06.080Z",
    level: "error",
    service: "billing",
    event: "charge.failed",
    request_id: "req_91bc",
    order_id: "ord_pending",
    amount_cents: 4299,
    currency: "usd",
    error: { code: "gateway_timeout", message: "Stripe did not respond in 400ms" },
  },
  {
    ts: "2026-03-12T10:01:07.441Z",
    level: "warn",
    service: "api",
    event: "retry",
    request_id: "req_91bc",
    attempt: 2,
    delay_ms: 200,
  },
  {
    ts: "2026-03-12T10:01:08.102Z",
    level: "info",
    service: "worker",
    event: "job.complete",
    job: { id: "job_44", type: "email.receipt", duration_ms: 132 },
    tags: ["email", "orders"],
  },
  {
    ts: "2026-03-12T10:02:11.900Z",
    level: "info",
    service: "auth",
    event: "login",
    user: { id: "u_12", role: "admin", email: "ops@example.com" },
    ip: "10.0.0.4",
    success: true,
  },
  {
    ts: "2026-03-12T10:02:18.003Z",
    level: "warn",
    service: "auth",
    event: "login",
    user: { id: "u_88", role: "customer" },
    ip: "203.0.113.9",
    success: false,
    reason: "invalid_password",
    attempts: 4,
  },
  {
    ts: "2026-03-12T10:03:44.220Z",
    level: "debug",
    service: "api",
    event: "cache.miss",
    key: "orders:u_104",
    store: "redis",
    elapsed_ms: 3,
  },
  {
    ts: "2026-03-12T10:04:01.774Z",
    level: "error",
    service: "api",
    event: "request",
    method: "DELETE",
    path: "/v1/orders/ord_12",
    status: 403,
    duration_ms: 9,
    request_id: "req_aa01",
    user: { id: "u_104", role: "customer" },
    error: { type: "Forbidden", message: "cannot cancel a shipped order" },
  },
];

export async function buildSampleProject(): Promise<Project> {
  const now = Date.now();
  const logSet: LogSet = {
    id: nanoid(),
    name: "checkout-incident",
    createdAt: now,
    sourceFile: "sample-logs.jsonl",
  };

  const logs: LogRecord[] = [];
  const hashIndex: Record<string, string> = {};
  for (const data of SAMPLE_LOGS) {
    const hash = await hashPayload(data);
    const id = nanoid();
    hashIndex[hash] = id;
    logs.push({
      id,
      logSetId: logSet.id,
      hash,
      data,
      meta: { host: "prod-api-3", ingested_at: "2026-03-12T10:05:00Z" },
      note: "",
      shapeId: shapeIdOf(data),
      importedAt: now,
      sourceFile: "sample-logs.jsonl",
    });
  }

  const fields = inferSchema(logs);
  const view: BrowserView = {
    id: nanoid(),
    name: "All logs",
    logSetId: logSet.id,
    columns: suggestColumns(fields, logs.length),
    search: "",
    shapeFilter: null,
  };
  const errorView: BrowserView = {
    id: nanoid(),
    name: "Errors",
    logSetId: logSet.id,
    columns: suggestColumns(fields, logs.length),
    search: "error",
    shapeFilter: null,
  };

  const apiError = logs.find((l) => {
    const d = l.data as { request_id?: string; service?: string; level?: string };
    return d.request_id === "req_91bc" && d.service === "api" && d.level === "error";
  });
  const billing = logs.find((l) => {
    const d = l.data as { service?: string };
    return d.service === "billing";
  });
  const retry = logs.find((l) => {
    const d = l.data as { event?: string };
    return d.event === "retry";
  });
  const placed = [apiError, billing, retry].filter(Boolean) as LogRecord[];
  const logNodes: AppNode[] = placed.map((log, i) => ({
    id: nanoid(),
    type: "log",
    position: { x: 40 + i * 360, y: 80 },
    data: {
      kind: "log",
      logId: log.id,
      collapsed: i !== 0,
      pinnedPaths: suggestPins(log.data),
      collapsedPaths: [],
    },
  }));
  const note: AppNode = {
    id: nanoid(),
    type: "note",
    position: { x: 40, y: 360 },
    style: { width: 260, height: 140 },
    data: {
      kind: "note",
      color: "#f5d76e",
      text: "Checkout POST timed out waiting on billing. Same request_id on the API error, the Stripe timeout, and the retry.",
    },
  };
  const edges: AppEdge[] = [];
  if (logNodes[0] && logNodes[1]) {
    edges.push({
      id: nanoid(),
      source: logNodes[0].id,
      target: logNodes[1].id,
      sourceHandle: "r",
      targetHandle: "l",
      type: "smoothstep",
      markerEnd: { type: "arrowclosed", width: 16, height: 16 },
      data: { label: "same request_id" },
    });
  }
  if (logNodes[0] && logNodes[2]) {
    edges.push({
      id: nanoid(),
      source: logNodes[0].id,
      target: logNodes[2].id,
      sourceHandle: "b",
      targetHandle: "t",
      type: "smoothstep",
      markerEnd: { type: "arrowclosed", width: 16, height: 16 },
      data: { label: "retry" },
    });
  }

  const canvas: Canvas = {
    id: nanoid(),
    name: "Incident timeline",
    viewport: { x: 40, y: 20, zoom: 0.9 },
    nodes: [...logNodes, note],
    edges,
  };

  const canvasTab: Project["openTabs"][number] = {
    id: nanoid(),
    kind: "canvas",
    canvasId: canvas.id,
  };
  const browserTab: Project["openTabs"][number] = {
    id: nanoid(),
    kind: "browser",
    viewId: view.id,
  };

  return {
    id: nanoid(),
    name: "Checkout timeout · Mar 12",
    createdAt: now,
    updatedAt: now,
    logSets: [logSet],
    logs,
    hashIndex,
    views: [view, errorView],
    canvases: [canvas],
    settings: { ...DEFAULT_SETTINGS },
    openTabs: [canvasTab, browserTab],
    activeTabId: canvasTab.id,
    lastCanvasId: canvas.id,
  };
}
