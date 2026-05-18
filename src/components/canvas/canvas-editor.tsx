"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useStore as useReactFlowStore,
  type Connection,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { createClient } from "@/lib/supabase/client";
import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  duplicateNodes,
  restoreEdge,
  restoreNodes,
  updateNodeParams,
  updateNodePosition,
} from "@/lib/canvas/actions";
import type {
  CanvasEdgeRow,
  CanvasNodeRow,
  NodeType,
} from "@/lib/canvas/types";
import {
  rowToFlowNode,
  useCanvasStore,
  type FlowNodeData,
} from "@/lib/canvas/store";
import { ImageGenerateNode } from "./node-image-generate";
import { ImageUploadNode } from "./node-image-upload";
import { VideoGenerateNode } from "./node-video-generate";
import { StoryboardNode } from "./node-storyboard";
import { SceneComposerNode } from "./node-scene-composer";
import { ExportNode } from "./node-export";
import { TextPromptNode } from "./node-text-prompt";
import { CanvasDock } from "./canvas-dock";
import { CanvasSidebar } from "./canvas-sidebar";
import { CanvasToolbar } from "./canvas-toolbar";
import { useNavMode } from "@/lib/canvas/use-nav-mode";

// `image_edit` / `image_merge` are legacy types kept here as aliases so older
// rows render correctly even before the SQL migration runs. Run
// `supabase/migrations/0003_unify_image_nodes.sql` to convert them.
const nodeTypes = {
  image_generate: ImageGenerateNode,
  image_edit: ImageGenerateNode,
  image_merge: ImageGenerateNode,
  image_upload: ImageUploadNode,
  video_generate: VideoGenerateNode,
  storyboard: StoryboardNode,
  scene_composer: SceneComposerNode,
  export: ExportNode,
  text_prompt: TextPromptNode,
};

/** Thicken + color edges by source handle so the data-flow type is obvious
 *  at a glance (image = emerald, video = purple). */
function edgeStyleFor(handle: string | null | undefined) {
  if (handle === "image_output") {
    return { stroke: "#10b981", strokeWidth: 2.5 };
  }
  if (handle === "video_output") {
    return { stroke: "#a855f7", strokeWidth: 2.5 };
  }
  return { stroke: "#737373", strokeWidth: 2 };
}

function rowToFlowEdge(row: CanvasEdgeRow) {
  return {
    id: row.id,
    source: row.source_node_id,
    sourceHandle: row.source_handle,
    target: row.target_node_id,
    targetHandle: row.target_handle,
    style: edgeStyleFor(row.source_handle),
    animated: true,
  };
}

export function CanvasEditor(props: {
  workflowId: string;
  workflowName: string;
  initialNodes: CanvasNodeRow[];
  initialEdges: CanvasEdgeRow[];
}) {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasEditorInner({
  workflowId,
  workflowName,
  initialNodes,
  initialEdges,
}: {
  workflowId: string;
  workflowName: string;
  initialNodes: CanvasNodeRow[];
  initialEdges: CanvasEdgeRow[];
}) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const setWorkflowId = useCanvasStore((s) => s.setWorkflowId);
  const stopPolling = useCanvasStore((s) => s.stopPolling);
  const pushUndo = useCanvasStore((s) => s.pushUndo);

  // When the user deletes a node, React Flow also emits `remove` changes for
  // every edge that touched it. We snapshot those edges as part of the
  // node-delete undo entry, so we need to tell onEdgesChange to NOT push a
  // separate edge-delete entry for the same ids — otherwise Cmd+Z would
  // need two presses to fully undo one delete.
  const cascadeRemovedEdgeIds = useRef<Set<string>>(new Set());

  // Auto-pan during lasso selection. Modelled exactly on xyflow's own
  // autoPanOnNodeDrag implementation (see @xyflow/system index.js around
  // line 2152) so the math + panBy signs match what's known to work.
  //
  // Trigger is the internal store flag `userSelectionActive`, which xyflow
  // flips on as soon as the lasso rect grows past the click threshold.
  // Subscribing via useStore guarantees we re-run the effect each time.
  const panBy = useReactFlowStore((s) => s.panBy);
  const userSelectionActive = useReactFlowStore((s) => s.userSelectionActive);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

  // Global pointermove listener — fresh cursor coords ready the instant the
  // lasso flips on.
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    if (!userSelectionActive) return;
    const EDGE = 80; // distance from edge that triggers panning
    const SPEED = 20; // max px per frame at the edge
    let raf: number | null = null;

    function clamp(v: number, lo: number, hi: number) {
      return Math.min(Math.max(v, lo), hi);
    }

    // Sign convention copied from xyflow's calcAutoPanVelocity: positive
    // when cursor is near the TOP or LEFT (we want the camera to move that
    // way, revealing more "before" content), negative near BOTTOM/RIGHT.
    function velocity(value: number, min: number, max: number): number {
      if (value < min) {
        return clamp(Math.abs(value - min), 1, min) / min;
      }
      if (value > max) {
        return -clamp(Math.abs(value - max), 1, min) / min;
      }
      return 0;
    }

    function tick() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const { x: mx, y: my } = mouseRef.current;
      const vx = velocity(mx, EDGE, w - EDGE) * SPEED;
      const vy = velocity(my, EDGE, h - EDGE) * SPEED;
      if (vx !== 0 || vy !== 0) {
        panBy({ x: vx, y: vy });
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [userSelectionActive, panBy]);

  // Hydrate Zustand store (an external system) from server-fetched initial data once.
  useEffect(() => {
    setWorkflowId(workflowId);
    setNodes(initialNodes.map(rowToFlowNode));
    setEdges(initialEdges.map(rowToFlowEdge));
    return () => {
      // Stop any in-flight polling when leaving canvas page
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription: keep node status/output in sync with backend
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`workflow:${workflowId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "canvas",
          table: "nodes",
          filter: `workflow_id=eq.${workflowId}`,
        },
        (payload) => {
          const row = payload.new as CanvasNodeRow;
          patchNodeData(row.id, {
            status: row.status,
            output: row.output,
            error: row.error,
            usage: row.usage,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, patchNodeData]);

  const onNodesChange: OnNodesChange<Node<FlowNodeData>> = useCallback(
    (changes) => {
      // Snapshot doomed nodes + their edges BEFORE applyNodeChanges removes
      // them from the store — needed for Cmd+Z undo.
      const removeIds = new Set(
        changes.filter((c) => c.type === "remove").map((c) => c.id),
      );
      if (removeIds.size > 0) {
        const state = useCanvasStore.getState();
        const snapshotNodes: CanvasNodeRow[] = state.nodes
          .filter((n) => removeIds.has(n.id))
          .map((n) => {
            const d = n.data as FlowNodeData;
            return {
              id: n.id,
              workflow_id: workflowId,
              type: d.nodeType,
              position_x: n.position.x,
              position_y: n.position.y,
              params: d.params,
              output: d.output,
              status: d.status,
              apimart_task_id: null,
              error: d.error,
              usage: d.usage,
            };
          });
        const snapshotEdges: CanvasEdgeRow[] = state.edges
          .filter(
            (e) =>
              (e.source && removeIds.has(e.source)) ||
              (e.target && removeIds.has(e.target)),
          )
          .map((e) => ({
            id: e.id,
            workflow_id: workflowId,
            source_node_id: e.source ?? "",
            source_handle: e.sourceHandle ?? "",
            target_node_id: e.target ?? "",
            target_handle: e.targetHandle ?? "",
          }));
        if (snapshotNodes.length > 0) {
          pushUndo({
            kind: "delete_nodes",
            nodes: snapshotNodes,
            edges: snapshotEdges,
          });
          // Mark cascaded edges so onEdgesChange skips its own undo push.
          for (const e of snapshotEdges) cascadeRemovedEdgeIds.current.add(e.id);
        }
      }

      setNodes((curr) => applyNodeChanges<Node<FlowNodeData>>(changes, curr));
      for (const c of changes) {
        if (c.type === "position" && c.position && c.dragging === false) {
          updateNodePosition({ id: c.id, position: c.position }).catch(
            console.error,
          );
        }
        if (c.type === "remove") {
          deleteNode(c.id).catch(console.error);
        }
        // NodeResizer fires `dimensions` changes while resizing; persist only
        // when the gesture finishes (`resizing === false`). We only save the
        // WIDTH — height stays auto so the node grows with its content
        // (preview image, history strip, etc.).
        if (
          c.type === "dimensions" &&
          c.dimensions &&
          c.resizing === false
        ) {
          const node = useCanvasStore
            .getState()
            .nodes.find((n) => n.id === c.id);
          if (node) {
            const params = (node.data as FlowNodeData).params;
            commitNodeParams(c.id, {
              ...params,
              _uiWidth: Math.round(c.dimensions.width),
            });
            // applyNodeChanges set style.height during the drag; clear it so
            // the node returns to auto-height once the gesture ends.
            setNodes((curr) =>
              curr.map((n) =>
                n.id === c.id
                  ? {
                      ...n,
                      style: {
                        ...n.style,
                        width: c.dimensions!.width,
                        height: undefined,
                      },
                    }
                  : n,
              ),
            );
          }
        }
      }
    },
    [setNodes, workflowId, pushUndo],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      // Snapshot edges being removed (skip cascaded ones — already covered
      // by the parent node-delete undo entry).
      for (const c of changes) {
        if (c.type !== "remove") continue;
        if (cascadeRemovedEdgeIds.current.has(c.id)) {
          cascadeRemovedEdgeIds.current.delete(c.id);
          continue;
        }
        const edge = useCanvasStore
          .getState()
          .edges.find((e) => e.id === c.id);
        if (edge && edge.source && edge.target) {
          pushUndo({
            kind: "delete_edge",
            edge: {
              id: edge.id,
              workflow_id: workflowId,
              source_node_id: edge.source,
              source_handle: edge.sourceHandle ?? "",
              target_node_id: edge.target,
              target_handle: edge.targetHandle ?? "",
            },
          });
        }
      }
      setEdges((curr) => applyEdgeChanges(changes, curr));
      for (const c of changes) {
        if (c.type === "remove") {
          deleteEdge(c.id).catch(console.error);
        }
      }
    },
    [setEdges, workflowId, pushUndo],
  );

  const onConnect: OnConnect = useCallback(
    async (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      ) {
        return;
      }
      try {
        const row = await createEdge({
          workflowId,
          sourceNodeId: connection.source,
          sourceHandle: connection.sourceHandle,
          targetNodeId: connection.target,
          targetHandle: connection.targetHandle,
        });
        setEdges((curr) =>
          addEdge(
            {
              ...connection,
              id: row.id,
              style: edgeStyleFor(connection.sourceHandle),
              animated: true,
            },
            curr,
          ),
        );
      } catch (e) {
        console.error(e);
      }
    },
    [workflowId, setEdges],
  );

  const onAddNode = useCallback(
    async (type: NodeType) => {
      const position = {
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
      };
      const row = (await createNode({
        workflowId,
        type,
        position,
      })) as CanvasNodeRow;
      setNodes((curr) => [...curr, rowToFlowNode(row)]);
    },
    [workflowId, setNodes],
  );

  // Cmd+D / Ctrl+D: duplicate every currently-selected node, preserving any
  // edges that connect within the selection. Skipped while the user is
  // typing inside a node's input/textarea so the shortcut doesn't fight
  // text editing.
  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      const isDup =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "d";
      if (!isDup) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Prevent browser "bookmark this page" dialog.
      e.preventDefault();

      const selectedIds = useCanvasStore
        .getState()
        .nodes.filter((n) => n.selected)
        .map((n) => n.id);
      if (selectedIds.length === 0) return;

      try {
        // Make sure debounced param edits land before cloning.
        await flushPendingSaves();
        const { nodes: newRows } = await duplicateNodes(selectedIds);
        if (newRows.length === 0) return;

        // Deselect originals, mark clones as the new selection — Figma-like.
        setNodes((curr) => [
          ...curr.map((n) => (n.selected ? { ...n, selected: false } : n)),
          ...newRows.map((row) => ({
            ...rowToFlowNode(row),
            selected: true,
          })),
        ]);

        // Push to undo stack so Cmd+Z removes them.
        pushUndo({
          kind: "duplicate_nodes",
          createdNodeIds: newRows.map((r) => r.id),
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setNodes, setEdges, pushUndo]);

  // Cmd+A / Ctrl+A: select every node on the canvas. Skipped while focus is
  // in a text field so the OS-native "select all text" still works.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isSelectAll =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "a";
      if (!isSelectAll) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      setNodes((curr) =>
        curr.every((n) => n.selected)
          ? curr
          : curr.map((n) => (n.selected ? n : { ...n, selected: true })),
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setNodes]);

  // Cmd+Z / Ctrl+Z: pop the most recent undo entry and reverse it. Handles
  // (a) undoing a duplicate by deleting the clones, (b) restoring deleted
  // nodes + their edges, (c) restoring a single deleted edge.
  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      const isUndo =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (!isUndo) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();

      const entry = useCanvasStore.getState().popUndo();
      if (!entry) return;

      try {
        if (entry.kind === "duplicate_nodes") {
          const ids = new Set(entry.createdNodeIds);
          await Promise.all(
            entry.createdNodeIds.map((id) =>
              deleteNode(id).catch(console.error),
            ),
          );
          setNodes((curr) => curr.filter((n) => !ids.has(n.id)));
        } else if (entry.kind === "delete_nodes") {
          const { nodes: restoredNodes, edges: restoredEdges } =
            await restoreNodes({
              nodes: entry.nodes,
              edges: entry.edges,
            });
          setNodes((curr) => [...curr, ...restoredNodes.map(rowToFlowNode)]);
          if (restoredEdges.length > 0) {
            setEdges((curr) => [...curr, ...restoredEdges.map(rowToFlowEdge)]);
          }
        } else if (entry.kind === "delete_edge") {
          const restored = await restoreEdge({
            workflowId: entry.edge.workflow_id,
            sourceNodeId: entry.edge.source_node_id,
            sourceHandle: entry.edge.source_handle,
            targetNodeId: entry.edge.target_node_id,
            targetHandle: entry.edge.target_handle,
          });
          setEdges((curr) => [...curr, rowToFlowEdge(restored)]);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setNodes, setEdges]);

  const stableNodeTypes = useMemo(() => nodeTypes, []);
  const { resolvedTheme } = useTheme();
  const colorMode: "light" | "dark" =
    resolvedTheme === "dark" ? "dark" : "light";
  const { mode: navMode } = useNavMode();

  return (
    <div className="flex h-screen w-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {navMode === "sidebar" && <CanvasSidebar onAddNode={onAddNode} />}
      <div className="flex flex-1 flex-col">
        <CanvasToolbar workflowId={workflowId} workflowName={workflowName} />
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={stableNodeTypes}
            colorMode={colorMode}
            fitView
            // Figma-style multi-select: drag empty area = lasso, middle /
            // right click = pan, scroll wheel = pan, Cmd/Ctrl + scroll =
            // zoom. Hold Cmd/Ctrl to add individual nodes to the selection.
            selectionOnDrag
            panOnDrag={[1, 2]}
            panOnScroll
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode={["Meta", "Control"]}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {navMode === "dock" && <CanvasDock onAddNode={onAddNode} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Helper used by node components so they can debounce param saves
 * without needing a callback in the FlowNodeData payload.
 *
 * `flushPendingSaves()` lets the toolbar / per-node Run buttons immediately
 * commit any in-flight debounced writes BEFORE triggering a generation, so
 * the backend reads fresh params (model, prompt, etc) from the DB.
 */
type Pending = {
  params: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout>;
};
const pending = new Map<string, Pending>();

export function commitNodeParams(id: string, params: Record<string, unknown>) {
  useCanvasStore.getState().patchNodeData(id, { params });
  const existing = pending.get(id);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    updateNodeParams({ id, params }).catch(console.error);
    pending.delete(id);
  }, 400);
  pending.set(id, { params, timer });
}

export async function flushPendingSaves(): Promise<void> {
  const all = Array.from(pending.entries());
  pending.clear();
  await Promise.all(
    all.map(async ([id, { params, timer }]) => {
      clearTimeout(timer);
      try {
        await updateNodeParams({ id, params });
      } catch (e) {
        console.error("flush save failed", e);
      }
    }),
  );
}
