"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import type { NodeOutput } from "@/lib/canvas/types";

/**
 * Click-to-zoom modal that takes over the viewport. Renders via portal at
 * `document.body` so it sits above React Flow regardless of the parent
 * stacking context.
 */
export function MediaLightbox({
  output,
  caption,
  onClose,
}: {
  output: NodeOutput | null;
  caption?: string;
  onClose: () => void;
}) {
  // ESC to close — registered only when a media is shown.
  useEffect(() => {
    if (!output) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [output, onClose]);

  if (!output) return null;
  if (typeof document === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/80 dark:bg-neutral-900/80 p-2 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        title="Close (Esc)"
      >
        <XIcon className="h-5 w-5" />
      </button>
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {output.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={output.url}
            alt={caption ?? "preview"}
            className="max-h-[88vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
          />
        ) : (
          <video
            src={output.url}
            controls
            autoPlay
            className="max-h-[88vh] max-w-[92vw] rounded-md shadow-2xl"
          />
        )}
        {caption && (
          <div className="text-xs text-neutral-600 dark:text-neutral-400" title={caption}>
            {caption}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
