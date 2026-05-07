"use client";

import { useEffect, useState } from "react";
import { HistoryIcon, XIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteNodeVersion,
  listNodeVersions,
  revertNodeToVersion,
} from "@/lib/canvas/actions";
import { useCanvasStore } from "@/lib/canvas/store";
import type {
  NodeOutput,
  NodeOutputHistoryRow,
  NodeStatus,
  NodeType,
} from "@/lib/canvas/types";
import { BranchVersionModal } from "./branch-version-modal";

function shortAge(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function OutputHistory({
  nodeId,
  nodeType,
  status,
  currentOutput,
  currentParams,
}: {
  nodeId: string;
  nodeType: NodeType;
  status: NodeStatus;
  currentOutput: NodeOutput | null;
  currentParams: Record<string, unknown>;
}) {
  const [versions, setVersions] = useState<NodeOutputHistoryRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<NodeOutputHistoryRow | null>(null);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);

  // Refetch when nodeId changes or when status transitions (typically after
  // a successful run). Uses a cancellation flag so we only setState after the
  // promise resolves, not synchronously inside the effect body.
  useEffect(() => {
    let cancelled = false;
    listNodeVersions(nodeId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((e) => console.error("listNodeVersions failed", e));
    return () => {
      cancelled = true;
    };
  }, [nodeId, status]);

  if (versions.length === 0) return null;

  async function onRevert(v: NodeOutputHistoryRow, e: React.MouseEvent) {
    e.stopPropagation();
    setBusyId(v.id);
    try {
      await revertNodeToVersion({ nodeId, versionId: v.id });
      patchNodeData(nodeId, {
        status: "success",
        output: v.output,
        usage: v.usage,
        error: null,
      });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(v: NodeOutputHistoryRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this version permanently?")) return;
    setBusyId(v.id);
    try {
      await deleteNodeVersion(v.id);
      setVersions((curr) => curr.filter((x) => x.id !== v.id));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function onEdit(v: NodeOutputHistoryRow, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(v);
  }

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[10px] uppercase text-neutral-500">
          <HistoryIcon className="h-3 w-3" />
          Versions ({versions.length})
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {versions.map((v) => {
            const isCurrent = currentOutput?.url === v.output.url;
            const thumb =
              v.output.kind === "video" ? v.output.thumbnailUrl : v.output.url;
            return (
              <div
                key={v.id}
                className={cn(
                  "relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border bg-neutral-950",
                  isCurrent
                    ? "border-emerald-500"
                    : "border-neutral-700 hover:border-neutral-500",
                  busyId === v.id && "opacity-50",
                )}
                title={`${shortAge(v.created_at)}${
                  v.usage?.model ? ` · ${v.usage.model}` : ""
                }${
                  typeof v.usage?.actualTime === "number"
                    ? ` · ${v.usage.actualTime.toFixed(1)}s`
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => onRevert(v, e)}
                  disabled={isCurrent || busyId === v.id}
                  className="block h-full w-full"
                  title="Click to revert to this version"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt="version"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] text-neutral-500">
                      {v.output.kind}
                    </div>
                  )}
                </button>
                {/* Always-visible action buttons in the top-right corner */}
                <div className="absolute right-0.5 top-0.5 flex gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => onEdit(v, e)}
                    disabled={busyId === v.id}
                    title="Edit & regenerate from this version"
                    className="rounded bg-black/70 p-1 text-neutral-200 backdrop-blur-sm hover:bg-emerald-600 hover:text-white"
                  >
                    <PencilIcon className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => onDelete(v, e)}
                    disabled={busyId === v.id}
                    title="Delete this version"
                    className="rounded bg-black/70 p-1 text-neutral-200 backdrop-blur-sm hover:bg-red-600 hover:text-white"
                  >
                    {busyId === v.id ? (
                      <Loader2Icon className="h-3 w-3 animate-spin" />
                    ) : (
                      <XIcon className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <BranchVersionModal
          key={editing.id}
          open={!!editing}
          onClose={() => setEditing(null)}
          nodeId={nodeId}
          nodeType={nodeType}
          sourceVersion={editing}
          defaultParams={currentParams}
        />
      )}
    </>
  );
}
