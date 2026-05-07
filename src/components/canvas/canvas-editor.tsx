"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
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
};

function rowToFlowEdge(row: CanvasEdgeRow) {
  return {
    id: row.id,
    source: row.source_node_id,
    sourceHandle: row.source_handle,
    target: row.target_node_id,
    targetHandle: row.target_handle,
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
          schema: "public",
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
        setEdges((curr) => addEdge({ ...connection, id: row.id }, curr));
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
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap pannable zoomable className="!bg-neutral-900" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper used by node components so they can debounce param saves
 * without needing a callback in the FlowNodeData payload.
 */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function commitNodeParams(id: string, params: Record<string, unknown>) {
  useCanvasStore.getState().patchNodeData(id, { params });
  const existing = debounceTimers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    updateNodeParams({ id, params }).catch(console.error);
  }, 400);
  debounceTimers.set(id, t);
}
