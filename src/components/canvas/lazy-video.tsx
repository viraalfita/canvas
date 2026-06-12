"use client";

import { useEffect, useState } from "react";
import { FilmIcon, PlayIcon } from "lucide-react";
import type { NodeOutput } from "@/lib/canvas/types";

/**
 * Cache of generated first-frame posters, keyed by video URL. Survives node
 * remounts (React Flow unmounts off-screen nodes with onlyRenderVisibleElements)
 * so each video's frame is only captured once per session.
 */
const posterCache = new Map<string, string>();

/**
 * Lazily capture the first frame of a video as a small JPEG data URL, to use as
 * a poster when the provider didn't return a `thumbnailUrl`. Runs entirely
 * client-side via a throwaway <video>+<canvas>; only kicks in for videos that
 * are actually mounted (i.e. visible), and caches the result. Falls back to
 * `undefined` (→ film icon) if the frame can't be read (e.g. CORS-tainted).
 */
function useFirstFramePoster(url: string, explicit?: string): string | undefined {
  const [poster, setPoster] = useState<string | undefined>(
    explicit ?? posterCache.get(url),
  );

  useEffect(() => {
    if (explicit || poster) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    video.src = url;

    const cleanup = () => {
      video.removeEventListener("seeked", capture);
      video.removeEventListener("loadeddata", seek);
      video.removeAttribute("src");
      video.load();
    };
    const seek = () => {
      // Nudge past 0 to avoid an all-black opening frame.
      try {
        video.currentTime = Math.min(0.1, video.duration || 0.1);
      } catch {
        capture();
      }
    };
    const capture = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return cleanup();
        // Downscale to keep the data URL small (max width 320).
        const scale = Math.min(1, 320 / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return cleanup();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.6);
        posterCache.set(url, data);
        if (!cancelled) setPoster(data);
      } catch {
        // Tainted canvas / decode error — leave poster undefined.
      } finally {
        cleanup();
      }
    };

    video.addEventListener("loadeddata", seek);
    video.addEventListener("seeked", capture);
    video.load();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [url, explicit, poster]);

  return poster;
}

/**
 * Lazily-mounted video preview. Until the user hits play it renders only a
 * lightweight poster (thumbnail image or a film-icon placeholder), so dozens of
 * video nodes don't each keep a live <video> GPU layer that has to be
 * transformed on every canvas pan/zoom — the main cause of jank on low-spec
 * machines. Clicking the poster opens the zoom lightbox; the play button mounts
 * the real <video> inline on demand.
 */
export function LazyVideo({
  output,
  onZoom,
  onError,
  onLoadedData,
  className = "",
}: {
  output: Extract<NodeOutput, { kind: "video" }>;
  onZoom?: () => void;
  onError?: () => void;
  onLoadedData?: () => void;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const poster = useFirstFramePoster(output.url, output.thumbnailUrl);

  if (playing) {
    return (
      <video
        src={output.url}
        controls
        autoPlay
        onError={onError}
        onLoadedData={onLoadedData}
        className={`w-full rounded-md border border-neutral-200 dark:border-neutral-800 ${className}`}
      />
    );
  }

  return (
    <div
      onClick={onZoom}
      className={`relative flex aspect-video w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt="video preview"
          className="h-full w-full object-cover"
        />
      ) : (
        <FilmIcon className="h-6 w-6 text-neutral-400" />
      )}
      <button
        type="button"
        title="Play"
        onClick={(e) => {
          e.stopPropagation();
          setPlaying(true);
        }}
        className="absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
      >
        <PlayIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
