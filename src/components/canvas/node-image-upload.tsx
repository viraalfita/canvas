"use client";

import { useRef, useState } from "react";
import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { UploadIcon, XIcon } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { FlowNodeData } from "@/lib/canvas/store";
import { useCanvasStore } from "@/lib/canvas/store";
import { createClient } from "@/lib/supabase/client";
import { setNodeOutput } from "@/lib/canvas/actions";
import type { ImageUploadParams } from "@/lib/canvas/types";

export function ImageUploadNode({ data }: NodeProps) {
  const id = useNodeId() ?? "";
  const d = data as FlowNodeData;
  const params = d.params as ImageUploadParams;
  const workflowId = useCanvasStore((s) => s.workflowId);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onFile(file: File) {
    if (!workflowId) return;
    if (!file.type.startsWith("image/")) {
      setLocalError("Pick an image file");
      return;
    }
    setBusy(true);
    setLocalError(null);
    patchNodeData(id, { status: "running", error: null });
    try {
      const supabase = createClient();
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userRes.user.id}/${workflowId}/upload-${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("outputs")
        .upload(path, file, {
          contentType: file.type,
          upsert: true,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("outputs").getPublicUrl(path);
      const output = {
        kind: "image" as const,
        url: pub.publicUrl,
        mimeType: file.type,
      };
      await setNodeOutput({
        id,
        output,
        status: "success",
        params: { ...params, filename: file.name } satisfies ImageUploadParams,
      });
      patchNodeData(id, {
        status: "success",
        output,
        params: { ...params, filename: file.name },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalError(msg);
      patchNodeData(id, { status: "failed", error: msg });
    } finally {
      setBusy(false);
    }
  }

  async function clearUpload() {
    patchNodeData(id, { status: "idle", output: null });
    await setNodeOutput({ id, output: null, status: "idle" }).catch(() => {});
  }

  return (
    <>
      <NodeShell
        title="Image Upload"
        status={d.status}
        error={d.error ?? localError}
      >
        {d.output?.kind === "image" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.output.url}
              alt={params.filename ?? "upload"}
              className="w-full rounded-md border border-neutral-800"
            />
            <div className="flex items-center justify-between text-[10px] text-neutral-500">
              <span className="truncate" title={params.filename}>
                {params.filename ?? "uploaded"}
              </span>
              <button
                onClick={clearUpload}
                className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200"
              >
                <XIcon className="h-3 w-3" />
                clear
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-neutral-700 bg-neutral-950/40 py-6 text-xs text-neutral-400 hover:border-neutral-500 disabled:opacity-50"
          >
            <UploadIcon className="h-4 w-4" />
            {busy ? "uploading…" : "Click to upload image"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="image_output"
        className="!h-3 !w-3 !bg-emerald-500"
      />
    </>
  );
}
