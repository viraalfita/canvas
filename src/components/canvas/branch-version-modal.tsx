"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import { EnhancePromptButton } from "./enhance-prompt-button";
import {
  IMAGE_MODELS,
  coerceParamsForModel,
  findModel,
  type ImageModelId,
} from "@/lib/apimart/models";
import {
  VIDEO_MODELS,
  coerceVideoParamsForModel,
  findVideoModel,
  type VideoModelId,
} from "@/lib/apimart/video-models";
import { useCanvasStore } from "@/lib/canvas/store";
import type {
  ImageGenerateParams,
  NodeOutputHistoryRow,
  NodeType,
  VideoGenerateParams,
} from "@/lib/canvas/types";

type Props = {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeType: NodeType;
  /** Source version we're branching from (its URL/thumbnail becomes input). */
  sourceVersion: NodeOutputHistoryRow;
  /** Current node params used to seed the form defaults. */
  defaultParams: Record<string, unknown>;
};

export function BranchVersionModal({
  open,
  onClose,
  nodeId,
  nodeType,
  sourceVersion,
  defaultParams,
}: Props) {
  const workflowId = useCanvasStore((s) => s.workflowId);
  const startPolling = useCanvasStore((s) => s.startPolling);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seed form with current node params via lazy initializer; the parent uses
  // `key={sourceVersion.id}` to force a remount when a different version is
  // selected, so this component is always fresh on open.
  const [params, setParams] = useState<Record<string, unknown>>(defaultParams);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isVideo = nodeType === "video_generate";

  // Default image-input URL: the version's URL (image) or thumbnail (video)
  const inputImageUrl = isVideo
    ? sourceVersion.output.kind === "video"
      ? sourceVersion.output.thumbnailUrl ?? null
      : sourceVersion.output.url
    : sourceVersion.output.kind === "image"
      ? sourceVersion.output.url
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workflowId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workflow/${workflowId}/nodes/${nodeId}/branch`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ params, imageUrl: inputImageUrl }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      // Branch is a single regeneration — don't cascade downstream.
      startPolling(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">
              Edit & regenerate from this version
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            type="button"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-3 border-b border-neutral-800 p-4">
          {inputImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={inputImageUrl}
              alt="source"
              className="h-20 w-20 rounded-md border border-neutral-700 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 text-[10px] text-neutral-500">
              no input
            </div>
          )}
          <div className="flex-1 text-xs text-neutral-400">
            <div>
              {isVideo
                ? "This version's thumbnail will be used as the first frame."
                : "This version will be used as the reference image."}
            </div>
            {!inputImageUrl && (
              <div className="mt-1 text-amber-400">
                No image input available — will regenerate from prompt only.
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-3 max-h-[60vh] overflow-y-auto p-4"
        >
          {isVideo ? (
            <VideoForm params={params} setParams={setParams} />
          ) : (
            <ImageForm params={params} setParams={setParams} />
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              Regenerate
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// --- Form bodies (image vs video) ---

function ImageForm({
  params,
  setParams,
}: {
  params: Record<string, unknown>;
  setParams: (p: Record<string, unknown>) => void;
}) {
  const p = params as Partial<ImageGenerateParams>;
  const modelId = (p.model ?? "doubao-seedream-5-0-lite") as ImageModelId;
  const model = findModel(modelId);

  function onModelChange(newId: ImageModelId) {
    const fixed = coerceParamsForModel(newId, {
      size: p.size,
      resolution: p.resolution,
    });
    setParams({
      ...p,
      model: fixed.model,
      size: fixed.size,
      resolution: fixed.resolution,
    });
  }

  return (
    <>
      <Field label="Model">
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value as ImageModelId)}
          className="select"
        >
          {IMAGE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.vendor}
              {m.hint ? ` (${m.hint})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <DualPromptField
        kind="image"
        prompt={p.prompt ?? ""}
        enhancedPrompt={p.enhancedPrompt ?? ""}
        onPromptChange={(v) => setParams({ ...p, prompt: v })}
        onEnhancedChange={(v) => setParams({ ...p, enhancedPrompt: v })}
      />
      <div className={`grid gap-2 ${model.resolutions ? "grid-cols-2" : "grid-cols-1"}`}>
        <Field label="Aspect">
          <select
            value={p.size ?? model.aspectRatios[0]}
            onChange={(e) => setParams({ ...p, size: e.target.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
          >
            {model.aspectRatios.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        {model.resolutions && (
          <Field label="Resolution">
            <select
              value={p.resolution ?? model.resolutions[0]}
              onChange={(e) => setParams({ ...p, resolution: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
            >
              {model.resolutions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </>
  );
}

function VideoForm({
  params,
  setParams,
}: {
  params: Record<string, unknown>;
  setParams: (p: Record<string, unknown>) => void;
}) {
  const p = params as Partial<VideoGenerateParams>;
  const modelId = (p.model ?? "doubao-seedance-1-5-pro") as VideoModelId;
  const model = findVideoModel(modelId);

  function onModelChange(newId: VideoModelId) {
    const fixed = coerceVideoParamsForModel(newId, {
      aspectRatio: p.aspectRatio,
      resolution: p.resolution,
      duration: p.duration,
    });
    setParams({
      ...p,
      model: fixed.model,
      aspectRatio: fixed.aspectRatio,
      resolution: fixed.resolution,
      duration: fixed.duration,
    });
  }

  return (
    <>
      <Field label="Model">
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value as VideoModelId)}
          className="select"
        >
          {VIDEO_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.vendor}
              {m.hint ? ` (${m.hint})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <DualPromptField
        kind="video"
        prompt={p.prompt ?? ""}
        enhancedPrompt={p.enhancedPrompt ?? ""}
        onPromptChange={(v) => setParams({ ...p, prompt: v })}
        onEnhancedChange={(v) => setParams({ ...p, enhancedPrompt: v })}
      />
      <div className="grid grid-cols-3 gap-2">
        {model.aspectRatios && (
          <Field label="Aspect">
            <select
              value={p.aspectRatio ?? model.aspectRatios[0]}
              onChange={(e) => setParams({ ...p, aspectRatio: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
            >
              {model.aspectRatios.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        )}
        {model.resolutions && (
          <Field label="Resolution">
            <select
              value={p.resolution ?? model.resolutions[0]}
              onChange={(e) => setParams({ ...p, resolution: e.target.value })}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
            >
              {model.resolutions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Duration">
          <select
            value={p.duration ?? model.defaultDuration}
            onChange={(e) =>
              setParams({ ...p, duration: parseInt(e.target.value, 10) })
            }
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
          >
            {model.durations.map((dur) => (
              <option key={dur} value={dur}>
                {dur}s
              </option>
            ))}
          </select>
        </Field>
      </div>
      {model.supportsAudio && (
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={p.audio ?? false}
            onChange={(e) => setParams({ ...p, audio: e.target.checked })}
          />
          Generate audio
        </label>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-neutral-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function DualPromptField({
  kind,
  prompt,
  enhancedPrompt,
  onPromptChange,
  onEnhancedChange,
}: {
  kind: "image" | "video";
  prompt: string;
  enhancedPrompt: string;
  onPromptChange: (v: string) => void;
  onEnhancedChange: (v: string) => void;
}) {
  return (
    <>
      <label className="block">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-neutral-400">
            Prompt (idea)
          </span>
          <EnhancePromptButton
            idea={prompt}
            kind={kind}
            onResult={onEnhancedChange}
          />
        </div>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={2}
          placeholder="describe in any language…"
          className="mt-1 w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
        />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase text-neutral-400">
          Enhanced prompt {enhancedPrompt ? "(used)" : "(optional)"}
        </span>
        <textarea
          value={enhancedPrompt}
          onChange={(e) => onEnhancedChange(e.target.value)}
          rows={4}
          placeholder="click ✨ Enhance to fill, or leave empty to use plain prompt"
          className="mt-1 w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 p-2 text-xs outline-none focus:border-neutral-500"
        />
      </label>
    </>
  );
}
