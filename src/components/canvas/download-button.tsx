"use client";

import { useState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import type { NodeOutput } from "@/lib/canvas/types";

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  return "bin";
}

/**
 * Force a real file download even when the file lives on a different origin
 * (Supabase Storage), where the bare `<a download>` attribute would otherwise
 * just navigate to the URL. We fetch the bytes, build an object URL, and
 * trigger a click programmatically.
 */
export function DownloadButton({
  output,
  prefix,
}: {
  output: NodeOutput;
  prefix?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch(output.url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ext = extFromMime(output.mimeType);
      a.href = objectUrl;
      a.download = `${prefix ?? output.kind}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Download failed", err);
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
      className="flex w-full items-center justify-center gap-1 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
    >
      {busy ? (
        <Loader2Icon className="h-3 w-3 animate-spin" />
      ) : (
        <DownloadIcon className="h-3 w-3" />
      )}
      Download
    </button>
  );
}
