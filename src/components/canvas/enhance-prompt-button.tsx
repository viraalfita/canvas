"use client";

import { useState } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";

/**
 * Tiny inline button that converts the short text in the bound prompt field
 * (often Indonesian) into a detailed English prompt optimized for the chosen
 * generation kind. Replaces the field on success.
 */
export function EnhancePromptButton({
  idea,
  kind,
  onResult,
}: {
  idea: string;
  kind: "image" | "video";
  onResult: (prompt: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!idea.trim()) {
      alert("Tulis ide singkatnya dulu di field Prompt, lalu klik Enhance.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/llm/enhance-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, kind }),
      });
      const json = (await res.json()) as { prompt?: string; error?: string };
      if (!res.ok || !json.prompt) {
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      onResult(json.prompt);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Expand short idea into a detailed prompt"
      className="flex items-center gap-1 rounded-md bg-violet-600/80 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-violet-500 disabled:opacity-50"
    >
      {busy ? (
        <Loader2Icon className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <SparklesIcon className="h-2.5 w-2.5" />
      )}
      Enhance
    </button>
  );
}
