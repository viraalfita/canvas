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
 *  generation succeeds; failed runs are not recorded.
 *
 *  Dedupes against the most recent row by URL — if two polling ticks race and
 *  both see the same task as completed, we only insert one history row.
 */
async function recordHistory(
  ctx: WorkflowContext,
  nodeId: string,
  output: NodeOutput,
  usage: NodeUsage | null,
) {
  const { data: latest } = await ctx.supabase
    .from("node_outputs")
    .select("output")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestUrl = (latest?.output as NodeOutput | undefined)?.url;
  if (latestUrl && latestUrl === output.url) {
    // Same content as the most recent row — skip duplicate insert.
    return;
  }

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
  } as Partial<VideoGenerateParams> & {
    _extractedFrameUrl?: string;
  };

  // If a previous tick extracted the last frame from an upstream Video, use
  // it as the FIRST image input — it represents this scene's starting frame
  // and gives visual continuity with the previous scene.
  const finalImageUrls = merged._extractedFrameUrl
    ? [merged._extractedFrameUrl, ...upstreamImageUrls]
    : upstreamImageUrls;
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
      imageUrls: finalImageUrls.length ? finalImageUrls : undefined,
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

/** Whether a node type spends APImart tokens / takes meaningful time. Used by
 *  sequential mode to decide what counts as "currently busy". Export, upload,
 *  storyboard, scene_composer don't burn tokens or run async via APImart. */
function isApimartBacked(t: string): boolean {
  return (
    t === "image_generate" ||
    t === "image_edit" ||
    t === "image_merge" ||
    t === "video_generate"
  );
}

/** Returns true if the node depends on a Video output but the client hasn't
 *  yet extracted its last frame. Used to defer dispatch until preprocessing
 *  finishes. */
function isAwaitingFrameExtraction(
  node: CanvasNodeRow,
  upstream: { outputs: NodeOutput[]; usages: (NodeUsage | null)[] },
): boolean {
  if ((node.type as string) !== "video_generate") return false;
  const hasUpstreamVideo = upstream.outputs.some((o) => o.kind === "video");
  if (!hasUpstreamVideo) return false;
  const params = node.params as Record<string, unknown>;
  return !params._extractedFrameUrl;
}

async function dispatchSingle(
  ctx: WorkflowContext,
  node: CanvasNodeRow,
  upstream: { outputs: NodeOutput[]; usages: (NodeUsage | null)[] },
) {
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
  // image_upload, storyboard, scene_composer: not dispatched here.
}

/**
 * Process nodes that are currently "ready" (deps satisfied).
 *
 * - In **parallel** mode (default): every ready node fires immediately.
 * - In **sequential** mode: at most ONE token-spending node is ever submitted
 *   per call. If something is already running, do nothing. Otherwise submit
 *   the first ready node and return. Cheap "instant" nodes (export) are still
 *   resolved in the same pass to avoid stalling the queue on free work.
 */
async function dispatchReadyNodes(
  ctx: WorkflowContext,
  opts: { sequential?: boolean } = {},
) {
  const { nodes, edges } = await loadGraph(ctx);

  if (opts.sequential) {
    // If anything is already running, hold off — wait for it to finish.
    const busy = nodes.some(
      (n) => n.status === "running" || n.status === "queued",
    );
    if (busy) return;

    for (const node of nodes) {
      if (node.status !== "idle" && node.status !== "queued") continue;
      if (readinessOf(node, nodes, edges) !== "ready") continue;
      const upstream = collectUpstream(node, nodes, edges);
      // Hold the dispatch if the client still needs to extract an upstream
      // video's last frame. The next polling tick will retry once the
      // preprocess step caches the frame URL.
      if (isAwaitingFrameExtraction(node, upstream)) continue;
      await dispatchSingle(ctx, node, upstream);
      // Stop after the first token-spending dispatch so the user can review
      // before the next one fires. Cheap nodes (export) finish synchronously
      // and we keep looping to drain them.
      if (isApimartBacked(node.type as string)) return;
    }
    return;
  }

  // Parallel mode — fire everything that's ready.
  for (const node of nodes) {
    if (node.status !== "idle" && node.status !== "queued") continue;
    if (readinessOf(node, nodes, edges) !== "ready") continue;
    const upstream = collectUpstream(node, nodes, edges);
    if (isAwaitingFrameExtraction(node, upstream)) continue;
    await dispatchSingle(ctx, node, upstream);
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
        // Atomic claim — only one tick wins the right to process this
        // completion. We clear `apimart_task_id` ONLY IF it still equals
        // what we read at the start of this tick. If another tick already
        // cleared it, this UPDATE matches 0 rows → we skip. This prevents
        // the duplicate uploads + duplicate history rows that happened when
        // overlapping ticks both saw the task as "completed".
        const { data: claimed } = await ctx.supabase
          .from("nodes")
          .update({ apimart_task_id: null })
          .eq("id", node.id)
          .eq("apimart_task_id", node.apimart_task_id)
          .select("id")
          .maybeSingle();
        if (!claimed) {
          continue; // another tick already owns this completion
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
      } else {
        // Still running — surface progress + ETA on the node so the UI can
        // show a percentage bar instead of an opaque "running" state.
        const prevUsage = (node.usage ?? {}) as NodeUsage;
        const progress =
          typeof res.data.progress === "number"
            ? res.data.progress
            : prevUsage.progress;
        const estimatedTime =
          typeof res.data.estimated_time === "number"
            ? res.data.estimated_time
            : prevUsage.estimatedTime;
        if (
          progress !== prevUsage.progress ||
          estimatedTime !== prevUsage.estimatedTime
        ) {
          await setNode(ctx, node.id, {
            usage: { ...prevUsage, progress, estimatedTime },
          });
        }
      }
    } catch (e) {
      await setNode(ctx, node.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export async function runWorkflow(
  ctx: WorkflowContext,
  opts: { sequential?: boolean } = {},
) {
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
  await dispatchReadyNodes(ctx, { sequential: opts.sequential });
}

export async function tickWorkflow(
  ctx: WorkflowContext,
  opts: {
    /** When true (Run all), dispatch any newly-ready downstream nodes after
     *  polling. When false (per-node Run), only poll the running task — no
     *  cascade through the dependency graph. Defaults to true. */
    cascade?: boolean;
    /** When true, only one token-spending node is dispatched per tick — wait
     *  for it to finish before firing the next. Saves tokens when an early
     *  scene's output is bad and the user wants to abort. */
    sequential?: boolean;
  } = {},
) {
  await pollRunningNodes(ctx);
  if (opts.cascade !== false) {
    await dispatchReadyNodes(ctx, { sequential: opts.sequential });
  }
  const { nodes, edges } = await loadGraph(ctx);
  const hasRunningOrQueued = nodes.some(
    (n) => n.status === "running" || n.status === "queued",
  );
  // Keep polling alive while any Video node is idle but its upstream Video
  // hasn't been frame-extracted yet — the client preprocess step running
  // alongside this tick will eventually fill in `_extractedFrameUrl`.
  const hasAwaitingPreprocess = nodes.some((node) => {
    if ((node.type as string) !== "video_generate") return false;
    if (node.status !== "idle") return false;
    const inc = incomingEdges(edges, node.id);
    const hasVideoUpstream = inc.some((e) => {
      const src = findNode(nodes, e.source_node_id);
      return (
        src?.output?.kind === "video" &&
        src.status === "success" &&
        !!src.output.url
      );
    });
    if (!hasVideoUpstream) return false;
    const params = node.params as Record<string, unknown>;
    return !params._extractedFrameUrl;
  });
  const hasPending = hasRunningOrQueued || hasAwaitingPreprocess;
  return { hasPending, nodes };
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
