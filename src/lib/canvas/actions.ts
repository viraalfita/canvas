"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_PARAMS,
  type CanvasEdgeRow,
  type CanvasNodeRow,
  type ImageGenerateParams,
  type NodeOutput,
  type NodeOutputHistoryRow,
  type NodeStatus,
  type NodeType,
  type NodeUsage,
  type StoryboardChainMode,
  type StoryboardOutputMode,
  type StoryboardScene,
  type VideoGenerateParams,
} from "./types";
import {
  DEFAULT_VIDEO_MODEL,
  coerceVideoParamsForModel,
} from "@/lib/apimart/video-models";
import {
  DEFAULT_IMAGE_MODEL,
  coerceParamsForModel,
} from "@/lib/apimart/models";

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

/**
 * Deep-clone a workflow: new workflow row + all nodes + all edges + the entire
 * node_outputs history. Output URLs are reused (Supabase Storage files stay
 * shared between the original and the copy — same public bucket, same paths).
 *
 * Returns the new workflow id so the caller can navigate to it.
 */
export async function duplicateWorkflow(id: string): Promise<string> {
  const { supabase, user } = await authed();

  const { data: src, error: wErr } = await supabase
    .from("workflows")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (wErr) throw new Error(wErr.message);
  if (!src) throw new Error("Workflow not found");

  const { data: newWf, error: insErr } = await supabase
    .from("workflows")
    .insert({ user_id: user.id, name: `Copy of ${src.name as string}` })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  const newWfId = newWf.id as string;

  const { data: nodes } = await supabase
    .from("nodes")
    .select("*")
    .eq("workflow_id", id);
  const nodeRows = (nodes ?? []) as CanvasNodeRow[];

  // Insert nodes one-by-one so we capture each new id and build the mapping
  // for edge & history rewrites. (A single bulk insert with .select() also
  // works but Postgres doesn't guarantee row order — safer to map by hand.)
  const idMap = new Map<string, string>();
  for (const n of nodeRows) {
    const { data: copy, error } = await supabase
      .from("nodes")
      .insert({
        workflow_id: newWfId,
        type: n.type,
        position_x: n.position_x,
        position_y: n.position_y,
        params: n.params,
        output: n.output,
        // Skip task ownership — only the original node should poll an
        // in-flight APImart task. The copy starts idle if the source was
        // mid-flight, otherwise mirrors success/failed.
        status:
          n.status === "running" || n.status === "queued" ? "idle" : n.status,
        error: n.error,
        usage: n.usage,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    idMap.set(n.id, copy.id as string);
  }

  const { data: edges } = await supabase
    .from("edges")
    .select("*")
    .eq("workflow_id", id);
  const edgeRows = (edges ?? []) as CanvasEdgeRow[];
  if (edgeRows.length > 0) {
    const remapped = edgeRows
      .map((e) => {
        const s = idMap.get(e.source_node_id);
        const t = idMap.get(e.target_node_id);
        if (!s || !t) return null;
        return {
          workflow_id: newWfId,
          source_node_id: s,
          source_handle: e.source_handle,
          target_node_id: t,
          target_handle: e.target_handle,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (remapped.length > 0) {
      const { error } = await supabase.from("edges").insert(remapped);
      if (error) throw new Error(error.message);
    }
  }

  const { data: history } = await supabase
    .from("node_outputs")
    .select("node_id, output, usage, created_at")
    .eq("workflow_id", id);
  const histRows = (history ?? []) as Array<{
    node_id: string;
    output: NodeOutput;
    usage: NodeUsage | null;
    created_at: string;
  }>;
  if (histRows.length > 0) {
    const remapped = histRows
      .map((h) => {
        const nid = idMap.get(h.node_id);
        if (!nid) return null;
        return {
          node_id: nid,
          workflow_id: newWfId,
          output: h.output,
          usage: h.usage,
          created_at: h.created_at,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (remapped.length > 0) {
      const { error } = await supabase.from("node_outputs").insert(remapped);
      if (error) throw new Error(error.message);
    }
  }

  return newWfId;
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
  /** Output topology: video only, image only, or image → video → composer. */
  outputMode?: StoryboardOutputMode;
  /** How to wire image inputs across scenes (parallel or sequential chain). */
  chainMode?: StoryboardChainMode;
  /** Optional reference image to be applied to every auto-generated scene
   *  as an `image_input` upstream — for character/style consistency. */
  referenceImage?: { url: string; mimeType: string; filename?: string };
}): Promise<{ nodes: CanvasNodeRow[]; edges: CanvasEdgeRow[] }> {
  const { supabase } = await authed();
  if (input.scenes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const mode: StoryboardOutputMode = input.outputMode ?? "video";
  const chain: StoryboardChainMode = input.chainMode ?? "parallel";
  const wantsImages = mode === "image" || mode === "image-then-video";
  const wantsVideos = mode === "video" || mode === "image-then-video";

  const ox = input.origin?.x ?? 0;
  const oy = input.origin?.y ?? 0;
  const GAP_Y = 280;
  const hasRef = !!input.referenceImage;

  // Column layout:
  //   col_ref     col_image    col_video    col_composer
  //   (ref?)      (image?)     (video?)     (video? & need composer)
  let nextX = ox + 360;
  const refX = hasRef ? nextX : null;
  if (hasRef) nextX += 360;

  const imageX = wantsImages ? nextX : null;
  if (wantsImages) nextX += 360;

  const videoX = wantsVideos ? nextX : null;
  if (wantsVideos) nextX += 360;

  const composerX = wantsVideos ? nextX : null;

  // 1) Reference Image Upload node
  let uploadNode: CanvasNodeRow | null = null;
  if (input.referenceImage && refX != null) {
    const { data, error } = await supabase
      .from("nodes")
      .insert({
        workflow_id: input.workflowId,
        type: "image_upload",
        position_x: refX,
        position_y: oy,
        params: { filename: input.referenceImage.filename ?? "reference" },
        output: {
          kind: "image",
          url: input.referenceImage.url,
          mimeType: input.referenceImage.mimeType,
        },
        status: "success",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    uploadNode = data as CanvasNodeRow;
  }

  // 2) Image generate nodes (one per scene)
  let imageNodes: CanvasNodeRow[] = [];
  if (wantsImages && imageX != null) {
    // Coerce against the default model so size/resolution are valid even if
    // the chosen default doesn't accept "9:16" exactly (it does for gpt-image-2,
    // but this keeps things safe if the default model changes later).
    const coercedImg = coerceParamsForModel(DEFAULT_IMAGE_MODEL, {
      size: "9:16",
      resolution: "2K",
    });
    const rows = input.scenes.map((scene, i) => {
      const params = {
        prompt: scene.prompt,
        enhancedPrompt: scene.prompt,
        model: coercedImg.model,
        size: coercedImg.size,
        resolution: coercedImg.resolution,
      } satisfies ImageGenerateParams;
      return {
        workflow_id: input.workflowId,
        type: "image_generate" as NodeType,
        position_x: imageX,
        position_y: oy + i * GAP_Y,
        params,
      };
    });
    const { data, error } = await supabase.from("nodes").insert(rows).select();
    if (error) throw new Error(error.message);
    imageNodes = (data ?? []) as CanvasNodeRow[];
  }

  // 3) Video generate nodes (one per scene)
  let videoNodes: CanvasNodeRow[] = [];
  if (wantsVideos && videoX != null) {
    const rows = input.scenes.map((scene, i) => {
      const prompt = scene.cameraMovement
        ? `${scene.prompt}, ${scene.cameraMovement}`
        : scene.prompt;
      // Coerce per-scene against the default video model so duration falls
      // back to a valid value (e.g. VEO is fixed 8s — scene.duration of 5
      // would produce an invalid select state).
      const coercedVid = coerceVideoParamsForModel(DEFAULT_VIDEO_MODEL, {
        aspectRatio: "9:16",
        resolution: "720p",
        duration: scene.duration,
      });
      const params = {
        prompt,
        enhancedPrompt: prompt,
        model: coercedVid.model,
        aspectRatio: coercedVid.aspectRatio,
        resolution: coercedVid.resolution,
        duration: coercedVid.duration,
        audio: false,
      } satisfies VideoGenerateParams;
      return {
        workflow_id: input.workflowId,
        type: "video_generate" as NodeType,
        position_x: videoX,
        position_y: oy + i * GAP_Y,
        params,
      };
    });
    const { data, error } = await supabase.from("nodes").insert(rows).select();
    if (error) throw new Error(error.message);
    videoNodes = (data ?? []) as CanvasNodeRow[];
  }

  // 4) Scene Composer (only when there are videos to combine)
  let composerNode: CanvasNodeRow | null = null;
  if (wantsVideos && composerX != null) {
    const composerY = oy + ((input.scenes.length - 1) * GAP_Y) / 2;
    const { data, error } = await supabase
      .from("nodes")
      .insert({
        workflow_id: input.workflowId,
        type: "scene_composer",
        position_x: composerX,
        position_y: composerY,
        params: { transition: "cut" },
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    composerNode = data as CanvasNodeRow;
  }

  // 5) Edges
  type EdgeRow = {
    workflow_id: string;
    source_node_id: string;
    source_handle: string;
    target_node_id: string;
    target_handle: string;
  };
  const edgeRows: EdgeRow[] = [];

  // 5a) First-stage targets are Image nodes if they exist, otherwise Videos.
  //     This is what the reference image (if any) and the sequential chain
  //     operate on.
  const firstStage =
    imageNodes.length > 0 ? imageNodes : videoNodes;

  if (chain === "sequential") {
    // Reference → first node only; each scene continues from previous.
    if (uploadNode && firstStage.length > 0) {
      edgeRows.push({
        workflow_id: input.workflowId,
        source_node_id: uploadNode.id,
        source_handle: "image_output",
        target_node_id: firstStage[0].id,
        target_handle: "image_input",
      });
    }
    for (let i = 0; i < firstStage.length - 1; i++) {
      edgeRows.push({
        workflow_id: input.workflowId,
        source_node_id: firstStage[i].id,
        source_handle: "image_output",
        target_node_id: firstStage[i + 1].id,
        target_handle: "image_input",
      });
    }
  } else {
    // Parallel: reference (if any) goes to every first-stage node.
    if (uploadNode) {
      for (const t of firstStage) {
        edgeRows.push({
          workflow_id: input.workflowId,
          source_node_id: uploadNode.id,
          source_handle: "image_output",
          target_node_id: t.id,
          target_handle: "image_input",
        });
      }
    }
  }

  // 5b) Image → Video pairing (image-then-video mode, regardless of chain mode)
  if (mode === "image-then-video" && imageNodes.length === videoNodes.length) {
    for (let i = 0; i < imageNodes.length; i++) {
      edgeRows.push({
        workflow_id: input.workflowId,
        source_node_id: imageNodes[i].id,
        source_handle: "image_output",
        target_node_id: videoNodes[i].id,
        target_handle: "image_input",
      });
    }
  }

  // 5c) Video → Scene Composer
  if (composerNode) {
    for (const v of videoNodes) {
      edgeRows.push({
        workflow_id: input.workflowId,
        source_node_id: v.id,
        source_handle: "video_output",
        target_node_id: composerNode.id,
        target_handle: "video_input",
      });
    }
  }

  let savedEdges: CanvasEdgeRow[] = [];
  if (edgeRows.length > 0) {
    const { data, error } = await supabase
      .from("edges")
      .insert(edgeRows)
      .select();
    if (error) throw new Error(error.message);
    savedEdges = (data ?? []) as CanvasEdgeRow[];
  }

  const allNodes: CanvasNodeRow[] = [
    ...(uploadNode ? [uploadNode] : []),
    ...imageNodes,
    ...videoNodes,
    ...(composerNode ? [composerNode] : []),
  ];
  return { nodes: allNodes, edges: savedEdges };
}

/** Create a single Image Generate node from one storyboard scene. Caller
 *  decides where to place it. Used by per-scene "+ Image" buttons when the
 *  user wants to materialize storyboard frames one by one. */
export async function createImageFromScene(input: {
  workflowId: string;
  scene: StoryboardScene;
  position: { x: number; y: number };
}): Promise<CanvasNodeRow> {
  const { supabase } = await authed();
  const coerced = coerceParamsForModel(DEFAULT_IMAGE_MODEL, {
    size: "9:16",
    resolution: "2K",
  });
  const params = {
    prompt: input.scene.prompt,
    enhancedPrompt: input.scene.prompt,
    model: coerced.model,
    size: coerced.size,
    resolution: coerced.resolution,
  } satisfies ImageGenerateParams;
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      workflow_id: input.workflowId,
      type: "image_generate",
      position_x: input.position.x,
      position_y: input.position.y,
      params,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CanvasNodeRow;
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
  const coerced = coerceVideoParamsForModel(DEFAULT_VIDEO_MODEL, {
    aspectRatio: "9:16",
    resolution: "720p",
    duration: input.scene.duration,
  });
  const params = {
    prompt,
    enhancedPrompt: prompt,
    model: coerced.model,
    aspectRatio: coerced.aspectRatio,
    resolution: coerced.resolution,
    duration: coerced.duration,
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
  // text_prompt nodes have no async work — they're treated as immediately
  // "ready" so downstream readiness checks (which require status='success')
  // pass without the user having to "run" them.
  const initialStatus: NodeStatus =
    input.type === "text_prompt" ? "success" : "idle";
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      workflow_id: input.workflowId,
      type: input.type,
      position_x: input.position.x,
      position_y: input.position.y,
      params: DEFAULT_PARAMS[input.type],
      status: initialStatus,
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

/**
 * Cache an extracted-last-frame URL on the node's params. Used by the client
 * preprocessing step to feed an upstream video's final frame into a Video
 * node as its starting image, enabling visual continuity across scenes.
 *
 * `sourceVideoUrl` lets us invalidate the cache when the upstream regenerates.
 */
export async function setExtractedFrame(input: {
  nodeId: string;
  frameUrl: string;
  sourceVideoUrl: string;
}) {
  const { supabase } = await authed();
  const { data: row, error: rErr } = await supabase
    .from("nodes")
    .select("params")
    .eq("id", input.nodeId)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (!row) throw new Error("Node not found");

  const params = (row.params ?? {}) as Record<string, unknown>;
  const updated = {
    ...params,
    _extractedFrameUrl: input.frameUrl,
    _extractedFromVideoUrl: input.sourceVideoUrl,
  };
  const { error } = await supabase
    .from("nodes")
    .update({ params: updated })
    .eq("id", input.nodeId);
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

/**
 * Bulk-clone several nodes at once, preserving edges that connect *between*
 * the selected set. Used by the Cmd+D / Ctrl+D shortcut after a lasso
 * selection — lets the user stamp a whole sub-graph (e.g. text_prompt +
 * 3 scenes wired together) as a unit.
 *
 * Edges where one endpoint is outside the selection are dropped — the copy
 * is a self-contained island; user rewires inputs from the outer graph
 * manually if needed.
 */
export async function duplicateNodes(
  ids: string[],
): Promise<{ nodes: CanvasNodeRow[]; edges: CanvasEdgeRow[] }> {
  const { supabase } = await authed();
  if (ids.length === 0) return { nodes: [], edges: [] };

  const { data: srcNodes, error: srcErr } = await supabase
    .from("nodes")
    .select("*")
    .in("id", ids);
  if (srcErr) throw new Error(srcErr.message);
  const sourceNodes = (srcNodes ?? []) as CanvasNodeRow[];
  if (sourceNodes.length === 0) return { nodes: [], edges: [] };

  // Insert clones one-by-one so we can capture each new id and map it to
  // the original — needed for edge & history rewrites.
  const idMap = new Map<string, string>();
  const newNodes: CanvasNodeRow[] = [];
  for (const n of sourceNodes) {
    const { data: copy, error } = await supabase
      .from("nodes")
      .insert({
        workflow_id: n.workflow_id,
        type: n.type,
        position_x: n.position_x + 40,
        position_y: n.position_y + 40,
        params: n.params,
        output: n.output,
        // Don't claim an in-flight task on the original — clone starts idle.
        status:
          n.status === "running" || n.status === "queued" ? "idle" : n.status,
        error: n.error,
        usage: n.usage,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    idMap.set(n.id, copy.id as string);
    newNodes.push(copy as CanvasNodeRow);
  }

  // Edges where BOTH endpoints are in the selection — chained `.in()` calls
  // AND together in Supabase.
  const { data: edges } = await supabase
    .from("edges")
    .select("*")
    .in("source_node_id", ids)
    .in("target_node_id", ids);
  const sourceEdges = (edges ?? []) as CanvasEdgeRow[];

  let newEdges: CanvasEdgeRow[] = [];
  if (sourceEdges.length > 0) {
    const remapped = sourceEdges
      .map((e) => {
        const s = idMap.get(e.source_node_id);
        const t = idMap.get(e.target_node_id);
        if (!s || !t) return null;
        return {
          workflow_id: e.workflow_id,
          source_node_id: s,
          source_handle: e.source_handle,
          target_node_id: t,
          target_handle: e.target_handle,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (remapped.length > 0) {
      const { data: inserted, error } = await supabase
        .from("edges")
        .insert(remapped)
        .select();
      if (error) throw new Error(error.message);
      newEdges = (inserted ?? []) as CanvasEdgeRow[];
    }
  }

  // Mirror history per node (parallel — independent writes).
  await Promise.all(
    sourceNodes.map(async (src) => {
      const newId = idMap.get(src.id);
      if (!newId) return;
      const { data: history } = await supabase
        .from("node_outputs")
        .select("output, usage, created_at")
        .eq("node_id", src.id);
      const histRows = (history ?? []) as Array<{
        output: NodeOutput;
        usage: NodeUsage | null;
        created_at: string;
      }>;
      if (histRows.length === 0) return;
      const remapped = histRows.map((h) => ({
        node_id: newId,
        workflow_id: src.workflow_id,
        output: h.output,
        usage: h.usage,
        created_at: h.created_at,
      }));
      const { error } = await supabase.from("node_outputs").insert(remapped);
      if (error) throw new Error(error.message);
    }),
  );

  return { nodes: newNodes, edges: newEdges };
}

/**
 * Fork-clone a single node: same type/params/output/history with a small
 * positional offset so it's visible next to the original. Edges are NOT
 * copied — caller can rewire as needed. Returns the new row so the client
 * can append to its store immediately.
 */
export async function duplicateNode(id: string): Promise<CanvasNodeRow> {
  const { supabase } = await authed();

  const { data: src, error: srcErr } = await supabase
    .from("nodes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (srcErr) throw new Error(srcErr.message);
  if (!src) throw new Error("Node not found");
  const source = src as CanvasNodeRow;

  const { data: copy, error: insErr } = await supabase
    .from("nodes")
    .insert({
      workflow_id: source.workflow_id,
      type: source.type,
      position_x: source.position_x + 40,
      position_y: source.position_y + 40,
      params: source.params,
      output: source.output,
      // Don't claim the original's in-flight task — only the source node
      // should consume that completion. Reset to idle so the user can rerun
      // independently.
      status:
        source.status === "running" || source.status === "queued"
          ? "idle"
          : source.status,
      error: source.error,
      usage: source.usage,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);
  const newNode = copy as CanvasNodeRow;

  // Mirror history so the copy carries the same version timeline.
  const { data: history } = await supabase
    .from("node_outputs")
    .select("output, usage, created_at")
    .eq("node_id", id);
  const histRows = (history ?? []) as Array<{
    output: NodeOutput;
    usage: NodeUsage | null;
    created_at: string;
  }>;
  if (histRows.length > 0) {
    const remapped = histRows.map((h) => ({
      node_id: newNode.id,
      workflow_id: newNode.workflow_id,
      output: h.output,
      usage: h.usage,
      created_at: h.created_at,
    }));
    const { error } = await supabase.from("node_outputs").insert(remapped);
    if (error) throw new Error(error.message);
  }

  return newNode;
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
