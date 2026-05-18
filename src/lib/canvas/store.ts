"use client";

import { create } from "zustand";
import type { Edge, Node } from "@xyflow/react";
import type {
  CanvasEdgeRow,
  CanvasNodeRow,
  NodeOutput,
  NodeStatus,
  NodeUsage,
} from "./types";

export type FlowNodeData = {
  nodeType: CanvasNodeRow["type"];
  status: NodeStatus;
  params: Record<string, unknown>;
  output: NodeOutput | null;
  error: string | null;
  usage: NodeUsage | null;
};

/** Discrete operation that Cmd+Z can reverse. Append-only; oldest entries
 *  drop off when the stack exceeds UNDO_LIMIT. */
export type UndoEntry =
  | { kind: "duplicate_nodes"; createdNodeIds: string[] }
  | { kind: "delete_nodes"; nodes: CanvasNodeRow[]; edges: CanvasEdgeRow[] }
  | { kind: "delete_edge"; edge: CanvasEdgeRow };

const UNDO_LIMIT = 10;

type State = {
  workflowId: string | null;
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  isPolling: boolean;
  /** Bumped every time polling completes a workflow (for refreshing balance, etc). */
  pollCompletionTick: number;
  undoStack: UndoEntry[];
};

type Actions = {
  setWorkflowId: (id: string) => void;
  setNodes: (
    updater:
      | Node<FlowNodeData>[]
      | ((prev: Node<FlowNodeData>[]) => Node<FlowNodeData>[]),
  ) => void;
  setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  patchNodeData: (id: string, patch: Partial<FlowNodeData>) => void;
  /** Hydrate node data from server-shaped rows (used after polling tick). */
  hydrateFromRows: (rows: CanvasNodeRow[]) => void;
  /** When `cascade` is true (Run all), the polling tick auto-fires downstream
   *  nodes as their inputs become ready. When false (per-node Run), the tick
   *  only polls the currently-running task without dispatching anything new.
   *  When `sequential` is true and cascade is true, only one token-spending
   *  node is dispatched at a time — the next waits for the previous to finish. */
  startPolling: (cascade?: boolean, sequential?: boolean) => void;
  stopPolling: () => void;
  pushUndo: (entry: UndoEntry) => void;
  popUndo: () => UndoEntry | undefined;
};

// Module-level state for the polling loop. Survives re-renders without
// putting raw timer ids into the Zustand store.
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollCascade = true;
let pollSequential = false;
// Prevents overlapping ticks: when a tick takes longer than the interval
// (which it does because of preprocess + storage upload + APImart polling),
// the next setInterval fire could otherwise see a still-running task and
// double-process it (causing duplicate history rows).
let tickInflight = false;

export const useCanvasStore = create<State & Actions>((set, get) => ({
  workflowId: null,
  nodes: [],
  edges: [],
  isPolling: false,
  pollCompletionTick: 0,
  undoStack: [],

  setWorkflowId: (id) => set({ workflowId: id }),

  setNodes: (updater) =>
    set((s) => ({
      nodes:
        typeof updater === "function"
          ? (updater as (prev: Node<FlowNodeData>[]) => Node<FlowNodeData>[])(
              s.nodes,
            )
          : updater,
    })),
  setEdges: (updater) =>
    set((s) => ({
      edges:
        typeof updater === "function"
          ? (updater as (prev: Edge[]) => Edge[])(s.edges)
          : updater,
    })),
  patchNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    })),
  hydrateFromRows: (rows) =>
    set((s) => {
      const byId = new Map(rows.map((r) => [r.id, r]));
      return {
        nodes: s.nodes.map((n) => {
          const row = byId.get(n.id);
          if (!row) return n;
          return {
            ...n,
            data: {
              ...n.data,
              status: row.status,
              params: row.params,
              output: row.output,
              error: row.error,
              usage: row.usage,
            },
          };
        }),
      };
    }),

  startPolling: (cascade = true, sequential = false) => {
    // Updating cascade/sequential mid-poll is allowed.
    pollCascade = cascade;
    pollSequential = sequential;
    if (pollTimer) return;
    set({ isPolling: true });
    const tick = async () => {
      if (tickInflight) return; // skip overlapping fires
      tickInflight = true;
      const wfId = get().workflowId;
      if (!wfId) {
        tickInflight = false;
        return;
      }
      try {
        // Client-side preprocess: extract last frames from upstream Video
        // outputs into image inputs for downstream Video nodes. Done here
        // before the server tick so the next dispatch can use the cached URL.
        try {
          const { preprocessUpstreamVideos } = await import("./preprocess");
          await preprocessUpstreamVideos();
        } catch (e) {
          console.error("preprocess failed", e);
        }

        const res = await fetch(`/api/workflow/${wfId}/tick`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cascade: pollCascade,
            sequential: pollSequential,
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          hasPending: boolean;
          nodes?: CanvasNodeRow[];
        };
        if (Array.isArray(json.nodes)) {
          get().hydrateFromRows(json.nodes);
        }
        if (!json.hasPending) {
          get().stopPolling();
          set((s) => ({ pollCompletionTick: s.pollCompletionTick + 1 }));
        }
      } catch (e) {
        console.error("tick failed", e);
      } finally {
        tickInflight = false;
      }
    };
    void tick(); // run immediately
    pollTimer = setInterval(tick, 2500);
  },

  stopPolling: () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    set({ isPolling: false });
  },

  pushUndo: (entry) =>
    set((s) => {
      const next = [...s.undoStack, entry];
      // Cap stack — drop oldest when over UNDO_LIMIT.
      if (next.length > UNDO_LIMIT) next.splice(0, next.length - UNDO_LIMIT);
      return { undoStack: next };
    }),

  popUndo: () => {
    const stack = get().undoStack;
    if (stack.length === 0) return undefined;
    const entry = stack[stack.length - 1];
    set({ undoStack: stack.slice(0, -1) });
    return entry;
  },
}));

/** Initial width when a node is first dropped on the canvas (before any user
 *  resize). Stored on creation; honored by `rowToFlowNode` until the user
 *  resizes and persists `_uiWidth`. */
function defaultWidthFor(type: string): number {
  switch (type) {
    case "storyboard":
      return 320;
    case "video_generate":
    case "scene_composer":
      return 288;
    default:
      return 256;
  }
}

export function rowToFlowNode(row: CanvasNodeRow): Node<FlowNodeData> {
  const params = (row.params ?? {}) as Record<string, unknown>;
  const uiWidth =
    typeof params._uiWidth === "number" && params._uiWidth > 0
      ? params._uiWidth
      : defaultWidthFor(row.type);
  // Height is intentionally NOT controlled here — we want each node to
  // auto-grow to fit its content (image preview, history strip, etc.) so the
  // user never has to scroll inside the body. Width is the only persisted
  // dimension.
  return {
    id: row.id,
    type: row.type,
    position: { x: row.position_x, y: row.position_y },
    style: { width: uiWidth },
    data: {
      nodeType: row.type,
      status: row.status,
      params: row.params,
      output: row.output,
      error: row.error,
      usage: row.usage,
    },
  };
}
