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
import type { ImageGenerateParams } from "@/lib/canvas/types";
import type { FlowNodeData } from "@/lib/canvas/store";
import { commitNodeParams } from "./canvas-editor";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  coerceParamsForModel,
  findModel,
  type ImageModelId,
} from "@/lib/apimart/models";

export function ImageGenerateNode({ data, selected }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = d.params as ImageGenerateParams;
  const currentModelId = (params.model ?? DEFAULT_IMAGE_MODEL) as ImageModelId;
  const model = findModel(currentModelId);
  const [imgError, setImgError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<NodeOutput | null>(null);

  function onModelChange(newModelId: ImageModelId) {
    const fixed = coerceParamsForModel(newModelId, {
      size: params.size,
      resolution: params.resolution,
    });
    commitNodeParams(id, {
      ...params,
      model: fixed.model,
      size: fixed.size,
      resolution: fixed.resolution,
    });
  }

  return (
    <>
      <NodeResizerShell selected={selected} minWidth={240} minHeight={220} />
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
        title="Image"
        status={d.status}
        error={d.error ?? imgError}
        progress={d.usage?.progress}
        estimatedTime={d.usage?.estimatedTime}
        headerAction={<RunNodeButton nodeId={id} />}
      >
        <NodeNameField nodeId={id} params={params} />
        <UpstreamRefs nodeId={id} />
        <p className="text-[10px] text-neutral-500">
          Optional: connect image(s) for image-to-image / merge / edit
        </p>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-400">Model</span>
          <select
            value={currentModelId}
            onChange={(e) => onModelChange(e.target.value as ImageModelId)}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none"
          >
            {IMAGE_MODELS.map((m) => (
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
              kind="image"
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
            placeholder="describe in any language — e.g. wanita minum air ugc realistis"
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
        <div
          className={`grid gap-2 ${model.resolutions ? "grid-cols-2" : "grid-cols-1"}`}
        >
          <label className="block">
            <span className="text-[10px] uppercase text-neutral-400">Aspect</span>
            <select
              value={params.size ?? model.aspectRatios[0]}
              onChange={(e) =>
                commitNodeParams(id, { ...params, size: e.target.value })
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
        </div>
        {!model.supportsImageUrls && (
          <p className="text-[10px] text-amber-400/80">
            T2I only — upstream image inputs will be ignored.
          </p>
        )}
        {d.output?.kind === "image" && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.output.url}
              alt="output"
              onLoad={() => setImgError(null)}
              onError={() =>
                setImgError(
                  "Image failed to load. Check Supabase Storage policy for bucket 'outputs'.",
                )
              }
              onClick={() => d.output && setZoom(d.output)}
              className="mt-1 w-full cursor-zoom-in rounded-md border border-neutral-800"
            />
            <DownloadButton output={d.output} prefix="image" />
          </>
        )}
        <UsageBadge usage={d.usage} />
        <OutputHistory
          nodeId={id}
          nodeType="image_generate"
          status={d.status}
          currentOutput={d.output}
          currentParams={params}
        />
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="image_output"
        className="h-3! w-3! bg-emerald-500!"
      />
      <MediaLightbox
        output={zoom}
        caption={(params.prompt ?? "").slice(0, 120)}
        onClose={() => setZoom(null)}
      />
    </>
  );
}
