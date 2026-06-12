"use client";

import { useState } from "react";
import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import { UsageBadge } from "./usage-badge";
import { RunNodeButton } from "./run-node-button";
import { DownloadButton } from "./download-button";
import { MediaLightbox } from "./media-lightbox";
import { LazyVideo } from "./lazy-video";
import { NodeResizerShell } from "./node-resizer-shell";
import type { FlowNodeData } from "@/lib/canvas/store";
import type { NodeOutput } from "@/lib/canvas/types";

export function ExportNode({ data, selected }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const [imgError, setImgError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<NodeOutput | null>(null);

  return (
    <>
      <NodeResizerShell selected={selected} minWidth={220} minHeight={140} />
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="h-3! w-3! bg-blue-500!"
      />
      <NodeShell
        title="Export"
        status={d.status}
        error={d.error ?? imgError}
        headerAction={<RunNodeButton nodeId={id} />}
      >
        {d.output?.kind === "image" && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.output.url}
              alt="export preview"
              onLoad={() => setImgError(null)}
              onError={() =>
                setImgError(
                  "Image failed to load. Check Supabase Storage policy for bucket 'outputs'.",
                )
              }
              onClick={() => d.output && setZoom(d.output)}
              className="w-full cursor-zoom-in rounded-md border border-neutral-200 dark:border-neutral-800"
            />
            <DownloadButton output={d.output} prefix="export" />
          </>
        )}
        {d.output?.kind === "video" && (
          <>
            <LazyVideo
              output={d.output}
              onZoom={() => d.output && setZoom(d.output)}
            />
            <DownloadButton output={d.output} prefix="export" />
          </>
        )}
        {!d.output && (
          <p className="text-xs text-neutral-500">
            Connect an image or video output here.
          </p>
        )}
        <UsageBadge usage={d.usage} status={d.status} />
      </NodeShell>
      <MediaLightbox output={zoom} onClose={() => setZoom(null)} />
    </>
  );
}
