"use client";

import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { NodeShell } from "./node-shell";
import { UsageBadge } from "./usage-badge";
import { RunNodeButton } from "./run-node-button";
import { DownloadButton } from "./download-button";
import { OutputHistory } from "./output-history";
import { EnhancePromptButton } from "./enhance-prompt-button";
import { MediaLightbox } from "./media-lightbox";
import { NodeNameField } from "./node-name-field";
import { NodeResizerShell } from "./node-resizer-shell";
import { UpstreamRefs } from "./upstream-refs";
import type { NodeOutput } from "@/lib/canvas/types";
import type { VideoGenerateParams } from "@/lib/canvas/types";
import type { FlowNodeData } from "@/lib/canvas/store";
import { commitNodeParams } from "./canvas-editor";
import {
  VIDEO_MODELS,
  coerceVideoParamsForModel,
  findVideoModel,
  DEFAULT_VIDEO_MODEL,
  type VideoModelId,
} from "@/lib/apimart/video-models";

export function VideoGenerateNode({ data, selected }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = d.params as VideoGenerateParams;
  const currentModelId = (params.model ?? DEFAULT_VIDEO_MODEL) as VideoModelId;
  const model = findVideoModel(currentModelId);
  const [vidError, setVidError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<NodeOutput | null>(null);

  function onModelChange(newModelId: VideoModelId) {
    const fixed = coerceVideoParamsForModel(newModelId, {
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      duration: params.duration,
    });
    commitNodeParams(id, {
      ...params,
      model: fixed.model,
      aspectRatio: fixed.aspectRatio,
      resolution: fixed.resolution,
      duration: fixed.duration,
    });
  }

  return (
    <>
      <NodeResizerShell selected={selected} minWidth={260} minHeight={260} />
      <Handle
        type="target"
        position={Position.Left}
        id="image_input"
        className="h-3! w-3! bg-blue-500!"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="text_input"
        style={{ top: 64 }}
        className="h-3! w-3! bg-amber-400!"
      />
      <NodeShell
        title="Video Generate"
        status={d.status}
        error={d.error ?? vidError}
        progress={d.usage?.progress}
        estimatedTime={d.usage?.estimatedTime}
        headerAction={<RunNodeButton nodeId={id} />}
      >
        <NodeNameField nodeId={id} params={params} />
        <UpstreamRefs nodeId={id} />
        <p className="text-[10px] text-neutral-500">
          Optional: connect 1+ images for image-to-video (max{" "}
          {model.maxImages})
        </p>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-400">Model</span>
          <select
            value={currentModelId}
            onChange={(e) => onModelChange(e.target.value as VideoModelId)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
          >
            {VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.vendor}
                {m.hint ? ` (${m.hint})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase text-neutral-400">
              Prompt (idea)
            </span>
            <EnhancePromptButton
              idea={params.prompt ?? ""}
              kind="video"
              onResult={(enhancedPrompt) =>
                commitNodeParams(id, { ...params, enhancedPrompt })
              }
            />
          </div>
          <textarea
            value={params.prompt ?? ""}
            onChange={(e) =>
              commitNodeParams(id, { ...params, prompt: e.target.value })
            }
            placeholder="describe in any language — e.g. transisi pagi ke malam cinematic"
            rows={2}
            className="nodrag nopan nowheel mt-1 w-full resize-y field-sizing-content min-h-[60px] max-h-[400px] rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-400">
            Enhanced prompt {params.enhancedPrompt ? "(used)" : "(optional)"}
          </span>
          <textarea
            value={params.enhancedPrompt ?? ""}
            onChange={(e) =>
              commitNodeParams(id, { ...params, enhancedPrompt: e.target.value })
            }
            placeholder="click ✨ Enhance to generate detailed English prompt here"
            rows={4}
            className="nodrag nopan nowheel mt-1 w-full resize-y field-sizing-content min-h-[60px] max-h-[400px] rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {model.aspectRatios && (
            <label className="block">
              <span className="text-[10px] uppercase text-neutral-400">
                Aspect
              </span>
              <select
                value={params.aspectRatio ?? model.aspectRatios[0]}
                onChange={(e) =>
                  commitNodeParams(id, { ...params, aspectRatio: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
              >
                {model.aspectRatios.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          {model.resolutions && (
            <label className="block">
              <span className="text-[10px] uppercase text-neutral-400">Res</span>
              <select
                value={params.resolution ?? model.resolutions[0]}
                onChange={(e) =>
                  commitNodeParams(id, { ...params, resolution: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
              >
                {model.resolutions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-[10px] uppercase text-neutral-400">Dur</span>
            <select
              value={params.duration ?? model.defaultDuration}
              onChange={(e) =>
                commitNodeParams(id, {
                  ...params,
                  duration: parseInt(e.target.value, 10),
                })
              }
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
            >
              {model.durations.map((dur) => (
                <option key={dur} value={dur}>
                  {dur}s
                </option>
              ))}
            </select>
          </label>
        </div>
        {model.supportsAudio && (
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={params.audio ?? false}
              onChange={(e) =>
                commitNodeParams(id, { ...params, audio: e.target.checked })
              }
            />
            Generate audio
          </label>
        )}
        {d.output?.kind === "video" && (
          <>
            <video
              src={d.output.url}
              controls
              onError={() =>
                setVidError("Video failed to load. Check Storage policy.")
              }
              onLoadedData={() => setVidError(null)}
              onClick={() => d.output && setZoom(d.output)}
              className="mt-1 w-full cursor-zoom-in rounded-md border border-neutral-800"
            />
            <DownloadButton output={d.output} prefix="video-generate" />
          </>
        )}
        <UsageBadge usage={d.usage} />
        <OutputHistory
          nodeId={id}
          nodeType="video_generate"
          status={d.status}
          currentOutput={d.output}
          currentParams={params}
        />
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="video_output"
        className="h-3! w-3! bg-purple-500!"
      />
      <MediaLightbox
        output={zoom}
        caption={(params.prompt ?? "").slice(0, 120)}
        onClose={() => setZoom(null)}
      />
    </>
  );
}
