"use client";

import { useCallback, useEffect, useMemo } from "react";
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
import { CanvasSidebar } from "./canvas-sidebar";
import { CanvasToolbar } from "./canvas-toolbar";

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
    [setNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((curr) => applyEdgeChanges(changes, curr));
      for (const c of changes) {
        if (c.type === "remove") {
          deleteEdge(c.id).catch(console.error);
        }
      }
    },
    [setEdges],
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
        const { nodes: newRows, edges: newEdgeRows } =
          await duplicateNodes(selectedIds);
        if (newRows.length === 0) return;

        // Deselect originals, mark clones as the new selection — Figma-like.
        setNodes((curr) => [
          ...curr.map((n) => (n.selected ? { ...n, selected: false } : n)),
          ...newRows.map((row) => ({
            ...rowToFlowNode(row),
            selected: true,
          })),
        ]);
        if (newEdgeRows.length > 0) {
          setEdges((curr) => [...curr, ...newEdgeRows.map(rowToFlowEdge)]);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setNodes, setEdges]);

  const stableNodeTypes = useMemo(() => nodeTypes, []);

  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-100">
      <CanvasSidebar onAddNode={onAddNode} />
      <div className="flex flex-1 flex-col">
        <CanvasToolbar workflowId={workflowId} workflowName={workflowName} />
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={stableNodeTypes}
            colorMode="dark"
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
            <MiniMap pannable zoomable className="bg-neutral-900!" />
          </ReactFlow>
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
