"use client";

import { useRef, useState } from "react";
import { useNodeId, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  Loader2Icon,
  SparklesIcon,
  FilmIcon,
  ImageIcon,
  VideoIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { NodeShell } from "./node-shell";
import { NodeResizerShell } from "./node-resizer-shell";
import { commitNodeParams } from "./canvas-editor";
import { DebouncedTextarea } from "./debounced-textarea";
import {
  createImageFromScene,
  createSceneNodesFromStoryboard,
  createVideoFromScene,
} from "@/lib/canvas/actions";
import {
  rowToFlowNode,
  useCanvasStore,
  type FlowNodeData,
} from "@/lib/canvas/store";
import { createClient } from "@/lib/supabase/client";
import type {
  CanvasEdgeRow,
  CanvasNodeRow,
  StoryboardChainMode,
  StoryboardOutputMode,
  StoryboardParams,
  StoryboardScene,
} from "@/lib/canvas/types";
import type { Edge } from "@xyflow/react";

export function StoryboardNode({ data, selected }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = d.params as StoryboardParams;
  const reactFlow = useReactFlow();
  const workflowId = useCanvasStore((s) => s.workflowId);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks which (scene, kind) is currently being added so we can show a
  // spinner on the specific button without blocking the others.
  const [addingScene, setAddingScene] = useState<string | null>(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scenes = params.scenes ?? [];
  const autoCreate = params.autoCreate ?? true;
  const outputMode: StoryboardOutputMode = params.outputMode ?? "video";
  const chainMode: StoryboardChainMode = params.chainMode ?? "parallel";
  const refUrl = params.referenceImageUrl;

  function update<K extends keyof StoryboardParams>(
    key: K,
    value: StoryboardParams[K],
  ) {
    commitNodeParams(id, { ...params, [key]: value });
  }

  function getOrigin() {
    const node = reactFlow.getNode(id);
    return node?.position
      ? { x: node.position.x, y: node.position.y }
      : { x: 0, y: 0 };
  }

  async function onGenerate() {
    if (!params.story?.trim()) {
      setError("Tulis cerita / ide-nya dulu");
      return;
    }
    if (!workflowId) return;

    setBusy(true);
    setError(null);
    try {
      const llmRes = await fetch("/api/llm/storyboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          story: params.story,
          sceneCount: params.sceneCount,
          style: params.style,
          totalDuration: params.totalDuration,
        }),
      });
      const llmJson = (await llmRes.json()) as {
        scenes?: StoryboardScene[];
        error?: string;
      };
      if (!llmRes.ok || !llmJson.scenes) {
        throw new Error(llmJson.error ?? `Failed (${llmRes.status})`);
      }

      // Persist scenes so they survive reloads
      commitNodeParams(id, { ...params, scenes: llmJson.scenes });

      if (autoCreate) {
        const result = await createSceneNodesFromStoryboard({
          workflowId,
          storyboardNodeId: id,
          scenes: llmJson.scenes,
          origin: getOrigin(),
          outputMode,
          chainMode,
          referenceImage: refUrl
            ? {
                url: refUrl,
                mimeType: params.referenceImageMime ?? "image/png",
                filename: params.referenceImageFilename,
              }
            : undefined,
        });
        console.log("[storyboard] auto-created", {
          outputMode,
          chainMode,
          newNodes: result.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            x: n.position_x,
          })),
          newEdgeCount: result.edges.length,
        });
        setNodes((curr) => [
          ...curr,
          ...result.nodes.map((row: CanvasNodeRow) => rowToFlowNode(row)),
        ]);
        setEdges((curr) => [
          ...curr,
          ...result.edges.map(
            (row: CanvasEdgeRow): Edge => ({
              id: row.id,
              source: row.source_node_id,
              sourceHandle: row.source_handle,
              target: row.target_node_id,
              targetHandle: row.target_handle,
            }),
          ),
        ]);
        // Re-fit the viewport so the freshly created column(s) of nodes
        // are visible — otherwise they may sit off-screen to the right.
        setTimeout(() => {
          reactFlow.fitView({ padding: 0.2, duration: 400 });
        }, 50);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPickReferenceImage(file: File) {
    if (!workflowId) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file");
      return;
    }
    setUploadingRef(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userRes.user.id}/${workflowId}/storyboard-ref-${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("outputs")
        .upload(path, file, {
          contentType: file.type,
          upsert: true,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("outputs").getPublicUrl(path);
      commitNodeParams(id, {
        ...params,
        referenceImageUrl: pub.publicUrl,
        referenceImageMime: file.type,
        referenceImageFilename: file.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingRef(false);
    }
  }

  function clearReferenceImage() {
    commitNodeParams(id, {
      ...params,
      referenceImageUrl: undefined,
      referenceImageMime: undefined,
      referenceImageFilename: undefined,
    });
  }

  async function addSceneNode(
    scene: StoryboardScene,
    kind: "image" | "video",
  ) {
    if (!workflowId) return;
    const key = `${scene.index}:${kind}`;
    setAddingScene(key);
    try {
      const origin = getOrigin();
      // Image column to the right of Storyboard, Video column further right
      // so adding both for the same scene puts them side-by-side.
      const x = origin.x + (kind === "image" ? 360 : 720);
      const y = origin.y + (scene.index - 1) * 280;
      const row =
        kind === "image"
          ? await createImageFromScene({ workflowId, scene, position: { x, y } })
          : await createVideoFromScene({ workflowId, scene, position: { x, y } });
      setNodes((curr) => [...curr, rowToFlowNode(row)]);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingScene(null);
    }
  }

  return (
    <>
      <NodeResizerShell selected={selected} minWidth={300} minHeight={300} />
      <NodeShell
        title="Storyboard"
        status={d.status}
        error={d.error ?? error}
      >
      <label className="block">
        <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
          Story / Idea
        </span>
        <DebouncedTextarea
          value={params.story ?? ""}
          onCommit={(story) => update("story", story)}
          placeholder="e.g. video 30 detik tentang anak muda mengejar mimpinya di kota besar, cinematic"
          rows={3}
          className="nodrag nopan nowheel mt-1 w-full resize-y field-sizing-content min-h-[60px] max-h-[400px] rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Scenes</span>
          <input
            type="number"
            min={1}
            max={10}
            value={params.sceneCount ?? 3}
            onChange={(e) =>
              update("sceneCount", Math.max(1, Math.min(10, Number(e.target.value))))
            }
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Total (s)</span>
          <input
            type="number"
            min={5}
            max={120}
            value={params.totalDuration ?? 15}
            onChange={(e) =>
              update("totalDuration", Math.max(5, Math.min(120, Number(e.target.value))))
            }
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Style</span>
          <input
            value={params.style ?? "cinematic"}
            onChange={(e) => update("style", e.target.value)}
            placeholder="cinematic"
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Output</span>
          <select
            value={outputMode}
            onChange={(e) =>
              update("outputMode", e.target.value as StoryboardOutputMode)
            }
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
          >
            <option value="video">Video → Composer</option>
            <option value="image">Image only</option>
            <option value="image-then-video">Image → Video → Composer</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Chain</span>
          <select
            value={chainMode}
            onChange={(e) =>
              update("chainMode", e.target.value as StoryboardChainMode)
            }
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
          >
            <option value="parallel">Parallel (independent)</option>
            <option value="sequential">Sequential (each → next)</option>
          </select>
        </label>
      </div>
      <p className="text-[10px] text-neutral-500">
        {chainMode === "sequential"
          ? "Scene 1 → Scene 2 → Scene 3 — each continues from previous (great for before-after, transformation)."
          : "Scenes generate independently — share style only via reference image."}
      </p>
      <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={autoCreate}
          onChange={(e) => update("autoCreate", e.target.checked)}
        />
        Auto-create scene nodes
      </label>
      <div className="space-y-1">
        <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
          Reference image (optional)
        </span>
        {refUrl ? (
          <div className="flex items-start gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50/40 dark:bg-neutral-950/40 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={refUrl}
              alt={params.referenceImageFilename ?? "reference"}
              className="h-12 w-12 shrink-0 rounded-md border border-neutral-200 dark:border-neutral-800 object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className="truncate text-[10px] text-neutral-600 dark:text-neutral-400"
                title={params.referenceImageFilename}
              >
                {params.referenceImageFilename ?? "uploaded"}
              </span>
              <span className="text-[10px] text-neutral-500">
                Applied to every auto-created Video as image input.
              </span>
              <button
                type="button"
                onClick={clearReferenceImage}
                className="flex items-center gap-1 self-start text-[10px] text-neutral-600 dark:text-neutral-400 hover:text-red-400"
              >
                <XIcon className="h-3 w-3" /> remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingRef}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50/40 dark:bg-neutral-950/40 py-3 text-[11px] text-neutral-600 dark:text-neutral-400 hover:border-neutral-500 disabled:opacity-50"
          >
            {uploadingRef ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UploadIcon className="h-3.5 w-3.5" />
            )}
            {uploadingRef ? "uploading…" : "Upload reference image"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickReferenceImage(f);
            e.target.value = "";
          }}
        />
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <SparklesIcon className="h-3.5 w-3.5" />
        )}
        Generate Storyboard
      </button>
      {scenes.length > 0 && (
        <div className="mt-1 space-y-1">
          <div className="flex items-center gap-1 text-[10px] uppercase text-neutral-500">
            <FilmIcon className="h-3 w-3" />
            {scenes.length} scenes
            {!autoCreate && " · pick which to add"}
          </div>
          <ol className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 p-2 text-[10px]">
            {scenes.map((s) => {
              const imgKey = `${s.index}:image`;
              const vidKey = `${s.index}:video`;
              return (
                <li key={s.index} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-neutral-700 dark:text-neutral-300">
                      Scene {s.index}
                      {typeof s.duration === "number"
                        ? ` · ${s.duration}s`
                        : ""}
                      {s.cameraMovement ? ` · ${s.cameraMovement}` : ""}
                    </div>
                    <div className="text-neutral-500">{s.prompt}</div>
                  </div>
                  {!autoCreate && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => addSceneNode(s, "image")}
                        disabled={addingScene === imgKey}
                        title="Add as Image node"
                        className="rounded-md border border-neutral-300 dark:border-neutral-700 p-1 text-neutral-700 dark:text-neutral-300 hover:bg-emerald-600 hover:text-white disabled:opacity-50"
                      >
                        {addingScene === imgKey ? (
                          <Loader2Icon className="h-3 w-3 animate-spin" />
                        ) : (
                          <ImageIcon className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => addSceneNode(s, "video")}
                        disabled={addingScene === vidKey}
                        title="Add as Video node"
                        className="rounded-md border border-neutral-300 dark:border-neutral-700 p-1 text-neutral-700 dark:text-neutral-300 hover:bg-purple-600 hover:text-white disabled:opacity-50"
                      >
                        {addingScene === vidKey ? (
                          <Loader2Icon className="h-3 w-3 animate-spin" />
                        ) : (
                          <VideoIcon className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {autoCreate && (
            <p className="text-[10px] text-neutral-500">
              {outputMode === "image"
                ? "Image nodes were auto-created on the right — tweak prompts then click Run all."
                : outputMode === "image-then-video"
                  ? "Image → Video chain auto-created on the right — generate stills first (cheap), then animate to video."
                  : "Video nodes were auto-created on the right — tweak prompts then click Run all."}
            </p>
          )}
        </div>
      )}
      </NodeShell>
    </>
  );
}
