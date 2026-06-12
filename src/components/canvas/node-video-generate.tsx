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
import { LazyVideo } from "./lazy-video";
import { DebouncedTextarea } from "./debounced-textarea";

// Manual prompt-enhancement UI is hidden by default (rarely used). The
// `enhancedPrompt` param itself is still honored at run time (Storyboard fills
// it, Text Prompt nodes prepend into it), so this only hides the in-node button
// + editor. Flip to true to bring the UI back.
const SHOW_ENHANCE: boolean = false;
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
  // Enhanced prompt is hidden by default. Auto-open when there's existing
  // content (so users with already-enhanced nodes still see what's being used).
  const [showEnhanced, setShowEnhanced] = useState<boolean>(
    Boolean(params.enhancedPrompt),
  );

  const mode = params.mode ?? "generate";
  const isRemix = mode === "remix";
  const genTypes = model.generationTypes;
  const genType = params.generationType ?? "frame";
  // Models that accept frame-to-video expose a dedicated end-frame input dot.
  const supportsEndFrame = !isRemix && Boolean(genTypes?.includes("frame"));

  function onModelChange(newModelId: VideoModelId) {
    const next = findVideoModel(newModelId);
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
      // Drop remix if the new model can't do it; keep generationType valid.
      mode: next.supportsRemix ? mode : "generate",
      generationType:
        next.generationTypes && next.generationTypes.includes(genType)
          ? genType
          : (next.generationTypes?.[0] ?? "frame"),
    });
  }

  return (
    <>
      <NodeResizerShell selected={selected} minWidth={260} minHeight={260} />
      <Handle
        type="target"
        position={Position.Left}
        id="image_input"
        title="Image input (start frame / reference)"
        style={{ top: 44 }}
        className="h-3! w-3! bg-blue-500!"
      />
      {supportsEndFrame && (
        <Handle
          type="target"
          position={Position.Left}
          id="end_frame"
          title="End frame (last frame)"
          style={{ top: 76 }}
          className="h-3! w-3! bg-emerald-500!"
        />
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="text_input"
        title="Text prompt input"
        style={{ top: supportsEndFrame ? 108 : 76 }}
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
          {isRemix
            ? "Remix extends the connected upstream video (8s → 15s). Model & duration follow the source; image inputs are ignored."
            : supportsEndFrame
              ? `Connect images: 🔵 start frame · 🟢 end frame (optional) · 🟡 text (max ${model.maxImages})`
              : `Optional: connect 1+ images for image-to-video (max ${model.maxImages})`}
        </p>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Model</span>
          <select
            value={currentModelId}
            onChange={(e) => onModelChange(e.target.value as VideoModelId)}
            disabled={isRemix}
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none disabled:opacity-60"
          >
            {VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.vendor}
                {m.priceHint ? ` · ${m.priceHint}` : ""}
                {m.hint ? ` (${m.hint})` : ""}
              </option>
            ))}
          </select>
        </label>
        {model.supportsRemix && (
          <label className="block">
            <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
              Mode
            </span>
            <select
              value={mode}
              onChange={(e) =>
                commitNodeParams(id, {
                  ...params,
                  mode: e.target.value as VideoGenerateParams["mode"],
                })
              }
              className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
            >
              <option value="generate">Generate — new video</option>
              <option value="remix">Remix — extend connected video</option>
            </select>
          </label>
        )}
        {!isRemix && genTypes && genTypes.length > 1 && (
          <label className="block">
            <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
              Image use
            </span>
            <select
              value={genType}
              onChange={(e) =>
                commitNodeParams(id, {
                  ...params,
                  generationType: e.target
                    .value as VideoGenerateParams["generationType"],
                })
              }
              className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
            >
              {genTypes.includes("frame") && (
                <option value="frame">Frame — start / end frame</option>
              )}
              {genTypes.includes("reference") && (
                <option value="reference">Reference — guide look/subject</option>
              )}
            </select>
          </label>
        )}
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
              Prompt (idea)
            </span>
            {SHOW_ENHANCE && (
              <EnhancePromptButton
                idea={params.prompt ?? ""}
                kind="video"
                onResult={(enhancedPrompt) => {
                  commitNodeParams(id, { ...params, enhancedPrompt });
                  setShowEnhanced(true);
                }}
              />
            )}
          </div>
          <DebouncedTextarea
            value={params.prompt ?? ""}
            onCommit={(prompt) => commitNodeParams(id, { ...params, prompt })}
            placeholder="describe in any language — e.g. transisi pagi ke malam cinematic"
            rows={2}
            className="nodrag nopan nowheel mt-1 w-full resize-y field-sizing-content min-h-[60px] max-h-[400px] rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
          />
        </label>
        {SHOW_ENHANCE && (
          <div>
            <button
              type="button"
              onClick={() => setShowEnhanced((v) => !v)}
              title={
                showEnhanced
                  ? "Hide enhanced prompt"
                  : params.enhancedPrompt
                    ? "Show enhanced prompt (used at run)"
                    : "Show enhanced prompt"
              }
              className="flex w-full items-center justify-end gap-1 text-[10px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {params.enhancedPrompt && !showEnhanced && (
                <span aria-hidden>✨</span>
              )}
              <span aria-hidden>{showEnhanced ? "▴" : "▾"}</span>
            </button>
            {showEnhanced && (
              <DebouncedTextarea
                value={params.enhancedPrompt ?? ""}
                onCommit={(enhancedPrompt) =>
                  commitNodeParams(id, { ...params, enhancedPrompt })
                }
                placeholder="click ✨ Enhance to generate detailed English prompt here"
                rows={4}
                className="nodrag nopan nowheel mt-1 w-full resize-y field-sizing-content min-h-[60px] max-h-[400px] rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
              />
            )}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {model.aspectRatios && (
            <label className="block">
              <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">
                Aspect
              </span>
              <select
                value={params.aspectRatio ?? model.aspectRatios[0]}
                onChange={(e) =>
                  commitNodeParams(id, { ...params, aspectRatio: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
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
              <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Res</span>
              <select
                value={params.resolution ?? model.resolutions[0]}
                onChange={(e) =>
                  commitNodeParams(id, { ...params, resolution: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
              >
                {model.resolutions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isRemix && (
            <label className="block">
              <span className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400">Dur</span>
              <select
                value={params.duration ?? model.defaultDuration}
                onChange={(e) =>
                  commitNodeParams(id, {
                    ...params,
                    duration: parseInt(e.target.value, 10),
                  })
                }
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-1 text-xs outline-none"
              >
                {model.durations.map((dur) => (
                  <option key={dur} value={dur}>
                    {dur}s
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {isRemix && (
          <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={params.remixRaw ?? false}
              onChange={(e) =>
                commitNodeParams(id, { ...params, remixRaw: e.target.checked })
              }
            />
            Only the extended part
          </label>
        )}
        {model.supportsAudio && (
          <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
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
            <LazyVideo
              output={d.output}
              onZoom={() => d.output && setZoom(d.output)}
              onError={() =>
                setVidError("Video failed to load. Check Storage policy.")
              }
              onLoadedData={() => setVidError(null)}
              className="mt-1"
            />
            <DownloadButton output={d.output} prefix="video-generate" />
          </>
        )}
        <UsageBadge usage={d.usage} status={d.status} />
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
