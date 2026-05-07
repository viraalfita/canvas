"use client";

import { useState } from "react";
import { PlayIcon } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/store";
import { flushPendingSaves } from "./canvas-editor";

export function RunNodeButton({ nodeId }: { nodeId: string }) {
  const [busy, setBusy] = useState(false);
  const workflowId = useCanvasStore((s) => s.workflowId);
  const startPolling = useCanvasStore((s) => s.startPolling);

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!workflowId) return;
    setBusy(true);
    try {
      // Flush any in-flight debounced param saves so backend reads fresh
      // model/prompt/etc from DB.
      await flushPendingSaves();
      const res = await fetch(
        `/api/workflow/${workflowId}/nodes/${nodeId}/run`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? `Run failed (${res.status})`);
        return;
      }
      // cascade=false → only this node's task is polled; downstream stays idle.
      startPolling(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Run this node"
      className="flex items-center gap-1 rounded-md bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
    >
      <PlayIcon className="h-2.5 w-2.5" />
      run
    </button>
  );
}
