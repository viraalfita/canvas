"use client";

/**
 * Client-side preprocessing for Video → Video chains.
 *
 * VEO and most image-input video models can't consume video directly. To
 * chain scenes, we extract the upstream video's last frame in-browser via
 * ffmpeg.wasm, upload it to Supabase Storage, and store its URL in the
 * downstream Video node's params. The server then uses that URL as the
 * scene's starting image when it dispatches the generation.
 *
 * Idempotent: cached by source video URL — re-runs only when upstream changed.
 */

import { setExtractedFrame } from "./actions";
import { useCanvasStore, type FlowNodeData } from "./store";
import { createClient } from "@/lib/supabase/client";
import { extractLastFrame } from "@/lib/video/extract";

type Pending = {
  nodeId: string;
  sourceVideoUrl: string;
};

let inflight = false;

/**
 * Walk the canvas graph; for any Video node whose upstream has a successful
 * Video output AND whose `_extractedFromVideoUrl` cache is missing/stale,
 * extract the last frame, upload, and persist via server action.
 *
 * Returns a list of node ids that got freshly preprocessed (caller may want
 * to trigger a tick afterwards so they get dispatched).
 */
export async function preprocessUpstreamVideos(): Promise<string[]> {
  if (inflight) return [];
  inflight = true;
  try {
    const { nodes, edges, workflowId } = useCanvasStore.getState();
    if (!workflowId) return [];

    const pending: Pending[] = [];
    for (const node of nodes) {
      const data = node.data as FlowNodeData;
      if (data.nodeType !== "video_generate") continue;
      if (data.status === "running" || data.status === "queued") continue;

      // Find upstream nodes whose output is a video
      const incoming = edges.filter((e) => e.target === node.id);
      const upstreamVideos = incoming
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
        .filter((n) => {
          const upd = n.data as FlowNodeData;
          return (
            upd.output?.kind === "video" &&
            upd.status === "success" &&
            !!upd.output.url
          );
        });
      if (upstreamVideos.length === 0) continue;

      const sourceUrl = (upstreamVideos[0].data as FlowNodeData).output!.url;
      const params = data.params as Record<string, unknown>;
      const cachedFrom = params._extractedFromVideoUrl as string | undefined;
      if (cachedFrom === sourceUrl) continue; // already extracted from this exact video

      pending.push({ nodeId: node.id, sourceVideoUrl: sourceUrl });
    }

    if (pending.length === 0) return [];

    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return [];

    const updated: string[] = [];
    for (const job of pending) {
      try {
        // 1) Extract the last frame in-browser
        const blob = await extractLastFrame(job.sourceVideoUrl);

        // 2) Upload to Storage so APImart can fetch it via URL
        const path = `${userRes.user.id}/${workflowId}/lastframe-${job.nodeId}-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("outputs")
          .upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage
          .from("outputs")
          .getPublicUrl(path);

        // 3) Cache the URL in node.params
        await setExtractedFrame({
          nodeId: job.nodeId,
          frameUrl: pub.publicUrl,
          sourceVideoUrl: job.sourceVideoUrl,
        });

        // 4) Mirror into local store so subsequent polling cycles can see it
        useCanvasStore.getState().patchNodeData(job.nodeId, {
          params: {
            ...((useCanvasStore
              .getState()
              .nodes.find((n) => n.id === job.nodeId)?.data as FlowNodeData)
              ?.params ?? {}),
            _extractedFrameUrl: pub.publicUrl,
            _extractedFromVideoUrl: job.sourceVideoUrl,
          },
        });

        updated.push(job.nodeId);
      } catch (e) {
        console.error("preprocessUpstreamVideos failed", job, e);
      }
    }
    return updated;
  } finally {
    inflight = false;
  }
}
