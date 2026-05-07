import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTask,
  submitImageGenerate,
  submitVideoGenerate,
} from "@/lib/apimart/client";
import { DEFAULT_IMAGE_MODEL } from "@/lib/apimart/models";
import { DEFAULT_VIDEO_MODEL } from "@/lib/apimart/video-models";
import { persistRemoteUrl } from "@/lib/storage";
import type {
  CanvasEdgeRow,
  CanvasNodeRow,
  ImageGenerateParams,
  NodeOutput,
  NodeUsage,
  VideoGenerateParams,
} from "@/lib/canvas/types";

export type WorkflowContext = {
  supabase: SupabaseClient;
  userId: string;
  workflowId: string;
};

async function loadGraph(ctx: WorkflowContext) {
  const [{ data: nodes, error: nErr }, { data: edges, error: eErr }] =
    await Promise.all([
      ctx.supabase.from("nodes").select("*").eq("workflow_id", ctx.workflowId),
      ctx.supabase.from("edges").select("*").eq("workflow_id", ctx.workflowId),
    ]);
  if (nErr) throw new Error(nErr.message);
  if (eErr) throw new Error(eErr.message);
  return {
    nodes: (nodes ?? []) as CanvasNodeRow[],
    edges: (edges ?? []) as CanvasEdgeRow[],
  };
}

function incomingEdges(edges: CanvasEdgeRow[], nodeId: string) {
  return edges.filter((e) => e.target_node_id === nodeId);
}

function findNode(nodes: CanvasNodeRow[], id: string) {
  return nodes.find((n) => n.id === id);
}

/**
 * A node is "ready to run" when all of its upstream nodes are in `success`.
 * It's still waiting if any upstream is queued/running, and skipped if any failed.
 */
function readinessOf(
  node: CanvasNodeRow,
  nodes: CanvasNodeRow[],
  edges: CanvasEdgeRow[],
): "ready" | "waiting" | "blocked" {
  const incoming = incomingEdges(edges, node.id);
  if (incoming.length === 0) return "ready";
  let waiting = false;
  for (const e of incoming) {
    const src = findNode(nodes, e.source_node_id);
    if (!src) return "blocked";
    if (src.status === "failed") return "blocked";
    if (src.status !== "success") waiting = true;
  }
  return waiting ? "waiting" : "ready";
}

async function setNode(
  ctx: WorkflowContext,
  id: string,
  patch: Partial<
    Pick<
      CanvasNodeRow,
      "status" | "apimart_task_id" | "error" | "output" | "usage"
    >
  >,
) {
  const { error } = await ctx.supabase.from("nodes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Append a new entry to the node's output history. Called whenever a
 *  generation succeeds; failed runs are not recorded. */
async function recordHistory(
  ctx: WorkflowContext,
  nodeId: string,
  output: NodeOutput,
  usage: NodeUsage | null,
) {
  const { error } = await ctx.supabase.from("node_outputs").insert({
    node_id: nodeId,
    workflow_id: ctx.workflowId,
    output,
    usage,
  });
  if (error) {
    // Don't fail the run because history append failed; just log.
    console.error("recordHistory failed", error);
  }
}

/** Submit an image_generate node to APImart.
 *  `overrideParams` lets callers (e.g. branch-from-version) regenerate with
 *  different prompt/model/etc without mutating node.params. */
async function submitImageNode(
  ctx: WorkflowContext,
  node: CanvasNodeRow,
  upstreamImageUrls: string[],
  overrideParams?: Partial<ImageGenerateParams>,
) {
  const merged = {
    ...(node.params as Partial<ImageGenerateParams>),
    ...overrideParams,
  } as Partial<ImageGenerateParams>;
  // Prefer the LLM-enhanced prompt when it has content; otherwise fall back
  // to the user's raw idea.
  const effectivePrompt =
    merged.enhancedPrompt?.trim() || merged.prompt?.trim() || "";
  if (!effectivePrompt) {
    await setNode(ctx, node.id, {
      status: "failed",
      error: "Prompt is required",
    });
    return;
  }
  try {
    const model = merged.model ?? DEFAULT_IMAGE_MODEL;
    const { taskId } = await submitImageGenerate({
      prompt: effectivePrompt,
      model,
      size: merged.size,
      resolution: merged.resolution,
      imageUrls: upstreamImageUrls.length ? upstreamImageUrls : undefined,
    });
    await setNode(ctx, node.id, {
      status: "running",
      apimart_task_id: taskId,
      error: null,
      usage: { model } satisfies NodeUsage,
    });
  } catch (e) {
    await setNode(ctx, node.id, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Submit a video_generate node to APImart. */
async function submitVideoNode(
  ctx: WorkflowContext,
  node: CanvasNodeRow,
  upstreamImageUrls: string[],
  overrideParams?: Partial<VideoGenerateParams>,
) {
  const merged = {
    ...(node.params as Partial<VideoGenerateParams>),
    ...overrideParams,
  } as Partial<VideoGenerateParams>;
  const effectivePrompt =
    merged.enhancedPrompt?.trim() || merged.prompt?.trim() || "";
  if (!effectivePrompt) {
    await setNode(ctx, node.id, {
      status: "failed",
      error: "Prompt is required",
    });
    return;
  }
  try {
    const model = merged.model ?? DEFAULT_VIDEO_MODEL;
    const { taskId } = await submitVideoGenerate({
      prompt: effectivePrompt,
      model,
      aspectRatio: merged.aspectRatio,
      resolution: merged.resolution,
      duration: merged.duration,
      audio: merged.audio,
      imageUrls: upstreamImageUrls.length ? upstreamImageUrls : undefined,
    });
    await setNode(ctx, node.id, {
      status: "running",
      apimart_task_id: taskId,
      error: null,
      usage: { model } satisfies NodeUsage,
    });
  } catch (e) {
    await setNode(ctx, node.id, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** "Resolve" an export node: mirror its single upstream output + usage. */
async function resolveExportNode(
  ctx: WorkflowContext,
  node: CanvasNodeRow,
  upstreamOutput: NodeOutput | null,
  upstreamUsage: NodeUsage | null,
) {
  if (!upstreamOutput) {
    await setNode(ctx, node.id, {
      status: "failed",
      error: "No upstream output to export",
    });
    return;
  }
  await setNode(ctx, node.id, {
    status: "success",
    output: upstreamOutput,
    error: null,
    usage: upstreamUsage,
  });
}

function collectUpstream(
  node: CanvasNodeRow,
  nodes: CanvasNodeRow[],
  edges: CanvasEdgeRow[],
) {
  const inc = incomingEdges(edges, node.id);
  const outputs: NodeOutput[] = [];
  const usages: (NodeUsage | null)[] = [];
  for (const e of inc) {
    const src = findNode(nodes, e.source_node_id);
    if (src?.output) outputs.push(src.output);
    if (src) usages.push(src.usage);
  }
  return { outputs, usages };
}

/**
 * Process every node that is currently "ready" (or idle with no inputs).
 * Image nodes get submitted to APImart; export nodes propagate immediately.
 */
async function dispatchReadyNodes(ctx: WorkflowContext) {
  const { nodes, edges } = await loadGraph(ctx);
  for (const node of nodes) {
    if (node.status !== "idle" && node.status !== "queued") continue;
    if (readinessOf(node, nodes, edges) !== "ready") continue;

    const upstream = collectUpstream(node, nodes, edges);

    // Legacy types image_edit / image_merge are accepted as string until the
    // DB migration runs; treat them identically to image_generate.
    const t = node.type as string;
    if (t === "image_generate" || t === "image_edit" || t === "image_merge") {
      const upstreamImages = upstream.outputs
        .filter((o) => o.kind === "image")
        .map((o) => o.url);
      // Image Generate handles T2I, edit, and merge — upstream images optional.
      await submitImageNode(ctx, node, upstreamImages);
    } else if (t === "video_generate") {
      const upstreamImages = upstream.outputs
        .filter((o) => o.kind === "image")
        .map((o) => o.url);
      await submitVideoNode(ctx, node, upstreamImages);
    } else if (t === "export") {
      await resolveExportNode(
        ctx,
        node,
        upstream.outputs[0] ?? null,
        upstream.usages[0] ?? null,
      );
    }
    // image_upload nodes don't get dispatched here — their output is set
    // directly from the client when the user picks a file.
  }
}

/** Poll APImart for any running node and apply the result. */
async function pollRunningNodes(ctx: WorkflowContext) {
  const { data: running, error } = await ctx.supabase
    .from("nodes")
    .select("*")
    .eq("workflow_id", ctx.workflowId)
    .eq("status", "running");
  if (error) throw new Error(error.message);
  for (const node of (running ?? []) as CanvasNodeRow[]) {
    if (!node.apimart_task_id) continue;
    try {
      const res = await getTask(node.apimart_task_id);
      const status = res.data.status;
      if (status === "completed") {
        const remoteUrl =
          res.data.result?.images?.[0]?.url?.[0] ??
          res.data.result?.videos?.[0]?.url?.[0];
        if (!remoteUrl) {
          await setNode(ctx, node.id, {
            status: "failed",
            error: "Completed task has no output URL",
          });
          continue;
        }
        const isVideo = !!res.data.result?.videos?.[0];
        const stored = await persistRemoteUrl({
          userId: ctx.userId,
          workflowId: ctx.workflowId,
          nodeId: node.id,
          url: remoteUrl,
          ext: isVideo ? "mp4" : undefined,
        });
        const output: NodeOutput = isVideo
          ? {
              kind: "video",
              url: stored.url,
              mimeType: stored.contentType,
              thumbnailUrl: res.data.result?.thumbnail_url,
            }
          : {
              kind: "image",
              url: stored.url,
              mimeType: stored.contentType,
            };
        const prevUsage = (node.usage ?? {}) as NodeUsage;
        const usage: NodeUsage = {
          model: prevUsage.model,
          actualTime: res.data.actual_time,
          estimatedTime: res.data.estimated_time,
          completedAt: res.data.completed,
        };
        await setNode(ctx, node.id, {
          status: "success",
          output,
          error: null,
          usage,
        });
        await recordHistory(ctx, node.id, output, usage);
      } else if (status === "failed" || status === "cancelled") {
        await setNode(ctx, node.id, {
          status: "failed",
          error: res.data.error?.message ?? `Task ${status}`,
        });
      }
      // else: still running, leave as-is
    } catch (e) {
      await setNode(ctx, node.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export async function runWorkflow(ctx: WorkflowContext) {
  // Reset previously-finished nodes so they can re-run. Skip `image_upload`
  // because their output is user-provided, not generated.
  await ctx.supabase
    .from("nodes")
    .update({
      status: "idle",
      error: null,
      output: null,
      apimart_task_id: null,
      usage: null,
    })
    .eq("workflow_id", ctx.workflowId)
    .in("status", ["failed", "success"])
    .neq("type", "image_upload");
  await dispatchReadyNodes(ctx);
}

export async function tickWorkflow(ctx: WorkflowContext) {
  await pollRunningNodes(ctx);
  await dispatchReadyNodes(ctx);
  const { data: nodes } = await ctx.supabase
    .from("nodes")
    .select("*")
    .eq("workflow_id", ctx.workflowId);
  const rows = (nodes ?? []) as CanvasNodeRow[];
  const hasPending = rows.some(
    (n) => n.status === "running" || n.status === "queued",
  );
  return { hasPending, nodes: rows };
}

/**
 * Run a single node by id. Resets the node first, then dispatches it directly.
 * Useful for re-trying or running individual steps without resetting the whole workflow.
 *
 * - If the node has unmet upstream dependencies, returns `{ ok: false, reason }`.
 * - If upstream succeeded, uses their outputs.
 * - For T2I nodes without upstream, just submits standalone.
 */
export async function runSingleNode(ctx: WorkflowContext, nodeId: string) {
  // Look up first so we can avoid wiping user-uploaded content.
  const { nodes: nodesPre } = await loadGraph(ctx);
  const target = nodesPre.find((n) => n.id === nodeId);
  if (!target) return { ok: false as const, reason: "Node not found" };
  if (target.type === "image_upload") {
    return {
      ok: false as const,
      reason: "Image Upload nodes are managed via the file picker.",
    };
  }

  // Reset just this node
  await ctx.supabase
    .from("nodes")
    .update({
      status: "idle",
      error: null,
      output: null,
      apimart_task_id: null,
      usage: null,
    })
    .eq("id", nodeId)
    .eq("workflow_id", ctx.workflowId);

  const { nodes, edges } = await loadGraph(ctx);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false as const, reason: "Node not found" };

  const ready = readinessOf(node, nodes, edges);
  if (ready === "blocked") {
    return {
      ok: false as const,
      reason: "An upstream node failed; fix and retry it first.",
    };
  }
  if (ready === "waiting") {
    return {
      ok: false as const,
      reason: "Upstream nodes haven't produced output yet. Run them first.",
    };
  }

  const upstream = collectUpstream(node, nodes, edges);
  const t = node.type as string;
  if (t === "image_generate" || t === "image_edit" || t === "image_merge") {
    const upstreamImages = upstream.outputs
      .filter((o) => o.kind === "image")
      .map((o) => o.url);
    await submitImageNode(ctx, node, upstreamImages);
  } else if (t === "video_generate") {
    const upstreamImages = upstream.outputs
      .filter((o) => o.kind === "image")
      .map((o) => o.url);
    await submitVideoNode(ctx, node, upstreamImages);
  } else if (t === "export") {
    await resolveExportNode(
      ctx,
      node,
      upstream.outputs[0] ?? null,
      upstream.usages[0] ?? null,
    );
  }
  return { ok: true as const };
}

/**
 * Regenerate a node using overridden params, optionally feeding a specific
 * past version's URL as the image input. Used by the "edit version" pencil
 * button — lets the user iterate variations without mutating node.params.
 */
export async function branchNode(
  ctx: WorkflowContext,
  nodeId: string,
  overrideParams: Record<string, unknown>,
  imageUrl: string | null,
) {
  const { nodes } = await loadGraph(ctx);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false as const, reason: "Node not found" };

  const t = node.type as string;
  // Mark running before APImart call so polling picks it up.
  await setNode(ctx, nodeId, {
    status: "running",
    apimart_task_id: null,
    error: null,
  });

  const imageUrls = imageUrl ? [imageUrl] : [];

  if (t === "image_generate" || t === "image_edit" || t === "image_merge") {
    await submitImageNode(
      ctx,
      node,
      imageUrls,
      overrideParams as Partial<ImageGenerateParams>,
    );
  } else if (t === "video_generate") {
    await submitVideoNode(
      ctx,
      node,
      imageUrls,
      overrideParams as Partial<VideoGenerateParams>,
    );
  } else {
    return { ok: false as const, reason: `Branch unsupported for ${t}` };
  }
  return { ok: true as const };
}
