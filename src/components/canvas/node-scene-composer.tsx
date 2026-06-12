"use client";

import { useMemo, useState } from "react";
import {
  Handle,
  Position,
  useNodeId,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import { FilmIcon, GripVerticalIcon, Loader2Icon } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NodeResizerShell } from "./node-resizer-shell";
import { DownloadButton } from "./download-button";
import { MediaLightbox } from "./media-lightbox";
import { LazyVideo } from "./lazy-video";
import { setNodeOutput } from "@/lib/canvas/actions";
import { useCanvasStore, type FlowNodeData } from "@/lib/canvas/store";
import { createClient } from "@/lib/supabase/client";
import { concatVideos } from "@/lib/video/concat";
import type { NodeOutput, SceneComposerParams } from "@/lib/canvas/types";
import { commitNodeParams } from "./canvas-editor";

type UpstreamClip = {
  nodeId: string;
  url: string;
  status: string;
  name: string | null;
};

export function SceneComposerNode({ data, selected }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = (d.params ?? {}) as SceneComposerParams;
  const reactFlow = useReactFlow();
  const workflowId = useCanvasStore((s) => s.workflowId);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const allNodes = useCanvasStore((s) => s.nodes);
  const allEdges = useCanvasStore((s) => s.edges);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<NodeOutput | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Walk upstream edges → ordered list of video clips. Order resolution:
  //   1. If params.order is set, use that (user dragged-to-reorder).
  //      Newly-connected upstreams (not in order) get appended.
  //      Removed upstreams get pruned.
  //   2. Otherwise fall back to source node y-position (topmost plays first).
  // Edge insertion order isn't trustworthy on its own — postgres edge rows
  // have gen_random_uuid ids, so client iteration order doesn't match the
  // order the user wired them. The explicit `order` array makes intent
  // first-class instead of guessing from layout.
  const upstream = useMemo<UpstreamClip[]>(() => {
    const incoming = allEdges.filter((e) => e.target === id);
    const sourceNodeIds = incoming.map((e) => e.source);
    const sourceNodes = allNodes.filter((n) => sourceNodeIds.includes(n.id));
    sourceNodes.sort((a, b) => a.position.y - b.position.y);
    const clips = sourceNodes
      .map((n) => {
        const fd = n.data as FlowNodeData;
        if (!fd.output || fd.output.kind !== "video") return null;
        const displayName =
          (fd.params as { displayName?: string } | undefined)?.displayName;
        return {
          nodeId: n.id,
          url: fd.output.url,
          status: fd.status,
          name: displayName?.trim() || null,
        };
      })
      .filter(Boolean) as UpstreamClip[];

    const explicitOrder = params.order ?? [];
    if (explicitOrder.length === 0) return clips;

    const byId = new Map(clips.map((c) => [c.nodeId, c]));
    const ordered: UpstreamClip[] = [];
    for (const nid of explicitOrder) {
      const c = byId.get(nid);
      if (c) {
        ordered.push(c);
        byId.delete(nid);
      }
    }
    // Any clip not in the saved order = newly connected → append at the end.
    for (const c of byId.values()) ordered.push(c);
    return ordered;
  }, [allEdges, allNodes, id, params.order]);

  // All upstream nodes (including those without video output yet) — used
  // to show "X / Y videos ready" status.
  const upstreamNodeCount = useMemo(
    () => allEdges.filter((e) => e.target === id).length,
    [allEdges, id],
  );
  const readyCount = upstream.length;

  function reorderTo(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const ids = upstream.map((c) => c.nodeId);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(targetIdx, 0, moved);
    commitNodeParams(id, { ...params, order: ids });
  }

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
      <NodeResizerShell selected={selected} minWidth={260} minHeight={220} />
      <Handle
        type="target"
        position={Position.Left}
        id="video_input"
        className="h-3! w-3! bg-purple-500!"
      />
      <NodeShell
        title="Scene Composer"
        status={d.status}
        error={d.error ?? localError}
      >
        <p className="text-[10px] text-neutral-500">
          Connect 2+ video outputs to the purple input handle
        </p>
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 p-2 text-[10px] text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1">
              <FilmIcon className="h-3 w-3" />
              {readyCount} / {upstreamNodeCount} clip
              {upstreamNodeCount === 1 ? "" : "s"} ready
            </span>
            {upstream.length > 1 && (
              <span className="text-[9px] text-neutral-400">drag to reorder</span>
            )}
          </div>
          {upstream.length > 0 && (
            <ul className="nodrag nopan mt-1 space-y-0.5">
              {upstream.map((c, i) => (
                <li
                  key={c.nodeId}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(i);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox refuses to start a drag without setData.
                    e.dataTransfer.setData("text/plain", c.nodeId);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overIdx !== i) setOverIdx(i);
                  }}
                  onDragLeave={() => {
                    if (overIdx === i) setOverIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorderTo(i);
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setOverIdx(null);
                  }}
                  className={`flex cursor-grab items-center gap-1.5 rounded px-1 py-0.5 active:cursor-grabbing ${
                    dragIdx === i
                      ? "opacity-40"
                      : overIdx === i
                        ? "bg-emerald-500/15"
                        : "hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                  }`}
                >
                  <GripVerticalIcon className="h-3 w-3 shrink-0 text-neutral-400" />
                  <span className="tabular-nums text-neutral-400">
                    {i + 1}.
                  </span>
                  <span className="truncate text-neutral-700 dark:text-neutral-300">
                    {c.name ?? (
                      <span className="italic text-neutral-500">
                        scene {i + 1}
                      </span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 text-neutral-500">
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
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
          <div className="h-1 w-full overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {d.output?.kind === "video" && (
          <>
            <LazyVideo
              output={d.output}
              onZoom={() => d.output && setZoom(d.output)}
              className="mt-1"
            />
            <DownloadButton output={d.output} prefix="composed-video" />
          </>
        )}
      </NodeShell>
      <MediaLightbox
        output={zoom}
        caption="Composed video"
        onClose={() => setZoom(null)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="video_output"
        className="h-3! w-3! bg-purple-500!"
      />
    </>
  );
}
