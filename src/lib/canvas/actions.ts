"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_PARAMS,
  type CanvasEdgeRow,
  type CanvasNodeRow,
  type NodeOutput,
  type NodeOutputHistoryRow,
  type NodeStatus,
  type NodeType,
  type StoryboardScene,
  type VideoGenerateParams,
} from "./types";
import { DEFAULT_VIDEO_MODEL } from "@/lib/apimart/video-models";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function ensureDefaultWorkflow() {
  const { supabase, user } = await authed();
  const { data: existing } = await supabase
    .from("workflows")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await supabase
    .from("workflows")
    .insert({ user_id: user.id, name: "My first workflow" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

// ============================================================
// Workflow CRUD (used by the workflows list page)
// ============================================================

export type WorkflowSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  node_count: number;
  thumbnail_url: string | null;
};

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const { supabase } = await authed();
  const { data: workflows, error } = await supabase
    .from("workflows")
    .select("id, name, created_at, updated_at, nodes(count)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = (workflows ?? []).map((w) => w.id as string);
  const thumbsByWorkflow = new Map<string, string>();

  // Pull a single representative image from each workflow's history (latest
  // image; if none, latest video thumbnail) for the card preview.
  if (ids.length) {
    const { data: outputs } = await supabase
      .from("node_outputs")
      .select("workflow_id, output, created_at")
      .in("workflow_id", ids)
      .order("created_at", { ascending: false });
    for (const row of (outputs ?? []) as Array<{
      workflow_id: string;
      output: NodeOutput;
    }>) {
      if (thumbsByWorkflow.has(row.workflow_id)) continue;
      const url =
        row.output.kind === "image"
          ? row.output.url
          : row.output.kind === "video"
            ? row.output.thumbnailUrl ?? null
            : null;
      if (url) thumbsByWorkflow.set(row.workflow_id, url);
    }
  }

  return (workflows ?? []).map((w) => {
    const nodeCountRel = (w.nodes as { count: number }[] | undefined) ?? [];
    const nodeCount = nodeCountRel[0]?.count ?? 0;
    return {
      id: w.id as string,
      name: w.name as string,
      created_at: w.created_at as string,
      updated_at: w.updated_at as string,
      node_count: nodeCount,
      thumbnail_url: thumbsByWorkflow.get(w.id as string) ?? null,
    };
  });
}

export async function createWorkflow(name?: string) {
  const { supabase, user } = await authed();
  const { data, error } = await supabase
    .from("workflows")
    .insert({ user_id: user.id, name: name?.trim() || "Untitled workflow" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function renameWorkflow(input: { id: string; name: string }) {
  const { supabase } = await authed();
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const { error } = await supabase
    .from("workflows")
    .update({ name: trimmed })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function deleteWorkflow(id: string) {
  const { supabase } = await authed();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================================
// Storyboard → bulk-create downstream scene nodes
// ============================================================

/**
 * For each scene from a storyboard, create a Video node pre-filled with the
 * scene prompt, plus a Scene Composer node that collects all of them. Returns
 * the new rows so the client can patch its store immediately.
 */
export async function createSceneNodesFromStoryboard(input: {
  workflowId: string;
  storyboardNodeId: string;
  scenes: StoryboardScene[];
  /** Position of the Storyboard node — used to lay out new nodes nearby. */
  origin?: { x: number; y: number };
}): Promise<{ nodes: CanvasNodeRow[]; edges: CanvasEdgeRow[] }> {
  const { supabase } = await authed();
  if (input.scenes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const ox = input.origin?.x ?? 0;
  const oy = input.origin?.y ?? 0;

  // Layout: Video nodes stacked vertically to the right of Storyboard,
  // Scene Composer further right.
  const VIDEO_X = ox + 360;
  const VIDEO_GAP_Y = 280;
  const COMPOSER_X = VIDEO_X + 320;

  // Insert Video nodes
  const videoRows = input.scenes.map((scene, i) => {
    const prompt = scene.cameraMovement
      ? `${scene.prompt}, ${scene.cameraMovement}`
      : scene.prompt;
    const params = {
      prompt,
      enhancedPrompt: prompt, // already detailed English from the LLM
      model: DEFAULT_VIDEO_MODEL,
      aspectRatio: "16:9",
      resolution: "720p",
      duration: scene.duration ?? 5,
      audio: false,
    } satisfies VideoGenerateParams;
    return {
      workflow_id: input.workflowId,
      type: "video_generate" as NodeType,
      position_x: VIDEO_X,
      position_y: oy + i * VIDEO_GAP_Y,
      params,
    };
  });

  const { data: videos, error: vErr } = await supabase
    .from("nodes")
    .insert(videoRows)
    .select();
  if (vErr) throw new Error(vErr.message);

  // Insert Scene Composer node
  const composerY = oy + ((input.scenes.length - 1) * VIDEO_GAP_Y) / 2;
  const { data: composer, error: cErr } = await supabase
    .from("nodes")
    .insert({
      workflow_id: input.workflowId,
      type: "scene_composer",
      position_x: COMPOSER_X,
      position_y: composerY,
      params: { transition: "cut" },
    })
    .select()
    .single();
  if (cErr) throw new Error(cErr.message);

  // Connect each Video node → Scene Composer
  const edgeRows = (videos ?? []).map((v) => ({
    workflow_id: input.workflowId,
    source_node_id: v.id,
    source_handle: "video_output",
    target_node_id: composer.id,
    target_handle: "video_input",
  }));
  const { data: edges, error: eErr } = await supabase
    .from("edges")
    .insert(edgeRows)
    .select();
  if (eErr) throw new Error(eErr.message);

  return {
    nodes: [...(videos as CanvasNodeRow[]), composer as CanvasNodeRow],
    edges: (edges ?? []) as CanvasEdgeRow[],
  };
}

/** Create a single Video node from one storyboard scene. No Scene Composer
 *  is touched; caller decides where to place it. Used by the per-scene "+"
 *  buttons when the user opts out of auto-create. */
export async function createVideoFromScene(input: {
  workflowId: string;
  scene: StoryboardScene;
  position: { x: number; y: number };
}): Promise<CanvasNodeRow> {
  const { supabase } = await authed();
  const prompt = input.scene.cameraMovement
    ? `${input.scene.prompt}, ${input.scene.cameraMovement}`
    : input.scene.prompt;
  const params = {
    prompt,
    enhancedPrompt: prompt,
    model: DEFAULT_VIDEO_MODEL,
    aspectRatio: "16:9",
    resolution: "720p",
    duration: input.scene.duration ?? 5,
    audio: false,
  } satisfies VideoGenerateParams;
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      workflow_id: input.workflowId,
      type: "video_generate",
      position_x: input.position.x,
      position_y: input.position.y,
      params,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CanvasNodeRow;
}

export async function createNode(input: {
  workflowId: string;
  type: NodeType;
  position: { x: number; y: number };
}) {
  const { supabase } = await authed();
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      workflow_id: input.workflowId,
      type: input.type,
      position_x: input.position.x,
      position_y: input.position.y,
      params: DEFAULT_PARAMS[input.type],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateNodePosition(input: {
  id: string;
  position: { x: number; y: number };
}) {
  const { supabase } = await authed();
  const { error } = await supabase
    .from("nodes")
    .update({
      position_x: input.position.x,
      position_y: input.position.y,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function updateNodeParams(input: {
  id: string;
  params: Record<string, unknown>;
}) {
  const { supabase } = await authed();
  const { error } = await supabase
    .from("nodes")
    .update({ params: input.params })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

/** Used by Image Upload node after the client finishes uploading to Storage. */
export async function setNodeOutput(input: {
  id: string;
  output: NodeOutput | null;
  status?: NodeStatus;
  params?: Record<string, unknown>;
}) {
  const { supabase } = await authed();
  const patch: Record<string, unknown> = {
    output: input.output,
    status: input.status ?? (input.output ? "success" : "idle"),
    error: null,
  };
  if (input.params) patch.params = input.params;
  const { error } = await supabase
    .from("nodes")
    .update(patch)
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function deleteNode(id: string) {
  const { supabase } = await authed();
  const { error } = await supabase.from("nodes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createEdge(input: {
  workflowId: string;
  sourceNodeId: string;
  sourceHandle: string;
  targetNodeId: string;
  targetHandle: string;
}) {
  const { supabase } = await authed();
  const { data, error } = await supabase
    .from("edges")
    .insert({
      workflow_id: input.workflowId,
      source_node_id: input.sourceNodeId,
      source_handle: input.sourceHandle,
      target_node_id: input.targetNodeId,
      target_handle: input.targetHandle,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEdge(id: string) {
  const { supabase } = await authed();
  const { error } = await supabase.from("edges").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================================
// Output history (versioning)
// ============================================================

export async function listNodeVersions(
  nodeId: string,
): Promise<NodeOutputHistoryRow[]> {
  const { supabase } = await authed();
  const { data, error } = await supabase
    .from("node_outputs")
    .select("*")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NodeOutputHistoryRow[];
}

/** Make a past version the current "active" output for a node. */
export async function revertNodeToVersion(input: {
  nodeId: string;
  versionId: string;
}) {
  const { supabase } = await authed();
  const { data: version, error: vErr } = await supabase
    .from("node_outputs")
    .select("output, usage")
    .eq("id", input.versionId)
    .eq("node_id", input.nodeId)
    .maybeSingle();
  if (vErr) throw new Error(vErr.message);
  if (!version) throw new Error("Version not found");

  const { error } = await supabase
    .from("nodes")
    .update({
      output: version.output,
      usage: version.usage,
      status: "success",
      error: null,
    })
    .eq("id", input.nodeId);
  if (error) throw new Error(error.message);
}

/** Delete a single version row + the corresponding storage file. */
export async function deleteNodeVersion(versionId: string) {
  const { supabase, user } = await authed();

  // Look up the row first so we can extract the storage path.
  const { data: row, error: rErr } = await supabase
    .from("node_outputs")
    .select("id, output, workflow_id")
    .eq("id", versionId)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (!row) throw new Error("Version not found");

  // Best-effort delete the storage file (path is the public URL suffix
  // after `/object/public/outputs/`). Ignore errors so we don't block the
  // DB delete on transient storage hiccups.
  const url = (row.output as NodeOutput).url;
  const marker = "/object/public/outputs/";
  const idx = url.indexOf(marker);
  if (idx >= 0) {
    const path = decodeURIComponent(url.slice(idx + marker.length));
    // Only allow deleting files in this user's folder.
    if (path.startsWith(`${user.id}/`)) {
      try {
        const svc = createServiceClient();
        await svc.storage.from("outputs").remove([path]);
      } catch (e) {
        console.error("storage delete failed", e);
      }
    }
  }

  const { error } = await supabase
    .from("node_outputs")
    .delete()
    .eq("id", versionId);
  if (error) throw new Error(error.message);
}
