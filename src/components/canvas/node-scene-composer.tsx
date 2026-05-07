"use client";

import { useMemo, useState } from "react";
import {
  Handle,
  Position,
  useNodeId,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { FilmIcon, Loader2Icon } from "lucide-react";
import { NodeShell } from "./node-shell";
import { DownloadButton } from "./download-button";
import { setNodeOutput } from "@/lib/canvas/actions";
import { useCanvasStore, type FlowNodeData } from "@/lib/canvas/store";
import { createClient } from "@/lib/supabase/client";
import { concatVideos } from "@/lib/video/concat";
import type { NodeOutput } from "@/lib/canvas/types";

type UpstreamClip = {
  nodeId: string;
  url: string;
  status: string;
};

export function SceneComposerNode({ data }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const reactFlow = useReactFlow();
  const workflowId = useCanvasStore((s) => s.workflowId);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const allNodes = useCanvasStore((s) => s.nodes);
  const allEdges = useCanvasStore((s) => s.edges);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Walk upstream edges → ordered list of video clips. Order = the order
  // edges were added (Postgres returns by id which is gen_random_uuid, so
  // insertion order isn't guaranteed; we sort by source node y-position
  // instead so the "topmost" video plays first — matches visual layout).
  const upstream = useMemo<UpstreamClip[]>(() => {
    const incoming = allEdges.filter((e) => e.target === id);
    const sourceNodeIds = incoming.map((e) => e.source);
    const sourceNodes = allNodes.filter((n) => sourceNodeIds.includes(n.id));
    sourceNodes.sort((a, b) => a.position.y - b.position.y);
    return sourceNodes
      .map((n) => {
        const output = (n.data as FlowNodeData).output;
        if (!output || output.kind !== "video") return null;
        return {
          nodeId: n.id,
          url: output.url,
          status: (n.data as FlowNodeData).status,
        };
      })
      .filter(Boolean) as UpstreamClip[];
  }, [allEdges, allNodes, id]);

  // All upstream nodes (including those without video output yet) — used
  // to show "X / Y videos ready" status.
  const upstreamNodeCount = useMemo(
    () => allEdges.filter((e) => e.target === id).length,
    [allEdges, id],
  );
  const readyCount = upstream.length;

  async function onCompose() {
    if (!workflowId) return;
    if (upstream.length === 0) {
      setLocalError("Connect at least 1 video output first");
      return;
    }
    setBusy(true);
    setLocalError(null);
    setProgress(0);
    setStage("loading ffmpeg…");
    patchNodeData(id, { status: "running", error: null });
    try {
      const supabase = createClient();
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not authenticated");

      setStage(`concatenating ${upstream.length} clips…`);
      let blob: Blob;
      try {
        // First try fast stream-copy
        blob = await concatVideos(
          upstream.map((u) => u.url),
          { onProgress: (r) => setProgress(r) },
        );
      } catch (e) {
        // Fall back to re-encode if codec params don't match
        setStage("transcoding (codec mismatch)…");
        setProgress(0);
        blob = await concatVideos(
          upstream.map((u) => u.url),
          { transcode: true, onProgress: (r) => setProgress(r) },
        );
        void e;
      }

      setStage("uploading…");
      const path = `${userRes.user.id}/${workflowId}/composed-${id}-${Date.now()}.mp4`;
      const { error: upErr } = await supabase.storage
        .from("outputs")
        .upload(path, blob, { contentType: "video/mp4", upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("outputs").getPublicUrl(path);
      const output: NodeOutput = {
        kind: "video",
        url: pub.publicUrl,
        mimeType: "video/mp4",
      };
      await setNodeOutput({ id, output, status: "success" });
      patchNodeData(id, { status: "success", output, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      patchNodeData(id, { status: "failed", error: msg });
    } finally {
      setBusy(false);
      setStage("");
      setProgress(0);
    }
  }

  // We attach the React Flow ref to silence the unused-import warning.
  void reactFlow;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="video_input"
        className="!h-3 !w-3 !bg-purple-500"
      />
      <NodeShell
        title="Scene Composer"
        status={d.status}
        error={d.error ?? localError}
        className="w-72"
      >
        <p className="text-[10px] text-neutral-500">
          Connect 2+ video outputs to the purple input handle
        </p>
        <div className="rounded-md border border-neutral-800 bg-neutral-950/40 p-2 text-[10px] text-neutral-400">
          <div className="flex items-center gap-1">
            <FilmIcon className="h-3 w-3" />
            <span>
              {readyCount} / {upstreamNodeCount} clip
              {upstreamNodeCount === 1 ? "" : "s"} ready
            </span>
          </div>
          {upstream.length > 0 && (
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-neutral-500">
              {upstream.map((c, i) => (
                <li key={c.nodeId} className="truncate">
                  scene {i + 1} · {c.status}
                </li>
              ))}
            </ol>
          )}
        </div>
        <button
          type="button"
          onClick={onCompose}
          disabled={busy || upstream.length === 0}
          className="flex w-full items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FilmIcon className="h-3.5 w-3.5" />
          )}
          {busy ? stage || "composing…" : "Compose"}
        </button>
        {busy && progress > 0 && (
          <div className="h-1 w-full overflow-hidden rounded bg-neutral-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {d.output?.kind === "video" && (
          <>
            <video
              src={d.output.url}
              controls
              className="mt-1 w-full rounded-md border border-neutral-800"
            />
            <DownloadButton output={d.output} prefix="composed-video" />
          </>
        )}
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="video_output"
        className="!h-3 !w-3 !bg-purple-500"
      />
    </>
  );
}
