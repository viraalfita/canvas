"use client";

import { useState } from "react";
import { useNodeId } from "@xyflow/react";
import { Loader2Icon, CheckIcon, XIcon, CircleIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { duplicateNode } from "@/lib/canvas/actions";
import { rowToFlowNode, useCanvasStore } from "@/lib/canvas/store";
import type { NodeStatus } from "@/lib/canvas/types";
import { flushPendingSaves } from "./canvas-editor";

export function StatusBadge({
  status,
  progress,
}: {
  status: NodeStatus;
  /** 0-100, only shown when status === "running". */
  progress?: number | null;
}) {
  const map: Record<NodeStatus, { color: string; label: string; Icon: React.ElementType }> = {
    idle: { color: "text-neutral-500", label: "idle", Icon: CircleIcon },
    queued: { color: "text-amber-400", label: "queued", Icon: CircleIcon },
    running: { color: "text-blue-400", label: "running", Icon: Loader2Icon },
    success: { color: "text-emerald-400", label: "success", Icon: CheckIcon },
    failed: { color: "text-red-400", label: "failed", Icon: XIcon },
  };
  const { color, label, Icon } = map[status];
  const showPct = status === "running" && typeof progress === "number";
  return (
    <span className={cn("flex items-center gap-1 text-[10px] uppercase", color)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {label}
      {showPct && ` ${Math.round(progress!)}%`}
    </span>
  );
}

/** Duplicate the current node — clones type, params, output and history with
 *  a small positional offset so it lands next to the original. Lives in the
 *  shell so every node type gets it for free. */
function DuplicateNodeButton() {
  const id = useNodeId();
  const setNodes = useCanvasStore((s) => s.setNodes);
  const [busy, setBusy] = useState(false);
  if (!id) return null;
  return (
    <button
      type="button"
      title="Duplicate this node"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
          // Make sure any debounced param edits land before we copy.
          await flushPendingSaves();
          const row = await duplicateNode(id);
          setNodes((curr) => [...curr, rowToFlowNode(row)]);
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
      className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
    >
      <CopyIcon className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Node container. Width/height is controlled by React Flow's wrapper (set via
 * node.style + the NodeResizer component) — `w-full h-full` lets the shell
 * fill whatever size the user has dragged it to. Body becomes scrollable when
 * content exceeds the chosen height.
 */
export function NodeShell({
  title,
  status,
  error,
  progress,
  estimatedTime,
  headerAction,
  children,
  className,
}: {
  title: string;
  status: NodeStatus;
  error?: string | null;
  /** 0-100. When set and status is running, a thin bar appears below the header. */
  progress?: number | null;
  /** seconds. Shown next to the status badge when running. */
  estimatedTime?: number | null;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const showProgressBar =
    status === "running" && typeof progress === "number";
  const pct = showProgressBar
    ? Math.min(100, Math.max(0, progress!))
    : 0;

  return (
    <div
      className={cn(
        // Width comes from React Flow's wrapper (set via node.style). Height is
        // auto so the node grows to fit content as it generates output, history,
        // etc. — user never has to scroll inside the node body.
        "flex w-full flex-col rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-md",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between rounded-t-lg border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-xs font-semibold">{title}</div>
          {status === "running" && typeof estimatedTime === "number" && (
            <span
              className="text-[10px] text-neutral-500"
              title="estimated time from APImart"
            >
              ~{estimatedTime}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} progress={progress} />
          <DuplicateNodeButton />
          {headerAction}
        </div>
      </div>
      {showProgressBar && (
        <div className="h-1 shrink-0 bg-neutral-800">
          <div
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="nowheel space-y-2 p-3">{children}</div>
      {error && (
        <div className="shrink-0 rounded-b-lg border-t border-red-900 bg-red-950/40 px-3 py-1.5 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
