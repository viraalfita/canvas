"use client";

import { useState } from "react";
import { useNodeId, useReactFlow, type NodeProps } from "@xyflow/react";
import {
  Loader2Icon,
  SparklesIcon,
  FilmIcon,
  PlusIcon,
} from "lucide-react";
import { NodeShell } from "./node-shell";
import { commitNodeParams } from "./canvas-editor";
import {
  createSceneNodesFromStoryboard,
  createVideoFromScene,
} from "@/lib/canvas/actions";
import {
  rowToFlowNode,
  useCanvasStore,
  type FlowNodeData,
} from "@/lib/canvas/store";
import type {
  CanvasEdgeRow,
  CanvasNodeRow,
  StoryboardParams,
  StoryboardScene,
} from "@/lib/canvas/types";
import type { Edge } from "@xyflow/react";

export function StoryboardNode({ data }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = d.params as StoryboardParams;
  const reactFlow = useReactFlow();
  const workflowId = useCanvasStore((s) => s.workflowId);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingScene, setAddingScene] = useState<number | null>(null);

  const scenes = params.scenes ?? [];
  const autoCreate = params.autoCreate ?? true;

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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAddScene(scene: StoryboardScene) {
    if (!workflowId) return;
    setAddingScene(scene.index);
    try {
      const origin = getOrigin();
      const row = await createVideoFromScene({
        workflowId,
        scene,
        position: { x: origin.x + 360, y: origin.y + (scene.index - 1) * 280 },
      });
      setNodes((curr) => [...curr, rowToFlowNode(row)]);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingScene(null);
    }
  }

  return (
    <NodeShell
      title="Storyboard"
      status={d.status}
      error={d.error ?? error}
      className="w-80"
    >
      <label className="block">
        <span className="text-[10px] uppercase text-neutral-400">
          Story / Idea
        </span>
        <textarea
          value={params.story ?? ""}
          onChange={(e) => update("story", e.target.value)}
          placeholder="e.g. video 30 detik tentang anak muda mengejar mimpinya di kota besar, cinematic"
          rows={3}
          className="mt-1 w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-400">Scenes</span>
          <input
            type="number"
            min={1}
            max={10}
            value={params.sceneCount ?? 3}
            onChange={(e) =>
              update("sceneCount", Math.max(1, Math.min(10, Number(e.target.value))))
            }
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-400">Total (s)</span>
          <input
            type="number"
            min={5}
            max={120}
            value={params.totalDuration ?? 15}
            onChange={(e) =>
              update("totalDuration", Math.max(5, Math.min(120, Number(e.target.value))))
            }
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-400">Style</span>
          <input
            value={params.style ?? "cinematic"}
            onChange={(e) => update("style", e.target.value)}
            placeholder="cinematic"
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-neutral-300">
        <input
          type="checkbox"
          checked={autoCreate}
          onChange={(e) => update("autoCreate", e.target.checked)}
        />
        Auto-create Video + Scene Composer nodes
      </label>
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
            {!autoCreate && " · click + to add as Video node"}
          </div>
          <ol className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950/40 p-2 text-[10px]">
            {scenes.map((s) => (
              <li key={s.index} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-neutral-300">
                    Scene {s.index}
                    {typeof s.duration === "number" ? ` · ${s.duration}s` : ""}
                    {s.cameraMovement ? ` · ${s.cameraMovement}` : ""}
                  </div>
                  <div className="text-neutral-500">{s.prompt}</div>
                </div>
                {!autoCreate && (
                  <button
                    type="button"
                    onClick={() => onAddScene(s)}
                    disabled={addingScene === s.index}
                    title="Add as Video node"
                    className="flex-shrink-0 rounded-md border border-neutral-700 p-1 text-neutral-300 hover:bg-emerald-600 hover:text-white disabled:opacity-50"
                  >
                    {addingScene === s.index ? (
                      <Loader2Icon className="h-3 w-3 animate-spin" />
                    ) : (
                      <PlusIcon className="h-3 w-3" />
                    )}
                  </button>
                )}
              </li>
            ))}
          </ol>
          {autoCreate && (
            <p className="text-[10px] text-neutral-500">
              Video nodes were auto-created on the right — tweak prompts then
              click Run all.
            </p>
          )}
        </div>
      )}
    </NodeShell>
  );
}
