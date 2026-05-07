"use client";

import { useState } from "react";
import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import { UsageBadge } from "./usage-badge";
import { RunNodeButton } from "./run-node-button";
import { DownloadButton } from "./download-button";
import type { FlowNodeData } from "@/lib/canvas/store";

export function ExportNode({ data }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const [imgError, setImgError] = useState<string | null>(null);

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!h-3 !w-3 !bg-blue-500"
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
              className="w-full rounded-md border border-neutral-800"
            />
            <DownloadButton output={d.output} prefix="export" />
          </>
        )}
        {d.output?.kind === "video" && (
          <>
            <video
              src={d.output.url}
              controls
              className="w-full rounded-md border border-neutral-800"
            />
            <DownloadButton output={d.output} prefix="export" />
          </>
        )}
        {!d.output && (
          <p className="text-xs text-neutral-500">
            Connect an image or video output here.
          </p>
        )}
        <UsageBadge usage={d.usage} />
      </NodeShell>
    </>
  );
}
